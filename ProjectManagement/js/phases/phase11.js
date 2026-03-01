/* ---------------------------
   Phase 11 Team Ops + SLA Aging (Additive Patch)
   - SLA aging rules (task/blocker/milestone stale thresholds)
   - Stale update alerts integrated into Notifications Center (Phase 8)
   - Saved Dashboard Views (jump presets for dashboard sections)
---------------------------- */
var PHASE11_SLA_CFG_KEY = 'stark_pm_phase11_sla_cfg_v1';
var PHASE11_DASH_VIEWS_KEY = 'stark_pm_phase11_dashboard_views_v1';

var phase11State_ = {
  inited:false,
  slaCfg:null,
  dashViews:null,
  scopeActiveOnly:false,
};

function initPhase11_(){
  if(phase11State_.inited) return;
  phase11State_.inited = true;
  try{ phase11InjectStyles_(); }catch(err){ console.warn('Phase11 styles failed', err); }
  try{ phase11LoadSlaCfg_(); phase11LoadDashViews_(); }catch{}
  try{ phase11WrapCore_(); }catch(err){ console.warn('Phase11 core wrap failed', err); }
  try{ phase11EnsureTopbarButtons_(); }catch(err){ console.warn('Phase11 topbar failed', err); }
}

function phase11InjectStyles_(){
  if(document.querySelector('#phase11Styles')) return;
  const style = document.createElement('style');
  style.id = 'phase11Styles';
  style.textContent = `
    .phase11-box{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    .phase11-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9;margin-bottom:8px}
    .phase11-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:10px}
    .phase11-card{border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px;background:rgba(255,255,255,.012)}
    .phase11-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .phase11-toolbar .input,.phase11-toolbar .select{min-width:120px}
    .phase11-note{font-size:11px;opacity:.8;line-height:1.35}
    .phase11-kv{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:8px}
    .phase11-kv > div{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase11-kv b{display:block;font-size:10px;opacity:.72;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px}
    .phase11-kv span{font-size:14px;font-weight:800}
    .phase11-list{display:grid;gap:8px;margin-top:8px}
    .phase11-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase11-row__name{font-size:12px;font-weight:700;line-height:1.25}
    .phase11-row__meta{font-size:11px;opacity:.78;line-height:1.3;margin-top:2px}
    .phase11-tags{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}
    .phase11-tag{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:2px 7px;font-size:10px;letter-spacing:.05em;text-transform:uppercase}
    .phase11-tag.warn{border-color:rgba(255,191,92,.25)}
    .phase11-tag.risk{border-color:rgba(255,107,107,.28)}
    .phase11-tag.ok{border-color:rgba(79,209,197,.25)}
    .phase11-two{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
    .phase11-mini{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase11-mini h4{margin:0 0 6px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;opacity:.78}
    .phase11-mini .phase11-list{margin-top:0}
    .phase11-check{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.01)}
    .phase11-inlineNum{width:86px}
    @media (max-width: 980px){ .phase11-grid{grid-template-columns:1fr} .phase11-kv{grid-template-columns:1fr 1fr} .phase11-two{grid-template-columns:1fr} }
    @media (max-width: 640px){ .phase11-kv{grid-template-columns:1fr} }
  `;
  document.head.appendChild(style);
}

