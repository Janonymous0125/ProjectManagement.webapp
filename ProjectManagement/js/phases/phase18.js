/* ---------------------------
   Phase 18 — Basic / Advanced Mode Toggle (Milestone 4)
   - Default mode is Basic on first load
   - Advanced mode reveals Portfolio + Advanced Panels tabs
   - Mode toggle is kept visible in topbar and mirrored on Dashboard Focus card
---------------------------- */
const PHASE18_UI_MODE_KEY = "stark_pm_ui_mode_v1";
const phase18UiModeState_ = {
  inited: false,
  mode: "basic",
  renderWrapped: false,
  switchWrapped: false,
  timer: 0,
};

function initPhase18UiMode_(){
  if(phase18UiModeState_.inited) return;
  phase18UiModeState_.inited = true;
  try{ phase18UiModeLoad_(); }catch{}
  try{ phase18UiModeEnsureStyles_(); }catch(err){ console.warn('Phase18 UI mode styles failed', err); }
  try{ phase18UiModeWrapSwitchTab_(); }catch(err){ console.warn('Phase18 UI mode switch wrap failed', err); }
  try{ phase18UiModeWrapRenderAll_(); }catch(err){ console.warn('Phase18 UI mode render wrap failed', err); }
  try{ phase18UiModeApply_({ force:true }); }catch(err){ console.warn('Phase18 UI mode apply failed', err); }
  setTimeout(()=>{ try{ phase18UiModeApply_({ force:true }); }catch{} }, 80);
}

function phase18UiModeLoad_(){
  let raw = '';
  try{ raw = String(localStorage.getItem(PHASE18_UI_MODE_KEY) || ''); }catch{ raw = ''; }
  phase18UiModeState_.mode = (raw === 'advanced') ? 'advanced' : 'basic';
}

function phase18UiModeSave_(){
  try{ localStorage.setItem(PHASE18_UI_MODE_KEY, phase18UiModeState_.mode === 'advanced' ? 'advanced' : 'basic'); }catch{}
}

function phase18UiModeIsAdvanced_(){
  return phase18UiModeState_.mode === 'advanced';
}

function phase18UiModeEnsureStyles_(){
  if(document.querySelector('#phase18UiModeStyles')) return;
  const st = document.createElement('style');
  st.id = 'phase18UiModeStyles';
  st.textContent = `
    .phase18uimode-hidden{display:none !important}
    #btnUiMode{min-width:126px;justify-content:center}
    #phase18DashboardModeNote{font-size:11px;opacity:.82;line-height:1.35}
  `;
  document.head.appendChild(st);
}

function phase18UiModeRenderTopbarButton_(){
  const btn = document.getElementById('btnUiMode');
  if(!btn) return;
  const isAdv = phase18UiModeIsAdvanced_();
  btn.textContent = isAdv ? 'Mode: Advanced' : 'Mode: Basic';
  btn.title = isAdv
    ? 'Advanced mode is ON (Portfolio + Advanced Panels visible). Click to switch to Basic mode.'
    : 'Basic mode is ON (core PM workflow only). Click to enable Advanced mode.';
  btn.setAttribute('aria-pressed', isAdv ? 'true' : 'false');
}

function phase18UiModeEnsureTopbarButton_(){
  const topbarRight = document.querySelector('.topbar__right');
  if(!topbarRight) return;

  let btn = document.getElementById('btnUiMode');
  if(!btn){
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--ghost';
    btn.id = 'btnUiMode';
    const anchor = document.getElementById('btnUndo') || topbarRight.querySelector('.topbar-menu') || null;
    if(anchor && anchor.parentElement === topbarRight) topbarRight.insertBefore(btn, anchor);
    else topbarRight.appendChild(btn);
  }

  if(!btn._phase18UiModeBound){
    btn.addEventListener('click', ()=> phase18UiModeToggle_());
    btn._phase18UiModeBound = true;
  }

  phase18UiModeRenderTopbarButton_();

  try{ initTopbarDeclutter_(); }catch{}
  try{
    if(topbarRight._topbarDeclutterSync) topbarRight._topbarDeclutterSync();
  }catch{}
}

