/* ---------------------------
   Phase 17 — Portfolio / Multi-Project Command View
---------------------------- */
const PHASE17_PORTFOLIO_KEY = "stark_pm_phase17_portfolio_v1";
const phase17PortfolioState_ = {
  inited: false,
  renderWrapped: false,
  switchWrapped: false,
  bound: false,
  query: "",
  status: "all",
  sort: "risk",
};

function initPhase17Portfolio_(){
  if(phase17PortfolioState_.inited) return;
  phase17PortfolioState_.inited = true;
  try{ phase17PortfolioLoadUiState_(); }catch{}
  try{ phase17PortfolioEnsureStyles_(); }catch(err){ console.warn('Phase17 portfolio styles failed', err); }
  try{ phase17PortfolioEnsureTab_(); }catch(err){ console.warn('Phase17 portfolio tab failed', err); }
  try{ phase17PortfolioWrapRenderAll_(); }catch(err){ console.warn('Phase17 portfolio render wrap failed', err); }
  try{ phase17PortfolioWrapSwitchTab_(); }catch(err){ console.warn('Phase17 portfolio tab wrap failed', err); }
  try{ phase17PortfolioScheduleRender_(); }catch{}
}

function phase17PortfolioLoadUiState_(){
  let raw = {};
  try{ raw = JSON.parse(localStorage.getItem(PHASE17_PORTFOLIO_KEY) || '{}') || {}; }catch{ raw = {}; }
  if(!raw || typeof raw !== 'object') raw = {};
  phase17PortfolioState_.query = String(raw.query || '');
  phase17PortfolioState_.status = String(raw.status || 'all');
  phase17PortfolioState_.sort = String(raw.sort || 'risk');
}

function phase17PortfolioSaveUiState_(){
  try{
    localStorage.setItem(PHASE17_PORTFOLIO_KEY, JSON.stringify({
      query: String(phase17PortfolioState_.query || ''),
      status: String(phase17PortfolioState_.status || 'all'),
      sort: String(phase17PortfolioState_.sort || 'risk'),
    }));
  }catch{}
}