function phase11WrapCore_(){
  if(typeof renderDashboard === 'function' && !renderDashboard._phase11Wrapped){
    const base = renderDashboard;
    renderDashboard = function(){
      base();
      try{ phase11PostRenderDashboard_(); }catch(err){ console.warn('Phase11 dashboard render failed', err); }
    };
    renderDashboard._phase11Wrapped = true;
  }

  if(typeof phase8GenerateNotifications_ === 'function' && !phase8GenerateNotifications_._phase11WrappedSla){
    const baseGen = phase8GenerateNotifications_;
    phase8GenerateNotifications_ = function(){
      const arr = Array.isArray(baseGen()) ? baseGen() : [];
      return phase11AppendSlaNotifications_(arr);
    };
    phase8GenerateNotifications_._phase11WrappedSla = true;
  }

  if(typeof phase3BuildCmdkItems_ === 'function' && !phase3BuildCmdkItems_._phase11Wrapped){
    const baseBuild = phase3BuildCmdkItems_;
    phase3BuildCmdkItems_ = function(q){
      const items = baseBuild(q) || [];
      const query = String(q || '').trim().toLowerCase();
      const cmds = [
        { kind:'command', title:'Phase 11: SLA Aging Panel', sub:'Open dashboard SLA aging and stale alerts', tag:'PH11', act:'phase11Sla' },
        { kind:'command', title:'Phase 11: Dashboard Views', sub:'Open saved dashboard views panel', tag:'PH11', act:'phase11DashViews' },
      ];
      for(const c of cmds){
        const hay = `${c.title} ${c.sub} ${c.tag}`.toLowerCase();
        if(!query || hay.includes(query)) items.push(c);
      }
      return items;
    };
    phase3BuildCmdkItems_._phase11Wrapped = true;
  }
  if(typeof phase3RunCmdkAction_ === 'function' && !phase3RunCmdkAction_._phase11Wrapped){
    const baseRun = phase3RunCmdkAction_;
    phase3RunCmdkAction_ = function(it){
      if(it && it.act === 'phase11Sla'){ phase11OpenSlaPanel_(); return; }
      if(it && it.act === 'phase11DashViews'){ phase11OpenDashViewsPanel_(); return; }
      return baseRun(it);
    };
    phase3RunCmdkAction_._phase11Wrapped = true;
  }
}

function phase11EnsureTopbarButtons_(){
  const topbarRight = document.querySelector('.topbar__right');
  if(!topbarRight) return;
  if(!document.querySelector('#phase11BtnSla')){
    const btn = document.createElement('button');
    btn.id = 'phase11BtnSla';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'SLA';
    btn.title = 'Open SLA aging + stale alerts panel';
    btn.addEventListener('click', phase11OpenSlaPanel_);
    topbarRight.appendChild(btn);
  }
  if(!document.querySelector('#phase11BtnDashViews')){
    const btn = document.createElement('button');
    btn.id = 'phase11BtnDashViews';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Dash Views';
    btn.title = 'Open saved dashboard views panel';
    btn.addEventListener('click', phase11OpenDashViewsPanel_);
    topbarRight.appendChild(btn);
  }
}

function phase11OpenSlaPanel_(){
  openPanelInOwningTab_('#phase11SlaPanel', 'dashboard', 40);
}
function phase11OpenDashViewsPanel_(){
  openPanelInOwningTab_('#phase11DashViewsPanel', 'dashboard', 40);
}

function phase11DefaultSlaCfg_(){
  return {
    enabled: true,
    alertStaleTasks: true,
    alertStaleBlockers: true,
    alertStaleMilestones: true,
    staleTaskDays: 5,
    staleBlockerDays: 2,
    staleMilestoneDays: 7,
    notifMaxPerType: 8,
  };
}
function phase11NormalizeSlaCfg_(v){
  const d = phase11DefaultSlaCfg_();
  const n = (x, fallback, min, max) => {
    const m = Number(x);
    if(!Number.isFinite(m)) return fallback;
    return Math.max(min, Math.min(max, Math.round(m)));
  };
  return {
    enabled: v?.enabled !== false,
    alertStaleTasks: v?.alertStaleTasks !== false,
    alertStaleBlockers: v?.alertStaleBlockers !== false,
    alertStaleMilestones: v?.alertStaleMilestones !== false,
    staleTaskDays: n(v?.staleTaskDays, d.staleTaskDays, 1, 365),
    staleBlockerDays: n(v?.staleBlockerDays, d.staleBlockerDays, 1, 365),
    staleMilestoneDays: n(v?.staleMilestoneDays, d.staleMilestoneDays, 1, 365),
    notifMaxPerType: n(v?.notifMaxPerType, d.notifMaxPerType, 1, 20),
  };
}
function phase11LoadSlaCfg_(){
  if(phase11State_.slaCfg) return phase11State_.slaCfg;
  let cfg = null;
  try{ cfg = JSON.parse(localStorage.getItem(PHASE11_SLA_CFG_KEY) || 'null'); }catch{ cfg = null; }
  phase11State_.slaCfg = phase11NormalizeSlaCfg_(cfg || {});
  return phase11State_.slaCfg;
}
function phase11SaveSlaCfg_(){
  try{ localStorage.setItem(PHASE11_SLA_CFG_KEY, JSON.stringify(phase11LoadSlaCfg_())); }catch{}
}

