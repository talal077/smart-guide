"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock,
  Filter,
  Loader2,
  LogIn,
  LogOut,
  XCircle,
} from "lucide-react";
import { type AppUser, getCurrentUser } from "@/lib/auth";
import {
  type NotificationFilters,
  type NotificationRecord,
  createNotification,
  getMyNotificationsPage,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";
import { getNotificationPollingMs } from "@/lib/notificationSettings";
import { writeAuditLog } from "@/lib/auditLog";
import {
  type StudentActionRecord,
  type StudentActionType,
  completeStudentAction,
  getStudentActions,
  postponeStudentAction,
} from "@/lib/studentActions";

const TYPE_LABELS: Record<StudentActionType, string> = {
  summon: "استدعاء",
  permission: "استئذان",
  entry: "دخول",
};

const TYPE_CONFIG: Record<StudentActionType, { icon: typeof AlertTriangle; color: string }> = {
  summon: { icon: AlertTriangle, color: "#dc2626" },
  permission: { icon: LogOut, color: "#2563eb" },
  entry: { icon: LogIn, color: "#16a34a" },
};

const STATUS_LABELS: Record<string, string> = {
  completed: "تم التنفيذ",
  postponed: "مؤجل",
  cancelled: "ملغى",
};

const PAGE_SIZE = 10;

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "الآن";
  if (diffMin < 60) return `منذ ${diffMin} دقيقة`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `منذ ${diffHour} ساعة`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `منذ ${diffDay} يوم`;
  return date.toLocaleDateString("ar-EG");
}

const emptyFilters: NotificationFilters = {};

