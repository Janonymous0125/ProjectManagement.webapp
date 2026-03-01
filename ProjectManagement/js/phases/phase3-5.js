/* ---------------------------
   Phase 3 Enhancements
   - Global search command palette (Ctrl/Cmd+K)
   - Project archive mode + filtering
   - Project templates
   - Checklist filters + bulk actions
---------------------------- */
var phase3State_ = {
  inited: false,
  patched: false,
  projectQuery: "",
  showArchived: false,
  taskQuery: "",
  taskStatus: "all",   // all | open | done
  taskSeverity: "all", // all | normal | high | blocker
  taskSelection: new Set(),
  cmdOpen: false,
  cmdIndex: 0,
};

function initPhase3_(){
  if(phase3State_.inited) return;
  phase3State_.inited = true;

  injectPhase3Styles_();
  ensurePhase3ProjectControls_();
  ensurePhase3ChecklistControls_();
  ensurePhase3CommandPalette_();
  patchPhase3Renderers_();
  patchPhase3Behavior_();

  // Refresh once after patching so post-render hooks run.
  try{ renderAll(); }catch{ /* ignore */ }
}

function injectPhase3Styles_(){
  if(document.querySelector("#phase3Styles")) return;
  const st = document.createElement("style");
  st.id = "phase3Styles";
  st.textContent = `
    .phase3-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0 12px}
    .phase3-toolbar .input,.phase3-toolbar .select{min-width:0}
    .phase3-toolbar .input{flex:1 1 200px}
    .phase3-toolbar .btn{white-space:nowrap}
    .phase3-sep{width:1px;height:20px;background:rgba(255,255,255,.12)}
    .phase3-muted{opacity:.8;font-size:12px}
    .phase3-empty{margin-top:10px;padding:10px;border:1px dashed rgba(255,255,255,.14);border-radius:10px;color:var(--muted,#9fb3c8)}
    .phase3-taskPick{appearance:none;width:16px;height:16px;border:1px solid rgba(255,255,255,.24);border-radius:4px;background:transparent;cursor:pointer;margin:0 6px 0 2px;align-self:flex-start;position:relative;top:2px}
    .phase3-taskPick:checked{background:rgba(0,255,255,.18);border-color:rgba(0,255,255,.55);box-shadow:0 0 0 1px rgba(0,255,255,.15) inset}
    .phase3-taskPick:checked::after{content:"✓";display:block;text-align:center;line-height:14px;font-size:11px;color:#bff}
    .task.phase3-hidden{display:none!important}
    .task.is-selected{outline:1px solid rgba(0,255,255,.35);box-shadow:0 0 0 1px rgba(0,255,255,.08) inset}
    .phase3-taskHeader{display:flex;align-items:center;gap:6px;min-width:0}
    .phase3-taskHeader .task__title{margin:0}
    .phase3-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);font-size:12px;background:rgba(255,255,255,.02)}
    .phase3-chip input{margin:0}
    .phase3-project-archived .item__title{opacity:.75}
    .phase3-archived-badge{border-color:rgba(255,165,0,.35)!important;color:#ffd39a}
    .phase3-cmdk{position:fixed;inset:0;display:none;z-index:60;background:rgba(5,8,14,.58);backdrop-filter:blur(8px)}
    .phase3-cmdk.is-open{display:block}
    .phase3-cmdk__panel{width:min(860px,92vw);max-height:min(78vh,720px);margin:7vh auto 0;background:rgba(10,14,24,.9);border:1px solid rgba(255,255,255,.12);border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden}
    .phase3-cmdk__top{display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid rgba(255,255,255,.08)}
    .phase3-cmdk__search{flex:1;background:transparent;border:0;outline:0;color:inherit;font-size:15px}
    .phase3-cmdk__hint{font-size:11px;opacity:.7;white-space:nowrap}
    .phase3-cmdk__list{overflow:auto;padding:8px}
    .phase3-cmdk__item{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:12px;cursor:pointer;border:1px solid transparent}
    .phase3-cmdk__item:hover,.phase3-cmdk__item.is-active{background:rgba(255,255,255,.03);border-color:rgba(0,255,255,.22)}
    .phase3-cmdk__main{min-width:0}
    .phase3-cmdk__title{font-size:14px}
    .phase3-cmdk__sub{font-size:12px;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .phase3-cmdk__tag{font-size:11px;opacity:.85;white-space:nowrap}
    .phase3-cmdk__empty{padding:14px 12px;color:var(--muted,#9fb3c8)}
    .phase3-topbarSearchBtn{font-weight:600}
    .phase3-topbarSearchBtn .phase3-kbd{opacity:.75;font-size:11px;margin-left:4px}
    .phase3-taskTools{margin-bottom:10px}
    .phase3-taskTools .select{min-width:120px}
    .phase3-taskTools .input{min-width:180px}
    .phase3-taskTools .btn.btn--mini{padding:5px 8px;font-size:12px}
  `;
  document.head.appendChild(st);
}

function ensurePhase3ProjectControls_(){
  // Project list controls
  const projectList = document.querySelector("#projectList");
  if(projectList && !document.querySelector("#phase3ProjectToolbar")){
    const toolbar = document.createElement("div");
    toolbar.id = "phase3ProjectToolbar";
    toolbar.className = "phase3-toolbar";
    toolbar.innerHTML = `
      <input id="phase3ProjectSearch" class="input" type="text" placeholder="Filter projects (name / tag / desc)…" />
      <label class="phase3-chip"><input type="checkbox" id="phase3ShowArchived" /> Show archived</label>
      <button class="btn btn--ghost" id="phase3BtnTemplate" type="button">Templates</button>
      <span class="phase3-muted" id="phase3ProjectFilterInfo">All projects</span>
    `;
    projectList.parentElement.insertBefore(toolbar, projectList);

    const search = toolbar.querySelector("#phase3ProjectSearch");
    const showArchived = toolbar.querySelector("#phase3ShowArchived");
    const btnTpl = toolbar.querySelector("#phase3BtnTemplate");

    search.addEventListener("input", () => {
      phase3State_.projectQuery = (search.value || "").trim();
      renderProjects();
    });
    showArchived.addEventListener("change", () => {
      phase3State_.showArchived = !!showArchived.checked;
      renderProjects();
    });
    btnTpl.addEventListener("click", phase3OpenTemplatePrompt_);
  }

  // Archive/unarchive button in project detail actions row
  const actions = document.querySelector("#btnDeleteProject")?.closest(".row");
  if(actions && !document.querySelector("#phase3BtnArchiveProject")){
    const btn = document.createElement("button");
    btn.id = "phase3BtnArchiveProject";
    btn.type = "button";
    btn.className = "btn btn--ghost";
    btn.textContent = "Archive";
    btn.addEventListener("click", phase3ToggleArchiveActiveProject_);
    // insert before delete
    const del = document.querySelector("#btnDeleteProject");
    actions.insertBefore(btn, del);
  }
}

function ensurePhase3ChecklistControls_(){
  const taskList = document.querySelector("#taskList");
  if(taskList && !document.querySelector("#phase3TaskToolbar")){
    const box = document.createElement("div");
    box.id = "phase3TaskToolbar";
    box.className = "phase3-toolbar phase3-taskTools";
    box.innerHTML = `
      <input id="phase3TaskSearch" class="input" type="text" placeholder="Filter tasks (title / assignee / steps)…" />
      <select id="phase3TaskStatus" class="select">
        <option value="all">All</option>
        <option value="open">Open</option>
        <option value="done">Done</option>
      </select>
      <select id="phase3TaskSeverity" class="select">
        <option value="all">All Severities</option>
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="blocker">Blocker</option>
      </select>
      <button class="btn btn--ghost btn--mini" id="phase3BtnSelectVisible" type="button">Select Visible</button>
      <button class="btn btn--ghost btn--mini" id="phase3BtnClearSelection" type="button">Clear Sel</button>
      <button class="btn btn--ghost btn--mini" id="phase3BtnBulkDone" type="button">Bulk Done</button>
      <button class="btn btn--ghost btn--mini" id="phase3BtnBulkOpen" type="button">Bulk Reopen</button>
      <button class="btn btn--ghost btn--mini" id="phase3BtnBulkDelete" type="button">Bulk Delete</button>
      <span class="phase3-muted" id="phase3TaskFilterInfo">No filter</span>
    `;
    taskList.parentElement.insertBefore(box, taskList);

    box.querySelector("#phase3TaskSearch").addEventListener("input", (e) => {
      phase3State_.taskQuery = String(e.target.value || "").trim();
      renderChecklist();
    });
    box.querySelector("#phase3TaskStatus").addEventListener("change", (e) => {
      phase3State_.taskStatus = String(e.target.value || "all");
      renderChecklist();
    });
    box.querySelector("#phase3TaskSeverity").addEventListener("change", (e) => {
      phase3State_.taskSeverity = String(e.target.value || "all");
      renderChecklist();
    });

    box.querySelector("#phase3BtnSelectVisible").addEventListener("click", phase3ToggleSelectVisibleTasks_);
    box.querySelector("#phase3BtnClearSelection").addEventListener("click", phase3ClearCurrentTaskSelection_);
    box.querySelector("#phase3BtnBulkDone").addEventListener("click", () => phase3BulkSetTaskDone_(true));
    box.querySelector("#phase3BtnBulkOpen").addEventListener("click", () => phase3BulkSetTaskDone_(false));
    box.querySelector("#phase3BtnBulkDelete").addEventListener("click", phase3BulkDeleteTasks_);
  }
}

function ensurePhase3CommandPalette_(){
  const topbarRight = document.querySelector(".topbar__right");
  if(topbarRight && !document.querySelector("#phase3BtnCmdk")){
    const btn = document.createElement("button");
    btn.id = "phase3BtnCmdk";
    btn.className = "btn btn--ghost phase3-topbarSearchBtn";
    btn.type = "button";
    btn.innerHTML = `Search <span class="phase3-kbd">Ctrl/Cmd+K</span>`;
    btn.addEventListener("click", () => phase3OpenCmdk_());
    // Insert near undo/redo
    const anchor = document.querySelector("#btnExportJson") || topbarRight.firstElementChild;
    topbarRight.insertBefore(btn, anchor);
  }

  if(document.querySelector("#phase3Cmdk")) return;
  const wrap = document.createElement("div");
  wrap.id = "phase3Cmdk";
  wrap.className = "phase3-cmdk";
  wrap.innerHTML = `
    <div class="phase3-cmdk__panel" role="dialog" aria-modal="true" aria-label="Global Search & Command Palette">
      <div class="phase3-cmdk__top">
        <span>⌕</span>
        <input id="phase3CmdkInput" class="phase3-cmdk__search" type="text" placeholder="Search projects, milestones, tasks, or run a command…" />
        <span class="phase3-cmdk__hint">Enter • Esc • ↑↓</span>
      </div>
      <div id="phase3CmdkList" class="phase3-cmdk__list"></div>
    </div>
  `;
  document.body.appendChild(wrap);

  wrap.addEventListener("click", (e) => {
    if(e.target === wrap) phase3CloseCmdk_();
  });

  const input = wrap.querySelector("#phase3CmdkInput");
  const list = wrap.querySelector("#phase3CmdkList");

  input.addEventListener("input", () => {
    phase3State_.cmdIndex = 0;
    phase3RenderCmdkResults_();
  });

  input.addEventListener("keydown", (e) => {
    const items = Array.from(list.querySelectorAll(".phase3-cmdk__item"));
    if(e.key === "Escape"){
      e.preventDefault();
      phase3CloseCmdk_();
      return;
    }
    if(e.key === "ArrowDown"){
      e.preventDefault();
      phase3State_.cmdIndex = Math.min(items.length - 1, phase3State_.cmdIndex + 1);
      phase3RenderCmdkResults_();
      return;
    }
    if(e.key === "ArrowUp"){
      e.preventDefault();
      phase3State_.cmdIndex = Math.max(0, phase3State_.cmdIndex - 1);
      phase3RenderCmdkResults_();
      return;
    }
    if(e.key === "Enter"){
      e.preventDefault();
      const data = items[phase3State_.cmdIndex]?.dataset?.payload;
      if(!data) return;
      try{
        phase3RunCmdkAction_(JSON.parse(data));
      }catch{
        // ignore malformed payload
      }
    }
  });
}

function patchPhase3Renderers_(){
  if(phase3State_.patched) return;
  phase3State_.patched = true;

  const baseRenderProjects = renderProjects;
  renderProjects = function(){
    baseRenderProjects();
    phase3PostRenderProjects_();
  };

  const baseRenderChecklist = renderChecklist;
  renderChecklist = function(){
    baseRenderChecklist();
    phase3PostRenderChecklist_();
  };

  const baseCollectHotTasks = collectHotTasks;
  collectHotTasks = function(limit){
    const out = baseCollectHotTasks(Math.max(limit || 0, 40));
    return out.filter(h => !Boolean(h?.project?.archived)).slice(0, limit);
  };
}

function patchPhase3Behavior_(){
  document.addEventListener("keydown", (e) => {
    if(e.defaultPrevented) return;
    const key = String(e.key || "").toLowerCase();

    // Global command palette
    if((e.ctrlKey || e.metaKey) && key === "k"){
      e.preventDefault();
      phase3OpenCmdk_();
      return;
    }

    // quick focus for checklist filter when checklist tab active
    if(key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey){
      const activeTab = document.querySelector(".tab.is-active")?.dataset?.tab;
      if(activeTab === "checklist" && !isTypingTarget_(e.target)){
        const inp = document.querySelector("#phase3TaskSearch");
        if(inp){
          e.preventDefault();
          inp.focus();
          inp.select();
        }
      }
    }
  });
}

function phase3PostRenderProjects_(){
  const list = ui.projectList;
  if(!list) return;

  const pSearch = document.querySelector("#phase3ProjectSearch");
  const pShow = document.querySelector("#phase3ShowArchived");
  const pInfo = document.querySelector("#phase3ProjectFilterInfo");
  if(pSearch && pSearch.value !== phase3State_.projectQuery) pSearch.value = phase3State_.projectQuery;
  if(pShow) pShow.checked = !!phase3State_.showArchived;

  const cards = Array.from(list.querySelectorAll(".item"));
  const projects = Array.isArray(state.projects) ? state.projects : [];
  if(cards.length && cards.length === projects.length){
    let visible = 0;
    const q = phase3State_.projectQuery.trim().toLowerCase();

    cards.forEach((el, idx) => {
      const p = projects[idx];
      if(!p) return;
      const hay = `${p.name} ${p.tag || ""} ${p.desc || ""}`.toLowerCase();
      const matchQuery = !q || hay.includes(q);
      const matchArchive = phase3State_.showArchived ? true : !Boolean(p.archived);
      const show = matchQuery && matchArchive;

      el.classList.toggle("phase3-project-archived", !!p.archived);
      // add archived badge once
      const sub = el.querySelector(".item__sub");
      if(sub && p.archived && !sub.querySelector(".phase3-archived-badge")){
        const badge = document.createElement("span");
        badge.className = "badge phase3-archived-badge";
        badge.textContent = "ARCHIVED";
        sub.appendChild(badge);
      }

      el.style.display = show ? "" : "none";
      if(show) visible++;
    });

    let empty = document.querySelector("#phase3ProjectsEmpty");
    if(!empty){
      empty = document.createElement("div");
      empty.id = "phase3ProjectsEmpty";
      empty.className = "phase3-empty";
      list.parentElement.appendChild(empty);
    }
    empty.textContent = "No projects match the current filter.";
    empty.style.display = visible ? "none" : (projects.length ? "" : "none");

    if(pInfo){
      const archivedCount = projects.filter(p => p && p.archived).length;
      pInfo.textContent = `${visible}/${projects.length} visible • ${archivedCount} archived`;
    }
  }else{
    const empty = document.querySelector("#phase3ProjectsEmpty");
    if(empty) empty.style.display = "none";
    if(pInfo) pInfo.textContent = "All projects";
  }

  // Keep project details archive button state synced
  const ap = getActiveProject();
  const btnArchive = document.querySelector("#phase3BtnArchiveProject");
  if(btnArchive){
    btnArchive.disabled = !ap;
    btnArchive.textContent = ap && ap.archived ? "Unarchive" : "Archive";
    btnArchive.title = ap ? (ap.archived ? "Move project back to active list" : "Hide project in archive mode") : "Select a project first";
  }

  // Soft hint near active project label if active project is archived
  if(ui.activeProjectName){
    ui.activeProjectName.title = (ap && ap.archived) ? "Archived project (hidden when 'Show archived' is off)" : "";
  }
}