function phase17PortfolioEnsureStyles_(){
  if(document.querySelector('#phase17PortfolioStyles')) return;
  const style = document.createElement('style');
  style.id = 'phase17PortfolioStyles';
  style.textContent = `
    #tab-portfolio .phase17-portfolio-wrap{display:grid;gap:12px}
    #tab-portfolio .phase17-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
    #tab-portfolio .phase17-kpi{padding:10px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.015)}
    #tab-portfolio .phase17-kpi__label{font-size:11px;opacity:.72;letter-spacing:.06em;text-transform:uppercase}
    #tab-portfolio .phase17-kpi__value{margin-top:4px;font-size:20px;font-weight:700;line-height:1.1}
    #tab-portfolio .phase17-kpi__sub{margin-top:4px;font-size:11px;opacity:.72}
    #tab-portfolio .phase17-controls{display:grid;grid-template-columns:minmax(220px,1fr) auto auto auto;gap:8px;align-items:end}
    #tab-portfolio .phase17-controls .field{margin:0}
    #tab-portfolio .phase17-input,#tab-portfolio .phase17-select{width:100%;min-width:0}
    #tab-portfolio .phase17-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,.9fr);gap:12px;align-items:start}
    #tab-portfolio .phase17-list{display:grid;gap:8px;max-height:65vh;overflow:auto;padding-right:2px}
    #tab-portfolio .phase17-row{display:grid;grid-template-columns:minmax(170px,1.25fr) auto auto auto auto auto auto;gap:8px;align-items:center;padding:10px;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(255,255,255,.012)}
    #tab-portfolio .phase17-row.is-active{border-color:rgba(102,178,255,.28);box-shadow:0 0 0 1px rgba(102,178,255,.16) inset}
    #tab-portfolio .phase17-rowHead{display:flex;flex-direction:column;min-width:0}
    #tab-portfolio .phase17-rowTitle{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #tab-portfolio .phase17-rowMeta{font-size:11px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #tab-portfolio .phase17-rowStat{display:flex;flex-direction:column;align-items:flex-end;min-width:72px}
    #tab-portfolio .phase17-rowStat b{font-size:13px;line-height:1.1}
    #tab-portfolio .phase17-rowStat span{font-size:10px;opacity:.72;text-transform:uppercase;letter-spacing:.05em}
    #tab-portfolio .phase17-risk{font-weight:700}
    #tab-portfolio .phase17-risk.is-good{color:var(--ok)}
    #tab-portfolio .phase17-risk.is-mid{color:var(--warn)}
    #tab-portfolio .phase17-risk.is-bad{color:var(--danger)}
    #tab-portfolio .phase17-pillset{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
    #tab-portfolio .phase17-pill{font-size:10px;padding:3px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.02)}
    #tab-portfolio .phase17-bar{width:100%;height:6px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;margin-top:6px}
    #tab-portfolio .phase17-bar > i{display:block;height:100%;background:linear-gradient(90deg, rgba(102,178,255,.55), rgba(102,178,255,.95));width:0%}
    #tab-portfolio .phase17-sideCard{display:grid;gap:8px}
    #tab-portfolio .phase17-sideList{display:grid;gap:8px}
    #tab-portfolio .phase17-sideItem{padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.01)}
    #tab-portfolio .phase17-sideItemTitle{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #tab-portfolio .phase17-sideItemMeta{font-size:10px;opacity:.72;margin-top:3px}
    #tab-portfolio .phase17-sideItemRow{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:6px}
    #tab-portfolio .phase17-empty{padding:12px;border:1px dashed rgba(255,255,255,.12);border-radius:12px;font-size:12px;opacity:.8}
    #tab-portfolio .phase17-rowActions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
    #tab-portfolio .phase17-btn{white-space:nowrap}
    /* Milestone 3: portfolio rhythm alignment */
    #tab-portfolio .phase17-portfolio-wrap{gap:14px}
    #tab-portfolio .phase17-summary{gap:12px}
    #tab-portfolio .phase17-kpi{padding:12px;border-radius:14px}
    #tab-portfolio .phase17-kpi__label{font-size:10px;line-height:1.2}
    #tab-portfolio .phase17-kpi__value{margin-top:6px;font-size:18px;line-height:1.15}
    #tab-portfolio .phase17-kpi__sub{font-size:11px;line-height:1.35}
    #tab-portfolio .phase17-controls{gap:10px}
    #tab-portfolio .phase17-grid{gap:14px}
    #tab-portfolio .phase17-list{gap:10px}
    #tab-portfolio .phase17-row{gap:10px;padding:12px;border-radius:14px}
    #tab-portfolio .phase17-rowTitle{font-size:13px;line-height:1.25}
    #tab-portfolio .phase17-rowMeta{font-size:11px;line-height:1.35}
    #tab-portfolio .phase17-rowStat b{font-size:12px}
    #tab-portfolio .phase17-sideCard, #tab-portfolio .phase17-sideList{gap:10px}
    #tab-portfolio .phase17-sideItem{padding:10px;border-radius:12px}
    #tab-portfolio .phase17-sideItemMeta{font-size:11px;line-height:1.35}
    #tab-portfolio .phase17-btn{justify-self:flex-start}
    @media (max-width:1300px){ #tab-portfolio .phase17-row{grid-template-columns:minmax(170px,1.2fr) auto auto auto auto auto; } #tab-portfolio .phase17-rowActions{grid-column:1/-1;justify-content:flex-start;} }
    @media (max-width:1100px){ #tab-portfolio .phase17-summary{grid-template-columns:repeat(2,minmax(0,1fr));} #tab-portfolio .phase17-controls{grid-template-columns:1fr 1fr;align-items:end} #tab-portfolio .phase17-grid{grid-template-columns:1fr} #tab-portfolio .phase17-row{grid-template-columns:1fr 1fr;align-items:start} #tab-portfolio .phase17-rowStat{align-items:flex-start} #tab-portfolio .phase17-pillset{justify-content:flex-start} }
  `;
  document.head.appendChild(style);
}

