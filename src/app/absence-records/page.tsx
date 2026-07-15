"use client";

import Link from "next/link";
import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { type AttendanceRecord, getAllAttendance, saveAttendance } from "@/lib/attendance";

const ALLOWED_ROLES = ["principal", "admin", "vice_principal", "teacher"];

type Status = AttendanceRecord["status"];
type StatusFilter = "all" | Status;

function getErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return "حدث خطأ غير متوقع أثناء التحقق من صلاحيات الوصول.";
}

const labels: Record<Status, string> = {
  present: "حاضر",
  absent: "غائب",
  late: "متأخر",
  excused: "مستأذن",
};

const colors: Record<Status, string> = {
  present: "#16a34a",
  absent: "#dc2626",
  late: "#f97316",
  excused: "#2563eb",
};

const STATUS_ORDER = Object.keys(labels) as Status[];

export default function AbsenceRecordsPage() {
  const router = useRouter();

  const [checkingAccess, setCheckingAccess] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loadingRecords, setLoadingRecords] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function checkAccess() {
      try {
        const { data: authData, error: authError } = await supabase.auth.getUser();
        if (cancelled) return;

        if (authError || !authData.user) {
          router.replace("/login");
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, is_active, is_blocked")
          .eq("id", authData.user.id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (cancelled) return;

        if (!profile || profile.is_blocked || profile.is_active === false) {
          router.replace("/login");
          return;
        }

        if (!ALLOWED_ROLES.includes(String(profile.role))) {
          router.replace("/dashboard");
          return;
        }

        setAuthorized(true);
        setCheckingAccess(false);
      } catch (err) {
        if (!cancelled) {
          setAccessError(getErrorMessage(err));
          setCheckingAccess(false);
        }
      }
    }

    void checkAccess();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!authorized) return;

    async function load() {
      setLoadingRecords(true);
      const data = await getAllAttendance();
      setRecords(data);
      setLoadingRecords(false);
    }
    load();
  }, [authorized]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const q = search.trim();

      const matchesSearch =
        !q ||
        r.studentName.includes(q) ||
        r.grade.includes(q) ||
        r.section.includes(q) ||
        r.lesson.includes(q) ||
        r.date.includes(q);

      const matchesStatus = statusFilter === "all" || r.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [records, search, statusFilter]);

  const hasUnsavedChanges = dirtyIds.size > 0;

  const updateStatus = useCallback((id: string, status: Status) => {
    setRecords((prev) =>
      prev.map((record) =>
        record.id === id
          ? { ...record, status, updatedAt: new Date().toISOString() }
          : record
      )
    );
    setDirtyIds((prev) => new Set(prev).add(id));
    setSaveSuccess(false);
    setSaveError(null);
  }, []);

  async function saveAllChanges() {
    if (!dirtyIds.size || saving) return;

    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const changedRecords = records.filter((record) => dirtyIds.has(record.id));
      await saveAttendance(changedRecords);
      setDirtyIds(new Set());
      setSaveSuccess(true);
    } catch (err) {
      setSaveError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (!hasUnsavedChanges) return;

    function handleBeforeUnload(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "لديك تعديلات غير محفوظة، هل تريد المغادرة؟";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const stats = {
    total: records.length,
    present: records.filter((r) => r.status === "present").length,
    absent: records.filter((r) => r.status === "absent").length,
    late: records.filter((r) => r.status === "late").length,
    excused: records.filter((r) => r.status === "excused").length,
  };

  if (checkingAccess) {
    return (
      <main style={styles.page}>
        <section style={styles.container}>
          <div style={styles.empty}>جارٍ التحقق من صلاحيات الوصول...</div>
        </section>
      </main>
    );
  }

  if (accessError) {
    return (
      <main style={styles.page}>
        <section style={styles.container}>
          <div style={{ ...styles.tableCard, padding: 24 }}>
            <p style={{ margin: 0, fontWeight: 900, color: "#dc2626" }}>تعذر التحقق من صلاحيات الوصول لهذه الصفحة.</p>
            <p style={{ marginTop: 8, color: "#64748b" }}>{accessError}</p>
            <Link href="/dashboard" style={{ ...styles.back, display: "inline-block", marginTop: 16, textAlign: "center" }}>
              العودة إلى لوحة التحكم
            </Link>
          </div>
        </section>
      </main>
    );
  }

  if (!authorized) return null;

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <div>
            <p style={styles.path}>الرئيسية / سجل الغياب</p>
            <h1 style={styles.title}>سجل الغياب</h1>
            <p style={styles.subtitle}>متابعة الحضور والغياب والتأخر والاستئذان.</p>
          </div>

          <Link
            href="/dashboard"
            style={styles.back}
            onClick={(event) => {
              if (hasUnsavedChanges && !window.confirm("لديك تعديلات غير محفوظة، هل تريد المغادرة؟")) {
                event.preventDefault();
              }
            }}
          >
            العودة
          </Link>
        </header>

        <section style={styles.stats}>
          <Card title="الإجمالي" value={stats.total} color="#2563eb" />
          <Card title="حاضر" value={stats.present} color="#16a34a" />
          <Card title="غائب" value={stats.absent} color="#dc2626" />
          <Card title="متأخر" value={stats.late} color="#f97316" />
          <Card title="مستأذن" value={stats.excused} color="#2563eb" />
        </section>

        <section style={styles.filters}>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم الطالب أو الصف أو الشعبة أو الحصة"
            style={styles.input}
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            style={styles.select}
          >
            <option value="all">كل الحالات</option>
            <option value="present">حاضر</option>
            <option value="absent">غائب</option>
            <option value="late">متأخر</option>
            <option value="excused">مستأذن</option>
          </select>
        </section>

        {hasUnsavedChanges ? (
          <section style={styles.saveBar}>
            <span style={styles.saveBarText}>
              لديك ({dirtyIds.size}) تعديلات غير محفوظة
            </span>
            <button type="button" onClick={saveAllChanges} disabled={saving} style={styles.saveButton}>
              {saving ? "جارٍ الحفظ..." : "💾 حفظ التعديلات"}
            </button>
          </section>
        ) : null}

        {saveSuccess ? (
          <div style={styles.successBanner}>تم حفظ التعديلات بنجاح</div>
        ) : null}

        {saveError ? <div style={styles.errorBanner}>{saveError}</div> : null}

        <section style={styles.tableCard}>
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.headRow}>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>الطالب</th>
                  <th style={styles.th}>الصف</th>
                  <th style={styles.th}>الشعبة</th>
                  <th style={styles.th}>الحصة</th>
                  <th style={styles.th}>التاريخ</th>
                  <th style={styles.th}>الحالة</th>
                  <th style={styles.th}>تعديل</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((record, index) => (
                  <AbsenceRecordRow
                    key={record.id}
                    record={record}
                    index={index}
                    isModified={dirtyIds.has(record.id)}
                    onStatusChange={updateStatus}
                  />
                ))}
              </tbody>
            </table>

            {filtered.length === 0 ? (
              <div style={styles.empty}>{loadingRecords ? "جارٍ تحميل السجلات..." : "لا توجد سجلات."}</div>
            ) : null}
          </div>
        </section>
      </section>
    </main>
  );
}

