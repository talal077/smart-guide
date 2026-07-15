"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSession } from "@/lib/session";

type OperationLog = {
  id: string;
  userName: string;
  userRole: string;
  actionType: string;
  description: string;
  createdAt: string;
};

const demoLogs: OperationLog[] = [
  {
    id: "log-1",
    userName: "طلال الصاعدي",
    userRole: "إداري",
    actionType: "إنشاء حساب",
    description: "تم إنشاء حساب إداري جديد وربطه بقاعدة البيانات.",
    createdAt: new Date().toISOString(),
  },
  {
    id: "log-2",
    userName: "النظام",
    userRole: "نظام",
    actionType: "تحديث",
    description: "تم تفعيل جدول الطلاب والتحضير والإجراءات.",
    createdAt: new Date().toISOString(),
  },
];

export default function OperationsLogPage() {
  const router = useRouter();
  const [logs, setLogs] = useState<OperationLog[]>([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  useEffect(() => {
    const session = getSession();
    if (!session) router.replace("/login");

    const raw = localStorage.getItem("system-operation-log");
    if (raw) {
      try {
        setLogs(JSON.parse(raw));
      } catch {
        setLogs(demoLogs);
      }
    } else {
      setLogs(demoLogs);
      localStorage.setItem("system-operation-log", JSON.stringify(demoLogs));
    }
  }, [router]);

  const types = useMemo(() => {
    return Array.from(new Set(logs.map((log) => log.actionType))).filter(Boolean);
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.trim();

    return logs.filter((log) => {
      const matchesSearch =
        !q ||
        log.userName.includes(q) ||
        log.userRole.includes(q) ||
        log.actionType.includes(q) ||
        log.description.includes(q);

      const matchesType = typeFilter === "all" || log.actionType === typeFilter;

      return matchesSearch && matchesType;
    });
  }, [logs, search, typeFilter]);

  return (
    <main style={styles.page}>
      <section style={styles.container}>
        <header style={styles.header}>
          <div>
            <p style={styles.path}>الرئيسية / سجل العمليات</p>
            <h1 style={styles.title}>سجل العمليات</h1>
            <p style={styles.subtitle}>
              متابعة العمليات التي تمت داخل النظام، مثل التحضير والتعديلات وإجراءات الطلاب.
            </p>
          </div>

          <Link href="/dashboard" style={styles.back}>
            العودة
          </Link>
        </header>

        <section style={styles.stats}>
          <Card title="إجمالي العمليات" value={logs.length} color="#2563eb" />
          <Card title="النتائج المعروضة" value={filtered.length} color="#16a34a" />
          <Card title="أنواع العمليات" value={types.length} color="#f59e0b" />
        </section>

        <section style={styles.filters}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="بحث باسم المستخدم أو نوع العملية أو الوصف"
            style={styles.input}
          />

          <select
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
            style={styles.select}
          >
            <option value="all">كل العمليات</option>
            {types.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </section>

        <section style={styles.tableCard}>
          <div style={styles.tableHeader}>
            <h2 style={styles.sectionTitle}>قائمة العمليات</h2>
            <span style={styles.count}>{filtered.length} عملية</span>
          </div>

          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr style={styles.headRow}>
                  <th style={styles.th}>#</th>
                  <th style={styles.th}>التاريخ والوقت</th>
                  <th style={styles.th}>المستخدم</th>
                  <th style={styles.th}>الدور</th>
                  <th style={styles.th}>نوع العملية</th>
                  <th style={styles.th}>الوصف</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((log, index) => (
                  <tr key={log.id}>
                    <td style={styles.td}>{index + 1}</td>
                    <td style={styles.td}>{formatDate(log.createdAt)}</td>
                    <td style={{ ...styles.td, fontWeight: 900 }}>{log.userName}</td>
                    <td style={styles.td}>{log.userRole}</td>
                    <td style={styles.td}>
                      <span style={styles.badge}>{log.actionType}</span>
                    </td>
                    <td style={{ ...styles.td, textAlign: "right" }}>{log.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filtered.length === 0 ? (
              <div style={styles.empty}>لا توجد عمليات مطابقة.</div>
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ar-SA", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f4f7fb",
    direction: "rtl",
    padding: 24,
    fontFamily: "Tahoma, Arial, sans-serif",
    color: "#0f172a",
  },
  container: { maxWidth: 1180, margin: "0 auto" },
  header: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },
  path: { margin: 0, color: "#64748b", fontSize: 13 },
  title: { margin: "6px 0", fontSize: 32, fontWeight: 900 },
  subtitle: { margin: 0, color: "#64748b" },
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
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
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
  cardValue: { fontSize: 30, fontWeight: 900 },
  cardTitle: { color: "#64748b", marginTop: 4, fontSize: 13 },
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
    color: "#111827",
    background: "#fff",
    fontSize: 14,
    outline: "none",
  },
  select: {
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    color: "#111827",
    background: "#fff",
    fontSize: 14,
    outline: "none",
  },
  tableCard: {
    background: "#fff",
    borderRadius: 22,
    border: "1px solid #e5e7eb",
    overflow: "hidden",
  },
  tableHeader: {
    padding: 18,
    borderBottom: "1px solid #e5e7eb",
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
  },
  sectionTitle: { margin: 0, fontSize: 20, fontWeight: 900 },
  count: {
    background: "#e0f2fe",
    color: "#0369a1",
    padding: "7px 12px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
  },
  tableWrapper: { overflowX: "auto" },
  table: { width: "100%", minWidth: 850, borderCollapse: "collapse" },
  headRow: { background: "#f0fdf4" },
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
    background: "#dbeafe",
    color: "#1d4ed8",
    padding: "7px 12px",
    borderRadius: 999,
    fontWeight: 900,
    fontSize: 12,
  },
  empty: { padding: 28, textAlign: "center", color: "#64748b" },
};
