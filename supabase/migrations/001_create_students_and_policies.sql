-- Create students table if it does not exist
CREATE TABLE IF NOT EXISTS public.students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text,
  grade text,
  section text,
  entry_code text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add unique constraint for entry_code if not present
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON c.conrelid = t.oid
    WHERE c.conname = 'students_entry_code_unique' AND t.relname = 'students'
  ) THEN
    BEGIN
      ALTER TABLE public.students ADD CONSTRAINT students_entry_code_unique UNIQUE (entry_code);
    EXCEPTION WHEN duplicate_object THEN
      -- ignore
    END;
  END IF;
END$$;

-- Enable Row Level Security
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;

-- Policy: allow authenticated users to SELECT students
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE polname = 'select_authenticated' AND tablename = 'students'
  ) THEN
    CREATE POLICY select_authenticated ON public.students
      FOR SELECT USING (auth.uid() IS NOT NULL);
  END IF;
END$$;

-- NOTES:
-- 1) Service Role bypasses RLS; server-side routes using the service role key can INSERT/UPDATE/DELETE regardless of policies.
-- 2) The policies above allow only users with jwt claim `role = 'admin'` to perform writes from client-side. Adjust profiles/roles as needed.