function phase11NormalizeDashView_(v){
  return {
    id: String(v?.id || uid()),
    name: String(v?.name || 'Dashboard View').trim() || 'Dashboard View',
    targetId: String(v?.targetId || ''),
    scrollY: Number.isFinite(Number(v?.scrollY)) ? Math.max(0, Math.round(Number(v.scrollY))) : 0,
    createdAt: Number(v?.createdAt || Date.now()),
    updatedAt: Number(v?.updatedAt || Date.now()),
  };
}
function phase11LoadDashViews_(){
  if(Array.isArray(phase11State_.dashViews)) return phase11State_.dashViews;
  let arr = [];
  try{ arr = JSON.parse(localStorage.getItem(PHASE11_DASH_VIEWS_KEY) || '[]') || []; }catch{ arr = []; }
  phase11State_.dashViews = Array.isArray(arr) ? arr.filter(Boolean).map(phase11NormalizeDashView_) : [];
  return phase11State_.dashViews;
}
function phase11SaveDashViews_(){
  try{ localStorage.setItem(PHASE11_DASH_VIEWS_KEY, JSON.stringify((phase11LoadDashViews_() || []).map(phase11NormalizeDashView_))); }catch{}
}

function phase11DashboardTargets_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return [];
  const nodes = Array.from(tab.querySelectorAll('[id]'));
  const out = [];
  for(const el of nodes){
    const id = String(el.id || '');
    if(!id) continue;
    if(['tab-dashboard','phase8DashboardHost','phase10DashboardHost','phase11DashboardHost'].includes(id)) continue;
    if(!/phase\d+/i.test(id)) continue;
    let label = '';
    const titleNode = el.querySelector?.('.phase8-item__title, .phase9-title, .phase10-title, .phase11-title, h3, h4');
    if(titleNode) label = String(titleNode.textContent || '').trim();
    if(!label) label = id.replace(/([a-z])([A-Z])/g, '$1 $2');
    out.push({ id, label });
  }
  const seen = new Set();
  return out.filter(x => !seen.has(x.id) && seen.add(x.id));
}

function phase11ApplyDashView_(viewOrId){
  const views = phase11LoadDashViews_();
  const v = (typeof viewOrId === 'string') ? (views.find(x => x.id === viewOrId) || null) : viewOrId;
  if(!v) return;
  switchTab('dashboard');
  const targetId = String(v.targetId || '');
  setTimeout(() => {
    const el = targetId ? document.getElementById(targetId) : null;
    if(el){
      el.scrollIntoView({ behavior:'smooth', block:'start' });
      try{ el.classList.add('is-selected'); setTimeout(()=>el.classList.remove('is-selected'), 900); }catch{}
    } else {
      try{ window.scrollTo({ top: Math.max(0, Number(v.scrollY || 0)), behavior:'smooth' }); }catch{}
    }
  }, 60);
}

function phase11TaskLastTouchTs_(t){
  let ts = Number(t?.createdAt || 0);
  if(Number.isFinite(Number(t?.updatedAt))) ts = Math.max(ts, Number(t.updatedAt));
  if(Array.isArray(t?.comments)){
    for(const c of t.comments){
      const cts = Number(c?.ts || 0);
      if(Number.isFinite(cts)) ts = Math.max(ts, cts);
    }
  }
  return ts || Date.now();
}