function phase17PortfolioEnsureTab_(){
  const sidebarNav = document.querySelector('.nav');
  const coreCluster = sidebarNav && sidebarNav.querySelector('#navClusterCore');
  const workspaceCluster = sidebarNav && sidebarNav.querySelector('#navClusterWorkspace');
  const navHost = coreCluster || sidebarNav;
  const dashBtn = navHost && navHost.querySelector('.nav__item[data-tab="dashboard"]');
  const advBtn = sidebarNav && sidebarNav.querySelector('.nav__item[data-tab="advanced-panels"]');
  const dashboardTab = document.querySelector('#tab-dashboard');
  if(!navHost || !dashboardTab || !dashboardTab.parentElement) return;

  let navBtn = navHost.querySelector('.nav__item[data-tab="portfolio"]') || document.querySelector('.nav__item[data-tab="portfolio"]');
  if(!navBtn){
    navBtn = document.createElement('button');
    navBtn.type = 'button';
    navBtn.className = 'nav__item';
    navBtn.dataset.tab = 'portfolio';
    navBtn.innerHTML = '<span class="nav__icon">▤</span><span class="nav__text">Portfolio</span>';
    if(dashBtn && dashBtn.parentElement) dashBtn.insertAdjacentElement('afterend', navBtn);
    else navHost.appendChild(navBtn);
  }

  let panel = document.querySelector('#tab-portfolio');
  if(!panel){
    panel = document.createElement('section');
    panel.className = 'tab';
    panel.id = 'tab-portfolio';
    panel.dataset.tab = 'portfolio';
    panel.innerHTML = `
      <div class="tab__header">
        <div class="tab__title">Portfolio</div>
        <div class="tab__subtitle">Multi-project command view: health, risk, workload, and quick navigation across projects.</div>
      </div>
      <div id="phase17PortfolioRoot"></div>
    `;
    const advPanel = document.querySelector('#tab-advanced-panels');
    if(advPanel && advPanel.parentElement) advPanel.insertAdjacentElement('beforebegin', panel);
    else dashboardTab.insertAdjacentElement('afterend', panel);
  }

  if(ui && Array.isArray(ui.tabs) && !ui.tabs.some(x => x && x.dataset && x.dataset.tab === 'portfolio')){
    let insertIndex = ui.tabs.findIndex(x => x && x.dataset && x.dataset.tab === 'advanced-panels');
    if(insertIndex < 0) insertIndex = 1;
    ui.tabs.splice(insertIndex, 0, navBtn);
  }
  if(ui && Array.isArray(ui.tabPanels) && !ui.tabPanels.some(x => x && x.dataset && x.dataset.tab === 'portfolio')){
    let insertIndex = ui.tabPanels.findIndex(x => x && x.dataset && x.dataset.tab === 'advanced-panels');
    if(insertIndex < 0) insertIndex = 1;
    ui.tabPanels.splice(insertIndex, 0, panel);
  }

  if(!navBtn._phase17PortfolioBound){
    navBtn.addEventListener('click', ()=> switchTab('portfolio'));
    navBtn._phase17PortfolioBound = true;
  }

  if(!phase17PortfolioState_.bound){
    panel.addEventListener('input', (e)=> phase17PortfolioHandleUiInput_(e));
    panel.addEventListener('change', (e)=> phase17PortfolioHandleUiInput_(e));
    panel.addEventListener('click', (e)=> phase17PortfolioHandleClick_(e));
    phase17PortfolioState_.bound = true;
  }
}

