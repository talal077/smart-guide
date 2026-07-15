import * as XLSX from "xlsx";

export type AnalyticsExportPayload = {
  overview: { title: string; value: number | string; note: string }[];
  weeklyAbsence: { day: string; value: number }[];
  gradeComparison: { grade: string; total: number; present: number; absent: number; rate: number }[];
  riskLevels: { title: string; value: number }[];
  teacherCommitment: { teacher: string; submitted: number; total: number; rate: number }[];
  topAbsentStudents: { name: string; className: string; count: number; risk: string }[];
  committedStudents: { name: string; className: string; rate: string }[];
};

const FILE_STAMP = () => new Date().toISOString().slice(0, 10);

export function exportAnalyticsToExcel(payload: AnalyticsExportPayload) {
  const book = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(payload.overview.map((o) => ({ "المؤشر": o.title, "القيمة": o.value, "ملاحظة": o.note }))),
    "نظرة عامة"
  );

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(payload.weeklyAbsence.map((w) => ({ "اليوم": w.day, "عدد الغياب": w.value }))),
    "الغياب الأسبوعي"
  );

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(
      payload.gradeComparison.map((g) => ({ "الصف": g.grade, "الإجمالي": g.total, "حاضر": g.present, "غائب": g.absent, "نسبة الحضور %": g.rate }))
    ),
    "مقارنة الصفوف"
  );

  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(payload.riskLevels.map((r) => ({ "المستوى": r.title, "عدد الطلاب": r.value }))), "مؤشر الخطورة");

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(
      payload.teacherCommitment.map((t) => ({ "المعلم": t.teacher, "حصص مرفوعة": t.submitted, "إجمالي الحصص": t.total, "نسبة الالتزام %": t.rate }))
    ),
    "التزام المعلمين"
  );

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(payload.topAbsentStudents.map((s) => ({ "الاسم": s.name, "الصف/الشعبة": s.className, "أيام الغياب": s.count, "مستوى الخطورة": s.risk }))),
    "أكثر الطلاب غياباً"
  );

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(payload.committedStudents.map((s) => ({ "الاسم": s.name, "الصف/الشعبة": s.className, "نسبة الحضور": s.rate }))),
    "أكثر الطلاب التزاماً"
  );

  XLSX.writeFile(book, `تحليلات-الحضور-${FILE_STAMP()}.xlsx`);
}
