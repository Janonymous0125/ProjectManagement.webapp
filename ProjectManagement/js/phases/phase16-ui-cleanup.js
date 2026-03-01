/* ---------------------------
   Phase 16 UI Cleanup + Panel Grouping + Performance Trim (Polish Patch)
   - Groups dashboard phase panels into collapsible sections
   - Reparents Phase 16 Team panel out of base Completion card
   - Adds content-visibility / containment hints for heavy phase panels
   - Schedules cleanup in rAF to avoid repeated layout thrash
---------------------------- */
var PHASE16_POLISH_KEY = 'stark_pm_phase16_ui_polish_v1';
var phase16PolishState_ = { inited:false, raf:0, bound:false };

function initPhase16Polish_(){
  if(phase16PolishState_.inited) return;
  phase16PolishState_.inited = true;
  try{ phase16PolishEnsureStyles_(); }catch(err){ console.warn('Phase16 polish styles failed', err); }
  try{ phase16PolishEnsureWorkspaceTab_(); }catch(err){ console.warn('Phase16 polish workspace tab failed', err); }
  try{ phase16PolishWrapRenderDashboard_(); }catch(err){ console.warn('Phase16 polish wrap render failed', err); }
  try{ phase16PolishWrapSwitchTab_(); }catch(err){ console.warn('Phase16 polish wrap tab failed', err); }
  try{ phase16PolishSchedule_(); }catch{}
}

function phase16PolishEnsureWorkspaceTab_(){
  const sidebarNav = document.querySelector('.nav');
  const dashNavBtn = sidebarNav && sidebarNav.querySelector('.nav__item[data-tab="dashboard"]');
  const dashboardTab = document.querySelector('#tab-dashboard');
  if(!sidebarNav || !dashboardTab || !dashboardTab.parentElement) return;

  let navBtn = sidebarNav.querySelector('.nav__item[data-tab="advanced-panels"]');
  if(!navBtn){
    navBtn = document.createElement('button');
    navBtn.className = 'nav__item';
    navBtn.type = 'button';
    navBtn.dataset.tab = 'advanced-panels';
    navBtn.innerHTML = '<span class="nav__icon">▦</span><span class="nav__text">Advanced Panels</span>';
    if(dashNavBtn && dashNavBtn.parentElement) dashNavBtn.insertAdjacentElement('afterend', navBtn);
    else sidebarNav.appendChild(navBtn);
  }

  let panel = document.querySelector('#tab-advanced-panels');
  if(!panel){
    panel = document.createElement('section');
    panel.className = 'tab';
    panel.id = 'tab-advanced-panels';
    panel.dataset.tab = 'advanced-panels';
    panel.innerHTML = `
      <div class="tab__header">
        <div class="tab__title">Advanced Panels</div>
        <div class="tab__subtitle">Dedicated workspace for grouped phase panels moved out of Dashboard for cleaner navigation.</div>
      </div>
    `;
    dashboardTab.insertAdjacentElement('afterend', panel);
  }

  if(ui && Array.isArray(ui.tabs) && !ui.tabs.some(x => x && x.dataset && x.dataset.tab === 'advanced-panels')) ui.tabs.splice(1, 0, navBtn);
  if(ui && Array.isArray(ui.tabPanels) && !ui.tabPanels.some(x => x && x.dataset && x.dataset.tab === 'advanced-panels')) ui.tabPanels.splice(1, 0, panel);

  if(!navBtn._phase16PolishBound){
    navBtn.addEventListener('click', () => {
      switchTab('advanced-panels');
      setTimeout(()=>{ try{ phase16PolishSchedule_(); }catch{} }, 20);
    });
    navBtn._phase16PolishBound = true;
  }

  try{ phase16PolishEnsureSidebarNavDropdown_(navBtn); }catch(err){ console.warn('Phase16 polish sidebar dropdown failed', err); }
  try{ phase16PolishRenderSidebarNavDropdown_(); }catch{}
}