function phase17PortfolioHandleUiInput_(e){
  const t = e && e.target;
  if(!t || !t.id) return;
  if(t.id === 'phase17PortfolioSearch') phase17PortfolioState_.query = String(t.value || '');
  if(t.id === 'phase17PortfolioStatus') phase17PortfolioState_.status = String(t.value || 'all');
  if(t.id === 'phase17PortfolioSort') phase17PortfolioState_.sort = String(t.value || 'risk');
  phase17PortfolioSaveUiState_();
  phase17PortfolioRender_();
}

function phase17PortfolioHandleClick_(e){
  const btn = e && e.target && e.target.closest ? e.target.closest('[data-phase17-action]') : null;
  if(!btn) return;
  const action = String(btn.getAttribute('data-phase17-action') || '');
  const projectId = String(btn.getAttribute('data-project-id') || '');
  if(!projectId) return;
  if(action === 'focus'){
    try{ setActiveProject(projectId); }catch{}
    try{ switchTab('dashboard'); }catch{}
    return;
  }
  if(action === 'open-project'){
    try{ setActiveProject(projectId); }catch{}
    try{ switchTab('projects'); }catch{}
    return;
  }
  if(action === 'open-checklist'){
    try{ setActiveProject(projectId); }catch{}
    try{ switchTab('checklist'); }catch{}
    return;
  }
}

function phase17PortfolioWrapRenderAll_(){
  if(phase17PortfolioState_.renderWrapped) return;
  if(typeof renderAll !== 'function') return;
  const _orig = renderAll;
  renderAll = function(){
    const r = _orig.apply(this, arguments);
    try{ phase17PortfolioRender_(); }catch{}
    return r;
  };
  phase17PortfolioState_.renderWrapped = true;
}

function phase17PortfolioWrapSwitchTab_(){
  if(phase17PortfolioState_.switchWrapped) return;
  if(typeof switchTab !== 'function') return;
  const _orig = switchTab;
  switchTab = function(tabId){
    const r = _orig.apply(this, arguments);
    if(String(tabId||'') === 'portfolio') setTimeout(()=>{ try{ phase17PortfolioRender_(); }catch{} }, 25);
    return r;
  };
  phase17PortfolioState_.switchWrapped = true;
}

function phase17PortfolioScheduleRender_(){
  setTimeout(()=>{ try{ phase17PortfolioEnsureTab_(); phase17PortfolioRender_(); }catch{} }, 40);
}

function phase17PortfolioFmtDate_(ts){
  const n = Number(ts || 0);
  if(!Number.isFinite(n) || n <= 0) return '—';
  try{ return new Date(n).toLocaleDateString([], { year:'numeric', month:'short', day:'2-digit' }); }catch{ return '—'; }
}

function phase17PortfolioRiskClass_(score){
  if(score >= 75) return 'is-good';
  if(score >= 45) return 'is-mid';
  return 'is-bad';
}

function phase17PortfolioRiskLabel_(score){
  if(score >= 75) return 'Healthy';
  if(score >= 45) return 'Watch';
  return 'At Risk';
}

