-- =============================================================================
--  Personal Hub / Life OS — Supabase schema
-- -----------------------------------------------------------------------------
--  Paste this whole file into Supabase → SQL Editor → Run.
--  It is idempotent: safe to run more than once.
--
--  Tables:   events · projects · project_tasks · transactions · categories · accounts · work_logs ·
--            study_programs · study_subjects · study_assessments · study_files ·
--            tcg_decks · vgc_teams · tournaments · tournament_rounds ·
--            race_goals · run_plan · runs · run_workouts · notification_log
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
  category      text not null default 'personal',
  is_completed  boolean not null default false,
  all_day       boolean not null default false,
  series_id     uuid,  -- events created together by "Repetir" share this id
  created_at    timestamptz not null default now(),
  constraint events_time_order check (end_at >= start_at)
);

comment on table public.events is 'Calendar events and day tasks.';

-- Upgrade path: all-day events, series and the vacation / holiday categories.
alter table public.events add column if not exists all_day boolean not null default false;
alter table public.events add column if not exists series_id uuid;
comment on column public.events.series_id is 'Groups events created in bulk (e.g. work Mon–Thu 8:00–17:30) so they can be edited or deleted together.';
alter table public.events drop constraint if exists events_category_check;
alter table public.events
  add constraint events_category_check
  check (category in ('work', 'master', 'research', 'training', 'personal', 'vacation', 'holiday'));

create index if not exists events_user_start_idx on public.events (user_id, start_at);
create index if not exists events_series_idx on public.events (user_id, series_id) where series_id is not null;

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
  description text not null default '',
  start_date  date,
  deadline    date,  -- end date
  repo_url    text,
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint projects_dates_order check (deadline is null or start_date is null or deadline >= start_date)
);

comment on table public.projects is 'Projects with Kanban status, progress, description, dates and technical notes.';
comment on column public.projects.deadline is 'End date of the project.';

-- Upgrade path for databases created before description/start_date existed.
alter table public.projects add column if not exists description text not null default '';
alter table public.projects add column if not exists start_date date;
alter table public.projects add column if not exists created_at timestamptz not null default now();
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_dates_order') then
    alter table public.projects
      add constraint projects_dates_order check (deadline is null or start_date is null or deadline >= start_date);
  end if;
end;
$$;

create index if not exists projects_user_status_idx on public.projects (user_id, status);
create index if not exists projects_user_updated_idx on public.projects (user_id, updated_at desc);

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- =============================================================================
--  3. PROJECT_TASKS — tasks shown on the Kanban
--  Either a sub-task of a project (project_id) or a standalone task with a
--  category ('work' = day-job backlog, 'personal' = errands).
-- =============================================================================
create table if not exists public.project_tasks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid references public.projects (id) on delete cascade,
  category    text check (category in ('work', 'personal')),
  title       text not null check (char_length(title) between 1 and 300),
  status      text not null default 'todo'
              check (status in ('todo', 'in_progress', 'review', 'done')),
  is_done     boolean not null default false,  -- kept in sync with status = 'done'
  jira_key    text check (jira_key is null or char_length(jira_key) between 1 and 40),
  description text not null default '',
  priority    text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  start_date  date,
  due_date    date,
  created_at  timestamptz not null default now(),
  constraint project_tasks_has_owner check (project_id is not null or category is not null),
  constraint project_tasks_dates_order check (due_date is null or start_date is null or due_date >= start_date)
);

comment on table public.project_tasks is 'Kanban tasks: project sub-tasks or standalone work/personal tasks.';
comment on column public.project_tasks.jira_key is 'Optional Jira issue key (e.g. PLAT-142), used by the work log.';