function phase16PolishEnsureStyles_(){
  if(document.querySelector('#phase16PolishStyles')) return;
  const st = document.createElement('style');
  st.id = 'phase16PolishStyles';
  st.textContent = `
    #phase16PolishDashRoot{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    #phase16PolishDashRoot .phase16polish-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
    #phase16PolishDashRoot .phase16polish-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9}
    #phase16PolishDashRoot .phase16polish-sub{font-size:11px;opacity:.78}
    #phase16PolishDashRoot .phase16polish-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    #phase16PolishDashRoot details.phase16polish-group{border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(255,255,255,.012);overflow:hidden}
    #phase16PolishDashRoot details.phase16polish-group > summary{cursor:pointer;list-style:none;padding:10px 12px;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(255,255,255,.01)}
    #phase16PolishDashRoot details.phase16polish-group > summary::-webkit-details-marker{display:none}
    #phase16PolishDashRoot .phase16polish-badge{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:1px 7px;font-size:10px;opacity:.9}
    #phase16PolishDashRoot .phase16polish-body{padding:10px;display:grid;gap:10px}
    #phase16PolishDashRoot .phase16polish-body > *{margin-top:0 !important}
    #phase16PolishDashRoot .phase16polish-body > .card{background:rgba(255,255,255,.01)}
    #phase16PolishDashRoot .phase16polish-body > .phase10-box,
    #phase16PolishDashRoot .phase16polish-body > .phase11-box,
    #phase16PolishDashRoot .phase16polish-body > .phase12-box,
    #phase16PolishDashRoot .phase16polish-body > .phase13-box,
    #phase16PolishDashRoot .phase16polish-body > .phase14-box,
    #phase16PolishDashRoot .phase16polish-body > .phase15-box,
    #phase16PolishDashRoot .phase16polish-body > .phase16-box,
    #phase16PolishDashRoot .phase16polish-body > .phase8-box,
    #phase16PolishDashRoot .phase16polish-body > .phase9-box,
    #phase16PolishDashRoot .phase16polish-body > .card{
      content-visibility:auto;
      contain:layout style paint;
      contain-intrinsic-size: 380px;
    }
    #phase16PolishDashRoot .phase16polish-body .phase10-grid,
    #phase16PolishDashRoot .phase16polish-body .phase11-grid,
    #phase16PolishDashRoot .phase16polish-body .phase12-grid,
    #phase16PolishDashRoot .phase16polish-body .phase13-grid{grid-template-columns:1fr}
    #phase16PolishDashRoot .phase16polish-body .phase16-grid{grid-template-columns:1fr}
    #phase16PolishDashRoot .phase16polish-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    #phase16PolishDashRoot .phase16polish-catalog{margin:0 0 10px;padding:10px;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(255,255,255,.012)}
    #phase16PolishDashRoot .phase16polish-catalogHead{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
    #phase16PolishDashRoot .phase16polish-catalogTitle{font-size:12px;font-weight:700}
    #phase16PolishDashRoot .phase16polish-catalogSub{font-size:11px;opacity:.75}
    #phase16PolishDashRoot .phase16polish-catalogTools{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
    #phase16PolishDashRoot .phase16polish-catalogSelect,
    #phase16PolishDashRoot .phase16polish-catalogJump{min-width:180px;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit}
    #phase16PolishDashRoot .phase16polish-catalogSearch{min-width:260px;max-width:420px;width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit}
    #phase16PolishDashRoot .phase16polish-catalogJumpWrap{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
    #phase16PolishDashRoot .phase16polish-catalogJump{min-width:300px;max-width:100%;flex:1 1 320px}
    #phase16PolishDashRoot .phase16polish-catalogHint{font-size:10px;opacity:.72;margin:0 0 8px}
    #phase16DashboardFocusCard{margin-top:10px}
    #phase16DashboardFocusCard .phase16polish-focusWrap{display:grid;gap:10px}
    #phase16DashboardFocusCard .phase16polish-focusTop{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}
    #phase16DashboardFocusCard .phase16polish-focusTitle{font-weight:700;font-size:13px}
    #phase16DashboardFocusCard .phase16polish-focusMeta{font-size:11px;opacity:.75;line-height:1.45}
    #phase16DashboardFocusCard .phase16polish-focusActions{display:flex;gap:6px;flex-wrap:wrap}
    #phase16DashboardFocusCard .phase16polish-focusStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
    #phase16DashboardFocusCard .phase16polish-focusStat{padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.012)}
    #phase16DashboardFocusCard .phase16polish-focusStat b{display:block;font-size:14px;line-height:1.1}
    #phase16DashboardFocusCard .phase16polish-focusStat span{display:block;margin-top:3px;font-size:10px;opacity:.72;text-transform:uppercase;letter-spacing:.05em}
    #phase16DashboardFocusCard .phase16polish-focusHint{font-size:11px;opacity:.78}
    #phase16DashboardFocusCard .phase16polish-hidden{display:none !important}
    @media (max-width:1100px){ #phase16DashboardFocusCard .phase16polish-focusStats{grid-template-columns:repeat(2,minmax(0,1fr));} }
    /* Milestone 3: visual rhythm + typography normalization (Dashboard/Advanced/Portfolio) */
    #tab-dashboard .card, #tab-advanced-panels .card, #tab-portfolio .card{padding:14px;border-radius:14px}
    #tab-dashboard .card__top, #tab-advanced-panels .card__top, #tab-portfolio .card__top{gap:8px;margin-bottom:8px}
    #tab-dashboard .card__label, #tab-advanced-panels .card__label, #tab-portfolio .card__label{font-size:11px;line-height:1.2;letter-spacing:.12em;margin-bottom:8px}
    #tab-dashboard .card__title, #tab-advanced-panels .card__title, #tab-portfolio .card__title{font-size:13px;line-height:1.25;margin:4px 0 8px}
    #tab-dashboard .card__hint, #tab-advanced-panels .card__hint, #tab-portfolio .card__hint{font-size:11px;line-height:1.35}
    #tab-dashboard .card__meta, #tab-advanced-panels .card__meta, #tab-portfolio .card__meta{font-size:11px;line-height:1.45}
    #tab-dashboard .card__actions, #tab-advanced-panels .card__actions, #tab-portfolio .card__actions{gap:8px;margin-top:10px;flex-wrap:wrap}
    #tab-dashboard .grid, #tab-advanced-panels .grid{gap:12px}
    #tab-dashboard .list, #tab-advanced-panels .list{gap:8px}
    #phase16PolishDashRoot .phase16polish-head{gap:10px;margin-bottom:10px}
    #phase16PolishDashRoot .phase16polish-sub{line-height:1.4}
    #phase16PolishDashRoot details.phase16polish-group > summary{padding:12px;font-size:12px;line-height:1.2}
    #phase16PolishDashRoot .phase16polish-body{padding:12px;gap:12px}
    #phase16PolishDashRoot .phase16polish-catalog{padding:12px}
    #phase16PolishDashRoot .phase16polish-catalogHead{margin-bottom:10px}
    /* Sidebar nav dropdown (requested) */
    .nav .phase16polish-navDropdown{display:grid;gap:6px;padding:8px 10px;margin:-2px 0 4px 0;border-radius:12px;border:1px solid rgba(56,246,255,.10);background:rgba(10,18,28,.16)}
    .nav .phase16polish-navDropdown.is-hidden{display:none}
    .nav .phase16polish-navDropdownLabel{font-size:10px;letter-spacing:.08em;text-transform:uppercase;opacity:.75}
    .nav .phase16polish-navDropdownSelect{width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(56,246,255,.12);background:rgba(10,18,28,.35);color:inherit;font-family:var(--mono);font-size:11px}
    .nav .phase16polish-navDropdown .btn{width:100%}
    .nav .phase16polish-navDropdownHint{font-size:10px;opacity:.7;line-height:1.35}
    /* Revert tab-level dropdown controls (moved to sidebar nav) */
    #phase16PolishDashRoot #phase16PolishCatalogCategory,
    #phase16PolishDashRoot .phase16polish-catalogJumpWrap,
    #phase16PolishDashRoot #phase16PolishCatalogJumpHint{display:none !important}
    #phase16PolishDashRoot .phase16polish-favs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}
    #phase16PolishDashRoot .phase16polish-favs:empty{display:none}
    #phase16PolishDashRoot .phase16polish-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.02);font-size:11px}
    #phase16PolishDashRoot .phase16polish-catalogList{display:grid;gap:6px;max-height:280px;overflow:auto;padding-right:2px}
    #phase16PolishDashRoot .phase16polish-catalogRow{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.05);border-radius:10px;background:rgba(255,255,255,.01)}
    #phase16PolishDashRoot .phase16polish-catalogStar{width:28px;height:28px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.02);color:inherit;cursor:pointer}
    #phase16PolishDashRoot .phase16polish-catalogStar.is-on{border-color:rgba(255,214,64,.45)}
    #phase16PolishDashRoot .phase16polish-catalogMain{min-width:0}
    #phase16PolishDashRoot .phase16polish-catalogName{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #phase16PolishDashRoot .phase16polish-catalogMeta{font-size:10px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #phase16PolishDashRoot .phase16polish-catalogEmpty{font-size:11px;opacity:.72;padding:6px 2px}
    #phase16PolishDashRoot .phase16polish-targetflash{animation:phase16PolishFlash 1200ms ease}
    @keyframes phase16PolishFlash{0%{box-shadow:0 0 0 0 rgba(102,178,255,.0)}25%{box-shadow:0 0 0 2px rgba(102,178,255,.45)}100%{box-shadow:0 0 0 0 rgba(102,178,255,.0)}}
    @media (max-width:1100px){ #phase16PolishDashRoot .phase16polish-grid{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase16PolishWrapRenderDashboard_(){
  if(typeof renderDashboard !== 'function' || renderDashboard._phase16PolishWrapped) return;
  const _orig = renderDashboard;
  renderDashboard = function(){
    const r = _orig.apply(this, arguments);
    try{ phase16PolishSchedule_(); }catch{}
    return r;
  };
  renderDashboard._phase16PolishWrapped = true;
}

function phase16PolishWrapSwitchTab_(){
  if(typeof switchTab !== 'function' || switchTab._phase16PolishWrapped) return;
  const _orig = switchTab;
  switchTab = function(tabId){
    const r = _orig.apply(this, arguments);
    if(['dashboard','advanced-panels'].includes(String(tabId||''))) setTimeout(()=>{ try{ phase16PolishSchedule_(); }catch{} }, 20);
    return r;
  };
  switchTab._phase16PolishWrapped = true;
}

function phase16PolishSchedule_(){
  if(typeof requestAnimationFrame !== 'function') return phase16PolishApplyDashboardCleanup_();
  if(phase16PolishState_.raf){ try{ cancelAnimationFrame(phase16PolishState_.raf); }catch{} }
  phase16PolishState_.raf = requestAnimationFrame(()=>{
    phase16PolishState_.raf = 0;
    try{ phase16PolishApplyDashboardCleanup_(); }catch(err){ console.warn('Phase16 polish cleanup failed', err); }
  });
}

function phase16PolishLoadPrefs_(){
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE16_POLISH_KEY) || '{}') || {}; }catch{ raw = {}; }
  if(!raw || typeof raw !== 'object') raw = {};
  if(!raw.catalogFavorites || typeof raw.catalogFavorites !== 'object') raw.catalogFavorites = {};
  return raw;
}
function phase16PolishSavePrefs_(prefs){
  try{ localStorage.setItem(PHASE16_POLISH_KEY, JSON.stringify(prefs || {})); }catch{}
}
function phase16PolishPersistDetails_(root){
  if(!root || root._phase16PolishBound) return;
  root._phase16PolishBound = true;
  root.addEventListener('toggle', (e)=>{
    const d = e.target;
    if(!(d && d.matches && d.matches('details.phase16polish-group[data-key]'))) return;
    const prefs = phase16PolishLoadPrefs_();
    prefs[d.dataset.key] = !!d.open;
    phase16PolishSavePrefs_(prefs);
    const badge = d.querySelector('.phase16polish-badge');
    const body = d.querySelector('.phase16polish-body');
    if(badge && body) badge.textContent = String(body.children.length || 0);
  }, true);
}


function phase16PolishGetCatalogItems_(root){
  if(!root) return [];
  const out = [];
  root.querySelectorAll('details.phase16polish-group').forEach(group => {
    const body = group.querySelector('.phase16polish-body');
    if(!body) return;
    const groupLabel = (group.querySelector('summary > span')?.textContent || group.dataset.key || 'Group').trim();
    Array.from(body.children || []).forEach((el, idx) => {
      if(!el || !el.id) return;
      const rawTitle = (
        el.getAttribute('data-panel-title') ||
        el.querySelector('.card__title, .phase16-title, .phase15-title, .phase14-title, .phase13-title, .phase12-title, .phase11-title, .phase10-title, .phase9-title, .phase8-title, h2, h3, h4, .item__title')?.textContent ||
        el.getAttribute('aria-label') ||
        el.id
      );
      const title = String(rawTitle || el.id).replace(/\s+/g,' ').trim();
      out.push({ id: el.id, title, groupKey: String(group.dataset.key || ''), groupLabel, index: idx, el });
    });
  });
  return out;
}


function phase16PolishEnsureSidebarNavDropdown_(navBtn){
  if(!navBtn || !navBtn.parentElement) return null;
  let wrap = navBtn.parentElement.querySelector('#phase16PolishSidebarNavDropdown');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'phase16PolishSidebarNavDropdown';
    wrap.className = 'phase16polish-navDropdown is-hidden';
    wrap.innerHTML = `
      <div class="phase16polish-navDropdownLabel">Advanced Panel Dropdown</div>
      <select id="phase16PolishSidebarNavSelect" class="phase16polish-navDropdownSelect" title="Advanced panel navigation">
        <option value="">Loading advanced panels…</option>
      </select>
      <button class="btn btn--ghost" type="button" id="phase16PolishSidebarNavOpen">Open Selected Panel</button>
      <div class="phase16polish-navDropdownHint" id="phase16PolishSidebarNavHint">Categorized dropdown from the Advanced Panels workspace.</div>
    `;
    navBtn.insertAdjacentElement('afterend', wrap);
  }
  if(!wrap._phase16PolishSidebarBound){
    const sel = wrap.querySelector('#phase16PolishSidebarNavSelect');
    const btn = wrap.querySelector('#phase16PolishSidebarNavOpen');
    const openSelected = ()=>{
      const panelId = String(sel?.value || '');
      if(!panelId) return;
      const root = document.querySelector('#phase16PolishDashRoot');
      if(root){
        try{ phase16PolishOpenCatalogItem_(root, panelId); }catch{}
      }else{
        try{ switchTab('advanced-panels'); }catch{}
        setTimeout(()=>{ try{ phase16PolishSchedule_(); }catch{} }, 30);
      }
    };
    sel?.addEventListener('change', openSelected);
    btn?.addEventListener('click', openSelected);
    wrap._phase16PolishSidebarBound = true;
  }
  return wrap;
}

function phase16PolishRenderSidebarNavDropdown_(){
  const wrap = document.querySelector('#phase16PolishSidebarNavDropdown');
  if(wrap) wrap.remove();
}

function phase16PolishBindCatalog_(root){
  if(!root || root._phase16PolishCatalogBound) return;
  root._phase16PolishCatalogBound = true;
  const searchEl = root.querySelector('#phase16PolishCatalogSearch');
  const clearBtn = root.querySelector('#phase16PolishCatalogClear');
  const categoryEl = root.querySelector('#phase16PolishCatalogCategory');
  const jumpEl = root.querySelector('#phase16PolishCatalogJump');
  const openSelectedBtn = root.querySelector('#phase16PolishCatalogOpenSelected');
  if(searchEl){
    searchEl.addEventListener('input', ()=>{ try{ phase16PolishRenderCatalog_(root); }catch{} });
    searchEl.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape'){
        searchEl.value = '';
        try{ phase16PolishRenderCatalog_(root); }catch{}
      }
    });
  }
  clearBtn?.addEventListener('click', ()=>{
    if(searchEl) searchEl.value = '';
    try{ phase16PolishRenderCatalog_(root); }catch{}
  });
  categoryEl?.addEventListener('change', ()=>{ try{ phase16PolishRenderCatalog_(root); }catch{} });
  openSelectedBtn?.addEventListener('click', ()=>{
    const panelId = String(jumpEl?.value || '');
    if(panelId) try{ phase16PolishOpenCatalogItem_(root, panelId); }catch{}
  });
  jumpEl?.addEventListener('change', ()=>{
    const panelId = String(jumpEl.value || '');
    if(panelId) try{ phase16PolishOpenCatalogItem_(root, panelId); }catch{}
  });
  root.addEventListener('click', (e)=>{
    const favBtn = e.target && e.target.closest ? e.target.closest('[data-phase16-fav]') : null;
    if(favBtn){
      const panelId = String(favBtn.getAttribute('data-phase16-fav') || '');
      if(!panelId) return;
      const prefs = phase16PolishLoadPrefs_();
      prefs.catalogFavorites = prefs.catalogFavorites || {};
      if(prefs.catalogFavorites[panelId]) delete prefs.catalogFavorites[panelId];
      else prefs.catalogFavorites[panelId] = 1;
      phase16PolishSavePrefs_(prefs);
      try{ phase16PolishRenderCatalog_(root); }catch{}
      return;
    }
    const openBtn = e.target && e.target.closest ? e.target.closest('[data-phase16-open]') : null;
    if(openBtn){
      const panelId = String(openBtn.getAttribute('data-phase16-open') || '');
      if(panelId) try{ phase16PolishOpenCatalogItem_(root, panelId); }catch{}
      return;
    }
    const chipBtn = e.target && e.target.closest ? e.target.closest('[data-phase16-openchip]') : null;
    if(chipBtn){
      const panelId = String(chipBtn.getAttribute('data-phase16-openchip') || '');
      if(panelId) try{ phase16PolishOpenCatalogItem_(root, panelId); }catch{}
    }
  });
}

function phase16PolishOpenCatalogItem_(root, panelId){
  const target = document.querySelector('#'+panelId);
  if(!target) return;
  const group = target.closest('details.phase16polish-group');
  if(group) group.open = true;
  try{ switchTab('advanced-panels'); }catch{}
  setTimeout(()=>{
    try{ target.classList.add('phase16polish-targetflash'); }catch{}
    try{ target.scrollIntoView({ behavior:'smooth', block:'start' }); }catch{}
    setTimeout(()=>{ try{ target.classList.remove('phase16polish-targetflash'); }catch{} }, 1300);
  }, 30);
}


function phase16PolishApplyCategoryFilter_(root, categoryKey){
  if(!root) return;
  const selected = String(categoryKey || 'all');
  root.querySelectorAll('details.phase16polish-group').forEach(d => {
    const body = d.querySelector('.phase16polish-body');
    const count = body ? body.children.length : 0;
    const matches = (selected === 'all') || (String(d.dataset.key || '') === selected);
    d.style.display = (count && matches) ? '' : 'none';
  });
}

function phase16PolishRenderCatalog_(root){
  if(!root) return;
  const listEl = root.querySelector('#phase16PolishCatalogList');
  const favsEl = root.querySelector('#phase16PolishCatalogFavs');
  const searchEl = root.querySelector('#phase16PolishCatalogSearch');
  const categoryEl = root.querySelector('#phase16PolishCatalogCategory');
  const jumpEl = root.querySelector('#phase16PolishCatalogJump');
  const jumpHintEl = root.querySelector('#phase16PolishCatalogJumpHint');
  if(!listEl || !favsEl) return;

  const q = String(searchEl?.value || '').trim().toLowerCase();
  const selectedCategory = String(categoryEl?.value || 'all');
  const prefs = phase16PolishLoadPrefs_();
  const favMap = (prefs && prefs.catalogFavorites && typeof prefs.catalogFavorites === 'object') ? prefs.catalogFavorites : {};
  const items = phase16PolishGetCatalogItems_(root)
    .sort((a,b)=>{
      const af = favMap[a.id] ? 1 : 0;
      const bf = favMap[b.id] ? 1 : 0;
      if(af !== bf) return bf - af;
      if(a.groupLabel !== b.groupLabel) return a.groupLabel.localeCompare(b.groupLabel);
      return a.index - b.index;
    });

  const categoryFiltered = selectedCategory === 'all' ? items : items.filter(it => String(it.groupKey || '') === selectedCategory);
  const filtered = q ? categoryFiltered.filter(it => (`${it.title} ${it.groupLabel} ${it.id}`).toLowerCase().includes(q)) : categoryFiltered;
  const favoriteItems = items.filter(it => !!favMap[it.id]);

  favsEl.innerHTML = favoriteItems.map(it => `
    <button type="button" class="phase16polish-chip" data-phase16-openchip="${escapeHtml(it.id)}" title="Open ${escapeHtml(it.title)}">
      <span>★</span><span>${escapeHtml(it.title)}</span>
    </button>
  `).join('');

  if(jumpEl){
    const jumpSource = filtered.length ? filtered : categoryFiltered;
    const prevJump = String(jumpEl.value || '');
    const grouped = new Map();
    jumpSource.forEach(it => {
      const k = String(it.groupLabel || 'Other');
      if(!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push(it);
    });
    let optionsHtml = '<option value="">Select a panel from dropdown…</option>';
    Array.from(grouped.entries()).forEach(([groupLabel, arr]) => {
      optionsHtml += `<optgroup label="${escapeHtml(groupLabel)}">` + arr.map(it => `<option value="${escapeHtml(it.id)}">${escapeHtml(it.title)} (#${escapeHtml(it.id)})</option>`).join('') + `</optgroup>`;
    });
    jumpEl.innerHTML = optionsHtml;
    if(prevJump && Array.from(jumpEl.options || []).some(opt => String(opt.value || '') === prevJump)) jumpEl.value = prevJump;
    if(jumpHintEl){
      const total = jumpSource.length;
      const catLabel = selectedCategory === 'all' ? 'all categories' : selectedCategory;
      jumpHintEl.textContent = total ? `Dropdown shows ${total} panel${total===1?'':'s'} (${catLabel}${q ? ', search filtered' : ''}).` : `No panels available for ${catLabel}${q ? ' with current search' : ''}.`;
    }
  }
  try{ phase16PolishApplyCategoryFilter_(root, selectedCategory); }catch{}

  if(!filtered.length){
    listEl.innerHTML = '<div class="phase16polish-catalogEmpty">No panels match the current category / search filter.</div>';
    return;
  }

  listEl.innerHTML = filtered.map(it => {
    const isFav = !!favMap[it.id];
    return `
      <div class="phase16polish-catalogRow" data-panel-id="${escapeHtml(it.id)}">
        <button type="button" class="phase16polish-catalogStar ${isFav ? 'is-on' : ''}" data-phase16-fav="${escapeHtml(it.id)}" title="${isFav ? 'Remove favorite' : 'Add favorite'}">${isFav ? '★' : '☆'}</button>
        <div class="phase16polish-catalogMain">
          <div class="phase16polish-catalogName">${escapeHtml(it.title)}</div>
          <div class="phase16polish-catalogMeta">${escapeHtml(it.groupLabel)} • #${escapeHtml(it.id)}</div>
        </div>
        <span class="badge">${escapeHtml(it.groupKey.toUpperCase() || 'GROUP')}</span>
        <button type="button" class="btn btn--ghost" data-phase16-open="${escapeHtml(it.id)}">Open</button>
      </div>
    `;
  }).join('');
}

