-- =============================================================================
--  Personal Hub / Life OS — Supabase schema
-- -----------------------------------------------------------------------------
--  Paste this whole file into Supabase → SQL Editor → Run.
--  It is idempotent: safe to run more than once.
--
--  Tables:   events · projects · project_tasks · transactions
--  Security: Row Level Security on every table. Each row belongs to exactly
--            one auth user (user_id) and is only visible/editable by them.
-- =============================================================================

create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- -----------------------------------------------------------------------------
--  Helper: keep `updated_at` fresh on every UPDATE
-- -----------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- =============================================================================
--  1. EVENTS — calendar & agenda
-- =============================================================================
create table if not exists public.events (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title         text not null check (char_length(title) between 1 and 200),
  description   text not null default '',
  start_at      timestamptz not null,
  end_at        timestamptz not null,
  category      text not null default 'personal'
                check (category in ('work', 'master', 'research', 'training', 'personal')),
  is_completed  boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint events_time_order check (end_at >= start_at)
);

comment on table public.events is 'Calendar events and day tasks.';

create index if not exists events_user_start_idx on public.events (user_id, start_at);

-- =============================================================================
--  2. PROJECTS — project tracker
-- =============================================================================
create table if not exists public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 200),
  area        text not null default 'personal'
              check (area in ('research', 'engineering', 'academic', 'personal')),
  status      text not null default 'backlog'
              check (status in ('backlog', 'in_progress', 'review', 'completed')),
  progress    integer not null default 0 check (progress between 0 and 100),
  priority    text not null default 'medium'
              check (priority in ('low', 'medium', 'high')),
  deadline    date,
  repo_url    text,
  notes       text not null default '',
  updated_at  timestamptz not null default now()
);

comment on table public.projects is 'Projects with Kanban status, progress and technical notes.';

create index if not exists projects_user_status_idx on public.projects (user_id, status);
create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- =============================================================================
--  3. PROJECT_TASKS — sub-tasks / milestones per project
-- =============================================================================
create table if not exists public.project_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 300),
  is_done     boolean not null default false,
  created_at  timestamptz not null default now()
);

comment on table public.project_tasks is 'Sub-tasks and milestones belonging to a project.';

create index if not exists project_tasks_project_idx on public.project_tasks (project_id, created_at);
create index if not exists project_tasks_user_idx on public.project_tasks (user_id);

-- =============================================================================
--  4. TRANSACTIONS — personal finance ledger
-- =============================================================================
create table if not exists public.transactions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null default current_date,
  type        text not null check (type in ('income', 'expense', 'investment')),
  category    text not null default 'other',
  concept     text not null default '',
  amount      numeric(10, 2) not null check (amount >= 0),
  account     text not null default 'main',
  created_at  timestamptz not null default now()
);

comment on table public.transactions is 'Income, expenses and investments. Amounts are always positive; `type` gives the sign.';

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_user_type_idx on public.transactions (user_id, type);

-- =============================================================================
--  ROW LEVEL SECURITY
--  Strict per-user isolation: auth.uid() = user_id for every operation.
--  The anon key alone can read nothing.
-- =============================================================================
alter table public.events         enable row level security;
alter table public.projects       enable row level security;
alter table public.project_tasks  enable row level security;
alter table public.transactions   enable row level security;

-- ---- events -----------------------------------------------------------------
drop policy if exists "events_select_own" on public.events;
drop policy if exists "events_insert_own" on public.events;
drop policy if exists "events_update_own" on public.events;
drop policy if exists "events_delete_own" on public.events;

create policy "events_select_own" on public.events
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "events_insert_own" on public.events
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "events_update_own" on public.events
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "events_delete_own" on public.events
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---- projects ---------------------------------------------------------------
drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_own" on public.projects
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "projects_insert_own" on public.projects
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "projects_update_own" on public.projects
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "projects_delete_own" on public.projects
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---- project_tasks ----------------------------------------------------------
-- Insert/update also require the parent project to belong to the same user,
-- so nobody can attach tasks to someone else's project id.
drop policy if exists "project_tasks_select_own" on public.project_tasks;
drop policy if exists "project_tasks_insert_own" on public.project_tasks;
drop policy if exists "project_tasks_update_own" on public.project_tasks;
drop policy if exists "project_tasks_delete_own" on public.project_tasks;

create policy "project_tasks_select_own" on public.project_tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "project_tasks_insert_own" on public.project_tasks
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
  );
create policy "project_tasks_update_own" on public.project_tasks
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid()))
  );
create policy "project_tasks_delete_own" on public.project_tasks
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---- transactions -----------------------------------------------------------
drop policy if exists "transactions_select_own" on public.transactions;
drop policy if exists "transactions_insert_own" on public.transactions;
drop policy if exists "transactions_update_own" on public.transactions;
drop policy if exists "transactions_delete_own" on public.transactions;

create policy "transactions_select_own" on public.transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "transactions_insert_own" on public.transactions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "transactions_update_own" on public.transactions
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "transactions_delete_own" on public.transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- =============================================================================
--  REALTIME (optional but recommended)
--  Lets the app receive live changes across devices (MacBook ⇄ iPhone).
--  RLS still applies to realtime: you only receive your own rows.
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['events', 'projects', 'project_tasks', 'transactions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