-- Upgrade path: standalone tasks + Jira key.
alter table public.project_tasks alter column project_id drop not null;
alter table public.project_tasks add column if not exists category text;
alter table public.project_tasks add column if not exists jira_key text;
alter table public.project_tasks add column if not exists description text not null default '';
alter table public.project_tasks add column if not exists priority text not null default 'medium';
alter table public.project_tasks add column if not exists start_date date;
alter table public.project_tasks add column if not exists due_date date;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_tasks_category_check') then
    alter table public.project_tasks
      add constraint project_tasks_category_check check (category in ('work', 'personal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_tasks_has_owner') then
    alter table public.project_tasks
      add constraint project_tasks_has_owner check (project_id is not null or category is not null);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_tasks_priority_check') then
    alter table public.project_tasks
      add constraint project_tasks_priority_check check (priority in ('low', 'medium', 'high'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_tasks_dates_order') then
    alter table public.project_tasks
      add constraint project_tasks_dates_order check (due_date is null or start_date is null or due_date >= start_date);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'project_tasks_jira_key_check') then
    alter table public.project_tasks
      add constraint project_tasks_jira_key_check check (jira_key is null or char_length(jira_key) between 1 and 40);
  end if;
end;
$$;

-- Upgrade path for databases created before the task Kanban existed.
alter table public.project_tasks add column if not exists status text not null default 'todo';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'project_tasks_status_check') then
    alter table public.project_tasks
      add constraint project_tasks_status_check check (status in ('todo', 'in_progress', 'review', 'done'));
  end if;
end;
$$;
update public.project_tasks set status = 'done' where is_done and status <> 'done';

create index if not exists project_tasks_user_status_idx on public.project_tasks (user_id, status);

-- Keep is_done and status consistent whichever one the client changes.
create or replace function public.sync_task_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'INSERT' then
    if new.is_done and new.status <> 'done' then new.status := 'done'; end if;
    new.is_done := new.status = 'done';
  elsif new.status is distinct from old.status then
    new.is_done := new.status = 'done';
  elsif new.is_done is distinct from old.is_done then
    new.status := case when new.is_done then 'done' when old.status = 'done' then 'todo' else old.status end;
  end if;
  return new;
end;
$$;

drop trigger if exists project_tasks_sync_status on public.project_tasks;
create trigger project_tasks_sync_status
  before insert or update on public.project_tasks
  for each row execute function public.sync_task_status();

create index if not exists project_tasks_project_idx on public.project_tasks (project_id, created_at);
create index if not exists project_tasks_user_idx on public.project_tasks (user_id);

-- =============================================================================
--  4. TRANSACTIONS — personal finance ledger
-- =============================================================================
-- Upgrade path: recurring tasks (the app creates the next one when a task is completed).
alter table public.project_tasks add column if not exists recurrence text check (recurrence in ('daily', 'weekdays', 'weekly', 'biweekly', 'monthly', 'yearly'));

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

comment on table public.transactions is 'Income, expenses and savings. Amounts are always positive; `type` gives the sign. type = investment is shown as "Saved" in the UI.';

create index if not exists transactions_user_date_idx on public.transactions (user_id, date desc);
create index if not exists transactions_user_type_idx on public.transactions (user_id, type);

-- =============================================================================
--  5. CATEGORIES — user-defined finance categories (per transaction type)
--  transactions.category stores the category name (lower-case), so deleting a
--  category never touches historical transactions.
-- =============================================================================
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  type        text not null check (type in ('income', 'expense', 'investment')),
  color       text not null default 'slate',
  created_at  timestamptz not null default now(),
  constraint categories_unique_name unique (user_id, type, name)
);

comment on table public.categories is 'Finance categories defined by each user.';

-- Upgrade path: monthly budget per category.
alter table public.categories add column if not exists budget numeric(12, 2) check (budget is null or budget >= 0);

-- "Concepts that contain X are Y": used by the app, the bank import and Apple Pay.
create table if not exists public.category_rules (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  pattern     text not null check (char_length(pattern) between 2 and 120),
  type        text not null default 'expense' check (type in ('income', 'expense', 'investment')),
  category    text not null check (char_length(category) between 1 and 60),
  created_at  timestamptz not null default now()
);
create index if not exists category_rules_user_idx on public.category_rules (user_id);

-- Subscriptions and other charges that repeat.
create table if not exists public.bills (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 200),
  amount       numeric(12, 2) not null check (amount > 0),
  category     text not null default 'subscriptions',
  account      text not null default '',
  period       text not null default 'monthly' check (period in ('weekly', 'monthly', 'bimonthly', 'quarterly', 'yearly')),
  anchor_date  date not null,
  notify_days  integer not null default 1 check (notify_days between 0 and 30),
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);
create index if not exists bills_user_idx on public.bills (user_id);

create index if not exists categories_user_type_idx on public.categories (user_id, type);

-- =============================================================================
--  6. ACCOUNTS — bank accounts / cards. Exactly one can be the primary account.
--  transactions.account stores the account name.
--  A "Saved" transaction (type = 'investment') is a transfer from the primary
--  account into the account it is recorded on.
-- =============================================================================
create table if not exists public.accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 60),
  kind        text not null default 'checking'
              check (kind in ('checking', 'savings', 'credit', 'cash', 'investment')),
  color       text not null default 'sky',
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint accounts_unique_name unique (user_id, name)
);

comment on table public.accounts is 'Bank accounts, cards and wallets. One primary account per user.';

-- At most one primary account per user.
create unique index if not exists accounts_one_primary_idx on public.accounts (user_id) where is_primary;
create index if not exists accounts_user_idx on public.accounts (user_id);