function phase17PortfolioCollectRows_(){
  const now = Date.now();
  const rows = [];
  const upcomingTasks = [];
  for(const p of (Array.isArray(state?.projects) ? state.projects : [])){
    const mods = Array.isArray(p?.modules) ? p.modules : [];
    let modules = mods.length;
    let milestones = 0;
    let tasks = 0;
    let done = 0;
    let blockerOpen = 0;
    let highOpen = 0;
    let overdue = 0;
    let nextDueTs = 0;
    let nextDueTaskTitle = '';
    let nextMilestoneTitle = '';
    let assignees = new Set();

    for(const mod of mods){
      const msList = Array.isArray(mod?.milestones) ? mod.milestones : [];
      milestones += msList.length;
      for(const m of msList){
        const tsList = Array.isArray(m?.tasks) ? m.tasks : [];
        for(const t of tsList){
          if(!t) continue;
          tasks++;
          if(t.done) done++;
          const sev = String(t.severity || 'normal');
          if(!t.done && sev === 'blocker') blockerOpen++;
          if(!t.done && sev === 'high') highOpen++;
          if(String(t.assignee || '').trim()) assignees.add(String(t.assignee).trim().toLowerCase());
          const dueAt = Number(t.dueAt || 0);
          if(!t.done && Number.isFinite(dueAt) && dueAt > 0){
            if(dueAt < now) overdue++;
            if(!nextDueTs || dueAt < nextDueTs){
              nextDueTs = dueAt;
              nextDueTaskTitle = String(t.title || 'Untitled Task');
              nextMilestoneTitle = String(m.title || 'Milestone');
            }
            upcomingTasks.push({ p, m, t, dueAt });
          }
        }
      }
    }

    // fallback legacy model support
    if(!mods.length && Array.isArray(p?.milestones)){
      milestones = p.milestones.length;
      for(const m of p.milestones){
        const tsList = Array.isArray(m?.tasks) ? m.tasks : [];
        for(const t of tsList){
          if(!t) continue;
          tasks++;
          if(t.done) done++;
          const sev = String(t.severity || 'normal');
          if(!t.done && sev === 'blocker') blockerOpen++;
          if(!t.done && sev === 'high') highOpen++;
          if(String(t.assignee || '').trim()) assignees.add(String(t.assignee).trim().toLowerCase());
          const dueAt = Number(t.dueAt || 0);
          if(!t.done && Number.isFinite(dueAt) && dueAt > 0){
            if(dueAt < now) overdue++;
            if(!nextDueTs || dueAt < nextDueTs){
              nextDueTs = dueAt;
              nextDueTaskTitle = String(t.title || 'Untitled Task');
              nextMilestoneTitle = String(m.title || 'Milestone');
            }
            upcomingTasks.push({ p, m, t, dueAt });
          }
        }
      }
    }

    const pct = tasks ? (done / tasks) * 100 : 0;
    const status = String(p?.status || 'active');
    const archived = !!p?.archived;
    let risk = 100;
    risk -= Math.max(0, blockerOpen) * 22;
    risk -= Math.max(0, highOpen) * 8;
    risk -= Math.max(0, overdue) * 14;
    risk -= Math.round((100 - pct) * 0.35);
    if(status === 'paused') risk -= 8;
    if(status === 'done' && pct >= 99) risk = 98;
    risk = Math.max(0, Math.min(100, risk));

    rows.push({
      id: String(p.id || ''),
      name: String(p.name || 'Untitled Project'),
      tag: String(p.tag || ''),
      status,
      archived,
      modules,
      milestones,
      tasks,
      done,
      pct,
      blockerOpen,
      highOpen,
      overdue,
      risk,
      assigneeCount: assignees.size,
      nextDueTs,
      nextDueTaskTitle,
      nextMilestoneTitle,
      project: p,
    });
  }

  upcomingTasks.sort((a,b)=> a.dueAt - b.dueAt);
  return { rows, upcomingTasks };
}

