# SKOLARIS Frontend — Phase 3

Plain ERP-style admin dashboard for the SKOLARIS backend. **No gradients, no shadows, no animation theatrics.** Single primary accent, 1px borders, 4px radius, monospace timer, table-first lists.

## Centralized styling architecture

All design tokens live in **`src/styles/global.css`** as CSS variables. Three layers consume them, in order:

1. **`global.css`** — defines `--color-*`, `--font-*`, `--radius`, `--sidebar-width`, `--topbar-height`, etc. Tailwind's `@tailwind base` is included here. Edit this file to rebrand or restyle the entire app.
2. **`tailwind.config.ts`** — the Tailwind theme is *replaced* (not extended) to point at those vars: `colors.primary = 'var(--color-primary)'`, `spacing` follows the 8-point grid, `borderRadius.DEFAULT = 'var(--radius)'`. `boxShadow`/`dropShadow` are nuked so no one accidentally adds shadows.
3. **`components.css`** — semantic component classes (`.btn`, `.btn-primary`, `.card`, `.data-table`, `.nav-item`, `.timer`, …) built with `@apply` over the design tokens. This is where the "look" lives.

UI primitives in `src/components/ui/` compose those semantic classes via the `cn()` helper. Feature components never write raw Tailwind utility soup — they use the primitive:

```tsx
// ✅ Component using primitives
<Button variant="primary">Save</Button>
<Card><CardHeader>Title</CardHeader><CardBody>Body</CardBody></Card>
<Table columns={cols} data={rows} empty={<>No rows.</>} />

// ❌ Never
<button className="px-3 py-2 bg-blue-700 text-white hover:bg-blue-800 ...">
```

To rebrand: change `--color-primary` in `global.css`. That single edit flows through Tailwind utilities, semantic classes, primitives, and feature pages.

## Tech stack

- React 18 + Vite + TypeScript (strict)
- TailwindCSS (theme replaced, see above) + Inter / system stack
- TanStack Query v5 for server state, TanStack Table v8 (headless, plain styling)
- React Router v6
- React Hook Form + Zod
- Zustand (auth store only)
- Axios with refresh-token interceptor
- lucide-react icons (16/18px only, never decorative)
- sonner toasts (plain, no slide-in animations)

No UI kit dependency.

## Folder layout

```
src/
├── main.tsx, App.tsx, router.tsx
├── styles/
│   ├── global.css       ← design tokens (single source of truth)
│   ├── components.css   ← semantic component classes (.btn, .card, …)
│   └── index.css        ← entry: imports both
├── lib/
│   ├── api/             axios client + typed API modules (auth, students,
│   │                    classrooms, exams, questions, attempts, analytics,
│   │                    notifications, uploads, branches, teachers, dashboard)
│   ├── auth/            zustand store + token storage + RequireAuth guard
│   ├── hooks/           use-current-user, use-debounce
│   ├── types/           shared enums and envelope types
│   └── utils/           cn(), format(), role()
├── components/
│   ├── ui/              primitives — Button, Input, Select, Textarea,
│   │                    Checkbox, Radio, Label, FormField, Card, Table,
│   │                    Pagination, Modal, ConfirmDialog, Tabs, Badge,
│   │                    StatusBadge, StatCard, EmptyState, ErrorBanner
│   └── layout/          AppShell, Sidebar, Topbar, PageHeader, nav-items
└── pages/
    ├── auth/LoginPage
    ├── DashboardPage
    ├── ForbiddenPage, NotFoundPage
    ├── students/StudentsListPage
    ├── teachers/TeachersListPage
    ├── classrooms/ClassroomsListPage, ClassroomDetailPage
    ├── exams/ExamsListPage, ExamComposePage, ExamDetailPage, ExamAttemptDetailPage
    ├── questions/QuestionsListPage
    ├── student/MyExamsPage, AttemptPage, AttemptResultPage
    ├── notifications/NotificationsPage
    └── settings/SettingsPage
```

## Setup

```powershell
# 1. install deps
npm install

# 2. ensure backend is running (separate repo)
#    docker compose up -d  # in D:\Skolaris\Skolaris Backend
#    npm run start:dev     # in D:\Skolaris\Skolaris Backend

# 3. start the frontend dev server (proxies /api → http://localhost:3000)
npm run dev   # http://localhost:5173

# 4. production build
npm run build
```

## Seeded login credentials (from the backend seed)

| Role | Email | Password | Tenant slug |
| --- | --- | --- | --- |
| SUPER_ADMIN | admin@acme.test | Admin123! | acme |
| TEACHER | teacher@acme.test | Teacher123! | acme |
| STUDENT | student1@acme.test | Student123! | acme |

The tenant slug field is optional on the login form. Use it if you've created additional tenants with overlapping emails.

## Routing + role gating

- `/login` — public
- `/dashboard` — SUPER_ADMIN, TEACHER (auto-redirect from `/` for these roles)
- `/student/exams` — STUDENT (auto-redirect from `/` for students)
- `/student/exams/:id` — full-bleed attempt UI (no sidebar/topbar)
- `/student/attempts/:id/result` — full-bleed result view (no sidebar/topbar)

`RequireAuth` wraps protected routes. Unauthenticated → `/login`. Wrong role → `/forbidden`.

## The attempt page

`AttemptPage` is the most behaviour-heavy screen:

- 1Hz local timer; server reconciliation every 30s via `POST /me/attempts/:id/heartbeat`
- 800ms debounced autosave per answer change via `PATCH .../answers/:examQuestionId`
- Anti-cheat listeners: `visibilitychange`, `blur`, `contextmenu`, `copy`, `paste` → batched into an in-memory queue, flushed every 5s via `POST .../violations`
- On `{ autoSubmitted: true }` from heartbeat or violations: locks UI, shows a plain modal, offers "View result"
- On timer 0: submit + redirect to result page

## Adding a new page (in the spirit of the styling architecture)

1. Create `src/pages/foo/FooPage.tsx`.
2. Use existing primitives — `<PageHeader>`, `<Card>`, `<Table>`, `<Button>`, `<Input>`, etc.
3. Reach for the `cn()` helper if you need to compose conditional classes.
4. If you find yourself repeating a Tailwind class block in >2 places, promote it to a semantic class in `components.css` and use that instead.
5. Add the route in `src/router.tsx` with the appropriate `Admin()` / `Student()` / `Any()` wrapper.

That's the whole maintenance loop. No design system docs to keep in sync — `global.css` + `components.css` *are* the docs.