function phase11CollectSlaAging_(opts){
  opts = opts || {};
  const cfg = phase11LoadSlaCfg_();
  const onlyActiveProject = !!opts.onlyActiveProject;
  const DAY = 86400000;
  const now = Date.now();
  const entries = (typeof phase8AllTaskEntries_ === 'function')
    ? (phase8AllTaskEntries_({ onlyActiveProject }) || [])
    : [];

  const staleTasks = [];
  const staleBlockers = [];
  const milestoneMap = new Map();
  const bucket = { lt2:0, d2_4:0, d5_9:0, d10p:0 };
  let openCount = 0, doneCount = 0;

  for(const e of entries){
    const t = e?.t;
    if(!t) continue;
    if(t.done){ doneCount++; continue; }
    openCount++;
    const touchTs = phase11TaskLastTouchTs_(t);
    const ageDays = Math.floor((now - touchTs) / DAY);
    if(ageDays < 2) bucket.lt2++;
    else if(ageDays < 5) bucket.d2_4++;
    else if(ageDays < 10) bucket.d5_9++;
    else bucket.d10p++;

    const key = `${String(e.p?.id||'')}|${String(e.ms?.id||'')}`;
    const agg = milestoneMap.get(key) || { p:e.p, mod:e.mod, ms:e.ms, open:0, oldestOpenAgeDays:0, newestTouchTs:0, blockerOpen:0 };
    agg.open++;
    agg.oldestOpenAgeDays = Math.max(agg.oldestOpenAgeDays, ageDays);
    agg.newestTouchTs = Math.max(agg.newestTouchTs, touchTs);
    if(t.severity === 'blocker') agg.blockerOpen++;
    milestoneMap.set(key, agg);

    const row = { e, t, touchTs, ageDays };
    if(ageDays >= Number(cfg.staleTaskDays || 5)) staleTasks.push(row);
    if(t.severity === 'blocker' && ageDays >= Number(cfg.staleBlockerDays || 2)) staleBlockers.push(row);
  }

  const staleMilestones = [];
  for(const agg of milestoneMap.values()){
    const ageDays = Math.floor((now - Number(agg.newestTouchTs || 0)) / DAY);
    if(agg.open > 0 && ageDays >= Number(cfg.staleMilestoneDays || 7)){
      staleMilestones.push({ ...agg, ageDays });
    }
  }

  staleTasks.sort((a,b)=> (b.ageDays - a.ageDays) || String(a.t?.title||'').localeCompare(String(b.t?.title||'')));
  staleBlockers.sort((a,b)=> (b.ageDays - a.ageDays) || String(a.t?.title||'').localeCompare(String(b.t?.title||'')));
  staleMilestones.sort((a,b)=> (b.ageDays - a.ageDays) || String(a.ms?.title||'').localeCompare(String(b.ms?.title||'')));

  return {
    now,
    cfg,
    onlyActiveProject,
    openCount,
    doneCount,
    bucket,
    staleTasks,
    staleBlockers,
    staleMilestones,
    taskTotal: entries.length,
  };
}

function phase11FocusMilestone_(x){
  if(!x || !x.p || !x.ms) return;
  try{ setActiveProject(x.p.id); }catch{}
  try{ setActiveMilestone(x.ms.id); }catch{}
  switchTab('checklist');
  setTimeout(() => document.querySelector('#taskList')?.scrollIntoView({ behavior:'smooth', block:'start' }), 80);
}

function phase11AppendSlaNotifications_(arr){
  const out = Array.isArray(arr) ? arr.slice() : [];
  const cfg = phase11LoadSlaCfg_();
  if(!cfg.enabled) return out;
  const sla = phase11CollectSlaAging_({ onlyActiveProject:false });
  const maxPerType = Math.max(1, Number(cfg.notifMaxPerType || 8));

  if(cfg.alertStaleBlockers){
    for(const r of sla.staleBlockers.slice(0, maxPerType)){
      const e = r.e;
      out.push({
        id:`ph11:staleblk:${e.p.id}:${e.ms.id}:${r.t.id}`,
        type:'staleBlocker',
        level: r.ageDays >= (cfg.staleBlockerDays + 3) ? 'urgent' : 'high',
        title:`Stale blocker: ${String(r.t.title || 'Untitled Task')}`,
        meta:`No update ~${r.ageDays}d • ${e.p.name} • ${e.ms.title}`,
        action:()=>{ if(typeof phase8FocusTask_ === 'function') phase8FocusTask_(e); else phase11FocusMilestone_(e); }
      });
    }
  }
  if(cfg.alertStaleTasks){
    for(const r of sla.staleTasks.slice(0, maxPerType)){
      const e = r.e;
      out.push({
        id:`ph11:staletask:${e.p.id}:${e.ms.id}:${r.t.id}`,
        type:'staleTask',
        level: r.ageDays >= (cfg.staleTaskDays + 5) ? 'high' : 'normal',
        title:`Stale task: ${String(r.t.title || 'Untitled Task')}`,
        meta:`No update ~${r.ageDays}d • ${e.p.name} • ${e.ms.title}`,
        action:()=>{ if(typeof phase8FocusTask_ === 'function') phase8FocusTask_(e); else phase11FocusMilestone_(e); }
      });
    }
  }
  if(cfg.alertStaleMilestones){
    for(const m of sla.staleMilestones.slice(0, maxPerType)){
      out.push({
        id:`ph11:stalems:${m.p.id}:${m.ms.id}`,
        type:'staleMilestone',
        level: m.ageDays >= (cfg.staleMilestoneDays + 7) ? 'high' : 'normal',
        title:`Stale milestone: ${String(m.ms?.title || 'Untitled Milestone')}`,
        meta:`No updates ~${m.ageDays}d • open ${m.open||0} • ${String(m.p?.name||'')}`,
        action:()=>phase11FocusMilestone_(m)
      });
    }
  }

  const seen = new Set();
  const rank = { urgent:3, high:2, normal:1 };
  return out.filter(n => !seen.has(n.id) && seen.add(n.id)).sort((a,b)=> (rank[b.level]-rank[a.level]) || String(a.title).localeCompare(String(b.title))).slice(0, 120);
}