function phase17PortfolioRender_(){
  const panel = document.querySelector('#tab-portfolio');
  const root = panel && panel.querySelector('#phase17PortfolioRoot');
  if(!panel || !root) return;

  const data = phase17PortfolioCollectRows_();
  let rows = data.rows.slice();
  const q = String(phase17PortfolioState_.query || '').trim().toLowerCase();
  const statusFilter = String(phase17PortfolioState_.status || 'all');
  const sortBy = String(phase17PortfolioState_.sort || 'risk');

  if(statusFilter !== 'all') rows = rows.filter(r => String(r.status) === statusFilter);
  if(q){
    rows = rows.filter(r => (`${r.name} ${r.tag} ${r.status}`).toLowerCase().includes(q));
  }

  rows.sort((a,b)=>{
    if(sortBy === 'name') return a.name.localeCompare(b.name);
    if(sortBy === 'progress') return (b.pct - a.pct) || a.name.localeCompare(b.name);
    if(sortBy === 'due'){
      const ax = a.nextDueTs || Number.MAX_SAFE_INTEGER;
      const bx = b.nextDueTs || Number.MAX_SAFE_INTEGER;
      return (ax - bx) || a.name.localeCompare(b.name);
    }
    if(sortBy === 'tasks') return (b.tasks - a.tasks) || a.name.localeCompare(b.name);
    // default risk: most risky first
    return (a.risk - b.risk) || (b.overdue - a.overdue) || a.name.localeCompare(b.name);
  });

  const total = data.rows.length;
  const activeCount = data.rows.filter(r => r.status === 'active' && !r.archived).length;
  const pausedCount = data.rows.filter(r => r.status === 'paused').length;
  const doneCount = data.rows.filter(r => r.status === 'done').length;
  const atRiskCount = data.rows.filter(r => r.risk < 45 && r.status !== 'done').length;
  const totalTasks = data.rows.reduce((n,r)=> n + r.tasks, 0);
  const totalDone = data.rows.reduce((n,r)=> n + r.done, 0);
  const totalOverdue = data.rows.reduce((n,r)=> n + r.overdue, 0);
  const totalBlockers = data.rows.reduce((n,r)=> n + r.blockerOpen, 0);
  const avgRisk = total ? Math.round(data.rows.reduce((n,r)=> n + r.risk, 0) / total) : 0;
  const avgProgress = totalTasks ? ((totalDone / totalTasks) * 100) : 0;
  const activeId = String(state?.activeProjectId || '');

  const riskQueue = data.rows
    .filter(r => r.status !== 'done')
    .slice()
    .sort((a,b)=> (a.risk - b.risk) || (b.overdue - a.overdue) || (b.blockerOpen - a.blockerOpen))
    .slice(0, 8);

  const dueQueue = data.upcomingTasks
    .filter(x => !x.t.done)
    .slice(0, 10);

  root.innerHTML = `
    <div class="phase17-portfolio-wrap">
      <div class="card">
        <div class="card__label">Portfolio Summary</div>
        <div class="phase17-summary">
          <div class="phase17-kpi">
            <div class="phase17-kpi__label">Projects</div>
            <div class="phase17-kpi__value">${escapeHtml(String(total))}</div>
            <div class="phase17-kpi__sub">${escapeHtml(String(activeCount))} active • ${escapeHtml(String(pausedCount))} paused • ${escapeHtml(String(doneCount))} done</div>
          </div>
          <div class="phase17-kpi">
            <div class="phase17-kpi__label">Portfolio Progress</div>
            <div class="phase17-kpi__value">${escapeHtml(fmtPct(avgProgress))}</div>
            <div class="phase17-kpi__sub">${escapeHtml(String(totalDone))} / ${escapeHtml(String(totalTasks))} tasks complete</div>
          </div>
          <div class="phase17-kpi">
            <div class="phase17-kpi__label">At Risk</div>
            <div class="phase17-kpi__value">${escapeHtml(String(atRiskCount))}</div>
            <div class="phase17-kpi__sub">${escapeHtml(String(totalBlockers))} blocker task(s) open</div>
          </div>
          <div class="phase17-kpi">
            <div class="phase17-kpi__label">Overdue Tasks</div>
            <div class="phase17-kpi__value">${escapeHtml(String(totalOverdue))}</div>
            <div class="phase17-kpi__sub">Across all visible projects</div>
          </div>
          <div class="phase17-kpi">
            <div class="phase17-kpi__label">Avg Health</div>
            <div class="phase17-kpi__value phase17-risk ${phase17PortfolioRiskClass_(avgRisk)}">${escapeHtml(String(avgRisk))}</div>
            <div class="phase17-kpi__sub">${escapeHtml(phase17PortfolioRiskLabel_(avgRisk))} portfolio signal</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__top">
          <div>
            <div class="card__label">Command Filters</div>
            <div class="card__hint">Search and sort the portfolio table, then jump into a project workflow.</div>
          </div>
        </div>
        <div class="phase17-controls">
          <label class="field">
            <span class="field__label">Search</span>
            <input id="phase17PortfolioSearch" class="input phase17-input" type="search" placeholder="Search project, tag, status..." value="${escapeHtml(String(phase17PortfolioState_.query || ''))}" />
          </label>
          <label class="field">
            <span class="field__label">Status</span>
            <select id="phase17PortfolioStatus" class="select phase17-select">
              <option value="all" ${statusFilter==='all'?'selected':''}>All</option>
              <option value="active" ${statusFilter==='active'?'selected':''}>Active</option>
              <option value="paused" ${statusFilter==='paused'?'selected':''}>Paused</option>
              <option value="done" ${statusFilter==='done'?'selected':''}>Done</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">Sort</span>
            <select id="phase17PortfolioSort" class="select phase17-select">
              <option value="risk" ${sortBy==='risk'?'selected':''}>Risk (worst first)</option>
              <option value="due" ${sortBy==='due'?'selected':''}>Next due date</option>
              <option value="progress" ${sortBy==='progress'?'selected':''}>Progress %</option>
              <option value="tasks" ${sortBy==='tasks'?'selected':''}>Task count</option>
              <option value="name" ${sortBy==='name'?'selected':''}>Project name</option>
            </select>
          </label>
          <div class="row row--actions" style="justify-content:flex-end;gap:6px">
            <button type="button" class="btn btn--ghost" id="phase17PortfolioClearFilters">Clear Filters</button>
          </div>
        </div>
      </div>

      <div class="phase17-grid">
        <div class="card">
          <div class="card__top">
            <div>
              <div class="card__label">Project Command Grid</div>
              <div class="card__hint">Health, progress, overdue load, and quick actions per project.</div>
            </div>
            <div class="badge">${escapeHtml(String(rows.length))} visible</div>
          </div>
          <div class="phase17-list">
            ${rows.length ? rows.map(r => {
              const pct = Math.max(0, Math.min(100, r.pct || 0));
              const riskClass = phase17PortfolioRiskClass_(r.risk);
              const riskLabel = phase17PortfolioRiskLabel_(r.risk);
              const statusBadge = String(r.status || 'active').toUpperCase();
              return `
                <div class="phase17-row ${activeId === r.id ? 'is-active' : ''}" data-project-id="${escapeHtml(r.id)}">
                  <div class="phase17-rowHead">
                    <div class="phase17-rowTitle">${escapeHtml(r.name)}</div>
                    <div class="phase17-rowMeta">${r.tag ? escapeHtml(r.tag) + ' • ' : ''}${escapeHtml(statusBadge)}${r.archived ? ' • ARCHIVED' : ''}</div>
                    <div class="phase17-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
                  </div>
                  <div class="phase17-rowStat"><b>${escapeHtml(fmtPct(pct))}</b><span>Progress</span></div>
                  <div class="phase17-rowStat"><b>${escapeHtml(String(r.done))}/${escapeHtml(String(r.tasks))}</b><span>Tasks</span></div>
                  <div class="phase17-rowStat"><b>${escapeHtml(String(r.modules))}/${escapeHtml(String(r.milestones))}</b><span>Mod/MS</span></div>
                  <div class="phase17-rowStat"><b>${escapeHtml(String(r.overdue))}</b><span>Overdue</span></div>
                  <div class="phase17-rowStat"><b class="phase17-risk ${riskClass}">${escapeHtml(String(r.risk))}</b><span>${escapeHtml(riskLabel)}</span></div>
                  <div>
                    <div class="phase17-pillset">
                      <span class="phase17-pill">Blocker ${escapeHtml(String(r.blockerOpen))}</span>
                      <span class="phase17-pill">High ${escapeHtml(String(r.highOpen))}</span>
                      <span class="phase17-pill">Team ${escapeHtml(String(r.assigneeCount))}</span>
                      <span class="phase17-pill">Next Due ${escapeHtml(phase17PortfolioFmtDate_(r.nextDueTs))}</span>
                    </div>
                    <div class="phase17-rowActions" style="margin-top:6px">
                      <button type="button" class="btn btn--ghost btn--compact phase17-btn" data-phase17-action="focus" data-project-id="${escapeHtml(r.id)}">Focus Dashboard</button>
                      <button type="button" class="btn btn--ghost btn--compact phase17-btn" data-phase17-action="open-project" data-project-id="${escapeHtml(r.id)}">Open Project</button>
                      <button type="button" class="btn btn--ghost btn--compact phase17-btn" data-phase17-action="open-checklist" data-project-id="${escapeHtml(r.id)}">Open Checklist</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('') : `<div class="phase17-empty">No projects match your current filters. Try clearing filters or create/import a project.</div>`}
          </div>
        </div>

        <div class="phase17-sideCard">
          <div class="card">
            <div class="card__label">Risk Queue</div>
            <div class="phase17-sideList">
              ${riskQueue.length ? riskQueue.map(r => `
                <div class="phase17-sideItem">
                  <div class="phase17-sideItemTitle">${escapeHtml(r.name)}</div>
                  <div class="phase17-sideItemMeta">${escapeHtml(String(r.status || 'active').toUpperCase())} • ${escapeHtml(fmtPct(r.pct || 0))} complete</div>
                  <div class="phase17-sideItemRow">
                    <div class="phase17-pillset" style="justify-content:flex-start">
                      <span class="phase17-pill">Overdue ${escapeHtml(String(r.overdue))}</span>
                      <span class="phase17-pill">Blocker ${escapeHtml(String(r.blockerOpen))}</span>
                    </div>
                    <button type="button" class="btn btn--ghost btn--compact phase17-btn" data-phase17-action="open-project" data-project-id="${escapeHtml(r.id)}">Open</button>
                  </div>
                </div>
              `).join('') : `<div class="phase17-empty">Risk queue is clear. Add more projects/tasks or due dates to surface risk signals.</div>`}
            </div>
          </div>

          <div class="card">
            <div class="card__label">Upcoming Due Tasks</div>
            <div class="phase17-sideList">
              ${dueQueue.length ? dueQueue.map(x => `
                <div class="phase17-sideItem">
                  <div class="phase17-sideItemTitle">${escapeHtml(String(x.t?.title || 'Untitled Task'))}</div>
                  <div class="phase17-sideItemMeta">${escapeHtml(String(x.p?.name || 'Project'))} • ${escapeHtml(String(x.m?.title || 'Milestone'))}</div>
                  <div class="phase17-sideItemRow">
                    <span class="badge">${escapeHtml(phase17PortfolioFmtDate_(x.dueAt))}</span>
                    <button type="button" class="btn btn--ghost btn--compact phase17-btn" data-phase17-action="open-checklist" data-project-id="${escapeHtml(String(x.p?.id || ''))}">Open</button>
                  </div>
                </div>
              `).join('') : `<div class="phase17-empty">No due dates detected yet. Use task due dates to enable timeline visibility here.</div>`}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const clearBtn = root.querySelector('#phase17PortfolioClearFilters');
  if(clearBtn && !clearBtn._phase17Bound){
    clearBtn.addEventListener('click', ()=>{
      phase17PortfolioState_.query = '';
      phase17PortfolioState_.status = 'all';
      phase17PortfolioState_.sort = 'risk';
      phase17PortfolioSaveUiState_();
      phase17PortfolioRender_();
    });
    clearBtn._phase17Bound = true;
  }
}

try{ initPhase17Portfolio_(); }catch(err){ console.warn('Phase17 portfolio init failed', err); }