function Card({ title, value, color }: { title: string; value: number; color: string }) {
  return (
    <div style={styles.card}>
      <div style={{ ...styles.cardValue, color }}>{value}</div>
      <div style={styles.cardTitle}>{title}</div>
    </div>
  );
}

const AbsenceRecordRow = memo(function AbsenceRecordRow({
  record,
  index,
  isModified,
  onStatusChange,
}: {
  record: AttendanceRecord;
  index: number;
  isModified: boolean;
  onStatusChange: (id: string, status: Status) => void;
}) {
  return (
    <tr style={isModified ? styles.trModified : undefined}>
      <td style={styles.td}>{index + 1}</td>
      <td style={{ ...styles.td, fontWeight: 900 }}>{record.studentName || "—"}</td>
      <td style={styles.td}>{record.grade || "—"}</td>
      <td style={styles.td}>{record.section || "—"}</td>
      <td style={styles.td}>{record.lesson || "—"}</td>
      <td style={styles.td}>{record.date || "—"}</td>
      <td style={styles.td}>
        <span style={{ ...styles.badge, background: colors[record.status] }}>
          {labels[record.status]}
        </span>
        {isModified ? <span style={styles.modifiedBadge}>معدّل</span> : null}
      </td>
      <td style={styles.td}>
        <div style={styles.actions}>
          {STATUS_ORDER.map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => onStatusChange(record.id, status)}
              style={{
                ...styles.statusButton,
                background: record.status === status ? colors[status] : "#e2e8f0",
                color: record.status === status ? "#fff" : "#334155",
              }}
            >
              {labels[status]}
            </button>
          ))}
        </div>
      </td>
    </tr>
  );
});

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f4f7fb",
    direction: "rtl",
    padding: 24,
    fontFamily: "Tahoma, Arial, sans-serif",
    color: "#0f172a",
  },
  container: {
    maxWidth: 1180,
    margin: "0 auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },
  path: {
    margin: 0,
    color: "#64748b",
    fontSize: 13,
  },
  title: {
    margin: "6px 0",
    fontSize: 32,
    fontWeight: 900,
  },
  subtitle: {
    margin: 0,
    color: "#64748b",
  },
  back: {
    background: "#fff",
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    padding: "12px 18px",
    color: "#0f172a",
    textDecoration: "none",
    fontWeight: 800,
    height: "fit-content",
  },
  stats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 12,
    marginBottom: 16,
  },
  card: {
    background: "#fff",
    borderRadius: 18,
    padding: 16,
    textAlign: "center",
    border: "1px solid #e5e7eb",
  },
  cardValue: {
    fontSize: 30,
    fontWeight: 900,
  },
  cardTitle: {
    color: "#64748b",
    marginTop: 4,
    fontSize: 13,
  },
  filters: {
    background: "#fff",
    borderRadius: 20,
    padding: 16,
    display: "grid",
    gridTemplateColumns: "1fr 220px",
    gap: 12,
    marginBottom: 16,
    border: "1px solid #e5e7eb",
  },
  input: {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    fontSize: 14,
  },
  select: {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    fontSize: 14,
  },
  saveBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    background: "#eff6ff",
    border: "1px solid #bfdbfe",
    borderRadius: 18,
    padding: "14px 18px",
    marginBottom: 16,
  },
  saveBarText: {
    color: "#1d4ed8",
    fontWeight: 900,
    fontSize: 14,
  },
  saveButton: {
    background: "#2563eb",
    color: "#fff",
    border: "none",
    borderRadius: 12,
    padding: "10px 22px",
    fontWeight: 900,
    fontSize: 14,
    cursor: "pointer",
  },
  successBanner: {
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    color: "#15803d",
    borderRadius: 14,
    padding: "12px 16px",
    fontWeight: 800,
    marginBottom: 16,
    textAlign: "center",
  },
  errorBanner: {
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#b91c1c",
    borderRadius: 14,
    padding: "12px 16px",
    fontWeight: 800,
    marginBottom: 16,
    textAlign: "center",
  },
  trModified: {
    background: "#fffbeb",
  },
  modifiedBadge: {
    display: "inline-flex",
    marginRight: 6,
    background: "#fef3c7",
    color: "#92400e",
    padding: "3px 8px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 11,
  },
  tableCard: {
    background: "#fff",
    borderRadius: 22,
    border: "1px solid #e5e7eb",
    overflow: "hidden",
  },
  tableWrap: {
    overflowX: "auto",
  },
  table: {
    width: "100%",
    minWidth: 900,
    borderCollapse: "collapse",
  },
  headRow: {
    background: "#f0fdf4",
  },
  th: {
    padding: 14,
    color: "#14532d",
    fontWeight: 900,
    borderBottom: "1px solid #dcfce7",
    textAlign: "center",
  },
  td: {
    padding: 14,
    borderBottom: "1px solid #f1f5f9",
    textAlign: "center",
    color: "#111827",
  },
  badge: {
    display: "inline-flex",
    color: "#fff",
    padding: "7px 12px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
  },
  actions: {
    display: "flex",
    gap: 8,
    justifyContent: "center",
    flexWrap: "wrap",
  },
  statusButton: {
    border: "none",
    borderRadius: 10,
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: 900,
  },
  empty: {
    padding: 28,
    textAlign: "center",
    color: "#64748b",
  },
};