-- =============================================================================
--  7. WORK_LOGS — daily work diary for filling in Jira hours at month end
-- =============================================================================
create table if not exists public.work_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date         date not null default current_date,
  hours        numeric(4, 2) not null check (hours > 0 and hours <= 24),
  description  text not null default '' check (char_length(description) <= 2000),
  jira_key     text check (jira_key is null or char_length(jira_key) between 1 and 40),
  task_id      uuid references public.project_tasks (id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.work_logs is 'What was worked on each day, how long and on which Jira issue.';

create index if not exists work_logs_user_date_idx on public.work_logs (user_id, date desc);
create index if not exists work_logs_task_idx on public.work_logs (task_id);

-- =============================================================================
--  ROW LEVEL SECURITY
--  Strict per-user isolation: auth.uid() = user_id for every operation.
--  The anon key alone can read nothing.
-- =============================================================================
alter table public.events         enable row level security;
alter table public.projects       enable row level security;
alter table public.project_tasks  enable row level security;
alter table public.transactions   enable row level security;
alter table public.categories     enable row level security;
alter table public.accounts       enable row level security;
alter table public.work_logs      enable row level security;

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
-- Insert/update also require the parent project (when there is one) to belong
-- to the same user, so nobody can attach tasks to someone else's project id.
drop policy if exists "project_tasks_select_own" on public.project_tasks;
drop policy if exists "project_tasks_insert_own" on public.project_tasks;
drop policy if exists "project_tasks_update_own" on public.project_tasks;
drop policy if exists "project_tasks_delete_own" on public.project_tasks;

create policy "project_tasks_select_own" on public.project_tasks
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "project_tasks_insert_own" on public.project_tasks
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (project_id is null
         or exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
  );
create policy "project_tasks_update_own" on public.project_tasks
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and (project_id is null
         or exists (select 1 from public.projects p where p.id = project_id and p.user_id = (select auth.uid())))
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

-- ---- categories -------------------------------------------------------------
drop policy if exists "categories_select_own" on public.categories;
drop policy if exists "categories_insert_own" on public.categories;
drop policy if exists "categories_update_own" on public.categories;
drop policy if exists "categories_delete_own" on public.categories;

create policy "categories_select_own" on public.categories
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "categories_insert_own" on public.categories
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "categories_update_own" on public.categories
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "categories_delete_own" on public.categories
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---- accounts ---------------------------------------------------------------
drop policy if exists "accounts_select_own" on public.accounts;
drop policy if exists "accounts_insert_own" on public.accounts;
drop policy if exists "accounts_update_own" on public.accounts;
drop policy if exists "accounts_delete_own" on public.accounts;

create policy "accounts_select_own" on public.accounts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "accounts_insert_own" on public.accounts
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "accounts_update_own" on public.accounts
  for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "accounts_delete_own" on public.accounts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---- work_logs --------------------------------------------------------------
drop policy if exists "work_logs_select_own" on public.work_logs;
drop policy if exists "work_logs_insert_own" on public.work_logs;
drop policy if exists "work_logs_update_own" on public.work_logs;
drop policy if exists "work_logs_delete_own" on public.work_logs;

create policy "work_logs_select_own" on public.work_logs
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "work_logs_insert_own" on public.work_logs
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and (task_id is null
         or exists (select 1 from public.project_tasks t where t.id = task_id and t.user_id = (select auth.uid())))
  );
create policy "work_logs_update_own" on public.work_logs
  for update to authenticated using ((select auth.uid()) = user_id) with check (
    (select auth.uid()) = user_id
    and (task_id is null
         or exists (select 1 from public.project_tasks t where t.id = task_id and t.user_id = (select auth.uid())))
  );
create policy "work_logs_delete_own" on public.work_logs
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Atomically switch the primary account (avoids a window with two primaries).
create or replace function public.set_primary_account(account_id uuid)
returns void
language plpgsql
security invoker            -- runs with the caller's rights, so RLS still applies
set search_path = public
as $$
begin
  update public.accounts set is_primary = false where user_id = auth.uid() and is_primary and id <> account_id;
  update public.accounts set is_primary = true  where user_id = auth.uid() and id = account_id;
end;
$$;

revoke all on function public.set_primary_account(uuid) from public, anon;
grant execute on function public.set_primary_account(uuid) to authenticated;

-- =============================================================================
--  8. STUDIES — programs (e.g. "Máster") → subjects → assessments + PDF notes
-- =============================================================================
create table if not exists public.study_programs (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name           text not null check (char_length(name) between 1 and 120),
  institution    text not null default '',
  academic_year  text not null default '',
  total_credits  numeric(5, 1) check (total_credits is null or total_credits >= 0),
  created_at     timestamptz not null default now()
);

