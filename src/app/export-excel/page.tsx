"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { createClient } from "@/lib/supabase";

const supabase = createClient();

type ExportRow = {
  "اسم الطالب": string;
  "الصف": string;
  "الشعبة": string;
  "التاريخ": string;
  "الحصة": string;
  "الحالة": string;
};

type AttendanceRecord = {
  id: string;
  student_name: string;
  grade: string;
  section: string;
  date: string;
  lesson: string;
  status: "present" | "absent" | "late" | "excused";
};

const statusLabels: Record<AttendanceRecord["status"], string> = {
  present: "حاضر",
  absent: "غائب",
  late: "متأخر",
  excused: "مستأذن",
};

export default function ExcelExportPage() {
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [grade, setGrade] = useState("all");
  const [section, setSection] = useState("all");
  const [date, setDate] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("id,student_name,grade,section,date,lesson,status")
        .order("date", { ascending: false });

      if (error) {
        setMsg("تعذر تحميل سجلات التحضير.");
        return;
      }

      setRecords((data ?? []) as AttendanceRecord[]);
    }

    load();
  }, []);

  const grades = useMemo(() => Array.from(new Set(records.map((r) => r.grade))).filter(Boolean), [records]);
  const sections = useMemo(() => Array.from(new Set(records.map((r) => r.section))).filter(Boolean), [records]);

  const filtered = useMemo(() => {
    return records.filter((r) => {
      const gradeOk = grade === "all" || r.grade === grade;
      const sectionOk = section === "all" || r.section === section;
      const dateOk = !date || r.date === date;
      return gradeOk && sectionOk && dateOk;
    });
  }, [records, grade, section, date]);

  function exportExcel() {
    if (filtered.length === 0) {
      setMsg("لا توجد بيانات للتصدير.");
      return;
    }

    const rows: ExportRow[] = filtered.map((r) => ({
      "اسم الطالب": r.student_name,
      "الصف": r.grade,
      "الشعبة": r.section,
      "التاريخ": r.date,
      "الحصة": r.lesson,
      "الحالة": statusLabels[r.status],
    }));

    const sheet = XLSX.utils.json_to_sheet(rows);
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, "سجل التحضير");

    XLSX.writeFile(book, `سجل-التحضير-${new Date().toISOString().slice(0, 10)}.xlsx`);
    setMsg("تم تصدير ملف Excel بنجاح.");
  }

  return (
    <main style={styles.page}>
      <section style={styles.card}>
        <div style={styles.header}>
          <div>
            <h1 style={styles.title}>تصدير Excel</h1>
            <p style={styles.subtitle}>تصدير سجلات التحضير والغياب إلى ملف Excel.</p>
          </div>

          <Link href="/dashboard" style={styles.back}>
            العودة
          </Link>
        </div>

        <div style={styles.filters}>
          <div>
            <label style={styles.label}>الصف</label>
            <select value={grade} onChange={(e) => setGrade(e.target.value)} style={styles.input}>
              <option value="all">كل الصفوف</option>
              {grades.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={styles.label}>الشعبة</label>
            <select value={section} onChange={(e) => setSection(e.target.value)} style={styles.input}>
              <option value="all">كل الشعب</option>
              {sections.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={styles.label}>التاريخ</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={styles.input} />
          </div>

          <button onClick={exportExcel} style={styles.button}>
            تصدير Excel
          </button>
        </div>

        <div style={styles.summary}>
          <b>عدد السجلات الجاهزة للتصدير:</b> {filtered.length}
        </div>

        {msg ? <p style={styles.msg}>{msg}</p> : null}

        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>الطالب</th>
                <th style={styles.th}>الصف</th>
                <th style={styles.th}>الشعبة</th>
                <th style={styles.th}>التاريخ</th>
                <th style={styles.th}>الحصة</th>
                <th style={styles.th}>الحالة</th>
              </tr>
            </thead>

            <tbody>
              {filtered.slice(0, 20).map((r) => (
                <tr key={r.id}>
                  <td style={styles.td}>{r.student_name}</td>
                  <td style={styles.td}>{r.grade}</td>
                  <td style={styles.td}>{r.section}</td>
                  <td style={styles.td}>{r.date}</td>
                  <td style={styles.td}>{r.lesson}</td>
                  <td style={styles.td}>{statusLabels[r.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", background: "#f4f7fb", direction: "rtl", padding: 24, fontFamily: "Tahoma, Arial, sans-serif" },
  card: { maxWidth: 1100, margin: "0 auto", background: "#fff", padding: 24, borderRadius: 18, border: "1px solid #e5e7eb" },
  header: { display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center" },
  title: { margin: 0, fontSize: 30, fontWeight: 900 },
  subtitle: { color: "#64748b" },
  back: { color: "#2563eb", fontWeight: 900, textDecoration: "none" },
  filters: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 20, alignItems: "end" },
  label: { display: "block", marginBottom: 6, fontWeight: 800 },
  input: { width: "100%", padding: "12px", borderRadius: 12, border: "1px solid #cbd5e1", boxSizing: "border-box" },
  button: { padding: "12px 18px", border: "none", borderRadius: 12, background: "#16a34a", color: "#fff", fontWeight: 900, cursor: "pointer" },
  summary: { marginTop: 20, padding: 14, background: "#f8fafc", borderRadius: 12 },
  msg: { marginTop: 14, color: "#0f766e", fontWeight: 900 },
  tableWrap: { marginTop: 20, overflowX: "auto" },
  table: { width: "100%", minWidth: 760, borderCollapse: "collapse" },
  th: { padding: 12, background: "#eff6ff", border: "1px solid #e5e7eb", textAlign: "center" },
  td: { padding: 12, border: "1px solid #e5e7eb", textAlign: "center" },
};