function phase3TaskMatchesFilter_(task){
  if(!task) return false;

  if(phase3State_.taskStatus === "open" && task.done) return false;
  if(phase3State_.taskStatus === "done" && !task.done) return false;
  if(phase3State_.taskSeverity !== "all" && task.severity !== phase3State_.taskSeverity) return false;

  const q = phase3State_.taskQuery.trim().toLowerCase();
  if(!q) return true;

  let stepText = "";
  try{
    walkSteps_(task.steps || [], (s) => { stepText += " " + String(s.text || ""); });
  }catch{ /* ignore */ }

  const hay = `${task.title || ""} ${task.assignee || ""} ${stepText}`.toLowerCase();
  return hay.includes(q);
}

function phase3PostRenderChecklist_(){
  const taskList = ui.taskList;
  const info = document.querySelector("#phase3TaskFilterInfo");
  const inp = document.querySelector("#phase3TaskSearch");
  const statusSel = document.querySelector("#phase3TaskStatus");
  const sevSel = document.querySelector("#phase3TaskSeverity");
  if(inp && inp.value !== phase3State_.taskQuery) inp.value = phase3State_.taskQuery;
  if(statusSel) statusSel.value = phase3State_.taskStatus;
  if(sevSel) sevSel.value = phase3State_.taskSeverity;

  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  if(!p || !m || !taskList){
    const empty = document.querySelector("#phase3TasksEmpty");
    if(empty) empty.style.display = "none";
    if(info) info.textContent = "No filter";
    return;
  }

  const tasks = Array.isArray(m.tasks) ? m.tasks : [];
  const cards = Array.from(taskList.querySelectorAll(".task"));
  // cleanup stale selection (tasks not in active milestone)
  const idsNow = new Set(tasks.map(t => t.id));
  for(const id of Array.from(phase3State_.taskSelection)){
    if(!idsNow.has(id)) phase3State_.taskSelection.delete(id);
  }

  let visible = 0;
  let selectedVisible = 0;

  cards.forEach((el, idx) => {
    const t = tasks[idx];
    if(!t) return;
    el.dataset.taskId = t.id;

    // Insert pick checkbox once
    let pick = el.querySelector(".phase3-taskPick");
    if(!pick){
      pick = document.createElement("input");
      pick.type = "checkbox";
      pick.className = "phase3-taskPick";
      pick.title = "Select task for bulk actions";
      pick.addEventListener("click", (e) => e.stopPropagation());
      pick.addEventListener("change", (e) => {
        const checked = !!e.target.checked;
        if(checked) phase3State_.taskSelection.add(t.id);
        else phase3State_.taskSelection.delete(t.id);
        phase3PostRenderChecklist_();
      });

      // Place before task body so the done-toggle remains the first control.
      const body = el.querySelector(".task__body");
      if(body){
        el.insertBefore(pick, body);
      }else{
        el.appendChild(pick);
      }
    }

    const match = phase3TaskMatchesFilter_(t);
    el.classList.toggle("phase3-hidden", !match);

    const isSel = phase3State_.taskSelection.has(t.id);
    pick.checked = isSel;
    el.classList.toggle("is-selected", isSel);

    if(match){
      visible++;
      if(isSel) selectedVisible++;
    }

    // Add tiny ARCHIVED label to scope if project archived (once per render via hint text below)
  });

  let empty = document.querySelector("#phase3TasksEmpty");
  if(!empty){
    empty = document.createElement("div");
    empty.id = "phase3TasksEmpty";
    empty.className = "phase3-empty";
    empty.textContent = "No tasks match the current checklist filters.";
    taskList.parentElement.appendChild(empty);
  }
  empty.style.display = (tasks.length && visible === 0) ? "" : "none";

  const activeCount = tasks.length;
  const selectedCount = Array.from(phase3State_.taskSelection).filter(id => idsNow.has(id)).length;

  if(info){
    const bits = [];
    if(phase3State_.taskQuery) bits.push(`search`);
    if(phase3State_.taskStatus !== "all") bits.push(phase3State_.taskStatus);
    if(phase3State_.taskSeverity !== "all") bits.push(phase3State_.taskSeverity);
    const label = bits.length ? bits.join(" • ") : "No filter";
    info.textContent = `${label} • visible ${visible}/${activeCount} • selected ${selectedCount}`;
  }

  if(ui.taskScopeHint){
    const base = `${p.name} • ${m.title}${p.archived ? " • ARCHIVED" : ""}`;
    ui.taskScopeHint.textContent = `${base} • ${visible}/${activeCount} shown`;
  }

  // Update action button labels
  const btnSelectVisible = document.querySelector("#phase3BtnSelectVisible");
  if(btnSelectVisible){
    btnSelectVisible.textContent = (visible && selectedVisible === visible) ? "Deselect Visible" : "Select Visible";
  }
}

function phase3GetChecklistContext_(){
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  return { p, m };
}

function phase3GetVisibleTaskIds_(m){
  const out = [];
  for(const t of (m?.tasks || [])){
    if(phase3TaskMatchesFilter_(t)) out.push(t.id);
  }
  return out;
}

function phase3ToggleSelectVisibleTasks_(){
  const { m } = phase3GetChecklistContext_();
  if(!m) return;
  const ids = phase3GetVisibleTaskIds_(m);
  if(!ids.length) return;
  const allSelected = ids.every(id => phase3State_.taskSelection.has(id));
  if(allSelected){
    ids.forEach(id => phase3State_.taskSelection.delete(id));
  }else{
    ids.forEach(id => phase3State_.taskSelection.add(id));
  }
  renderChecklist();
}

function phase3ClearCurrentTaskSelection_(){
  const { m } = phase3GetChecklistContext_();
  if(!m) return;
  const ids = new Set((m.tasks || []).map(t => t.id));
  for(const id of Array.from(phase3State_.taskSelection)){
    if(ids.has(id)) phase3State_.taskSelection.delete(id);
  }
  renderChecklist();
}

function phase3GetSelectedTaskIdsForCurrentMilestone_(){
  const { m } = phase3GetChecklistContext_();
  if(!m) return [];
  const ids = new Set((m.tasks || []).map(t => t.id));
  return Array.from(phase3State_.taskSelection).filter(id => ids.has(id));
}

function phase3BulkSetTaskDone_(done){
  const { p, m } = phase3GetChecklistContext_();
  if(!m || !p) return;

  let ids = phase3GetSelectedTaskIdsForCurrentMilestone_();
  if(!ids.length){
    ids = phase3GetVisibleTaskIds_(m);
    if(!ids.length) return;
  }

  let changed = 0;
  for(const t of (m.tasks || [])){
    if(ids.includes(t.id) && t.done !== !!done){
      t.done = !!done;
      changed++;
    }
  }
  if(!changed) return;

  addActivity(`${done ? "Marked done" : "Reopened"} ${changed} task(s) in ${m.title}`);
  saveState();
  renderAll();
}

async function phase3BulkDeleteTasks_(){
  const { p, m } = phase3GetChecklistContext_();
  if(!m || !p) return;

  let ids = phase3GetSelectedTaskIdsForCurrentMilestone_();
  if(!ids.length){
    ids = phase3GetVisibleTaskIds_(m);
    if(!ids.length) return;
  }

  const msg = `Delete ${ids.length} task(s) from "${m.title}"?`;
  const ok = await pmConfirmDialog_(msg, { title:'Bulk Delete Tasks', okText:'Delete', danger:true });
  if(!ok) return;

  const idSet = new Set(ids);
  const before = m.tasks.length;
  m.tasks = (m.tasks || []).filter(t => !idSet.has(t.id));
  for(const id of ids) phase3State_.taskSelection.delete(id);
  const removed = before - m.tasks.length;
  if(!removed) return;

  addActivity(`Bulk deleted ${removed} task(s) in ${m.title}`);
  saveState();
  renderAll();
}

async function phase3ToggleArchiveActiveProject_(){
  const p = getActiveProject();
  if(!p) return;

  const next = !Boolean(p.archived);
  if(next){
    // Optional safety prompt if there are open tasks
    const counts = computeProjectCounts(p);
    const open = Math.max(0, counts.tasks - counts.done);
    if(open > 0){
      const ok = await pmConfirmDialog_(`Archive "${p.name}" with ${open} open task(s)?`, { title:'Archive Project', okText:'Archive' });
      if(!ok) return;
    }
  }

  p.archived = next;
  addActivity(`${next ? "Archived" : "Unarchived"} project: ${p.name}`);

  // If hidden archive mode is active and the active project was archived, switch to the first visible project.
  if(next && !phase3State_.showArchived){
    const nextVisible = (state.projects || []).find(x => x && !x.archived && x.id !== p.id) || null;
    if(nextVisible){
      state.activeProjectId = nextVisible.id;
      const mods = Array.isArray(nextVisible.modules) ? nextVisible.modules : [];
      state.activeModuleId = mods[0]?.id ?? null;
      state.activeMilestoneId = (mods[0]?.milestones || [])[0]?.id ?? null;
    }
  }

  saveState();
  renderAll();
}

function phase3Templates_(){
  return [
    {
      key: "software-module",
      name: "Software Module Build",
      summary: "Planning → Build → QA → Release",
      modules: [
        {
          name: "Module 1 - Planning & Setup",
          milestones: [
            {
              title: "Requirements + Architecture",
              tasks: [
                { title: "Define scope and constraints", severity: "high" },
                { title: "Create milestone breakdown" },
                { title: "Confirm acceptance criteria", severity: "high" },
              ],
            },
            {
              title: "Environment + Foundation",
              tasks: [
                { title: "Prepare local/dev environment" },
                { title: "Set coding standards + lint checks" },
                { title: "Create base folders + app shell" },
              ],
            },
          ],
        },
        {
          name: "Module 2 - Implementation",
          milestones: [
            {
              title: "Core Features",
              tasks: [
                { title: "Implement feature set A", severity: "high" },
                { title: "Implement feature set B" },
                { title: "Add validation and error handling", severity: "blocker" },
              ],
            },
            {
              title: "QA + Release",
              tasks: [
                { title: "Write regression checklist", severity: "high" },
                { title: "Run end-to-end verification" },
                { title: "Prepare release notes + backup" },
              ],
            },
          ],
        },
      ],
    },
    {
      key: "client-delivery",
      name: "Client Delivery Project",
      summary: "Discovery → Delivery → Handover",
      modules: [
        {
          name: "Module 1 - Discovery",
          milestones: [
            {
              title: "Client Intake",
              tasks: [
                { title: "Capture requirements", severity: "high" },
                { title: "Collect reference files and constraints" },
                { title: "Define timeline + milestones", severity: "high" },
              ],
            },
            {
              title: "Proposal + Approval",
              tasks: [
                { title: "Draft scope proposal" },
                { title: "Align deliverables with client", severity: "high" },
                { title: "Lock baseline version" },
              ],
            },
          ],
        },
        {
          name: "Module 2 - Delivery",
          milestones: [
            {
              title: "Build + Review",
              tasks: [
                { title: "Implement deliverable v1" },
                { title: "Internal QA pass", severity: "high" },
                { title: "Client review + revisions", severity: "high" },
              ],
            },
            {
              title: "Handover",
              tasks: [
                { title: "Package final files" },
                { title: "Write user guide / notes" },
                { title: "Handover and sign-off", severity: "blocker" },
              ],
            },
          ],
        },
      ],
    },
    {
      key: "research-sprint",
      name: "Research Sprint",
      summary: "Question → Experiments → Findings",
      modules: [
        {
          name: "Module 1 - Research Setup",
          milestones: [
            {
              title: "Research Question + Plan",
              tasks: [
                { title: "Define research objective", severity: "high" },
                { title: "List hypotheses" },
                { title: "Create experiment checklist" },
              ],
            },
            {
              title: "Data + Tools",
              tasks: [
                { title: "Collect references / datasets", severity: "high" },
                { title: "Set evaluation criteria" },
                { title: "Prepare log template for results" },
              ],
            },
          ],
        },
        {
          name: "Module 2 - Experiment + Report",
          milestones: [
            {
              title: "Experiments",
              tasks: [
                { title: "Run experiment batch 1", severity: "high" },
                { title: "Run experiment batch 2" },
                { title: "Compare outcomes + anomalies", severity: "high" },
              ],
            },
            {
              title: "Report + Next Steps",
              tasks: [
                { title: "Summarize findings" },
                { title: "Document recommendations", severity: "high" },
                { title: "Define follow-up tasks" },
              ],
            },
          ],
        },
      ],
    },
  ];
}

async function phase3OpenTemplatePrompt_(){
  const templates = phase3Templates_();
  const lines = templates.map((t, i) => `${i + 1}. ${t.name} — ${t.summary}`);
  const ans = await pmPromptDialog_(`Create project from template:\n\n${lines.join("\n")}\n\nEnter number or key`, '1', { title:'Project Templates', placeholder:'1 / key' });
  if(ans == null) return;
  const raw = String(ans).trim().toLowerCase();
  if(!raw) return;
  let tpl = templates.find(t => t.key === raw) || null;
  if(!tpl){
    const idx = Number(raw);
    if(Number.isFinite(idx) && idx >= 1 && idx <= templates.length) tpl = templates[idx - 1];
  }
  if(!tpl){
    alert("Template not found.");
    return;
  }
  await phase3CreateProjectFromTemplate_(tpl);
}

