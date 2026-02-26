# Stark PM — HUD (v65)

A lightweight, **browser-only** project management command HUD with a futuristic UI.  
Track **Projects → Modules → Milestones → Tasks (with Steps)**, get a high-signal dashboard view, and **import/export** plans for fast iteration.

> No backend. Data stays in your browser unless you export it.

---

## What’s inside

### Core tabs
- **Dashboard**: completion ring, active project summary, hotlist, milestone rollups, recent activity.
- **Project**: create/select projects and edit project metadata (name/description/status/tag).
- **Milestone**: manage modules and milestones (priority/state/notes).
- **Checklist**: add tasks, mark done, sort/clear done, and jump between milestones.
- **Import**: drag/drop or paste **.md / .txt / .json** and preview before applying.

### Advanced navigation (in v65)
This build also includes a collapsible **Advanced Panels** group (collapsed by default) with:
- **Portfolio** (multi-project view)
- **Ops & Alerts**
- **Automation & Review**
- **Approvals & Team**
- **Reports & Export Tools**

> These panels are routed out of the Dashboard to keep navigation cleaner.

## Advanced tools & settings (v66)

Most “advanced” features are **opt-in** and designed to keep the default workflow clean.  
Two things control what you see:

- **Mode toggle (topbar)**: `Mode: Basic` vs `Mode: Advanced`
  - **Basic** = core PM workflow only (Dashboard / Project / Milestone / Checklist / Import)
  - **Advanced** = reveals **Portfolio** + **Advanced Panels**, and shows extra **Tools ▾** actions
- **Tools ▾ menu (topbar)**: quick access to heavy/ops panels (many are **Advanced-only**)

### Settings guide (start here)

If the settings feel like “too much”, use this order:

1. **Leave everything as-is** and work in **Mode: Basic** until you *need* multi-project / ops / approvals.
2. Treat settings as three “risk levels”:
   - **View filters** (safe): change what you *see* (Due / Blocked-only / Saved Views).
   - **UI preferences** (safe): change how things *look* (List vs Kanban).
   - **Engines** (power): can create new tasks or change scheduling behavior (recurring + scheduling assist + bulk maintenance).
3. Before touching any **Engine** setting, do a quick safety backup: **Export JSON**.

#### Pick your “profile” (recommended presets)

| Your goal | Turn on | Keep off for now |
|---|---|---|
| **Solo / daily usage** | Mode: **Basic**, List layout, Due filter as needed | Auto-recurring, Scheduling Assist, SLA action rules, Approvals/RBAC |
| **Weekly planning** | Saved checklist views, Task Planner, (optional) Scheduling Assist | SLA action rules, Bulk maintenance |
| **Multiple projects** | Mode: **Advanced**, Portfolio filters/sort | Approvals/RBAC unless you need governance |
| **Team governance** | Approval gates, Workflow + audit, RBAC, Unlock reason, Team profiles | Auto actions (SLA action rules) until the team agrees |

#### Where to find the settings

- **Mode toggle (topbar)**: controls whether Advanced Panels/Tools appear.
- **Checklist filters**: Due / Blocked-only / Saved Views live with the Checklist view (fast triage).
- **Tools ▾ (topbar)**: jumps to the bigger panels:
  - **Ops & Alerts** = notifications, stale/SLA, capacity signal
  - **Automation & Review** = recurring + scheduling + review helpers
  - **Approvals & Team** = confirmations, audit, RBAC, profiles
  - **Reports & Export Tools** = exports, digests, dashboard view saves

#### What counts as “safe” vs “power”

- **Safe (won’t change your data):** UI Mode, layout (List/Kanban), filters, saved views, pinned views, snoozing/dismissing notifications, export UI preferences.
- **Power (can change data or behavior):** auto-recurring, scheduling assist, bulk milestone maintenance, SLA action rules.

> Tip: If you only want PM tracking, you can ignore everything below and never open Advanced mode.


<details>
<summary><strong>Full setting reference (all settings)</strong></summary>

### Advanced tool use cases & what each setting does

#### UI & navigation
| Setting | Default | Use case |
|---|---:|---|
| **UI Mode** (Basic/Advanced) | Basic | Keep the app focused day-to-day (Basic), or turn on Portfolio/Ops/Automation/Approvals tooling when you need it (Advanced). |
| **Topbar declutter menus** (Export ▾ / Tools ▾) | On | Keeps the topbar compact while still exposing power tools. |