function phase16PolishEnsureDashboardRoot_(tab){
  const mountTab = document.querySelector('#tab-advanced-panels') || tab;
  let root = mountTab.querySelector('#phase16PolishDashRoot');
  if(!root){
    root = document.createElement('div');
    root.id = 'phase16PolishDashRoot';
    root.innerHTML = `
      <div class="phase16polish-head">
        <div>
          <div class="phase16polish-title">Advanced Panels Workspace</div>
          <div class="phase16polish-sub">Grouped phase panels for cleaner navigation. Completion / Active Project / Hotlist cards stay compact above.</div>
        </div>
        <div class="phase16polish-actions">
          <button class="btn btn--ghost" type="button" id="phase16PolishBtnExpandAll">Expand All</button>
          <button class="btn btn--ghost" type="button" id="phase16PolishBtnCollapseAll">Collapse All</button>
        </div>
      </div>
      <div class="phase16polish-catalog">
        <div class="phase16polish-catalogHead">
          <div>
            <div class="phase16polish-catalogTitle">Workspace Catalog & Favorites</div>
            <div class="phase16polish-catalogSub">Search advanced panels, open them quickly, and pin favorites for one-click access.</div>
          </div>
        </div>
        <div class="phase16polish-catalogTools">
          <select class="phase16polish-catalogSelect" id="phase16PolishCatalogCategory" title="Filter by category">
            <option value="all">All Categories</option>
            <option value="ops">Ops & Alerts</option>
            <option value="automation">Automation & Review</option>
            <option value="approval">Approvals & Team</option>
            <option value="reports">Reports & Export Tools</option>
          </select>
          <input class="phase16polish-catalogSearch" type="search" id="phase16PolishCatalogSearch" placeholder="Search panel name, group, or panel id..." />
          <button class="btn btn--ghost" type="button" id="phase16PolishCatalogClear">Clear</button>
        </div>
        <div class="phase16polish-catalogJumpWrap">
          <select class="phase16polish-catalogJump" id="phase16PolishCatalogJump" title="Open panel from dropdown">
            <option value="">Select a panel from dropdown…</option>
          </select>
          <button class="btn btn--ghost" type="button" id="phase16PolishCatalogOpenSelected">Open Selected</button>
        </div>
        <div class="phase16polish-catalogHint" id="phase16PolishCatalogJumpHint">Choose a category or search to narrow panels.</div>
        <div class="phase16polish-favs" id="phase16PolishCatalogFavs"></div>
        <div class="phase16polish-catalogList" id="phase16PolishCatalogList"></div>
      </div>
      <div class="phase16polish-grid">
        <details class="phase16polish-group" data-key="ops" open>
          <summary><span>Ops & Alerts</span><span class="phase16polish-badge">0</span></summary>
          <div class="phase16polish-body" id="phase16PolishGroupOps"></div>
        </details>
        <details class="phase16polish-group" data-key="automation" open>
          <summary><span>Automation & Review</span><span class="phase16polish-badge">0</span></summary>
          <div class="phase16polish-body" id="phase16PolishGroupAutomation"></div>
        </details>
        <details class="phase16polish-group" data-key="approval" open>
          <summary><span>Approvals & Team</span><span class="phase16polish-badge">0</span></summary>
          <div class="phase16polish-body" id="phase16PolishGroupApproval"></div>
        </details>
        <details class="phase16polish-group" data-key="reports">
          <summary><span>Reports & Export Tools</span><span class="phase16polish-badge">0</span></summary>
          <div class="phase16polish-body" id="phase16PolishGroupReports"></div>
        </details>
      </div>
    `;
    const directKids = Array.from(mountTab.children || []);
    const firstPhaseHost = directKids.find(el => el && el.id && /^phase(8|9|10|11|12|13|14|15|16)/.test(el.id));
    if(firstPhaseHost) mountTab.insertBefore(root, firstPhaseHost);
    else mountTab.appendChild(root);
    root.querySelector('#phase16PolishBtnExpandAll')?.addEventListener('click', ()=>{
      root.querySelectorAll('details.phase16polish-group').forEach(d => d.open = true);
    });
    root.querySelector('#phase16PolishBtnCollapseAll')?.addEventListener('click', ()=>{
      root.querySelectorAll('details.phase16polish-group').forEach(d => d.open = false);
    });
  }
  const prefs = phase16PolishLoadPrefs_();
  root.querySelectorAll('details.phase16polish-group[data-key]').forEach(d => {
    if(Object.prototype.hasOwnProperty.call(prefs, d.dataset.key)) d.open = !!prefs[d.dataset.key];
  });
  phase16PolishPersistDetails_(root);
  phase16PolishBindCatalog_(root);
  return root;
}