create table if not exists public.study_subjects (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  program_id    uuid not null references public.study_programs (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 160),
  code          text not null default '',
  credits       numeric(4, 1) not null default 6 check (credits >= 0),
  semester      text not null default '',
  professor     text not null default '',
  color         text not null default 'violet',
  status        text not null default 'in_progress' check (status in ('in_progress', 'passed', 'failed')),
  final_grade   numeric(4, 2) check (final_grade is null or final_grade between 0 and 10),  -- official grade, overrides the calculation
  target_grade  numeric(4, 2) not null default 5 check (target_grade between 0 and 10),
  created_at    timestamptz not null default now()
);

create table if not exists public.study_assessments (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id  uuid not null references public.study_subjects (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  weight      numeric(5, 2) not null check (weight > 0 and weight <= 100),  -- % of the final grade
  grade       numeric(4, 2) check (grade is null or grade between 0 and 10),
  kind        text not null default 'delivery' check (kind in ('delivery', 'exam')),
  due_at      timestamptz,  -- delivery deadline or exam date+time; drives the Telegram reminders
  is_done     boolean not null default false,  -- delivered / sat: stops reminders
  created_at  timestamptz not null default now()
);

-- Upgrade path: deliveries vs exams (different reminder schedules).
alter table public.study_assessments add column if not exists kind text not null default 'delivery';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'study_assessments_kind_check') then
    alter table public.study_assessments add constraint study_assessments_kind_check check (kind in ('delivery', 'exam'));
  end if;
end;
$$;

create table if not exists public.study_files (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  subject_id    uuid not null references public.study_subjects (id) on delete cascade,
  name          text not null check (char_length(name) between 1 and 200),
  topic         text not null default '',
  storage_path  text not null unique,  -- <user_id>/<subject_id>/<file id>.pdf in bucket "study-files"
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 52428800),
  created_at    timestamptz not null default now()
);

create index if not exists study_programs_user_idx on public.study_programs (user_id);
create index if not exists study_subjects_program_idx on public.study_subjects (program_id);
create index if not exists study_assessments_subject_idx on public.study_assessments (subject_id);
create index if not exists study_assessments_due_idx on public.study_assessments (due_at) where due_at is not null and not is_done;
create index if not exists study_files_subject_idx on public.study_files (subject_id);

alter table public.study_programs    enable row level security;
alter table public.study_subjects    enable row level security;
alter table public.study_assessments enable row level security;
alter table public.study_files       enable row level security;

-- Own rows only; children also require the parent to be yours.
do $$
declare
  spec record;
begin
  for spec in
    select * from (values
      ('study_programs',    null::text,         null::text),
      ('study_subjects',    'program_id',       'study_programs'),
      ('study_assessments', 'subject_id',       'study_subjects'),
      ('study_files',       'subject_id',       'study_subjects')
    ) as v(tbl, parent_col, parent_tbl)
  loop
    execute format('drop policy if exists %I on public.%I', spec.tbl || '_select_own', spec.tbl);
    execute format('drop policy if exists %I on public.%I', spec.tbl || '_insert_own', spec.tbl);
    execute format('drop policy if exists %I on public.%I', spec.tbl || '_update_own', spec.tbl);
    execute format('drop policy if exists %I on public.%I', spec.tbl || '_delete_own', spec.tbl);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', spec.tbl || '_select_own', spec.tbl);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', spec.tbl || '_delete_own', spec.tbl);
    if spec.parent_col is null then
      execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', spec.tbl || '_insert_own', spec.tbl);
      execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', spec.tbl || '_update_own', spec.tbl);
    else
      execute format(
        'create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id and exists (select 1 from public.%I p where p.id = %I and p.user_id = (select auth.uid())))',
        spec.tbl || '_insert_own', spec.tbl, spec.parent_tbl, spec.parent_col);
      execute format(
        'create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id and exists (select 1 from public.%I p where p.id = %I and p.user_id = (select auth.uid())))',
        spec.tbl || '_update_own', spec.tbl, spec.parent_tbl, spec.parent_col);
    end if;
  end loop;
end;
$$;