export default function NotificationsPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<NotificationFilters>(emptyFilters);
  const [unreadCount, setUnreadCount] = useState(0);
  const [myActions, setMyActions] = useState<Record<string, StudentActionRecord>>({});
  const [loading, setLoading] = useState(true);
  const [markingAll, setMarkingAll] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [postponeTarget, setPostponeTarget] = useState<string | null>(null);
  const [postponeValue, setPostponeValue] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  const postponeOpenRef = useRef(false);
  useEffect(() => {
    postponeOpenRef.current = postponeTarget !== null;
  }, [postponeTarget]);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((user) => {
        if (cancelled) return;
        if (!user) {
          router.replace("/login");
          return;
        }
        setCurrentUser(user);
      })
      .finally(() => {
        if (!cancelled) setCheckingAccess(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  const loadData = useCallback(
    async (user: AppUser, silent = false) => {
      if (!silent) setLoading(true);
      try {
        const [{ rows, total: nextTotal }, nextUnread] = await Promise.all([
          getMyNotificationsPage(filters, page, PAGE_SIZE),
          getUnreadNotificationCount(),
        ]);
        setNotifications(rows);
        setTotal(nextTotal);
        setUnreadCount(nextUnread);

        if (user.role === "teacher") {
          const actions = await getStudentActions({ teacherId: user.id });
          const map: Record<string, StudentActionRecord> = {};
          for (const action of actions) map[action.id] = action;
          setMyActions(map);
        }
      } catch (err) {
        if (!silent) setMessage({ kind: "error", text: getErrorMessage(err) });
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [filters, page]
  );

  useEffect(() => {
    if (currentUser) void loadData(currentUser);
  }, [currentUser, loadData]);

  // Any filter change invalidates the current page number.
  useEffect(() => {
    setPage(1);
  }, [filters]);

  // Realtime isn't available for public.notifications on this project (verified
  // live: subscriptions connect but the table isn't in the supabase_realtime
  // publication, so no postgres_changes event ever arrives). A light poll is the
  // safe fallback for "a new notification arrived while the page is open" — it is
  // skipped while a postpone date picker is open so it can't clobber unsaved input.
  useEffect(() => {
    if (!currentUser) return;
    let interval: ReturnType<typeof setInterval> | null = null;
    let cancelled = false;

    getNotificationPollingMs().then((ms) => {
      if (cancelled) return;
      interval = setInterval(() => {
        if (postponeOpenRef.current) return;
        void loadData(currentUser, true);
      }, ms);
    });

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
    };
  }, [currentUser, loadData]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function openNotification(notification: NotificationRecord) {
    setExpandedId((prev) => (prev === notification.id ? null : notification.id));
    if (!notification.isRead) {
      setNotifications((prev) => prev.map((n) => (n.id === notification.id ? { ...n, isRead: true } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
      try {
        await markNotificationRead(notification.id);
      } catch {
        // best-effort — local optimistic state already reflects "read"; a stale
        // unread flag server-side isn't user-visible and will self-correct on
        // the next full reload.
      }
    }
  }

  async function handleMarkAllRead() {
    if (markingAll || unreadCount === 0) return;
    setMarkingAll(true);
    setMessage(null);
    try {
      await markAllNotificationsRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
      setMessage({ kind: "success", text: "تم تعليم جميع الإشعارات كمقروءة." });
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleComplete(notification: NotificationRecord) {
    if (!currentUser || busyId) return;
    const actionId = notification.studentActionId;
    if (!actionId) return;

    setBusyId(notification.id);
    setMessage(null);
    try {
      const updated = await completeStudentAction(actionId, currentUser.id);
      if (!updated) {
        setMessage({ kind: "error", text: "تم التعامل مع هذا الطلب مسبقًا." });
        await loadData(currentUser);
        return;
      }

      await markNotificationRead(notification.id);

      await createNotification({
        title: `تم تنفيذ طلب ${TYPE_LABELS[updated.type]} - ${updated.studentName}`,
        body: `تم تنفيذ طلب ${TYPE_LABELS[updated.type]} للطالب ${updated.studentName} بواسطة ${currentUser.full_name} في ${new Date(updated.completedAt!).toLocaleString("ar-EG")}.`,
        userId: updated.requestedBy,
        type: "action_result",
        studentActionId: updated.id,
        metadata: {
          studentName: updated.studentName,
          grade: updated.grade,
          section: updated.section,
          type: updated.type,
          status: "completed",
          teacherName: currentUser.full_name,
          completedAt: updated.completedAt,
        },
      });

      await writeAuditLog({
        actorId: currentUser.id,
        actorName: currentUser.full_name,
        actorRole: currentUser.role,
        action: "تنفيذ إجراء طالب",
        details: `${TYPE_LABELS[updated.type]} - ${updated.studentName}`,
        studentId: updated.studentId,
        studentActionId: updated.id,
        newValues: { status: "completed", completed_by: currentUser.id },
      });

      setMessage({ kind: "success", text: "تم تنفيذ الطلب بنجاح." });
      await loadData(currentUser);
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  }

  async function handlePostpone(notification: NotificationRecord) {
    if (!currentUser || busyId) return;
    const actionId = notification.studentActionId;
    if (!actionId || !postponeValue) return;

    setBusyId(notification.id);
    setMessage(null);
    try {
      const postponedUntilIso = new Date(postponeValue).toISOString();
      const updated = await postponeStudentAction(actionId, currentUser.id, postponedUntilIso);
      if (!updated) {
        setMessage({ kind: "error", text: "تم التعامل مع هذا الطلب مسبقًا." });
        await loadData(currentUser);
        return;
      }

      await markNotificationRead(notification.id);

      await createNotification({
        title: `تأجيل طلب ${TYPE_LABELS[updated.type]} - ${updated.studentName}`,
        body: `تم تأجيل طلب ${TYPE_LABELS[updated.type]} للطالب ${updated.studentName} بواسطة ${currentUser.full_name} إلى ${new Date(postponedUntilIso).toLocaleString("ar-EG")}.`,
        userId: updated.requestedBy,
        type: "action_result",
        studentActionId: updated.id,
        metadata: {
          studentName: updated.studentName,
          grade: updated.grade,
          section: updated.section,
          type: updated.type,
          status: "postponed",
          teacherName: currentUser.full_name,
          postponedUntil: updated.postponedUntil,
        },
      });

      await writeAuditLog({
        actorId: currentUser.id,
        actorName: currentUser.full_name,
        actorRole: currentUser.role,
        action: "تأجيل إجراء طالب",
        details: `${TYPE_LABELS[updated.type]} - ${updated.studentName}`,
        studentId: updated.studentId,
        studentActionId: updated.id,
        newValues: { status: "postponed", postponed_until: updated.postponedUntil },
      });

      setMessage({ kind: "success", text: "تم تأجيل الطلب بنجاح." });
      setPostponeTarget(null);
      setPostponeValue("");
      await loadData(currentUser);
    } catch (err) {
      setMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setBusyId(null);
    }
  }

  const typeFilterOptions = useMemo(
    () => [
      { value: "", label: "كل الأنواع" },
      { value: "summon", label: "استدعاء" },
      { value: "permission", label: "استئذان" },
      { value: "entry", label: "دخول" },
      { value: "action_result", label: "نتيجة إجراء" },
      { value: "action_cancelled", label: "إلغاء إجراء" },
    ],
    []
  );

  if (checkingAccess) {
    return (
      <div className="space-y-3 p-4" dir="rtl">
        <div className="h-20 animate-pulse rounded-3xl bg-slate-200" />
        <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />
      </div>
    );
  }

  if (!currentUser) return null;

  return (
    <div className="space-y-4 p-4 pb-10" dir="rtl">
      <header className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-sm font-bold text-blue-700">
              <Bell size={16} /> الإشعارات
            </p>
            <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">إشعاراتي</h1>
          </div>
          <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600">
            {unreadCount} غير مقروء
          </span>
        </div>
      </header>

      {message ? (
        <div className={`rounded-2xl p-3 text-sm font-bold ${message.kind === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
          {message.text}
        </div>
      ) : null}

      <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Filter size={15} /> فلاتر
          </h2>
          <button
            type="button"
            onClick={handleMarkAllRead}
            disabled={markingAll || unreadCount === 0}
            className="flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-40"
          >
            {markingAll ? <Loader2 size={13} className="animate-spin" /> : <CheckCheck size={13} />} تعليم الكل كمقروء
          </button>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <select
            value={filters.type ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, type: event.target.value || undefined }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          >
            {typeFilterOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            value={filters.status ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: (event.target.value || undefined) as NotificationFilters["status"] }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          >
            <option value="">كل الحالات</option>
            <option value="unread">غير مقروء</option>
            <option value="read">مقروء</option>
          </select>

          <input
            type="date"
            value={filters.date ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, date: event.target.value || undefined }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          />

          <input
            placeholder="بحث في العنوان أو النص"
            value={filters.search ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value || undefined }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          />
        </div>

        {Object.keys(filters).length > 0 ? (
          <button
            type="button"
            onClick={() => setFilters(emptyFilters)}
            className="mt-2 w-full rounded-xl bg-slate-100 p-2 text-xs font-bold text-slate-600"
          >
            إعادة تعيين الفلاتر
          </button>
        ) : null}
      </section>

      {loading ? (
        <>
          <div className="h-32 animate-pulse rounded-3xl bg-slate-100" />
          <div className="h-32 animate-pulse rounded-3xl bg-slate-100" />
        </>
      ) : notifications.length === 0 ? (
        <p className="rounded-3xl bg-white p-8 text-center text-sm text-slate-500 shadow-sm border border-slate-100">
          لا توجد إشعارات مطابقة.
        </p>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => (
            <NotificationCard
              key={notification.id}
              notification={notification}
              currentUser={currentUser}
              linkedAction={notification.studentActionId ? myActions[notification.studentActionId] : undefined}
              expanded={expandedId === notification.id}
              busy={busyId === notification.id}
              postponeOpen={postponeTarget === notification.id}
              postponeValue={postponeValue}
              onOpen={() => openNotification(notification)}
              onSetPostponeValue={setPostponeValue}
              onStartPostpone={() => setPostponeTarget(notification.id)}
              onCancelPostpone={() => setPostponeTarget(null)}
              onComplete={() => handleComplete(notification)}
              onConfirmPostpone={() => handlePostpone(notification)}
            />
          ))}
        </div>
      )}

      {total > 0 ? (
        <div className="flex items-center justify-between gap-2 rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={loading || page <= 1}
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-40"
          >
            السابق
          </button>
          <span className="text-xs font-bold text-slate-500">
            صفحة {page} من {totalPages}
          </span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={loading || page >= totalPages}
            className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-40"
          >
            التالي
          </button>
        </div>
      ) : null}
    </div>
  );
}

function NotificationCard({
  notification,
  currentUser,
  linkedAction,
  expanded,
  busy,
  postponeOpen,
  postponeValue,
  onOpen,
  onSetPostponeValue,
  onStartPostpone,
  onCancelPostpone,
  onComplete,
  onConfirmPostpone,
}: {
  notification: NotificationRecord;
  currentUser: AppUser;
  linkedAction: StudentActionRecord | undefined;
  expanded: boolean;
  busy: boolean;
  postponeOpen: boolean;
  postponeValue: string;
  onOpen: () => void;
  onSetPostponeValue: (value: string) => void;
  onStartPostpone: () => void;
  onCancelPostpone: () => void;
  onComplete: () => void;
  onConfirmPostpone: () => void;
}) {
  const meta = (notification.metadata ?? {}) as Record<string, string>;
  const isActionRequest = notification.type === "summon" || notification.type === "permission" || notification.type === "entry";
  const isResult = notification.type === "action_result";
  const isCancelled = notification.type === "action_cancelled";

  let accentColor = "#7c3aed"; // system/other — purple
  let Icon = Bell;
  if (isActionRequest) {
    const config = TYPE_CONFIG[notification.type as StudentActionType];
    accentColor = config.color;
    Icon = config.icon;
  } else if (isResult) {
    accentColor = meta.status === "completed" ? "#16a34a" : "#f97316";
    Icon = meta.status === "completed" ? CheckCircle2 : Clock;
  } else if (isCancelled) {
    accentColor = "#475569";
    Icon = XCircle;
  }

  const stillPending = currentUser.role !== "teacher" || !linkedAction || linkedAction.status === "pending";
  const showTeacherButtons = isActionRequest && currentUser.role === "teacher";

  return (
    <article
      className={`rounded-3xl border p-4 shadow-sm transition ${
        notification.isRead ? "border-slate-100 bg-white" : "border-blue-200 bg-blue-50/40"
      }`}
    >
      <button type="button" onClick={onOpen} className="flex w-full items-start justify-between gap-2 text-right">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white" style={{ background: accentColor }}>
            <Icon size={20} />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: accentColor }}>
                {isActionRequest ? TYPE_LABELS[notification.type as StudentActionType] : notification.title}
              </span>
              {!notification.isRead ? <span className="h-2 w-2 rounded-full bg-blue-600" aria-label="غير مقروء" /> : null}
            </div>
            {meta.studentName ? <h3 className="mt-2 text-base font-bold text-slate-900">{meta.studentName}</h3> : null}
            {meta.grade || meta.section ? (
              <p className="text-xs text-slate-500">
                {meta.grade} {meta.section ? `- ${meta.section}` : ""} {meta.lesson ? `· ${meta.lesson}` : ""}
              </p>
            ) : null}
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-slate-400">
          <Clock size={12} /> {formatRelativeTime(notification.createdAt)}
        </span>
      </button>

      <div className="mt-3 space-y-1 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
        {!isActionRequest && !isResult && !isCancelled ? <p>{notification.body}</p> : null}
        {meta.reason ? (
          <p>
            <b>السبب:</b> {meta.reason}
          </p>
        ) : null}
        {meta.actionDate ? (
          <p>
            <b>التاريخ:</b> {meta.actionDate} {meta.actionTime ? `- ${meta.actionTime}` : ""}
          </p>
        ) : null}
        {meta.requesterName ? (
          <p>
            <b>مقدم الطلب:</b> {meta.requesterName}
          </p>
        ) : null}
        {meta.teacherName ? (
          <p>
            <b>المعلم:</b> {meta.teacherName}
          </p>
        ) : null}
        {(isResult || isCancelled) && meta.status ? (
          <p>
            <b>حالة الإجراء:</b> {STATUS_LABELS[meta.status] ?? meta.status}
          </p>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-2 space-y-1 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
          {meta.notes ? (
            <p>
              <b>ملاحظات:</b> {meta.notes}
            </p>
          ) : null}
          <p className="text-slate-400">وقت الإشعار الكامل: {new Date(notification.createdAt).toLocaleString("ar-EG")}</p>
          {(isResult || isCancelled) && ["principal", "admin", "vice_principal"].includes(currentUser.role) ? (
            <Link href="/student-actions" className="mt-1 inline-block font-bold text-blue-700 underline">
              عرض في إجراءات الطالب
            </Link>
          ) : null}
        </div>
      ) : null}

      {showTeacherButtons ? (
        stillPending ? (
          postponeOpen ? (
            <div className="mt-3 space-y-2">
              <label className="block text-xs font-bold text-slate-600">أجّل الطلب إلى:</label>
              <input
                type="datetime-local"
                value={postponeValue}
                onChange={(event) => onSetPostponeValue(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!postponeValue || busy}
                  onClick={onConfirmPostpone}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-orange-500 px-3 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : null} تأكيد التأجيل
                </button>
                <button
                  type="button"
                  onClick={onCancelPostpone}
                  className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-bold text-slate-600"
                >
                  رجوع
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={onComplete}
                className="flex items-center justify-center gap-2 rounded-xl bg-green-600 px-3 py-3 text-sm font-black text-white disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} تم التنفيذ
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onStartPostpone}
                className="flex items-center justify-center gap-2 rounded-xl bg-orange-100 px-3 py-3 text-sm font-black text-orange-700 disabled:opacity-50"
              >
                <Clock size={16} /> تأجيل
              </button>
            </div>
          )
        ) : (
          <p className="mt-3 rounded-xl bg-slate-100 p-2.5 text-center text-xs font-bold text-slate-500">
            تمت معالجة هذا الطلب بالفعل ({linkedAction ? STATUS_LABELS[linkedAction.status] ?? linkedAction.status : ""})
          </p>
        )
      ) : null}
    </article>
  );
}
