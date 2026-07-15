interface AttendanceEmptyStateProps {
  title?: string;
  description?: string;
}

export function AttendanceEmptyState({ title = "لا توجد بيانات", description = "ابدأ بإضافة تحضير جديد." }: AttendanceEmptyStateProps) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      <p className="mt-2 text-sm text-slate-500">{description}</p>
    </div>
  );
}
