"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Filter,
  Loader2,
  LogIn,
  LogOut,
  Pencil,
  RotateCcw,
  Search,
  User,
  X,
  XCircle,
} from "lucide-react";
import { type AppUser, getCurrentUser } from "@/lib/auth";
import { type StudentSearchResult, searchStudents } from "@/lib/students";
import { type AttendanceSummary, getStudentAttendanceSummary } from "@/lib/attendance";
import { findTeacherForClass, listActiveTeachers, type TeacherLookupResult } from "@/lib/teacherLookup";
import { createNotification } from "@/lib/notifications";
import { areStudentActionAlertsEnabled } from "@/lib/notificationSettings";
import { writeAuditLog } from "@/lib/auditLog";
import {
  type CreateStudentActionInput,
  type StudentActionFilters,
  type StudentActionRecord,
  type StudentActionStatus,
  type StudentActionType,
  cancelStudentAction,
  createStudentAction,
  getStudentActionsPage,
  hasPendingDuplicate,
  resendStudentAction,
  updateStudentAction,
} from "@/lib/studentActions";

const ALLOWED_ROLES = ["principal", "admin", "vice_principal"];

const ACTION_TYPES: {
  type: StudentActionType;
  label: string;
  icon: typeof AlertTriangle;
  color: string;
  bg: string;
  ring: string;
}[] = [
  { type: "summon", label: "استدعاء طالب", icon: AlertTriangle, color: "#dc2626", bg: "bg-red-600", ring: "ring-red-600" },
  { type: "permission", label: "استئذان طالب", icon: LogOut, color: "#2563eb", bg: "bg-blue-600", ring: "ring-blue-600" },
  { type: "entry", label: "دخول طالب", icon: LogIn, color: "#16a34a", bg: "bg-green-600", ring: "ring-green-600" },
];

const TYPE_LABELS: Record<StudentActionType, string> = {
  summon: "استدعاء",
  permission: "استئذان",
  entry: "دخول",
};

const STATUS_LABELS: Record<StudentActionStatus, string> = {
  pending: "قيد الانتظار",
  completed: "تم التنفيذ",
  postponed: "مؤجل",
  cancelled: "ملغى",
};

const STATUS_CLASSES: Record<StudentActionStatus, string> = {
  pending: "bg-amber-100 text-amber-700",
  completed: "bg-green-100 text-green-700",
  postponed: "bg-orange-100 text-orange-700",
  cancelled: "bg-slate-200 text-slate-600",
};

