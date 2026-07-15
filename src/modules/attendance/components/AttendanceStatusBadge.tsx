import type { AttendanceStatus } from "../types";

interface AttendanceStatusBadgeProps {
  status: AttendanceStatus;
}

const styles: Record<AttendanceStatus, string> = {
  present: "bg-green-100 text-green-700",
  absent: "bg-red-100 text-red-700",
  late: "bg-amber-100 text-amber-700",
  excused: "bg-blue-100 text-blue-700",
};

const labels: Record<AttendanceStatus, string> = {
  present: "حاضر",
  absent: "غائب",
  late: "متأخر",
  excused: "مستأذن",
};

export function AttendanceStatusBadge({ status }: AttendanceStatusBadgeProps) {
  return <span className={`rounded-full px-2 py-1 text-sm font-medium ${styles[status]}`}>{labels[status]}</span>;
}
