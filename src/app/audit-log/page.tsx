"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  Calendar,
  Download,
  Filter,
  Loader2,
  Search,
  ShieldAlert,
  User,
} from "lucide-react";
import { type AppUser, getCurrentUser } from "@/lib/auth";
import {
  type AuditEntityType,
  type AuditLogFilters,
  type AuditLogRecord,
  getAuditLogsForExport,
  getAuditLogsPage,
} from "@/lib/auditLog";
import { getConfiguredRowsPerPage } from "@/lib/systemSettings";

const ALLOWED_ROLES = ["principal", "admin", "vice_principal"];
const DEFAULT_PAGE_SIZE = 10;

// The DB stores `action` as a small fixed set of Arabic literals (never free
// user input — every writeAuditLog call in the codebase passes a hardcoded
// string), so it already doubles as a stable technical key. This table maps
// those known literals to a badge color + which "entity" they belong to, for
// display only; it does not require any schema change (no action_type column).
const ACTION_META: Record<string, { color: string; entity: AuditEntityType }> = {
  "إضافة طالب جديد": { color: "#16a34a", entity: "student" },
  "تعديل بيانات الطالب": { color: "#2563eb", entity: "student" },
  "نقل الطالب": { color: "#7c3aed", entity: "student" },
  "حظر الطالب": { color: "#dc2626", entity: "student" },
  "إلغاء حظر الطالب": { color: "#16a34a", entity: "student" },
  "حذف الطالب": { color: "#475569", entity: "student" },
  "حذف جميع الطلاب": { color: "#475569", entity: "student" },
  "إنشاء إجراء طالب": { color: "#2563eb", entity: "student_action" },
  "تعديل إجراء طالب": { color: "#2563eb", entity: "student_action" },
  "إلغاء إجراء طالب": { color: "#475569", entity: "student_action" },
  "إعادة إرسال إجراء طالب": { color: "#f59e0b", entity: "student_action" },
  "تنفيذ إجراء طالب": { color: "#16a34a", entity: "student_action" },
  "تأجيل إجراء طالب": { color: "#f97316", entity: "student_action" },
  "استيراد بيانات نور": { color: "#0ea5e9", entity: "system" },
};
const DEFAULT_ACTION_META = { color: "#64748b", entity: "system" as AuditEntityType };

const ENTITY_LABELS: Record<AuditEntityType, string> = {
  student: "طالب",
  student_action: "إجراء طالب",
  system: "نظام",
};

const ROLE_LABELS: Record<string, string> = {
  principal: "مدير",
  admin: "إداري",
  vice_principal: "وكيل",
  teacher: "معلم",
  student: "طالب",
};

// Known technical field names -> Arabic labels for the old/new values diff view.
// Falls back to the raw key for anything not in this list, so nothing is hidden.
const FIELD_LABELS: Record<string, string> = {
  full_name: "الاسم",
  studentName: "اسم الطالب",
  grade: "الصف",
  section: "الشعبة",
  entry_code: "رمز الدخول",
  national_id: "رقم الهوية",
  status: "الحالة",
  type: "النوع",
  reason: "السبب",
  lesson: "الحصة",
  actionDate: "التاريخ",
  action_date: "التاريخ",
  actionTime: "الوقت",
  action_time: "الوقت",
  notes: "ملاحظات",
  assignedTeacherId: "معرف المعلم",
  assignedTeacherName: "المعلم",
  assigned_teacher_id: "معرف المعلم",
  postponedUntil: "مؤجل حتى",
  postponed_until: "مؤجل حتى",
  completedAt: "وقت التنفيذ",
  completed_at: "وقت التنفيذ",
  completedBy: "نُفذ بواسطة",
  completed_by: "نُفذ بواسطة",
  requestedByName: "مقدم الطلب",
  inserted: "تمت إضافتهم",
  updated: "تم تحديثهم",
  skipped: "تم تجاوزهم",
  rejected: "مرفوضون",
};

