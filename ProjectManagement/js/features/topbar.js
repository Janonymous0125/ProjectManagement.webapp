/* ---------------------------
   Topbar
---------------------------- */
function tickClock(){
  const d = new Date();
  ui.nowText.textContent = d.toLocaleTimeString([], { hour12:false });
}

function initTopbarDeclutter_(){
  const topbarRight = document.querySelector('#topbarRight') || document.querySelector('.topbar__right');
  if(!topbarRight) return;

  if(topbarRight._topbarDeclutterSync){
    try{ topbarRight._topbarDeclutterSync(); }catch(err){ console.warn('Topbar declutter resync failed', err); }
    return;
  }

  const hiddenClass = 'topbar__btn-hidden';
  const coreVisibleIds = new Set(['btnUndo', 'btnRedo', 'btnUiMode']);
  const exportIds = ['btnExportJson', 'btnExportMd', 'btnExportTxt'];
  const toolsFixedIds = ['btnWipe'];
  const advancedOnlyToolIds = new Set([
    'phase8BtnNotifications',
    'phase9BtnReminders',
    'phase10BtnRecovery',
    'phase11BtnSla',
    'phase11BtnDashViews',
    'phase12BtnRiskDigest',
    'phase12BtnCheckins',
    'phase13BtnAutomation',
    'phase15BtnRoles',
    'phase16BtnTeamProfiles'
  ]);
  const proxyMap = new Map();
  const menuRegistry = new Map();
  let autoIdSeq = 0;

  function ensureId_(el){
    if(!el) return '';
    if(el.id) return el.id;
    autoIdSeq += 1;
    el.id = `topbarAutoBtn_${autoIdSeq}`;
    return el.id;
  }

  function safeLabel_(el){
    const text = String((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
    return text || String(el?.title || 'Action').trim() || 'Action';
  }

  function mkMenu_(key, triggerLabel, anchorEl){
    const existing = topbarRight.querySelector(`.topbar-menu[data-menu-key="${key}"]`);
    if(existing && existing._pmDropdownInstance) return existing._pmDropdownInstance;

    const inst = (typeof pmDropdownCreate_ === 'function')
      ? pmDropdownCreate_({
          mount: topbarRight,
          anchor: anchorEl,
          triggerLabel,
          panelMinWidth: 220,
          rootClassName: 'topbar-menu',
          triggerClassName: 'topbar-menu__trigger',
          panelClassName: 'topbar-menu__panel',
          dataset: { menuKey: key }
        })
      : null;

    if(!inst) throw new Error('Shared dropdown component is not available');

    menuRegistry.set(key, inst);
    inst.trigger.addEventListener('click', () => {
      if(inst.isOpen()) syncProxyStates_();
    });
    return inst;
  }

  function closeMenus_(){
    menuRegistry.forEach((menu) => {
      try{ menu.close(); }catch{}
    });
  }

  const exportMenu = mkMenu_('export', 'Export ▾', document.getElementById('btnExportJson'));
  const toolsMenu = mkMenu_('tools', 'Tools ▾', document.getElementById('btnWipe'));

  function ensureSection_(menuInst, key, label){
    if(!menuInst || typeof menuInst.ensureSection !== 'function') return null;
    return menuInst.ensureSection(key, label, 'topbar-menu__section');
  }

  ensureSection_(exportMenu, 'exports', 'Exports');
  ensureSection_(toolsMenu, 'tools', 'Topbar Tools');

  function upsertProxy_(menuPanel, targetEl, opts){
    if(!menuPanel || !targetEl) return;
    if(targetEl.dataset.topbarProxy === '1') return;

    const targetId = ensureId_(targetEl);
    if(!targetId) return;

    let proxy = proxyMap.get(targetId);
    if(!proxy){
      proxy = document.createElement('button');
      proxy.type = 'button';
      proxy.className = 'btn btn--ghost pm-dropdown__item topbar-menu__item';
      proxy.dataset.topbarProxy = '1';
      proxy.dataset.proxyFor = targetId;
      proxy.addEventListener('click', () => {
        closeMenus_();
        const target = document.getElementById(targetId);
        if(target && !target.disabled){
          target.click();
        }
      });
      proxyMap.set(targetId, proxy);
      menuPanel.appendChild(proxy);
    }else if(proxy.parentElement !== menuPanel){
      menuPanel.appendChild(proxy);
    }

    targetEl.classList.add(hiddenClass);
    targetEl.setAttribute('aria-hidden', 'true');
    targetEl.tabIndex = -1;

    const label = opts && opts.label ? opts.label : safeLabel_(targetEl);
    proxy.textContent = label;
    proxy.title = String(targetEl.title || label);
    proxy.disabled = !!targetEl.disabled;
    const advancedOnly = !!((opts && opts.advancedOnly) || advancedOnlyToolIds.has(targetId));
    proxy.dataset.advancedOnly = advancedOnly ? '1' : '0';
    proxy.classList.toggle('btn--danger', !!(opts && opts.danger));
    proxy.classList.toggle('is-danger', !!(opts && opts.danger));
    if(opts && opts.danger){
      proxy.classList.remove('btn--ghost');
    }else{
      proxy.classList.add('btn--ghost');
      proxy.classList.remove('btn--danger');
      proxy.classList.remove('is-danger');
    }
  }

  function syncProxyStates_(){
    let isAdvMode = true;
    try{
      if(typeof phase18UiModeIsAdvanced_ === 'function') isAdvMode = !!phase18UiModeIsAdvanced_();
    }catch{}

    proxyMap.forEach((proxy, targetId) => {
      const target = document.getElementById(targetId);
      if(!target){
        proxy.remove();
        proxyMap.delete(targetId);
        return;
      }

      const isAdvancedOnly = (proxy.dataset.advancedOnly === '1') || advancedOnlyToolIds.has(targetId);
      const hiddenForMode = isAdvancedOnly && !isAdvMode;
      proxy.classList.toggle('phase18uimode-hidden', hiddenForMode);
      proxy.disabled = hiddenForMode || !!target.disabled;

      const nextLabel = safeLabel_(target);
      if(proxy.dataset.proxyFor && !proxy.dataset.customLabel){
        proxy.textContent = nextLabel;
      }
      if(target.classList) target.classList.add(hiddenClass);
    });
  }

  function syncMenus_(){
    exportIds.forEach((id) => {
      const el = document.getElementById(id);
      if(el) upsertProxy_(exportMenu.panel, el, { label: safeLabel_(el), danger:false });
    });

    toolsFixedIds.forEach((id) => {
      const el = document.getElementById(id);
      if(el) upsertProxy_(toolsMenu.panel, el, { label: safeLabel_(el), danger:true });
    });

    const directButtons = Array.from(topbarRight.children).filter((child) => child && child.tagName === 'BUTTON');
    directButtons.forEach((btn) => {
      if(btn.dataset.topbarProxy === '1') return;
      const id = ensureId_(btn);
      if(!id) return;
      if(coreVisibleIds.has(id)) return;
      if(exportIds.includes(id)) return;
      if(toolsFixedIds.includes(id)) return;
      upsertProxy_(toolsMenu.panel, btn, { label: safeLabel_(btn), danger: btn.classList.contains('btn--danger') });
    });

    syncProxyStates_();
  }

  let syncQueued = false;
  function queueSync_(){
    if(syncQueued) return;
    syncQueued = true;
    setTimeout(() => {
      syncQueued = false;
      syncMenus_();
    }, 0);
  }

  const observer = new MutationObserver((mutations) => {
    for(const m of mutations){
      if(m.type === 'childList'){
        queueSync_();
        return;
      }
    }
  });
  observer.observe(topbarRight, { childList:true });

  topbarRight._topbarDeclutterSync = syncMenus_;
  topbarRight._topbarDeclutterObserver = observer;

  syncMenus_();
}

function openPanelInOwningTab_(selector, fallbackTab, delay){
  const pickDelay = Number(delay);
  const waitMs = Number.isFinite(pickDelay) ? Math.max(0, pickDelay) : 40;
  const fallback = String(fallbackTab || 'dashboard');
  const findTarget = () => {
    try{ return document.querySelector(selector); }catch{ return null; }
  };
  const scrollWithTopPad_ = (node) => {
    if(!node) return;
    try{ scrollIntoViewWithTopPad_(node, { behavior:'smooth', block:'start' }, 18); }catch{}
  };

  let target = findTarget();
  let tabId = fallback;
  try{
    const ownerTab = target && target.closest ? target.closest('.tab[data-tab]') : null;
    const detected = ownerTab && ownerTab.dataset ? String(ownerTab.dataset.tab || '').trim() : '';
    if(detected) tabId = detected;
  }catch{}

  try{ switchTab(tabId); }catch{}

  setTimeout(() => {
    const node = findTarget();
    if(!node){
      if(fallback && tabId !== fallback){
        try{ switchTab(fallback); }catch{}
        setTimeout(() => {
          const fallbackNode = findTarget();
          if(fallbackNode) scrollWithTopPad_(fallbackNode);
        }, 30);
      }
      return;
    }
    scrollWithTopPad_(node);
  }, waitMs);
}

function scrollIntoViewWithTopPad_(node, opts, topPad){
  if(!node) return false;
  const padNum = Number(topPad);
  const pad = Number.isFinite(padNum) ? Math.max(0, Math.round(padNum)) : 18;
  const options = (opts && typeof opts === 'object') ? opts : {};
  const behavior = (typeof options.behavior === 'string' && options.behavior) ? options.behavior : 'auto';

  try{
    const tabScroller = node.closest ? node.closest('.tab') : null;
    if(tabScroller && typeof tabScroller.scrollTop === 'number'){
      const tabRect = tabScroller.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const delta = nodeRect.top - tabRect.top;
      const nextTop = Math.max(0, Math.round(tabScroller.scrollTop + delta - pad));
      tabScroller.scrollTo({ top: nextTop, behavior });
      return true;
    }
  }catch{}

  const native = scrollIntoViewWithTopPad_._native || null;
  try{
    if(typeof native === 'function'){
      const nextOpts = Object.assign({}, options, { block:'start', behavior });
      native.call(node, nextOpts);
    }else{
      node.scrollIntoView({ behavior, block:'start' });
    }
  }catch{}
  try{ window.scrollBy({ top: -pad, behavior }); }catch{}
  return true;
}

function installScrollIntoViewTopPadPatch_(){
  if(installScrollIntoViewTopPadPatch_._done) return;
  const proto = (typeof Element !== 'undefined' && Element.prototype) ? Element.prototype : null;
  if(!proto || typeof proto.scrollIntoView !== 'function') return;

  const native = proto.scrollIntoView;
  if(native && native._pmTopPadPatched){
    installScrollIntoViewTopPadPatch_._done = true;
    return;
  }

  scrollIntoViewWithTopPad_._native = native;

  const patched = function(arg){
    try{
      if(arg && typeof arg === 'object'){
        const block = String(arg.block || '').toLowerCase();
        if(block === 'start'){
          scrollIntoViewWithTopPad_(this, arg, 18);
          return;
        }
      }
    }catch{}
    return native.apply(this, arguments);
  };
  try{ patched._pmTopPadPatched = true; }catch{}
  proto.scrollIntoView = patched;
  installScrollIntoViewTopPadPatch_._done = true;
}

installScrollIntoViewTopPadPatch_();


function ensureUiDialogHost_(){
  if(typeof document === 'undefined') return null;
  let host = document.getElementById('pmUiDialogHost');
  if(host) return host;

  try{
    const style = document.createElement('style');
    style.id = 'pmUiDialogStyles';
    style.textContent = `
      body.pm-ui-dialog-open{overflow:hidden}
      .pm-ui-dialog{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999;padding:16px}
      .pm-ui-dialog.is-open,.pm-ui-dialog.is-closing{display:flex}
      .pm-ui-dialog__backdrop{
        position:absolute;inset:0;
        background:
          radial-gradient(900px 520px at 15% 10%, rgba(56,246,255,.08), transparent 58%),
          radial-gradient(900px 560px at 85% 88%, rgba(155,92,255,.10), transparent 62%),
          rgba(6,10,18,.76);
        backdrop-filter:blur(4px);
        opacity:0;
        will-change:opacity;
      }
      .pm-ui-dialog__card{
        position:relative;z-index:1;
        opacity:0;
        transform:translateY(10px) scale(.985);
        will-change:transform, opacity;
        width:min(620px,calc(100vw - 32px));max-width:620px;max-height:min(88vh,760px);overflow:auto;
        border-radius:16px;
        border:1px solid rgba(56,246,255,.18);
        background:
          radial-gradient(520px 180px at 14% 0%, rgba(56,246,255,.10), transparent 62%),
          radial-gradient(420px 180px at 88% 14%, rgba(155,92,255,.10), transparent 62%),
          linear-gradient(180deg, rgba(12,18,28,.96), rgba(10,18,28,.92));
        box-shadow:0 28px 72px rgba(0,0,0,.48), 0 0 0 1px rgba(155,92,255,.07) inset;
        padding:14px 14px 12px;
        color:var(--txt, #d7ecff);
      }
      .pm-ui-dialog__head{
        display:flex;align-items:center;justify-content:space-between;gap:10px;
        margin:0 0 10px;padding-bottom:8px;
        border-bottom:1px solid rgba(56,246,255,.08);
      }
      .pm-ui-dialog__kind{
        display:inline-flex;align-items:center;gap:6px;
        font-size:10px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
        border-radius:999px;padding:4px 9px;
        border:1px solid rgba(56,246,255,.20);
        background:rgba(10,18,28,.34);
        color:var(--muted, #8fb9d6);
        box-shadow:0 0 0 1px rgba(155,92,255,.05) inset;
      }
      .pm-ui-dialog[data-kind="alert"] .pm-ui-dialog__kind{
        border-color:rgba(56,246,255,.26);
        background:rgba(56,246,255,.09);
        color:rgba(215,236,255,.94);
      }
      .pm-ui-dialog[data-kind="confirm"] .pm-ui-dialog__kind{
        border-color:rgba(155,92,255,.28);
        background:rgba(155,92,255,.09);
        color:rgba(215,236,255,.94);
      }
      .pm-ui-dialog[data-kind="prompt"] .pm-ui-dialog__kind{
        border-color:rgba(56,246,255,.24);
        background:rgba(56,246,255,.07);
        color:rgba(215,236,255,.94);
      }
      .pm-ui-dialog[data-danger="1"] .pm-ui-dialog__kind{
        border-color:rgba(255,77,125,.34);
        background:rgba(255,77,125,.10);
        color:rgba(255,226,236,.96);
      }
      .pm-ui-dialog__title{
        font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
        color:rgba(215,236,255,.96);margin:0;
        font-family:var(--mono, ui-monospace);
      }
      .pm-ui-dialog__message{
        white-space:pre-wrap;line-height:1.5;font-size:13px;opacity:.98;
        color:rgba(215,236,255,.94);
      }
      .pm-ui-dialog__hint{
        margin-top:8px;font-size:11px;opacity:.92;
        color:var(--muted, #8fb9d6);
        font-family:var(--mono, ui-monospace);
      }
      .pm-ui-dialog__input{
        width:100%;margin-top:10px;padding:10px 12px;border-radius:12px;
        border:1px solid rgba(56,246,255,.14);
        background:rgba(10,18,28,.28);
        color:var(--txt, #d7ecff);
        font:inherit;
        box-shadow:0 0 0 1px rgba(155,92,255,.03) inset;
        outline:none;
      }
      .pm-ui-dialog__input::placeholder{color:rgba(143,185,214,.72)}
      .pm-ui-dialog__input:focus{
        border-color:rgba(56,246,255,.36);
        box-shadow:0 0 0 3px rgba(56,246,255,.10), 0 0 0 1px rgba(155,92,255,.10) inset;
      }
      .pm-ui-dialog__actions{
        display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap;
        padding-top:10px;border-top:1px solid rgba(56,246,255,.06);
      }
      .pm-ui-dialog__btn{
        appearance:none;border:1px solid rgba(56,246,255,.14);
        background:rgba(10,18,28,.28);
        color:rgba(215,236,255,.92);
        border-radius:12px;padding:9px 12px;
        font:12px var(--mono, ui-monospace);
        letter-spacing:.06em;
        cursor:pointer;min-width:84px;
        transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease;
      }
      .pm-ui-dialog__btn:hover{
        transform:translateY(-1px);
        border-color:rgba(56,246,255,.24);
        background:rgba(10,18,28,.40);
        box-shadow:0 0 18px rgba(56,246,255,.08);
      }
      .pm-ui-dialog__btn:active{transform:translateY(0)}
      .pm-ui-dialog__btn:focus-visible{
        outline:none;
        border-color:rgba(56,246,255,.34);
        box-shadow:0 0 0 3px rgba(56,246,255,.12), 0 0 0 1px rgba(155,92,255,.08) inset;
      }
      .pm-ui-dialog__btn--primary{
        background:linear-gradient(180deg, rgba(56,246,255,.18), rgba(56,246,255,.08));
        border-color:rgba(56,246,255,.26);
        color:rgba(215,236,255,.96);
      }
      .pm-ui-dialog__btn--primary:hover{
        border-color:rgba(56,246,255,.40);
        box-shadow:0 0 22px rgba(56,246,255,.12);
      }
      .pm-ui-dialog__btn--danger{
        background:linear-gradient(180deg, rgba(255,77,125,.18), rgba(255,77,125,.08));
        border-color:rgba(255,77,125,.26);
        color:rgba(255,235,241,.97);
      }
      .pm-ui-dialog__btn--danger:hover{
        border-color:rgba(255,77,125,.40);
        box-shadow:0 0 22px rgba(255,77,125,.12);
      }

      .pm-ui-dialog.is-open .pm-ui-dialog__backdrop{animation:pmUiDialogBackdropIn .16s ease-out forwards}
      .pm-ui-dialog.is-open .pm-ui-dialog__card{animation:pmUiDialogCardIn .18s cubic-bezier(.2,.8,.2,1) forwards}
      .pm-ui-dialog.is-closing .pm-ui-dialog__backdrop{animation:pmUiDialogBackdropOut .12s ease-in forwards}
      .pm-ui-dialog.is-closing .pm-ui-dialog__card{animation:pmUiDialogCardOut .14s ease-in forwards}
      @keyframes pmUiDialogBackdropIn{from{opacity:0}to{opacity:1}}
      @keyframes pmUiDialogBackdropOut{from{opacity:1}to{opacity:0}}
      @keyframes pmUiDialogCardIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
      @keyframes pmUiDialogCardOut{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(6px) scale(.992)}}
      @media (prefers-reduced-motion: reduce){
        .pm-ui-dialog.is-open .pm-ui-dialog__backdrop,
        .pm-ui-dialog.is-open .pm-ui-dialog__card,
        .pm-ui-dialog.is-closing .pm-ui-dialog__backdrop,
        .pm-ui-dialog.is-closing .pm-ui-dialog__card{animation:none !important;opacity:1;transform:none}
        .pm-ui-dialog.is-closing .pm-ui-dialog__backdrop,
        .pm-ui-dialog.is-closing .pm-ui-dialog__card{opacity:0}
      }
    `;
    document.head.appendChild(style);
  }catch{}

  host = document.createElement('div');
  host.id = 'pmUiDialogHost';
  host.className = 'pm-ui-dialog';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = `
    <div class="pm-ui-dialog__backdrop" data-act="backdrop"></div>
    <div class="pm-ui-dialog__card" role="dialog" aria-modal="true" aria-labelledby="pmUiDialogTitle" aria-describedby="pmUiDialogMessage">
      <div class="pm-ui-dialog__head">
        <div class="pm-ui-dialog__title" id="pmUiDialogTitle">Message</div>
        <div class="pm-ui-dialog__kind" id="pmUiDialogKind">Notice</div>
      </div>
      <div class="pm-ui-dialog__message" id="pmUiDialogMessage"></div>
      <div class="pm-ui-dialog__hint" id="pmUiDialogHint" style="display:none"></div>
      <input class="pm-ui-dialog__input" id="pmUiDialogInput" type="text" autocomplete="off" style="display:none">
      <div class="pm-ui-dialog__actions" id="pmUiDialogActions"></div>
    </div>
  `;
  host.addEventListener('click', (ev) => {
    if(ev.target && ev.target.dataset && ev.target.dataset.act === 'backdrop'){
      const cancel = host._pmUiDialogCancel;
      if(typeof cancel === 'function') cancel();
    }
  });
  document.body.appendChild(host);
  return host;
}

function pmDialogNormalizeMeta_(kind, opts){
  const messageRaw = String(opts?.message ?? '').trim();
  const msgLine1 = messageRaw.split(/\n+/).map(v => v.trim()).find(Boolean) || '';
  const hasTitle = typeof opts?.title === 'string' && opts.title.trim();
  const dangerExplicit = Object.prototype.hasOwnProperty.call(opts || {}, 'danger');
  const lower = msgLine1.toLowerCase();

  const looksDelete = /\b(delete|remove|wipe|clear|purge|reset|discard)\b/.test(lower);
  const looksRestore = /\brestore|recover\b/.test(lower);
  const looksImport = /\bimport\b/.test(lower);
  const looksExport = /\bexport\b/.test(lower);
  const looksSave = /\bsave|create|clone|rename|apply\b/.test(lower);
  const looksRepair = /\brepair|fix\b/.test(lower);
  const looksSnooze = /\bsnooze\b/.test(lower);
  const looksHours = /\bhours?\b/.test(lower);
  const looksFormat = /\btxt\b|\bjson\b|\bmd\b|\bformat\b/.test(lower);
  const looksName = /\bname\b/.test(lower);

  let title = hasTitle ? String(opts.title).trim() : '';
  let okText = (typeof opts?.okText === 'string' && opts.okText.trim()) ? String(opts.okText).trim() : '';
  let cancelText = (typeof opts?.cancelText === 'string' && opts.cancelText.trim()) ? String(opts.cancelText).trim() : 'Cancel';
  let placeholder = (typeof opts?.placeholder === 'string' && opts.placeholder.trim()) ? String(opts.placeholder).trim() : '';
  let hint = (typeof opts?.hint === 'string' && opts.hint.trim()) ? String(opts.hint).trim() : '';
  let danger = dangerExplicit ? !!opts.danger : false;

  if(!title){
    if(kind === 'alert') title = 'Notice';
    else if(kind === 'confirm') title = 'Confirm Action';
    else title = 'Input Required';
    if(looksDelete) title = 'Delete';
    else if(/\bwipe\b/.test(lower)) title = 'Wipe Data';
    else if(/\bclear\b/.test(lower)) title = 'Clear';
    else if(looksRestore) title = 'Restore';
    else if(looksImport) title = 'Import';
    else if(looksExport) title = 'Export';
    else if(looksRepair) title = 'Repair';
    else if(looksSnooze) title = 'Snooze';
    else if(looksName && kind === 'prompt') title = 'Name';
  }

  if(!okText){
    if(kind === 'alert') okText = 'OK';
    else if(kind === 'prompt') okText = 'Save';
    else okText = 'Confirm';
    if(looksDelete) okText = 'Delete';
    else if(/\bwipe\b/.test(lower)) okText = 'Wipe';
    else if(looksRestore) okText = 'Restore';
    else if(looksImport) okText = 'Import';
    else if(looksExport) okText = 'Export';
    else if(looksRepair) okText = 'Repair';
    else if(/\bclear\b/.test(lower)) okText = 'Clear';
    else if(/\bapply\b/.test(lower)) okText = 'Apply';
    else if(/\bsave|create|clone\b/.test(lower)) okText = 'Save';
    else if(/\brename\b/.test(lower)) okText = 'Rename';
    else if(/\bcontinue\b/.test(lower)) okText = 'Continue';
    else if(/\bmark done\b/.test(lower)) okText = 'Mark Done';
    else if(looksSnooze) okText = 'Snooze';
  }

  if(!danger && (looksDelete || /\bwipe\b/.test(lower) || /\bpurge\b/.test(lower) || (/\bclear\b/.test(lower) && kind === 'confirm'))){
    danger = true;
  }

  if(kind === 'prompt' && !placeholder){
    if(looksFormat) placeholder = 'e.g. TXT, JSON, or MD';
    else if(looksHours) placeholder = 'Hours';
    else if(looksName) placeholder = 'Name';
    else if(/\bdays?\b/.test(lower)) placeholder = 'Days';
    else if(/\bassignees?\b/.test(lower)) placeholder = 'Alice, Bob';
    else placeholder = 'Enter value';
  }

  if(kind === 'prompt' && !hint){
    hint = 'Press Enter to confirm • Esc to cancel';
  }else if((kind === 'confirm' || kind === 'alert') && !hint){
    hint = 'Press Enter to confirm • Esc to cancel';
  }

  return {
    kind,
    message: messageRaw,
    title,
    okText,
    cancelText,
    placeholder,
    hint,
    danger,
    defaultValue: opts?.defaultValue == null ? '' : String(opts.defaultValue)
  };
}

function pmUiDialogAsk_(opts){
  if(!pmUiDialogAsk_._queue) pmUiDialogAsk_._queue = Promise.resolve();
  const job = () => new Promise((resolve) => {
    const host = ensureUiDialogHost_();
    const kind0 = String(opts?.kind || 'alert');
    const polished0 = pmDialogNormalizeMeta_(kind0, opts || {});
    if(!host){
      const msg0 = polished0.message;
      const def0 = polished0.defaultValue;
      if(kind0 === 'confirm'){ resolve(window.confirm ? window.confirm(msg0) : false); return; }
      if(kind0 === 'prompt'){ resolve(window.prompt ? window.prompt(msg0, def0) : null); return; }
      try{ if(window._pmNativeAlert) window._pmNativeAlert(msg0); else if(window.alert) window.alert(msg0); }catch{}
      resolve(undefined);
      return;
    }

    const kind = polished0.kind;
    const title = polished0.title;
    const message = polished0.message;
    const defaultValue = polished0.defaultValue;
    const placeholder = polished0.placeholder;
    const hint = polished0.hint;
    const danger = polished0.danger;
    const okText = polished0.okText;
    const cancelText = polished0.cancelText;
    const titleEl = host.querySelector('#pmUiDialogTitle');
    const kindEl = host.querySelector('#pmUiDialogKind');
    const msgEl = host.querySelector('#pmUiDialogMessage');
    const hintEl = host.querySelector('#pmUiDialogHint');
    const inputEl = host.querySelector('#pmUiDialogInput');
    const actionsEl = host.querySelector('#pmUiDialogActions');
    const previouslyFocused = document.activeElement && document.activeElement.focus ? document.activeElement : null;

    host.dataset.kind = kind;
    host.dataset.danger = danger ? '1' : '0';
    if(titleEl) titleEl.textContent = title;
    if(kindEl) kindEl.textContent = kind === 'confirm' ? 'Confirm' : kind === 'prompt' ? 'Input' : 'Notice';
    if(msgEl) msgEl.textContent = message;
    if(hintEl){
      hintEl.textContent = hint || '';
      hintEl.style.display = hint ? '' : 'none';
    }
    if(actionsEl) actionsEl.innerHTML = '';
    if(inputEl){
      inputEl.value = defaultValue;
      inputEl.placeholder = placeholder;
      inputEl.style.display = kind === 'prompt' ? '' : 'none';
    }

    let settled = false;
    const finish = (value) => {
      if(settled) return;
      settled = true;
      const closeMs = 150;
      const finalizeClose = () => {
        host.classList.remove('is-open');
        host.classList.remove('is-closing');
        host.setAttribute('aria-hidden', 'true');
        try{ document.body.classList.remove('pm-ui-dialog-open'); }catch{}
        host._pmUiDialogCancel = null;
        document.removeEventListener('keydown', onKey, true);
        setTimeout(() => { try{ previouslyFocused && previouslyFocused.focus && previouslyFocused.focus(); }catch{} }, 0);
        resolve(value);
      };
      try{ if(host._pmUiDialogCloseTimer){ clearTimeout(host._pmUiDialogCloseTimer); host._pmUiDialogCloseTimer = null; } }catch{}
      if(host.classList.contains('is-open')){
        host.classList.remove('is-open');
        host.classList.add('is-closing');
        host._pmUiDialogCloseTimer = setTimeout(() => {
          try{ host._pmUiDialogCloseTimer = null; }catch{}
          finalizeClose();
        }, closeMs);
        return;
      }
      finalizeClose();
    };
    const cancel = () => {
      if(kind === 'prompt') finish(null);
      else if(kind === 'confirm') finish(false);
      else finish(undefined);
    };
    host._pmUiDialogCancel = cancel;

    const mkBtn = (label, type) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pm-ui-dialog__btn';
      if(type === 'primary') btn.classList.add('pm-ui-dialog__btn--primary');
      if(type === 'danger') btn.classList.add('pm-ui-dialog__btn--danger');
      btn.textContent = label;
      return btn;
    };

    if(kind === 'confirm' || kind === 'prompt'){
      const cancelBtn = mkBtn(cancelText, 'secondary');
      cancelBtn.addEventListener('click', cancel);
      actionsEl && actionsEl.appendChild(cancelBtn);
    }
    const okBtn = mkBtn(okText, danger ? 'danger' : 'primary');
    okBtn.addEventListener('click', () => {
      if(kind === 'prompt') finish(inputEl ? inputEl.value : '');
      else if(kind === 'confirm') finish(true);
      else finish(undefined);
    });
    actionsEl && actionsEl.appendChild(okBtn);

    const onKey = (ev) => {
      if(!host.classList.contains('is-open')) return;
      if(ev.key === 'Escape'){
        ev.preventDefault();
        cancel();
        return;
      }
      if(kind === 'prompt' && ev.key === 'Enter' && ev.target === inputEl){
        ev.preventDefault();
        finish(inputEl ? inputEl.value : '');
        return;
      }
      if((kind === 'confirm' || kind === 'alert') && ev.key === 'Enter'){
        if(ev.target && ev.target.tagName === 'BUTTON') return;
        ev.preventDefault();
        if(kind === 'confirm') finish(true); else finish(undefined);
      }
    };
    document.addEventListener('keydown', onKey, true);

    try{ if(host._pmUiDialogCloseTimer){ clearTimeout(host._pmUiDialogCloseTimer); host._pmUiDialogCloseTimer = null; } }catch{}
    host.classList.remove('is-closing');
    host.classList.add('is-open');
    host.setAttribute('aria-hidden', 'false');
    try{ document.body.classList.add('pm-ui-dialog-open'); }catch{}
    setTimeout(() => {
      try{
        if(kind === 'prompt' && inputEl){ inputEl.focus(); inputEl.select(); }
        else { okBtn.focus(); }
      }catch{}
    }, 0);
  });

  const chain = pmUiDialogAsk_._queue.then(job, job);
  pmUiDialogAsk_._queue = chain.then(()=>undefined, ()=>undefined);
  return chain;
}

function pmAlertDialog_(message, opts){
  return pmUiDialogAsk_(Object.assign({ title:'Notice', okText:'OK' }, opts || {}, { kind:'alert', message:String(message || '') }));
}
function pmConfirmDialog_(message, opts){
  return pmUiDialogAsk_(Object.assign({ cancelText:'Cancel' }, opts || {}, { kind:'confirm', message:String(message || '') }));
}
function pmPromptDialog_(message, defaultValue, opts){
  return pmUiDialogAsk_(Object.assign({ cancelText:'Cancel' }, opts || {}, { kind:'prompt', message:String(message || ''), defaultValue: defaultValue == null ? '' : String(defaultValue) }));
}

function installUiAlertPatch_(){
  if(installUiAlertPatch_._done) return;
  const nativeAlert = window.alert ? window.alert.bind(window) : null;
  window.pmAlertDialog_ = pmAlertDialog_;
  window.pmConfirmDialog_ = pmConfirmDialog_;
  window.pmPromptDialog_ = pmPromptDialog_;
  if(nativeAlert){
    window._pmNativeAlert = nativeAlert;
    window.alert = function(message){
      try{ pmAlertDialog_(message, { title:'Notice' }); }
      catch(err){ try{ nativeAlert(message); }catch{} }
    };
  }
  installUiAlertPatch_._done = true;
}

try{ installUiAlertPatch_(); }catch(err){ console.warn('UI dialog patch failed', err); }

function wireTopbar(){
  ui.btnWipe.addEventListener("click", async () => {
    const ok = await pmConfirmDialog_('Wipe all local PM data? (This only clears localStorage)', { title:'Confirm Wipe', okText:'Wipe', danger:true });
    if(!ok) return;
    state = mkEmptyState();
    undoStack_ = [];
    redoStack_ = [];
    historyBaselineJson_ = JSON.stringify(state);
    pendingSavePayload_ = null;
    if(saveDebounceTimer_){ clearTimeout(saveDebounceTimer_); saveDebounceTimer_ = null; }
    try{
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_BACKUPS_KEY);
      localStorage.removeItem(STORAGE_EXPORT_CACHE_KEY);
    }catch{
      pulseSaveError("MEM ONLY");
    }
    importCandidate = null;
    addActivity("Local PM data wiped");
    renderAll();
    pulseSaved();
  });

  if(ui.btnUndo){
    ui.btnUndo.addEventListener("click", () => undoState_());
  }
  if(ui.btnRedo){
    ui.btnRedo.addEventListener("click", () => redoState_());
  }

  ui.btnExportJson.addEventListener("click", () => {
    flushPendingSave_(true);
    const payload = JSON.stringify(state, null, 2);
    const filename = buildStampedFilename_("stark_pm_export", ".json");
    cacheLastExport_(filename, payload, "application/json", "json");
    downloadText(filename, payload, "application/json");
    addActivity("Exported JSON: " + filename);
    saveState({ immediate:true });
  });

  ui.btnExportMd.addEventListener("click", () => {
    flushPendingSave_(true);
    const p = getExportProject_();
    if(!p) return;
    const payload = serializeProjectToMarkdown_(p);
    const filename = buildStampedFilename_(sanitizeFilename_(p.name), ".md");
    cacheLastExport_(filename, payload, "text/markdown", "md");
    downloadText(filename, payload, "text/markdown");
    addActivity("Exported MD: " + filename);
    saveState({ immediate:true });
  });

  ui.btnExportTxt.addEventListener("click", () => {
    flushPendingSave_(true);
    const p = getExportProject_();
    if(!p) return;
    const payload = serializeProjectToText_(p);
    const filename = buildStampedFilename_(sanitizeFilename_(p.name), ".txt");
    cacheLastExport_(filename, payload, "text/plain", "txt");
    downloadText(filename, payload, "text/plain");
    addActivity("Exported TXT: " + filename);
    saveState({ immediate:true });
  });

  ui.btnQuickNewProject.addEventListener("click", () => {
    switchTab("projects");
    newProject();
  });

  ui.btnQuickGoImport.addEventListener("click", () => {
    switchTab("import");
    ui.pasteArea.focus();
  });

  initTopbarDeclutter_();
}

