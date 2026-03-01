/* ---------------------------
   Phase 7 Upgrade (Additive Patch)
   - Blueprint templates (project / module / milestone)
   - Auto recurring safe mode (on complete)
   - Dependency-aware scheduling assist (suggest/push due dates)
   - Assignee capacity settings + overload warnings
   - Snapshot compare view
   - Portable Export/Import V2 bundle (state + local phase data)
---------------------------- */

var PHASE7_BLUEPRINT_KEY = 'stark_pm_phase7_blueprints_v1';
var PHASE7_CAPACITY_KEY = 'stark_pm_phase7_capacity_v1';
var PHASE7_CFG_KEY = 'stark_pm_phase7_cfg_v1';
var phase7State_ = {
  inited: false,
  patched: false,
  cfg: {
    autoRecurringOnComplete: false,
    autoRecurringOnlyWhenDueExists: false,
    scheduleGapDays: 1,
    scheduleBaseDays: 1,
    scheduleSeverityWeight: true,
  },
};

function initPhase7_(){
  if(phase7State_.inited) return;
  phase7State_.inited = true;
  phase7LoadCfg_();
  phase7EnsureStyles_();
  phase7PatchFunctions_();
  phase7EnsureTopbarButtons_();
  phase7EnsureBundleImportInput_();
  try{ phase7PostRenderChecklist_(); }catch{}
  try{ phase7PostRenderDashboard_(); }catch{}
  try{ phase7PostRenderProjects_(); }catch{}
}

function phase7LoadCfg_(){
  try{
    const raw = localStorage.getItem(PHASE7_CFG_KEY);
    const x = raw ? JSON.parse(raw) : {};
    if(!x || typeof x !== 'object') return;
    phase7State_.cfg.autoRecurringOnComplete = !!x.autoRecurringOnComplete;
    phase7State_.cfg.autoRecurringOnlyWhenDueExists = !!x.autoRecurringOnlyWhenDueExists;
    const g = Number(x.scheduleGapDays);
    const b = Number(x.scheduleBaseDays);
    phase7State_.cfg.scheduleGapDays = Number.isFinite(g) && g >= 0 ? Math.round(g) : 1;
    phase7State_.cfg.scheduleBaseDays = Number.isFinite(b) && b > 0 ? Math.max(1, Math.round(b)) : 1;
    phase7State_.cfg.scheduleSeverityWeight = x.scheduleSeverityWeight !== false;
  }catch{}
}

function phase7SaveCfg_(){
  try{ localStorage.setItem(PHASE7_CFG_KEY, JSON.stringify(phase7State_.cfg || {})); }catch{}
}