-- Private storage for the PDFs: 50 MB max, PDF only, each user in their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('study-files', 'study-files', false, 52428800, array['application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "study_files_storage_select" on storage.objects;
drop policy if exists "study_files_storage_insert" on storage.objects;
drop policy if exists "study_files_storage_delete" on storage.objects;
create policy "study_files_storage_select" on storage.objects for select to authenticated
  using (bucket_id = 'study-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "study_files_storage_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'study-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "study_files_storage_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'study-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- =============================================================================
--  9. POKÉMON COMPETITIVE — TCG decks, VGC teams, tournaments and their rounds
-- =============================================================================
create table if not exists public.tcg_decks (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  format      text not null default '',
  icons       jsonb not null default '[]'::jsonb check (jsonb_typeof(icons) = 'array'),
  list_text   text not null default '' check (char_length(list_text) <= 10000),
  notes       text not null default '' check (char_length(notes) <= 5000),
  created_at  timestamptz not null default now()
);

create table if not exists public.vgc_teams (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  regulation  text not null default '',
  paste       text not null default '' check (char_length(paste) <= 10000),
  notes       text not null default '' check (char_length(notes) <= 5000),
  created_at  timestamptz not null default now()
);

create table if not exists public.tournaments (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  game            text not null check (game in ('tcg', 'vgc')),
  name            text not null check (char_length(name) between 1 and 160),
  date            date not null default current_date,
  mode            text not null default 'in_person' check (mode in ('in_person', 'online')),
  location        text not null default '',
  category        text not null default 'other',
  format          text not null default '',
  players         integer check (players is null or players between 2 and 100000),
  swiss_rounds    integer check (swiss_rounds is null or swiss_rounds between 1 and 30),
  swiss_format    text not null default 'bo3' check (swiss_format in ('bo1', 'bo3')),
  has_top_cut     boolean not null default false,
  top_cut_type    text not null default 'standard' check (top_cut_type in ('standard', 'asymmetric')),
  top_cut_size    integer check (top_cut_size is null or top_cut_size between 2 and 512),
  top_cut_format  text check (top_cut_format is null or top_cut_format in ('bo1', 'bo3')),  -- null until the player answers
  made_top_cut    boolean not null default false,
  deck_id         uuid references public.tcg_decks (id) on delete set null,
  team_id         uuid references public.vgc_teams (id) on delete set null,
  status          text not null default 'planned' check (status in ('planned', 'in_progress', 'finished', 'dropped')),
  placement       integer check (placement is null or placement > 0),
  cp              integer check (cp is null or cp >= 0),
  notes           text not null default '' check (char_length(notes) <= 5000),
  created_at      timestamptz not null default now()
);

create table if not exists public.tournament_rounds (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tournament_id       uuid not null references public.tournaments (id) on delete cascade,
  phase               text not null default 'swiss' check (phase in ('swiss', 'top_cut')),
  number              integer not null check (number between 1 and 40),
  result              text not null check (result in ('win', 'loss', 'tie', 'bye', 'no_show')),
  games               jsonb not null default '[]'::jsonb check (jsonb_typeof(games) = 'array'),
  won_dice            boolean,
  went_first          boolean,
  opponent_name       text not null default '' check (char_length(opponent_name) <= 120),
  opponent_archetype  text not null default '' check (char_length(opponent_archetype) <= 120),
  opponent_icons      jsonb not null default '[]'::jsonb check (jsonb_typeof(opponent_icons) = 'array'),
  opponent_deck_name  text not null default '' check (char_length(opponent_deck_name) <= 120),
  opponent_pokemon    jsonb not null default '[]'::jsonb check (jsonb_typeof(opponent_pokemon) = 'array'),
  my_pokemon          jsonb not null default '[]'::jsonb check (jsonb_typeof(my_pokemon) = 'array'),
  notes               text not null default '' check (char_length(notes) <= 5000),
  created_at          timestamptz not null default now()
);

-- Upgrade path: final placement by bracket (champion, finalist, top 4…) besides the exact position.
alter table public.tournaments add column if not exists placement_bracket integer;
alter table public.tournaments drop constraint if exists tournaments_placement_bracket_check;
alter table public.tournaments add constraint tournaments_placement_bracket_check check (placement_bracket in (1, 2, 4, 8, 16, 32, 64, 128, 256, 1024));

-- Upgrade path: a rival who did not show up.
alter table public.tournament_rounds drop constraint if exists tournament_rounds_result_check;
alter table public.tournament_rounds add constraint tournament_rounds_result_check check (result in ('win', 'loss', 'tie', 'bye', 'no_show'));

-- Upgrade path: how each opponent is doing during the event (drives Op Win % and the standing chances).
alter table public.tournament_rounds add column if not exists opponent_record jsonb check (opponent_record is null or jsonb_typeof(opponent_record) = 'object');

-- Decks physically built lock their cards (see owned_cards).
alter table public.tcg_decks add column if not exists is_built boolean not null default true;

create table if not exists public.deck_versions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id     uuid not null references public.tcg_decks (id) on delete cascade,
  from_date   date not null,
  list_text   text not null check (char_length(list_text) <= 10000),
  note        text not null default '' check (char_length(note) <= 500),
  created_at  timestamptz not null default now()
);
create index if not exists deck_versions_deck_idx on public.deck_versions (deck_id, from_date);

create table if not exists public.matchup_notes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  deck_id     uuid references public.tcg_decks (id) on delete cascade,
  archetype   text not null check (char_length(archetype) between 1 and 300),
  name        text not null default '',
  icons       jsonb not null default '[]'::jsonb check (jsonb_typeof(icons) = 'array'),
  notes       text not null default '' check (char_length(notes) <= 5000),
  created_at  timestamptz not null default now()
);
create index if not exists matchup_notes_user_idx on public.matchup_notes (user_id, archetype);

-- Card collection: one row per print + language + condition + finish.
create table if not exists public.owned_cards (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users (id) on delete cascade,
  tcgdex_id       text not null check (char_length(tcgdex_id) between 1 and 60),
  set_code        text not null default '',
  set_name        text not null default '',
  number          text not null default '',
  name            text not null check (char_length(name) between 1 and 200),
  name_en         text not null default '',
  category        text not null default 'pokemon' check (category in ('pokemon', 'trainer', 'energy')),
  signature       text not null default '',
  rarity          text not null default '',
  image           text,
  language        text not null default 'es',
  condition       text not null default 'NM' check (condition in ('MT', 'NM', 'EX', 'GD', 'LP', 'PL', 'PO')),
  finish          text not null default 'normal',
  first_edition   boolean not null default false,
  signed          boolean not null default false,
  altered         boolean not null default false,
  grade_company   text not null default '',
  grade           text not null default '',
  quantity        integer not null default 1 check (quantity between 1 and 9999),
  location        text not null default '',
  for_sale        boolean not null default false,
  paid            numeric(12, 2) check (paid is null or paid >= 0),
  acquired_at     date,
  cm_product      integer,  -- Cardmarket product id
  ref_low         numeric(12, 2),  -- Cardmarket daily guide, any language
  ref_trend       numeric(12, 2),
  ref_date        date,
  own_price       numeric(12, 2) check (own_price is null or own_price >= 0),  -- lowest in this language
  own_price_date  date,
  notes           text not null default '' check (char_length(notes) <= 2000),
  created_at      timestamptz not null default now()
);
create index if not exists owned_cards_user_idx on public.owned_cards (user_id, set_code, number);

create table if not exists public.collection_snapshots (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  date        date not null,
  total       numeric(14, 2) not null default 0,
  cards       integer not null default 0,
  created_at  timestamptz not null default now(),
  constraint collection_snapshots_day unique (user_id, date)
);

create index if not exists tcg_decks_user_idx on public.tcg_decks (user_id);
create index if not exists vgc_teams_user_idx on public.vgc_teams (user_id);
create index if not exists tournaments_user_date_idx on public.tournaments (user_id, date desc);
create index if not exists tournaments_deck_idx on public.tournaments (deck_id);
create index if not exists tournaments_team_idx on public.tournaments (team_id);
create index if not exists tournament_rounds_tournament_idx on public.tournament_rounds (tournament_id, phase, number);
create index if not exists tournament_rounds_user_idx on public.tournament_rounds (user_id);

-- =============================================================================
--  10. RUNNING & RACE PREP — target races, training plan and completed runs
-- =============================================================================
create table if not exists public.race_goals (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null check (char_length(name) between 1 and 120),
  date             date not null,
  distance_km      numeric(7, 3) not null check (distance_km > 0 and distance_km <= 500),
  previous_best_s  integer check (previous_best_s is null or previous_best_s > 0),
  target_s         integer not null check (target_s > 0),
  notes            text not null default '' check (char_length(notes) <= 5000),
  created_at       timestamptz not null default now()
);

create table if not exists public.run_plan (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  goal_id      uuid not null references public.race_goals (id) on delete cascade,
  date         date not null,
  type         text not null check (type in ('easy', 'interval', 'tempo', 'long', 'race')),
  distance_km  numeric(6, 2) not null check (distance_km > 0 and distance_km <= 200),
  pace_s       integer check (pace_s is null or pace_s between 100 and 1200),  -- target pace, seconds per km
  description  text not null default '' check (char_length(description) <= 1000),
  created_at   timestamptz not null default now()
);

create table if not exists public.runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  plan_id      uuid references public.run_plan (id) on delete set null,
  date         date not null,
  type         text not null check (type in ('easy', 'interval', 'tempo', 'long', 'race')),
  distance_km  numeric(6, 2) not null check (distance_km > 0 and distance_km <= 200),
  duration_s   integer not null check (duration_s > 0),
  work_pace_s  integer check (work_pace_s is null or work_pace_s between 100 and 1200),  -- pace of the fast part
  avg_hr       integer check (avg_hr is null or avg_hr between 40 and 240),
  rpe          integer check (rpe is null or rpe between 1 and 10),
  is_test      boolean not null default false,
  notes        text not null default '' check (char_length(notes) <= 5000),
  created_at   timestamptz not null default now()
);

