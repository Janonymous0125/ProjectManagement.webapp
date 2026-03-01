/* ---------------------------
   Phase 19 — Render Hook Registry Stabilizer (Milestone 5)
   - Central post-render hook registry for Dashboard + Checklist
   - Keeps future UI cleanup hooks out of render wrapper chains
   - Registers late UI cleanup schedulers via the registry
---------------------------- */
const phase19RenderHookState_ = {
  inited: false,
  wrapped: { dashboard:false, checklist:false },
  surfaces: { dashboard: new Map(), checklist: new Map() },
  baseFns: { dashboard: null, checklist: null }
};

function initPhase19RenderHookStabilizer_(){
  if(phase19RenderHookState_.inited) return;
  phase19RenderHookState_.inited = true;

  try{ phase19RenderHookExposeApi_(); }catch(err){ console.warn('Phase19 render hook API failed', err); }
  try{ phase19RenderHookWrapSurface_('dashboard'); }catch(err){ console.warn('Phase19 dashboard wrap failed', err); }
  try{ phase19RenderHookWrapSurface_('checklist'); }catch(err){ console.warn('Phase19 checklist wrap failed', err); }

  // Register known late-phase UI cleanup tasks so they run through one registry.
  try{
    if(typeof phase16PolishSchedule_ === 'function'){
      phase19PostRenderRegister_('dashboard', 'phase16-polish-cleanup', ()=>{ try{ phase16PolishSchedule_(); }catch{} }, { order: 60 });
    }
  }catch(err){ console.warn('Phase19 register phase16 hook failed', err); }

  try{
    if(typeof phase18UiModeScheduleApply_ === 'function'){
      const applyMode = ()=>{ try{ phase18UiModeScheduleApply_(); }catch{} };
      phase19PostRenderRegister_('dashboard', 'phase18-ui-mode', applyMode, { order: 80 });
      phase19PostRenderRegister_('checklist', 'phase18-ui-mode', applyMode, { order: 80 });
    }
  }catch(err){ console.warn('Phase19 register phase18 hook failed', err); }
}

function phase19RenderHookSurfaceFnName_(surface){
  return surface === 'dashboard' ? 'renderDashboard' : (surface === 'checklist' ? 'renderChecklist' : '');
}

function phase19RenderHookExposeApi_(){
  const api = window.StarkPMPostRenderHooks || {};
  api.version = 'phase19';
  api.register = phase19PostRenderRegister_;
  api.unregister = phase19PostRenderUnregister_;
  api.list = phase19PostRenderList_;
  api.run = phase19PostRenderRun_;
  window.StarkPMPostRenderHooks = api;
}

function phase19PostRenderRegister_(surface, key, fn, opts){
  const surf = String(surface || '').toLowerCase();
  if(!(surf in phase19RenderHookState_.surfaces)) return false;
  if(typeof fn !== 'function') return false;
  const id = String(key || `hook_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
  const order = Number((opts && opts.order) ?? 100);
  phase19RenderHookState_.surfaces[surf].set(id, {
    key: id,
    fn,
    order: Number.isFinite(order) ? order : 100,
    enabled: (opts && opts.enabled === false) ? false : true
  });
  return true;
}

function phase19PostRenderUnregister_(surface, key){
  const surf = String(surface || '').toLowerCase();
  const id = String(key || '');
  const map = phase19RenderHookState_.surfaces[surf];
  if(!map) return false;
  return map.delete(id);
}

function phase19PostRenderList_(surface){
  const surf = String(surface || '').toLowerCase();
  const map = phase19RenderHookState_.surfaces[surf];
  if(!map) return [];
  return Array.from(map.values())
    .map(h => ({ key:h.key, order:h.order, enabled:!!h.enabled }))
    .sort((a,b)=> (a.order - b.order) || String(a.key).localeCompare(String(b.key)));
}

function phase19PostRenderRun_(surface, ctx){
  const surf = String(surface || '').toLowerCase();
  const map = phase19RenderHookState_.surfaces[surf];
  if(!map || !map.size) return;
  const list = Array.from(map.values())
    .filter(h => h && h.enabled !== false && typeof h.fn === 'function')
    .sort((a,b)=> (a.order - b.order) || String(a.key).localeCompare(String(b.key)));
  for(const hook of list){
    try{ hook.fn(ctx || {}); }
    catch(err){ console.warn(`Phase19 post-render hook failed (${surf}:${hook.key})`, err); }
  }
}

function phase19RenderHookWrapSurface_(surface){
  const surf = String(surface || '').toLowerCase();
  if(!(surf in phase19RenderHookState_.wrapped)) return;
  if(phase19RenderHookState_.wrapped[surf]) return;

  const fnName = phase19RenderHookSurfaceFnName_(surf);
  if(!fnName || typeof window[fnName] !== 'function') return;

  const currentFn = window[fnName];
  if(currentFn && currentFn._phase19PostRenderWrapper){
    phase19RenderHookState_.wrapped[surf] = true;
    return;
  }

  phase19RenderHookState_.baseFns[surf] = currentFn;

  const wrappedFn = function(){
    const result = currentFn.apply(this, arguments);
    try{
      phase19PostRenderRun_(surf, {
        surface: surf,
        args: Array.from(arguments || []),
        result,
        activeTab: document.querySelector('.tab.is-active')?.dataset?.tab || ''
      });
    }catch(err){
      console.warn(`Phase19 post-render runner failed (${surf})`, err);
    }
    return result;
  };
  wrappedFn._phase19PostRenderWrapper = true;
  wrappedFn._phase19PostRenderSurface = surf;
  wrappedFn._phase19PostRenderBase = currentFn;

  window[fnName] = wrappedFn;
  phase19RenderHookState_.wrapped[surf] = true;
}

try{ initPhase19RenderHookStabilizer_(); }catch(err){ console.warn('Phase19 render hook stabilizer init failed', err); }



