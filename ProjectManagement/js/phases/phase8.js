/* ---------------------------
   Phase 8 Upgrade (Additive Patch)
   - Saved views quick presets hub (dashboard)
   - Notifications Center + dismiss/read state
   - Dependency matrix + batch editor (checklist)
   - Gantt-lite timeline (checklist)
   - Project health scoring panel (dashboard)
   - Import V2 dry-run diff preview guard (Phase 7 wrapper)
   - Activity/Audit filter panel (dashboard)
---------------------------- */
var PHASE8_VIEWS_KEY = 'stark_pm_phase8_pinned_views_v1';
var PHASE8_NOTIFY_KEY = 'stark_pm_phase8_notify_state_v1';
var phase8State_ = {
  inited: false,
  patched: false,
  pinnedViews: null,
  notify: null,
  depFilter: 'all',
  auditQuery: '',
};

function initPhase8_(){
  if(phase8State_.inited) return;
  phase8State_.inited = true;
  phase8EnsureStyles_();
  phase8PatchFunctions_();
  phase8EnsureTopbarButtons_();
  try{ phase8PostRenderDashboard_(); }catch{}
  try{ phase8PostRenderChecklist_(); }catch{}
}

function phase8EnsureStyles_(){
  if(document.querySelector('#phase8Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase8Styles';
  st.textContent = `
    .phase8-box{margin-top:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:10px}
    .phase8-title{font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.86;margin-bottom:8px}
    .phase8-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .phase8-grid--3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .phase8-card{border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.015);padding:10px}
    .phase8-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .phase8-toolbar .btn{padding:6px 10px}
    .phase8-list{display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto}
    .phase8-item{border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:8px;background:rgba(255,255,255,.01)}
    .phase8-item__top{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .phase8-item__title{font-size:13px;line-height:1.25}
    .phase8-item__meta{font-size:11px;opacity:.72;margin-top:4px}
    .phase8-sev{display:inline-flex;align-items:center;padding:2px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.12);font-size:10px}
    .phase8-sev.is-high{border-color:rgba(255,174,102,.28);color:#ffd29a}
    .phase8-sev.is-urgent{border-color:rgba(255,110,110,.35);color:#ffbbbb}
    .phase8-health{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase8-health__name{font-size:13px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .phase8-health__score{font-weight:700;font-size:12px}
    .phase8-health__badge{font-size:10px;padding:3px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.12)}
    .phase8-health__badge.ok{border-color:rgba(146,255,176,.25);color:#b8ffd0}
    .phase8-health__badge.warn{border-color:rgba(255,210,120,.28);color:#ffdba3}
    .phase8-health__badge.risk{border-color:rgba(255,110,110,.35);color:#ffc0c0}
    .phase8-pills{display:flex;gap:6px;flex-wrap:wrap}
    .phase8-pill{font-size:11px;padding:4px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.12);cursor:pointer;background:rgba(255,255,255,.02)}
    .phase8-pill:hover{border-color:rgba(0,255,255,.25)}
    .phase8-pill.is-active{border-color:rgba(0,255,255,.32);box-shadow:0 0 0 1px rgba(0,255,255,.08) inset}
    .phase8-empty{font-size:12px;opacity:.72;padding:8px}
    .phase8-tableWrap{max-height:280px;overflow:auto;border:1px solid rgba(255,255,255,.06);border-radius:10px}
    .phase8-table{width:100%;border-collapse:collapse;font-size:12px}
    .phase8-table th,.phase8-table td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top}
    .phase8-table th{text-align:left;font-size:11px;opacity:.75;position:sticky;top:0;background:rgba(12,15,22,.95)}
    .phase8-table tr:hover td{background:rgba(255,255,255,.015)}
    .phase8-kbd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;opacity:.85}
    .phase8-gantt{display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto}
    .phase8-ganttRow{display:grid;grid-template-columns:200px minmax(220px,1fr) auto;gap:8px;align-items:center}
    .phase8-ganttLabel{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .phase8-ganttTrack{position:relative;height:18px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(90deg, rgba(255,255,255,.02), rgba(255,255,255,.01));overflow:hidden}
    .phase8-ganttBar{position:absolute;top:2px;height:12px;border-radius:999px;border:1px solid rgba(0,255,255,.16);background:rgba(0,255,255,.14)}
    .phase8-ganttBar.is-overdue{border-color:rgba(255,110,110,.28);background:rgba(255,80,80,.13)}
    .phase8-ganttBar.is-done{border-color:rgba(146,255,176,.22);background:rgba(120,255,170,.12)}
    .phase8-ganttDate{font-size:11px;opacity:.78;white-space:nowrap}
    .phase8-auditList{max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:6px}
    .phase8-auditRow{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase8-auditRow__msg{font-size:12px;line-height:1.3}
    .phase8-auditRow__meta{font-size:11px;opacity:.72;margin-top:4px}
    @media (max-width: 980px){ .phase8-grid,.phase8-grid--3{grid-template-columns:1fr} .phase8-ganttRow{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase8PatchFunctions_(){
  if(phase8State_.patched) return;
  phase8State_.patched = true;

  if(typeof renderDashboard === 'function' && !renderDashboard._phase8Wrapped){
    const base = renderDashboard;
    renderDashboard = function(){
      base();
      try{ phase8PostRenderDashboard_(); }catch(err){ console.warn('Phase8 dashboard render failed', err); }
    };
    renderDashboard._phase8Wrapped = true;
  }

  if(typeof renderChecklist === 'function' && !renderChecklist._phase8Wrapped){
    const base = renderChecklist;
    renderChecklist = function(){
      base();
      try{ phase8PostRenderChecklist_(); }catch(err){ console.warn('Phase8 checklist render failed', err); }
    };
    renderChecklist._phase8Wrapped = true;
  }

  if(typeof phase7ImportV2BundleFromText_ === 'function' && !phase7ImportV2BundleFromText_._phase8Wrapped){
    const baseImport = phase7ImportV2BundleFromText_;
    phase7ImportV2BundleFromText_ = async function(text, filename){
      let bundle = null;
      try{ bundle = JSON.parse(String(text || '')); }catch{ alert('Invalid JSON file.'); return; }
      if(!bundle || bundle.type !== 'stark_pm_bundle_v2'){
        return baseImport(text, filename);
      }
      const preview = phase8BuildBundleDiffPreview_(bundle);
      const ok = await pmConfirmDialog_(`Phase 8 Import Dry-Run Preview${filename ? ` (${filename})` : ''}\n\n${preview}\n\nProceed to import?`, { title:'Import Dry-Run Preview', okText:'Proceed Import' });
      if(!ok) return;
      return baseImport(text, filename);
    };
    phase7ImportV2BundleFromText_._phase8Wrapped = true;
  }

  if(typeof phase3BuildCmdkItems_ === 'function' && !phase3BuildCmdkItems_._phase8Wrapped){
    const baseBuild = phase3BuildCmdkItems_;
    phase3BuildCmdkItems_ = function(q){
      const items = baseBuild(q) || [];
      const query = String(q || '').trim().toLowerCase();
      const cmds = [
        { kind:'command', title:'Phase 8: Notifications Center', sub:'Open dashboard notifications panel', tag:'PH8', act:'phase8Notify' },
        { kind:'command', title:'Phase 8: Dependency Matrix', sub:'Open checklist dependency table', tag:'PH8', act:'phase8Deps' },
        { kind:'command', title:'Phase 8: Gantt Lite', sub:'Open checklist gantt timeline', tag:'PH8', act:'phase8Gantt' },
      ];
      for(const c of cmds){
        const hay = `${c.title} ${c.sub} ${c.tag}`.toLowerCase();
        if(!query || hay.includes(query)) items.push(c);
      }
      return items;
    };
    phase3BuildCmdkItems_._phase8Wrapped = true;
  }

  if(typeof phase3RunCmdkAction_ === 'function' && !phase3RunCmdkAction_._phase8Wrapped){
    const baseRun = phase3RunCmdkAction_;
    phase3RunCmdkAction_ = function(it){
      if(it && it.act === 'phase8Notify'){ switchTab('dashboard'); setTimeout(()=>document.querySelector('#phase8NotificationsPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); return; }
      if(it && it.act === 'phase8Deps'){ switchTab('checklist'); setTimeout(()=>document.querySelector('#phase8DepsPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); return; }
      if(it && it.act === 'phase8Gantt'){ switchTab('checklist'); setTimeout(()=>document.querySelector('#phase8GanttPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); return; }
      return baseRun(it);
    };
    phase3RunCmdkAction_._phase8Wrapped = true;
  }
}

function phase8EnsureTopbarButtons_(){
  const topbar = document.querySelector('.topbar__right');
  if(!topbar) return;
  if(!document.querySelector('#phase8BtnNotifications')){
    const btn = document.createElement('button');
    btn.id = 'phase8BtnNotifications';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Notifications';
    btn.addEventListener('click', () => { openPanelInOwningTab_('#phase8NotificationsPanel', 'dashboard', 10); });
    const anchor = document.querySelector('#phase7BtnImportV2') || document.querySelector('#btnExportJson');
    topbar.insertBefore(btn, anchor || null);
  }
}

function phase8LoadPinnedViews_(){
  if(Array.isArray(phase8State_.pinnedViews)) return phase8State_.pinnedViews;
  try{
    const raw = localStorage.getItem(PHASE8_VIEWS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    phase8State_.pinnedViews = Array.isArray(arr) ? arr : [];
  }catch{ phase8State_.pinnedViews = []; }
  return phase8State_.pinnedViews;
}
function phase8SavePinnedViews_(){ try{ localStorage.setItem(PHASE8_VIEWS_KEY, JSON.stringify(phase8LoadPinnedViews_())); }catch{} }
function phase8LoadNotifyState_(){
  if(phase8State_.notify && typeof phase8State_.notify === 'object') return phase8State_.notify;
  try{
    const raw = localStorage.getItem(PHASE8_NOTIFY_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    phase8State_.notify = { dismissed: Array.isArray(obj.dismissed)?obj.dismissed:[] };
  }catch{ phase8State_.notify = { dismissed: [] }; }
  return phase8State_.notify;
}
function phase8SaveNotifyState_(){ try{ localStorage.setItem(PHASE8_NOTIFY_KEY, JSON.stringify(phase8LoadNotifyState_())); }catch{} }

function phase8BuildBundleDiffPreview_(bundle){
  const nextCounts = phase8CountState_(bundle.state || {});
  const curCounts = phase8CountState_(state || {});
  const local = bundle.local || {};
  const nTpl = Array.isArray(local.phase5RecurringTemplates) ? local.phase5RecurringTemplates.length : 0;
  const nBp = Array.isArray(local.phase7Blueprints) ? local.phase7Blueprints.length : 0;
  const nCap = local.phase7Capacities && typeof local.phase7Capacities === 'object' ? Object.keys(local.phase7Capacities).length : 0;
  let nSnapProjects = 0;
  try{ if(local.phase6SnapshotsByProject && typeof local.phase6SnapshotsByProject === 'object') nSnapProjects = Object.keys(local.phase6SnapshotsByProject).length; }catch{}
  return [
    `Current → Bundle counts`,
    `Projects: ${curCounts.projects} → ${nextCounts.projects} (${phase8FmtDelta_(nextCounts.projects-curCounts.projects)})`,
    `Milestones: ${curCounts.milestones} → ${nextCounts.milestones} (${phase8FmtDelta_(nextCounts.milestones-curCounts.milestones)})`,
    `Tasks: ${curCounts.tasks} → ${nextCounts.tasks} (${phase8FmtDelta_(nextCounts.tasks-curCounts.tasks)})`,
    `Done tasks: ${curCounts.done} → ${nextCounts.done} (${phase8FmtDelta_(nextCounts.done-curCounts.done)})`,
    ``,
    `Bundle local assets:`,
    `Recurring templates: ${nTpl}`,
    `Blueprints: ${nBp}`,
    `Capacity profiles: ${nCap}`,
    `Snapshot project buckets: ${nSnapProjects}`,
  ].join('\n');
}
function phase8FmtDelta_(n){ return `${n>0?'+':''}${n}`; }
function phase8CountState_(s){
  const x = { projects:0, milestones:0, tasks:0, done:0 };
  if(!s || !Array.isArray(s.projects)) return x;
  x.projects = s.projects.length;
  for(const p of s.projects){
    for(const mod of (p?.modules || [])){
      for(const ms of (mod?.milestones || [])){
        x.milestones++;
        for(const t of (ms?.tasks || [])){
          x.tasks++;
          if(t?.done) x.done++;
        }
      }
    }
  }
  return x;
}

function phase8AllTaskEntries_(opts){
  opts = opts || {};
  const entries = [];
  const onlyActiveProject = !!opts.onlyActiveProject;
  const activeP = onlyActiveProject ? getActiveProject() : null;
  const projects = onlyActiveProject ? (activeP ? [activeP] : []) : (state.projects || []);
  for(const p of projects){
    for(const mod of (p?.modules || [])){
      for(const ms of (mod?.milestones || [])){
        for(const t of (ms?.tasks || [])){
          entries.push({ p, mod, ms, t });
        }
      }
    }
  }
  return entries;
}

function phase8PostRenderDashboard_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return;
  let host = document.querySelector('#phase8DashboardHost');
  if(!host){
    host = document.createElement('div');
    host.id = 'phase8DashboardHost';
    host.className = 'phase8-box';
    host.innerHTML = `
      <div class="phase8-title">Phase 8 Operations Center</div>
      <div class="phase8-grid" id="phase8DashGridA">
        <div class="phase8-card" id="phase8SavedViewsPanel"></div>
        <div class="phase8-card" id="phase8NotificationsPanel"></div>
      </div>
      <div class="phase8-grid" id="phase8DashGridB" style="margin-top:10px">
        <div class="phase8-card" id="phase8HealthPanel"></div>
        <div class="phase8-card" id="phase8AuditPanel"></div>
      </div>
    `;
    tab.appendChild(host);
  }
  phase8RenderSavedViewsPanel_();
  phase8RenderNotificationsPanel_();
  phase8RenderHealthPanel_();
  phase8RenderAuditPanel_();
}

function phase8RenderSavedViewsPanel_(){
  const box = document.querySelector('#phase8SavedViewsPanel');
  if(!box) return;
  const presets = [
    { key:'__preset_today', label:'Due Today' },
    { key:'__preset_overdue', label:'Overdue' },
    { key:'__preset_blocked', label:'Blocked' },
    { key:'__preset_week', label:'This Week' },
    { key:'__preset_high_open', label:'High Priority' },
  ];
  const pinned = phase8LoadPinnedViews_();
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Saved Views Hub</div><div class="phase8-item__meta">Quick jump to checklist filters</div></div>
    <div class="phase8-item__meta">Presets</div>
    <div class="phase8-pills" id="phase8PresetPills"></div>
    <div class="phase8-item__meta" style="margin-top:8px">Pinned views</div>
    <div class="phase8-pills" id="phase8PinnedPills"></div>
    <div class="phase8-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" id="phase8BtnPinCurrentView" type="button">Pin Current View</button>
      <button class="btn btn--ghost" id="phase8BtnManagePins" type="button">Remove Pin</button>
    </div>
  `;
  const presetHost = box.querySelector('#phase8PresetPills');
  presets.forEach(v => {
    const b = document.createElement('button');
    b.className = 'phase8-pill'; b.type='button'; b.textContent = v.label;
    b.addEventListener('click', () => phase8ApplyChecklistViewKey_(v.key));
    presetHost.appendChild(b);
  });
  const pinHost = box.querySelector('#phase8PinnedPills');
  if(!pinned.length){
    pinHost.innerHTML = `<div class="phase8-empty">No pinned views yet. Save/pin your most-used checklist filters.</div>`;
  } else {
    pinned.forEach(v => {
      const b = document.createElement('button');
      b.className = 'phase8-pill'; b.type='button'; b.textContent = v.name;
      b.title = v.key;
      b.addEventListener('click', () => phase8ApplyChecklistViewKey_(v.key));
      pinHost.appendChild(b);
    });
  }
  box.querySelector('#phase8BtnPinCurrentView')?.addEventListener('click', phase8PinCurrentChecklistView_);
  box.querySelector('#phase8BtnManagePins')?.addEventListener('click', phase8PromptRemovePinnedView_);
}

function phase8ApplyChecklistViewKey_(key){
  switchTab('checklist');
  setTimeout(() => {
    const sel = document.querySelector('#phase4ViewPreset');
    if(typeof phase4PresetViews_ === 'function' && typeof phase4ApplySelectedView_ === 'function' && sel){
      sel.value = String(key||'');
      phase4ApplySelectedView_();
    }
  }, 10);
}

async function phase8PinCurrentChecklistView_(){
  if(typeof phase4GetCurrentViewState_ !== 'function'){
    alert('Checklist view saving is not available yet.');
    return;
  }
  const name = await pmPromptDialog_('Pin current checklist view as:', 'Pinned View', { title:'Pin Checklist View', placeholder:'Pinned view name' });
  if(name == null) return;
  const n = String(name).trim();
  if(!n) return;
  let key = '';
  if(typeof phase4State_ === 'object' && typeof phase4GetCurrentViewState_ === 'function'){
    phase4State_.savedViews = phase4State_.savedViews || {};
    phase4State_.savedViews[n] = phase4GetCurrentViewState_();
    try{ phase4PersistViews_(); }catch{}
    try{ phase4RefreshSavedViewSelect_(); }catch{}
    key = n;
  } else {
    key = 'all';
  }
  const arr = phase8LoadPinnedViews_();
  const idx = arr.findIndex(x => x && x.name === n);
  const item = { name:n, key };
  if(idx >= 0) arr[idx] = item; else arr.push(item);
  phase8SavePinnedViews_();
  addActivity(`Pinned view: ${n}`);
  phase8RenderSavedViewsPanel_();
}

async function phase8PromptRemovePinnedView_(){
  const arr = phase8LoadPinnedViews_();
  if(!arr.length){ alert('No pinned views to remove.'); return; }
  const menu = arr.map((x,i)=>`${i+1}. ${x.name}`).join('\n');
  const ans = await pmPromptDialog_(`Remove which pinned view?\n\n${menu}`, '1', { title:'Remove Pinned View', placeholder:'Enter number' });
  if(ans == null) return;
  const idx = Number(ans)-1;
  if(!Number.isInteger(idx) || idx < 0 || idx >= arr.length){ alert('Invalid selection.'); return; }
  const [removed] = arr.splice(idx,1);
  phase8SavePinnedViews_();
  addActivity(`Removed pinned view: ${removed?.name || 'unknown'}`);
  phase8RenderSavedViewsPanel_();
}

function phase8GenerateNotifications_(){
  const out = [];
  const now = Date.now();
  const dueSoonEnd = now + 7*86400000;
  const entries = phase8AllTaskEntries_();
  const byAssigneeLoad = {};
  for(const e of entries){
    const t = e.t;
    const assignee = String(t.assignee || 'Unassigned').trim() || 'Unassigned';
    byAssigneeLoad[assignee] = byAssigneeLoad[assignee] || { score:0, open:0 };
    if(!t.done){
      byAssigneeLoad[assignee].open++;
      if(t.severity === 'blocker') byAssigneeLoad[assignee].score += 4;
      else if(t.severity === 'high') byAssigneeLoad[assignee].score += 2;
      else byAssigneeLoad[assignee].score += 1;
    }
    const due = Number(t?.dueAt || 0);
    let unresolved = [];
    try{ unresolved = (typeof phase4GetUnresolvedBlockers_ === 'function') ? phase4GetUnresolvedBlockers_(e.ms, t) : []; }catch{ unresolved = []; }
    if(!t.done && due && due < (new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())).getTime()){
      out.push({ id:`ov:${e.p.id}:${e.ms.id}:${t.id}`, type:'overdue', level:'urgent', title:`Overdue: ${t.title}`, meta:`${e.p.name} • ${e.ms.title}${assignee ? ' • ' + assignee : ''}`, action:()=>phase8FocusTask_(e) });
    } else if(!t.done && due && due >= now && due <= dueSoonEnd){
      out.push({ id:`soon:${e.p.id}:${e.ms.id}:${t.id}`, type:'dueSoon', level:'high', title:`Due soon: ${t.title}`, meta:`${e.p.name} • ${e.ms.title} • ${new Date(due).toLocaleDateString()}`, action:()=>phase8FocusTask_(e) });
    }
    if(!t.done && unresolved.length){
      out.push({ id:`blk:${e.p.id}:${e.ms.id}:${t.id}`, type:'blocked', level:'high', title:`Blocked: ${t.title}`, meta:`Waiting on ${unresolved.length} task(s) • ${e.p.name} • ${e.ms.title}`, action:()=>phase8FocusTask_(e) });
    }
  }

  // Capacity overload notifications (Phase 7 integration)
  try{
    if(typeof phase7LoadCapacities_ === 'function'){
      const caps = phase7LoadCapacities_() || {};
      for(const [name,v] of Object.entries(byAssigneeLoad)){
        const cap = Number(caps[name]);
        if(Number.isFinite(cap) && cap > 0 && v.score > cap){
          out.push({ id:`cap:${name}`, type:'capacity', level:'urgent', title:`Capacity overload: ${name}`, meta:`Load score ${v.score} > weekly capacity ${cap}`, action:()=>{ switchTab('dashboard'); setTimeout(()=>document.querySelector('#phase7CapacityPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); } });
        }
      }
    }
  }catch{}

  // Snapshot reminder if no snapshot exists for active project
  try{
    const p = getActiveProject();
    if(p && typeof phase6LoadSnapshotsForProject_ === 'function'){
      const snaps = phase6LoadSnapshotsForProject_(p.id) || [];
      if(!snaps.length){
        out.push({ id:`snap:${p.id}`, type:'snapshot', level:'normal', title:`No snapshots yet for active project`, meta:`Create a restore point for ${p.name}`, action:()=>{ switchTab('projects'); setTimeout(()=>document.querySelector('#phase6SnapshotsBox, #phase8SnapshotButton')?.scrollIntoView({behavior:'smooth', block:'start'}),10);} });
      }
    }
  }catch{}

  // Dedup + sort
  const seen = new Set();
  const rank = { urgent:3, high:2, normal:1 };
  return out.filter(n => !seen.has(n.id) && seen.add(n.id)).sort((a,b) => (rank[b.level]-rank[a.level]) || String(a.title).localeCompare(String(b.title))).slice(0, 80);
}

function phase8RenderNotificationsPanel_(){
  const box = document.querySelector('#phase8NotificationsPanel');
  if(!box) return;
  const notifyState = phase8LoadNotifyState_();
  const all = phase8GenerateNotifications_();
  const visible = all.filter(n => !(notifyState.dismissed || []).includes(n.id));
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Notifications Center</div><div class="phase8-item__meta">${visible.length} active</div></div>
    <div class="phase8-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" id="phase8BtnRefreshNotif" type="button">Refresh</button>
      <button class="btn btn--ghost" id="phase8BtnClearNotifDismissed" type="button">Reset Dismissed</button>
      <button class="btn btn--ghost" id="phase8BtnDismissAllVisible" type="button">Dismiss All Visible</button>
    </div>
    <div class="phase8-list" id="phase8NotifList" style="margin-top:8px"></div>
  `;
  const list = box.querySelector('#phase8NotifList');
  if(!visible.length){
    list.innerHTML = `<div class="phase8-empty">No active notifications right now.</div>`;
  } else {
    visible.slice(0,30).forEach(n => {
      const row = document.createElement('div');
      row.className = 'phase8-item';
      const sevCls = n.level === 'urgent' ? 'is-urgent' : (n.level === 'high' ? 'is-high' : '');
      row.innerHTML = `
        <div class="phase8-item__top">
          <div class="phase8-item__title">${escapeHtml(n.title)}</div>
          <span class="phase8-sev ${sevCls}">${escapeHtml(String(n.level).toUpperCase())}</span>
        </div>
        <div class="phase8-item__meta">${escapeHtml(n.meta || '')}</div>
        <div class="phase8-toolbar" style="margin-top:6px">
          <button class="btn btn--ghost" type="button" data-act="open">Open</button>
          <button class="btn btn--ghost" type="button" data-act="dismiss">Dismiss</button>
        </div>
      `;
      row.querySelector('[data-act="open"]')?.addEventListener('click', () => { try{ n.action && n.action(); }catch{} });
      row.querySelector('[data-act="dismiss"]')?.addEventListener('click', () => {
        const st = phase8LoadNotifyState_();
        if(!st.dismissed.includes(n.id)) st.dismissed.push(n.id);
        phase8SaveNotifyState_();
        phase8RenderNotificationsPanel_();
      });
      list.appendChild(row);
    });
  }
  box.querySelector('#phase8BtnRefreshNotif')?.addEventListener('click', () => phase8RenderNotificationsPanel_());
  box.querySelector('#phase8BtnClearNotifDismissed')?.addEventListener('click', () => { phase8LoadNotifyState_().dismissed = []; phase8SaveNotifyState_(); phase8RenderNotificationsPanel_(); });
  box.querySelector('#phase8BtnDismissAllVisible')?.addEventListener('click', () => {
    const st = phase8LoadNotifyState_();
    for(const n of visible){ if(!st.dismissed.includes(n.id)) st.dismissed.push(n.id); }
    phase8SaveNotifyState_();
    phase8RenderNotificationsPanel_();
  });
}

function phase8ScoreProjectHealth_(p){
  let tasks=0, done=0, overdue=0, blocked=0, dueSoon=0, high=0;
  const now = Date.now();
  const dueSoonEnd = now + 7*86400000;
  for(const mod of (p?.modules || [])){
    for(const ms of (mod?.milestones || [])){
      for(const t of (ms?.tasks || [])){
        tasks++;
        if(t.done){ done++; continue; }
        const due = Number(t?.dueAt || 0);
        if(due && due < (new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())).getTime()) overdue++;
        else if(due && due <= dueSoonEnd) dueSoon++;
        if(t.severity === 'high') high++;
        if(t.severity === 'blocker') high += 2;
        try{ if(typeof phase4GetUnresolvedBlockers_ === 'function' && phase4GetUnresolvedBlockers_(ms, t).length) blocked++; }catch{}
      }
    }
  }
  const open = tasks - done;
  let score = 100;
  score -= overdue * 8;
  score -= blocked * 5;
  score -= dueSoon * 2;
  score -= Math.max(0, open - done) * 0.5;
  score -= high;
  if(tasks){ score += (done / tasks) * 15; }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const badge = score >= 80 ? 'Healthy' : (score >= 55 ? 'Watch' : 'At Risk');
  const badgeClass = score >= 80 ? 'ok' : (score >= 55 ? 'warn' : 'risk');
  return { score, badge, badgeClass, tasks, open, overdue, blocked, dueSoon };
}

function phase8RenderHealthPanel_(){
  const box = document.querySelector('#phase8HealthPanel');
  if(!box) return;
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Project Health Scoring</div><div class="phase8-item__meta">Overdue + blockers + due-soon weighted</div></div>
    <div class="phase8-list" id="phase8HealthList" style="margin-top:8px"></div>
  `;
  const list = box.querySelector('#phase8HealthList');
  const projects = (state.projects || []).slice();
  if(!projects.length){ list.innerHTML = `<div class="phase8-empty">No projects available.</div>`; return; }
  const rows = projects.map(p => ({ p, h: phase8ScoreProjectHealth_(p) }))
                      .sort((a,b) => a.h.score - b.h.score || a.p.name.localeCompare(b.p.name));
  rows.forEach(({p,h}) => {
    const row = document.createElement('div');
    row.className = 'phase8-health';
    row.innerHTML = `
      <div>
        <div class="phase8-health__name">${escapeHtml(p.name)}</div>
        <div class="phase8-item__meta">open ${h.open}/${h.tasks} • overdue ${h.overdue} • blocked ${h.blocked} • due7 ${h.dueSoon}</div>
      </div>
      <div class="phase8-health__score">${h.score}</div>
      <div class="phase8-health__badge ${h.badgeClass}">${escapeHtml(h.badge)}</div>
    `;
    row.addEventListener('click', () => { setActiveProject(p.id); switchTab('dashboard'); renderAll(); });
    list.appendChild(row);
  });
}

function phase8RenderAuditPanel_(){
  const box = document.querySelector('#phase8AuditPanel');
  if(!box) return;
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Audit Trail Filter</div><div class="phase8-item__meta">Search recent activity</div></div>
    <div class="phase8-toolbar" style="margin-top:8px">
      <input class="input" id="phase8AuditQuery" placeholder="e.g., Export, snapshot, import, recurring" value="${escapeHtml(String(phase8State_.auditQuery||''))}" />
      <button class="btn btn--ghost" id="phase8BtnAuditApply" type="button">Apply</button>
      <button class="btn btn--ghost" id="phase8BtnAuditClear" type="button">Clear</button>
    </div>
    <div class="phase8-auditList" id="phase8AuditList" style="margin-top:8px"></div>
  `;
  const queryInput = box.querySelector('#phase8AuditQuery');
  const renderList = () => {
    phase8State_.auditQuery = String(queryInput?.value || '').trim();
    const q = phase8State_.auditQuery.toLowerCase();
    const list = box.querySelector('#phase8AuditList');
    list.innerHTML = '';
    const rows = (state.activity || []).filter(a => !q || String(a.msg || '').toLowerCase().includes(q)).slice(0, 40);
    if(!rows.length){ list.innerHTML = `<div class="phase8-empty">No matching activity.</div>`; return; }
    rows.forEach(a => {
      const row = document.createElement('div');
      row.className = 'phase8-auditRow';
      row.innerHTML = `<div class="phase8-auditRow__msg">${escapeHtml(a.msg)}</div><div class="phase8-auditRow__meta">${new Date(a.ts).toLocaleString()}</div>`;
      list.appendChild(row);
    });
  };
  box.querySelector('#phase8BtnAuditApply')?.addEventListener('click', renderList);
  box.querySelector('#phase8BtnAuditClear')?.addEventListener('click', () => { if(queryInput) queryInput.value = ''; renderList(); });
  queryInput?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') renderList(); });
  renderList();
}

function phase8FocusTask_(e){
  if(!e || !e.p || !e.ms || !e.t) return;
  setActiveProject(e.p.id);
  setActiveMilestone(e.ms.id);
  switchTab('checklist');
  setTimeout(() => {
    const target = Array.from(document.querySelectorAll('#taskList .task')).find(x => x.dataset.taskId === e.t.id);
    if(target){ target.scrollIntoView({behavior:'smooth', block:'center'}); target.classList.add('is-selected'); setTimeout(()=>target.classList.remove('is-selected'), 900); }
  }, 80);
}

function phase8PostRenderChecklist_(){
  const tab = document.querySelector('#tab-checklist');
  if(!tab) return;
  let host = document.querySelector('#phase8ChecklistHost');
  if(!host){
    host = document.createElement('div');
    host.id = 'phase8ChecklistHost';
    host.className = 'phase8-box';
    host.innerHTML = `
      <div class="phase8-title">Phase 8 Planning & Dependencies</div>
      <div class="phase8-grid" id="phase8ChecklistGridA">
        <div class="phase8-card" id="phase8DepsPanel"></div>
        <div class="phase8-card" id="phase8GanttPanel"></div>
      </div>
    `;
    tab.appendChild(host);
  }
  phase8RenderDepsPanel_();
  phase8RenderGanttPanel_();
}

function phase8ChecklistContext_(){
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  return { p, m };
}

function phase8DepRowsForMilestone_(m){
  const rows = [];
  if(!m) return rows;
  const tasks = Array.isArray(m.tasks) ? m.tasks : [];
  const byId = new Map(tasks.map(t => [t.id, t]));
  for(const t of tasks){
    try{ if(typeof phase4NormalizeTaskMeta_ === 'function') phase4NormalizeTaskMeta_(t,t); }catch{}
    const blockers = Array.isArray(t.blockedBy) ? t.blockedBy : [];
    const missing = [];
    const selfRefs = [];
    const resolved = [];
    const seen = new Set();
    const dupes = [];
    for(const id of blockers){
      if(id === t.id){ selfRefs.push(id); continue; }
      if(seen.has(id)){ dupes.push(id); continue; }
      seen.add(id);
      const b = byId.get(id);
      if(!b) missing.push(id);
      else resolved.push(b);
    }
    const unresolvedOpen = resolved.filter(x => !x.done);
    rows.push({ t, blockers, resolved, unresolvedOpen, missing, selfRefs, dupes });
  }
  return rows;
}

function phase8RenderDepsPanel_(){
  const box = document.querySelector('#phase8DepsPanel');
  if(!box) return;
  const { p, m } = phase8ChecklistContext_();
  const rows = phase8DepRowsForMilestone_(m);
  const depRows = rows.filter(r => (r.blockers?.length || 0) || r.missing.length || r.selfRefs.length || r.dupes.length);
  const cycleInfo = phase8FindDependencyCycleEdges_(m);
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Dependency Matrix & Batch Editor</div><div class="phase8-item__meta">${p ? escapeHtml(p.name) : 'No project'}${m ? ' • ' + escapeHtml(m.title) : ''}</div></div>
    <div class="phase8-toolbar" style="margin-top:8px">
      <select class="select" id="phase8DepFilter">
        <option value="all">All tasks</option>
        <option value="withdeps">With deps</option>
        <option value="blocked">Blocked open</option>
        <option value="issues">Issues only</option>
      </select>
      <button class="btn btn--ghost" id="phase8BtnDepNormalize" type="button">Normalize</button>
      <button class="btn btn--ghost" id="phase8BtnDepClearInvalid" type="button">Clear Invalid</button>
      <button class="btn btn--ghost" id="phase8BtnDepRepairCycles" type="button">Repair Cycles</button>
    </div>
    <div class="phase8-toolbar" style="margin-top:6px">
      <button class="btn btn--ghost" id="phase8BtnBatchClearDeps" type="button">Clear blockers (selected)</button>
      <button class="btn btn--ghost" id="phase8BtnBatchClearDue" type="button">Clear due (selected)</button>
      <button class="btn btn--ghost" id="phase8BtnBatchShiftDue" type="button">Shift due ±days (selected)</button>
    </div>
    <div class="phase8-item__meta" style="margin-top:6px">cycles: ${cycleInfo.edges.length} • tasks with deps: ${depRows.length} • total tasks: ${rows.length}</div>
    <div class="phase8-tableWrap" style="margin-top:8px"><table class="phase8-table"><thead><tr><th>Task</th><th>Deps</th><th>Status</th><th>Due</th><th>Actions</th></tr></thead><tbody id="phase8DepsTbody"></tbody></table></div>
  `;
  const sel = box.querySelector('#phase8DepFilter');
  if(sel) sel.value = phase8State_.depFilter || 'all';
  const tbody = box.querySelector('#phase8DepsTbody');
  const filter = phase8State_.depFilter || 'all';
  const filtered = rows.filter(r => {
    if(filter === 'withdeps') return (r.blockers?.length || 0) > 0;
    if(filter === 'blocked') return !r.t.done && r.unresolvedOpen.length > 0;
    if(filter === 'issues') return r.missing.length > 0 || r.selfRefs.length > 0 || r.dupes.length > 0 || cycleInfo.edgeSet.has(String(r.t.id));
    return true;
  });
  if(!m){ tbody.innerHTML = `<tr><td colspan="5"><div class="phase8-empty">Select a project and milestone.</div></td></tr>`; }
  else if(!filtered.length){ tbody.innerHTML = `<tr><td colspan="5"><div class="phase8-empty">No rows for current filter.</div></td></tr>`; }
  else {
    filtered.forEach(r => {
      const tr = document.createElement('tr');
      const issues = [];
      if(r.unresolvedOpen.length && !r.t.done) issues.push(`blocked:${r.unresolvedOpen.length}`);
      if(r.missing.length) issues.push(`missing:${r.missing.length}`);
      if(r.selfRefs.length) issues.push(`self:${r.selfRefs.length}`);
      if(r.dupes.length) issues.push(`dupes:${r.dupes.length}`);
      const hasCycleEdge = cycleInfo.edgeSet.has(String(r.t.id));
      if(hasCycleEdge) issues.push('cycle');
      const depNames = r.resolved.slice(0,3).map(x => x.title).join(', ');
      const dueTxt = r.t.dueAt ? new Date(Number(r.t.dueAt)).toLocaleDateString() : '—';
      tr.innerHTML = `
        <td>
          <div>${escapeHtml(r.t.title)}</div>
          <div class="phase8-item__meta">${r.t.done ? 'done' : 'open'} • ${escapeHtml(r.t.severity || 'normal')}</div>
        </td>
        <td>
          <div>${r.blockers.length || 0}</div>
          <div class="phase8-item__meta">${escapeHtml(depNames)}${r.resolved.length > 3 ? '…' : ''}</div>
        </td>
        <td>${issues.length ? escapeHtml(issues.join(' • ')) : 'ok'}</td>
        <td>${escapeHtml(dueTxt)}</td>
        <td>
          <div class="phase8-toolbar">
            <button class="btn btn--ghost" type="button" data-act="focus">Open</button>
            <button class="btn btn--ghost" type="button" data-act="planner">Planner</button>
          </div>
        </td>`;
      tr.querySelector('[data-act="focus"]')?.addEventListener('click', ()=>phase8FocusTask_({ p:getActiveProject(), m, t:r.t }));
      tr.querySelector('[data-act="planner"]')?.addEventListener('click', ()=>{ if(typeof phase4OpenTaskPlanner_ === 'function') phase4OpenTaskPlanner_(r.t); });
      tbody.appendChild(tr);
    });
  }

  sel?.addEventListener('change', (e)=>{ phase8State_.depFilter = String(e.target.value||'all'); phase8RenderDepsPanel_(); });
  box.querySelector('#phase8BtnDepNormalize')?.addEventListener('click', () => {
    let changed = 0;
    for(const r of rows){ const b = JSON.stringify({d:r.t.dueAt,bb:r.t.blockedBy, n:r.t.blockerNote}); try{ if(typeof phase4NormalizeTaskMeta_ === 'function') phase4NormalizeTaskMeta_(r.t,r.t); }catch{} const a = JSON.stringify({d:r.t.dueAt,bb:r.t.blockedBy, n:r.t.blockerNote}); if(a!==b) changed++; }
    addActivity(`Phase8 normalized dependency metadata on ${changed} task(s)`); if(changed){ saveState(); renderChecklist(); }
  });
  box.querySelector('#phase8BtnDepClearInvalid')?.addEventListener('click', () => {
    if(!m) return;
    const byId = new Set((m.tasks||[]).map(t=>t.id));
    let changed = 0;
    for(const t of (m.tasks||[])){
      const before = JSON.stringify(t.blockedBy || []);
      const next = Array.from(new Set((Array.isArray(t.blockedBy)?t.blockedBy:[]).filter(id => id && id !== t.id && byId.has(id))));
      t.blockedBy = next;
      if(JSON.stringify(next)!==before) changed++;
    }
    addActivity(`Phase8 cleared invalid/self/duplicate blockers on ${changed} task(s)`);
    if(changed){ saveState(); renderChecklist(); }
  });
  box.querySelector('#phase8BtnDepRepairCycles')?.addEventListener('click', async () => {
    if(!m) return;
    const info = phase8FindDependencyCycleEdges_(m);
    if(!info.edges.length){ alert('No cycle edges detected.'); return; }
    if(!(await pmConfirmDialog_(`Repair ${info.edges.length} detected cycle edge(s)? This removes back-edges from blockedBy lists.`, {
      title:'Dependency Health',
      okText:'Repair'
    }))) return;
    let changed = 0;
    const removeByTask = new Map();
    for(const edge of info.edges){
      const arr = removeByTask.get(edge.from) || []; arr.push(edge.to); removeByTask.set(edge.from, arr);
    }
    for(const t of (m.tasks||[])){
      const rem = new Set(removeByTask.get(t.id) || []);
      if(!rem.size) continue;
      const before = JSON.stringify(t.blockedBy || []);
      t.blockedBy = (Array.isArray(t.blockedBy)?t.blockedBy:[]).filter(id => !rem.has(id));
      if(JSON.stringify(t.blockedBy)!==before) changed++;
    }
    addActivity(`Phase8 repaired ${changed} cycle-linked task(s)`);
    if(changed){ saveState(); renderChecklist(); }
  });
  box.querySelector('#phase8BtnBatchClearDeps')?.addEventListener('click', () => phase8BatchEditSelectedTasks_('clearDeps'));
  box.querySelector('#phase8BtnBatchClearDue')?.addEventListener('click', () => phase8BatchEditSelectedTasks_('clearDue'));
  box.querySelector('#phase8BtnBatchShiftDue')?.addEventListener('click', () => phase8BatchEditSelectedTasks_('shiftDue'));
}

function phase8FindDependencyCycleEdges_(m){
  const result = { edges: [], edgeSet: new Set() };
  if(!m || !Array.isArray(m.tasks)) return result;
  const byId = new Map((m.tasks||[]).map(t => [t.id, t]));
  const visiting = new Set();
  const visited = new Set();
  const path = [];
  const pathIdx = new Map();
  const edgeKey = new Set();
  function dfs(id){
    if(visiting.has(id)) return;
    if(visited.has(id)) return;
    visiting.add(id);
    pathIdx.set(id, path.length);
    path.push(id);
    const t = byId.get(id);
    for(const depId of (Array.isArray(t?.blockedBy)?t.blockedBy:[])){
      if(!byId.has(depId)) continue;
      if(visiting.has(depId)){
        const from = id, to = depId;
        const k = `${from}->${to}`;
        if(!edgeKey.has(k)){
          edgeKey.add(k);
          result.edges.push({ from, to });
          result.edgeSet.add(String(from));
        }
        continue;
      }
      dfs(depId);
    }
    visiting.delete(id);
    visited.add(id);
    pathIdx.delete(id);
    path.pop();
  }
  for(const t of (m.tasks||[])) dfs(t.id);
  return result;
}

async function phase8BatchEditSelectedTasks_(mode){
  const { m } = phase8ChecklistContext_();
  if(!m) return;
  let selected = [];
  try{ if(typeof phase3GetSelectedTaskIdsForCurrentMilestone_ === 'function') selected = phase3GetSelectedTaskIdsForCurrentMilestone_(); }catch{}
  if(!selected.length){
    const allVisibleCards = Array.from(document.querySelectorAll('#taskList .task')).filter(x => !x.classList.contains('phase3-hidden'));
    selected = allVisibleCards.map(x => x.dataset.taskId).filter(Boolean);
  }
  if(!selected.length){ alert('No selected (or visible) tasks to edit.'); return; }
  const setIds = new Set(selected);
  let changed = 0;
  if(mode === 'shiftDue'){
    const raw = await pmPromptDialog_('Shift due dates by how many days? (Use negative to pull earlier)', '1', {
      title:'Shift Due Dates',
      placeholder:'e.g. 1 or -2'
    });
    if(raw == null) return;
    const n = Number(raw);
    if(!Number.isFinite(n) || !Number.isInteger(n)){ alert('Enter a whole number of days.'); return; }
    for(const t of (m.tasks||[])){
      if(!setIds.has(t.id) || !t.dueAt) continue;
      const before = Number(t.dueAt);
      t.dueAt = before + (n * 86400000);
      changed++;
    }
    addActivity(`Phase8 shifted due dates by ${n} day(s) on ${changed} task(s)`);
  } else if(mode === 'clearDue'){
    for(const t of (m.tasks||[])){
      if(!setIds.has(t.id)) continue;
      if(t.dueAt){ t.dueAt = null; changed++; }
    }
    addActivity(`Phase8 cleared due dates on ${changed} task(s)`);
  } else if(mode === 'clearDeps'){
    for(const t of (m.tasks||[])){
      if(!setIds.has(t.id)) continue;
      if(Array.isArray(t.blockedBy) && t.blockedBy.length){ t.blockedBy = []; changed++; }
    }
    addActivity(`Phase8 cleared blockers on ${changed} task(s)`);
  }
  if(changed){ saveState(); renderChecklist(); }
}

function phase8RenderGanttPanel_(){
  const box = document.querySelector('#phase8GanttPanel');
  if(!box) return;
  const { p, m } = phase8ChecklistContext_();
  const tasks = Array.isArray(m?.tasks) ? m.tasks.slice() : [];
  const rows = [];
  for(const t of tasks){
    if(!t?.dueAt) continue;
    const due = Number(t.dueAt);
    if(!Number.isFinite(due) || due <= 0) continue;
    let durationDays = 1;
    try{
      const stepsLen = Array.isArray(t.steps) ? t.steps.length : 0;
      durationDays = Math.max(1, Math.min(14, (t.severity === 'blocker' ? 4 : t.severity === 'high' ? 2 : 1) + Math.ceil(stepsLen/4)));
      if(typeof phase4GetUnresolvedBlockers_ === 'function' && m && phase4GetUnresolvedBlockers_(m,t).length) durationDays += 1;
    }catch{}
    const start = due - (durationDays-1)*86400000;
    rows.push({ t, start, due, durationDays });
  }
  rows.sort((a,b) => a.start - b.start || a.due - b.due || String(a.t.title).localeCompare(String(b.t.title)));
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Timeline / Gantt-lite</div><div class="phase8-item__meta">${p ? escapeHtml(p.name) : 'No project'}${m ? ' • ' + escapeHtml(m.title) : ''}</div></div>
    <div class="phase8-item__meta" style="margin-top:6px">Bars use due dates + lightweight duration heuristic (severity/steps/blockers).</div>
    <div class="phase8-gantt" id="phase8GanttList" style="margin-top:8px"></div>
  `;
  const list = box.querySelector('#phase8GanttList');
  if(!m){ list.innerHTML = `<div class="phase8-empty">Select a project and milestone to see timeline bars.</div>`; return; }
  if(!rows.length){ list.innerHTML = `<div class="phase8-empty">No due dates in this milestone yet.</div>`; return; }
  const minTs = Math.min(...rows.map(r => r.start));
  const maxTs = Math.max(...rows.map(r => r.due));
  const span = Math.max(86400000, maxTs - minTs);
  rows.slice(0, 60).forEach(r => {
    const row = document.createElement('div');
    row.className = 'phase8-ganttRow';
    const leftPct = ((r.start - minTs)/span) * 100;
    const widthPct = Math.max(3, ((r.due - r.start + 86400000)/span) * 100);
    const isOverdue = !r.t.done && r.due < (new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())).getTime();
    row.innerHTML = `
      <button type="button" class="phase8-ganttLabel btn btn--ghost" data-act="open">${escapeHtml(r.t.title)}</button>
      <div class="phase8-ganttTrack"><div class="phase8-ganttBar ${isOverdue ? 'is-overdue' : ''} ${r.t.done ? 'is-done' : ''}" style="left:${leftPct}%;width:${Math.min(100-leftPct, widthPct)}%"></div></div>
      <div class="phase8-ganttDate">${new Date(r.start).toLocaleDateString()} → ${new Date(r.due).toLocaleDateString()}</div>
    `;
    row.querySelector('[data-act="open"]')?.addEventListener('click', ()=>phase8FocusTask_({ p:getActiveProject(), m, t:r.t }));
    list.appendChild(row);
  });
}

// boot phase 8 after phase 7 patch is loaded
try{ initPhase8_(); }catch(err){ console.warn('Phase8 init failed', err); }


