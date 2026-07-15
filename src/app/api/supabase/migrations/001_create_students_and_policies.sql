create extension if not exists pgcrypto;

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  grade text,
  section text,
  entry_code text
);

do $$
begin
  if not exists (
    select 1 from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    where c.conname = 'students_entry_code_unique'
      and t.relname = 'students'
  ) then
    begin
      alter table public.students
      add constraint students_entry_code_unique unique (entry_code);
    exception when duplicate_object then
      null;
    end;
  end if;
end $$;

alter table public.students enable row level security;

drop policy if exists students_select_policy on public.students;
drop policy if exists students_insert_policy on public.students;
drop policy if exists students_update_policy on public.students;
drop policy if exists students_delete_policy on public.students;
drop policy if exists select_authenticated on public.students;
drop policy if exists insert_admin on public.students;
drop policy if exists update_admin on public.students;
drop policy if exists delete_admin on public.students;

create policy students_select_policy
on public.students
for select
to authenticated
using (true);
