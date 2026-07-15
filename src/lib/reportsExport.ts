import * as XLSX from "xlsx";
import type {
  DailyAttendancePoint,
  ReportsSummary,
  StudentReportRow,
  TopAbsentGrade,
  TopAbsentLesson,
  TopCommittedSection,
  TopTeacherSubmission,
} from "@/lib/reports";

export type ReportExportPayload = {
  filtersLabel: string;
  summary: ReportsSummary;
  daily: DailyAttendancePoint[];
  topAbsentGrades: TopAbsentGrade[];
  topCommittedSections: TopCommittedSection[];
  topTeacherSubmissions: TopTeacherSubmission[];
  topAbsentLessons: TopAbsentLesson[];
  absentStudents: StudentReportRow[];
  committedStudents: StudentReportRow[];
};

const FILE_STAMP = () => new Date().toISOString().slice(0, 10);

function summarySheetRows(summary: ReportsSummary, filtersLabel: string) {
  return [
    { "المؤشر": "الفلاتر المطبّقة", "القيمة": filtersLabel || "بدون فلاتر" },
    { "المؤشر": "إجمالي الطلاب", "القيمة": summary.totalStudents },
    { "المؤشر": "الحاضرون", "القيمة": summary.presentCount },
    { "المؤشر": "الغائبون (الإجمالي)", "القيمة": summary.absentCount + summary.excusedCount },
    { "المؤشر": "الغياب بعذر", "القيمة": summary.excusedCount },
    { "المؤشر": "الغياب بدون عذر", "القيمة": summary.absentCount },
    { "المؤشر": "المتأخرون", "القيمة": summary.lateCount },
    { "المؤشر": "نسبة الحضور %", "القيمة": summary.attendanceRate },
    { "المؤشر": "نسبة الغياب %", "القيمة": summary.absenceRate },
  ];
}

function studentRows(rows: StudentReportRow[]) {
  return rows.map((r) => ({
    "الاسم": r.studentName,
    "الصف": r.grade,
    "الشعبة": r.section,
    "عدد مرات الغياب": r.absentCount,
    "عدد مرات التأخر": r.lateCount,
    "عدد مرات الاستئذان": r.excusedCount,
    "نسبة الالتزام %": r.commitmentRate,
  }));
}

export function exportReportToExcel(payload: ReportExportPayload) {
  const book = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(summarySheetRows(payload.summary, payload.filtersLabel)), "الملخص");

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(
      payload.daily.map((d) => ({
        "التاريخ": d.day,
        "حاضر": d.present,
        "غائب": d.absent,
        "متأخر": d.late,
        "مستأذن": d.excused,
        "الإجمالي": d.total,
      }))
    ),
    "الحضور اليومي"
  );

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(
      payload.topAbsentGrades.map((g) => ({ "الصف": g.grade, "عدد الغياب": g.absentCount, "الإجمالي": g.totalCount, "نسبة الغياب %": g.absenceRate }))
    ),
    "أكثر الصفوف غياباً"
  );

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(
      payload.topCommittedSections.map((s) => ({
        "الصف": s.grade,
        "الشعبة": s.section,
        "عدد الحضور": s.presentCount,
        "الإجمالي": s.totalCount,
        "نسبة الالتزام %": s.commitmentRate,
      }))
    ),
    "أكثر الشعب التزاماً"
  );

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(
      payload.topTeacherSubmissions.map((t) => ({
        "المعلم": t.teacherName,
        "عدد الحصص المرفوعة": t.submittedCount,
        "إجمالي الحصص": t.totalCount,
        "نسبة الرفع %": t.submissionRate,
      }))
    ),
    "أكثر المعلمين رفعاً"
  );

  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.json_to_sheet(
      payload.topAbsentLessons.map((l) => ({
        "الحصة": l.lesson,
        "المادة": l.subjectName ?? "-",
        "عدد الغياب": l.absentCount,
        "الإجمالي": l.totalCount,
        "نسبة الغياب %": l.absenceRate,
      }))
    ),
    "أكثر الحصص غياباً"
  );

  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(studentRows(payload.absentStudents)), "أكثر الطلاب غياباً");
  XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(studentRows(payload.committedStudents)), "أكثر الطلاب التزاماً");

  XLSX.writeFile(book, `تقرير-الحضور-${FILE_STAMP()}.xlsx`);
}

export function exportReportToCsv(payload: ReportExportPayload) {
  const rows: Record<string, string | number>[] = [];

  rows.push({ "القسم": "الملخص" });
  for (const row of summarySheetRows(payload.summary, payload.filtersLabel)) {
    rows.push({ "القسم": "", ...row });
  }

  rows.push({ "القسم": "" });
  rows.push({ "القسم": "أكثر الطلاب غياباً" });
  for (const row of studentRows(payload.absentStudents)) {
    rows.push({ "القسم": "", ...row });
  }

  rows.push({ "القسم": "" });
  rows.push({ "القسم": "أكثر الطلاب التزاماً" });
  for (const row of studentRows(payload.committedStudents)) {
    rows.push({ "القسم": "", ...row });
  }

  const sheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(sheet);
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `تقرير-الحضور-${FILE_STAMP()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Renders `element` (a hidden print-layout DOM node) to a raster image via
 * html2canvas and slices it across A4 pages in jsPDF. Arabic text is drawn by
 * the browser itself (correct shaping/bidi) then embedded as an image, which
 * sidesteps jsPDF's lack of native Arabic text-shaping support.
 *
 * Uses the `html2canvas-pro` fork, not plain `html2canvas`: Tailwind v4's
 * generated CSS expresses colors via modern `oklch()`/`lab()` functions,
 * which upstream html2canvas's CSS color parser cannot read at all (every
 * export failed with "Attempting to parse an unsupported color function
 * lab"). html2canvas-pro is a drop-in replacement that adds support for
 * those color functions and is otherwise API-compatible.
 */
export async function exportElementToPdf(element: HTMLElement, filenamePrefix: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);

  const canvas = await html2canvas(element, { scale: 2, backgroundColor: "#ffffff", useCORS: true });

  const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();

  const imgWidth = pageWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;
  const imgData = canvas.toDataURL("image/png");

  pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save(`${filenamePrefix}-${FILE_STAMP()}.pdf`);
}