-- Reusable structured sessions (blocks: warm-up, reps with recovery, cool-down…).
create table if not exists public.run_workouts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  type        text not null default 'interval' check (type in ('easy', 'interval', 'tempo', 'long', 'race')),
  blocks      jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array'),
  created_at  timestamptz not null default now()
);
create index if not exists run_workouts_user_idx on public.run_workouts (user_id);

-- Upgrade path: structured sessions.
alter table public.run_plan add column if not exists blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array');
alter table public.runs add column if not exists blocks jsonb not null default '[]'::jsonb check (jsonb_typeof(blocks) = 'array');

-- Shoes and their mileage.
create table if not exists public.shoes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 120),
  start_km    numeric(7, 1) not null default 0 check (start_km >= 0),
  limit_km    numeric(7, 1) not null default 700 check (limit_km >= 0),
  retired     boolean not null default false,
  is_default  boolean not null default false,
  created_at  timestamptz not null default now()
);
create index if not exists shoes_user_idx on public.shoes (user_id);
alter table public.runs add column if not exists shoe_id uuid references public.shoes (id) on delete set null;

create index if not exists race_goals_user_idx on public.race_goals (user_id, date);
create index if not exists run_plan_goal_idx on public.run_plan (goal_id, date);
create index if not exists run_plan_user_idx on public.run_plan (user_id);
create index if not exists runs_user_date_idx on public.runs (user_id, date desc);
create index if not exists runs_plan_idx on public.runs (plan_id);

