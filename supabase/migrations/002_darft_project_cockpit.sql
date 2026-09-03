-- DARFT project cockpit: persistent tasks and journal for project management.
-- Applied to the shared Wikignose Supabase project on 2026-09-03.

create table if not exists public.darft_project_tasks (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  section text not null,
  title text not null,
  brief text not null,
  why_it_matters text,
  priority text not null default 'next' check (priority in ('now','next','later')),
  status text not null default 'todo' check (status in ('todo','in_progress','waiting','done')),
  owner_answer text not null default '',
  assistant_note text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.darft_project_journal (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null default '',
  kind text not null default 'note' check (kind in ('note','decision','question','idea')),
  is_resolved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create or replace function public.darft_touch_project_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  new.updated_by = (select auth.uid());
  return new;
end;
$$;

drop trigger if exists darft_project_tasks_touch on public.darft_project_tasks;
create trigger darft_project_tasks_touch before update on public.darft_project_tasks
for each row execute function public.darft_touch_project_updated_at();

drop trigger if exists darft_project_journal_touch on public.darft_project_journal;
create trigger darft_project_journal_touch before update on public.darft_project_journal
for each row execute function public.darft_touch_project_updated_at();

alter table public.darft_project_tasks enable row level security;
alter table public.darft_project_journal enable row level security;
revoke all on public.darft_project_tasks from anon;
revoke all on public.darft_project_journal from anon;
grant select, insert, update on public.darft_project_tasks to authenticated;
grant select, insert, update on public.darft_project_journal to authenticated;

drop policy if exists darft_team_manage_project_tasks on public.darft_project_tasks;
create policy darft_team_manage_project_tasks on public.darft_project_tasks
for all to authenticated using (public.is_darft_admin()) with check (public.is_darft_admin());

drop policy if exists darft_team_manage_project_journal on public.darft_project_journal;
create policy darft_team_manage_project_journal on public.darft_project_journal
for all to authenticated using (public.is_darft_admin()) with check (public.is_darft_admin());

-- Seed data is inserted by the applied migration. Future project tasks can be added from admin.html.
