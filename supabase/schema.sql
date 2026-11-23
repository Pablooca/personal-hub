-- =============================================================================
--  Personal Hub / Life OS — Supabase schema
-- -----------------------------------------------------------------------------
--  Paste this whole file into Supabase → SQL Editor → Run.
--  It is idempotent: safe to run more than once.
--
--  Tables:   events · projects · project_tasks · transactions · categories · accounts · work_logs · notification_log
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
  updated_at  timestamptz not null default now(),
  constraint projects_dates_order check (deadline is null or start_date is null or deadline >= start_date)
);

comment on table public.projects is 'Projects with Kanban status, progress, description, dates and technical notes.';
comment on column public.projects.deadline is 'End date of the project.';

-- Upgrade path for databases created before description/start_date existed.
alter table public.projects add column if not exists description text not null default '';
alter table public.projects add column if not exists start_date date;
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
  created_at  timestamptz not null default now(),
  constraint project_tasks_has_owner check (project_id is not null or category is not null)
);

comment on table public.project_tasks is 'Kanban tasks: project sub-tasks or standalone work/personal tasks.';
comment on column public.project_tasks.jira_key is 'Optional Jira issue key (e.g. PLAT-142), used by the work log.';

-- Upgrade path: standalone tasks + Jira key.
alter table public.project_tasks alter column project_id drop not null;
alter table public.project_tasks add column if not exists category text;
alter table public.project_tasks add column if not exists jira_key text;
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
--  REALTIME (optional but recommended)
--  Lets the app receive live changes across devices (MacBook ⇄ iPhone).
--  RLS still applies to realtime: you only receive your own rows.
-- =============================================================================
do $$
declare
  t text;
begin
  foreach t in array array['events', 'projects', 'project_tasks', 'transactions', 'categories', 'accounts', 'work_logs'] loop
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
--  Event reminders (10 and 5 minutes before, and at the end) are sent by the
--  Edge Function `telegram-notify`, called every minute by pg_cron. Its URL
--  and shared secret live in Supabase Vault, never in this file:
--    select vault.create_secret('https://<ref>.supabase.co/functions/v1/telegram-notify', 'telegram_notify_url');
--    select vault.create_secret('<same value as the NOTIFY_SECRET function secret>', 'telegram_notify_secret');
--  If either secret is missing, everything below is a silent no-op.
-- =============================================================================
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;

-- Which reminders each event already got ('start10', 'start5', 'end'): prevents duplicates.
create table if not exists public.notification_log (
  event_id  uuid not null references public.events (id) on delete cascade,
  kind      text not null check (kind ~ '^(start[0-9]{1,3}|end)$'),
  sent_at   timestamptz not null default now(),
  primary key (event_id, kind)
);
alter table public.notification_log enable row level security;  -- no policies: server-only
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
    timeout_milliseconds := 5000
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
  perform cron.schedule('telegram-log-cleanup', '17 4 * * *', $job$ delete from public.notification_log where sent_at < now() - interval '30 days' $job$);
end;
$$;

-- =============================================================================
--  Refresh the PostgREST schema cache so the API sees the new tables at once
--  (avoids "Could not find the table 'public.events' in the schema cache").
-- =============================================================================
notify pgrst, 'reload schema';