alter table public.tcg_decks         enable row level security;
alter table public.vgc_teams         enable row level security;
alter table public.tournaments       enable row level security;
alter table public.deck_versions     enable row level security;
alter table public.matchup_notes     enable row level security;
alter table public.owned_cards       enable row level security;
alter table public.collection_snapshots enable row level security;
alter table public.tournament_rounds enable row level security;
alter table public.race_goals        enable row level security;
alter table public.run_plan          enable row level security;
alter table public.runs              enable row level security;
alter table public.run_workouts      enable row level security;
alter table public.shoes             enable row level security;
alter table public.category_rules    enable row level security;
alter table public.bills             enable row level security;

-- Own rows only; anything referenced (deck, team, tournament, race, session) must be yours too.
do $$
declare
  spec record;
  guard text;
begin
  for spec in
    select * from (values
      ('tcg_decks',         'true'),
      ('vgc_teams',         'true'),
      ('owned_cards',       'true'),
      ('collection_snapshots', 'true'),
      ('deck_versions',     'exists (select 1 from public.tcg_decks d where d.id = deck_id and d.user_id = (select auth.uid()))'),
      ('matchup_notes',     '(deck_id is null or exists (select 1 from public.tcg_decks d where d.id = deck_id and d.user_id = (select auth.uid())))'),
      ('tournaments',       '(deck_id is null or exists (select 1 from public.tcg_decks d where d.id = deck_id and d.user_id = (select auth.uid())))'
                            ' and (team_id is null or exists (select 1 from public.vgc_teams v where v.id = team_id and v.user_id = (select auth.uid())))'),
      ('tournament_rounds', 'exists (select 1 from public.tournaments p where p.id = tournament_id and p.user_id = (select auth.uid()))'),
      ('race_goals',        'true'),
      ('run_workouts',      'true'),
      ('shoes',             'true'),
      ('category_rules',    'true'),
      ('bills',             'true'),
      ('run_plan',          'exists (select 1 from public.race_goals g where g.id = goal_id and g.user_id = (select auth.uid()))'),
      ('runs',              '(plan_id is null or exists (select 1 from public.run_plan s where s.id = plan_id and s.user_id = (select auth.uid())))'
                            ' and (shoe_id is null or exists (select 1 from public.shoes z where z.id = shoe_id and z.user_id = (select auth.uid())))')
    ) as v(tbl, extra)
  loop
    guard := '(select auth.uid()) = user_id and ' || spec.extra;
    execute format('drop policy if exists %I on public.%I', spec.tbl || '_select_own', spec.tbl);
    execute format('drop policy if exists %I on public.%I', spec.tbl || '_insert_own', spec.tbl);
    execute format('drop policy if exists %I on public.%I', spec.tbl || '_update_own', spec.tbl);
    execute format('drop policy if exists %I on public.%I', spec.tbl || '_delete_own', spec.tbl);
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', spec.tbl || '_select_own', spec.tbl);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', spec.tbl || '_delete_own', spec.tbl);
    execute format('create policy %I on public.%I for insert to authenticated with check (%s)', spec.tbl || '_insert_own', spec.tbl, guard);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check (%s)', spec.tbl || '_update_own', spec.tbl, guard);
  end loop;
end;
$$;