#### Checklist / task meta (planning controls)
| Setting | Default | Use case |
|---|---:|---|
| **Due filter** (Due: All/Overdue/Today/7 Days/Has/None) | All | Slice your milestone by time pressure; pair with “Saved Views” to jump between contexts. |
| **Blocked-only filter** | Off | Focus only on tasks waiting on dependencies (good for unblocking sessions). |
| **Saved checklist views** | (none) | Save a specific combo of query/status/severity/due/blocked as a named view (e.g. “Overdue Blockers”, “High open this week”). |
| **Checklist layout** (List vs Kanban) | List | Kanban for flow (Todo/Doing/Done); List for detailed steps and fast scanning. |
| **Task Planner** (Due date + dependencies + blocker note) | (per-task) | Quickly wire dependency chains inside a milestone and make blockers visible in notifications, graphs, and scheduling tools. |
| **Recurring task fields** (`recur_days`, `recur_tpl`) | Off | Represent repeating work (daily reviews, weekly exports, monthly billing). Works best when combined with Phase 7/13 recurrence automation. |

#### Ops & alerts (signal tools)
| Setting | Default | Use case |
|---|---:|---|
| **Pinned Views (Ops Center)** | (none) | Pin your most-used checklist filters for 1-click jumps from the Dashboard Ops Center. |
| **Notifications dismissed** | (none) | “Dismiss” is a lightweight way to clear noise without deleting work. |
| **Reminder Rules** (notification types ON/OFF) | On | Decide which notification categories should appear (overdue, due soon, blocked, capacity, snapshot). |
| **Default snooze hours** | 12h | Quick-hide a notification for a while without losing it. Good for “waiting on reply” items. |
| **SLA Aging thresholds** | On (5/2/7 days) | Auto-surface “stale” tasks/blockers/milestones (no recent activity) as alerts. Great for team follow-ups. |
| **Stale audit** (cooldown) | On (10 min) | Logs breach/recovery transitions into activity so you can see when something became stale and when it recovered. |
| **Capacity per assignee (weekly)** | unset | Turn workload into an overload signal; you’ll get alerts when “load score” exceeds capacity. |

#### Automation & review (power workflows)
| Setting | Default | Use case |
|---|---:|---|
| **Auto-recurring on complete** | Off | When a recurring task is completed, auto-generate the next instance (safe for routines). |
| **Auto-recurring requires due date** | Off | Prevent accidental “infinite” recurring creation; only auto-generate when the task had a due date. |
| **Scheduling Assist** (gap/base/severity weight) | 1d / 1d / On | Suggest missing due dates and push downstream tasks so dependency chains stay realistic. |
| **Review marks (daily/weekly)** | auto | Prevents duplicate review generation; tracks when a milestone already had a daily/weekly review task generated. |
| **Mention follow-ups** (`@name`) | On | Turn comments into follow-up reminders and notifications; useful for async coordination. |
| **Recurring sweeper** (Phase 13) | Enabled (manual) | Bulk-generate any overdue recurring items and repair recurrence metadata across projects. Use when you want “maintenance mode”. |
| **SLA action rules** (Phase 13) | Off | Optional “auto nudge / auto assign / auto escalate” engine tied to stale alerts—use carefully in team settings. |
| **Bulk milestone maintenance** | Open-only | Shift due dates, set assignee, or set severity across many tasks (great during replans). |

#### Approvals & team (governance)
| Setting | Default | Use case |
|---|---:|---|
| **Approval gates (confirmations)** | On | Adds “are you sure?” barriers when closing blockers / closing tasks with dependents / marking milestones done with open work. |
| **Approval workflow + audit** | On | Adds explicit task/milestone approval states and an audit trail for review/approve/lock events. |
| **RBAC default policy** | Review-before-approve | Define who can review/approve/lock; supports Owner/Reviewer/Executor roles. |
| **Unlock reason required** | On | Forces a short justification when unlocking a locked item (good for accountability). |
| **Team profiles** | 1 default | Save “who you are” (name + role) and switch quickly; approval audit notes get consistent attribution. |

