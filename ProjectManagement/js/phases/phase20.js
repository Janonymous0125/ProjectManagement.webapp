/* ---------------------------
   Phase 20 — Advanced Panels Category Tabs Split (Milestone 6)
   - Keep only Workspace Catalog & Favorites in "Advanced Panels"
   - Move category groups into dedicated sidebar tabs
---------------------------- */
const phase20AdvSplitState_ = {
  inited:false,
  timer:0,
  wrappedSwitch:false,
  wrappedPhase18Apply:false,
  wrappedPhase16Apply:false,
  navCollapsed:true,
  tabDefs: [
    { key:'ops', tabId:'advanced-ops-alerts', panelId:'tab-advanced-ops-alerts', hostId:'phase20AdvSplitHostOps', icon:'⚙', navText:'Ops & Alerts', title:'Ops & Alerts', subtitle:'Operational monitoring, workload, capacity, and alert-related advanced panels.' },
    { key:'automation', tabId:'advanced-automation-review', panelId:'tab-advanced-automation-review', hostId:'phase20AdvSplitHostAutomation', icon:'⟳', navText:'Automation & Review', title:'Automation & Review', subtitle:'Automation, review workflows, and follow-up orchestration panels.' },
    { key:'approval', tabId:'advanced-approvals-team', panelId:'tab-advanced-approvals-team', hostId:'phase20AdvSplitHostApproval', icon:'👥', navText:'Approvals & Team', title:'Approvals & Team', subtitle:'Approval queues, RBAC controls, and team management panels.' },
    { key:'reports', tabId:'advanced-reports-export', panelId:'tab-advanced-reports-export', hostId:'phase20AdvSplitHostReports', icon:'⇪', navText:'Reports & Export', title:'Reports & Export Tools', subtitle:'Reporting, exports, and any overflow tools routed out of Dashboard.' }
  ]
};

function initPhase20AdvancedSplitTabs_(){
  if(phase20AdvSplitState_.inited) return;
  phase20AdvSplitState_.inited = true;
  try{ phase20AdvSplitEnsureStyles_(); }catch(err){ console.warn('Phase20 split styles failed', err); }
  try{ phase20AdvSplitEnsureTabs_(); }catch(err){ console.warn('Phase20 split tabs ensure failed', err); }
  try{ phase20AdvSplitPatchCatalogFns_(); }catch(err){ console.warn('Phase20 split catalog patch failed', err); }
  try{ phase20AdvSplitPatchPhase16Cleanup_(); }catch(err){ console.warn('Phase20 split phase16 patch failed', err); }
  try{ phase20AdvSplitPatchUiMode_(); }catch(err){ console.warn('Phase20 split phase18 patch failed', err); }
  try{ phase20AdvSplitWrapSwitchTab_(); }catch(err){ console.warn('Phase20 split switchTab wrap failed', err); }
  try{ phase20AdvSplitRegisterHooks_(); }catch(err){ console.warn('Phase20 split hook register failed', err); }
  try{ phase20AdvSplitSchedule_(); }catch{}
  setTimeout(()=>{ try{ phase20AdvSplitSchedule_(); }catch{} }, 120);
}

function phase20AdvSplitDefs_(){
  return Array.isArray(phase20AdvSplitState_.tabDefs) ? phase20AdvSplitState_.tabDefs : [];
}

function phase20AdvSplitKeyToTabId_(key){
  const def = phase20AdvSplitDefs_().find(d => d.key === String(key||''));
  return def ? def.tabId : 'advanced-panels';
}