function phase18UiModeSetTabVisibility_(tabId, visible){
  const navBtn = document.querySelector(`.nav .nav__item[data-tab="${tabId}"]`);
  const panel = document.querySelector(`.tab[data-tab="${tabId}"]`);
  [navBtn, panel].forEach(el => {
    if(!el) return;
    el.classList.toggle('phase18uimode-hidden', !visible);
    if(visible){
      el.style.display = '';
      if(el === navBtn) el.removeAttribute('aria-hidden');
    }else{
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
  });
}

function phase18UiModeDecorateDashboardFocusCard_(){
  const card = document.querySelector('#phase16DashboardFocusCard');
  if(!card) return;

  const actions = card.querySelector('.phase16polish-focusActions');
  if(actions){
    let toggleBtn = card.querySelector('#phase18DashboardModeToggle');
    if(!toggleBtn){
      toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'btn btn--ghost';
      toggleBtn.id = 'phase18DashboardModeToggle';
      actions.insertBefore(toggleBtn, actions.firstChild || null);
    }
    if(!toggleBtn._phase18UiModeBound){
      toggleBtn.addEventListener('click', ()=> phase18UiModeToggle_());
      toggleBtn._phase18UiModeBound = true;
    }
    toggleBtn.textContent = phase18UiModeIsAdvanced_() ? 'Switch to Basic Mode' : 'Enable Advanced Mode';

    const advBtn = card.querySelector('#phase16DashboardFocusOpenAdvanced');
    const portBtn = card.querySelector('#phase16DashboardFocusOpenPortfolio');
    [advBtn, portBtn].forEach(el => {
      if(!el) return;
      el.classList.toggle('phase16polish-hidden', !phase18UiModeIsAdvanced_());
      el.disabled = !phase18UiModeIsAdvanced_();
    });
  }

  const wrap = card.querySelector('.phase16polish-focusWrap') || card;
  let note = card.querySelector('#phase18DashboardModeNote');
  if(!note){
    note = document.createElement('div');
    note.id = 'phase18DashboardModeNote';
    wrap.appendChild(note);
  }
  note.textContent = phase18UiModeIsAdvanced_()
    ? 'Advanced mode is enabled. Portfolio and Advanced Panels are visible in the sidebar.'
    : 'Basic mode is enabled. Portfolio and Advanced Panels are hidden to keep the workflow focused.';
}

function phase18UiModeScheduleApply_(){
  if(phase18UiModeState_.timer){
    try{ clearTimeout(phase18UiModeState_.timer); }catch{}
  }
  phase18UiModeState_.timer = setTimeout(() => {
    phase18UiModeState_.timer = 0;
    try{ phase18UiModeApply_(); }catch(err){ console.warn('Phase18 UI mode scheduled apply failed', err); }
  }, 45);
}

function phase18UiModeApply_(opts){
  const force = !!(opts && opts.force);
  const isAdv = phase18UiModeIsAdvanced_();

  try{ phase18UiModeEnsureTopbarButton_(); }catch{}
  phase18UiModeSetTabVisibility_('advanced-panels', isAdv);
  phase18UiModeSetTabVisibility_('portfolio', isAdv);
  try{ phase18UiModeDecorateDashboardFocusCard_(); }catch{}

  const activeTab = document.querySelector('.tab.is-active')?.dataset?.tab || '';
  if(!isAdv && (activeTab === 'advanced-panels' || activeTab === 'portfolio')){
    try{ switchTab('dashboard'); }catch{}
    return;
  }

  if(force){
    const hiddenNavActive = document.querySelector('.nav .nav__item.is-active.phase18uimode-hidden');
    if(hiddenNavActive){
      try{ switchTab('dashboard'); }catch{}
    }
  }
}

function phase18UiModeSetMode_(nextMode){
  const normalized = (String(nextMode || '').toLowerCase() === 'advanced') ? 'advanced' : 'basic';
  if(phase18UiModeState_.mode === normalized){
    try{ phase18UiModeApply_(); }catch{}
    return;
  }
  phase18UiModeState_.mode = normalized;
  phase18UiModeSave_();
  try{ phase18UiModeApply_({ force:true }); }catch{}
  try{
    if(typeof addActivity === 'function'){
      addActivity(`UI mode: ${normalized === 'advanced' ? 'Advanced' : 'Basic'}`);
    }
  }catch{}
}

function phase18UiModeToggle_(){
  phase18UiModeSetMode_(phase18UiModeIsAdvanced_() ? 'basic' : 'advanced');
}

function phase18UiModeWrapSwitchTab_(){
  if(phase18UiModeState_.switchWrapped) return;
  if(typeof switchTab !== 'function') return;
  const _orig = switchTab;
  switchTab = function(tabId){
    const nextTab = String(tabId || '');
    if(!phase18UiModeIsAdvanced_() && (nextTab === 'advanced-panels' || nextTab === 'portfolio')){
      phase18UiModeScheduleApply_();
      return _orig.call(this, 'dashboard');
    }
    const r = _orig.apply(this, arguments);
    phase18UiModeScheduleApply_();
    return r;
  };
  phase18UiModeState_.switchWrapped = true;
}

function phase18UiModeWrapRenderAll_(){
  if(phase18UiModeState_.renderWrapped) return;
  if(typeof renderAll !== 'function') return;
  const _orig = renderAll;
  renderAll = function(){
    const r = _orig.apply(this, arguments);
    phase18UiModeScheduleApply_();
    return r;
  };
  phase18UiModeState_.renderWrapped = true;
}

try{ initPhase18UiMode_(); }catch(err){ console.warn('Phase18 UI mode init failed', err); }