function phase16PolishAppendIfNeeded_(el, target){
  if(!el || !target) return;
  if(el === target || target.contains(el)) return;
  target.appendChild(el);
}

function phase16PolishEnsureDashboardFocusCard_(dashboardTab, root){
  if(!dashboardTab) return;
  const hostGrid = dashboardTab.querySelector('.grid.grid--2');
  if(!hostGrid) return;
  let card = dashboardTab.querySelector('#phase16DashboardFocusCard');
  if(!card){
    card = document.createElement('div');
    card.className = 'card';
    card.id = 'phase16DashboardFocusCard';
    hostGrid.insertBefore(card, hostGrid.firstElementChild || null);
  }

  const countIn = (sel) => {
    const body = root ? root.querySelector(sel) : null;
    return body ? Array.from(body.children || []).filter(x => x && x.id).length : 0;
  };
  const opsCount = countIn('#phase16PolishGroupOps');
  const autoCount = countIn('#phase16PolishGroupAutomation');
  const approvalCount = countIn('#phase16PolishGroupApproval');
  const reportCount = countIn('#phase16PolishGroupReports');
  const total = opsCount + autoCount + approvalCount + reportCount;
  const hasPortfolio = !!document.querySelector('.nav .nav__item[data-tab="portfolio"]');

  card.innerHTML = `
    <div class="card__top">
      <div>
        <div class="card__label">Dashboard Focus Mode</div>
        <div class="phase16polish-focusTitle">Core signal stays here, advanced tools are grouped separately.</div>
        <div class="phase16polish-focusMeta">Completion, Active Project, Hotlist, Milestones, and Recent Activity remain on Dashboard. Workload, capacity, automation, approvals, and export/report panels are routed to Advanced Panels.</div>
      </div>
      <div class="phase16polish-focusActions">
        <button class="btn btn--ghost" type="button" id="phase16DashboardFocusOpenAdvanced">Open Advanced Panels</button>
        <button class="btn btn--ghost ${hasPortfolio ? '' : 'phase16polish-hidden'}" type="button" id="phase16DashboardFocusOpenPortfolio">Open Portfolio</button>
      </div>
    </div>
    <div class="phase16polish-focusWrap">
      <div class="phase16polish-focusStats">
        <div class="phase16polish-focusStat"><b>${total}</b><span>Advanced Panels</span></div>
        <div class="phase16polish-focusStat"><b>${opsCount}</b><span>Ops & Alerts</span></div>
        <div class="phase16polish-focusStat"><b>${autoCount + approvalCount}</b><span>Automation + Team</span></div>
        <div class="phase16polish-focusStat"><b>${reportCount}</b><span>Reports / Export</span></div>
      </div>
      <div class="phase16polish-focusHint">Tip: use the Tools menu (topbar) for quick actions, and Advanced Panels for heavier workflows.</div>
    </div>
  `;

  const btnAdv = card.querySelector('#phase16DashboardFocusOpenAdvanced');
  const btnPortfolio = card.querySelector('#phase16DashboardFocusOpenPortfolio');
  if(btnAdv && !btnAdv._phase16FocusBound){
    btnAdv.addEventListener('click', ()=>{
      try{ switchTab('advanced-panels'); }catch{}
      setTimeout(()=>{ try{ phase16PolishSchedule_(); }catch{} }, 30);
    });
    btnAdv._phase16FocusBound = true;
  }
  if(btnPortfolio && !btnPortfolio._phase16FocusBound){
    btnPortfolio.addEventListener('click', ()=>{ try{ switchTab('portfolio'); }catch{} });
    btnPortfolio._phase16FocusBound = true;
  }
}