function phase20AdvSplitEnsureStyles_(){
  if(document.querySelector('#phase20AdvSplitStyles')) return;
  const st = document.createElement('style');
  st.id = 'phase20AdvSplitStyles';
  st.textContent = `
    #phase16PolishDashRoot.phase20advsplit-catalogonly .phase16polish-actions{display:none !important}
    #phase16PolishDashRoot.phase20advsplit-catalogonly .phase16polish-grid{display:none !important}
    #phase16PolishDashRoot.phase20advsplit-catalogonly .phase16polish-sub{max-width:780px}
    .phase20advsplit-wrap{display:grid;gap:12px}
    .phase20advsplit-host > details.phase16polish-group{margin:0}
    .phase20advsplit-host > details.phase16polish-group:only-child{display:block !important}
    .phase20advsplit-host .phase16polish-body{padding:12px}
    .phase20advsplit-empty{font-size:11px;opacity:.72;padding:6px 0}

    /* Sidebar visual grouping: nest advanced category tabs under Advanced Panels */
    .phase20advsplit-navgroup{display:grid;gap:10px}
    .phase20advsplit-navgroup > .nav__item[data-tab="advanced-panels"]{position:relative;margin-left:0;padding-right:34px}
    .phase20advsplit-navgroup > .nav__item[data-tab="advanced-panels"]::before{
      content:"▾";
      position:absolute;
      right:12px;
      top:50%;
      transform:translateY(-50%);
      font-size:11px;
      line-height:1;
      opacity:.72;
      transition:transform .18s ease, opacity .18s ease;
      pointer-events:none;
      background:none;
    }
    .phase20advsplit-navgroup.is-collapsed > .nav__item[data-tab="advanced-panels"]::before{
      transform:translateY(-50%) rotate(-90deg);
      opacity:.9;
    }
    .phase20advsplit-navsub{
      display:grid;
      gap:8px;
      margin-top:-2px;
      margin-left:0;
      padding:12px 12px 12px 14px;
      border-radius:14px;
      background:linear-gradient(180deg, rgba(8,14,22,0.48), rgba(8,14,22,0.20));
      border:1px solid rgba(56,246,255,0.07);
      border-left-color: rgba(56,246,255,0.14);
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.03);
      position:relative;
    }
    .phase20advsplit-navgroup.is-collapsed .phase20advsplit-navsub{display:none !important}
    .phase20advsplit-navsub::before{
      content:"";
      position:absolute;
      left:9px;
      top:12px;
      bottom:12px;
      width:1px;
      background:linear-gradient(180deg, rgba(56,246,255,0.15), rgba(155,92,255,0.06));
      opacity:.88;
      pointer-events:none;
    }
    .phase20advsplit-navchild{
      margin-left:0;
      padding:10px 12px;
      border-radius:12px;
      background:linear-gradient(180deg, rgba(10,18,28,0.24), rgba(10,18,28,0.12));
      border-color:rgba(56,246,255,0.08);
    }
    .phase20advsplit-navchild .nav__text{font-size:10px;letter-spacing:0.12em;text-transform:uppercase}
    .phase20advsplit-navchild .nav__icon{opacity:.72;font-size:12px}
    .phase20advsplit-navgroup.is-child-active > .nav__item[data-tab="advanced-panels"]{
      border-color: rgba(56,246,255,0.24);
      box-shadow: 0 0 0 1px rgba(155,92,255,0.07) inset, 0 10px 24px rgba(2,17,26,0.26), 0 0 14px rgba(56,246,255,0.07);
      background: linear-gradient(180deg, rgba(10,18,28,0.42), rgba(10,18,28,0.26));
    }
    @media (max-width:820px){
      .phase20advsplit-navsub{padding:10px 10px 10px 12px}
      .phase20advsplit-navsub::before{left:8px;top:10px;bottom:10px}
      .phase20advsplit-navchild{padding:9px 10px}
    }
    @media (max-width:560px){
      .phase20advsplit-navsub{gap:6px}
    }
  `;
  document.head.appendChild(st);
}