async function phase3CreateProjectFromTemplate_(tpl){
  if(!tpl) return;
  const customName = await pmPromptDialog_('Project name?', tpl.name, { title:'Create Project From Template', placeholder:'Project name' });
  if(customName == null) return;
  const name = String(customName).trim() || tpl.name;

  /** @type {Project} */
  const p = {
    id: uid(),
    name,
    desc: `Template: ${tpl.name}`,
    status: "active",
    tag: "template",
    archived: false,
    modules: [],
    createdAt: Date.now(),
  };

  const modules = [];
  for(const mdef of (tpl.modules || [])){
    const mod = mkModule(mdef.name || "Module");
    mod.milestones = [];
    for(const msdef of (mdef.milestones || [])){
      const ms = mkMilestone(msdef.title || "Milestone");
      ms.tasks = [];
      for(const tdef of (msdef.tasks || [])){
        const t = mkTask(tdef.title || "Task", false);
        if(tdef.severity && (tdef.severity === "normal" || tdef.severity === "high" || tdef.severity === "blocker")) t.severity = tdef.severity;
        if(tdef.assignee) t.assignee = String(tdef.assignee);
        ms.tasks.push(t);
      }
      mod.milestones.push(ms);
    }
    if(!mod.milestones.length) mod.milestones.push(mkMilestone("General"));
    modules.push(mod);
  }
  p.modules = modules.length ? modules : [ mkModule("General") ];

  state.projects.unshift(p);
  state.activeProjectId = p.id;
  state.activeModuleId = p.modules[0]?.id ?? null;
  state.activeMilestoneId = p.modules[0]?.milestones?.[0]?.id ?? null;

  addActivity(`Created project from template: ${p.name}`);
  saveState();
  renderAll();
  switchTab("projects");
}

function phase3BuildCmdkItems_(query){
  const q = String(query || "").trim().toLowerCase();
  const items = [];

  // Commands
  const commands = [
    { kind:"command", title:"Go: Dashboard", sub:"Switch tab", tag:"TAB", act:"tab", tab:"dashboard" },
    { kind:"command", title:"Go: Project", sub:"Switch tab", tag:"TAB", act:"tab", tab:"projects" },
    { kind:"command", title:"Go: Milestone", sub:"Switch tab", tag:"TAB", act:"tab", tab:"milestones" },
    { kind:"command", title:"Go: Checklist", sub:"Switch tab", tag:"TAB", act:"tab", tab:"checklist" },
    { kind:"command", title:"Go: Import", sub:"Switch tab", tag:"TAB", act:"tab", tab:"import" },
    { kind:"command", title:"Create New Project", sub:"Open project flow", tag:"ACTION", act:"newProject" },
    { kind:"command", title:"Create from Template", sub:"Open built-in templates", tag:"ACTION", act:"template" },
    { kind:"command", title:"Export Active Project (MD)", sub:"Topbar export", tag:"ACTION", act:"exportMd" },
    { kind:"command", title:"Export Active Project (TXT)", sub:"Topbar export", tag:"ACTION", act:"exportTxt" },
  ];
  for(const c of commands){
    const hay = `${c.title} ${c.sub} ${c.tag}`.toLowerCase();
    if(!q || hay.includes(q)) items.push(c);
  }

  // Entities
  for(const p of (state.projects || [])){
    const pTag = p.archived ? "PROJECT • ARCHIVED" : "PROJECT";
    const pHay = `${p.name} ${p.tag || ""} ${p.desc || ""}`.toLowerCase();
    if(!q || pHay.includes(q)){
      items.push({ kind:"project", title:p.name, sub:(p.tag || p.status || "project"), tag:pTag, pId:p.id });
    }
    for(const mod of (p.modules || [])){
      const mHay = `${mod.name} ${mod.desc || ""} ${p.name}`.toLowerCase();
      if(!q || mHay.includes(q)){
        items.push({ kind:"module", title:mod.name, sub:p.name, tag:"MODULE", pId:p.id, modId:mod.id });
      }
      for(const ms of (mod.milestones || [])){
        const msHay = `${ms.title} ${ms.notes || ""} ${mod.name} ${p.name}`.toLowerCase();
        if(!q || msHay.includes(q)){
          items.push({ kind:"milestone", title:ms.title, sub:`${p.name} • ${mod.name}`, tag:"MILESTONE", pId:p.id, modId:mod.id, msId:ms.id });
        }
        for(const t of (ms.tasks || [])){
          const tHay = `${t.title} ${t.assignee || ""} ${ms.title} ${mod.name} ${p.name}`.toLowerCase();
          if(!q || tHay.includes(q)){
            items.push({ kind:"task", title:t.title, sub:`${p.name} • ${ms.title}${t.done ? " • DONE" : ""}`, tag:`TASK • ${String(t.severity || "normal").toUpperCase()}`, pId:p.id, modId:mod.id, msId:ms.id, tId:t.id });
          }
        }
      }
    }
  }

  // Simple relevance sort
  const score = (x) => {
    if(!q) return 0;
    const t = String(x.title || "").toLowerCase();
    const s = String(x.sub || "").toLowerCase();
    let sc = 0;
    if(t === q) sc += 100;
    if(t.startsWith(q)) sc += 60;
    if(t.includes(q)) sc += 30;
    if(s.includes(q)) sc += 10;
    if(x.kind === "command") sc += 5;
    return sc;
  };

  items.sort((a,b) => score(b) - score(a) || String(a.title).localeCompare(String(b.title)));
  return items.slice(0, 80);
}

function phase3RenderCmdkResults_(){
  const wrap = document.querySelector("#phase3Cmdk");
  const input = document.querySelector("#phase3CmdkInput");
  const list = document.querySelector("#phase3CmdkList");
  if(!wrap || !input || !list) return;

  const items = phase3BuildCmdkItems_(input.value || "");
  if(!items.length){
    list.innerHTML = `<div class="phase3-cmdk__empty">No results.</div>`;
    phase3State_.cmdIndex = 0;
    return;
  }

  phase3State_.cmdIndex = Math.max(0, Math.min(phase3State_.cmdIndex, items.length - 1));

  list.innerHTML = "";
  items.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "phase3-cmdk__item " + (idx === phase3State_.cmdIndex ? "is-active" : "");
    row.dataset.payload = JSON.stringify(it);
    row.innerHTML = `
      <div class="phase3-cmdk__main">
        <div class="phase3-cmdk__title">${escapeHtml(it.title || "")}</div>
        <div class="phase3-cmdk__sub">${escapeHtml(it.sub || "")}</div>
      </div>
      <div class="phase3-cmdk__tag">${escapeHtml(it.tag || "")}</div>
    `;
    row.addEventListener("mouseenter", () => {
      phase3State_.cmdIndex = idx;
      // visual only, avoid full rerender
      Array.from(list.querySelectorAll(".phase3-cmdk__item")).forEach((el, i) => el.classList.toggle("is-active", i === idx));
    });
    row.addEventListener("click", () => phase3RunCmdkAction_(it));
    list.appendChild(row);
  });

  // Keep active row visible
  const active = list.querySelector(".phase3-cmdk__item.is-active");
  if(active && active.scrollIntoView){
    active.scrollIntoView({ block:"nearest" });
  }
}

