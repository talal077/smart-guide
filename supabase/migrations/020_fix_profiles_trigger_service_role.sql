-- CRITICAL FIX for migration 019's protect_profiles_self_update() trigger,
-- found via live verification immediately after 019 was applied.
--
-- Root cause: there is a pre-existing trigger (not introduced by this project's
-- tracked migrations — provisioned directly in the Supabase dashboard, same
-- category as the other "hand-created" objects documented in migration 014's
-- header) that auto-inserts a public.profiles row with role='teacher' whenever
-- a new auth.users row is created. Verified live: calling
-- admin.auth.admin.createUser(...) alone (service role, no profiles write at
-- all) already produces a profiles row with role='teacher'.
--
-- migration 019's protect_profiles_self_update() trigger fires on every UPDATE
-- to public.profiles, including ones made by the service role (RLS bypass does
-- NOT bypass triggers — those are two independent mechanisms). Inside the
-- trigger, auth.uid() is NULL for a service-role connection (there is no user
-- JWT). The original condition was:
--   IF v_role IS DISTINCT FROM 'principal' AND v_role IS DISTINCT FROM 'admin'
--      AND v_role IS DISTINCT FROM 'vice_principal' THEN <block role changes>
-- NULL IS DISTINCT FROM 'principal' is TRUE (IS DISTINCT FROM is NULL-safe), so
-- ALL three conditions were true for a NULL v_role, meaning the protection
-- treated "unknown/service-role actor" the same as "known non-manager" and
-- blocked the role change. Verified live: a service-role upsert that only
-- intended to set full_name/role/is_active/is_blocked on a fresh user reliably
-- fails with "P0001: غير مصرح لك بتغيير الدور أو حالة التفعيل أو الحظر." even
-- though it's changing nothing but a still-default 'teacher' row it just
-- caused to exist. This breaks any legitimate backend/service-role role
-- assignment (this project's own test infrastructure, and any future
-- server-side admin/user-management feature) even though service_role is
-- supposed to be fully trusted (that is the entire point of RLS-bypass).
--
-- Fix: only enforce the self-service restriction when the actor is a KNOWN,
-- authenticated NON-manager (v_role resolves to a real role like 'teacher' or
-- 'student'). When v_role IS NULL — either a service-role connection (no JWT,
-- no auth.uid()), or an anon/unauthenticated request RLS's own USING clauses
-- already fully block before the trigger is ever reached — do not add a
-- trigger-level restriction on top of that. This does not reopen the
-- privilege-escalation hole migration 019 closed: a genuinely authenticated
-- non-manager (teacher/student) always has a non-NULL auth.uid() resolving to
-- their own real role, so the protection still applies to exactly the actor
-- class it was designed to stop.
--
-- Idempotent: CREATE OR REPLACE FUNCTION. Safe to run any number of times.
-- Does not touch RLS policies, tables, or any other object from migration 019.

CREATE OR REPLACE FUNCTION public.protect_profiles_self_update()
RETURNS trigger AS $$
DECLARE
  v_role text;
BEGIN
  v_role := (SELECT role FROM public.profiles WHERE id = auth.uid());

  IF v_role IS NOT NULL AND v_role NOT IN ('principal', 'admin', 'vice_principal') THEN
    IF NEW.role IS DISTINCT FROM OLD.role
       OR NEW.is_active IS DISTINCT FROM OLD.is_active
       OR NEW.is_blocked IS DISTINCT FROM OLD.is_blocked
       OR NEW.id IS DISTINCT FROM OLD.id
    THEN
      RAISE EXCEPTION 'غير مصرح لك بتغيير الدور أو حالة التفعيل أو الحظر.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Trigger itself is unchanged (still BEFORE UPDATE, still the same name) — no
-- DROP/CREATE TRIGGER needed, CREATE OR REPLACE FUNCTION updates the body of
-- the function the existing trigger already points to.