function phase20AdvSplitEnsureNavGroup_(sidebarNav, advancedBtn){
  if(!sidebarNav || !advancedBtn) return null;
  const workspaceCluster = sidebarNav.querySelector('#navClusterWorkspace') || sidebarNav;
  let group = sidebarNav.querySelector('#phase20AdvSplitNavGroup');
  let sub = sidebarNav.querySelector('#phase20AdvSplitNavSub');

  if(!group){
    group = document.createElement('div');
    group.id = 'phase20AdvSplitNavGroup';
    group.className = 'phase20advsplit-navgroup';
  }
  if(!sub){
    sub = document.createElement('div');
    sub.id = 'phase20AdvSplitNavSub';
    sub.className = 'phase20advsplit-navsub';
  }

  if(advancedBtn.parentElement !== group){
    if(group.parentElement !== workspaceCluster){
      if(advancedBtn.parentElement === workspaceCluster) advancedBtn.insertAdjacentElement('beforebegin', group);
      else workspaceCluster.appendChild(group);
    }
    group.insertAdjacentElement('afterbegin', advancedBtn);
  }
  if(sub.parentElement !== group) group.appendChild(sub);

  if(!advancedBtn._phase20AdvSplitCollapseBound){
    advancedBtn.addEventListener('click', () => {
      try{ phase20AdvSplitToggleNavGroup_(); }catch{}
    });
    advancedBtn._phase20AdvSplitCollapseBound = true;
  }

  if(!sub.id) sub.id = 'phase20AdvSplitNavSub';
  advancedBtn.setAttribute('aria-controls', sub.id);
  advancedBtn.setAttribute('aria-haspopup', 'true');
  if(workspaceCluster && workspaceCluster.dataset) workspaceCluster.dataset.populated = 'true';

  return { group, sub, workspaceCluster };
}

function phase20AdvSplitToggleNavGroup_(nextCollapsed){
  if(typeof nextCollapsed === 'boolean') phase20AdvSplitState_.navCollapsed = nextCollapsed;
  else phase20AdvSplitState_.navCollapsed = !phase20AdvSplitState_.navCollapsed;
  try{ phase20AdvSplitSyncNavGroupState_(); }catch{}
}

