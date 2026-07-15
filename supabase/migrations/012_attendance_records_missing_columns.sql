-- The live public.attendance_records table predates migrations 002/003's
-- CREATE TABLE IF NOT EXISTS "safety net" (same pattern as sections/9 and
-- teacher_assignments/10 before it): it already existed with fewer columns, so
-- the IF NOT EXISTS guard skipped creation and the table never gained the
-- columns src/lib/attendance.ts and src/modules/attendance/repository already
-- read/write unconditionally: teacher_id, teacher_name, attendance_time,
-- created_at. This is not just a Demo Mode problem -- real teachers saving
-- attendance through /attendance today hit the same missing-column failure
-- the demo generator just hit.

ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS teacher_id uuid;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS teacher_name text;
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS attendance_time timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.attendance_records ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
