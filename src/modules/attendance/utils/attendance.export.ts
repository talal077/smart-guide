import * as XLSX from "xlsx";
import type { AttendanceRecord, AttendanceStudent } from "../types";
import { getAttendanceStatusLabel } from "./attendance.utils";

interface ExportContext {
  teacherName: string;
  subjectName: string;
  grade: string;
  section: string;
  date: string;
  lessonName: string;
}

function buildRows(students: AttendanceStudent[], records: AttendanceRecord[]) {
  return students.map((student, index) => {
    const record = records.find((item) => item.studentId === student.id);
    return {
      "الرقم": index + 1,
      "الهوية": student.entryCode ?? "",
      "الاسم": student.name,
      "حالة الحضور": record ? getAttendanceStatusLabel(record.status) : getAttendanceStatusLabel("present"),
      "وقت التسجيل": record?.attendanceTime ? new Date(record.attendanceTime).toLocaleTimeString("ar-EG") : "",
      "الملاحظات": record?.notes ?? "",
    };
  });
}

export function exportAttendanceToExcel(students: AttendanceStudent[], records: AttendanceRecord[], context: ExportContext) {
  const rows = buildRows(students, records);
  const worksheet = XLSX.utils.json_to_sheet(rows);
  worksheet["!cols"] = [{ wch: 6 }, { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 28 }];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "التحضير");

  const filename = `تحضير-${context.grade}-${context.section}-${context.date}.xlsx`;
  XLSX.writeFile(workbook, filename);
}

export function exportAttendanceToPdf(students: AttendanceStudent[], records: AttendanceRecord[], context: ExportContext) {
  const rows = buildRows(students, records);

  const printWindow = window.open("", "_blank", "width=900,height=1200");
  if (!printWindow) return;

  const tableRows = rows
    .map(
      (row) => `
        <tr>
          <td>${row["الرقم"]}</td>
          <td>${row["الهوية"]}</td>
          <td>${row["الاسم"]}</td>
          <td>${row["حالة الحضور"]}</td>
          <td>${row["وقت التسجيل"]}</td>
          <td>${row["الملاحظات"]}</td>
        </tr>`
    )
    .join("");

  printWindow.document.write(`
    <!DOCTYPE html>
    <html dir="rtl" lang="ar">
      <head>
        <meta charset="utf-8" />
        <title>تحضير الحصة</title>
        <style>
          body { font-family: Tahoma, Arial, sans-serif; padding: 24px; color: #0f172a; }
          h1 { font-size: 18px; margin-bottom: 4px; }
          p { font-size: 13px; color: #475569; margin: 2px 0; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 12px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: center; }
          th { background: #f1f5f9; }
        </style>
      </head>
      <body>
        <h1>تحضير الحصة - ${context.subjectName}</h1>
        <p>المعلم: ${context.teacherName}</p>
        <p>الصف/الشعبة: ${context.grade} - ${context.section}</p>
        <p>التاريخ: ${context.date} — ${context.lessonName}</p>
        <table>
          <thead>
            <tr>
              <th>الرقم</th>
              <th>الهوية</th>
              <th>الاسم</th>
              <th>حالة الحضور</th>
              <th>وقت التسجيل</th>
              <th>الملاحظات</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `);

  printWindow.document.close();
  printWindow.focus();
  printWindow.print();
}
