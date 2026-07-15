import type { AttendanceRecord, AttendanceStatus, AttendanceStudent } from "../types";

interface AttendanceStudentRowProps {
  index: number;
  student: AttendanceStudent;
  record?: AttendanceRecord;
  disabled?: boolean;
  onStatusChange: (student: AttendanceStudent, status: AttendanceStatus) => void;
  onNotesChange: (student: AttendanceStudent, notes: string) => void;
}

const statusOptions: { value: AttendanceStatus; label: string }[] = [
  { value: "present", label: "حاضر" },
  { value: "absent", label: "غائب" },
  { value: "late", label: "متأخر" },
  { value: "excused", label: "مستأذن" },
];

export function AttendanceStudentRow({ index, student, record, disabled, onStatusChange, onNotesChange }: AttendanceStudentRowProps) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-3 py-2 text-center text-sm text-slate-500">{index + 1}</td>
      <td className="px-3 py-2 text-center text-sm text-slate-600">{student.entryCode || "—"}</td>
      <td className="px-3 py-2 text-sm font-medium text-slate-900">{student.name}</td>
      <td className="px-3 py-2 text-center">
        <select
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100"
          value={record?.status ?? "present"}
          disabled={disabled}
          onChange={(event) => onStatusChange(student, event.target.value as AttendanceStatus)}
        >
          {statusOptions.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </td>
      <td className="px-3 py-2 text-center text-xs text-slate-500">
        {record?.attendanceTime ? new Date(record.attendanceTime).toLocaleTimeString("ar-EG") : "—"}
      </td>
      <td className="px-3 py-2">
        <input
          className="w-full rounded border border-slate-300 px-2 py-1 text-sm disabled:bg-slate-100"
          value={record?.notes ?? ""}
          disabled={disabled}
          placeholder="ملاحظة"
          onChange={(event) => onNotesChange(student, event.target.value)}
        />
      </td>
    </tr>
  );
}