function phase11PostRenderDashboard_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return;
  let host = document.querySelector('#phase11DashboardHost');
  if(!host){
    host = document.createElement('div');
    host.id = 'phase11DashboardHost';
    host.className = 'phase11-box';
    host.innerHTML = `
      <div class="phase11-title">Phase 11 Team Ops + SLA Aging</div>
      <div class="phase11-grid" id="phase11DashGrid">
        <div class="phase11-card" id="phase11SlaPanel"></div>
        <div class="phase11-card" id="phase11DashViewsPanel"></div>
      </div>
    `;
    tab.appendChild(host);
  }
  phase11RenderSlaPanel_();
  phase11RenderDashViewsPanel_();
}

function phase11RenderSlaPanel_(){
  const box = document.querySelector('#phase11SlaPanel');
  if(!box) return;
  const cfg = phase11LoadSlaCfg_();
  const sla = phase11CollectSlaAging_({ onlyActiveProject: !!phase11State_.scopeActiveOnly });
  const activeLabel = phase11State_.scopeActiveOnly ? (getActiveProject()?.name || 'Active project') : 'All projects';

  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">SLA Aging & Stale Update Alerts</div><div class="phase8-item__meta">Rules + stale monitoring (${escapeHtml(activeLabel)})</div></div>
    <div class="phase11-note" style="margin-top:6px">Stale means no recent task/thread activity for the configured number of days. Alerts feed into the Phase 8 Notifications Center.</div>
    <div class="phase11-toolbar" style="margin-top:8px">
      <label class="phase11-check"><span>Enabled</span><input type="checkbox" id="phase11SlaEnabled" ${cfg.enabled ? 'checked' : ''}></label>
      <label class="phase11-check"><span>Scope: Active Project</span><input type="checkbox" id="phase11SlaScope" ${phase11State_.scopeActiveOnly ? 'checked' : ''}></label>
      <button class="btn btn--ghost" type="button" id="phase11BtnSlaSave">Save Rules</button>
      <button class="btn btn--ghost" type="button" id="phase11BtnSlaRefresh">Refresh</button>
      <button class="btn btn--ghost" type="button" id="phase11BtnSlaOpenNotif">Notifications</button>
    </div>
    <div class="phase11-two">
      <div class="phase11-mini">
        <h4>Thresholds</h4>
        <div class="phase11-list">
          <label class="phase11-check"><span>Stale Task Days</span><input class="input phase11-inlineNum" id="phase11StaleTaskDays" type="number" min="1" max="365" value="${Number(cfg.staleTaskDays||5)}"></label>
          <label class="phase11-check"><span>Stale Blocker Days</span><input class="input phase11-inlineNum" id="phase11StaleBlockerDays" type="number" min="1" max="365" value="${Number(cfg.staleBlockerDays||2)}"></label>
          <label class="phase11-check"><span>Stale Milestone Days</span><input class="input phase11-inlineNum" id="phase11StaleMilestoneDays" type="number" min="1" max="365" value="${Number(cfg.staleMilestoneDays||7)}"></label>
          <label class="phase11-check"><span>Notif Max / Type</span><input class="input phase11-inlineNum" id="phase11NotifMaxPerType" type="number" min="1" max="20" value="${Number(cfg.notifMaxPerType||8)}"></label>
        </div>
      </div>
      <div class="phase11-mini">
        <h4>Notification Types</h4>
        <div class="phase11-list">
          <label class="phase11-check"><span>Stale Tasks</span><input type="checkbox" id="phase11AlertStaleTasks" ${cfg.alertStaleTasks ? 'checked' : ''}></label>
          <label class="phase11-check"><span>Stale Blockers</span><input type="checkbox" id="phase11AlertStaleBlockers" ${cfg.alertStaleBlockers ? 'checked' : ''}></label>
          <label class="phase11-check"><span>Stale Milestones</span><input type="checkbox" id="phase11AlertStaleMilestones" ${cfg.alertStaleMilestones ? 'checked' : ''}></label>
        </div>
      </div>
    </div>
    <div class="phase11-kv">
      <div><b>Open Tasks</b><span>${sla.openCount}</span></div>
      <div><b>Stale Tasks</b><span>${sla.staleTasks.length}</span></div>
      <div><b>Stale Blockers</b><span>${sla.staleBlockers.length}</span></div>
      <div><b>Stale Milestones</b><span>${sla.staleMilestones.length}</span></div>
    </div>
    <div class="phase11-two">
      <div class="phase11-mini" id="phase11SlaTopTasks"></div>
      <div class="phase11-mini" id="phase11SlaTopMilestones"></div>
    </div>
  `;

  const tasksBox = box.querySelector('#phase11SlaTopTasks');
  const msBox = box.querySelector('#phase11SlaTopMilestones');
  if(tasksBox){
    tasksBox.innerHTML = `<h4>Top stale tasks / blockers</h4><div class="phase11-list" id="phase11SlaTasksList"></div>`;
    const list = tasksBox.querySelector('#phase11SlaTasksList');
    const rows = [];
    const blockerIds = new Set((sla.staleBlockers || []).map(r => String(r.t?.id || '')));
    for(const r of (sla.staleBlockers || []).slice(0,5)) rows.push({ ...r, kind:'blocker' });
    for(const r of (sla.staleTasks || []).slice(0,8)) if(!blockerIds.has(String(r.t?.id || ''))) rows.push({ ...r, kind:'task' });
    if(!rows.length){ list.innerHTML = `<div class="phase8-empty">No stale task alerts with current thresholds.</div>`; }
    else rows.slice(0,8).forEach(r => {
      const e = r.e;
      const row = document.createElement('div');
      row.className = 'phase11-row';
      row.innerHTML = `
        <div>
          <div class="phase11-row__name">${escapeHtml(String(r.t?.title || 'Untitled Task'))}</div>
          <div class="phase11-row__meta">${escapeHtml(String(e?.p?.name || ''))} • ${escapeHtml(String(e?.ms?.title || ''))}${e?.t?.assignee ? ` • ${escapeHtml(String(e.t.assignee))}` : ''}</div>
        </div>
        <div class="phase11-tags">
          <span class="phase11-tag ${r.kind==='blocker'?'risk':'warn'}">${r.kind==='blocker' ? 'blocker' : 'task'}</span>
          <span class="phase11-tag warn">${r.ageDays}d stale</span>
          <button class="btn btn--ghost" type="button" data-open>Open</button>
        </div>
      `;
      row.querySelector('[data-open]')?.addEventListener('click', () => { if(typeof phase8FocusTask_ === 'function') phase8FocusTask_(e); else phase11FocusMilestone_(e); });
      list.appendChild(row);
    });
  }
  if(msBox){
    msBox.innerHTML = `<h4>Top stale milestones + aging buckets</h4><div class="phase11-list" id="phase11SlaMsList"></div>`;
    const list = msBox.querySelector('#phase11SlaMsList');
    const bucketRow = document.createElement('div');
    bucketRow.className = 'phase11-row';
    bucketRow.innerHTML = `
      <div>
        <div class="phase11-row__name">Open-task aging buckets</div>
        <div class="phase11-row__meta">Based on last task/thread activity time</div>
      </div>
      <div class="phase11-tags">
        <span class="phase11-tag ok">&lt;2d ${sla.bucket.lt2||0}</span>
        <span class="phase11-tag">2-4d ${sla.bucket.d2_4||0}</span>
        <span class="phase11-tag warn">5-9d ${sla.bucket.d5_9||0}</span>
        <span class="phase11-tag risk">10d+ ${sla.bucket.d10p||0}</span>
      </div>
    `;
    list.appendChild(bucketRow);
    if(!(sla.staleMilestones || []).length){
      const empty = document.createElement('div');
      empty.className = 'phase8-empty';
      empty.textContent = 'No stale milestones with current threshold.';
      list.appendChild(empty);
    } else {
      for(const m of sla.staleMilestones.slice(0,6)){
        const row = document.createElement('div');
        row.className = 'phase11-row';
        row.innerHTML = `
          <div>
            <div class="phase11-row__name">${escapeHtml(String(m.ms?.title || 'Untitled Milestone'))}</div>
            <div class="phase11-row__meta">${escapeHtml(String(m.p?.name || ''))} • open ${m.open||0}${m.blockerOpen ? ` • blockers ${m.blockerOpen}` : ''}</div>
          </div>
          <div class="phase11-tags">
            <span class="phase11-tag warn">${m.ageDays}d stale</span>
            <button class="btn btn--ghost" type="button" data-open>Open</button>
          </div>
        `;
        row.querySelector('[data-open]')?.addEventListener('click', () => phase11FocusMilestone_(m));
        list.appendChild(row);
      }
    }
  }

  box.querySelector('#phase11BtnSlaOpenNotif')?.addEventListener('click', () => {
    switchTab('dashboard');
    setTimeout(() => document.querySelector('#phase8NotificationsPanel')?.scrollIntoView({ behavior:'smooth', block:'start' }), 40);
  });
  box.querySelector('#phase11BtnSlaRefresh')?.addEventListener('click', () => {
    try{ if(typeof phase8RenderNotificationsPanel_ === 'function') phase8RenderNotificationsPanel_(); }catch{}
    phase11RenderSlaPanel_();
  });
  box.querySelector('#phase11SlaScope')?.addEventListener('change', (e) => { phase11State_.scopeActiveOnly = !!e.target.checked; phase11RenderSlaPanel_(); });
  box.querySelector('#phase11BtnSlaSave')?.addEventListener('click', () => {
    const next = phase11NormalizeSlaCfg_({
      enabled: !!box.querySelector('#phase11SlaEnabled')?.checked,
      alertStaleTasks: !!box.querySelector('#phase11AlertStaleTasks')?.checked,
      alertStaleBlockers: !!box.querySelector('#phase11AlertStaleBlockers')?.checked,
      alertStaleMilestones: !!box.querySelector('#phase11AlertStaleMilestones')?.checked,
      staleTaskDays: Number(box.querySelector('#phase11StaleTaskDays')?.value || cfg.staleTaskDays),
      staleBlockerDays: Number(box.querySelector('#phase11StaleBlockerDays')?.value || cfg.staleBlockerDays),
      staleMilestoneDays: Number(box.querySelector('#phase11StaleMilestoneDays')?.value || cfg.staleMilestoneDays),
      notifMaxPerType: Number(box.querySelector('#phase11NotifMaxPerType')?.value || cfg.notifMaxPerType),
    });
    phase11State_.slaCfg = next;
    phase11SaveSlaCfg_();
    addActivity(`Phase11 SLA rules updated (task ${next.staleTaskDays}d, blocker ${next.staleBlockerDays}d, milestone ${next.staleMilestoneDays}d)`);
    try{ if(typeof phase8RenderNotificationsPanel_ === 'function') phase8RenderNotificationsPanel_(); }catch{}
    phase11RenderSlaPanel_();
  });
}

function phase11RenderDashViewsPanel_(){
  const box = document.querySelector('#phase11DashViewsPanel');
  if(!box) return;
  const views = phase11LoadDashViews_().slice().sort((a,b)=> Number(b.updatedAt||0)-Number(a.updatedAt||0));
  const targets = phase11DashboardTargets_();
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Saved Dashboard Views</div><div class="phase8-item__meta">Jump presets for dashboard sections</div></div>
    <div class="phase11-note" style="margin-top:6px">Save named dashboard jump points (panel target + current scroll position). Useful for daily PM routines (SLA, Notifications, Health, Recovery, etc.).</div>
    <div class="phase11-toolbar" style="margin-top:8px">
      <input class="input" id="phase11DashViewName" type="text" placeholder="View name (e.g. Morning Ops)" />
      <select class="select" id="phase11DashViewTarget">
        <option value="">— Current scroll position only —</option>
        ${targets.map(t => `<option value="${escapeHtml(String(t.id))}">${escapeHtml(String(t.label))}</option>`).join('')}
      </select>
      <button class="btn btn--ghost" type="button" id="phase11BtnSaveDashView">Save Current View</button>
    </div>
    <div class="phase11-toolbar" style="margin-top:8px">
      <select class="select" id="phase11SavedDashViewsSelect">
        <option value="">— Select saved dashboard view —</option>
        ${views.map(v => `<option value="${escapeHtml(String(v.id))}">${escapeHtml(String(v.name))}${v.targetId ? ` • ${escapeHtml(String(v.targetId))}` : ''}</option>`).join('')}
      </select>
      <button class="btn btn--ghost" type="button" id="phase11BtnOpenDashView">Open Selected</button>
      <button class="btn btn--ghost" type="button" id="phase11BtnDeleteDashView">Delete Selected</button>
    </div>
    <div class="phase11-list" id="phase11DashViewsList"></div>
  `;

  const list = box.querySelector('#phase11DashViewsList');
  if(!views.length){
    list.innerHTML = `<div class="phase8-empty">No saved dashboard views yet. Save one for your daily PM workflow.</div>`;
  } else {
    for(const v of views.slice(0,12)){
      const row = document.createElement('div');
      row.className = 'phase11-row';
      const targetLabel = (targets.find(t => t.id === v.targetId)?.label) || (v.targetId ? v.targetId : 'Current scroll');
      row.innerHTML = `
        <div>
          <div class="phase11-row__name">${escapeHtml(String(v.name))}</div>
          <div class="phase11-row__meta">${escapeHtml(String(targetLabel))} • ${new Date(Number(v.updatedAt||v.createdAt||Date.now())).toLocaleString()}</div>
        </div>
        <div class="phase11-tags">
          ${v.targetId ? `<span class="phase11-tag">${escapeHtml(String(v.targetId))}</span>` : `<span class="phase11-tag ok">scroll</span>`}
          <button class="btn btn--ghost" type="button" data-open>Open</button>
          <button class="btn btn--ghost" type="button" data-del>Delete</button>
        </div>
      `;
      row.querySelector('[data-open]')?.addEventListener('click', ()=> phase11ApplyDashView_(v));
      row.querySelector('[data-del]')?.addEventListener('click', async ()=> {
        const okDelete = await pmConfirmDialog_(`Delete dashboard view "${v.name}"?`, { title:'Delete Dashboard View', okText:'Delete', danger:true });
        if(!okDelete) return;
        phase11State_.dashViews = phase11LoadDashViews_().filter(x => x.id !== v.id);
        phase11SaveDashViews_();
        addActivity(`Phase11 deleted dashboard view: ${v.name}`);
        phase11RenderDashViewsPanel_();
      });
      list.appendChild(row);
    }
  }

  box.querySelector('#phase11BtnSaveDashView')?.addEventListener('click', () => {
    const nameRaw = String(box.querySelector('#phase11DashViewName')?.value || '').trim();
    const targetId = String(box.querySelector('#phase11DashViewTarget')?.value || '');
    const name = nameRaw || (targetId ? `Dashboard • ${targetId}` : `Dashboard • ${new Date().toLocaleTimeString()}`);
    const viewsArr = phase11LoadDashViews_();
    const item = phase11NormalizeDashView_({ id: uid(), name, targetId, scrollY: Math.round(window.scrollY || 0), createdAt: Date.now(), updatedAt: Date.now() });
    viewsArr.unshift(item);
    phase11State_.dashViews = viewsArr.slice(0, 30);
    phase11SaveDashViews_();
    addActivity(`Phase11 saved dashboard view: ${item.name}`);
    phase11RenderDashViewsPanel_();
  });

  box.querySelector('#phase11BtnOpenDashView')?.addEventListener('click', () => {
    const id = String(box.querySelector('#phase11SavedDashViewsSelect')?.value || '');
    if(!id){ alert('Select a saved dashboard view first.'); return; }
    phase11ApplyDashView_(id);
  });
  box.querySelector('#phase11BtnDeleteDashView')?.addEventListener('click', async () => {
    const id = String(box.querySelector('#phase11SavedDashViewsSelect')?.value || '');
    if(!id){ alert('Select a saved dashboard view first.'); return; }
    const v = phase11LoadDashViews_().find(x => x.id === id);
    if(!v) return;
    const okDelete = await pmConfirmDialog_(`Delete dashboard view "${v.name}"?`, { title:'Delete Dashboard View', okText:'Delete', danger:true });
    if(!okDelete) return;
    phase11State_.dashViews = phase11LoadDashViews_().filter(x => x.id !== id);
    phase11SaveDashViews_();
    addActivity(`Phase11 deleted dashboard view: ${v.name}`);
    phase11RenderDashViewsPanel_();
  });
}

try{ initPhase11_(); }catch(err){ console.warn('Phase11 init failed', err); }