function phase3OpenCmdk_(seed){
  const wrap = document.querySelector("#phase3Cmdk");
  const input = document.querySelector("#phase3CmdkInput");
  if(!wrap || !input) return;
  phase3State_.cmdOpen = true;
  wrap.classList.add("is-open");
  if(typeof seed === "string"){
    input.value = seed;
  }
  phase3State_.cmdIndex = 0;
  phase3RenderCmdkResults_();
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

function phase3CloseCmdk_(){
  const wrap = document.querySelector("#phase3Cmdk");
  if(!wrap) return;
  phase3State_.cmdOpen = false;
  wrap.classList.remove("is-open");
}

function phase3RunCmdkAction_(it){
  if(!it || typeof it !== "object") return;
  phase3CloseCmdk_();

  if(it.kind === "command"){
    if(it.act === "tab" && it.tab){ switchTab(it.tab); return; }
    if(it.act === "newProject"){ switchTab("projects"); newProject(); return; }
    if(it.act === "template"){ switchTab("projects"); phase3OpenTemplatePrompt_(); return; }
    if(it.act === "exportMd"){ ui.btnExportMd?.click(); return; }
    if(it.act === "exportTxt"){ ui.btnExportTxt?.click(); return; }
    return;
  }

  if(it.pId) setActiveProject(it.pId);
  if(it.modId) setActiveModule(it.modId);
  if(it.msId) setActiveMilestone(it.msId);

  if(it.kind === "project"){
    switchTab("projects");
    return;
  }
  if(it.kind === "module" || it.kind === "milestone"){
    switchTab("milestones");
    return;
  }
  if(it.kind === "task"){
    switchTab("checklist");
    // Pre-fill checklist filter to surface the task quickly (non-destructive)
    if(it.tId){
      phase3State_.taskStatus = "all";
      phase3State_.taskSeverity = "all";
      phase3State_.taskQuery = String(it.title || "").trim();
      renderChecklist();
      const taskEl = Array.from(document.querySelectorAll("#taskList .task")).find(el => el.dataset.taskId === it.tId && !el.classList.contains("phase3-hidden"));
      if(taskEl){
        taskEl.scrollIntoView({ behavior:"smooth", block:"center" });
        taskEl.classList.add("is-selected");
        setTimeout(() => taskEl.classList.remove("is-selected"), 1200);
      }
    }
    return;
  }
}

// Boot phase-3 after the base app definitions are loaded.
try{ initPhase3_(); }catch(err){ console.warn("Phase3 init failed", err); }

/* =========================================================
   PHASE 4 PATCH (Dependencies, Due Dates, Saved Views, Integrity)
   Additive monkey-patch layer on top of Phase 3
========================================================= */
var phase4State_ = {
  inited: false,
  uiReady: false,
  taskDueFilter: "all", // all|overdue|today|week|has|none
  blockedOnly: false,
  savedViews: {},
  pendingAddDue: null,
  suppressTaskCheckGuard: false,
};

const PHASE4_VIEWS_KEY = "stark_pm_phase4_views_v1";

function initPhase4_(){
  if(phase4State_.inited) return;
  phase4State_.inited = true;

  phase4LoadViews_();
  phase4InjectStyles_();
  phase4EnsureUi_();
  phase4PatchFunctions_();
  phase4WireGuards_();
  phase4NormalizeCurrentState_();
  try{ renderAll(); }catch{ /* ignore */ }
}

function phase4InjectStyles_(){
  if(document.querySelector('#phase4Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase4Styles';
  st.textContent = `
    .phase4-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}
    .phase4-toolbar .select,.phase4-toolbar .input{min-width:0}
    .phase4-toolbar .select{min-width:128px}
    .phase4-toolbar .btn.btn--mini{padding:5px 8px;font-size:12px}
    .phase4-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);font-size:12px;background:rgba(255,255,255,.02)}
    .phase4-due-badge.badge--overdue{border-color:rgba(255,99,99,.45);color:#ffd0d0}
    .phase4-due-badge.badge--today{border-color:rgba(255,215,90,.45);color:#ffe9a3}
    .phase4-due-badge.badge--soon{border-color:rgba(95,220,255,.35);color:#c5f4ff}
    .phase4-blocked-badge{border-color:rgba(255,130,130,.35)!important;color:#ffd0d0}
    .phase4-planner-btn{font-weight:700}
    .phase4-timeline{margin:10px 0 12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px;background:rgba(255,255,255,.015)}
    .phase4-timeline__head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}
    .phase4-timeline__title{font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.85}
    .phase4-timeline__hint{font-size:12px;opacity:.75}
    .phase4-timeline__list{display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:auto}
    .phase4-timeline__row{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:7px 9px;background:rgba(255,255,255,.01);cursor:pointer}
    .phase4-timeline__row:hover{border-color:rgba(0,255,255,.22);background:rgba(255,255,255,.02)}
    .phase4-timeline__row.is-overdue{border-color:rgba(255,99,99,.22)}
    .phase4-timeline__row.is-today{border-color:rgba(255,215,90,.22)}
    .phase4-timeline__left{min-width:0}
    .phase4-timeline__task{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .phase4-timeline__sub{font-size:11px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .phase4-timeline__date{font-size:11px;opacity:.9;white-space:nowrap}
    .phase4-inlineField{margin-top:8px}
    .phase4-taskmeta-note{opacity:.8;font-size:11px}
  `;
  document.head.appendChild(st);
}

function phase4EnsureUi_(){
  if(!window.ui) return;

  // Quick due date input in Add Task card
  if(ui.taskAssignee && !document.querySelector('#phase4TaskDueWrap')){
    const row = ui.taskAssignee.closest('.row') || ui.taskAssignee.closest('.form');
    const actionsRow = ui.btnAddTask ? ui.btnAddTask.closest('.row') : null;
    const wrap = document.createElement('label');
    wrap.id = 'phase4TaskDueWrap';
    wrap.className = 'field phase4-inlineField';
    wrap.innerHTML = `
      <span class="field__label">Due Date (optional)</span>
      <input class="input" id="phase4TaskDue" type="date" />
    `;
    if(actionsRow && actionsRow.parentElement){
      actionsRow.parentElement.insertBefore(wrap, actionsRow);
    }else if(row && row.parentElement){
      row.parentElement.appendChild(wrap);
    }
  }

  // Task timeline panel above task list
  if(ui.taskList && !document.querySelector('#phase4Timeline')){
    const panel = document.createElement('div');
    panel.id = 'phase4Timeline';
    panel.className = 'phase4-timeline';
    panel.innerHTML = `
      <div class="phase4-timeline__head">
        <div class="phase4-timeline__title">Task Timeline</div>
        <div class="phase4-timeline__hint" id="phase4TimelineHint">No due dates yet.</div>
      </div>
      <div class="phase4-timeline__list" id="phase4TimelineList"></div>
    `;
    ui.taskList.parentElement.insertBefore(panel, ui.taskList);
  }

  // Extend Phase 3 task toolbar
  const tb = document.querySelector('#phase3TaskToolbar');
  if(tb && !document.querySelector('#phase4TaskToolbarExt')){
    const ext = document.createElement('div');
    ext.id = 'phase4TaskToolbarExt';
    ext.className = 'phase4-toolbar';
    ext.innerHTML = `
      <select id="phase4TaskDueFilter" class="select" title="Due date filter">
        <option value="all">Due: All</option>
        <option value="overdue">Due: Overdue</option>
        <option value="today">Due: Today</option>
        <option value="week">Due: 7 Days</option>
        <option value="has">Due: Has Date</option>
        <option value="none">Due: No Date</option>
      </select>
      <label class="phase4-chip"><input type="checkbox" id="phase4BlockedOnly" /> Blocked only</label>
      <span class="phase3-sep"></span>
      <select id="phase4ViewPreset" class="select" title="Saved checklist views"></select>
      <button class="btn btn--ghost btn--mini" id="phase4BtnApplyView" type="button">Apply View</button>
      <button class="btn btn--ghost btn--mini" id="phase4BtnSaveView" type="button">Save View</button>
      <button class="btn btn--ghost btn--mini" id="phase4BtnDeleteView" type="button">Delete View</button>
    `;
    tb.appendChild(ext);

    ext.querySelector('#phase4TaskDueFilter').addEventListener('change', (e) => {
      phase4State_.taskDueFilter = String(e.target.value || 'all');
      renderChecklist();
    });
    ext.querySelector('#phase4BlockedOnly').addEventListener('change', (e) => {
      phase4State_.blockedOnly = !!e.target.checked;
      renderChecklist();
    });
    ext.querySelector('#phase4BtnApplyView').addEventListener('click', phase4ApplySelectedView_);
    ext.querySelector('#phase4BtnSaveView').addEventListener('click', phase4SaveViewPrompt_);
    ext.querySelector('#phase4BtnDeleteView').addEventListener('click', phase4DeleteSelectedView_);
    phase4RefreshSavedViewSelect_();
  }

  // Integrity button in topbar
  const topbarRight = document.querySelector('.topbar__right');
  if(topbarRight && !document.querySelector('#phase4BtnIntegrity')){
    const btn = document.createElement('button');
    btn.id = 'phase4BtnIntegrity';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Integrity';
    btn.addEventListener('click', phase4OpenIntegrityReport_);
    topbarRight.appendChild(btn);
  }

  phase4SyncToolbarUi_();
  phase4State_.uiReady = true;
}

function phase4PatchFunctions_(){
  if(phase4PatchFunctions_._done) return; phase4PatchFunctions_._done = true;

  // Extend task factory (used by import/template paths)
  const _mkTask = mkTask;
  mkTask = function(title, done){
    const t = _mkTask(title, done);
    phase4NormalizeTaskMeta_(t);
    return t;
  };

  // Additional checklist filtering (wrap Phase3 matcher if present)
  if(typeof phase3TaskMatchesFilter_ === 'function'){
    const _phase3TaskMatches = phase3TaskMatchesFilter_;
    phase3TaskMatchesFilter_ = function(task){
      if(!_phase3TaskMatches(task)) return false;
      phase4NormalizeTaskMeta_(task);

      if(phase4State_.blockedOnly && !phase4IsTaskBlocked_(task)) return false;

      const f = phase4State_.taskDueFilter || 'all';
      if(f !== 'all'){
        const due = Number(task.dueAt || 0) || 0;
        const bucket = phase4DueBucket_(due);
        if(f === 'has' && !due) return false;
        if(f === 'none' && due) return false;
        if(f === 'overdue' && bucket !== 'overdue') return false;
        if(f === 'today' && bucket !== 'today') return false;
        if(f === 'week' && !(bucket === 'today' || bucket === 'soon')) return false;
      }
      return true;
    };
  }

  // Post-render enrichments after Phase3 checklist processing
  if(typeof phase3PostRenderChecklist_ === 'function'){
    const _phase3Post = phase3PostRenderChecklist_;
    phase3PostRenderChecklist_ = function(){
      _phase3Post();
      phase4EnsureUi_();
      phase4PostRenderChecklist_();
    };
  }

  // Bulk done should skip blocked tasks
  if(typeof phase3BulkSetTaskDone_ === 'function'){
    const _bulk = phase3BulkSetTaskDone_;
    phase3BulkSetTaskDone_ = async function(done){
      if(!done) return _bulk(done);
      const ctx = phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null;
      const m = ctx && ctx.m;
      if(!m) return _bulk(done);
      const candidateIds = (typeof phase3GetSelectedTaskIdsForCurrentMilestone_ === 'function' && phase3GetSelectedTaskIdsForCurrentMilestone_().length)
        ? phase3GetSelectedTaskIdsForCurrentMilestone_()
        : (typeof phase3GetVisibleTaskIds_ === 'function' ? phase3GetVisibleTaskIds_(m) : []);
      const byId = new Map((m.tasks || []).map(t => [t.id, t]));
      const blocked = candidateIds.filter(id => {
        const t = byId.get(id);
        return t && !t.done && phase4IsTaskBlocked_(t, m);
      });
      if(blocked.length){
        const names = blocked.slice(0,3).map(id => byId.get(id)?.title || id).join(', ');
        const ok = await pmConfirmDialog_(`Some selected task(s) are blocked and will be skipped.\nBlocked: ${blocked.length}${names ? `\nExamples: ${names}` : ''}\n\nContinue?`, {
          title:'Bulk Complete • Blocked Tasks',
          okText:'Continue'
        });
        if(!ok) return;
      }
      phase4State_.suppressTaskCheckGuard = true;
      try{ _bulk(done); } finally { phase4State_.suppressTaskCheckGuard = false; }
    };
  }

  // Ensure current add-task due date is applied even though base wireChecklist already bound listeners
  if(ui && ui.btnAddTask && !ui.btnAddTask.__phase4Patched){
    ui.btnAddTask.__phase4Patched = true;
    ui.btnAddTask.addEventListener('click', phase4CapturePendingDue_, true); // capture before base handler
    ui.btnAddTask.addEventListener('click', phase4ApplyPendingDueToLatestTask_); // bubble after base handler
  }
}

function phase4WireGuards_(){
  if(!ui || !ui.taskList || ui.taskList.__phase4GuardWired) return;
  ui.taskList.__phase4GuardWired = true;

  ui.taskList.addEventListener('click', (e) => {
    if(phase4State_.suppressTaskCheckGuard) return;
    const target = e.target;
    if(!(target instanceof Element)) return;
    const check = target.closest('.task__check');
    if(!check) return;
    const card = target.closest('.task');
    const taskId = card?.dataset?.taskId;
    if(!taskId) return;
    const ctx = phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null;
    const m = ctx && ctx.m;
    if(!m) return;
    const task = (m.tasks || []).find(t => t.id === taskId);
    if(!task) return;
    if(task.done) return; // reopening is allowed
    if(phase4IsTaskBlocked_(task, m)){
      const blockers = phase4BlockedTaskTitles_(task, m).join(', ') || 'unfinished dependency task(s)';
      alert(`This task is blocked and cannot be completed yet.\nBlockers: ${blockers}`);
      e.preventDefault();
      e.stopPropagation();
      if(typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    }
  }, true);
}

function phase4NormalizeCurrentState_(){
  try{
    for(const p of state.projects || []){
      p.modules = Array.isArray(p.modules) ? p.modules : [];
      for(const mod of p.modules){
        mod.milestones = Array.isArray(mod.milestones) ? mod.milestones : [];
        for(const ms of mod.milestones){
          ms.tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
          for(const t of ms.tasks) phase4NormalizeTaskMeta_(t);
        }
      }
    }
  }catch{ /* ignore */ }
}

function phase4NormalizeTaskMeta_(t){
  if(!t || typeof t !== 'object') return t;
  if(!Array.isArray(t.blockedBy)) t.blockedBy = [];
  t.blockedBy = Array.from(new Set(t.blockedBy.filter(x => typeof x === 'string' && x.trim())));
  if(typeof t.blockerNote !== 'string') t.blockerNote = '';
  if(t.dueAt != null && t.dueAt !== ''){
    const n = Number(t.dueAt);
    t.dueAt = Number.isFinite(n) && n > 0 ? n : null;
  }else{
    t.dueAt = null;
  }
  return t;
}

function phase4GetTaskDueInput_(){
  return document.querySelector('#phase4TaskDue');
}

function phase4CapturePendingDue_(){
  const inp = phase4GetTaskDueInput_();
  const raw = inp ? String(inp.value || '').trim() : '';
  const title = ui?.taskText ? String(ui.taskText.value || '').trim() : '';
  phase4State_.pendingAddDue = raw ? { raw, at: Date.now(), title } : null;
}

function phase4ApplyPendingDueToLatestTask_(){
  const pending = phase4State_.pendingAddDue;
  if(!pending) return;
  phase4State_.pendingAddDue = null;
  const ctx = phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null;
  const m = ctx && ctx.m;
  if(!m || !Array.isArray(m.tasks) || !m.tasks.length) return;

  const t = m.tasks[0];
  if(!t) return;
  phase4NormalizeTaskMeta_(t);
  // Apply only to a task that looks freshly added and lacks due date
  const age = Date.now() - Number(t.createdAt || 0);
  if(age > 5000) return;
  if(t.dueAt) return;
  if(pending.title && t.title && String(t.title).trim() !== pending.title) return;

  const ts = phase4ParseDateInputToTs_(pending.raw);
  if(!ts) return;
  t.dueAt = ts;
  addActivity(`Set due date: ${t.title} → ${phase4FmtDate_(ts)}`);
  const inp = phase4GetTaskDueInput_();
  if(inp) inp.value = '';
  saveState();
  renderChecklist();
}

function phase4ParseDateInputToTs_(raw){
  const s = String(raw || '').trim();
  if(!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const dt = new Date(y, mo, d, 12, 0, 0, 0);
  const ts = dt.getTime();
  return Number.isFinite(ts) ? ts : null;
}

function phase4FmtDate_(ts){
  const n = Number(ts || 0);
  if(!n) return '—';
  const d = new Date(n);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function phase4TodayStart_(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.getTime();
}

function phase4DueBucket_(dueAt){
  const due = Number(dueAt || 0);
  if(!due) return 'none';
  const day = 86400000;
  const today = phase4TodayStart_();
  const dueDay = new Date(due); dueDay.setHours(0,0,0,0);
  const dueTs = dueDay.getTime();
  const diffDays = Math.round((dueTs - today) / day);
  if(diffDays < 0) return 'overdue';
  if(diffDays === 0) return 'today';
  if(diffDays <= 7) return 'soon';
  return 'later';
}

function phase4GetTaskByIdInMilestone_(taskId, ms){
  const ctx = ms ? { m: ms } : (phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null);
  const m = ctx && ctx.m;
  if(!m) return null;
  return (m.tasks || []).find(t => t.id === taskId) || null;
}

function phase4IsTaskBlocked_(task, ms){
  phase4NormalizeTaskMeta_(task);
  if(!task || !Array.isArray(task.blockedBy) || !task.blockedBy.length) return false;
  const ctx = ms ? { m: ms } : (phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null);
  const m = ctx && ctx.m;
  if(!m) return false;
  const byId = new Map((m.tasks || []).map(t => [t.id, t]));
  for(const depId of task.blockedBy){
    const dep = byId.get(depId);
    if(dep && !dep.done) return true;
  }
  return false;
}

function phase4BlockedTaskTitles_(task, ms){
  phase4NormalizeTaskMeta_(task);
  const ctx = ms ? { m: ms } : (phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null);
  const m = ctx && ctx.m;
  if(!m) return [];
  const byId = new Map((m.tasks || []).map(t => [t.id, t]));
  return (task.blockedBy || [])
    .map(id => byId.get(id))
    .filter(dep => dep && !dep.done)
    .map(dep => dep.title);
}

function phase4PostRenderChecklist_(){
  phase4SyncToolbarUi_();
  phase4RenderTimeline_();

  const ctx = phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null;
  const m = ctx && ctx.m;
  const cards = Array.from(document.querySelectorAll('#taskList .task'));
  if(!m || !cards.length) return;
  const tasks = Array.isArray(m.tasks) ? m.tasks : [];

  cards.forEach((el, idx) => {
    const t = tasks[idx];
    if(!t) return;
    phase4NormalizeTaskMeta_(t);

    // Planner button (once)
    const actions = el.querySelector('.task__actions');
    if(actions && !actions.querySelector('[data-act="phase4Plan"]')){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'iconbtn phase4-planner-btn';
      btn.title = 'Planner (due date + blockers)';
      btn.dataset.act = 'phase4Plan';
      btn.textContent = '⛓';
      btn.addEventListener('click', () => phase4OpenTaskPlanner_(t));
      actions.insertBefore(btn, actions.firstChild || null);
    }

    // Add due / blocked badges
    const meta = el.querySelector('.task__meta');
    if(meta){
      Array.from(meta.querySelectorAll('.phase4-due-badge,.phase4-blocked-badge')).forEach(n => n.remove());
      if(t.dueAt){
        const dueBucket = phase4DueBucket_(t.dueAt);
        const b = document.createElement('span');
        b.className = 'badge phase4-due-badge';
        if(dueBucket === 'overdue') b.classList.add('badge--overdue');
        else if(dueBucket === 'today') b.classList.add('badge--today');
        else if(dueBucket === 'soon') b.classList.add('badge--soon');
        b.textContent = `DUE ${phase4FmtDate_(t.dueAt)}`;
        b.title = dueBucket === 'overdue' ? 'Overdue' : dueBucket === 'today' ? 'Due today' : dueBucket === 'soon' ? 'Due within 7 days' : 'Has due date';
        meta.appendChild(b);
      }
      if((t.blockedBy || []).length){
        const b2 = document.createElement('span');
        b2.className = 'badge phase4-blocked-badge';
        const blockedNow = phase4IsTaskBlocked_(t, m);
        b2.textContent = blockedNow ? `BLOCKED ${t.blockedBy.length}` : `DEPS ${t.blockedBy.length}`;
        const tipLines = phase4BlockedTaskTitles_(t, m);
        b2.title = tipLines.length ? `Waiting on: ${tipLines.join(', ')}` : `Dependencies: ${t.blockedBy.length}`;
        meta.appendChild(b2);
      }
    }
  });
}

function phase4SyncToolbarUi_(){
  const dueSel = document.querySelector('#phase4TaskDueFilter');
  const blockedChk = document.querySelector('#phase4BlockedOnly');
  if(dueSel) dueSel.value = phase4State_.taskDueFilter || 'all';
  if(blockedChk) blockedChk.checked = !!phase4State_.blockedOnly;
  phase4RefreshSavedViewSelect_();
}

function phase4RenderTimeline_(){
  const list = document.querySelector('#phase4TimelineList');
  const hint = document.querySelector('#phase4TimelineHint');
  if(!list || !hint) return;
  const ctx = phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null;
  const p = ctx && ctx.p;
  const m = ctx && ctx.m;
  if(!p || !m){
    hint.textContent = 'Select a project + milestone.';
    list.innerHTML = '';
    return;
  }

  const dueTasks = (m.tasks || [])
    .map(t => (phase4NormalizeTaskMeta_(t), t))
    .filter(t => t.dueAt)
    .sort((a,b) => Number(a.dueAt||0) - Number(b.dueAt||0) || Number(a.done) - Number(b.done));

  if(!dueTasks.length){
    hint.textContent = 'No due dates in this milestone yet.';
    list.innerHTML = '';
    return;
  }

  const overdue = dueTasks.filter(t => phase4DueBucket_(t.dueAt) === 'overdue').length;
  const today = dueTasks.filter(t => phase4DueBucket_(t.dueAt) === 'today').length;
  hint.textContent = `${dueTasks.length} due • ${overdue} overdue • ${today} today`;

  list.innerHTML = '';
  dueTasks.slice(0, 40).forEach(t => {
    const bucket = phase4DueBucket_(t.dueAt);
    const row = document.createElement('div');
    row.className = 'phase4-timeline__row' + (bucket === 'overdue' ? ' is-overdue' : bucket === 'today' ? ' is-today' : '');
    row.innerHTML = `
      <div class="phase4-timeline__left">
        <div class="phase4-timeline__task">${escapeHtml(t.title || '')}${t.done ? ' ✓' : ''}</div>
        <div class="phase4-timeline__sub">${escapeHtml(t.assignee || 'Unassigned')}${phase4IsTaskBlocked_(t,m) ? ' • BLOCKED' : ''}</div>
      </div>
      <div class="phase4-timeline__date">${escapeHtml(phase4FmtDate_(t.dueAt))}</div>
    `;
    row.addEventListener('click', () => {
      const card = Array.from(document.querySelectorAll('#taskList .task')).find(el => el.dataset.taskId === t.id);
      if(card){
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('is-selected');
        setTimeout(() => card.classList.remove('is-selected'), 1000);
      }
    });
    list.appendChild(row);
  });
}

async function phase4OpenTaskPlanner_(task){
  const ctx = phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null;
  const m = ctx && ctx.m;
  if(!task || !m) return;
  phase4NormalizeTaskMeta_(task);

  // Due date prompt
  const currentDue = task.dueAt ? phase4FmtDate_(task.dueAt) : '';
  const dueInput = await pmPromptDialog_(`Set due date for task (YYYY-MM-DD).\nLeave blank to clear.`, currentDue, { title:'Task Planner • Due Date', placeholder:'YYYY-MM-DD' });
  if(dueInput === null) return; // cancel entire planner
  const dueTrim = String(dueInput || '').trim();
  if(!dueTrim){
    task.dueAt = null;
  }else{
    const ts = phase4ParseDateInputToTs_(dueTrim);
    if(!ts){ alert('Invalid date format. Use YYYY-MM-DD.'); return; }
    task.dueAt = ts;
  }

  // Blockers prompt (same milestone only)
  const candidates = (m.tasks || []).filter(x => x.id !== task.id);
  const lines = candidates.map((x, i) => `${i+1}. ${x.done ? '[✓]' : '[ ]'} ${x.title}`).join('\n');
  const currentIdxCsv = (task.blockedBy || []).map(id => String(candidates.findIndex(x => x.id === id) + 1)).filter(x => x !== '0').join(',');
  const blockerInput = await pmPromptDialog_(
    `Dependencies / blockers (same milestone only). Enter numbers separated by commas.\nLeave blank for none.\n\n${lines || '(No other tasks available)'}`,
    currentIdxCsv,
    { title:'Task Planner • Dependencies', placeholder:'e.g. 1,2,4' }
  );
  if(blockerInput === null) return; // keep due change already made intentionally

  const nextBlocked = [];
  const raw = String(blockerInput || '').trim();
  if(raw){
    const nums = Array.from(new Set(raw.split(/[\s,]+/).map(v => Number(v)).filter(n => Number.isInteger(n) && n >= 1 && n <= candidates.length)));
    for(const n of nums){
      const dep = candidates[n - 1];
      if(dep) nextBlocked.push(dep.id);
    }
  }
  task.blockedBy = nextBlocked;

  const noteInput = await pmPromptDialog_('Optional blocker note (why blocked / waiting on what). Leave blank to clear.', task.blockerNote || '', { title:'Task Planner • Blocker Note', placeholder:'Optional note' });
  if(noteInput !== null){
    task.blockerNote = String(noteInput || '').trim();
  }

  addActivity(`Planned task: ${task.title}${task.dueAt ? ` • due ${phase4FmtDate_(task.dueAt)}` : ''}${task.blockedBy.length ? ` • deps ${task.blockedBy.length}` : ''}`);
  saveState();
  renderChecklist();
}

function phase4PresetViews_(){
  return {
    '__preset_all': { name:'All Tasks', phase3:{ query:'', status:'all', severity:'all' }, phase4:{ due:'all', blocked:false } },
    '__preset_today': { name:'Due Today', phase3:{ query:'', status:'open', severity:'all' }, phase4:{ due:'today', blocked:false } },
    '__preset_overdue': { name:'Overdue', phase3:{ query:'', status:'open', severity:'all' }, phase4:{ due:'overdue', blocked:false } },
    '__preset_blocked': { name:'Blocked', phase3:{ query:'', status:'open', severity:'all' }, phase4:{ due:'all', blocked:true } },
    '__preset_week': { name:'Due This Week', phase3:{ query:'', status:'open', severity:'all' }, phase4:{ due:'week', blocked:false } },
    '__preset_high_open': { name:'High Priority Open', phase3:{ query:'', status:'open', severity:'high' }, phase4:{ due:'all', blocked:false } },
    '__preset_blockers_overdue': { name:'Blockers + Overdue', phase3:{ query:'', status:'open', severity:'blocker' }, phase4:{ due:'overdue', blocked:false } },
  };
}

function phase4LoadViews_(){
  try{
    const raw = localStorage.getItem(PHASE4_VIEWS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    phase4State_.savedViews = (parsed && typeof parsed === 'object') ? parsed : {};
  }catch{ phase4State_.savedViews = {}; }
}

function phase4PersistViews_(){
  try{ localStorage.setItem(PHASE4_VIEWS_KEY, JSON.stringify(phase4State_.savedViews || {})); }catch{ /* ignore */ }
}

function phase4RefreshSavedViewSelect_(){
  const sel = document.querySelector('#phase4ViewPreset');
  if(!sel) return;
  const prev = sel.value;
  const presets = phase4PresetViews_();
  const customNames = Object.keys(phase4State_.savedViews || {}).sort((a,b) => a.localeCompare(b));
  sel.innerHTML = '';
  const groups = [
    { label:'Presets', entries: Object.entries(presets) },
    { label:'Saved Views', entries: customNames.map(name => [name, phase4State_.savedViews[name]]) }
  ];
  groups.forEach(g => {
    const og = document.createElement('optgroup');
    og.label = g.label;
    g.entries.forEach(([key, val]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = (val && val.name) ? val.name : key;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });
  if(Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
  else if(sel.options.length) sel.selectedIndex = 0;
}

function phase4GetCurrentViewState_(){
  return {
    name: 'Custom View',
    phase3: {
      query: String(phase3State_?.taskQuery || ''),
      status: String(phase3State_?.taskStatus || 'all'),
      severity: String(phase3State_?.taskSeverity || 'all'),
    },
    phase4: {
      due: String(phase4State_.taskDueFilter || 'all'),
      blocked: !!phase4State_.blockedOnly,
    }
  };
}

function phase4ApplyViewState_(view){
  if(!view || typeof view !== 'object') return;
  if(window.phase3State_){
    phase3State_.taskQuery = String(view.phase3?.query || '');
    phase3State_.taskStatus = String(view.phase3?.status || 'all');
    phase3State_.taskSeverity = String(view.phase3?.severity || 'all');
  }
  phase4State_.taskDueFilter = String(view.phase4?.due || 'all');
  phase4State_.blockedOnly = !!view.phase4?.blocked;
  renderChecklist();
}

function phase4ApplySelectedView_(){
  const sel = document.querySelector('#phase4ViewPreset');
  if(!sel || !sel.value) return;
  const presets = phase4PresetViews_();
  const key = sel.value;
  const view = presets[key] || phase4State_.savedViews[key];
  if(!view) return;
  phase4ApplyViewState_(view);
  addActivity(`Applied view: ${view.name || key}`);
}

async function phase4SaveViewPrompt_(){
  const name = await pmPromptDialog_('Save current checklist filters as view name?', 'My View', { title:'Save Checklist View', placeholder:'View name' });
  if(name == null) return;
  const key = String(name).trim();
  if(!key) return;
  const view = phase4GetCurrentViewState_();
  view.name = key;
  phase4State_.savedViews[key] = view;
  phase4PersistViews_();
  phase4RefreshSavedViewSelect_();
  const sel = document.querySelector('#phase4ViewPreset');
  if(sel) sel.value = key;
  addActivity(`Saved view: ${key}`);
}

async function phase4DeleteSelectedView_(){
  const sel = document.querySelector('#phase4ViewPreset');
  if(!sel || !sel.value) return;
  const key = sel.value;
  if(String(key).startsWith('__preset_')){
    alert('Preset views cannot be deleted.');
    return;
  }
  if(!phase4State_.savedViews[key]) return;
  const ok = await pmConfirmDialog_(`Delete saved view "${key}"?`, { title:'Delete Checklist View', okText:'Delete', danger:true });
  if(!ok) return;
  delete phase4State_.savedViews[key];
  phase4PersistViews_();
  phase4RefreshSavedViewSelect_();
  addActivity(`Deleted view: ${key}`);
}

async function phase4OpenIntegrityReport_(){
  const report = phase4ScanIntegrity_();
  const lines = [];
  lines.push('Phase 4 Integrity Scan');
  lines.push('');
  lines.push(`Projects: ${report.counts.projects} • Modules: ${report.counts.modules} • Milestones: ${report.counts.milestones} • Tasks: ${report.counts.tasks}`);
  lines.push(`Tasks w/ due date: ${report.counts.tasksWithDue} • Tasks w/ deps: ${report.counts.tasksWithDeps}`);
  lines.push('');
  if(!report.issues.length){
    lines.push('No integrity issues found.');
  }else{
    lines.push(`Issues (${report.issues.length}):`);
    report.issues.slice(0, 30).forEach((x, i) => lines.push(`${i+1}. ${x}`));
    if(report.issues.length > 30) lines.push(`…and ${report.issues.length - 30} more`);
  }
  if(report.warnings.length){
    lines.push('');
    lines.push(`Warnings (${report.warnings.length}):`);
    report.warnings.slice(0, 20).forEach((x, i) => lines.push(`${i+1}. ${x}`));
    if(report.warnings.length > 20) lines.push(`…and ${report.warnings.length - 20} more`);
  }

  await pmAlertDialog_(lines.join('\n'), { title:'Phase 4 Integrity Scan' });

  if(report.fixableCount > 0){
    const ok = await pmConfirmDialog_(`Apply safe repairs now?\n\nThis will normalize Phase 4 task metadata and remove invalid blocker references.\nFixable items: ${report.fixableCount}`, { title:'Integrity Repair', okText:'Apply Repairs' });
    if(ok){
      const fixed = phase4RepairIntegrity_();
      if(fixed > 0){
        addActivity(`Integrity repair applied (${fixed} fix${fixed===1?'':'es'})`);
        saveState();
        renderAll();
      }else{
        alert('No repairs applied.');
      }
    }
  }
}

function phase4ScanIntegrity_(){
  const out = {
    counts: { projects:0, modules:0, milestones:0, tasks:0, tasksWithDue:0, tasksWithDeps:0 },
    issues: [],
    warnings: [],
    fixableCount: 0,
  };

  for(const p of state.projects || []){
    out.counts.projects++;
    for(const mod of (p.modules || [])){
      out.counts.modules++;
      for(const ms of (mod.milestones || [])){
        out.counts.milestones++;
        const tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
        const byId = new Map(tasks.map(t => [t.id, t]));
        for(const t of tasks){
          out.counts.tasks++;
          phase4NormalizeTaskMeta_(t);
          if(t.dueAt) out.counts.tasksWithDue++;
          if((t.blockedBy || []).length) out.counts.tasksWithDeps++;

          if(t.blockedBy.includes(t.id)){
            out.issues.push(`${p.name} / ${mod.name} / ${ms.title} :: task "${t.title}" depends on itself`);
            out.fixableCount++;
          }

          const seen = new Set();
          for(const depId of (t.blockedBy || [])){
            if(seen.has(depId)){
              out.issues.push(`${p.name} / ${mod.name} / ${ms.title} :: task "${t.title}" has duplicate dependency ref`);
              out.fixableCount++;
              continue;
            }
            seen.add(depId);
            if(!byId.has(depId)){
              out.issues.push(`${p.name} / ${mod.name} / ${ms.title} :: task "${t.title}" references missing dependency`);
              out.fixableCount++;
            }
          }
        }

        // Lightweight cycle warnings (DFS within milestone)
        try{
          const visiting = new Set(), visited = new Set();
          const hasCycleFrom = (id) => {
            if(visiting.has(id)) return true;
            if(visited.has(id)) return false;
            visiting.add(id);
            const t = byId.get(id);
            for(const depId of (t?.blockedBy || [])){
              if(!byId.has(depId)) continue;
              if(hasCycleFrom(depId)) return true;
            }
            visiting.delete(id);
            visited.add(id);
            return false;
          };
          for(const id of byId.keys()){
            if(hasCycleFrom(id)){
              out.warnings.push(`${p.name} / ${mod.name} / ${ms.title} :: possible dependency cycle detected`);
              break;
            }
          }
        }catch{ /* ignore */ }
      }
    }
  }
  return out;
}

function phase4RepairIntegrity_(){
  let fixes = 0;
  for(const p of state.projects || []){
    for(const mod of (p.modules || [])){
      for(const ms of (mod.milestones || [])){
        const tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
        const byId = new Set(tasks.map(t => t.id));
        for(const t of tasks){
          const beforeDue = t.dueAt;
          const beforeNote = t.blockerNote;
          const beforeDeps = Array.isArray(t.blockedBy) ? [...t.blockedBy] : t.blockedBy;
          phase4NormalizeTaskMeta_(t);
          let deps = (t.blockedBy || []).filter(id => id !== t.id && byId.has(id));
          deps = Array.from(new Set(deps));
          if(JSON.stringify(beforeDeps || []) !== JSON.stringify(deps)){ fixes++; }
          t.blockedBy = deps;
          if(beforeDue !== t.dueAt) fixes++;
          if(typeof beforeNote !== 'string') fixes++;
        }
      }
    }
  }
  return fixes;
}

// boot phase 4 after phase 3 patch is loaded
try{ initPhase4_(); }catch(err){ console.warn('Phase4 init failed', err); }

/* =========================================================
   Phase 5 Upgrade (Additive Patch)
   - Drag-and-drop task reorder (Checklist List view)
   - Kanban view (Todo / Doing / Done)
   - Recurring task templates + recurring task generator
   - Project settings panel (owner / target date / risk / budget / client / links)
   - Export meta enrichment (due / blockers / stage / recurrence)
========================================================= */

var PHASE5_REC_TPL_KEY = 'stark_pm_phase5_recurring_templates_v1';
var phase5State_ = {
  inited: false,
  patched: false,
  checklistView: 'list', // list|kanban
  dragTaskId: null,
  kanbanDragTaskId: null,
  pendingAddMeta: null,
};

function initPhase5_(){
  if(phase5State_.inited) return;
  phase5State_.inited = true;
  phase5LoadState_();
  phase5EnsureStyles_();
  phase5PatchFunctions_();
  phase5PatchButtons_();
  // render once if app is already up
  try{ renderAll(); }catch{ /* ignore */ }
}

function phase5LoadState_(){
  try{
    const raw = localStorage.getItem('stark_pm_phase5_ui');
    if(!raw) return;
    const x = JSON.parse(raw);
    if(x && (x.checklistView === 'list' || x.checklistView === 'kanban')){
      phase5State_.checklistView = x.checklistView;
    }
  }catch{ /* ignore */ }
}

function phase5SaveUiState_(){
  try{
    localStorage.setItem('stark_pm_phase5_ui', JSON.stringify({ checklistView: phase5State_.checklistView }));
  }catch{ /* ignore */ }
}

function phase5EnsureStyles_(){
  if(document.querySelector('#phase5Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase5Styles';
  st.textContent = `
    .phase5-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}
    .phase5-toolbar .phase5-spacer{flex:1 1 auto}
    .phase5-muted{opacity:.8;font-size:12px}
    .phase5-segment{display:inline-flex;gap:6px;padding:4px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.02)}
    .phase5-segment .btn{padding:6px 10px;min-height:auto}
    .phase5-segment .btn.is-active{outline:1px solid rgba(124,249,255,.35);box-shadow:0 0 0 1px rgba(124,249,255,.15) inset}

    .phase5-projectSettings{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)}
    .phase5-projectSettings__title{font-size:12px;letter-spacing:.08em;opacity:.8;margin-bottom:10px;text-transform:uppercase}
    .phase5-projectMetaPills{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}

    .phase5-recurringBox{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.02)}
    .phase5-recurringBox .row{align-items:end}
    .phase5-recurringBox .field__label{font-size:11px}
    .phase5-recurringHint{font-size:12px;opacity:.8;margin-top:6px}

    .phase5-taskGrip{cursor:grab;user-select:none}
    .phase5-taskGrip:active{cursor:grabbing}
    .task.phase5-dragging{opacity:.45}
    .task.phase5-drop-before{box-shadow:0 -2px 0 rgba(124,249,255,.75)}
    .task.phase5-drop-after{box-shadow:0 2px 0 rgba(124,249,255,.75)}

    .phase5-kanban{display:none;margin-top:8px}
    .phase5-kanban.is-open{display:block}
    .phase5-kanban__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .phase5-lane{border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02);min-height:220px;display:flex;flex-direction:column}
    .phase5-lane.phase5-lane--drag{box-shadow:0 0 0 1px rgba(124,249,255,.3) inset}
    .phase5-lane__head{padding:10px 10px 8px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid rgba(255,255,255,.06)}
    .phase5-lane__title{font-weight:600;font-size:13px;letter-spacing:.04em}
    .phase5-lane__count{font-size:11px;opacity:.8}
    .phase5-lane__body{padding:8px;display:flex;flex-direction:column;gap:8px;min-height:160px}
    .phase5-kcard{border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:8px;background:rgba(255,255,255,.02);cursor:grab}
    .phase5-kcard:active{cursor:grabbing}
    .phase5-kcard.is-done{opacity:.8}
    .phase5-kcard.phase5-kdrag{opacity:.45}
    .phase5-kcard__title{font-size:13px;line-height:1.25;margin-bottom:6px;word-break:break-word}
    .phase5-kcard__meta{display:flex;gap:6px;flex-wrap:wrap}
    .phase5-kcard__meta .badge{font-size:11px}
    .phase5-kcard__foot{margin-top:6px;display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:11px;opacity:.85}
    .phase5-kempty{padding:10px;border:1px dashed rgba(255,255,255,.08);border-radius:10px;font-size:12px;opacity:.7;text-align:center}

    .phase5-recur-badge{border-color:rgba(146,255,176,.25)}
    .phase5-projectSettings .row.row--3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    @media (max-width: 980px){
      .phase5-kanban__grid{grid-template-columns:1fr}
      .phase5-projectSettings .row.row--3{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(st);
}

function phase5PatchFunctions_(){
  if(phase5State_.patched) return;
  phase5State_.patched = true;

  // Preserve new project settings when loading/importing JSON.
  const _sanitizeProject = sanitizeProject;
  sanitizeProject = function(p){
    const out = _sanitizeProject(p);
    out.settings = phase5SanitizeProjectSettings_(p?.settings || {
      owner: p?.owner,
      targetDate: p?.targetDate,
      risk: p?.risk,
      budget: p?.budget,
      client: p?.client,
      links: p?.links,
    });
    return out;
  };

  // Preserve Phase4 + Phase5 task meta when loading/importing JSON.
  const _sanitizeTask = sanitizeTask;
  sanitizeTask = function(t){
    const out = _sanitizeTask(t);
    // phase4 fields
    if(!Array.isArray(out.blockedBy)) out.blockedBy = [];
    out.blockedBy = Array.from(new Set((Array.isArray(t?.blockedBy) ? t.blockedBy : []).filter(x => typeof x === 'string' && x.trim())));
    out.blockerNote = typeof t?.blockerNote === 'string' ? String(t.blockerNote) : '';
    const dueN = Number(t?.dueAt || 0);
    out.dueAt = Number.isFinite(dueN) && dueN > 0 ? dueN : null;
    // phase5 fields
    out.kanbanStage = phase5NormalizeStage_(t?.kanbanStage, out.done);
    const rd = Number(t?.recurrenceDays || 0);
    out.recurrenceDays = Number.isFinite(rd) && rd > 0 ? Math.max(1, Math.round(rd)) : 0;
    out.recurrenceTemplate = String(t?.recurrenceTemplate || '');
    const rlg = Number(t?.lastRecurringGeneratedAt || 0);
    out.lastRecurringGeneratedAt = Number.isFinite(rlg) && rlg > 0 ? rlg : null;
    return out;
  };

  // Sync UI project settings into save path.
  const _saveProjectDetails = saveProjectDetails;
  saveProjectDetails = function(){
    const p = getActiveProject();
    if(p) phase5ApplyProjectSettingsFromUi_(p);
    return _saveProjectDetails();
  };

  // Render extra UI after core renders.
  const _renderProjects = renderProjects;
  renderProjects = function(){
    _renderProjects();
    phase5PostRenderProjects_();
  };

  const _renderChecklist = renderChecklist;
  renderChecklist = function(){
    _renderChecklist();
    phase5PostRenderChecklist_();
  };

  // Export enrichment for md/txt inline task meta.
  const _buildPmTaskMeta = buildPmTaskMeta_;
  buildPmTaskMeta_ = function(t){
    phase5NormalizeTaskMeta_(t);
    let base = String(_buildPmTaskMeta(t) || '').trim();
    let inner = '';
    if(base){
      const m = base.match(/^\{\s*pm\s+([\s\S]*?)\s*\}$/i);
      inner = m ? String(m[1] || '').trim() : '';
    }
    const parts = [];
    if(inner) parts.push(inner);
    if(t?.dueAt) parts.push('due=' + quotePmValue_(phase5FmtDateISO_(t.dueAt)));
    if(Array.isArray(t?.blockedBy) && t.blockedBy.length) parts.push('deps=' + String(t.blockedBy.length));
    if(t?.blockerNote && String(t.blockerNote).trim()) parts.push('blockernote=' + quotePmValue_(String(t.blockerNote).trim()));
    if(t?.kanbanStage && t.kanbanStage !== 'todo') parts.push('stage=' + t.kanbanStage);
    if(Number(t?.recurrenceDays || 0) > 0) parts.push('recur_days=' + String(Math.max(1, Math.round(Number(t.recurrenceDays)))));
    if(t?.recurrenceTemplate && String(t.recurrenceTemplate).trim()) parts.push('recur_tpl=' + quotePmValue_(String(t.recurrenceTemplate).trim()));
    return parts.length ? '{pm ' + parts.join(' ') + '}' : '';
  };

  // Import enrichment for md/txt round-trip.
  const _applyPmTaskMeta = applyPmTaskMeta_;
  applyPmTaskMeta_ = function(t, meta){
    _applyPmTaskMeta(t, meta);
    if(!meta || typeof meta !== 'object') return;
    if(meta.due !== undefined){
      const ts = phase5ParsePmDue_(meta.due);
      t.dueAt = ts || null;
    }
    if(meta.blockernote !== undefined) t.blockerNote = String(meta.blockernote || '');
    if(meta.stage && (meta.stage === 'todo' || meta.stage === 'doing' || meta.stage === 'done')){
      t.kanbanStage = phase5NormalizeStage_(meta.stage, t.done);
      if(meta.stage === 'done') t.done = true;
    }
    if(meta.recur_days !== undefined){
      const n = Number(meta.recur_days || 0);
      t.recurrenceDays = Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : 0;
    }
    if(meta.recur_tpl !== undefined){
      t.recurrenceTemplate = String(meta.recur_tpl || '');
    }
    phase5NormalizeTaskMeta_(t);
  };
}

function phase5PatchButtons_(){
  if(ui && ui.btnAddTask && !ui.btnAddTask.__phase5Patched){
    ui.btnAddTask.__phase5Patched = true;
    // Capture add-form recurring meta before core add handler runs.
    ui.btnAddTask.addEventListener('click', phase5CapturePendingAddMeta_, true);
    // Apply to newest task after core + phase4 handlers.
    ui.btnAddTask.addEventListener('click', phase5ApplyPendingAddMeta_);
  }
}

function phase5SanitizeProjectSettings_(s){
  const x = (s && typeof s === 'object') ? s : {};
  let risk = String(x.risk || '').toLowerCase();
  if(risk !== 'low' && risk !== 'medium' && risk !== 'high' && risk !== 'critical') risk = 'medium';
  return {
    owner: String(x.owner || ''),
    targetDate: String(x.targetDate || ''), // YYYY-MM-DD
    risk,
    budget: String(x.budget || ''),
    client: String(x.client || ''),
    links: String(x.links || ''),
  };
}

function phase5GetProjectSettings_(p){
  if(!p) return phase5SanitizeProjectSettings_({});
  if(!p.settings || typeof p.settings !== 'object') p.settings = phase5SanitizeProjectSettings_(p.settings);
  return p.settings;
}

function phase5EnsureProjectSettingsUi_(){
  const card = document.querySelector('#btnSaveProject')?.closest('.card');
  const form = card?.querySelector('.form');
  if(!card || !form) return;

  if(!document.querySelector('#phase5ProjectSettings')){
    const box = document.createElement('div');
    box.id = 'phase5ProjectSettings';
    box.className = 'phase5-projectSettings';
    box.innerHTML = `
      <div class="phase5-projectSettings__title">Project Settings</div>
      <div class="row row--2">
        <label class="field">
          <span class="field__label">Owner</span>
          <input class="input" id="phase5ProjectOwner" placeholder="e.g., ZhiQi / Team Lead" />
        </label>
        <label class="field">
          <span class="field__label">Target Date</span>
          <input class="input" id="phase5ProjectTargetDate" type="date" />
        </label>
      </div>
      <div class="row row--3">
        <label class="field">
          <span class="field__label">Risk</span>
          <select class="select" id="phase5ProjectRisk">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">Budget</span>
          <input class="input" id="phase5ProjectBudget" placeholder="e.g., RM 15,000" />
        </label>
        <label class="field">
          <span class="field__label">Client / Stakeholder</span>
          <input class="input" id="phase5ProjectClient" placeholder="e.g., Internal / Boss / Company" />
        </label>
      </div>
      <label class="field">
        <span class="field__label">Links (comma-separated)</span>
        <input class="input" id="phase5ProjectLinks" placeholder="Repo, docs, design, deployment URLs" />
      </label>
      <div class="phase5-projectMetaPills" id="phase5ProjectSettingsPreview"></div>
    `;
    form.appendChild(box);

    ['#phase5ProjectOwner','#phase5ProjectTargetDate','#phase5ProjectRisk','#phase5ProjectBudget','#phase5ProjectClient','#phase5ProjectLinks']
      .map(sel => document.querySelector(sel))
      .filter(Boolean)
      .forEach(el => {
        el.addEventListener('input', () => { pulseDirty(); phase5RenderProjectSettingsPreview_(); });
        el.addEventListener('change', () => { pulseDirty(); phase5RenderProjectSettingsPreview_(); });
      });
  }
}

function phase5PostRenderProjects_(){
  phase5EnsureProjectSettingsUi_();
  const p = getActiveProject();
  const s = phase5GetProjectSettings_(p);

  const ownerEl = document.querySelector('#phase5ProjectOwner');
  const dateEl = document.querySelector('#phase5ProjectTargetDate');
  const riskEl = document.querySelector('#phase5ProjectRisk');
  const budgetEl = document.querySelector('#phase5ProjectBudget');
  const clientEl = document.querySelector('#phase5ProjectClient');
  const linksEl = document.querySelector('#phase5ProjectLinks');

  if(ownerEl) ownerEl.value = p ? String(s.owner || '') : '';
  if(dateEl) dateEl.value = p ? String(s.targetDate || '') : '';
  if(riskEl) riskEl.value = p ? String(s.risk || 'medium') : 'medium';
  if(budgetEl) budgetEl.value = p ? String(s.budget || '') : '';
  if(clientEl) clientEl.value = p ? String(s.client || '') : '';
  if(linksEl) linksEl.value = p ? String(s.links || '') : '';

  if(ownerEl) ownerEl.disabled = !p;
  if(dateEl) dateEl.disabled = !p;
  if(riskEl) riskEl.disabled = !p;
  if(budgetEl) budgetEl.disabled = !p;
  if(clientEl) clientEl.disabled = !p;
  if(linksEl) linksEl.disabled = !p;

  phase5RenderProjectSettingsPreview_(p);

  // Add quick summary badges on active project card in dashboard (optional, non-invasive)
  const dashMeta = document.querySelector('#dashProjectMeta');
  if(dashMeta && p){
    dashMeta.title = [
      s.owner ? ('Owner: ' + s.owner) : '',
      s.targetDate ? ('Target: ' + s.targetDate) : '',
      s.risk ? ('Risk: ' + s.risk.toUpperCase()) : '',
    ].filter(Boolean).join(' • ');
  }
}

function phase5ApplyProjectSettingsFromUi_(p){
  if(!p) return;
  p.settings = phase5SanitizeProjectSettings_({
    owner: document.querySelector('#phase5ProjectOwner')?.value || '',
    targetDate: document.querySelector('#phase5ProjectTargetDate')?.value || '',
    risk: document.querySelector('#phase5ProjectRisk')?.value || 'medium',
    budget: document.querySelector('#phase5ProjectBudget')?.value || '',
    client: document.querySelector('#phase5ProjectClient')?.value || '',
    links: document.querySelector('#phase5ProjectLinks')?.value || '',
  });
}

function phase5RenderProjectSettingsPreview_(pArg){
  const p = pArg || getActiveProject();
  const box = document.querySelector('#phase5ProjectSettingsPreview');
  if(!box) return;
  if(!p){ box.innerHTML = ''; return; }
  const s = phase5GetProjectSettings_(p);
  const chips = [];
  if(s.owner) chips.push(`<span class="badge">OWNER ${escapeHtml(s.owner)}</span>`);
  if(s.targetDate) chips.push(`<span class="badge">TARGET ${escapeHtml(s.targetDate)}</span>`);
  if(s.risk) chips.push(`<span class="badge ${s.risk === 'high' || s.risk === 'critical' ? 'badge--warn' : ''}">RISK ${escapeHtml(String(s.risk).toUpperCase())}</span>`);
  if(s.budget) chips.push(`<span class="badge">BUDGET ${escapeHtml(s.budget)}</span>`);
  if(s.client) chips.push(`<span class="badge">CLIENT ${escapeHtml(s.client)}</span>`);
  box.innerHTML = chips.join('');
}

function phase5NormalizeStage_(stage, done){
  let s = String(stage || '').toLowerCase();
  if(s !== 'todo' && s !== 'doing' && s !== 'done') s = done ? 'done' : 'todo';
  if(done) return 'done';
  if(!done && s === 'done') return 'todo';
  return s;
}

function phase5NormalizeTaskMeta_(t){
  if(!t || typeof t !== 'object') return;
  if(typeof phase4NormalizeTaskMeta_ === 'function'){
    try{ phase4NormalizeTaskMeta_(t); }catch{ /* ignore */ }
  }
  t.kanbanStage = phase5NormalizeStage_(t.kanbanStage, !!t.done);
  const rd = Number(t.recurrenceDays || 0);
  t.recurrenceDays = Number.isFinite(rd) && rd > 0 ? Math.max(1, Math.round(rd)) : 0;
  if(typeof t.recurrenceTemplate !== 'string') t.recurrenceTemplate = '';
  if(t.lastRecurringGeneratedAt != null){
    const n = Number(t.lastRecurringGeneratedAt || 0);
    t.lastRecurringGeneratedAt = Number.isFinite(n) && n > 0 ? n : null;
  }else{
    t.lastRecurringGeneratedAt = null;
  }
  if(t.done) t.kanbanStage = 'done';
  else if(t.kanbanStage === 'done') t.kanbanStage = 'todo';
}

function phase5GetChecklistContext_(){
  if(typeof phase3GetChecklistContext_ === 'function') return phase3GetChecklistContext_();
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  return { p, m };
}

function phase5EnsureChecklistUi_(){
  const tasksCard = document.querySelector('#taskList')?.closest('.card');
  const taskList = document.querySelector('#taskList');
  if(tasksCard && taskList && !document.querySelector('#phase5ChecklistToolbar')){
    const tb = document.createElement('div');
    tb.id = 'phase5ChecklistToolbar';
    tb.className = 'phase5-toolbar';
    tb.innerHTML = `
      <div class="phase5-segment">
        <button class="btn btn--ghost" type="button" id="phase5BtnViewList">List</button>
        <button class="btn btn--ghost" type="button" id="phase5BtnViewKanban">Kanban</button>
      </div>
      <span class="phase5-muted" id="phase5DnDHint">Drag tasks to reorder (List) or move across columns (Kanban).</span>
      <span class="phase5-spacer"></span>
      <span class="phase5-muted" id="phase5ViewStats"></span>
    `;
    taskList.parentElement.insertBefore(tb, taskList);

    const kanban = document.createElement('div');
    kanban.id = 'phase5KanbanWrap';
    kanban.className = 'phase5-kanban';
    kanban.innerHTML = `<div class="phase5-kanban__grid" id="phase5KanbanGrid"></div>`;
    taskList.parentElement.insertBefore(kanban, taskList.nextSibling);

    document.querySelector('#phase5BtnViewList')?.addEventListener('click', () => {
      phase5State_.checklistView = 'list';
      phase5SaveUiState_();
      phase5SyncChecklistViewUi_();
    });
    document.querySelector('#phase5BtnViewKanban')?.addEventListener('click', () => {
      phase5State_.checklistView = 'kanban';
      phase5SaveUiState_();
      phase5SyncChecklistViewUi_();
      phase5RenderKanban_();
    });
  }

  const advancedHost = document.querySelector('#checklistAdvancedHost');
  const addCard = document.querySelector('#btnAddTask')?.closest('.card');
  const recurringHost = advancedHost || addCard;
  if(recurringHost && !document.querySelector('#phase5RecurringBox')){
    const divider = document.createElement('div');
    divider.className = 'divider';
    const box = document.createElement('div');
    box.id = 'phase5RecurringBox';
    box.className = 'phase5-recurringBox';
    box.innerHTML = `
      <div class="card__label" style="margin-bottom:8px">Recurring Task Templates</div>
      <div class="row row--2">
        <label class="field">
          <span class="field__label">Template</span>
          <select class="select" id="phase5TemplateSelect"><option value="">— Select template —</option></select>
        </label>
        <div class="row row--actions" style="align-items:end;gap:8px">
          <button class="btn btn--ghost" type="button" id="phase5BtnApplyTemplate">Apply</button>
          <button class="btn btn--ghost" type="button" id="phase5BtnSaveTemplate">Save as Template</button>
          <button class="btn btn--ghost" type="button" id="phase5BtnDeleteTemplate">Delete</button>
        </div>
      </div>
      <div class="row row--2">
        <label class="field">
          <span class="field__label">Due Offset (days)</span>
          <input class="input" id="phase5TaskDueOffset" type="number" min="0" step="1" placeholder="0" />
        </label>
        <label class="field">
          <span class="field__label">Repeat Every (days)</span>
          <input class="input" id="phase5TaskRepeatDays" type="number" min="0" step="1" placeholder="0 = one-time" />
        </label>
      </div>
      <div class="phase5-recurringHint">Tip: set repeat days before clicking <b>Add</b> to create a recurring task directly.</div>
    `;
    if(advancedHost){
      recurringHost.appendChild(divider);
      recurringHost.appendChild(box);
    }else{
      // place before the existing final hint block if possible
      const hint = recurringHost.querySelector('.hint');
      if(hint){
        recurringHost.insertBefore(divider, hint);
        recurringHost.insertBefore(box, hint);
      }else{
        recurringHost.appendChild(divider);
        recurringHost.appendChild(box);
      }
    }

    document.querySelector('#phase5BtnSaveTemplate')?.addEventListener('click', phase5SaveTemplateFromForm_);
    document.querySelector('#phase5BtnApplyTemplate')?.addEventListener('click', phase5ApplySelectedTemplate_);
    document.querySelector('#phase5BtnDeleteTemplate')?.addEventListener('click', phase5DeleteSelectedTemplate_);
    document.querySelector('#phase5TemplateSelect')?.addEventListener('change', phase5LoadTemplateIntoForm_);
  }

  phase5RefreshTemplateSelect_();
  phase5SyncChecklistViewUi_();
}

function phase5PostRenderChecklist_(){
  phase5EnsureChecklistUi_();

  const ctx = phase5GetChecklistContext_();
  const p = ctx && ctx.p;
  const m = ctx && ctx.m;
  const taskList = document.querySelector('#taskList');
  if(!taskList){ return; }

  // Normalize tasks (also keeps stage/done sync)
  if(m && Array.isArray(m.tasks)){
    for(const t of m.tasks) phase5NormalizeTaskMeta_(t);
  }

  phase5AttachChecklistDnD_(taskList, m);
  phase5InjectTaskRowExtras_(m);
  phase5SyncChecklistViewUi_();
  if(phase5State_.checklistView === 'kanban') phase5RenderKanban_();

  const statsEl = document.querySelector('#phase5ViewStats');
  if(statsEl){
    const total = Array.isArray(m?.tasks) ? m.tasks.length : 0;
    const visible = Array.from(taskList.querySelectorAll('.task')).filter(el => !el.classList.contains('phase3-hidden')).length;
    statsEl.textContent = p && m ? `${visible}/${total} visible • ${phase5State_.checklistView.toUpperCase()}` : '';
  }
}

function phase5SyncChecklistViewUi_(){
  const listBtn = document.querySelector('#phase5BtnViewList');
  const kanBtn = document.querySelector('#phase5BtnViewKanban');
  const taskList = document.querySelector('#taskList');
  const kan = document.querySelector('#phase5KanbanWrap');
  if(listBtn) listBtn.classList.toggle('is-active', phase5State_.checklistView === 'list');
  if(kanBtn) kanBtn.classList.toggle('is-active', phase5State_.checklistView === 'kanban');
  if(taskList) taskList.style.display = (phase5State_.checklistView === 'list') ? '' : 'none';
  if(kan) kan.classList.toggle('is-open', phase5State_.checklistView === 'kanban');
}

function phase5AttachChecklistDnD_(taskList, m){
  if(!taskList) return;
  if(taskList.__phase5DndBound) return;
  taskList.__phase5DndBound = true;

  taskList.addEventListener('dragover', (e) => {
    const active = taskList.querySelector('.task.phase5-dragging');
    if(!active) return;
    e.preventDefault();
    const target = e.target && e.target.closest ? e.target.closest('.task') : null;
    phase5ClearListDropMarkers_(taskList);
    if(target && target !== active){
      const r = target.getBoundingClientRect();
      const after = e.clientY > (r.top + r.height / 2);
      target.classList.add(after ? 'phase5-drop-after' : 'phase5-drop-before');
    }
  });

  taskList.addEventListener('drop', (e) => {
    const ctx = phase5GetChecklistContext_();
    const ms = ctx && ctx.m;
    if(!ms || !Array.isArray(ms.tasks)) return;
    const fromId = phase5State_.dragTaskId;
    if(!fromId) return;
    e.preventDefault();

    // Disable reorder when any task is hidden (filtering active) to avoid confusing index outcomes.
    const hasHidden = Array.from(taskList.querySelectorAll('.task')).some(el => el.classList.contains('phase3-hidden'));
    if(hasHidden){
      phase5ClearListDropMarkers_(taskList);
      alert('Turn off checklist filters before drag reordering in List view.');
      return;
    }

    const target = e.target && e.target.closest ? e.target.closest('.task') : null;
    const fromIdx = ms.tasks.findIndex(t => t && t.id === fromId);
    if(fromIdx < 0){ phase5ClearListDropMarkers_(taskList); return; }

    let toIdx = ms.tasks.length - 1;
    let insertAfter = true;
    if(target){
      const tid = target.dataset.taskId;
      const idx = ms.tasks.findIndex(t => t && t.id === tid);
      if(idx >= 0){
        toIdx = idx;
        const r = target.getBoundingClientRect();
        insertAfter = e.clientY > (r.top + r.height / 2);
      }
    }

    if(!target){
      toIdx = ms.tasks.length - 1;
      insertAfter = true;
    }

    let insertIdx = Math.max(0, Math.min(ms.tasks.length, toIdx + (insertAfter ? 1 : 0)));
    const [moved] = ms.tasks.splice(fromIdx, 1);
    if(!moved){ phase5ClearListDropMarkers_(taskList); return; }
    if(fromIdx < insertIdx) insertIdx -= 1;
    insertIdx = Math.max(0, Math.min(ms.tasks.length, insertIdx));
    ms.tasks.splice(insertIdx, 0, moved);

    phase5ClearListDropMarkers_(taskList);
    addActivity(`Reordered task: ${moved.title}`);
    saveState();
    renderAll();
  });

  taskList.addEventListener('dragend', () => {
    phase5State_.dragTaskId = null;
    phase5ClearListDropMarkers_(taskList);
    Array.from(taskList.querySelectorAll('.task.phase5-dragging')).forEach(el => el.classList.remove('phase5-dragging'));
  });
}

function phase5InjectTaskRowExtras_(m){
  const taskList = document.querySelector('#taskList');
  if(!taskList || !m || !Array.isArray(m.tasks)) return;
  const cards = Array.from(taskList.querySelectorAll('.task'));
  cards.forEach((el) => {
    const tid = el.dataset.taskId;
    const t = m.tasks.find(x => x.id === tid);
    if(!t) return;
    phase5NormalizeTaskMeta_(t);

    // Drag handle
    const actions = el.querySelector('.task__actions');
    if(actions && !actions.querySelector('[data-act="phase5Grip"]')){
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'iconbtn phase5-taskGrip';
      grip.dataset.act = 'phase5Grip';
      grip.title = 'Drag to reorder task';
      grip.textContent = '⋮⋮';
      grip.draggable = true;
      grip.addEventListener('dragstart', (e) => {
        if(phase5State_.checklistView !== 'list'){ e.preventDefault(); return; }
        phase5State_.dragTaskId = t.id;
        el.classList.add('phase5-dragging');
        try{
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', t.id);
        }catch{ /* ignore */ }
      });
      grip.addEventListener('dragend', () => {
        el.classList.remove('phase5-dragging');
      });
      actions.insertBefore(grip, actions.firstChild || null);
    }

    // Recurring badge + generate-next action
    const meta = el.querySelector('.task__meta');
    if(meta){
      Array.from(meta.querySelectorAll('.phase5-recur-badge')).forEach(n => n.remove());
      if(t.recurrenceDays > 0){
        const b = document.createElement('span');
        b.className = 'badge phase5-recur-badge';
        b.textContent = `R/${t.recurrenceDays}d`;
        b.title = t.recurrenceTemplate ? `Recurring template: ${t.recurrenceTemplate}` : `Repeats every ${t.recurrenceDays} day(s)`;
        meta.appendChild(b);
      }
    }

    if(actions){
      if(t.recurrenceDays > 0 && !actions.querySelector('[data-act="phase5NextRecurring"]')){
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'iconbtn';
        btn.dataset.act = 'phase5NextRecurring';
        btn.title = 'Generate next recurring task';
        btn.textContent = '⟳';
        btn.addEventListener('click', () => phase5GenerateNextRecurringTask_(m, t));
        actions.insertBefore(btn, actions.firstChild || null);
      }
      if(t.recurrenceDays <= 0){
        const stale = actions.querySelector('[data-act="phase5NextRecurring"]');
        if(stale) stale.remove();
      }
    }
  });
}

function phase5ClearListDropMarkers_(taskList){
  if(!taskList) return;
  Array.from(taskList.querySelectorAll('.task.phase5-drop-before,.task.phase5-drop-after')).forEach(el => {
    el.classList.remove('phase5-drop-before', 'phase5-drop-after');
  });
}

function phase5RenderKanban_(){
  const grid = document.querySelector('#phase5KanbanGrid');
  const wrap = document.querySelector('#phase5KanbanWrap');
  if(!grid || !wrap) return;

  const ctx = phase5GetChecklistContext_();
  const p = ctx && ctx.p;
  const m = ctx && ctx.m;
  if(!p || !m){
    grid.innerHTML = '';
    return;
  }

  const tasks = Array.isArray(m.tasks) ? m.tasks : [];
  const filtered = tasks.filter(t => {
    try{
      return (typeof phase3TaskMatchesFilter_ === 'function') ? phase3TaskMatchesFilter_(t) : true;
    }catch{ return true; }
  });
  filtered.forEach(phase5NormalizeTaskMeta_);

  const lanes = {
    todo: filtered.filter(t => t.kanbanStage === 'todo'),
    doing: filtered.filter(t => t.kanbanStage === 'doing'),
    done: filtered.filter(t => t.kanbanStage === 'done' || t.done),
  };

  const defs = [
    ['todo','TO DO'],
    ['doing','DOING'],
    ['done','DONE'],
  ];

  grid.innerHTML = defs.map(([key, label]) => {
    const items = lanes[key] || [];
    const body = items.map(t => phase5RenderKanbanCardHtml_(t)).join('') || `<div class="phase5-kempty">Drop tasks here</div>`;
    return `
      <div class="phase5-lane" data-stage="${key}">
        <div class="phase5-lane__head">
          <div class="phase5-lane__title">${label}</div>
          <div class="phase5-lane__count">${items.length}</div>
        </div>
        <div class="phase5-lane__body">${body}</div>
      </div>
    `;
  }).join('');

  // Bind lane events
  Array.from(grid.querySelectorAll('.phase5-lane')).forEach(lane => {
    lane.addEventListener('dragenter', (e) => {
      e.preventDefault();
      lane.classList.add('phase5-lane--drag');
    });
    lane.addEventListener('dragover', (e) => {
      e.preventDefault();
      lane.classList.add('phase5-lane--drag');
    });
    lane.addEventListener('dragleave', (e) => {
      if(lane.contains(e.relatedTarget)) return;
      lane.classList.remove('phase5-lane--drag');
    });
    lane.addEventListener('drop', (e) => {
      e.preventDefault();
      lane.classList.remove('phase5-lane--drag');
      const stage = String(lane.dataset.stage || 'todo');
      phase5HandleKanbanDrop_(m, stage, e);
    });
  });

  // Bind card drag + quick actions
  Array.from(grid.querySelectorAll('.phase5-kcard')).forEach(card => {
    const tid = card.dataset.taskId;
    const t = tasks.find(x => x.id === tid);
    if(!t) return;

    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
      phase5State_.kanbanDragTaskId = t.id;
      card.classList.add('phase5-kdrag');
      try{
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', t.id);
      }catch{ /* ignore */ }
    });
    card.addEventListener('dragend', () => {
      phase5State_.kanbanDragTaskId = null;
      card.classList.remove('phase5-kdrag');
      Array.from(grid.querySelectorAll('.phase5-lane--drag')).forEach(el => el.classList.remove('phase5-lane--drag'));
    });

    const editBtn = card.querySelector('[data-act="phase5OpenInList"]');
    if(editBtn){
      editBtn.addEventListener('click', () => {
        phase5State_.checklistView = 'list';
        phase5SaveUiState_();
        phase5SyncChecklistViewUi_();
        const row = document.querySelector(`#taskList .task[data-task-id="${CSS.escape(t.id)}"]`);
        if(row) row.scrollIntoView({ behavior:'smooth', block:'center' });
      });
    }

    const recurBtn = card.querySelector('[data-act="phase5KNextRecurring"]');
    if(recurBtn){
      recurBtn.addEventListener('click', () => phase5GenerateNextRecurringTask_(m, t));
    }
  });
}

function phase5RenderKanbanCardHtml_(t){
  phase5NormalizeTaskMeta_(t);
  const dueText = t.dueAt ? phase5FmtDateISO_(t.dueAt) : '';
  const dueBucket = (typeof phase4DueBucket_ === 'function' && t.dueAt) ? phase4DueBucket_(t.dueAt) : '';
  const dueWarn = (dueBucket === 'overdue' || dueBucket === 'today') ? ' badge--warn' : '';
  return `
    <div class="phase5-kcard ${t.done ? 'is-done' : ''}" data-task-id="${escapeHtml(t.id)}">
      <div class="phase5-kcard__title">${escapeHtml(t.title || '')}</div>
      <div class="phase5-kcard__meta">
        <span class="badge ${t.severity !== 'normal' ? 'badge--warn' : ''}">${escapeHtml(String(t.severity || 'normal').toUpperCase())}</span>
        ${t.assignee ? `<span class="badge">${escapeHtml(t.assignee)}</span>` : ''}
        ${dueText ? `<span class="badge${dueWarn}">DUE ${escapeHtml(dueText)}</span>` : ''}
        ${Array.isArray(t.blockedBy) && t.blockedBy.length ? `<span class="badge">DEPS ${t.blockedBy.length}</span>` : ''}
        ${Number(t.recurrenceDays||0) > 0 ? `<span class="badge phase5-recur-badge">R/${t.recurrenceDays}d</span>` : ''}
      </div>
      <div class="phase5-kcard__foot">
        <button class="iconbtn" type="button" data-act="phase5OpenInList" title="Open in List">↩</button>
        ${Number(t.recurrenceDays||0) > 0 ? `<button class="iconbtn" type="button" data-act="phase5KNextRecurring" title="Generate next recurring">⟳</button>` : '<span></span>'}
      </div>
    </div>
  `;
}

function phase5HandleKanbanDrop_(m, stage, ev){
  if(!m || !Array.isArray(m.tasks)) return;
  const fromId = phase5State_.kanbanDragTaskId || (() => { try{ return ev.dataTransfer.getData('text/plain'); }catch{ return ''; } })();
  if(!fromId) return;
  const t = m.tasks.find(x => x.id === fromId);
  if(!t) return;
  phase5NormalizeTaskMeta_(t);

  const prevStage = t.kanbanStage;
  const nextStage = (stage === 'doing' || stage === 'done') ? stage : 'todo';
  t.kanbanStage = nextStage;
  t.done = nextStage === 'done';

  // Optional reorder inside array: move near target card if dropped over a card.
  const targetCard = ev.target && ev.target.closest ? ev.target.closest('.phase5-kcard') : null;
  if(targetCard){
    const targetId = targetCard.dataset.taskId;
    if(targetId && targetId !== t.id){
      const fromIdx = m.tasks.findIndex(x => x.id === t.id);
      const toIdx = m.tasks.findIndex(x => x.id === targetId);
      if(fromIdx >= 0 && toIdx >= 0){
        const [moved] = m.tasks.splice(fromIdx, 1);
        let insert = toIdx;
        if(fromIdx < insert) insert -= 1;
        m.tasks.splice(Math.max(0, insert), 0, moved);
      }
    }
  } else {
    // Append to end of same milestone for lane drop (keeps board grouping less jumpy)
    const idx = m.tasks.findIndex(x => x.id === t.id);
    if(idx >= 0){
      const [moved] = m.tasks.splice(idx, 1);
      m.tasks.push(moved);
    }
  }

  if(prevStage !== nextStage){
    addActivity(`Kanban move: ${t.title} → ${String(nextStage).toUpperCase()}`);
    saveState();
    renderAll();
  }else{
    saveState();
    renderAll();
  }
}

function phase5GetTemplates_(){
  try{
    const arr = JSON.parse(localStorage.getItem(PHASE5_REC_TPL_KEY) || '[]');
    if(!Array.isArray(arr)) return [];
    return arr.filter(x => x && typeof x === 'object').map(phase5SanitizeTemplate_);
  }catch{ return []; }
}

function phase5SaveTemplates_(arr){
  try{ localStorage.setItem(PHASE5_REC_TPL_KEY, JSON.stringify((arr || []).map(phase5SanitizeTemplate_))); }catch{ /* ignore */ }
}

function phase5SanitizeTemplate_(t){
  const dueOffsetDays = Number(t?.dueOffsetDays || 0);
  const recurrenceDays = Number(t?.recurrenceDays || 0);
  return {
    id: String(t?.id || uid()),
    name: String(t?.name || 'Template').trim() || 'Template',
    title: String(t?.title || '').trim(),
    severity: (t?.severity === 'high' || t?.severity === 'blocker') ? t.severity : 'normal',
    assignee: String(t?.assignee || ''),
    dueOffsetDays: Number.isFinite(dueOffsetDays) && dueOffsetDays >= 0 ? Math.round(dueOffsetDays) : 0,
    recurrenceDays: Number.isFinite(recurrenceDays) && recurrenceDays > 0 ? Math.max(1, Math.round(recurrenceDays)) : 0,
    createdAt: Number(t?.createdAt || Date.now()),
    updatedAt: Date.now(),
  };
}

function phase5RefreshTemplateSelect_(){
  const sel = document.querySelector('#phase5TemplateSelect');
  if(!sel) return;
  const prev = sel.value;
  const templates = phase5GetTemplates_().sort((a,b) => a.name.localeCompare(b.name));
  sel.innerHTML = `<option value="">— Select template —</option>` + templates.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}${t.recurrenceDays ? ` • R/${t.recurrenceDays}d` : ''}</option>`).join('');
  if(templates.some(t => t.id === prev)) sel.value = prev;
}

function phase5CurrentTaskFormMeta_(){
  const dueOffset = Number(document.querySelector('#phase5TaskDueOffset')?.value || 0);
  const repeat = Number(document.querySelector('#phase5TaskRepeatDays')?.value || 0);
  return {
    dueOffsetDays: Number.isFinite(dueOffset) && dueOffset >= 0 ? Math.round(dueOffset) : 0,
    recurrenceDays: Number.isFinite(repeat) && repeat > 0 ? Math.max(1, Math.round(repeat)) : 0,
  };
}

function phase5CapturePendingAddMeta_(){
  phase5State_.pendingAddMeta = phase5CurrentTaskFormMeta_();
}

function phase5ApplyPendingAddMeta_(){
  const meta = phase5State_.pendingAddMeta;
  phase5State_.pendingAddMeta = null;
  if(!meta) return;
  if(!(meta.dueOffsetDays > 0 || meta.recurrenceDays > 0)) return;

  const ctx = phase5GetChecklistContext_();
  const m = ctx && ctx.m;
  if(!m || !Array.isArray(m.tasks) || !m.tasks.length) return;
  const t = m.tasks[0]; // core add inserts unshift
  if(!t) return;

  phase5NormalizeTaskMeta_(t);
  if(meta.recurrenceDays > 0){
    t.recurrenceDays = meta.recurrenceDays;
    if(!t.recurrenceTemplate) t.recurrenceTemplate = '';
  }
  if(meta.dueOffsetDays > 0 && !t.dueAt){
    t.dueAt = phase5DatePlusDays_(Date.now(), meta.dueOffsetDays);
  }

  addActivity(`Task scheduling meta applied: ${t.title}${meta.recurrenceDays ? ` • every ${meta.recurrenceDays}d` : ''}${meta.dueOffsetDays ? ` • due +${meta.dueOffsetDays}d` : ''}`);
  saveState();
  renderAll();
}

async function phase5SaveTemplateFromForm_(){
  const title = String(ui?.taskText?.value || '').trim();
  if(!title){
    alert('Enter a task title first (in Add Task) before saving as a template.');
    ui?.taskText?.focus?.();
    return;
  }

  const ask = await pmPromptDialog_('Template name?', title, { title:'Save Recurring Template', placeholder:'Template name' });
  if(ask == null) return;
  const name = String(ask || '').trim();
  if(!name) return;

  const meta = phase5CurrentTaskFormMeta_();
  const tpl = phase5SanitizeTemplate_({
    id: uid(),
    name,
    title,
    severity: ui?.taskSeverity?.value || 'normal',
    assignee: String(ui?.taskAssignee?.value || '').trim(),
    dueOffsetDays: meta.dueOffsetDays,
    recurrenceDays: meta.recurrenceDays,
    createdAt: Date.now(),
  });

  const arr = phase5GetTemplates_();
  const idx = arr.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
  if(idx >= 0){
    const ok = await pmConfirmDialog_(`Template "${name}" already exists. Replace it?`, { title:'Replace Template', okText:'Replace', danger:true });
    if(!ok) return;
    tpl.id = arr[idx].id;
    arr[idx] = tpl;
  }else{
    arr.push(tpl);
  }

  phase5SaveTemplates_(arr);
  phase5RefreshTemplateSelect_();
  const sel = document.querySelector('#phase5TemplateSelect');
  if(sel) sel.value = tpl.id;
  addActivity(`Saved recurring template: ${tpl.name}`);
}

function phase5LoadTemplateIntoForm_(){
  const sel = document.querySelector('#phase5TemplateSelect');
  const id = String(sel?.value || '');
  if(!id) return;
  const tpl = phase5GetTemplates_().find(x => x.id === id);
  if(!tpl) return;
  if(ui?.taskText) ui.taskText.value = tpl.title || '';
  if(ui?.taskSeverity) ui.taskSeverity.value = tpl.severity || 'normal';
  if(ui?.taskAssignee) ui.taskAssignee.value = tpl.assignee || '';
  const dueEl = document.querySelector('#phase5TaskDueOffset');
  const repEl = document.querySelector('#phase5TaskRepeatDays');
  if(dueEl) dueEl.value = String(tpl.dueOffsetDays || 0);
  if(repEl) repEl.value = String(tpl.recurrenceDays || 0);
  pulseDirty();
}

async function phase5DeleteSelectedTemplate_(){
  const sel = document.querySelector('#phase5TemplateSelect');
  const id = String(sel?.value || '');
  if(!id) return;
  const arr = phase5GetTemplates_();
  const tpl = arr.find(x => x.id === id);
  if(!tpl) return;
  const ok = await pmConfirmDialog_(`Delete template "${tpl.name}"?`, { title:'Delete Recurring Template', okText:'Delete', danger:true });
  if(!ok) return;
  phase5SaveTemplates_(arr.filter(x => x.id !== id));
  phase5RefreshTemplateSelect_();
  addActivity(`Deleted recurring template: ${tpl.name}`);
}

function phase5ApplySelectedTemplate_(){
  const sel = document.querySelector('#phase5TemplateSelect');
  const id = String(sel?.value || '');
  if(!id){
    alert('Select a template first.');
    return;
  }
  const tpl = phase5GetTemplates_().find(x => x.id === id);
  if(!tpl){
    alert('Template not found.');
    return;
  }

  const ctx = phase5GetChecklistContext_();
  const p = ctx && ctx.p;
  const m = ctx && ctx.m;
  if(!p){ alert('Create/select a project first.'); return; }
  if(!m){ alert('Create/select a milestone first.'); return; }

  /** @type {Task} */
  const t = {
    id: uid(),
    title: tpl.title || tpl.name,
    done: false,
    severity: tpl.severity || 'normal',
    assignee: tpl.assignee || '',
    createdAt: Date.now(),
    steps: [],
  };
  phase5NormalizeTaskMeta_(t);
  if(tpl.dueOffsetDays > 0) t.dueAt = phase5DatePlusDays_(Date.now(), tpl.dueOffsetDays);
  if(tpl.recurrenceDays > 0) t.recurrenceDays = tpl.recurrenceDays;
  t.recurrenceTemplate = tpl.name;

  m.tasks.unshift(t);
  addActivity(`Applied template: ${tpl.name} → ${t.title}`);
  saveState();
  renderAll();

  if(ui?.taskText) ui.taskText.value = t.title;
}

function phase5GenerateNextRecurringTask_(m, sourceTask){
  if(!m || !sourceTask) return;
  phase5NormalizeTaskMeta_(sourceTask);
  const every = Number(sourceTask.recurrenceDays || 0);
  if(!(every > 0)) return;

  const now = Date.now();
  // simple duplicate guard to avoid accidental double-click spam
  if(sourceTask.lastRecurringGeneratedAt && (now - Number(sourceTask.lastRecurringGeneratedAt || 0)) < 1200){
    return;
  }

  const baseDue = Number(sourceTask.dueAt || 0) > 0 ? Number(sourceTask.dueAt) : now;
  const nextDue = phase5DatePlusDays_(baseDue, every);

  const next = {
    id: uid(),
    title: String(sourceTask.title || 'Recurring Task'),
    done: false,
    severity: sourceTask.severity || 'normal',
    assignee: sourceTask.assignee || '',
    createdAt: now,
    steps: phase5CloneStepsResetDone_(sourceTask.steps || []),
    blockedBy: [],
    blockerNote: '',
    dueAt: nextDue,
    kanbanStage: 'todo',
    recurrenceDays: every,
    recurrenceTemplate: String(sourceTask.recurrenceTemplate || ''),
    lastRecurringGeneratedAt: null,
  };
  phase5NormalizeTaskMeta_(next);

  // insert right after source when possible
  const idx = m.tasks.findIndex(x => x.id === sourceTask.id);
  if(idx >= 0) m.tasks.splice(idx + 1, 0, next);
  else m.tasks.unshift(next);

  sourceTask.lastRecurringGeneratedAt = now;
  addActivity(`Generated next recurring task: ${next.title} (every ${every}d)`);
  saveState();
  renderAll();
}

function phase5CloneStepsResetDone_(steps){
  if(!Array.isArray(steps)) return [];
  return steps.map(s => ({
    id: uid(),
    text: String(s?.text || ''),
    done: false,
    children: phase5CloneStepsResetDone_(Array.isArray(s?.children) ? s.children : []),
  }));
}

function phase5DatePlusDays_(baseTs, days){
  const d = new Date(Number(baseTs || Date.now()));
  d.setHours(12,0,0,0);
  d.setDate(d.getDate() + Math.max(0, Math.round(Number(days || 0))));
  return d.getTime();
}

function phase5FmtDateISO_(ts){
  const d = new Date(Number(ts || 0));
  if(!Number.isFinite(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function phase5ParsePmDue_(raw){
  const s = String(raw || '').trim();
  if(!s) return 0;
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
    const [y,m,d] = s.split('-').map(Number);
    const dt = new Date(y, (m||1)-1, d||1, 12, 0, 0, 0);
    return Number.isFinite(dt.getTime()) ? dt.getTime() : 0;
  }
  const n = Number(s);
  if(Number.isFinite(n) && n > 0) return n;
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? parsed : 0;
}

// boot phase 5 after phase 4 patch is loaded
try{ initPhase5_(); }catch(err){ console.warn('Phase5 init failed', err); }