const LESSON_OPTIONS = [
  { number: 1, name: "الحصة الأولى" },
  { number: 2, name: "الحصة الثانية" },
  { number: 3, name: "الحصة الثالثة" },
  { number: 4, name: "الحصة الرابعة" },
  { number: 5, name: "الحصة الخامسة" },
  { number: 6, name: "الحصة السادسة" },
  { number: 7, name: "الحصة السابعة" },
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function nowTime() {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
}

const emptyFilters: StudentActionFilters = {};
const PAGE_SIZE = 10;

export default function StudentActionsPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      try {
        const user = await getCurrentUser();
        if (cancelled) return;

        if (!user) {
          router.replace("/login");
          return;
        }

        if (!ALLOWED_ROLES.includes(user.role)) {
          router.replace("/dashboard");
          return;
        }

        setCurrentUser(user);
        setAuthorized(true);
      } catch (err) {
        if (!cancelled) setAccessError(getErrorMessage(err));
      } finally {
        if (!cancelled) setCheckingAccess(false);
      }
    }

    void checkAccess();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // ---- student search ----
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<StudentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const runSearch = useCallback(async (query: string) => {
    setSearching(true);
    try {
      const results = await searchStudents(query, 20);
      setSearchResults(results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
      setHasSearched(true);
    }
  }, []);

  useEffect(() => {
    if (!authorized) return;
    const timer = setTimeout(() => {
      void runSearch(searchQuery);
    }, 350);
    return () => clearTimeout(timer);
  }, [authorized, searchQuery, runSearch]);

  // ---- selected student ----
  const [selectedStudent, setSelectedStudent] = useState<StudentSearchResult | null>(null);
  const [attendanceSummary, setAttendanceSummary] = useState<AttendanceSummary | null>(null);

  useEffect(() => {
    if (!selectedStudent) {
      setAttendanceSummary(null);
      return;
    }
    let cancelled = false;
    getStudentAttendanceSummary(selectedStudent.id)
      .then((summary) => {
        if (!cancelled) setAttendanceSummary(summary);
      })
      .catch(() => {
        if (!cancelled) setAttendanceSummary(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStudent]);

  // ---- action type + form ----
  const [selectedType, setSelectedType] = useState<StudentActionType | null>(null);
  const [reason, setReason] = useState("");
  const [actionDate, setActionDate] = useState(todayIso());
  const [actionTime, setActionTime] = useState(nowTime());
  const [lessonNumber, setLessonNumber] = useState<number | "">("");
  const [notes, setNotes] = useState("");

  const [teacherLookup, setTeacherLookup] = useState<TeacherLookupResult | null>(null);
  const [teacherLoading, setTeacherLoading] = useState(false);
  const [selectedTeacherId, setSelectedTeacherId] = useState("");
  // While editing a pending action there is no selectedStudent (only selectedStudent
  // drives new-request creation), so the lookup effect needs its own grade/section
  // source during edits — otherwise it treats "no selectedStudent" as "no context"
  // and wipes the previously-assigned teacher on every edit.
  const [editContext, setEditContext] = useState<{ grade: string; section: string } | null>(null);

  const lookupGrade = selectedStudent?.grade ?? editContext?.grade ?? null;
  const lookupSection = selectedStudent?.section ?? editContext?.section ?? null;

  useEffect(() => {
    if (!lookupGrade || !lookupSection || !lessonNumber || !actionDate) {
      setTeacherLookup(null);
      setSelectedTeacherId("");
      return;
    }
    let cancelled = false;
    setTeacherLoading(true);
    findTeacherForClass({
      grade: lookupGrade,
      section: lookupSection,
      date: actionDate,
      lessonNumber: Number(lessonNumber),
    })
      .then((result) => {
        if (cancelled) return;
        setTeacherLookup(result);
        setSelectedTeacherId(result.autoTeacher?.id ?? "");
      })
      .catch(() => {
        if (!cancelled) setTeacherLookup({ autoTeacher: null, candidates: [], source: "none" });
      })
      .finally(() => {
        if (!cancelled) setTeacherLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [lookupGrade, lookupSection, lessonNumber, actionDate]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  function resetForm() {
    setSelectedType(null);
    setReason("");
    setActionDate(todayIso());
    setActionTime(nowTime());
    setLessonNumber("");
    setNotes("");
    setSelectedTeacherId("");
    setTeacherLookup(null);
    setEditingId(null);
    setEditContext(null);
    setErrors({});
  }

  function validate(): Record<string, string> {
    const next: Record<string, string> = {};
    if (!editingId && !selectedStudent) next.student = "يرجى اختيار الطالب أولاً.";
    if (!selectedType) next.type = "يرجى اختيار نوع الإجراء.";
    if (!reason.trim()) next.reason = "السبب مطلوب.";
    if (!lessonNumber) next.lesson = "يرجى اختيار الحصة.";
    if (!selectedTeacherId) next.teacher = "يرجى تحديد المعلم.";
    if (!actionDate) next.date = "التاريخ مطلوب.";
    if (!actionTime) next.time = "الوقت مطلوب.";
    return next;
  }

  // ---- history / log ----
  const [history, setHistory] = useState<StudentActionRecord[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [filters, setFilters] = useState<StudentActionFilters>(emptyFilters);
  const [teacherOptions, setTeacherOptions] = useState<{ id: string; name: string }[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ kind: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    listActiveTeachers().then((teachers) => {
      if (!cancelled) setTeacherOptions(teachers);
    });
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const { rows, total } = await getStudentActionsPage(filters, historyPage, PAGE_SIZE);
      setHistory(rows);
      setHistoryTotal(total);
    } catch (err) {
      setActionMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setHistoryLoading(false);
    }
  }, [filters, historyPage]);

  useEffect(() => {
    if (authorized) void refreshHistory();
  }, [authorized, refreshHistory]);

  // Any filter change invalidates the current page number.
  useEffect(() => {
    setHistoryPage(1);
  }, [filters]);

  const totalPages = Math.max(1, Math.ceil(historyTotal / PAGE_SIZE));

  async function handleSubmit() {
    if (saving) return;
    const validation = validate();
    setErrors(validation);
    if (Object.keys(validation).length) return;
    if (!currentUser) return;

    setSaving(true);
    setSubmitMessage(null);

    try {
      const lessonName = LESSON_OPTIONS.find((l) => l.number === lessonNumber)?.name ?? "";

      if (editingId) {
        const before = history.find((h) => h.id === editingId) ?? null;
        const duplicate = await hasPendingDuplicate({
          studentId: before?.studentId ?? "",
          type: selectedType!,
          actionDate,
          lesson: lessonName,
          excludeId: editingId,
        });
        if (duplicate) {
          setSubmitMessage({
            kind: "error",
            text: "يوجد طلب آخر قيد الانتظار لنفس الطالب ونفس نوع الإجراء ونفس التاريخ والحصة.",
          });
          setSaving(false);
          return;
        }

        const updated = await updateStudentAction(editingId, {
          type: selectedType ?? undefined,
          reason: reason.trim(),
          lesson: lessonName,
          notes,
          actionDate,
          actionTime,
          assignedTeacherId: selectedTeacherId,
        });

        if (!updated) {
          setSubmitMessage({ kind: "error", text: "تعذر تعديل الطلب، قد يكون تم تنفيذه بالفعل." });
          setSaving(false);
          return;
        }

        const meaningfullyChanged =
          before &&
          (before.assignedTeacherId !== updated.assignedTeacherId ||
            before.reason !== updated.reason ||
            before.actionDate !== updated.actionDate ||
            before.actionTime !== updated.actionTime ||
            before.lesson !== updated.lesson ||
            before.notes !== updated.notes);

        if (meaningfullyChanged && (await areStudentActionAlertsEnabled())) {
          await createNotification({
            title: `${TYPE_LABELS[updated.type]} - ${updated.studentName}`,
            body: buildNotificationBody(updated, currentUser.full_name),
            role: "teacher",
            userId: updated.assignedTeacherId,
            type: updated.type,
            studentActionId: updated.id,
            metadata: buildNotificationMetadata(updated, currentUser.full_name),
          });
        }

        await writeAuditLog({
          actorId: currentUser.id,
          actorName: currentUser.full_name,
          actorRole: currentUser.role,
          action: "تعديل إجراء طالب",
          details: `${TYPE_LABELS[updated.type]} - ${updated.studentName}`,
          studentId: updated.studentId,
          studentActionId: updated.id,
          oldValues: before,
          newValues: updated,
        });

        setSubmitMessage({ kind: "success", text: "تم تعديل الإجراء بنجاح." });
        resetForm();
        setSelectedStudent(null);
        setSearchQuery("");
        setSearchResults([]);
        await refreshHistory();
        return;
      }

      const duplicate = await hasPendingDuplicate({
        studentId: selectedStudent!.id,
        type: selectedType!,
        actionDate,
        lesson: lessonName,
      });
      if (duplicate) {
        setSubmitMessage({
          kind: "error",
          text: "يوجد طلب مماثل قيد الانتظار لنفس الطالب ونفس نوع الإجراء ونفس التاريخ والحصة.",
        });
        setSaving(false);
        return;
      }

      const input: CreateStudentActionInput = {
        studentId: selectedStudent!.id,
        studentName: selectedStudent!.name,
        grade: selectedStudent!.grade,
        section: selectedStudent!.section,
        type: selectedType!,
        reason: reason.trim(),
        lesson: lessonName,
        notes,
        actionDate,
        actionTime,
        requestedBy: currentUser.id,
        assignedTeacherId: selectedTeacherId,
      };

      const created = await createStudentAction(input);

      if (await areStudentActionAlertsEnabled()) {
        await createNotification({
          title: `${TYPE_LABELS[created.type]} - ${created.studentName}`,
          body: buildNotificationBody(created, currentUser.full_name),
          role: "teacher",
          userId: created.assignedTeacherId,
          type: created.type,
          studentActionId: created.id,
          metadata: buildNotificationMetadata(created, currentUser.full_name),
        });
      }

      await writeAuditLog({
        actorId: currentUser.id,
        actorName: currentUser.full_name,
        actorRole: currentUser.role,
        action: "إنشاء إجراء طالب",
        details: `${TYPE_LABELS[created.type]} - ${created.studentName}`,
        studentId: created.studentId,
        studentActionId: created.id,
        newValues: created,
      });

      setSubmitMessage({ kind: "success", text: "تم إرسال الإجراء للمعلم بنجاح." });
      resetForm();
      setSelectedStudent(null);
      setSearchQuery("");
      setSearchResults([]);
      await refreshHistory();
    } catch (err) {
      setSubmitMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  function startEdit(action: StudentActionRecord) {
    setEditingId(action.id);
    setSelectedStudent(null);
    setEditContext({ grade: action.grade, section: action.section });
    setSelectedType(action.type);
    setReason(action.reason);
    setActionDate(action.actionDate);
    setActionTime(action.actionTime?.slice(0, 5) || nowTime());
    const lessonMatch = LESSON_OPTIONS.find((l) => l.name === action.lesson);
    setLessonNumber(lessonMatch?.number ?? "");
    setNotes(action.notes ?? "");
    // Seed with the currently-assigned teacher immediately (avoids a blank flash);
    // the lookup effect re-validates it against the live schedule right after and
    // will override this if the assignment has since changed.
    setSelectedTeacherId(action.assignedTeacherId);
    setTeacherLookup({
      autoTeacher: { id: action.assignedTeacherId, name: action.assignedTeacherName },
      candidates: [],
      source: "schedule",
    });
    setSubmitMessage(null);
    setErrors({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleCancel(action: StudentActionRecord) {
    if (actionBusyId) return;
    if (!window.confirm(`هل تريد إلغاء طلب ${TYPE_LABELS[action.type]} للطالب ${action.studentName}؟`)) return;

    setActionBusyId(action.id);
    setActionMessage(null);
    try {
      const cancelled = await cancelStudentAction(action.id);
      if (!cancelled) {
        setActionMessage({ kind: "error", text: "تعذر إلغاء الطلب، قد يكون تم تنفيذه بالفعل." });
        return;
      }
      // Tell the assigned teacher directly — otherwise they'd only discover the
      // cancellation by re-opening /notifications and noticing the buttons gone.
      if (await areStudentActionAlertsEnabled()) {
        await createNotification({
          title: `تم إلغاء طلب ${TYPE_LABELS[action.type]} - ${action.studentName}`,
          body: `قام ${currentUser!.full_name} بإلغاء طلب ${TYPE_LABELS[action.type]} للطالب ${action.studentName}.`,
          userId: action.assignedTeacherId,
          type: "action_cancelled",
          studentActionId: action.id,
          metadata: {
            studentName: action.studentName,
            grade: action.grade,
            section: action.section,
            type: action.type,
            status: "cancelled",
            requesterName: currentUser!.full_name,
          },
        });
      }
      await writeAuditLog({
        actorId: currentUser!.id,
        actorName: currentUser!.full_name,
        actorRole: currentUser!.role,
        action: "إلغاء إجراء طالب",
        details: `${TYPE_LABELS[action.type]} - ${action.studentName}`,
        studentId: action.studentId,
        studentActionId: action.id,
        oldValues: { status: action.status },
        newValues: { status: "cancelled" },
      });
      setActionMessage({ kind: "success", text: "تم إلغاء الطلب بنجاح." });
      await refreshHistory();
    } catch (err) {
      setActionMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setActionBusyId(null);
    }
  }

  async function handleResend(action: StudentActionRecord) {
    if (actionBusyId) return;
    setActionBusyId(action.id);
    setActionMessage(null);
    try {
      const fresh = await resendStudentAction(action.id);
      if (!fresh) {
        setActionMessage({ kind: "error", text: "لا يمكن إعادة الإرسال لطلب تم التعامل معه بالفعل." });
        return;
      }
      if (await areStudentActionAlertsEnabled()) {
        await createNotification({
          title: `${TYPE_LABELS[fresh.type]} - ${fresh.studentName}`,
          body: buildNotificationBody(fresh, currentUser!.full_name),
          role: "teacher",
          userId: fresh.assignedTeacherId,
          type: fresh.type,
          studentActionId: fresh.id,
          metadata: buildNotificationMetadata(fresh, currentUser!.full_name),
        });
      }
      await writeAuditLog({
        actorId: currentUser!.id,
        actorName: currentUser!.full_name,
        actorRole: currentUser!.role,
        action: "إعادة إرسال إجراء طالب",
        details: `${TYPE_LABELS[fresh.type]} - ${fresh.studentName}`,
        studentId: fresh.studentId,
        studentActionId: fresh.id,
      });
      setActionMessage({ kind: "success", text: "تم إعادة إرسال الإجراء للمعلم." });
    } catch (err) {
      setActionMessage({ kind: "error", text: getErrorMessage(err) });
    } finally {
      setActionBusyId(null);
    }
  }

  const activeTypeConfig = useMemo(() => ACTION_TYPES.find((t) => t.type === selectedType) ?? null, [selectedType]);

  if (checkingAccess) {
    return (
      <div className="space-y-4 p-4" dir="rtl">
        <div className="h-24 animate-pulse rounded-3xl bg-slate-200" />
        <div className="h-40 animate-pulse rounded-3xl bg-slate-200" />
        <div className="h-64 animate-pulse rounded-3xl bg-slate-200" />
      </div>
    );
  }

  if (accessError) {
    return (
      <div className="p-4" dir="rtl">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-6 text-center">
          <p className="font-bold text-red-700">تعذر التحقق من صلاحيات الوصول لهذه الصفحة.</p>
          <p className="mt-2 text-sm text-red-600">{accessError}</p>
        </div>
      </div>
    );
  }

  if (!authorized) return null;

  return (
    <div className="space-y-4 p-4 pb-10" dir="rtl">
      <header className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <p className="text-sm font-bold text-blue-700">إجراءات الطالب</p>
        <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">استدعاء / استئذان / دخول</h1>
        <p className="mt-2 text-sm text-slate-500">ابحث عن الطالب، اختر نوع الإجراء، وأرسله مباشرة إلى المعلم المختص.</p>
      </header>

      {/* Rendered at page level (not inside the form section below) so it stays
          visible after a successful submit resets/collapses the form. */}
      {submitMessage ? (
        <div
          className={`rounded-2xl p-3 text-sm font-bold ${
            submitMessage.kind === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
          }`}
        >
          {submitMessage.text}
        </div>
      ) : null}

      {/* ---- Search ---- */}
      <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
        <div className="relative">
          <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="ابحث بالاسم، رقم الهوية، رقم الطالب، الصف أو الشعبة"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pr-10 pl-3 text-sm outline-none focus:border-blue-500"
          />
        </div>

        {searching ? (
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={16} className="animate-spin" /> جارٍ البحث...
          </p>
        ) : hasSearched && searchResults.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">لا توجد نتائج مطابقة.</p>
        ) : searchResults.length > 0 ? (
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {searchResults.map((student) => (
              <button
                key={student.id}
                type="button"
                onClick={() => {
                  setSelectedStudent(student);
                  setEditingId(null);
                }}
                className={`flex w-full items-center justify-between rounded-2xl border p-3 text-right transition ${
                  selectedStudent?.id === student.id
                    ? "border-blue-600 bg-blue-50"
                    : "border-slate-200 bg-white hover:bg-slate-50"
                }`}
              >
                <span>
                  <span className="block font-bold text-slate-900">{student.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {student.grade} - {student.section} · رقم الطالب: {student.entryCode || "—"}
                  </span>
                </span>
                {selectedStudent?.id === student.id ? <CheckCircle2 size={20} className="text-blue-600" /> : null}
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {/* ---- Selected student (always visible once picked) ---- */}
      {selectedStudent ? (
        <section className="rounded-3xl border-2 border-blue-100 bg-blue-50/60 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white">
                <User size={20} />
              </div>
              <div>
                <p className="text-lg font-bold text-slate-900">{selectedStudent.name}</p>
                <p className="mt-1 text-xs text-slate-600">
                  {selectedStudent.grade} - شعبة {selectedStudent.section} · رقم الطالب: {selectedStudent.entryCode || "—"}
                  {selectedStudent.nationalId ? ` · الهوية: ${selectedStudent.nationalId}` : ""}
                </p>
                {attendanceSummary ? (
                  <p className="mt-1 text-xs text-slate-500">
                    آخر 30 يوم: غياب {attendanceSummary.absent} · تأخر {attendanceSummary.late} · استئذان {attendanceSummary.excused}
                  </p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedStudent(null)}
              className="rounded-xl bg-white p-2 text-slate-500 shadow-sm"
              aria-label="تغيير الطالب"
            >
              <X size={16} />
            </button>
          </div>
        </section>
      ) : null}

      {/* ---- Action type cards ---- */}
      {(selectedStudent || editingId) && (
        <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
          <h2 className="mb-3 text-base font-bold text-slate-900">نوع الإجراء</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {ACTION_TYPES.map((option) => {
              const Icon = option.icon;
              const active = selectedType === option.type;
              return (
                <button
                  key={option.type}
                  type="button"
                  onClick={() => setSelectedType(option.type)}
                  className={`flex items-center gap-3 rounded-2xl border-2 p-4 text-right transition ${
                    active ? `${option.bg} border-transparent text-white` : "border-slate-200 bg-slate-50 text-slate-600"
                  }`}
                >
                  <Icon size={22} />
                  <span className="font-bold">{option.label}</span>
                </button>
              );
            })}
          </div>
          {errors.type ? <p className="mt-2 text-xs font-bold text-red-600">{errors.type}</p> : null}
        </section>
      )}

      {/* ---- Form ---- */}
      {selectedType && (selectedStudent || editingId) ? (
        <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">{editingId ? "تعديل الطلب" : "تفاصيل الطلب"}</h2>
            {activeTypeConfig ? (
              <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: activeTypeConfig.color }}>
                {activeTypeConfig.label}
              </span>
            ) : null}
          </div>

          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">السبب *</label>
              <textarea
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="اكتب سبب الإجراء"
                className="min-h-[84px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-500"
              />
              {errors.reason ? <p className="mt-1 text-xs font-bold text-red-600">{errors.reason}</p> : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">ملاحظات (اختياري)</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="ملاحظات إضافية"
                className="min-h-[84px] w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-500"
              />
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-bold text-slate-600">
                <Calendar size={14} /> التاريخ *
              </label>
              <input
                type="date"
                value={actionDate}
                onChange={(event) => setActionDate(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-500"
              />
              {errors.date ? <p className="mt-1 text-xs font-bold text-red-600">{errors.date}</p> : null}
            </div>

            <div>
              <label className="mb-1 flex items-center gap-1 text-xs font-bold text-slate-600">
                <Clock size={14} /> الوقت *
              </label>
              <input
                type="time"
                value={actionTime}
                onChange={(event) => setActionTime(event.target.value)}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-500"
              />
              {errors.time ? <p className="mt-1 text-xs font-bold text-red-600">{errors.time}</p> : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">الحصة *</label>
              <select
                value={lessonNumber}
                onChange={(event) => setLessonNumber(event.target.value ? Number(event.target.value) : "")}
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-500"
              >
                <option value="">اختر الحصة</option>
                {LESSON_OPTIONS.map((lesson) => (
                  <option key={lesson.number} value={lesson.number}>
                    {lesson.name}
                  </option>
                ))}
              </select>
              {errors.lesson ? <p className="mt-1 text-xs font-bold text-red-600">{errors.lesson}</p> : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">المعلم المستهدف *</label>
              {teacherLoading ? (
                <p className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" /> جارٍ تحديد المعلم...
                </p>
              ) : teacherLookup?.autoTeacher ? (
                <div className="flex items-center justify-between rounded-2xl border border-green-200 bg-green-50 p-3 text-sm">
                  <span className="font-bold text-green-800">{teacherLookup.autoTeacher.name}</span>
                  <span className="text-xs text-green-600">تم التحديد تلقائيًا</span>
                </div>
              ) : teacherLookup && teacherLookup.candidates.length > 0 ? (
                <select
                  value={selectedTeacherId}
                  onChange={(event) => setSelectedTeacherId(event.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm outline-none focus:border-blue-500"
                >
                  <option value="">اختر المعلم</option>
                  {teacherLookup.candidates.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>
                      {teacher.name}
                    </option>
                  ))}
                </select>
              ) : teacherLookup?.source === "none" ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-bold text-red-600">
                  لا يوجد معلم مرتبط بهذا الصف والشعبة في هذه الحصة. لا يمكن إرسال الإجراء حتى يتم ربط معلم بجدول الحصص أو الإسناد.
                </p>
              ) : (
                <p className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-400">
                  اختر التاريخ والحصة أولًا لتحديد المعلم.
                </p>
              )}
              {errors.teacher ? <p className="mt-1 text-xs font-bold text-red-600">{errors.teacher}</p> : null}
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">مقدم الطلب</label>
              <p className="rounded-2xl border border-slate-200 bg-slate-100 p-3 text-sm font-bold text-slate-700">
                {currentUser?.full_name}
              </p>
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving || teacherLoading}
              className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-blue-700 px-4 py-3.5 text-sm font-black text-white disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 size={18} className="animate-spin" /> جارٍ الحفظ...
                </>
              ) : editingId ? (
                "حفظ التعديل"
              ) : (
                "إرسال الإجراء للمعلم"
              )}
            </button>
            {editingId ? (
              <button
                type="button"
                onClick={() => {
                  resetForm();
                }}
                className="rounded-2xl bg-slate-100 px-4 py-3.5 text-sm font-bold text-slate-600"
              >
                إلغاء التعديل
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {/* ---- History / log ---- */}
      <section className="rounded-3xl bg-white shadow-sm border border-slate-100">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <Filter size={16} /> سجل الإجراءات
          </h2>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{historyTotal} إجراء</span>
        </div>

        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
          <select
            value={filters.type ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, type: (event.target.value || undefined) as StudentActionType | undefined }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          >
            <option value="">كل الأنواع</option>
            <option value="summon">استدعاء</option>
            <option value="permission">استئذان</option>
            <option value="entry">دخول</option>
          </select>

          <select
            value={filters.status ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, status: (event.target.value || undefined) as StudentActionStatus | undefined }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          >
            <option value="">كل الحالات</option>
            <option value="pending">قيد الانتظار</option>
            <option value="completed">تم التنفيذ</option>
            <option value="postponed">مؤجل</option>
            <option value="cancelled">ملغى</option>
          </select>

          <input
            placeholder="الصف"
            value={filters.grade ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, grade: event.target.value || undefined }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          />

          <input
            placeholder="الشعبة"
            value={filters.section ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, section: event.target.value || undefined }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          />

          <input
            placeholder="اسم الطالب"
            value={filters.studentName ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, studentName: event.target.value || undefined }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          />

          <input
            type="date"
            value={filters.date ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, date: event.target.value || undefined }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          />

          <select
            value={filters.teacherId ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, teacherId: event.target.value || undefined }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          >
            <option value="">كل المعلمين</option>
            {teacherOptions.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.name}
              </option>
            ))}
          </select>

          <input
            placeholder="بحث نصي (السبب أو الملاحظات)"
            value={filters.search ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value || undefined }))}
            className="col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs sm:col-span-2"
          />

          <button
            type="button"
            onClick={() => setFilters(emptyFilters)}
            className="col-span-2 rounded-xl bg-slate-100 p-2 text-xs font-bold text-slate-600 sm:col-span-2"
          >
            إعادة تعيين الفلاتر
          </button>
        </div>

        {actionMessage ? (
          <div
            className={`mx-4 mb-3 rounded-2xl p-3 text-sm font-bold ${
              actionMessage.kind === "success" ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"
            }`}
          >
            {actionMessage.text}
          </div>
        ) : null}

        <div className="space-y-3 p-4 pt-0">
          {historyLoading ? (
            <>
              <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
              <div className="h-28 animate-pulse rounded-2xl bg-slate-100" />
            </>
          ) : history.length === 0 ? (
            <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm text-slate-500">لا توجد إجراءات مطابقة.</p>
          ) : (
            history.map((action, index) => {
              const typeConfig = ACTION_TYPES.find((t) => t.type === action.type)!;
              const expanded = expandedId === action.id;
              const busy = actionBusyId === action.id;
              return (
                <article key={action.id} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">#{index + 1}</span>
                      <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: typeConfig.color }}>
                        {TYPE_LABELS[action.type]}
                      </span>
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${STATUS_CLASSES[action.status]}`}>
                        {STATUS_LABELS[action.status]}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {action.actionDate} · {action.actionTime?.slice(0, 5)}
                    </span>
                  </div>

                  <h3 className="mt-2 text-base font-bold text-slate-900">{action.studentName}</h3>
                  <p className="text-xs text-slate-500">
                    {action.grade} - {action.section} · {action.lesson}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>المعلم: {action.assignedTeacherName || "—"}</span>
                    <span>مقدم الطلب: {action.requestedByName || "—"}</span>
                  </div>

                  {expanded ? (
                    <div className="mt-3 space-y-1 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                      <p>
                        <b>السبب:</b> {action.reason}
                      </p>
                      {action.notes ? (
                        <p>
                          <b>ملاحظات:</b> {action.notes}
                        </p>
                      ) : null}
                      {action.completedAt ? (
                        <p>
                          <b>وقت التنفيذ:</b> {new Date(action.completedAt).toLocaleString("ar-EG")} — {action.completedByName}
                        </p>
                      ) : null}
                      {action.postponedUntil ? (
                        <p>
                          <b>مؤجل حتى:</b> {new Date(action.postponedUntil).toLocaleString("ar-EG")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? null : action.id)}
                      className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600"
                    >
                      {expanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
                    </button>

                    {action.status === "pending" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => startEdit(action)}
                          disabled={busy}
                          className="flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-50"
                        >
                          <Pencil size={13} /> تعديل
                        </button>
                        <button
                          type="button"
                          onClick={() => handleResend(action)}
                          disabled={busy}
                          className="flex items-center gap-1 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700 disabled:opacity-50"
                        >
                          {busy ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} إعادة الإرسال
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancel(action)}
                          disabled={busy}
                          className="flex items-center gap-1 rounded-xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700 disabled:opacity-50"
                        >
                          <XCircle size={13} /> إلغاء الطلب
                        </button>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })
          )}
        </div>

        {historyTotal > 0 ? (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-4">
            <button
              type="button"
              onClick={() => setHistoryPage((p) => Math.max(1, p - 1))}
              disabled={historyLoading || historyPage <= 1}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-40"
            >
              السابق
            </button>
            <span className="text-xs font-bold text-slate-500">
              صفحة {historyPage} من {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setHistoryPage((p) => Math.min(totalPages, p + 1))}
              disabled={historyLoading || historyPage >= totalPages}
              className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 disabled:opacity-40"
            >
              التالي
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function buildNotificationBody(action: StudentActionRecord, requesterName: string) {
  return [
    `الطالب: ${action.studentName}`,
    `الصف: ${action.grade} - ${action.section}`,
    `السبب: ${action.reason}`,
    `الحصة: ${action.lesson}`,
    `الوقت: ${action.actionTime?.slice(0, 5)}`,
    `مقدم الطلب: ${requesterName}`,
    action.notes ? `ملاحظات: ${action.notes}` : null,
  ]
    .filter(Boolean)
    .join(" | ");
}

function buildNotificationMetadata(action: StudentActionRecord, requesterName: string) {
  return {
    studentName: action.studentName,
    grade: action.grade,
    section: action.section,
    reason: action.reason,
    lesson: action.lesson,
    actionDate: action.actionDate,
    actionTime: action.actionTime,
    requesterName,
    notes: action.notes,
  };
}