// Internal/noisy fields not worth showing in the diff (ids, timestamps that
// duplicate created_at, redundant name lookups already shown elsewhere).
const HIDDEN_DIFF_KEYS = new Set(["id", "createdAt", "created_at", "updatedAt", "updated_at"]);

function fieldLabel(key: string): string {
  return FIELD_LABELS[key] ?? key;
}

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatRiyadhDateTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("ar-SA", {
      timeZone: "Asia/Riyadh",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

/** Prefixes values that start with =, +, -, or @ so a CSV opened in Excel/Sheets
 * never executes them as a formula (OWASP CSV/Formula Injection mitigation). */
function sanitizeCsvCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function toCsv(rows: AuditLogRecord[]): string {
  const headers = ["التاريخ والوقت (الرياض)", "المنفذ", "الدور", "العملية", "الوصف", "معرف الطالب", "معرف الإجراء"];
  const lines = [headers.join(",")];
  for (const row of rows) {
    const cells = [
      formatRiyadhDateTime(row.createdAt),
      row.actorName,
      row.actorRole ? (ROLE_LABELS[row.actorRole] ?? row.actorRole) : "",
      row.action,
      row.details,
      row.studentId ?? "",
      row.studentActionId ?? "",
    ].map((cell) => `"${sanitizeCsvCell(String(cell)).replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  // Leading BOM so Excel opens the Arabic text as UTF-8 instead of mangling it.
  return `﻿${lines.join("\r\n")}`;
}

function diffRows(oldValues: Record<string, unknown> | null, newValues: Record<string, unknown> | null) {
  const keys = Array.from(new Set([...(oldValues ? Object.keys(oldValues) : []), ...(newValues ? Object.keys(newValues) : [])])).filter(
    (key) => !HIDDEN_DIFF_KEYS.has(key)
  );
  return keys.map((key) => {
    const oldVal = oldValues?.[key];
    const newVal = newValues?.[key];
    return {
      key,
      label: fieldLabel(key),
      oldVal: formatDiffValue(oldVal),
      newVal: formatDiffValue(newVal),
      changed: JSON.stringify(oldVal ?? null) !== JSON.stringify(newVal ?? null),
    };
  });
}

const emptyFilters: AuditLogFilters = {};

export default function AuditLogPage() {
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

  const [rows, setRows] = useState<AuditLogRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [filters, setFilters] = useState<AuditLogFilters>(emptyFilters);
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<string | null>(null);

  // "عدد الصفوف في الصفحة" from Settings -> إعدادات النظام; falls back to the
  // default if that table isn't there yet (pre-migration) or unreadable.
  useEffect(() => {
    if (!authorized) return;
    let cancelled = false;
    getConfiguredRowsPerPage().then((value) => {
      if (!cancelled) setPageSize(value);
    });
    return () => {
      cancelled = true;
    };
  }, [authorized]);

  const loadData = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { rows: nextRows, total: nextTotal } = await getAuditLogsPage(filters, page, pageSize);
      setRows(nextRows);
      setTotal(nextTotal);
    } catch (err) {
      setErrorMessage(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [filters, page, pageSize]);

  useEffect(() => {
    if (authorized) void loadData();
  }, [authorized, loadData]);

  useEffect(() => {
    setPage(1);
  }, [filters, pageSize]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    setExportMessage(null);
    try {
      const { rows: exportRows, truncated } = await getAuditLogsForExport(filters);
      if (exportRows.length === 0) {
        setExportMessage("لا توجد سجلات مطابقة للتصدير.");
        return;
      }
      const csv = toCsv(exportRows);
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `سجل-العمليات-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setExportMessage(
        truncated
          ? `تم تصدير أول ${exportRows.length} سجلًا فقط — ضيّق نطاق الفلاتر لتصدير كامل النتائج.`
          : `تم تصدير ${exportRows.length} سجلًا.`
      );
    } catch (err) {
      setExportMessage(getErrorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  const knownActions = useMemo(() => Object.keys(ACTION_META), []);

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

  if (!authorized || !currentUser) return null;

  return (
    <div className="space-y-4 p-4 pb-10" dir="rtl">
      <header className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100">
        <p className="flex items-center gap-2 text-sm font-bold text-blue-700">
          <Activity size={16} /> سجل العمليات
        </p>
        <h1 className="mt-1 text-xl font-bold text-slate-900 sm:text-2xl">سجل التدقيق (Audit Log)</h1>
        <p className="mt-2 text-sm text-slate-500">من نفّذ كل عملية، ومتى، وعلى أي طالب أو إجراء، مع القيم القديمة والجديدة.</p>
      </header>

      <section className="rounded-3xl bg-white p-4 shadow-sm border border-slate-100">
        <div className="flex items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Filter size={15} /> فلاتر
          </h2>
          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-1 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 disabled:opacity-50"
          >
            {exporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />} تصدير CSV
          </button>
        </div>

        <div className="relative mt-3">
          <Search size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={filters.search ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, search: event.target.value || undefined }))}
            placeholder="بحث بالاسم أو الوصف أو نوع العملية"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-2.5 pr-9 pl-3 text-sm outline-none focus:border-blue-500"
          />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <select
            value={filters.action ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, action: event.target.value || undefined }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          >
            <option value="">كل العمليات</option>
            {knownActions.map((action) => (
              <option key={action} value={action}>
                {action}
              </option>
            ))}
          </select>

          <select
            value={filters.entityType ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, entityType: (event.target.value || undefined) as AuditEntityType | undefined }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          >
            <option value="">كل الكيانات</option>
            <option value="student">طالب</option>
            <option value="student_action">إجراء طالب</option>
            <option value="system">نظام</option>
          </select>

          <select
            value={filters.actorRole ?? ""}
            onChange={(event) => setFilters((prev) => ({ ...prev, actorRole: event.target.value || undefined }))}
            className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-xs"
          >
            <option value="">كل الأدوار</option>
            <option value="principal">مدير</option>
            <option value="admin">إداري</option>
            <option value="vice_principal">وكيل</option>
            <option value="teacher">معلم</option>
          </select>

          <div className="relative">
            <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={filters.dateFrom ?? ""}
              onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value || undefined }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 pr-8 text-xs"
              aria-label="من تاريخ"
            />
          </div>
          <div className="relative">
            <Calendar size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="date"
              value={filters.dateTo ?? ""}
              onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value || undefined }))}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-2 pr-8 text-xs"
              aria-label="إلى تاريخ"
            />
          </div>

          <button
            type="button"
            onClick={() => setFilters(emptyFilters)}
            className="rounded-xl bg-slate-100 p-2 text-xs font-bold text-slate-600"
          >
            إعادة تعيين الفلاتر
          </button>
        </div>

        {exportMessage ? <p className="mt-2 text-xs font-bold text-slate-500">{exportMessage}</p> : null}
      </section>

      {errorMessage ? (
        <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">{errorMessage}</div>
      ) : null}

      <section className="rounded-3xl bg-white shadow-sm border border-slate-100">
        <div className="flex items-center justify-between gap-2 border-b border-slate-100 p-4">
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-900">
            <ShieldAlert size={16} /> العمليات
          </h2>
          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700">{total} سجل</span>
        </div>

        {loading ? (
          <div className="space-y-3 p-4">
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            <div className="h-24 animate-pulse rounded-2xl bg-slate-100" />
          </div>
        ) : rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-500">لا توجد سجلات مطابقة.</p>
        ) : (
          <>
            {/* Mobile: cards */}
            <div className="space-y-3 p-4 lg:hidden">
              {rows.map((row) => (
                <AuditLogCard key={row.id} row={row} expanded={expandedId === row.id} onToggle={() => setExpandedId((prev) => (prev === row.id ? null : row.id))} />
              ))}
            </div>

            {/* Desktop: table */}
            <div className="hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[900px] text-right text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="p-3">التاريخ والوقت</th>
                    <th className="p-3">المنفذ</th>
                    <th className="p-3">الدور</th>
                    <th className="p-3">العملية</th>
                    <th className="p-3">الكيان</th>
                    <th className="p-3">الوصف</th>
                    <th className="p-3">التفاصيل</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => {
                    const meta = ACTION_META[row.action] ?? DEFAULT_ACTION_META;
                    const expanded = expandedId === row.id;
                    return (
                      <Fragment key={row.id}>
                        <tr className="border-t border-slate-100">
                          <td className="p-3 text-xs text-slate-500">{formatRiyadhDateTime(row.createdAt)}</td>
                          <td className="p-3 font-bold text-slate-900">{row.actorName || "—"}</td>
                          <td className="p-3 text-xs text-slate-500">{row.actorRole ? ROLE_LABELS[row.actorRole] ?? row.actorRole : "—"}</td>
                          <td className="p-3">
                            <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: meta.color }}>
                              {row.action}
                            </span>
                          </td>
                          <td className="p-3">
                            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">
                              {ENTITY_LABELS[meta.entity]}
                            </span>
                          </td>
                          <td className="max-w-xs truncate p-3 text-xs text-slate-600">{row.details}</td>
                          <td className="p-3">
                            <button
                              type="button"
                              onClick={() => setExpandedId(expanded ? null : row.id)}
                              className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600"
                            >
                              {expanded ? "إخفاء" : "عرض التفاصيل"}
                            </button>
                          </td>
                        </tr>
                        {expanded ? (
                          <tr className="border-t border-slate-100 bg-slate-50">
                            <td colSpan={7} className="p-4">
                              <AuditLogDetails row={row} />
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}

        {total > 0 ? (
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-4">
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
      </section>
    </div>
  );
}

function AuditLogCard({ row, expanded, onToggle }: { row: AuditLogRecord; expanded: boolean; onToggle: () => void }) {
  const meta = ACTION_META[row.action] ?? DEFAULT_ACTION_META;
  return (
    <article className="rounded-2xl border border-slate-200 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="rounded-full px-3 py-1 text-xs font-bold text-white" style={{ background: meta.color }}>
          {row.action}
        </span>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-500">{ENTITY_LABELS[meta.entity]}</span>
      </div>

      <div className="mt-2 flex items-center gap-2 text-sm">
        <User size={14} className="text-slate-400" />
        <span className="font-bold text-slate-900">{row.actorName || "—"}</span>
        <span className="text-xs text-slate-400">({row.actorRole ? ROLE_LABELS[row.actorRole] ?? row.actorRole : "—"})</span>
      </div>

      <p className="mt-1 text-xs text-slate-500">{formatRiyadhDateTime(row.createdAt)}</p>
      <p className="mt-2 text-xs text-slate-600">{row.details}</p>

      <button type="button" onClick={onToggle} className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600">
        {expanded ? "إخفاء التفاصيل" : "عرض التفاصيل"}
      </button>

      {expanded ? (
        <div className="mt-3">
          <AuditLogDetails row={row} />
        </div>
      ) : null}
    </article>
  );
}

function AuditLogDetails({ row }: { row: AuditLogRecord }) {
  const diff = diffRows(row.oldValues, row.newValues);

  if (diff.length === 0) {
    return <p className="text-xs text-slate-500">لا توجد قيم إضافية مسجلة لهذه العملية.</p>;
  }

  const isCreationOnly = !row.oldValues && !!row.newValues;

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full min-w-[420px] text-right text-xs">
        <thead className="bg-white text-slate-500">
          <tr>
            <th className="p-2">الحقل</th>
            {isCreationOnly ? (
              <th className="p-2">القيمة</th>
            ) : (
              <>
                <th className="p-2">القيمة القديمة</th>
                <th className="p-2">القيمة الجديدة</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {diff.map((entry) => (
            <tr key={entry.key} className={`border-t border-slate-100 ${entry.changed ? "bg-amber-50/60" : ""}`}>
              <td className="p-2 font-bold text-slate-700">{entry.label}</td>
              {isCreationOnly ? (
                <td className="p-2 text-slate-700">{entry.newVal}</td>
              ) : (
                <>
                  <td className="p-2 text-slate-500">{entry.oldVal}</td>
                  <td className="p-2 font-bold text-slate-800">{entry.newVal}</td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
