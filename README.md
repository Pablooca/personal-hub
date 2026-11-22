# Personal Hub — Life OS

A private command center for calendar, projects and personal finance.
React + TypeScript on the front end, **Supabase** (PostgreSQL + Auth + Row Level Security) behind it, deployable for free on Vercel or Cloudflare Pages.

> **Try it without an account:** click **"Try Interactive Demo"** on the login screen. Demo Mode loads synthetic data into `localStorage` and never contacts the database.

---

## Features

| Module | What it does |
| --- | --- |
| **Overview** | Today's agenda with a checklist, the next 7 days, active projects with progress, this month's income / expenses / savings rate, and quick capture for a task or an expense. |
| **Calendar & Agenda** | Month and week views (time grid with overlap layout and a now-line), colour-coded categories you can filter, create/edit/delete events, and a checklist for the selected day. |
| **Projects Tracker** | Kanban board (drag & drop between statuses) and list view, editable progress (or derived from sub-tasks), sub-tasks/milestones, technical notes, optional repo link. |
| **Personal Finance** | Quick entry for income/expense/investment, monthly KPIs (net balance, savings rate, month-over-month deltas), category breakdown, 6-month trend, and a filterable, sortable ledger with CSV export. |

Also: dark/light mode, a collapsible sidebar on desktop, bottom navigation on mobile (built for iPhone safe areas), optimistic UI with rollback, and realtime sync between devices.

## Stack

- **React 19 + Vite + TypeScript** (strict)
- **Tailwind CSS v4**, design tokens as CSS variables, `Plus Jakarta Sans` + `JetBrains Mono`
- **lucide-react** icons
- **@supabase/supabase-js**: Auth (email + password), PostgREST, Realtime

## Architecture

```
src/
├── App.tsx               # auth state machine: loading → login | supabase | demo
├── data/
│   ├── repository.ts     # Repository interface + Supabase and Local (demo) implementations
│   └── demoSeed.ts       # synthetic data, generated relative to "today"
├── state/
│   ├── data.tsx          # DataProvider: one store for the 4 tables, optimistic CRUD, realtime merge
│   ├── theme.tsx         # dark / light
│   └── toast.tsx
├── lib/                  # types, date + finance helpers, formatting, Supabase client
├── components/           # Shell (sidebar / bottom nav / demo banner), Login, EventModal, UI primitives
└── views/                # Overview, Calendar, Projects, Finance
supabase/schema.sql       # tables, constraints, indexes, RLS policies, realtime publication
```

The UI only talks to a `Repository`. Demo Mode and the real database share every component and code path; the only difference is which implementation gets injected.

## Getting started

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Open **SQL Editor**, paste [`supabase/schema.sql`](supabase/schema.sql) and run it. The script is idempotent.
3. Under **Authentication → Users**, create your user (email + password). For a single-user setup you can also turn off public sign-ups under **Authentication → Providers → Email**.

### 2. Local development

```bash
cp .env.example .env      # then fill in your project URL and anon key
npm install
npm run dev               # http://localhost:5173
```

| Variable | Where to find it |
| --- | --- |
| `VITE_SUPABASE_URL` | Project Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → `anon` `public` key |

If the variables are missing, the app still builds and runs, but only Demo Mode is offered.

### 3. Deploy

**Vercel:** import the repo (framework preset: Vite) and add the two env vars. `vercel.json` already rewrites routes to the SPA.

**Cloudflare Pages:** build command `npm run build`, output directory `dist`, and add the two env vars. `public/_redirects` handles SPA routing.

## Security model

- **Row Level Security is enabled on every table.** The policies for `SELECT`, `INSERT`, `UPDATE` and `DELETE` all require `auth.uid() = user_id`, so a user can only see and change their own rows. `project_tasks` also checks that the parent project belongs to the same user.
- The **anon key is designed to be public**: it ships in the client bundle of every Supabase app. On its own it can read nothing, because every policy is scoped to the `authenticated` role and to the row owner.
- **Never** use the `service_role` key in this front end.
- `.env` and `.env.*` are git-ignored. Only `.env.example`, with empty values, is committed.
- Demo Mode makes zero network requests to Supabase. Its data is synthetic and stays in the visitor's browser.
- CSV export neutralises spreadsheet formula injection (`=`, `+`, `-`, `@` prefixes).

## Scripts

| Command | |
| --- | --- |
| `npm run dev` | Start the dev server |
| `npm run build` | Type-check (`tsc -b`) and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Type-check only |

## License

MIT