-- =============================================================================
--  REALTIME (optional but recommended)
--  Lets the app receive live changes across devices (MacBook ⇄ iPhone).
--  RLS still applies to realtime: you only receive your own rows.
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['events', 'projects', 'project_tasks', 'transactions', 'categories', 'accounts', 'work_logs', 'study_programs', 'study_subjects', 'study_assessments', 'study_files', 'tcg_decks', 'vgc_teams', 'tournaments', 'tournament_rounds', 'race_goals', 'run_plan', 'runs', 'run_workouts', 'category_rules', 'bills', 'shoes', 'deck_versions', 'matchup_notes', 'owned_cards', 'collection_snapshots'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- =============================================================================
--  TELEGRAM NOTIFICATIONS (optional)
--  Event reminders (10 and 5 minutes before, and at the end), delivery reminders
--  (1 day, 3 h, 1 h, 30 min, 5 min before) and exam reminders (1 month, 2 weeks,
--  1 week, 2 days, 1 day, 3 h, 1 h before) are sent by the Edge Function
--  `telegram-notify`, called every minute by pg_cron. Its URL
--  and shared secret live in Supabase Vault, never in this file:
--    select vault.create_secret('https://<ref>.supabase.co/functions/v1/telegram-notify', 'telegram_notify_url');
--    select vault.create_secret('<same value as the NOTIFY_SECRET function secret>', 'telegram_notify_secret');
--  If either secret is missing, everything below is a silent no-op.
-- =============================================================================
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Which reminders each study deadline already got ('before1440', 'before180', …).
create table if not exists public.study_notification_log (
  assessment_id  uuid not null references public.study_assessments (id) on delete cascade,
  kind           text not null check (kind ~ '^before[0-9]{1,5}$'),
  sent_at        timestamptz not null default now(),
  primary key (assessment_id, kind)
);
alter table public.study_notification_log enable row level security;  -- no policies: server-only

-- Which reminders each event already got ('start10', 'start5', 'end'): prevents duplicates.
create table if not exists public.notification_log (
  event_id  uuid not null references public.events (id) on delete cascade,
  kind      text not null check (kind ~ '^(start[0-9]{1,3}|end)$'),
  sent_at   timestamptz not null default now(),
  primary key (event_id, kind)
);
alter table public.notification_log enable row level security;  -- no policies: server-only
-- Anything sent or received once: summaries, reminders, alerts, bot updates.
create table if not exists public.message_log (
  key      text primary key check (char_length(key) between 1 and 200),
  sent_at  timestamptz not null default now()
);
alter table public.message_log enable row level security;  -- no policies: server-only

-- What the bot created, so "deshacer" can remove it.
create table if not exists public.bot_actions (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  table_name  text not null check (table_name in ('transactions', 'project_tasks', 'events', 'work_logs')),
  row_id      uuid not null,
  label       text not null default '',
  created_at  timestamptz not null default now()
);
alter table public.bot_actions enable row level security;  -- no policies: server-only
create index if not exists bot_actions_user_idx on public.bot_actions (user_id, id desc);

create index if not exists notification_log_sent_idx on public.notification_log (sent_at);

-- Fire-and-forget POST to the notifier. SECURITY DEFINER so cron jobs can read Vault.
create or replace function public.notify_telegram(payload jsonb)
returns void
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  fn_url text;
  fn_secret text;
begin
  select decrypted_secret into fn_url from vault.decrypted_secrets where name = 'telegram_notify_url' limit 1;
  select decrypted_secret into fn_secret from vault.decrypted_secrets where name = 'telegram_notify_secret' limit 1;
  if fn_url is null or fn_secret is null then
    return;
  end if;
  perform net.http_post(
    url := fn_url,
    body := payload,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || fn_secret),
    timeout_milliseconds := 15000  -- room for Edge Function cold starts
  );
exception when others then
  -- Notifications must never break a write.
  raise warning 'notify_telegram failed: %', sqlerrm;
end;
$$;

revoke all on function public.notify_telegram(jsonb) from public, anon, authenticated;

-- Apple Pay expenses are announced by the apple-pay-webhook function itself,
-- so imports and manual entries never notify. Remove any older trigger version.
drop trigger if exists transactions_notify_telegram on public.transactions;
drop function if exists public.notify_new_transactions();

-- Every minute: event reminders. Daily: trim the log.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where jobname in ('telegram-events-tick', 'telegram-log-cleanup');
  perform cron.schedule('telegram-events-tick', '* * * * *', $job$ select public.notify_telegram('{"kind":"tick"}'::jsonb) $job$);
  perform cron.schedule('telegram-log-cleanup', '17 4 * * *', $job$
    delete from public.notification_log where sent_at < now() - interval '30 days';
    delete from public.study_notification_log where sent_at < now() - interval '60 days';
    delete from public.message_log where sent_at < now() - interval '90 days';
    delete from public.bot_actions where created_at < now() - interval '30 days';
  $job$);
end;
$$;

-- =============================================================================
--  Refresh the PostgREST schema cache so the API sees the new tables at once
--  (avoids "Could not find the table 'public.events' in the schema cache").
-- =============================================================================
notify pgrst, 'reload schema';