function phase16PolishApplyDashboardCleanup_(){
  const dashboardTab = document.querySelector('#tab-dashboard');
  const advancedTab = document.querySelector('#tab-advanced-panels');
  const hostTab = advancedTab || dashboardTab;
  if(!hostTab) return;
  const root = phase16PolishEnsureDashboardRoot_(hostTab);
  const gOps = root.querySelector('#phase16PolishGroupOps');
  const gAuto = root.querySelector('#phase16PolishGroupAutomation');
  const gApproval = root.querySelector('#phase16PolishGroupApproval');
  const gReports = root.querySelector('#phase16PolishGroupReports');
  if(!gOps || !gAuto || !gApproval || !gReports) return;

  // Move known dashboard phase hosts into grouped workspace.
  const groups = {
    ops: ['phase6DashWorkload','phase7CapacityPanel','phase8DashboardHost','phase9DashboardHost','phase11DashboardHost','phase12DashboardHost'],
    automation: ['phase10DashboardHost','phase13DashboardHost'],
    approval: ['phase14ApprovalQueuePanel','phase15RbacPanel','phase16TeamPanel'],
    reports: []
  };
  groups.ops.forEach(id => phase16PolishAppendIfNeeded_(document.querySelector('#'+id), gOps));
  groups.automation.forEach(id => phase16PolishAppendIfNeeded_(document.querySelector('#'+id), gAuto));
  groups.approval.forEach(id => phase16PolishAppendIfNeeded_(document.querySelector('#'+id), gApproval));

  // If team panel was incorrectly mounted inside base Completion card, force it into Approvals & Team group.
  const teamPanel = document.querySelector('#phase16TeamPanel');
  if(teamPanel) phase16PolishAppendIfNeeded_(teamPanel, gApproval);

  const sourceTabs = [dashboardTab, advancedTab].filter(Boolean);

  // Move any remaining direct-child phase hosts into reports/misc group so workspace stays tidy.
  sourceTabs.forEach(tab => {
    Array.from(tab.children || []).forEach(el => {
      if(!el || el === root) return;
      const id = String(el.id || '');
      if(!/^phase(6|7|8|9|10|11|12|13|14|15|16)/.test(id)) return;
      if(root.contains(el)) return;
      phase16PolishAppendIfNeeded_(el, gReports);
    });
  });

  // Also catch phase panels nested inside base cards (common additive patch placement issue).
  sourceTabs.forEach(tab => {
    Array.from(tab.querySelectorAll('.card > [id^="phase"]')).forEach(el => {
      if(root.contains(el)) return;
      const id = String(el.id || '');
      if(id === 'phase16TeamPanel' || id === 'phase15RbacPanel' || id === 'phase14ApprovalQueuePanel') phase16PolishAppendIfNeeded_(el, gApproval);
      else if(id === 'phase10DashboardHost' || id === 'phase13DashboardHost') phase16PolishAppendIfNeeded_(el, gAuto);
      else if(/^phase(6|7)/.test(id)) phase16PolishAppendIfNeeded_(el, gOps);
      else phase16PolishAppendIfNeeded_(el, gOps);
    });
  });

  // Keep badge counts current and hide empty groups.
  root.querySelectorAll('details.phase16polish-group').forEach(d => {
    const body = d.querySelector('.phase16polish-body');
    const badge = d.querySelector('.phase16polish-badge');
    const count = body ? body.children.length : 0;
    if(badge) badge.textContent = String(count);
    d.style.display = count ? '' : 'none';
  });
  try{ phase16PolishEnsureDashboardFocusCard_(dashboardTab, root); }catch(err){ console.warn('Phase16 dashboard focus card failed', err); }
  try{ phase16PolishRenderCatalog_(root); }catch{}
  try{ phase16PolishRenderSidebarNavDropdown_(); }catch{}
}

try{ initPhase16Polish_(); }catch(err){ console.warn('Phase16 polish init failed', err); }


