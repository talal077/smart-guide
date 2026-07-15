interface AttendanceSummaryCardProps {
  title: string;
  value: number;
}

export function AttendanceSummaryCard({ title, value }: AttendanceSummaryCardProps) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm text-slate-500">{title}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p>
    </div>
  );
}
