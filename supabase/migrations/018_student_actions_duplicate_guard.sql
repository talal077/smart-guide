-- Prevents two concurrent pending student_actions for the same student, action
-- type, date, and lesson (e.g. two "استدعاء" requests for the same student in
-- the same class period both sitting "pending" at once). The app already
-- checks for this before insert/update, but only a DB constraint closes the
-- race window between two staff members submitting at the same moment.
--
-- Partial unique index (applies only to status = 'pending'), so a request
-- that has moved on to completed/postponed/cancelled no longer blocks a fresh
-- request for the same student/type/date/lesson slot.
--
-- Idempotent: CREATE UNIQUE INDEX IF NOT EXISTS. Safe to run on an empty or
-- populated student_actions table — it only fails if two *pending* rows for
-- the same slot already exist, which the app has never allowed to happen.

CREATE UNIQUE INDEX IF NOT EXISTS student_actions_pending_dup_guard
  ON public.student_actions (student_id, type, action_date, lesson)
  WHERE status = 'pending';
