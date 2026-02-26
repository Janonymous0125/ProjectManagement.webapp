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