#### Reports & export tools
| Setting | Default | Use case |
|---|---:|---|
| **Export Center selection** (type/format/scope) | Project Doc / MD / Active | Centralizes all exports (project doc, full state JSON, portable bundle, status report, risk digest, audits, dashboard views, digest presets). |
| **Dashboard views** (save/restore + import mode) | (none) | Save “jump points” into Dashboard sections; export/import them portably (merge vs replace). |
| **Risk digest scope** | All projects | Generate a daily/weekly risk snapshot across everything, or focus on the active project only. |
| **Portfolio filters** (query/status/sort) | empty/all/risk | Multi-project command view; filter by status and sort by risk to find what needs attention first. |

</details>

<details>
<summary><strong>Power users: storage keys (localStorage)</strong></summary>

### Advanced settings storage (for debugging / power users)

All data is stored locally in your browser. Besides the main app database (`stark_pm_v1`), advanced tools persist UI/config under these keys:

| localStorage key | Stores | Use case / why it exists |
|---|---|---|
| `stark_pm_ui_mode_v1` | Basic/Advanced mode | Keeps your navigation choice consistent across reloads. |
| `stark_pm_phase4_views_v1` | Saved checklist views | Fast context switching (filters + presets). |
| `stark_pm_phase5_ui` | Checklist layout (List/Kanban) | Remembers your preferred checklist presentation. |
| `stark_pm_phase5_recurring_templates_v1` | Recurring templates library | Reuse recurring task patterns. |
| `stark_pm_phase6_ui_v1` | Graph collapsed + auto-refresh | Keeps the dependency graph comfortable on your device. |
| `stark_pm_phase6_snapshots__<projectId>` | Project snapshots | Restore points for risky edits and refactors. |
| `stark_pm_phase7_cfg_v1` | Recurrence + scheduling settings | Controls auto-recurring and scheduling assist heuristics. |
| `stark_pm_phase7_blueprints_v1` | Blueprint templates | Reusable project/module/milestone skeletons. |
| `stark_pm_phase7_capacity_v1` | Weekly capacity per assignee | Enables overload scoring + capacity alerts. |
| `stark_pm_phase8_pinned_views_v1` | Ops pinned views | 1-click jumps to your saved checklist filters. |
| `stark_pm_phase8_notify_state_v1` | Dismissed notifications | Keeps the Notifications Center clean without losing data. |
| `stark_pm_phase9_reminder_rules_v1` | Reminder rules toggles | Choose what notifications you want to see. |
| `stark_pm_phase9_notify_snooze_v1` | Notification snooze map | Temporarily hides specific notifications. |
| `stark_pm_phase10_task_bundle_templates_v1` | Task bundle templates | Save and re-apply selected/visible tasks as a bundle. |
| `stark_pm_phase10_review_marks_v1` | Review generation marks | Prevents duplicate daily/weekly review tasks. |
| `stark_pm_phase10_approval_cfg_v1` | Approval gate toggles | Enables/disables confirmation gates. |
| `stark_pm_phase10_mentions_v1` | Mention follow-ups | Tracks follow-ups derived from `@mentions` in task threads. |
| `stark_pm_phase10_mentions_snooze_v1` | Mention snoozes | Temporarily hides mention follow-up notifications. |
| `stark_pm_phase10_workload_trends_v1` | Workload trend snapshots | Lightweight history of assignee workload scoring. |
| `stark_pm_phase11_sla_cfg_v1` | SLA stale thresholds | Controls stale alert sensitivity. |
| `stark_pm_phase11_dashboard_views_v1` | Saved dashboard views | Jump back to dashboard sections quickly. |
| `stark_pm_phase12_cfg_v1` | Risk/check-in/audit config | Controls stale audit cooldown, check-in generation, risk digest scope, and dashboard view import mode. |
| `stark_pm_phase12_stale_audit_v1` | Stale breach/recovery state | Tracks who is currently “stale” so transitions can be logged. |
| `stark_pm_phase13_cfg_v1` | Automation engine settings | Recurring sweeper, SLA action rules, bulk maintenance defaults. |
| `stark_pm_phase13_marks_v1` | Automation last-run marks | Cooldown tracking for automation auto-run. |
| `stark_pm_phase13_digest_presets_v1` | Digest presets | Reusable “risk/status export” configurations. |
| `stark_pm_phase13_followup_ui_v1` | Follow-up UI prefs | Keeps follow-up panel state stable across reloads. |
| `stark_pm_phase14_export_ui_v1` | Export Center UI state | Remembers what you last exported and in what format/scope. |
| `stark_pm_phase14_approval_audit_v1` | Approval audit trail | Persistent review/approve/lock history. |
| `stark_pm_phase15_rbac_cfg_v1` | RBAC default policy | Governance defaults for review/approval/lock actions. |
| `stark_pm_phase15_session_v1` | Current role/name session | Who you are “acting as” for RBAC checks. |
| `stark_pm_phase16_team_profiles_v1` | Team profiles | Saved identity profiles; syncs into RBAC session. |
| `stark_pm_phase16_ui_polish_v1` | UI polish prefs | Remembers sidebar/catalog presentation tweaks. |
| `stark_pm_phase17_portfolio_v1` | Portfolio filters | Keeps your portfolio query/status/sort across reloads. |