function phase7EnsureStyles_(){
  if(document.querySelector('#phase7Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase7Styles';
  st.textContent = `
    .phase7-box{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08)}
    .phase7-title{font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.88;margin-bottom:8px}
    .phase7-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .phase7-card{border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.02);padding:10px}
    .phase7-card .row{margin-top:8px}
    .phase7-card .row:first-child{margin-top:0}
    .phase7-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .phase7-kv .badge{justify-self:start}
    .phase7-hint{font-size:12px;opacity:.78}
    .phase7-list{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto}
    .phase7-diff{font-size:12px;line-height:1.35}
    .phase7-diff ul{margin:6px 0 0 18px;padding:0}
    .phase7-diff li{margin:2px 0}
    .phase7-capTable{width:100%;border-collapse:separate;border-spacing:0 6px;font-size:12px}
    .phase7-capTable th{text-align:left;font-size:11px;opacity:.75;padding:0 8px}
    .phase7-capTable td{padding:8px;background:rgba(255,255,255,.01);border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06)}
    .phase7-capTable td:first-child{border-left:1px solid rgba(255,255,255,.06);border-radius:10px 0 0 10px}
    .phase7-capTable td:last-child{border-right:1px solid rgba(255,255,255,.06);border-radius:0 10px 10px 0}
    .phase7-capInput{width:88px}
    .phase7-mini{font-size:11px;opacity:.75}
    .phase7-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .phase7-toolbar .btn{padding:6px 10px}
    .phase7-over{border-color:rgba(255,110,110,.25)!important;background:rgba(255,80,80,.03)!important}
    .phase7-ok{border-color:rgba(146,255,176,.18)!important}
    .phase7-schedRow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .phase7-schedRow .input,.phase7-schedRow .select{max-width:160px}
    .phase7-path{padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.01);margin-top:8px}
    .phase7-bpGrid{display:grid;grid-template-columns:1fr;gap:8px}
    .phase7-bpSection{border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:8px;background:rgba(255,255,255,.01)}
    .phase7-bpSection .phase7-mini{margin-top:4px}
    .phase7-inline{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap}
    .phase7-tag{font-size:11px;opacity:.75}
    @media (max-width: 980px){ .phase7-grid{grid-template-columns:1fr} .phase7-kv{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase7PatchFunctions_(){
  if(phase7State_.patched) return;
  phase7State_.patched = true;

  if(typeof renderChecklist === 'function' && !renderChecklist._phase7Wrapped){
    const orig = renderChecklist;
    renderChecklist = function(){
      const out = orig.apply(this, arguments);
      try{ phase7PostRenderChecklist_(); }catch(err){ console.warn('Phase7 checklist render failed', err); }
      return out;
    };
    renderChecklist._phase7Wrapped = true;
  }

  if(typeof renderDashboard === 'function' && !renderDashboard._phase7Wrapped){
    const orig = renderDashboard;
    renderDashboard = function(){
      const out = orig.apply(this, arguments);
      try{ phase7PostRenderDashboard_(); }catch(err){ console.warn('Phase7 dashboard render failed', err); }
      return out;
    };
    renderDashboard._phase7Wrapped = true;
  }

  if(typeof renderProjects === 'function' && !renderProjects._phase7Wrapped){
    const orig = renderProjects;
    renderProjects = function(){
      const out = orig.apply(this, arguments);
      try{ phase7PostRenderProjects_(); }catch(err){ console.warn('Phase7 projects render failed', err); }
      return out;
    };
    renderProjects._phase7Wrapped = true;
  }

  if(typeof phase5HandleKanbanDrop_ === 'function' && !phase5HandleKanbanDrop_._phase7Wrapped){
    const orig = phase5HandleKanbanDrop_;
    phase5HandleKanbanDrop_ = function(m, stage, ev){
      let tid = null, wasDone = null;
      try{ tid = phase5State_?.kanbanDragTaskId || null; }catch{}
      try{ const t0 = Array.isArray(m?.tasks) ? m.tasks.find(x => x && x.id === tid) : null; if(t0) wasDone = !!t0.done; }catch{}
      const out = orig.apply(this, arguments);
      try{
        if(tid && m && Array.isArray(m.tasks)){
          const t = m.tasks.find(x => x && x.id === tid);
          if(t && !wasDone && !!t.done) phase7TryAutoRecurringOnComplete_(m, t, 'kanban');
        }
      }catch(err){ console.warn('Phase7 kanban auto recurring failed', err); }
      return out;
    };
    phase5HandleKanbanDrop_._phase7Wrapped = true;
  }

  if(typeof phase6RenderSnapshotList_ === 'function' && !phase6RenderSnapshotList_._phase7Wrapped){
    const orig = phase6RenderSnapshotList_;
    phase6RenderSnapshotList_ = function(){
      const out = orig.apply(this, arguments);
      try{ phase7RenderSnapshotCompare_(); }catch(err){ console.warn('Phase7 snapshot compare refresh failed', err); }
      return out;
    };
    phase6RenderSnapshotList_._phase7Wrapped = true;
  }

  if(typeof phase3BuildCmdkItems_ === 'function' && !phase3BuildCmdkItems_._phase7Wrapped){
    const orig = phase3BuildCmdkItems_;
    phase3BuildCmdkItems_ = function(){
      const items = orig.apply(this, arguments) || [];
      items.push(
        { kind:'command', title:'Phase 7: Blueprint Templates', sub:'Open Projects tab and focus blueprint panel', tag:'PH7', act:'phase7Blueprints' },
        { kind:'command', title:'Phase 7: Scheduling Assist', sub:'Open Checklist and focus scheduling helper', tag:'PH7', act:'phase7Scheduling' },
        { kind:'command', title:'Phase 7: Capacity Planner', sub:'Open Dashboard capacity panel', tag:'PH7', act:'phase7Capacity' },
        { kind:'command', title:'Phase 7: Export V2 Bundle', sub:'Portable backup with templates/snapshots/capacity', tag:'PH7', act:'phase7ExportV2' }
      );
      return items;
    };
    phase3BuildCmdkItems_._phase7Wrapped = true;
  }

  if(typeof phase3RunCmdkAction_ === 'function' && !phase3RunCmdkAction_._phase7Wrapped){
    const orig = phase3RunCmdkAction_;
    phase3RunCmdkAction_ = function(it){
      if(it && it.act === 'phase7Blueprints'){
        switchTab('projects');
        setTimeout(() => document.querySelector('#phase7BlueprintsBox')?.scrollIntoView({behavior:'smooth', block:'start'}), 10);
        return true;
      }
      if(it && it.act === 'phase7Scheduling'){
        switchTab('checklist');
        setTimeout(() => document.querySelector('#phase7SchedulingAssist')?.scrollIntoView({behavior:'smooth', block:'start'}), 10);
        return true;
      }
      if(it && it.act === 'phase7Capacity'){
        switchTab('dashboard');
        setTimeout(() => document.querySelector('#phase7CapacityPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10);
        return true;
      }
      if(it && it.act === 'phase7ExportV2'){
        phase7ExportV2Bundle_();
        return true;
      }
      return orig.apply(this, arguments);
    };
    phase3RunCmdkAction_._phase7Wrapped = true;
  }
}

function phase7EnsureTopbarButtons_(){
  const topbarRight = document.querySelector('.topbar__right');
  if(!topbarRight) return;
  if(!document.querySelector('#phase7BtnExportV2')){
    const exp = document.createElement('button');
    exp.id = 'phase7BtnExportV2';
    exp.className = 'btn btn--ghost';
    exp.type = 'button';
    exp.textContent = 'Export V2';
    exp.title = 'Portable bundle export (state + snapshots/templates/capacity/blueprints)';
    exp.addEventListener('click', phase7ExportV2Bundle_);
    const anchor = document.querySelector('#btnExportJson') || topbarRight.firstElementChild;
    topbarRight.insertBefore(exp, anchor);
  }
  if(!document.querySelector('#phase7BtnImportV2')){
    const imp = document.createElement('button');
    imp.id = 'phase7BtnImportV2';
    imp.className = 'btn btn--ghost';
    imp.type = 'button';
    imp.textContent = 'Import V2';
    imp.title = 'Import portable V2 bundle';
    imp.addEventListener('click', () => document.querySelector('#phase7BundleInput')?.click());
    const anchor = document.querySelector('#phase7BtnExportV2')?.nextSibling || document.querySelector('#btnExportJson');
    topbarRight.insertBefore(imp, anchor || null);
  }
}

function phase7EnsureBundleImportInput_(){
  if(document.querySelector('#phase7BundleInput')) return;
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.id = 'phase7BundleInput';
  inp.accept = '.json,application/json';
  inp.style.display = 'none';
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0];
    if(!f) return;
    try{
      const text = await f.text();
      phase7ImportV2BundleFromText_(text, f.name || 'bundle.json');
    }catch(err){
      alert('Failed to read bundle file.');
      console.warn('Phase7 import read failed', err);
    }finally{
      inp.value = '';
    }
  });
  document.body.appendChild(inp);
}

function phase7GetChecklistCtx_(){
  if(typeof phase6GetChecklistContext_ === 'function') return phase6GetChecklistContext_();
  if(typeof phase5GetChecklistContext_ === 'function') return phase5GetChecklistContext_();
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  return { p, m };
}

function phase7PostRenderChecklist_(){
  phase7BindChecklistAutoRecurring_();
  phase7EnsureRecurringAutoUi_();
  phase7EnsureSchedulingAssistUi_();
  phase7RenderSchedulingAssist_();
}

function phase7BindChecklistAutoRecurring_(){
  const taskList = document.querySelector('#taskList');
  if(!taskList || taskList.__phase7AutoRecurringBound) return;
  taskList.__phase7AutoRecurringBound = true;
  taskList.addEventListener('click', (e) => {
    const check = e.target && e.target.closest ? e.target.closest('.task__check') : null;
    if(!check) return;
    const taskEl = check.closest('.task');
    const tid = taskEl ? String(taskEl.dataset.taskId || '') : '';
    if(!tid) return;
    setTimeout(() => {
      try{
        const ctx = phase7GetChecklistCtx_();
        const m = ctx && ctx.m;
        if(!m || !Array.isArray(m.tasks)) return;
        const t = m.tasks.find(x => x && x.id === tid);
        if(t && t.done) phase7TryAutoRecurringOnComplete_(m, t, 'list');
      }catch(err){ console.warn('Phase7 list auto recurring failed', err); }
    }, 0);
  }, true);
}

function phase7EnsureRecurringAutoUi_(){
  const host = document.querySelector('#phase5RecurringBox');
  if(!host || document.querySelector('#phase7RecurringAutoBox')) return;
  const box = document.createElement('div');
  box.id = 'phase7RecurringAutoBox';
  box.className = 'phase7-box';
  box.innerHTML = `
    <div class="phase7-title">Auto Recurring Safe Mode</div>
    <div class="phase7-toolbar">
      <label class="phase7-inline"><input type="checkbox" id="phase7AutoRecurringToggle" /> Auto-generate next recurring task when marked done</label>
      <label class="phase7-inline"><input type="checkbox" id="phase7AutoRecurringDueOnly" /> Only if source task has due date</label>
    </div>
    <div class="phase7-hint">Safe mode generates at most once per source task completion. Manual ⟳ generation still works.</div>
  `;
  host.appendChild(box);

  const t1 = box.querySelector('#phase7AutoRecurringToggle');
  const t2 = box.querySelector('#phase7AutoRecurringDueOnly');
  if(t1) t1.checked = !!phase7State_.cfg.autoRecurringOnComplete;
  if(t2) t2.checked = !!phase7State_.cfg.autoRecurringOnlyWhenDueExists;
  t1?.addEventListener('change', () => {
    phase7State_.cfg.autoRecurringOnComplete = !!t1.checked;
    phase7SaveCfg_();
  });
  t2?.addEventListener('change', () => {
    phase7State_.cfg.autoRecurringOnlyWhenDueExists = !!t2.checked;
    phase7SaveCfg_();
  });
}

function phase7TryAutoRecurringOnComplete_(m, t, source){
  if(!phase7State_.cfg.autoRecurringOnComplete) return;
  if(!m || !t) return;
  try{ if(typeof phase5NormalizeTaskMeta_ === 'function') phase5NormalizeTaskMeta_(t); }catch{}
  const every = Number(t.recurrenceDays || 0);
  if(!(every > 0)) return;
  if(phase7State_.cfg.autoRecurringOnlyWhenDueExists && !(Number(t.dueAt || 0) > 0)) return;
  if(!t.done) return;

  // Prevent duplicate auto-generation from repeated renders/toggles.
  if(t.phase7AutoRecurringGeneratedOnce) return;
  t.phase7AutoRecurringGeneratedOnce = true;

  try{
    if(typeof phase5GenerateNextRecurringTask_ === 'function'){
      phase5GenerateNextRecurringTask_(m, t);
      addActivity(`Auto recurring generated (${source || 'done'}): ${t.title}`);
    }
  }catch(err){
    t.phase7AutoRecurringGeneratedOnce = false;
    console.warn('Phase7 auto recurring generate failed', err);
  }
}

function phase7EnsureSchedulingAssistUi_(){
  const taskList = document.querySelector('#taskList');
  if(!taskList || !taskList.parentElement) return;
  let box = document.querySelector('#phase7SchedulingAssist');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase7SchedulingAssist';
    box.className = 'card';
    box.innerHTML = `
      <div class="card__top">
        <div>
          <div class="card__label">Scheduling Assist</div>
          <div class="card__hint">Dependency-aware due date suggestions and downstream push helper (active milestone)</div>
        </div>
        <div class="phase7-toolbar">
          <button class="btn btn--ghost" type="button" id="phase7BtnSchedSuggest">Suggest Missing Due Dates</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnSchedPush">Push Downstream</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnSchedRefresh">Refresh</button>
        </div>
      </div>
      <div class="phase7-schedRow" style="margin:8px 0 6px">
        <label class="phase7-inline">Gap days <input class="input" id="phase7SchedGap" type="number" min="0" step="1" /></label>
        <label class="phase7-inline">Base days/task <input class="input" id="phase7SchedBase" type="number" min="1" step="1" /></label>
        <label class="phase7-inline"><input type="checkbox" id="phase7SchedWeight" /> Severity weighted duration</label>
      </div>
      <div id="phase7SchedSummary" class="phase7-hint">No analysis yet.</div>
      <div id="phase7SchedPath" class="phase7-path phase7-diff"></div>
    `;
    taskList.parentElement.insertBefore(box, taskList);

    box.querySelector('#phase7BtnSchedRefresh')?.addEventListener('click', phase7RenderSchedulingAssist_);
    box.querySelector('#phase7BtnSchedSuggest')?.addEventListener('click', phase7ApplySuggestedDueDates_);
    box.querySelector('#phase7BtnSchedPush')?.addEventListener('click', phase7PushDownstreamDueDates_);

    const gapEl = box.querySelector('#phase7SchedGap');
    const baseEl = box.querySelector('#phase7SchedBase');
    const wEl = box.querySelector('#phase7SchedWeight');
    if(gapEl) gapEl.value = String(phase7State_.cfg.scheduleGapDays || 1);
    if(baseEl) baseEl.value = String(phase7State_.cfg.scheduleBaseDays || 1);
    if(wEl) wEl.checked = !!phase7State_.cfg.scheduleSeverityWeight;
    gapEl?.addEventListener('change', () => {
      const n = Number(gapEl.value || 0);
      phase7State_.cfg.scheduleGapDays = Number.isFinite(n) && n >= 0 ? Math.round(n) : 1;
      phase7SaveCfg_();
      phase7RenderSchedulingAssist_();
    });
    baseEl?.addEventListener('change', () => {
      const n = Number(baseEl.value || 1);
      phase7State_.cfg.scheduleBaseDays = Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : 1;
      phase7SaveCfg_();
      phase7RenderSchedulingAssist_();
    });
    wEl?.addEventListener('change', () => {
      phase7State_.cfg.scheduleSeverityWeight = !!wEl.checked;
      phase7SaveCfg_();
      phase7RenderSchedulingAssist_();
    });
  }
}

function phase7TaskDurationDays_(t){
  const base = Math.max(1, Math.round(Number(phase7State_.cfg.scheduleBaseDays || 1)));
  if(!phase7State_.cfg.scheduleSeverityWeight) return base;
  const sev = String(t?.severity || 'normal');
  if(sev === 'blocker') return base + 2;
  if(sev === 'high') return base + 1;
  return base;
}

function phase7AnalyzeMilestoneSchedule_(m){
  const graph = (typeof phase6BuildMilestoneGraph_ === 'function') ? phase6BuildMilestoneGraph_(m) : null;
  const tasks = Array.isArray(m?.tasks) ? m.tasks : [];
  const byId = graph?.byId || new Map(tasks.map(t => [t.id, t]));
  const depMemo = new Map();
  const stack = new Set();
  const gapDays = Math.max(0, Math.round(Number(phase7State_.cfg.scheduleGapDays || 0)));
  const dayMs = 86400000;
  const today = (typeof phase4TodayStart_ === 'function') ? phase4TodayStart_() : (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
  const baseStart = today + 12 * 3600 * 1000;

  function normDue(ts){
    const n = Number(ts || 0);
    if(!(n > 0)) return 0;
    const d = new Date(n); d.setHours(12,0,0,0); return d.getTime();
  }

  function plannedDue(id){
    if(depMemo.has(id)) return depMemo.get(id);
    if(stack.has(id)) return baseStart; // cycle fallback
    stack.add(id);
    const t = byId.get(id);
    if(!t){ stack.delete(id); return baseStart; }
    const deps = Array.isArray(t.blockedBy) ? t.blockedBy : [];
    let earliest = baseStart;
    for(const depIdRaw of deps){
      const depId = String(depIdRaw || '');
      const dep = byId.get(depId);
      if(!dep) continue;
      const depDue = Math.max(normDue(dep.dueAt), plannedDue(depId));
      earliest = Math.max(earliest, depDue + gapDays * dayMs);
    }
    const dur = phase7TaskDurationDays_(t);
    const result = earliest + Math.max(0, dur - 1) * dayMs;
    depMemo.set(id, result);
    stack.delete(id);
    return result;
  }

  const plan = [];
  for(const t of tasks){
    if(!t) continue;
    const suggestedDue = plannedDue(t.id);
    const existingDue = normDue(t.dueAt);
    const deps = Array.isArray(t.blockedBy) ? t.blockedBy : [];
    let minAllowedDue = baseStart;
    for(const depIdRaw of deps){
      const dep = byId.get(String(depIdRaw || ''));
      if(!dep) continue;
      const depDue = Math.max(normDue(dep.dueAt), depMemo.get(dep.id) || baseStart);
      minAllowedDue = Math.max(minAllowedDue, depDue + gapDays * dayMs);
    }
    plan.push({
      task: t,
      suggestedDue,
      existingDue,
      minAllowedDue,
      missingDue: !(existingDue > 0),
      needsPush: !!existingDue && existingDue < minAllowedDue && !t.done,
      durationDays: phase7TaskDurationDays_(t),
    });
  }

  const longest = plan
    .filter(x => !x.task.done)
    .sort((a,b) => (b.suggestedDue - a.suggestedDue) || ((Array.isArray(b.task.blockedBy)?b.task.blockedBy.length:0) - (Array.isArray(a.task.blockedBy)?a.task.blockedBy.length:0)))[0] || null;

  const chain = [];
  if(longest){
    let cur = longest.task;
    const seen = new Set();
    while(cur && !seen.has(cur.id)){
      seen.add(cur.id);
      chain.push(cur);
      const deps = Array.isArray(cur.blockedBy) ? cur.blockedBy : [];
      let next = null;
      let best = -Infinity;
      for(const depId of deps){
        const d = byId.get(String(depId || ''));
        if(!d) continue;
        const score = Number(depMemo.get(d.id) || 0);
        if(score > best){ best = score; next = d; }
      }
      cur = next;
    }
  }

  return {
    graph,
    plan,
    missingCount: plan.filter(x => x.missingDue && !x.task.done).length,
    pushCount: plan.filter(x => x.needsPush).length,
    overdueOpen: plan.filter(x => !x.task.done && typeof phase4IsOverdue_ === 'function' && phase4IsOverdue_(x.task)).length,
    longest,
    chain,
  };
}

function phase7RenderSchedulingAssist_(){
  const out = document.querySelector('#phase7SchedSummary');
  const path = document.querySelector('#phase7SchedPath');
  if(!out || !path) return;
  const ctx = phase7GetChecklistCtx_();
  const p = ctx && ctx.p;
  const m = ctx && ctx.m;
  if(!p || !m){
    out.textContent = 'Select a project and milestone to analyze scheduling.';
    path.innerHTML = '<div class="phase7-mini">No active milestone.</div>';
    return;
  }
  const a = phase7AnalyzeMilestoneSchedule_(m);
  const total = Array.isArray(m.tasks) ? m.tasks.length : 0;
  const open = (m.tasks || []).filter(t => !t.done).length;
  const cycles = Number(a.graph?.cycleEdges?.length || 0);
  out.innerHTML = `Open ${open}/${total} • Missing due: <b>${a.missingCount}</b> • Needs downstream push: <b>${a.pushCount}</b> • Overdue open: <b>${a.overdueOpen}</b>${cycles ? ` • <span class="badge badge--warn">Cycles: ${cycles}</span>` : ''}`;

  const topList = a.plan
    .filter(x => (x.missingDue || x.needsPush) && !x.task.done)
    .sort((u,v) => (Number(v.needsPush)-Number(u.needsPush)) || ((Array.isArray(v.task.blockedBy)?v.task.blockedBy.length:0) - (Array.isArray(u.task.blockedBy)?u.task.blockedBy.length:0)))
    .slice(0, 6);

  path.innerHTML = `
    <div><b>Critical path (heuristic):</b> ${a.chain.length ? a.chain.map(t => escapeHtml(t.title)).join(' → ') : '—'}</div>
    <div class="phase7-mini" style="margin-top:4px">Gap=${phase7State_.cfg.scheduleGapDays}d • Base=${phase7State_.cfg.scheduleBaseDays}d/task${phase7State_.cfg.scheduleSeverityWeight ? ' • severity weighted' : ''}</div>
    <div style="margin-top:6px"><b>Top scheduling fixes</b></div>
    <ul>${topList.length ? topList.map(x => `<li>${escapeHtml(x.task.title)} — ${x.needsPush ? `push to ≥ ${escapeHtml((typeof phase4FmtDate_==='function'?phase4FmtDate_(x.minAllowedDue):phase5FmtDateISO_(x.minAllowedDue)))}` : `suggest ${escapeHtml((typeof phase4FmtDate_==='function'?phase4FmtDate_(x.suggestedDue):phase5FmtDateISO_(x.suggestedDue)))}`}</li>`).join('') : '<li>No urgent scheduling fixes detected.</li>'}</ul>
  `;
}

function phase7ApplySuggestedDueDates_(){
  const ctx = phase7GetChecklistCtx_();
  const m = ctx && ctx.m;
  if(!m){ alert('Select a milestone first.'); return; }
  const a = phase7AnalyzeMilestoneSchedule_(m);
  let changed = 0;
  for(const x of a.plan){
    if(x.task.done) continue;
    if(!x.missingDue){ continue; }
    x.task.dueAt = Number(x.suggestedDue || 0) || x.task.dueAt;
    if(x.task.dueAt) changed++;
  }
  if(!changed){ alert('No missing due dates to suggest right now.'); return; }
  addActivity(`Scheduling assist: applied ${changed} due date suggestion(s)`);
  saveState();
  renderAll();
}

function phase7PushDownstreamDueDates_(){
  const ctx = phase7GetChecklistCtx_();
  const m = ctx && ctx.m;
  if(!m){ alert('Select a milestone first.'); return; }
  const a = phase7AnalyzeMilestoneSchedule_(m);
  let changed = 0;
  for(const x of a.plan){
    if(x.task.done) continue;
    if(!x.needsPush) continue;
    x.task.dueAt = Number(x.minAllowedDue || x.task.dueAt || 0) || x.task.dueAt;
    changed++;
  }
  if(!changed){ alert('No downstream due dates need pushing.'); return; }
  addActivity(`Scheduling assist: pushed ${changed} downstream due date(s)`);
  saveState();
  renderAll();
}

function phase7PostRenderDashboard_(){
  phase7EnsureCapacityPanel_();
  phase7RenderCapacityPanel_();
}

function phase7LoadCapacities_(){
  try{
    const raw = localStorage.getItem(PHASE7_CAPACITY_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === 'object') ? obj : {};
  }catch{ return {}; }
}

function phase7SaveCapacities_(obj){
  try{ localStorage.setItem(PHASE7_CAPACITY_KEY, JSON.stringify(obj || {})); }catch{}
}

function phase7CapacityKey_(name){
  return String(name || '').trim().toLowerCase();
}

function phase7GetAssigneeCapacity_(name){
  const caps = phase7LoadCapacities_();
  const key = phase7CapacityKey_(name);
  const n = Number(caps[key]);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function phase7SetAssigneeCapacity_(name, cap){
  const caps = phase7LoadCapacities_();
  const key = phase7CapacityKey_(name);
  if(!key) return;
  const n = Number(cap);
  if(Number.isFinite(n) && n > 0) caps[key] = Math.round(n);
  else delete caps[key];
  phase7SaveCapacities_(caps);
}

function phase7EnsureCapacityPanel_(){
  const host = document.querySelector('#phase6DashWorkload') || document.querySelector('#tab-dashboard .grid.grid--2');
  if(!host) return;
  if(document.querySelector('#phase7CapacityPanel')) return;
  const panel = document.createElement('div');
  panel.id = 'phase7CapacityPanel';
  panel.className = 'card phase6-dashPanel';
  panel.innerHTML = `
    <div class="card__top">
      <div>
        <div class="card__label">Assignee Capacity</div>
        <div class="card__hint">Set weekly capacity targets and watch overload risk based on upcoming/overdue work.</div>
      </div>
      <div class="phase7-toolbar">
        <button class="btn btn--ghost" type="button" id="phase7BtnCapRefresh">Refresh</button>
      </div>
    </div>
    <div class="phase7-hint" id="phase7CapSummary"></div>
    <div style="overflow:auto"><table class="phase7-capTable" id="phase7CapTable"></table></div>
  `;
  if(host.id === 'phase6DashWorkload') host.insertAdjacentElement('afterend', panel);
  else host.appendChild(panel);
  panel.querySelector('#phase7BtnCapRefresh')?.addEventListener('click', () => phase7RenderCapacityPanel_());
}

function phase7CollectCapacityRows_(){
  const scope = String(document.querySelector('#phase6WorkloadScope')?.value || 'project');
  const rows = (typeof phase6CollectTasksForWorkload_ === 'function') ? phase6CollectTasksForWorkload_(scope) : [];
  const map = new Map();
  for(const r of rows){
    const t = r.t;
    const name = String(t.assignee || '').trim() || 'Unassigned';
    if(!map.has(name)) map.set(name, { name, open:0, overdue:0, due7:0, blocked:0, blocker:0, high:0, done:0, score:0 });
    const a = map.get(name);
    if(t.done) a.done++; else a.open++;
    if(!t.done && typeof phase4IsOverdue_ === 'function' && phase4IsOverdue_(t)) a.overdue++;
    if(!t.done && typeof phase4IsDueInNextDays_ === 'function' && phase4IsDueInNextDays_(t, 7)) a.due7++;
    if(!t.done && typeof phase4GetUnresolvedBlockers_ === 'function'){
      try{ if(phase4GetUnresolvedBlockers_(r.ms, t).length) a.blocked++; }catch{}
    }
    if(t.severity === 'blocker') a.blocker++;
    if(t.severity === 'high') a.high++;
  }
  const list = Array.from(map.values());
  list.forEach(a => { a.score = a.overdue*3 + a.due7*2 + a.blocked + a.blocker; });
  list.sort((x,y) => (y.score-x.score) || (y.open-x.open) || x.name.localeCompare(y.name));
  return list;
}

function phase7RenderCapacityPanel_(){
  const table = document.querySelector('#phase7CapTable');
  const sum = document.querySelector('#phase7CapSummary');
  if(!table) return;
  const list = phase7CollectCapacityRows_();
  if(!list.length){
    if(sum) sum.textContent = 'No assignee tasks found in current scope.';
    table.innerHTML = '<tr><td class="hint">No tasks yet.</td></tr>';
    return;
  }
  let overCount = 0;
  table.innerHTML = `
    <thead><tr>
      <th>Assignee</th><th>Load Score</th><th>Due7</th><th>Overdue</th><th>Blocked</th><th>Capacity/wk</th><th>Status</th>
    </tr></thead>
    <tbody>
      ${list.map(a => {
        const cap = phase7GetAssigneeCapacity_(a.name);
        const over = cap > 0 ? (a.score > cap) : false;
        if(over) overCount++;
        return `
          <tr class="${over ? 'phase7-over' : 'phase7-ok'}" data-assignee="${escapeHtml(a.name)}">
            <td>${escapeHtml(a.name)}</td>
            <td><b>${a.score}</b> <span class="phase7-mini">(open ${a.open})</span></td>
            <td>${a.due7}</td>
            <td>${a.overdue ? `<span class="badge badge--warn">${a.overdue}</span>` : a.overdue}</td>
            <td>${a.blocked}</td>
            <td><input class="input phase7-capInput" type="number" min="0" step="1" value="${cap || ''}" data-cap="${escapeHtml(a.name)}" placeholder="none" /></td>
            <td>${cap > 0 ? (over ? `<span class="badge badge--warn">Over +${a.score-cap}</span>` : `<span class="badge">OK (${cap-a.score} spare)</span>`) : `<span class="phase7-mini">No cap</span>`}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;
  if(sum) sum.innerHTML = `Scope: <b>${escapeHtml(String(document.querySelector('#phase6WorkloadScope')?.value || 'project').toUpperCase())}</b> • Assignees: <b>${list.length}</b> • Over capacity: <b>${overCount}</b>`;
  Array.from(table.querySelectorAll('input[data-cap]')).forEach(inp => {
    inp.addEventListener('change', () => {
      const name = String(inp.getAttribute('data-cap') || '');
      phase7SetAssigneeCapacity_(name, Number(inp.value || 0));
      phase7RenderCapacityPanel_();
    });
  });
}

function phase7PostRenderProjects_(){
  phase7EnsureBlueprintsUi_();
  phase7RenderBlueprintsUi_();
  phase7EnsureSnapshotCompareUi_();
  phase7RenderSnapshotCompare_();
}

function phase7LoadBlueprints_(){
  try{
    const raw = localStorage.getItem(PHASE7_BLUEPRINT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(arr)) return [];
    return arr.filter(x => x && typeof x === 'object').map(phase7SanitizeBlueprint_);
  }catch{ return []; }
}

function phase7SaveBlueprints_(arr){
  try{ localStorage.setItem(PHASE7_BLUEPRINT_KEY, JSON.stringify((arr || []).map(phase7SanitizeBlueprint_).slice(0, 120))); }catch{}
}

function phase7SanitizeBlueprint_(b){
  const type = (b?.type === 'project' || b?.type === 'module' || b?.type === 'milestone') ? b.type : 'project';
  return {
    id: String(b?.id || uid()),
    type,
    name: String(b?.name || `${type} blueprint`).trim() || `${type} blueprint`,
    ts: Number(b?.ts || Date.now()),
    note: String(b?.note || ''),
    payload: b?.payload || null,
  };
}

function phase7BlueprintSections_(){
  return {
    project: phase7LoadBlueprints_().filter(x => x.type === 'project').sort((a,b) => b.ts - a.ts),
    module: phase7LoadBlueprints_().filter(x => x.type === 'module').sort((a,b) => b.ts - a.ts),
    milestone: phase7LoadBlueprints_().filter(x => x.type === 'milestone').sort((a,b) => b.ts - a.ts),
  };
}

function phase7EnsureBlueprintsUi_(){
  const formCard = document.querySelector('#tab-projects .grid.grid--2 > .card:nth-child(2)');
  if(!formCard || document.querySelector('#phase7BlueprintsBox')) return;
  const box = document.createElement('div');
  box.id = 'phase7BlueprintsBox';
  box.className = 'phase7-box';
  box.innerHTML = `
    <div class="phase7-title">Blueprint Templates</div>
    <div class="phase7-hint">Save reusable project/module/milestone structures and apply fresh copies with regenerated IDs.</div>
    <div class="phase7-bpGrid" style="margin-top:8px">
      <div class="phase7-bpSection">
        <div class="phase7-inline"><b>Project Blueprints</b><span class="phase7-tag">create full project structures</span></div>
        <div class="row row--actions" style="margin-top:6px">
          <button class="btn btn--ghost" type="button" id="phase7BtnSaveProjectBp">Save Active Project</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnApplyProjectBp">Create Project from Selected</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnDeleteProjectBp">Delete Selected</button>
        </div>
        <select class="select" id="phase7ProjectBpSelect" style="margin-top:6px"></select>
      </div>
      <div class="phase7-bpSection">
        <div class="phase7-inline"><b>Module Blueprints</b><span class="phase7-tag">apply into active project</span></div>
        <div class="row row--actions" style="margin-top:6px">
          <button class="btn btn--ghost" type="button" id="phase7BtnSaveModuleBp">Save Active Module</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnApplyModuleBp">Add Module from Selected</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnDeleteModuleBp">Delete Selected</button>
        </div>
        <select class="select" id="phase7ModuleBpSelect" style="margin-top:6px"></select>
      </div>
      <div class="phase7-bpSection">
        <div class="phase7-inline"><b>Milestone Blueprints</b><span class="phase7-tag">apply into active module</span></div>
        <div class="row row--actions" style="margin-top:6px">
          <button class="btn btn--ghost" type="button" id="phase7BtnSaveMilestoneBp">Save Active Milestone</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnApplyMilestoneBp">Add Milestone from Selected</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnDeleteMilestoneBp">Delete Selected</button>
        </div>
        <select class="select" id="phase7MilestoneBpSelect" style="margin-top:6px"></select>
      </div>
    </div>
  `;
  formCard.appendChild(box);

  box.querySelector('#phase7BtnSaveProjectBp')?.addEventListener('click', () => phase7SaveBlueprintFromActive_('project'));
  box.querySelector('#phase7BtnSaveModuleBp')?.addEventListener('click', () => phase7SaveBlueprintFromActive_('module'));
  box.querySelector('#phase7BtnSaveMilestoneBp')?.addEventListener('click', () => phase7SaveBlueprintFromActive_('milestone'));
  box.querySelector('#phase7BtnApplyProjectBp')?.addEventListener('click', () => phase7ApplySelectedBlueprint_('project'));
  box.querySelector('#phase7BtnApplyModuleBp')?.addEventListener('click', () => phase7ApplySelectedBlueprint_('module'));
  box.querySelector('#phase7BtnApplyMilestoneBp')?.addEventListener('click', () => phase7ApplySelectedBlueprint_('milestone'));
  box.querySelector('#phase7BtnDeleteProjectBp')?.addEventListener('click', () => phase7DeleteSelectedBlueprint_('project'));
  box.querySelector('#phase7BtnDeleteModuleBp')?.addEventListener('click', () => phase7DeleteSelectedBlueprint_('module'));
  box.querySelector('#phase7BtnDeleteMilestoneBp')?.addEventListener('click', () => phase7DeleteSelectedBlueprint_('milestone'));
}

function phase7RenderBlueprintsUi_(){
  const secs = phase7BlueprintSections_();
  phase7FillBlueprintSelect_('#phase7ProjectBpSelect', secs.project, '— Select project blueprint —');
  phase7FillBlueprintSelect_('#phase7ModuleBpSelect', secs.module, '— Select module blueprint —');
  phase7FillBlueprintSelect_('#phase7MilestoneBpSelect', secs.milestone, '— Select milestone blueprint —');
}

function phase7FillBlueprintSelect_(selQuery, arr, placeholder){
  const sel = document.querySelector(selQuery);
  if(!sel) return;
  const prev = sel.value;
  sel.innerHTML = `<option value="">${placeholder}</option>` + (arr || []).map(b => {
    let meta = '';
    try{
      if(b.type === 'project') meta = `${(b.payload?.modules||[]).length} module(s)`;
      if(b.type === 'module') meta = `${(b.payload?.milestones||[]).length} milestone(s)`;
      if(b.type === 'milestone') meta = `${(b.payload?.tasks||[]).length} task(s)`;
    }catch{}
    return `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}${meta ? ` • ${escapeHtml(meta)}` : ''}</option>`;
  }).join('');
  if((arr || []).some(b => b.id === prev)) sel.value = prev;
}

async function phase7SaveBlueprintFromActive_(type){
  let payload = null;
  let defaultName = '';
  if(type === 'project'){
    const p = getActiveProject(); if(!p){ alert('Select an active project first.'); return; }
    try{ if(typeof phase5ApplyProjectSettingsFromUi_ === 'function') phase5ApplyProjectSettingsFromUi_(p); }catch{}
    payload = JSON.parse(JSON.stringify(p));
    defaultName = `${p.name} Blueprint`;
  } else if(type === 'module'){
    const p = getActiveProject(); const mod = p ? getActiveModule(p) : null;
    if(!mod){ alert('Select an active module first.'); return; }
    payload = JSON.parse(JSON.stringify(mod));
    defaultName = `${mod.name} Blueprint`;
  } else {
    const p = getActiveProject(); const ms = p ? getActiveMilestone(p) : null;
    if(!ms){ alert('Select an active milestone first.'); return; }
    payload = JSON.parse(JSON.stringify(ms));
    defaultName = `${ms.title} Blueprint`;
  }
  const name = await pmPromptDialog_('Blueprint name?', defaultName, { title:'Save Blueprint', placeholder:'Blueprint name' });
  if(name === null) return;
  const trimmed = String(name || '').trim() || defaultName;
  const note = (await pmPromptDialog_('Optional note / usage hint?', '', { title:'Save Blueprint', placeholder:'Optional note (optional)' })) || '';
  const arr = phase7LoadBlueprints_();
  const existing = arr.find(x => x.type === type && x.name.toLowerCase() === trimmed.toLowerCase());
  const bp = phase7SanitizeBlueprint_({ id: existing?.id || uid(), type, name: trimmed, note, ts: Date.now(), payload });
  if(existing){
    const okReplace = await pmConfirmDialog_(`Replace existing ${type} blueprint "${trimmed}"?`, { title:'Replace Blueprint', okText:'Replace', danger:true });
    if(!okReplace) return;
    const idx = arr.findIndex(x => x.id === existing.id);
    if(idx >= 0) arr[idx] = bp;
  } else arr.unshift(bp);
  phase7SaveBlueprints_(arr);
  phase7RenderBlueprintsUi_();
  addActivity(`Saved ${type} blueprint: ${trimmed}`);
}

function phase7GetSelectedBlueprint_(type){
  const selMap = { project:'#phase7ProjectBpSelect', module:'#phase7ModuleBpSelect', milestone:'#phase7MilestoneBpSelect' };
  const id = String(document.querySelector(selMap[type])?.value || '');
  if(!id) return null;
  return phase7LoadBlueprints_().find(x => x.id === id && x.type === type) || null;
}

async function phase7DeleteSelectedBlueprint_(type){
  const bp = phase7GetSelectedBlueprint_(type);
  if(!bp){ alert('Select a blueprint first.'); return; }
  const okDelete = await pmConfirmDialog_(`Delete ${type} blueprint "${bp.name}"?`, { title:'Delete Blueprint', okText:'Delete', danger:true });
  if(!okDelete) return;
  phase7SaveBlueprints_(phase7LoadBlueprints_().filter(x => x.id !== bp.id));
  phase7RenderBlueprintsUi_();
  addActivity(`Deleted ${type} blueprint: ${bp.name}`);
}

function phase7CloneSteps_(steps, resetDone){
  return (Array.isArray(steps) ? steps : []).map(s => ({
    id: uid(),
    text: String(s?.text || ''),
    done: resetDone ? false : !!s?.done,
    children: phase7CloneSteps_(Array.isArray(s?.children) ? s.children : [], resetDone),
  }));
}

function phase7CloneTaskFresh_(t, opts){
  const resetDone = opts?.resetDone !== false;
  const src = (t && typeof t === 'object') ? t : {};
  const out = {
    id: uid(),
    title: String(src.title || 'Untitled Task'),
    done: resetDone ? false : !!src.done,
    severity: (src.severity === 'high' || src.severity === 'blocker') ? src.severity : 'normal',
    assignee: String(src.assignee || ''),
    createdAt: Date.now(),
    steps: phase7CloneSteps_(src.steps, resetDone),
  };

  // Preserve Phase 4 / 5 metadata (dependency + due + kanban + recurrence).
  out.blockedBy = Array.isArray(src.blockedBy) ? src.blockedBy.map(x => String(x || '')).filter(Boolean) : [];
  out.blockerNote = String(src.blockerNote || '');
  const dueN = Number(src.dueAt || 0);
  out.dueAt = Number.isFinite(dueN) && dueN > 0 ? dueN : null;

  const stage = String(src.kanbanStage || '');
  out.kanbanStage = resetDone ? 'todo' : (stage === 'doing' || stage === 'done' ? stage : 'todo');

  const recN = Number(src.recurrenceDays || 0);
  out.recurrenceDays = Number.isFinite(recN) && recN > 0 ? Math.max(1, Math.round(recN)) : 0;
  out.recurrenceTemplate = String(src.recurrenceTemplate || '');
  out.lastRecurringGeneratedAt = null;

  if(typeof phase4NormalizeTaskMeta_ === 'function'){
    try{ phase4NormalizeTaskMeta_(out); }catch{}
  }
  if(typeof phase5NormalizeTaskMeta_ === 'function'){
    try{ phase5NormalizeTaskMeta_(out); }catch{}
  }
  out.done = resetDone ? false : !!out.done;
  if(resetDone) out.phase7AutoRecurringGeneratedOnce = false;
  return out;
}

function phase7CloneMilestoneFresh_(ms, opts){
  const src = (ms && typeof ms === 'object') ? ms : {};
  const out = {
    id: uid(),
    title: String(src.title || 'Milestone'),
    notes: String(src.notes || ''),
    priority: (src.priority === 'p1' || src.priority === 'p3') ? src.priority : 'p2',
    state: (opts?.resetDone !== false) ? 'todo' : ((src.state === 'doing' || src.state === 'done') ? src.state : 'todo'),
    createdAt: Date.now(),
    tasks: [],
  };
  const rawTasks = Array.isArray(src.tasks) ? src.tasks : [];
  const taskIdMap = new Map();
  for(const t of rawTasks){
    const c = phase7CloneTaskFresh_(t, opts);
    out.tasks.push(c);
    taskIdMap.set(String(t?.id || ''), c.id);
  }
  // Remap blocker refs to cloned task ids inside same milestone.
  for(let i=0;i<out.tasks.length;i++){
    const srcTask = rawTasks[i];
    const cloneTask = out.tasks[i];
    const refs = Array.isArray(srcTask?.blockedBy) ? srcTask.blockedBy : [];
    const next = [];
    const seen = new Set();
    for(const oldId of refs){
      const mapped = taskIdMap.get(String(oldId || ''));
      if(!mapped || mapped === cloneTask.id || seen.has(mapped)) continue;
      seen.add(mapped);
      next.push(mapped);
    }
    cloneTask.blockedBy = next;
    if(typeof phase4NormalizeTaskMeta_ === 'function'){
      try{ phase4NormalizeTaskMeta_(cloneTask); }catch{}
    }
    if(typeof phase5NormalizeTaskMeta_ === 'function'){
      try{ phase5NormalizeTaskMeta_(cloneTask); }catch{}
    }
  }
  return out;
}

function phase7CloneModuleFresh_(mod, opts){
  const src = (mod && typeof mod === 'object') ? mod : {};
  return {
    id: uid(),
    name: String(src.name || 'Module'),
    desc: String(src.desc || ''),
    status: (opts?.resetDone !== false) ? 'todo' : String(src.status || 'todo'),
    tag: String(src.tag || ''),
    createdAt: Date.now(),
    milestones: (Array.isArray(src.milestones) ? src.milestones : []).map(ms => phase7CloneMilestoneFresh_(ms, opts)),
  };
}

function phase7CloneProjectFresh_(p, opts){
  const src = (p && typeof p === 'object') ? p : {};
  return {
    id: uid(),
    name: String(src.name || 'Project'),
    desc: String(src.desc || ''),
    status: (opts?.resetDone !== false) ? 'active' : String(src.status || 'active'),
    tag: String(src.tag || ''),
    archived: false,
    createdAt: Date.now(),
    settings: src.settings ? JSON.parse(JSON.stringify(src.settings)) : undefined,
    modules: (Array.isArray(src.modules) ? src.modules : []).map(mod => phase7CloneModuleFresh_(mod, opts)),
  };
}

async function phase7ApplySelectedBlueprint_(type){
  const bp = phase7GetSelectedBlueprint_(type);
  if(!bp){ alert('Select a blueprint first.'); return; }
  const resetDone = await pmConfirmDialog_('Apply as a fresh blueprint instance with progress reset?\n\nOK = reset done states (recommended)\nCancel = keep current task done states from blueprint', { title:'Apply Blueprint', okText:'Reset Progress' });
  const opts = { resetDone };

  if(type === 'project'){
    const p = phase7CloneProjectFresh_(bp.payload || {}, opts);
    const nextProjectName = await pmPromptDialog_('New project name?', p.name.replace(/\s*Blueprint$/i,''), { title:'Apply Project Blueprint', placeholder:'Project name' });
    p.name = nextProjectName || p.name;
    state.projects.unshift(p);
    setActiveProject(p.id);
    addActivity(`Applied project blueprint: ${bp.name}`);
    saveState();
    renderAll();
    return;
  }

  if(type === 'module'){
    const p = getActiveProject();
    if(!p){ alert('Select an active project first.'); return; }
    const mod = phase7CloneModuleFresh_(bp.payload || {}, opts);
    p.modules = Array.isArray(p.modules) ? p.modules : [];
    p.modules.push(mod);
    state.activeModuleId = mod.id;
    state.activeMilestoneId = mod.milestones?.[0]?.id || null;
    addActivity(`Applied module blueprint: ${bp.name}`);
    saveState();
    renderAll();
    return;
  }

  const p = getActiveProject();
  const mod = p ? getActiveModule(p) : null;
  if(!mod){ alert('Select an active module first.'); return; }
  const ms = phase7CloneMilestoneFresh_(bp.payload || {}, opts);
  mod.milestones = Array.isArray(mod.milestones) ? mod.milestones : [];
  mod.milestones.push(ms);
  state.activeMilestoneId = ms.id;
  addActivity(`Applied milestone blueprint: ${bp.name}`);
  saveState();
  renderAll();
}

function phase7EnsureSnapshotCompareUi_(){
  const snapBox = document.querySelector('#phase6ProjectSnapshots');
  if(!snapBox || document.querySelector('#phase7SnapshotCompareBox')) return;
  const box = document.createElement('div');
  box.id = 'phase7SnapshotCompareBox';
  box.className = 'phase7-box';
  box.innerHTML = `
    <div class="phase7-title">Snapshot Compare</div>
    <div class="phase7-toolbar">
      <button class="btn btn--ghost" type="button" id="phase7BtnCompareSnapActive">Compare Selected ↔ Active</button>
      <button class="btn btn--ghost" type="button" id="phase7BtnCompareSnapLatest2">Compare Latest 2</button>
      <button class="btn btn--ghost" type="button" id="phase7BtnCompareSnapRefresh">Refresh</button>
    </div>
    <div class="phase7-diff" id="phase7SnapshotCompareOut">Select a snapshot to compare.</div>
  `;
  snapBox.appendChild(box);
  box.querySelector('#phase7BtnCompareSnapActive')?.addEventListener('click', () => phase7RenderSnapshotCompare_('active'));
  box.querySelector('#phase7BtnCompareSnapLatest2')?.addEventListener('click', () => phase7RenderSnapshotCompare_('latest2'));
  box.querySelector('#phase7BtnCompareSnapRefresh')?.addEventListener('click', () => phase7RenderSnapshotCompare_());
}

function phase7FlattenProjectTaskMap_(p){
  const map = new Map();
  const byPath = new Map();
  for(const mod of (p?.modules || [])){
    for(const ms of (mod?.milestones || [])){
      for(const t of (ms?.tasks || [])){
        const rec = {
          id: String(t?.id || ''),
          title: String(t?.title || ''),
          path: `${String(mod?.name||'')}>${String(ms?.title||'')}>${String(t?.title||'')}`,
          done: !!t?.done,
          severity: String(t?.severity || 'normal'),
          assignee: String(t?.assignee || ''),
          dueAt: Number(t?.dueAt || 0),
          deps: Array.isArray(t?.blockedBy) ? t.blockedBy.length : 0,
          steps: countSteps_(Array.isArray(t?.steps) ? t.steps : []).total,
        };
        if(rec.id) map.set(rec.id, rec);
        byPath.set(rec.path, rec);
      }
    }
  }
  return { map, byPath };
}

function phase7CompareProjects_(left, right){
  const a = sanitizeProject(left || {});
  const b = sanitizeProject(right || {});
  const ca = (typeof phase6CountProjectTotals_ === 'function') ? phase6CountProjectTotals_(a) : { modules:(a.modules||[]).length, milestones:0, tasks:0, done:0 };
  const cb = (typeof phase6CountProjectTotals_ === 'function') ? phase6CountProjectTotals_(b) : { modules:(b.modules||[]).length, milestones:0, tasks:0, done:0 };

  const fa = phase7FlattenProjectTaskMap_(a);
  const fb = phase7FlattenProjectTaskMap_(b);
  const usedB = new Set();
  let added=0, removed=0, changed=0;
  const changes = [];

  for(const [id, ta] of fa.map.entries()){
    let tb = fb.map.get(id) || null;
    let matchedByPath = false;
    if(!tb){ tb = fb.byPath.get(ta.path) || null; matchedByPath = !!tb; }
    if(!tb){ removed++; if(changes.length < 8) changes.push(`Removed: ${ta.title} (${ta.path})`); continue; }
    if(tb.id) usedB.add(tb.id);
    const delta = [];
    if(ta.done !== tb.done) delta.push(`done ${ta.done?'✓':'○'}→${tb.done?'✓':'○'}`);
    if(ta.severity !== tb.severity) delta.push(`sev ${ta.severity}→${tb.severity}`);
    if((ta.assignee||'') !== (tb.assignee||'')) delta.push(`asg ${ta.assignee||'—'}→${tb.assignee||'—'}`);
    if((ta.dueAt||0) !== (tb.dueAt||0)) delta.push(`due ${(ta.dueAt?phase5FmtDateISO_(ta.dueAt):'—')}→${(tb.dueAt?phase5FmtDateISO_(tb.dueAt):'—')}`);
    if(ta.deps !== tb.deps) delta.push(`deps ${ta.deps}→${tb.deps}`);
    if(delta.length){ changed++; if(changes.length < 8) changes.push(`${matchedByPath ? '[title-match] ' : ''}${ta.title}: ${delta.join(', ')}`); }
  }
  for(const [id, tb] of fb.map.entries()){
    if(usedB.has(id)) continue;
    // if matched by path with missing id, treat as handled by content check
    if(fa.byPath.has(tb.path)) continue;
    added++; if(changes.length < 8) changes.push(`Added: ${tb.title} (${tb.path})`);
  }

  const settingsA = JSON.stringify((a.settings||{}));
  const settingsB = JSON.stringify((b.settings||{}));
  const projectFieldChanges = [];
  ['name','desc','status','tag'].forEach(k => { if(String(a[k]||'') !== String(b[k]||'')) projectFieldChanges.push(`${k}: ${String(a[k]||'—')} → ${String(b[k]||'—')}`); });
  if(settingsA !== settingsB) projectFieldChanges.push('settings changed');

  return {
    left: a, right: b,
    counts: { left:ca, right:cb },
    deltaCounts: {
      modules: (cb.modules||0) - (ca.modules||0),
      milestones: (cb.milestones||0) - (ca.milestones||0),
      tasks: (cb.tasks||0) - (ca.tasks||0),
      done: (cb.done||0) - (ca.done||0),
    },
    taskDiff: { added, removed, changed },
    projectFieldChanges,
    sampleChanges: changes,
  };
}

function phase7RenderSnapshotCompare_(mode){
  const out = document.querySelector('#phase7SnapshotCompareOut');
  if(!out) return;
  const p = getActiveProject();
  if(!p){ out.textContent = 'Select an active project first.'; return; }
  const snaps = (typeof phase6LoadSnapshotsForProject_ === 'function') ? phase6LoadSnapshotsForProject_(p.id) : [];
  if(!snaps.length){ out.textContent = 'No snapshots available for this project.'; return; }

  let left = null, right = null, label = '';
  if(mode === 'latest2'){
    if(snaps.length < 2){ out.textContent = 'Need at least 2 snapshots to compare latest 2.'; return; }
    left = snaps[1]?.project; right = snaps[0]?.project;
    label = `Latest 2 snapshots: ${snaps[1]?.name || 'older'} → ${snaps[0]?.name || 'latest'}`;
  } else {
    const sel = (typeof phase6GetSelectedSnapshot_ === 'function') ? phase6GetSelectedSnapshot_() : snaps[0];
    if(!sel){ out.textContent = 'Select a snapshot first.'; return; }
    left = sel.project; right = p;
    label = `Selected snapshot ↔ Active project (${sel.name})`;
  }

  try{
    const d = phase7CompareProjects_(left, right);
    out.innerHTML = `
      <div><b>${escapeHtml(label)}</b></div>
      <div style="margin-top:6px">
        Counts: modules <b>${d.counts.left.modules}</b>→<b>${d.counts.right.modules}</b> (${d.deltaCounts.modules>=0?'+':''}${d.deltaCounts.modules}),
        milestones <b>${d.counts.left.milestones}</b>→<b>${d.counts.right.milestones}</b> (${d.deltaCounts.milestones>=0?'+':''}${d.deltaCounts.milestones}),
        tasks <b>${d.counts.left.tasks}</b>→<b>${d.counts.right.tasks}</b> (${d.deltaCounts.tasks>=0?'+':''}${d.deltaCounts.tasks}),
        done <b>${d.counts.left.done}</b>→<b>${d.counts.right.done}</b> (${d.deltaCounts.done>=0?'+':''}${d.deltaCounts.done})
      </div>
      <div style="margin-top:6px">Task diff: <b>${d.taskDiff.added}</b> added • <b>${d.taskDiff.removed}</b> removed • <b>${d.taskDiff.changed}</b> changed</div>
      <div style="margin-top:6px">Project fields: ${d.projectFieldChanges.length ? d.projectFieldChanges.map(x => `<span class="badge">${escapeHtml(x)}</span>`).join(' ') : '<span class="phase7-mini">No top-level project field changes.</span>'}</div>
      <div style="margin-top:6px"><b>Sample changes</b></div>
      <ul>${d.sampleChanges.length ? d.sampleChanges.map(x => `<li>${escapeHtml(x)}</li>`).join('') : '<li>No sampled changes detected.</li>'}</ul>
    `;
  }catch(err){
    out.textContent = 'Compare failed (snapshot may be incompatible/corrupted).';
    console.warn('Phase7 snapshot compare failed', err);
  }
}

function phase7CollectAllPhase6Snapshots_(){
  const out = {};
  for(const p of (state.projects || [])){
    if(!p || !p.id) continue;
    try{ out[p.id] = (typeof phase6LoadSnapshotsForProject_ === 'function') ? phase6LoadSnapshotsForProject_(p.id) : []; }catch{}
  }
  return out;
}

function phase7ExportV2Bundle_(){
  try{ flushPendingSave_ && flushPendingSave_(true); }catch{}
  try{
    // capture current project settings form edits if open
    const p = getActiveProject();
    if(p && typeof phase5ApplyProjectSettingsFromUi_ === 'function') phase5ApplyProjectSettingsFromUi_(p);
  }catch{}
  const bundle = {
    type: 'stark_pm_bundle_v2',
    version: 2,
    exportedAt: Date.now(),
    appPhase: 7,
    state: state,
    local: {
      phase5RecurringTemplates: (typeof phase5GetTemplates_ === 'function') ? phase5GetTemplates_() : [],
      phase6SnapshotsByProject: phase7CollectAllPhase6Snapshots_(),
      phase7Blueprints: phase7LoadBlueprints_(),
      phase7Capacities: phase7LoadCapacities_(),
      phase7Config: phase7State_.cfg || {},
    }
  };
  const payload = JSON.stringify(bundle, null, 2);
  const filename = buildStampedFilename_('stark_pm_bundle_v2', '.json');
  cacheLastExport_(filename, payload, 'application/json', 'json');
  downloadText(filename, payload, 'application/json');
  addActivity('Exported V2 bundle: ' + filename);
  try{ saveState({ immediate:true }); }catch{}
}

async function phase7ImportV2BundleFromText_(text, filename){
  let bundle = null;
  try{ bundle = JSON.parse(String(text || '')); }catch{ alert('Invalid JSON file.'); return; }
  if(!bundle || typeof bundle !== 'object' || bundle.type !== 'stark_pm_bundle_v2'){
    alert('This file is not a valid Stark PM V2 bundle.');
    return;
  }
  const ok = await pmConfirmDialog_(`Import V2 bundle${filename ? ` (${filename})` : ''}?\n\nThis will replace your current local PM state and restore included local templates/snapshots/capacity settings.`, { title:'Import V2 Bundle', okText:'Import', danger:true });
  if(!ok) return;

  let nextState = null;
  try{
    nextState = sanitizeState(migrateState_(bundle.state || {}));
  }catch(err){
    console.warn('Phase7 bundle state sanitize failed', err);
    alert('Bundle state is invalid or incompatible.');
    return;
  }

  try{
    // restore local phase data first (best effort)
    if(bundle.local){
      try{ if(Array.isArray(bundle.local.phase5RecurringTemplates) && typeof phase5SaveTemplates_ === 'function') phase5SaveTemplates_(bundle.local.phase5RecurringTemplates); }catch{}
      try{ if(Array.isArray(bundle.local.phase7Blueprints)) phase7SaveBlueprints_(bundle.local.phase7Blueprints); }catch{}
      try{ if(bundle.local.phase7Capacities && typeof bundle.local.phase7Capacities === 'object') phase7SaveCapacities_(bundle.local.phase7Capacities); }catch{}
      try{ if(bundle.local.phase7Config && typeof bundle.local.phase7Config === 'object'){ Object.assign(phase7State_.cfg, bundle.local.phase7Config); phase7SaveCfg_(); } }catch{}
    }

    state = nextState;
    reconcileActiveSelection_();

    // restore snapshots after state ids are loaded
    try{
      const snapMap = bundle.local?.phase6SnapshotsByProject;
      if(snapMap && typeof snapMap === 'object' && typeof phase6SaveSnapshotsForProject_ === 'function'){
        for(const p of (state.projects || [])){
          phase6SaveSnapshotsForProject_(p.id, Array.isArray(snapMap[p.id]) ? snapMap[p.id] : []);
        }
      }
    }catch(err){ console.warn('Phase7 snapshot restore failed', err); }

    addActivity('Imported V2 bundle' + (filename ? `: ${filename}` : ''));
    saveState();
    renderAll();
  }catch(err){
    console.warn('Phase7 bundle import failed', err);
    alert('Import failed. Your current state may be unchanged.');
  }
}

// boot phase 7 after phase 6 patch is loaded
try{ initPhase7_(); }catch(err){ console.warn('Phase7 init failed', err); }