function phase20AdvSplitSyncNavGroupState_(){
  const group = document.querySelector('#phase20AdvSplitNavGroup');
  const sub = document.querySelector('#phase20AdvSplitNavSub');
  const workspaceCluster = document.querySelector('#navClusterWorkspace');
  const advancedBtn = document.querySelector('.nav #phase20AdvSplitNavGroup > .nav__item[data-tab="advanced-panels"]');
  if(!group) return;
  const active = document.querySelector('.nav .nav__item.is-active')?.dataset?.tab || '';
  const childDefs = phase20AdvSplitDefs_();
  const isChildActive = childDefs.some(def => def.tabId === active);
  group.classList.toggle('is-child-active', !!isChildActive);
  const collapsed = !!phase20AdvSplitState_.navCollapsed && !isChildActive;
  group.classList.toggle('is-collapsed', collapsed);
  if(sub){
    const visibleChildren = Array.from(sub.querySelectorAll('.nav__item')).filter(btn => btn.style.display !== 'none');
    sub.style.display = (visibleChildren.length && !collapsed) ? '' : 'none';
    sub.setAttribute('aria-hidden', (visibleChildren.length && !collapsed) ? 'false' : 'true');
  }
  if(advancedBtn){
    advancedBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
  if(workspaceCluster && workspaceCluster.dataset) workspaceCluster.dataset.populated = 'true';
}

function phase20AdvSplitEnsureTabs_(){
  const sidebarNav = document.querySelector('.nav');
  const advancedBtn = sidebarNav && sidebarNav.querySelector('.nav__item[data-tab="advanced-panels"]');
  const advancedPanel = document.querySelector('#tab-advanced-panels');
  const dashboardTab = document.querySelector('#tab-dashboard');
  if(!sidebarNav || !advancedBtn || !advancedPanel || !dashboardTab || !dashboardTab.parentElement) return;

  const portfolioBtn = sidebarNav.querySelector('.nav__item[data-tab="portfolio"]');
  const portfolioPanel = document.querySelector('#tab-portfolio');
  const navGroupRefs = phase20AdvSplitEnsureNavGroup_(sidebarNav, advancedBtn);
  const navSub = navGroupRefs && navGroupRefs.sub;

  let navInsertAfter = null;
  let panelInsertAfter = advancedPanel;

  phase20AdvSplitDefs_().forEach((def) => {
    let navBtn = sidebarNav.querySelector(`.nav__item[data-tab="${def.tabId}"]`);
    if(!navBtn){
      navBtn = document.createElement('button');
      navBtn.type = 'button';
      navBtn.className = 'nav__item';
      navBtn.dataset.tab = def.tabId;
      navBtn.innerHTML = `<span class="nav__icon">${def.icon}</span><span class="nav__text">${def.navText}</span>`;
      if(navInsertAfter && navInsertAfter.parentElement === navSub) navInsertAfter.insertAdjacentElement('afterend', navBtn);
      else if(navSub) navSub.appendChild(navBtn);
      else if(portfolioBtn && portfolioBtn.parentElement === sidebarNav) portfolioBtn.insertAdjacentElement('beforebegin', navBtn);
      else sidebarNav.appendChild(navBtn);
    }
    if(navSub && navBtn.parentElement !== navSub) navSub.appendChild(navBtn);
    navBtn.classList.add('phase20advsplit-navchild');
    navBtn.dataset.parentTab = 'advanced-panels';
    navInsertAfter = navBtn;

    let panel = document.querySelector('#'+def.panelId);
    if(!panel){
      panel = document.createElement('section');
      panel.className = 'tab';
      panel.id = def.panelId;
      panel.dataset.tab = def.tabId;
      panel.innerHTML = `
        <div class="tab__header">
          <div class="tab__title">${def.title}</div>
          <div class="tab__subtitle">${def.subtitle}</div>
        </div>
        <div class="phase20advsplit-wrap">
          <div class="card phase20advsplit-shell">
            <div class="card__top phase20advsplit-head">
              <div>
                <div class="card__label">Advanced Workspace</div>
                <div class="card__title phase20advsplit-heading">${def.title}</div>
                <div class="card__meta" id="phase20AdvSplitMeta-${def.key}">Panels grouped under ${def.navText}.</div>
              </div>
              <div class="phase20advsplit-chip">${def.navText}</div>
            </div>
            <div class="phase20advsplit-summary">
              <div class="phase20advsplit-summaryItem">
                <span>Panels</span>
                <b id="phase20AdvSplitCount-${def.key}">0</b>
              </div>
              <div class="phase20advsplit-summaryItem">
                <span>Use</span>
                <b>Command Workspace</b>
              </div>
              <div class="phase20advsplit-summaryItem">
                <span>Flow</span>
                <b>Review + Action</b>
              </div>
            </div>
            <div class="phase20advsplit-host" id="${def.hostId}">
              <div class="phase20advsplit-empty">Loading category panels…</div>
            </div>
          </div>
        </div>
      `;
      if(panelInsertAfter && panelInsertAfter.parentElement) panelInsertAfter.insertAdjacentElement('afterend', panel);
      else if(portfolioPanel && portfolioPanel.parentElement) portfolioPanel.insertAdjacentElement('beforebegin', panel);
      else advancedPanel.insertAdjacentElement('afterend', panel);
    }
    panelInsertAfter = panel;

    if(ui && Array.isArray(ui.tabs) && !ui.tabs.some(x => x && x.dataset && x.dataset.tab === def.tabId)){
      let idx = ui.tabs.findIndex(x => x && x.dataset && x.dataset.tab === 'portfolio');
      if(idx < 0) idx = ui.tabs.length;
      ui.tabs.splice(idx, 0, navBtn);
    }
    if(ui && Array.isArray(ui.tabPanels) && !ui.tabPanels.some(x => x && x.dataset && x.dataset.tab === def.tabId)){
      let idx = ui.tabPanels.findIndex(x => x && x.dataset && x.dataset.tab === 'portfolio');
      if(idx < 0) idx = ui.tabPanels.length;
      ui.tabPanels.splice(idx, 0, panel);
    }

    if(!navBtn._phase20AdvSplitBound){
      navBtn.addEventListener('click', ()=>{ try{ switchTab(def.tabId); }catch{} });
      navBtn._phase20AdvSplitBound = true;
    }
  });

  try{ phase20AdvSplitSyncNavGroupState_(); }catch{}
}

function phase20AdvSplitSchedule_(){
  if(phase20AdvSplitState_.timer){ try{ clearTimeout(phase20AdvSplitState_.timer); }catch{} }
  phase20AdvSplitState_.timer = setTimeout(()=>{
    phase20AdvSplitState_.timer = 0;
    try{ phase20AdvSplitApply_(); }catch(err){ console.warn('Phase20 split apply failed', err); }
  }, 35);
}

function phase20AdvSplitApply_(){
  try{ phase20AdvSplitEnsureTabs_(); }catch{}
  const root = document.querySelector('#phase16PolishDashRoot');
  if(!root) return;

  root.classList.add('phase20advsplit-catalogonly');
  const headTitle = root.querySelector('.phase16polish-title');
  const headSub = root.querySelector('.phase16polish-sub');
  if(headTitle) headTitle.textContent = 'Advanced Panels Catalog';
  if(headSub) headSub.textContent = 'Workspace Catalog & Favorites stays here. Open dedicated category tabs for Ops, Automation, Approvals, and Reports tools.';

  phase20AdvSplitDefs_().forEach((def)=>{
    const host = document.getElementById(def.hostId);
    const group = document.querySelector(`details.phase16polish-group[data-key="${def.key}"]`);
    if(host && group && group.parentElement !== host) host.appendChild(group);
    if(group) group.open = true;
    const meta = document.getElementById(`phase20AdvSplitMeta-${def.key}`);
    const countEl = document.getElementById(`phase20AdvSplitCount-${def.key}`);
    const count = group ? (group.querySelector('.phase16polish-body')?.children.length || 0) : 0;
    if(meta) meta.textContent = `${count} panel${count===1?'':'s'} in ${def.navText}.`;
    if(countEl) countEl.textContent = String(count);
  });

  try{ phase20AdvSplitRefreshDashboardFocusCard_(); }catch{}
  try{ phase20AdvSplitApplyUiModeExtras_(); }catch{}
}

function phase20AdvSplitRefreshDashboardFocusCard_(){
  const card = document.querySelector('#phase16DashboardFocusCard');
  if(!card) return;
  const countFor = (id)=> {
    const body = document.querySelector('#'+id);
    return body ? Array.from(body.children || []).filter(x => x && x.id).length : 0;
  };
  const ops = countFor('phase16PolishGroupOps');
  const auto = countFor('phase16PolishGroupAutomation');
  const approval = countFor('phase16PolishGroupApproval');
  const reports = countFor('phase16PolishGroupReports');
  const stats = Array.from(card.querySelectorAll('.phase16polish-focusStat b'));
  if(stats[0]) stats[0].textContent = String(ops + auto + approval + reports);
  if(stats[1]) stats[1].textContent = String(ops);
  if(stats[2]) stats[2].textContent = String(auto + approval);
  if(stats[3]) stats[3].textContent = String(reports);
}

function phase20AdvSplitPatchCatalogFns_(){
  if(typeof phase16PolishGetCatalogItems_ === 'function' && !phase16PolishGetCatalogItems_._phase20AdvSplitPatched){
    const patched = function(root){
      const out = [];
      document.querySelectorAll('details.phase16polish-group[data-key]').forEach(group => {
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
    };
    patched._phase20AdvSplitPatched = true;
    phase16PolishGetCatalogItems_ = patched;
  }

  if(typeof phase16PolishOpenCatalogItem_ === 'function' && !phase16PolishOpenCatalogItem_._phase20AdvSplitPatched){
    const patchedOpen = function(root, panelId){
      const target = document.querySelector('#'+panelId);
      if(!target) return;
      const group = target.closest('details.phase16polish-group');
      if(group) group.open = true;
      const groupKey = String(group?.dataset?.key || '');
      const tabId = phase20AdvSplitKeyToTabId_(groupKey);
      try{ switchTab(tabId || 'advanced-panels'); }catch{}
      setTimeout(()=>{
        try{ target.classList.add('phase16polish-targetflash'); }catch{}
        try{ target.scrollIntoView({ behavior:'smooth', block:'start' }); }catch{}
        setTimeout(()=>{ try{ target.classList.remove('phase16polish-targetflash'); }catch{} }, 1300);
      }, 30);
    };
    patchedOpen._phase20AdvSplitPatched = true;
    phase16PolishOpenCatalogItem_ = patchedOpen;
  }
}

function phase20AdvSplitPatchPhase16Cleanup_(){
  if(typeof phase16PolishApplyDashboardCleanup_ !== 'function' || phase20AdvSplitState_.wrappedPhase16Apply) return;
  phase16PolishApplyDashboardCleanup_ = function(){
    const dashboardTab = document.querySelector('#tab-dashboard');
    const advancedTab = document.querySelector('#tab-advanced-panels');
    const hostTab = advancedTab || dashboardTab;
    if(!hostTab) return;

    try{ phase20AdvSplitEnsureTabs_(); }catch{}
    const root = phase16PolishEnsureDashboardRoot_(hostTab);
    const gOps = document.querySelector('#phase16PolishGroupOps');
    const gAuto = document.querySelector('#phase16PolishGroupAutomation');
    const gApproval = document.querySelector('#phase16PolishGroupApproval');
    const gReports = document.querySelector('#phase16PolishGroupReports');
    if(!root || !gOps || !gAuto || !gApproval || !gReports) return;

    const groups = {
      ops: ['phase6DashWorkload','phase7CapacityPanel','phase8DashboardHost','phase9DashboardHost','phase11DashboardHost','phase12DashboardHost'],
      automation: ['phase10DashboardHost','phase13DashboardHost'],
      approval: ['phase14ApprovalQueuePanel','phase15RbacPanel','phase16TeamPanel'],
      reports: []
    };
    groups.ops.forEach(id => phase16PolishAppendIfNeeded_(document.querySelector('#'+id), gOps));
    groups.automation.forEach(id => phase16PolishAppendIfNeeded_(document.querySelector('#'+id), gAuto));
    groups.approval.forEach(id => phase16PolishAppendIfNeeded_(document.querySelector('#'+id), gApproval));

    const teamPanel = document.querySelector('#phase16TeamPanel');
    if(teamPanel) phase16PolishAppendIfNeeded_(teamPanel, gApproval);

    const sourceTabs = [dashboardTab, advancedTab].filter(Boolean);
    sourceTabs.forEach(tab => {
      Array.from(tab.children || []).forEach(el => {
        if(!el || el === root) return;
        const id = String(el.id || '');
        if(!/^phase(6|7|8|9|10|11|12|13|14|15|16)/.test(id)) return;
        if(root.contains(el)) return;
        phase16PolishAppendIfNeeded_(el, gReports);
      });
    });

    sourceTabs.forEach(tab => {
      Array.from(tab.querySelectorAll('.card > [id^="phase"]')).forEach(el => {
        const id = String(el.id || '');
        if(id === 'phase16TeamPanel' || id === 'phase15RbacPanel' || id === 'phase14ApprovalQueuePanel') phase16PolishAppendIfNeeded_(el, gApproval);
        else if(id === 'phase10DashboardHost' || id === 'phase13DashboardHost') phase16PolishAppendIfNeeded_(el, gAuto);
        else if(/^phase(6|7)/.test(id)) phase16PolishAppendIfNeeded_(el, gOps);
        else phase16PolishAppendIfNeeded_(el, gOps);
      });
    });

    document.querySelectorAll('details.phase16polish-group').forEach(d => {
      const body = d.querySelector('.phase16polish-body');
      const badge = d.querySelector('.phase16polish-badge');
      const count = body ? body.children.length : 0;
      if(badge) badge.textContent = String(count);
      d.style.display = count ? '' : 'none';
    });

    try{ phase16PolishEnsureDashboardFocusCard_(dashboardTab, root); }catch(err){ console.warn('Phase16 dashboard focus card failed', err); }
    try{ phase16PolishRenderCatalog_(root); }catch{}
    try{ phase16PolishRemoveSidebarNavDropdown_(); }catch{}
    try{ phase20AdvSplitApply_(); }catch{}
  };
  phase20AdvSplitState_.wrappedPhase16Apply = true;
}

function phase20AdvSplitPatchUiMode_(){
  if(typeof phase18UiModeApply_ === 'function' && !phase20AdvSplitState_.wrappedPhase18Apply){
    const _orig = phase18UiModeApply_;
    phase18UiModeApply_ = function(){
      const r = _orig.apply(this, arguments);
      try{ phase20AdvSplitApplyUiModeExtras_(); }catch{}
      return r;
    };
    phase20AdvSplitState_.wrappedPhase18Apply = true;
  }
}

function phase20AdvSplitApplyUiModeExtras_(){
  const isAdv = (typeof phase18UiModeIsAdvanced_ === 'function') ? !!phase18UiModeIsAdvanced_() : true;
  const extraTabIds = phase20AdvSplitDefs_().map(d => d.tabId);
  extraTabIds.forEach(tabId => {
    if(typeof phase18UiModeSetTabVisibility_ === 'function'){
      try{ phase18UiModeSetTabVisibility_(tabId, isAdv); }catch{}
      return;
    }
    const navBtn = document.querySelector(`.nav .nav__item[data-tab="${tabId}"]`);
    const panel = document.querySelector(`.tab[data-tab="${tabId}"]`);
    [navBtn, panel].forEach(el => {
      if(!el) return;
      el.style.display = isAdv ? '' : 'none';
      el.setAttribute('aria-hidden', isAdv ? 'false' : 'true');
    });
  });

  const activeTab = document.querySelector('.tab.is-active')?.dataset?.tab || '';
  if(!isAdv && extraTabIds.includes(activeTab)){
    try{ switchTab('dashboard'); }catch{}
  }

  try{ phase20AdvSplitSyncNavGroupState_(); }catch{}
}

function phase20AdvSplitWrapSwitchTab_(){
  if(phase20AdvSplitState_.wrappedSwitch || typeof switchTab !== 'function') return;
  const _orig = switchTab;
  switchTab = function(tabId){
    const nextTab = String(tabId || '');
    const extraTabIds = phase20AdvSplitDefs_().map(d => d.tabId);
    const isAdv = (typeof phase18UiModeIsAdvanced_ === 'function') ? !!phase18UiModeIsAdvanced_() : true;
    if(!isAdv && extraTabIds.includes(nextTab)){
      const r = _orig.call(this, 'dashboard');
      try{ phase20AdvSplitSyncNavGroupState_(); }catch{}
      try{ phase20AdvSplitSchedule_(); }catch{}
      return r;
    }
    const r = _orig.apply(this, arguments);
    try{ phase20AdvSplitSyncNavGroupState_(); }catch{}
    try{ phase20AdvSplitSchedule_(); }catch{}
    return r;
  };
  phase20AdvSplitState_.wrappedSwitch = true;
}

function phase20AdvSplitRegisterHooks_(){
  if(window.StarkPMPostRenderHooks && typeof window.StarkPMPostRenderHooks.register === 'function'){
    try{ window.StarkPMPostRenderHooks.register('dashboard', 'phase20-adv-split', ()=> phase20AdvSplitSchedule_(), { order: 90 }); }catch{}
    try{ window.StarkPMPostRenderHooks.register('checklist', 'phase20-adv-split', ()=> phase20AdvSplitSchedule_(), { order: 90 }); }catch{}
  }
}

try{ initPhase20AdvancedSplitTabs_(); }catch(err){ console.warn('Phase20 advanced split tabs init failed', err); }