</details>

---

## Quick start

### Option A — Open directly
Open:
- `ProjectManagement/index.html`

### Option B — Run a local static server (recommended)
Some browsers behave better with a local server (audio, file handling, caching).

```bash
cd ProjectManagement
python -m http.server 8080
```

Then visit `http://localhost:8080`.

---

## Data storage & privacy

- App state is saved to your browser’s **localStorage** under:
  - `stark_pm_v1` (main app data)
  - `stark_pm_phase5_ui` (small UI preferences, e.g., checklist view)
- Use **Wipe** (top-right) to clear local data.
- Use **Export JSON** to back up your state.

---

## Import formats

### Markdown / Text import (`.md` / `.txt`)
Import is **best-effort** and designed to work well with “PM template” style plans.

Supported patterns:
- **Modules**: `MODULE 1 - Something` / `MODULE 2 — Something`
- **Milestones**:
  - `M0 — Something`, `M1 - Something`
  - `Milestone: Something`
  - Markdown headings: `## Something`
  - Numbered headings: `1) Something`, `2. Something`
- **Tasks**:
  - `- [ ] task`, `- [x] task`
  - `- task`, `* task`
  - `[ ] task`, `[x] task`
- **Steps (subtasks)**: indented bullets under the most recent task (2+ spaces or a tab)

Optional `@pm` metadata (round-trip friendly via exports):
- `@pm project status=active tag=...`
- `@pm module status=todo tag=...`
- `@pm milestone priority=p1 state=doing`
- `@pm notes: ...`
- Multiline blocks:
  - `@pm desc: <<<` … `@pm desc: >>>`
  - `@pm notes: <<<` … `@pm notes: >>>`

Example (minimal):
```md
# My Project

MODULE 1 - Core Data
M0 — Scope Guardrails
- [ ] Define invariants
  - [ ] Step 1: Write tests
  - [ ] Step 2: Validate edge cases
- [x] Baseline import/export

M1 — UI Polish
- [ ] Fix sidebar grouping
```

### JSON import (`.json`)
Use this to restore from an **Export JSON** file. The Import tab will preview the restore before applying.

---

## Export

Top bar actions:
- **Export JSON**: full app state backup (recommended for restores)
- **Export MD**: export the active project as Markdown
- **Export TXT**: export the active project as plain text
- **Undo / Redo**:
  - Undo: `Ctrl/Cmd + Z`
  - Redo: `Shift + Ctrl/Cmd + Z` (and `Ctrl + Y` is supported in some flows)

---

## Tech notes

- **Pure frontend**: `index.html` + `styles.css` + `app.js`
- Animations via **anime.js** (loaded from jsDelivr CDN):
  - `https://cdn.jsdelivr.net/npm/animejs@4.0.1/dist/bundles/anime.umd.min.js`
- Optional startup sound:
  - `ProjectManagement/UIFX/startup.wav`

---

## Repo structure

```
ProjectManagement/
  index.html
  styles.css
  app.js
  favicon.ico
  UIFX/
    startup.wav
```

---

## Contributing (lightweight)

- Keep changes small and scoped.
- Prefer UI-only changes without rewriting core logic.
- If adding parsing rules, include a small example input in the PR description.
