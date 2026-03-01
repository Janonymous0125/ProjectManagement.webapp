/* ---------------------------
   Phase 15 RBAC-lite Approval Profiles (Additive Patch)
   - Role profiles: Owner / Reviewer / Executor
   - Approval permissions for task/milestone approval + lock actions
   - Per-milestone approval policy (require review before approve, role gates)
   - Lock override reason (required on unlock)
---------------------------- */
var PHASE15_RBAC_CFG_KEY = 'stark_pm_phase15_rbac_cfg_v1';
var PHASE15_SESSION_KEY = 'stark_pm_phase15_session_v1';
var phase15State_ = { inited:false, cfg:null, session:null };

function initPhase15_(){
  if(phase15State_.inited) return;
  phase15State_.inited = true;
  try{ phase15EnsureStyles_(); }catch(err){ console.warn('Phase15 styles failed', err); }
  try{ phase15PatchSanitizers_(); }catch(err){ console.warn('Phase15 sanitizer patch failed', err); }
  try{ phase15WrapCore_(); }catch(err){ console.warn('Phase15 core wrap failed', err); }
  try{ phase15WrapApprovalActions_(); }catch(err){ console.warn('Phase15 approval wrap failed', err); }
  try{ phase15EnsureTopbarButton_(); }catch(err){ console.warn('Phase15 topbar failed', err); }
  try{ phase15PostRenderDashboard_(); }catch{}
  try{ phase15PostRenderMilestones_(); }catch{}
  try{ phase15PostRenderChecklist_(); }catch{}
}

function phase15EnsureStyles_(){
  if(document.querySelector('#phase15Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase15Styles';
  st.textContent = `
    .phase15-box{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    .phase15-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9;margin-bottom:8px}
    .phase15-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:10px}
    .phase15-card{border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px;background:rgba(255,255,255,.012)}
    .phase15-toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .phase15-note{font-size:11px;opacity:.8;line-height:1.35}
    .phase15-kv{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:8px}
    .phase15-kv>div{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase15-kv b{display:block;font-size:10px;opacity:.72;letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px}
    .phase15-kv span{font-size:13px;font-weight:800}
    .phase15-fields{display:grid;gap:8px}
    .phase15-fields .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .phase15-list{display:grid;gap:8px;margin-top:8px}
    .phase15-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase15-row__name{font-size:12px;font-weight:700}
    .phase15-row__meta{font-size:11px;opacity:.78;line-height:1.3}
    .phase15-tags{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .phase15-tag{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:2px 7px;font-size:10px;letter-spacing:.05em;text-transform:uppercase}
    .phase15-tag.owner{border-color:rgba(105,255,200,.28);color:#bbfff0}
    .phase15-tag.reviewer{border-color:rgba(255,191,92,.28);color:#ffe0ac}
    .phase15-tag.executor{border-color:rgba(160,190,255,.22);color:#d7e2ff}
    .phase15-tag.warn{border-color:rgba(255,120,120,.28);color:#ffd0d0}
    .phase15-pre{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;line-height:1.35;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.14);margin-top:8px;max-height:220px;overflow:auto}
    .phase15-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}
    .phase15-table th,.phase15-table td{padding:6px 7px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left;vertical-align:top}
    .phase15-inlineHelp{font-size:11px;opacity:.76}
    .phase15-compact select,.phase15-compact input{max-width:100%}
    @media (max-width:980px){ .phase15-grid{grid-template-columns:1fr} .phase15-kv{grid-template-columns:1fr 1fr} .phase15-fields .row{grid-template-columns:1fr} }
    @media (max-width:640px){ .phase15-kv{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase15DefaultCfg_(){
  return {
    defaultPolicy: {
      requireReviewBeforeApprove: true,
      taskApproverRole: 'owner_reviewer',    // owner | owner_reviewer
      milestoneApproverRole: 'owner_reviewer',
      taskLockRole: 'owner_reviewer',         // owner | owner_reviewer
      milestoneLockRole: 'owner',             // owner | owner_reviewer
      autoLockTaskOnApprove: false,
      autoLockMilestoneOnApprove: false,
      requireUnlockReason: true,
    }
  };
}
function phase15DefaultSession_(){
  return { role:'owner', name:'ME' };
}
function phase15LoadCfg_(){
  if(phase15State_.cfg) return phase15State_.cfg;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE15_RBAC_CFG_KEY) || 'null'); }catch{}
  const d = phase15DefaultCfg_();
  const cfg = {
    defaultPolicy: phase15NormalizePolicy_(raw && raw.defaultPolicy, d.defaultPolicy)
  };
  phase15State_.cfg = cfg;
  return cfg;
}
function phase15SaveCfg_(){ try{ localStorage.setItem(PHASE15_RBAC_CFG_KEY, JSON.stringify(phase15LoadCfg_())); }catch{} }
function phase15LoadSession_(){
  if(phase15State_.session) return phase15State_.session;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE15_SESSION_KEY) || 'null'); }catch{}
  const d = phase15DefaultSession_();
  phase15State_.session = {
    role: phase15NormRole_(raw && raw.role || d.role),
    name: String(raw && raw.name || d.name || 'ME').trim().slice(0,48) || 'ME'
  };
  return phase15State_.session;
}
function phase15SaveSession_(){ try{ localStorage.setItem(PHASE15_SESSION_KEY, JSON.stringify(phase15LoadSession_())); }catch{} }

function phase15NormRole_(r){
  const s = String(r||'owner').toLowerCase();
  return (s==='reviewer' || s==='executor') ? s : 'owner';
}
function phase15NormalizePolicy_(p, fallback){
  const fb = fallback || (phase15DefaultCfg_().defaultPolicy);
  p = p || {};
  const pick = (v, allowed, def) => allowed.includes(String(v||'')) ? String(v) : def;
  return {
    requireReviewBeforeApprove: p.requireReviewBeforeApprove !== undefined ? !!p.requireReviewBeforeApprove : !!fb.requireReviewBeforeApprove,
    taskApproverRole: pick(p.taskApproverRole, ['owner','owner_reviewer'], fb.taskApproverRole),
    milestoneApproverRole: pick(p.milestoneApproverRole, ['owner','owner_reviewer'], fb.milestoneApproverRole),
    taskLockRole: pick(p.taskLockRole, ['owner','owner_reviewer'], fb.taskLockRole),
    milestoneLockRole: pick(p.milestoneLockRole, ['owner','owner_reviewer'], fb.milestoneLockRole),
    autoLockTaskOnApprove: p.autoLockTaskOnApprove !== undefined ? !!p.autoLockTaskOnApprove : !!fb.autoLockTaskOnApprove,
    autoLockMilestoneOnApprove: p.autoLockMilestoneOnApprove !== undefined ? !!p.autoLockMilestoneOnApprove : !!fb.autoLockMilestoneOnApprove,
    requireUnlockReason: p.requireUnlockReason !== undefined ? !!p.requireUnlockReason : !!fb.requireUnlockReason,
  };
}
function phase15PatchSanitizers_(){
  if(typeof sanitizeMilestone === 'function' && !sanitizeMilestone._phase15WrappedPolicy){
    const _orig = sanitizeMilestone;
    sanitizeMilestone = function(m){
      const out = _orig(m);
      const dpol = phase15LoadCfg_().defaultPolicy;
      out.approvalPolicy = phase15NormalizePolicy_(m && m.approvalPolicy, dpol);
      return out;
    };
    sanitizeMilestone._phase15WrappedPolicy = true;
  }
  if(typeof mkMilestone === 'function' && !mkMilestone._phase15WrappedPolicy){
    const _orig = mkMilestone;
    mkMilestone = function(){
      const m = _orig.apply(this, arguments);
      try{ m.approvalPolicy = phase15NormalizePolicy_(m.approvalPolicy, phase15LoadCfg_().defaultPolicy); }catch{}
      return m;
    };
    mkMilestone._phase15WrappedPolicy = true;
  }
}
function phase15GetMilestonePolicy_(ms){
  const dpol = phase15LoadCfg_().defaultPolicy;
  if(!ms || typeof ms !== 'object') return phase15NormalizePolicy_(null, dpol);
  ms.approvalPolicy = phase15NormalizePolicy_(ms.approvalPolicy, dpol);
  return ms.approvalPolicy;
}

function phase15PolicyRoleAllows_(rule, role){
  role = phase15NormRole_(role);
  rule = String(rule || 'owner');
  if(rule === 'owner_reviewer') return role === 'owner' || role === 'reviewer';
  return role === 'owner';
}
function phase15CanAction_(action, ctx){
  const role = phase15LoadSession_().role;
  const ms = ctx && ctx.ms;
  const pol = phase15GetMilestonePolicy_(ms);
  if(action === 'task_request_review') return role === 'owner' || role === 'reviewer' || role === 'executor';
  if(action === 'task_approve' || action === 'task_rework') return phase15PolicyRoleAllows_(pol.taskApproverRole, role);
  if(action === 'task_lock_toggle') return phase15PolicyRoleAllows_(pol.taskLockRole, role) || role === 'owner'; // owner override
  if(action === 'ms_request_review') return role === 'owner' || role === 'reviewer';
  if(action === 'ms_approve' || action === 'ms_rework') return phase15PolicyRoleAllows_(pol.milestoneApproverRole, role);
  if(action === 'ms_lock_toggle') return phase15PolicyRoleAllows_(pol.milestoneLockRole, role) || role === 'owner';
  if(action === 'policy_edit' || action === 'defaults_edit') return role === 'owner';
  return false;
}
function phase15Deny_(msg, extra){
  try{ addActivity(`Phase15 permission denied${extra ? ' • ' + extra : ''}`); }catch{}
  alert(msg || 'Phase 15 permission denied for current role.');
}
function phase15StampOverride_(ctx, payload){
  const who = phase15LoadSession_().name || 'ME';
  const note = String(payload && payload.note || '').trim();
  try{
    if(typeof phase14LogApprovalAction_ === 'function'){
      phase14LogApprovalAction_(ctx || {}, {
        targetType: payload.targetType || (ctx && ctx.t ? 'task' : 'milestone'),
        action: payload.action || 'override',
        targetId: payload.targetId || (ctx && (ctx.t?.id || ctx.ms?.id)) || '',
        title: payload.title || (ctx && (ctx.t?.title || ctx.ms?.title)) || '',
        state: payload.state || '',
        locked: !!payload.locked,
        note: `${who}${note ? ' • ' + note : ''}`.slice(0,280)
      });
      return;
    }
  }catch{}
  try{ addActivity(`Phase15 override by ${who}${note ? ' • ' + note : ''}`); }catch{}
}
function phase15SetReviewerNames_(){
  const session = phase15LoadSession_();
  if(!session.name) return;
  const p = getActiveProject && getActiveProject();
  const ms = p ? getActiveMilestone(p) : null;
  if(!ms) return;
  let changed = false;
  for(const t of (ms.tasks || [])){
    const a = (typeof phase14TaskApproval_ === 'function') ? phase14TaskApproval_(t) : (t && t.approval);
    if(a && a.state === 'approved' && a.approvedAt && (!a.reviewer || a.reviewer === 'ME')){ a.reviewer = session.name; changed = true; }
  }
  try{
    const ma = (typeof phase14MilestoneApproval_ === 'function') ? phase14MilestoneApproval_(ms) : (ms && ms.approval);
    if(ma && ma.state === 'approved' && ma.approvedAt && (!ma.reviewer || ma.reviewer === 'ME')){ ma.reviewer = session.name; changed = true; }
  }catch{}
  if(changed){ try{ saveState({ skipHistory:true }); }catch{} }
}

function phase15WrapApprovalActions_(){
  if(typeof phase14SetTaskApprovalState_ === 'function' && !phase14SetTaskApprovalState_._phase15Wrapped){
    const _orig = phase14SetTaskApprovalState_;
    phase14SetTaskApprovalState_ = async function(taskId, nextState){
      const ctx = (typeof phase14TaskCtxInActive_ === 'function') ? phase14TaskCtxInActive_(taskId) : null;
      if(!ctx) return _orig.apply(this, arguments);
      const t = ctx.t;
      const a = (typeof phase14TaskApproval_ === 'function') ? phase14TaskApproval_(t) : (t.approval||{});
      const target = (nextState === 'approved' || nextState === 'review') ? nextState : 'draft';
      const pol = phase15GetMilestonePolicy_(ctx.ms);
      const action = target === 'review' ? 'task_request_review' : target === 'approved' ? 'task_approve' : 'task_rework';
      if(!phase15CanAction_(action, ctx)) return phase15Deny_(`Current role (${phase15LoadSession_().role}) cannot ${target === 'approved' ? 'approve' : target === 'review' ? 'request review for' : 'rework'} tasks in this milestone policy.`);
      if(target === 'approved' && pol.requireReviewBeforeApprove && a.state !== 'review' && a.state !== 'approved'){
        return phase15Deny_('Policy requires task review before approval. Move the task to In Review first.');
      }
      const prevLocked = !!a.locked;
      const prevState = String(a.state || 'draft');
      const r = await _orig.apply(this, arguments);
      try{ phase15SetReviewerNames_(); }catch{}
      try{
        const afterCtx = (typeof phase14TaskCtxInActive_ === 'function') ? phase14TaskCtxInActive_(taskId) : ctx;
        const aa = afterCtx && afterCtx.t ? phase14TaskApproval_(afterCtx.t) : null;
        if(aa && target === 'approved' && pol.autoLockTaskOnApprove && !aa.locked){
          aa.locked = true; aa.updatedAt = Date.now();
          phase15StampOverride_(afterCtx, { action:'auto_lock_on_approve', targetType:'task', targetId: afterCtx.t.id, title: afterCtx.t.title, state: aa.state, locked:true, note:'policy auto-lock task on approve' });
          saveState({ skipHistory:true });
          renderAll();
        } else if(aa && (prevState !== aa.state || prevLocked !== aa.locked)) {
          try{ saveState({ skipHistory:true }); }catch{}
        }
      }catch(err){ console.warn('Phase15 task post-approve patch failed', err); }
      return r;
    };
    phase14SetTaskApprovalState_._phase15Wrapped = true;
  }

  if(typeof phase14ToggleTaskLock_ === 'function' && !phase14ToggleTaskLock_._phase15Wrapped){
    const _orig = phase14ToggleTaskLock_;
    phase14ToggleTaskLock_ = async function(taskId){
      const ctx = (typeof phase14TaskCtxInActive_ === 'function') ? phase14TaskCtxInActive_(taskId) : null;
      if(!ctx) return _orig.apply(this, arguments);
      const a = phase14TaskApproval_(ctx.t);
      const pol = phase15GetMilestonePolicy_(ctx.ms);
      if(!phase15CanAction_('task_lock_toggle', ctx)) return phase15Deny_(`Current role (${phase15LoadSession_().role}) cannot change task lock state for this milestone policy.`);
      let unlockReason = '';
      if(a.locked && pol.requireUnlockReason){
        const raw = await pmPromptDialog_(`Unlock override reason required for task "${ctx.t.title}".`, '', { title:'Unlock Task Override Reason', placeholder:'Reason required' });
        if(raw == null) return;
        unlockReason = String(raw || '').trim().slice(0,280);
        if(!unlockReason) return alert('Unlock override reason is required by Phase 15 policy.');
      }
      const r = _orig.apply(this, arguments);
      if(unlockReason){
        try{ phase15StampOverride_(ctx, { action:'unlock_override_reason', targetType:'task', targetId:ctx.t.id, title:ctx.t.title, state:phase14TaskApproval_(ctx.t).state, locked:phase14TaskApproval_(ctx.t).locked, note:unlockReason }); }catch{}
      }
      return r;
    };
    phase14ToggleTaskLock_._phase15Wrapped = true;
  }

  if(typeof phase14SetMilestoneApprovalState_ === 'function' && !phase14SetMilestoneApprovalState_._phase15Wrapped){
    const _orig = phase14SetMilestoneApprovalState_;
    phase14SetMilestoneApprovalState_ = async function(nextState){
      const ctx = (typeof phase14CurrentMilestoneCtx_ === 'function') ? phase14CurrentMilestoneCtx_() : null;
      if(!ctx) return _orig.apply(this, arguments);
      const a = phase14MilestoneApproval_(ctx.ms);
      const target = (nextState === 'approved' || nextState === 'review') ? nextState : 'draft';
      const pol = phase15GetMilestonePolicy_(ctx.ms);
      const action = target === 'review' ? 'ms_request_review' : target === 'approved' ? 'ms_approve' : 'ms_rework';
      if(!phase15CanAction_(action, ctx)) return phase15Deny_(`Current role (${phase15LoadSession_().role}) cannot ${target === 'approved' ? 'approve' : target === 'review' ? 'request review for' : 'rework'} milestones in this policy.`);
      if(target === 'approved' && pol.requireReviewBeforeApprove && a.state !== 'review' && a.state !== 'approved'){
        return phase15Deny_('Policy requires milestone review before approval. Move the milestone to In Review first.');
      }
      const prevLocked = !!a.locked; const prevState = String(a.state || 'draft');
      const r = await _orig.apply(this, arguments);
      try{ phase15SetReviewerNames_(); }catch{}
      try{
        const afterCtx = (typeof phase14CurrentMilestoneCtx_ === 'function') ? phase14CurrentMilestoneCtx_() : ctx;
        const aa = afterCtx && afterCtx.ms ? phase14MilestoneApproval_(afterCtx.ms) : null;
        if(aa && target === 'approved' && pol.autoLockMilestoneOnApprove && !aa.locked){
          aa.locked = true; aa.updatedAt = Date.now();
          phase15StampOverride_(afterCtx, { action:'auto_lock_on_approve', targetType:'milestone', targetId:afterCtx.ms.id, title:afterCtx.ms.title, state:aa.state, locked:true, note:'policy auto-lock milestone on approve' });
          saveState({ skipHistory:true });
          renderAll();
        } else if(aa && (prevState !== aa.state || prevLocked !== aa.locked)) {
          try{ saveState({ skipHistory:true }); }catch{}
        }
      }catch(err){ console.warn('Phase15 milestone post-approve patch failed', err); }
      return r;
    };
    phase14SetMilestoneApprovalState_._phase15Wrapped = true;
  }

  if(typeof phase14ToggleMilestoneLock_ === 'function' && !phase14ToggleMilestoneLock_._phase15Wrapped){
    const _orig = phase14ToggleMilestoneLock_;
    phase14ToggleMilestoneLock_ = async function(){
      const ctx = (typeof phase14CurrentMilestoneCtx_ === 'function') ? phase14CurrentMilestoneCtx_() : null;
      if(!ctx) return _orig.apply(this, arguments);
      const a = phase14MilestoneApproval_(ctx.ms);
      const pol = phase15GetMilestonePolicy_(ctx.ms);
      if(!phase15CanAction_('ms_lock_toggle', ctx)) return phase15Deny_(`Current role (${phase15LoadSession_().role}) cannot change milestone lock state for this policy.`);
      let unlockReason = '';
      if(a.locked && pol.requireUnlockReason){
        const raw = await pmPromptDialog_(`Unlock override reason required for milestone "${ctx.ms.title}".`, '', { title:'Unlock Milestone Override Reason', placeholder:'Reason required' });
        if(raw == null) return;
        unlockReason = String(raw || '').trim().slice(0,280);
        if(!unlockReason) return alert('Unlock override reason is required by Phase 15 policy.');
      }
      const r = _orig.apply(this, arguments);
      if(unlockReason){
        try{ phase15StampOverride_(ctx, { action:'unlock_override_reason', targetType:'milestone', targetId:ctx.ms.id, title:ctx.ms.title, state:phase14MilestoneApproval_(ctx.ms).state, locked:phase14MilestoneApproval_(ctx.ms).locked, note:unlockReason }); }catch{}
      }
      return r;
    };
    phase14ToggleMilestoneLock_._phase15Wrapped = true;
  }
}

function phase15WrapCore_(){
  if(typeof renderDashboard === 'function' && !renderDashboard._phase15Wrapped){
    const _orig = renderDashboard;
    renderDashboard = function(){ const r = _orig.apply(this, arguments); try{ phase15PostRenderDashboard_(); }catch(err){ console.warn('Phase15 dashboard render failed', err); } return r; };
    renderDashboard._phase15Wrapped = true;
  }
  if(typeof renderMilestones === 'function' && !renderMilestones._phase15Wrapped){
    const _orig = renderMilestones;
    renderMilestones = function(){ const r = _orig.apply(this, arguments); try{ phase15PostRenderMilestones_(); }catch(err){ console.warn('Phase15 milestones render failed', err); } return r; };
    renderMilestones._phase15Wrapped = true;
  }
  if(typeof renderChecklist === 'function' && !renderChecklist._phase15Wrapped){
    const _orig = renderChecklist;
    renderChecklist = function(){ const r = _orig.apply(this, arguments); try{ phase15PostRenderChecklist_(); }catch(err){ console.warn('Phase15 checklist render failed', err); } return r; };
    renderChecklist._phase15Wrapped = true;
  }
}

function phase15EnsureTopbarButton_(){
  const topbarRight = document.querySelector('#topbarRight') || document.querySelector('.topbar__right') || document.querySelector('.topbar-right');
  if(!topbarRight) return;
  let btn = document.querySelector('#phase15BtnRoles');
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'phase15BtnRoles';
    btn.type = 'button';
    btn.className = 'btn btn--ghost';
    btn.textContent = 'Roles';
    topbarRight.appendChild(btn);
  }
  const sess = phase15LoadSession_();
  btn.title = `Phase 15 approval role: ${sess.role}${sess.name ? ' ('+sess.name+')' : ''}`;
  btn.onclick = function(){
    openPanelInOwningTab_('#phase15RbacPanel', 'dashboard', 20);
  };
}

function phase15RoleLabel_(r){ r = phase15NormRole_(r); return r === 'reviewer' ? 'Reviewer' : r === 'executor' ? 'Executor' : 'Owner'; }
function phase15PolicyRuleLabel_(v){ return String(v||'owner') === 'owner_reviewer' ? 'Owner or Reviewer' : 'Owner only'; }
function phase15CurrentCtx_(){
  const p = getActiveProject && getActiveProject();
  const mod = p ? getActiveModule(p) : null;
  const ms = p ? getActiveMilestone(p) : null;
  return { p, mod, ms };
}

function phase15PostRenderDashboard_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return;
  let box = document.querySelector('#phase15RbacPanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase15RbacPanel';
    box.className = 'phase15-box';
    const host = document.querySelector('#phase14ApprovalQueuePanel') || document.querySelector('#phase13DashboardHost') || document.querySelector('#phase12DashboardHost') || document.querySelector('#phase10DashboardHost') || document.querySelector('#phase8DashboardHost');
    if(host && host.parentElement) host.parentElement.insertBefore(box, host);
    else tab.appendChild(box);
  }
  const sess = phase15LoadSession_();
  const cfg = phase15LoadCfg_();
  const ctx = phase15CurrentCtx_();
  const pol = phase15GetMilestonePolicy_(ctx.ms);
  const q = (typeof phase14CollectApprovalQueue_ === 'function') ? phase14CollectApprovalQueue_({ onlyActiveProject:false }) : {taskReview:0, taskLocked:0, milestoneReview:0, milestoneLocked:0};
  box.innerHTML = `
    <div class="phase15-title">Phase 15 RBAC-lite Approval Profiles</div>
    <div class="phase15-grid">
      <div class="phase15-card phase15-compact">
        <div class="phase15-toolbar">
          <span class="phase15-tag ${escapeHtml(sess.role)}">${escapeHtml(phase15RoleLabel_(sess.role))}</span>
          <button class="btn btn--ghost" type="button" id="phase15BtnOpenMsPolicy">Open Milestone Policy</button>
          <button class="btn btn--ghost" type="button" id="phase15BtnOpenTaskReview">Open Task Review Queue</button>
        </div>
        <div class="phase15-fields" style="margin-top:8px">
          <div class="row">
            <label>Current role
              <select id="phase15RoleSelect">
                <option value="owner" ${sess.role==='owner'?'selected':''}>Owner</option>
                <option value="reviewer" ${sess.role==='reviewer'?'selected':''}>Reviewer</option>
                <option value="executor" ${sess.role==='executor'?'selected':''}>Executor</option>
              </select>
            </label>
            <label>Display name
              <input id="phase15RoleName" type="text" maxlength="48" value="${escapeHtml(sess.name||'ME')}">
            </label>
          </div>
          <div class="row">
            <label><input type="checkbox" id="phase15DefRequireReview" ${cfg.defaultPolicy.requireReviewBeforeApprove?'checked':''}> Default: require review before approve</label>
            <label><input type="checkbox" id="phase15DefRequireUnlockReason" ${cfg.defaultPolicy.requireUnlockReason?'checked':''}> Default: require unlock reason</label>
          </div>
          <div class="row">
            <label>Default task approver
              <select id="phase15DefTaskApproverRole"><option value="owner" ${cfg.defaultPolicy.taskApproverRole==='owner'?'selected':''}>Owner only</option><option value="owner_reviewer" ${cfg.defaultPolicy.taskApproverRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option></select>
            </label>
            <label>Default milestone approver
              <select id="phase15DefMsApproverRole"><option value="owner" ${cfg.defaultPolicy.milestoneApproverRole==='owner'?'selected':''}>Owner only</option><option value="owner_reviewer" ${cfg.defaultPolicy.milestoneApproverRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option></select>
            </label>
          </div>
          <div class="row">
            <label>Default task lock control
              <select id="phase15DefTaskLockRole"><option value="owner" ${cfg.defaultPolicy.taskLockRole==='owner'?'selected':''}>Owner only</option><option value="owner_reviewer" ${cfg.defaultPolicy.taskLockRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option></select>
            </label>
            <label>Default milestone lock control
              <select id="phase15DefMsLockRole"><option value="owner" ${cfg.defaultPolicy.milestoneLockRole==='owner'?'selected':''}>Owner only</option><option value="owner_reviewer" ${cfg.defaultPolicy.milestoneLockRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option></select>
            </label>
          </div>
          <div class="row">
            <label><input type="checkbox" id="phase15DefAutoLockTask" ${cfg.defaultPolicy.autoLockTaskOnApprove?'checked':''}> Default auto-lock task on approve</label>
            <label><input type="checkbox" id="phase15DefAutoLockMs" ${cfg.defaultPolicy.autoLockMilestoneOnApprove?'checked':''}> Default auto-lock milestone on approve</label>
          </div>
          <div class="phase15-toolbar">
            <button class="btn btn--ghost" type="button" id="phase15BtnSaveRoleDefaults">Save Role & Defaults</button>
            <button class="btn btn--ghost" type="button" id="phase15BtnResetRoleDefaults">Reset Defaults</button>
          </div>
        </div>
        <div class="phase15-note" style="margin-top:8px">RBAC-lite controls approval/lock actions from Phase 14 queues. Editing tasks remains governed by existing milestone/task lock guardrails.</div>
      </div>
      <div class="phase15-card">
        <div class="phase15-title" style="margin-bottom:6px">Permission Matrix</div>
        <table class="phase15-table">
          <thead><tr><th>Action</th><th>Owner</th><th>Reviewer</th><th>Executor</th></tr></thead>
          <tbody>
            <tr><td>Task: Request review</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Task: Approve / Rework</td><td>✓</td><td>Policy</td><td>—</td></tr>
            <tr><td>Task: Lock / Unlock</td><td>✓ (override)</td><td>Policy</td><td>—</td></tr>
            <tr><td>Milestone: Request review</td><td>✓</td><td>✓</td><td>—</td></tr>
            <tr><td>Milestone: Approve / Rework</td><td>✓</td><td>Policy</td><td>—</td></tr>
            <tr><td>Milestone: Lock / Unlock</td><td>✓ (override)</td><td>Policy</td><td>—</td></tr>
            <tr><td>Edit policy / defaults</td><td>✓</td><td>—</td><td>—</td></tr>
          </tbody>
        </table>
        <div class="phase15-kv">
          <div><b>Task review queue</b><span>${Number(q.taskReview||0)}</span></div>
          <div><b>Task locked</b><span>${Number(q.taskLocked||0)}</span></div>
          <div><b>Milestone review</b><span>${Number(q.milestoneReview||0)}</span></div>
          <div><b>Milestone locked</b><span>${Number(q.milestoneLocked||0)}</span></div>
        </div>
        <div class="phase15-pre">Active milestone policy (${ctx.ms ? escapeHtml(String(ctx.ms.title||'')) : 'none selected'})
require review before approve: ${pol.requireReviewBeforeApprove ? 'yes' : 'no'}
require unlock reason: ${pol.requireUnlockReason ? 'yes' : 'no'}
task approver: ${phase15PolicyRuleLabel_(pol.taskApproverRole)}
milestone approver: ${phase15PolicyRuleLabel_(pol.milestoneApproverRole)}
task lock control: ${phase15PolicyRuleLabel_(pol.taskLockRole)}
milestone lock control: ${phase15PolicyRuleLabel_(pol.milestoneLockRole)}
auto-lock task on approve: ${pol.autoLockTaskOnApprove ? 'yes' : 'no'}
auto-lock milestone on approve: ${pol.autoLockMilestoneOnApprove ? 'yes' : 'no'}</div>
      </div>
    </div>
  `;
  box.querySelector('#phase15BtnOpenMsPolicy')?.addEventListener('click', ()=>{ switchTab('milestones'); try{ openMilestoneDetailsModal && openMilestoneDetailsModal(); }catch{} setTimeout(()=>document.querySelector('#phase15MilestonePolicyPanel, #phase14MilestoneApprovalPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
  box.querySelector('#phase15BtnOpenTaskReview')?.addEventListener('click', ()=>{ switchTab('checklist'); setTimeout(()=>document.querySelector('#phase14ChecklistApprovalPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
  box.querySelector('#phase15BtnSaveRoleDefaults')?.addEventListener('click', ()=>{
    const sess2 = phase15LoadSession_();
    const cfg2 = phase15LoadCfg_();
    const role = phase15NormRole_(box.querySelector('#phase15RoleSelect')?.value);
    const name = String(box.querySelector('#phase15RoleName')?.value || '').trim().slice(0,48) || 'ME';
    sess2.role = role; sess2.name = name; phase15SaveSession_();
    if(!phase15CanAction_('defaults_edit', { ms: ctx.ms })){
      phase15EnsureTopbarButton_();
      phase15PostRenderChecklist_();
      phase15PostRenderMilestones_();
      return phase15Deny_('Only Owner role can modify Phase 15 default approval profile settings. Role switch saved, defaults unchanged.');
    }
    cfg2.defaultPolicy = phase15NormalizePolicy_({
      requireReviewBeforeApprove: !!box.querySelector('#phase15DefRequireReview')?.checked,
      requireUnlockReason: !!box.querySelector('#phase15DefRequireUnlockReason')?.checked,
      taskApproverRole: box.querySelector('#phase15DefTaskApproverRole')?.value,
      milestoneApproverRole: box.querySelector('#phase15DefMsApproverRole')?.value,
      taskLockRole: box.querySelector('#phase15DefTaskLockRole')?.value,
      milestoneLockRole: box.querySelector('#phase15DefMsLockRole')?.value,
      autoLockTaskOnApprove: !!box.querySelector('#phase15DefAutoLockTask')?.checked,
      autoLockMilestoneOnApprove: !!box.querySelector('#phase15DefAutoLockMs')?.checked,
    }, cfg2.defaultPolicy);
    phase15SaveCfg_();
    try{ addActivity(`Phase15 saved role/defaults • ${phase15RoleLabel_(role)} (${name})`); }catch{}
    try{ saveState({ skipHistory:true }); }catch{}
    phase15EnsureTopbarButton_();
    renderAll();
  });
  box.querySelector('#phase15BtnResetRoleDefaults')?.addEventListener('click', async ()=>{
    const okReset = await pmConfirmDialog_('Reset Phase 15 default approval profile settings? Current role/name will be kept.', { title:'Reset Approval Profile Defaults', okText:'Reset', danger:true });
    if(!okReset) return;
    const d = phase15DefaultCfg_();
    phase15LoadCfg_().defaultPolicy = phase15NormalizePolicy_(d.defaultPolicy, d.defaultPolicy);
    phase15SaveCfg_();
    try{ addActivity('Phase15 reset default approval profile settings'); }catch{}
    renderAll();
  });
  phase15EnsureTopbarButton_();
}

function phase15PostRenderMilestones_(){
  const tab = document.querySelector('#tab-milestones');
  if(!tab) return;
  const detailCard = document.querySelector('#milestoneDetailsModal .pm-milestone-modal__panel')
    || document.querySelector('#milestoneDetailsModal .card')
    || Array.from(tab.querySelectorAll('.card'))[1]
    || Array.from(tab.querySelectorAll('.card')).slice(-1)[0];
  if(!detailCard) return;
  let box = document.querySelector('#phase15MilestonePolicyPanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase15MilestonePolicyPanel';
    box.className = 'phase15-box';
    const anchor = document.querySelector('#phase14MilestoneApprovalPanel');
    if(anchor && anchor.parentElement === detailCard) anchor.insertAdjacentElement('afterend', box);
    else detailCard.appendChild(box);
  }else if(box.parentElement !== detailCard){
    const anchor = document.querySelector('#phase14MilestoneApprovalPanel');
    if(anchor && anchor.parentElement === detailCard) anchor.insertAdjacentElement('afterend', box);
    else detailCard.appendChild(box);
  }
  const ctx = phase15CurrentCtx_();
  if(!ctx.ms){
    box.innerHTML = `<div class="phase15-title">Phase 15 Milestone Approval Policy</div><div class="phase15-note">Select a milestone to set its approval policy and role permissions.</div>`;
    return;
  }
  const sess = phase15LoadSession_();
  const pol = phase15GetMilestonePolicy_(ctx.ms);
  const dpol = phase15LoadCfg_().defaultPolicy;
  const roleCanEdit = phase15CanAction_('policy_edit', ctx);
  box.innerHTML = `
    <div class="phase15-title">Phase 15 Milestone Approval Policy</div>
    <div class="phase15-toolbar">
      <span class="phase15-tag ${escapeHtml(sess.role)}">Role: ${escapeHtml(phase15RoleLabel_(sess.role))}</span>
      <button class="btn btn--ghost" type="button" id="phase15BtnPolicyApplyDefaults" ${roleCanEdit ? '' : 'disabled'}>Apply Defaults</button>
      <button class="btn btn--ghost" type="button" id="phase15BtnPolicySave" ${roleCanEdit ? '' : 'disabled'}>Save Policy</button>
    </div>
    <div class="phase15-fields phase15-compact" style="margin-top:8px">
      <div class="row">
        <label><input type="checkbox" id="phase15MsRequireReview" ${pol.requireReviewBeforeApprove?'checked':''} ${roleCanEdit?'':'disabled'}> Require review before approve</label>
        <label><input type="checkbox" id="phase15MsRequireUnlockReason" ${pol.requireUnlockReason?'checked':''} ${roleCanEdit?'':'disabled'}> Require unlock override reason</label>
      </div>
      <div class="row">
        <label>Task approver role
          <select id="phase15MsTaskApproverRole" ${roleCanEdit?'':'disabled'}>
            <option value="owner" ${pol.taskApproverRole==='owner'?'selected':''}>Owner only</option>
            <option value="owner_reviewer" ${pol.taskApproverRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option>
          </select>
        </label>
        <label>Milestone approver role
          <select id="phase15MsApproverRole" ${roleCanEdit?'':'disabled'}>
            <option value="owner" ${pol.milestoneApproverRole==='owner'?'selected':''}>Owner only</option>
            <option value="owner_reviewer" ${pol.milestoneApproverRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option>
          </select>
        </label>
      </div>
      <div class="row">
        <label>Task lock control role
          <select id="phase15MsTaskLockRole" ${roleCanEdit?'':'disabled'}>
            <option value="owner" ${pol.taskLockRole==='owner'?'selected':''}>Owner only</option>
            <option value="owner_reviewer" ${pol.taskLockRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option>
          </select>
        </label>
        <label>Milestone lock control role
          <select id="phase15MsLockRole" ${roleCanEdit?'':'disabled'}>
            <option value="owner" ${pol.milestoneLockRole==='owner'?'selected':''}>Owner only</option>
            <option value="owner_reviewer" ${pol.milestoneLockRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option>
          </select>
        </label>
      </div>
      <div class="row">
        <label><input type="checkbox" id="phase15MsAutoLockTask" ${pol.autoLockTaskOnApprove?'checked':''} ${roleCanEdit?'':'disabled'}> Auto-lock task on approve</label>
        <label><input type="checkbox" id="phase15MsAutoLockMs" ${pol.autoLockMilestoneOnApprove?'checked':''} ${roleCanEdit?'':'disabled'}> Auto-lock milestone on approve</label>
      </div>
    </div>
    <div class="phase15-note" style="margin-top:8px">Milestone: <b>${escapeHtml(String(ctx.ms.title||''))}</b> • Project: <b>${escapeHtml(String(ctx.p?.name||''))}</b></div>
    <div class="phase15-inlineHelp">Defaults are used for new milestones and as fallback. Per-milestone policy overrides Phase 14 approval actions and Phase 15 unlock reason prompts.</div>
    ${roleCanEdit ? '' : '<div class="phase15-note" style="color:#ffd0d0;margin-top:6px">Only Owner role can modify milestone approval policy.</div>'}
    <div class="phase15-pre">Current vs defaults
Task approver: ${phase15PolicyRuleLabel_(pol.taskApproverRole)} (default: ${phase15PolicyRuleLabel_(dpol.taskApproverRole)})
Milestone approver: ${phase15PolicyRuleLabel_(pol.milestoneApproverRole)} (default: ${phase15PolicyRuleLabel_(dpol.milestoneApproverRole)})
Task lock control: ${phase15PolicyRuleLabel_(pol.taskLockRole)} (default: ${phase15PolicyRuleLabel_(dpol.taskLockRole)})
Milestone lock control: ${phase15PolicyRuleLabel_(pol.milestoneLockRole)} (default: ${phase15PolicyRuleLabel_(dpol.milestoneLockRole)})</div>
  `;
  const readUiPolicy = () => phase15NormalizePolicy_({
    requireReviewBeforeApprove: !!box.querySelector('#phase15MsRequireReview')?.checked,
    requireUnlockReason: !!box.querySelector('#phase15MsRequireUnlockReason')?.checked,
    taskApproverRole: box.querySelector('#phase15MsTaskApproverRole')?.value,
    milestoneApproverRole: box.querySelector('#phase15MsApproverRole')?.value,
    taskLockRole: box.querySelector('#phase15MsTaskLockRole')?.value,
    milestoneLockRole: box.querySelector('#phase15MsLockRole')?.value,
    autoLockTaskOnApprove: !!box.querySelector('#phase15MsAutoLockTask')?.checked,
    autoLockMilestoneOnApprove: !!box.querySelector('#phase15MsAutoLockMs')?.checked,
  }, dpol);
  box.querySelector('#phase15BtnPolicyApplyDefaults')?.addEventListener('click', async ()=>{
    if(!phase15CanAction_('policy_edit', ctx)) return phase15Deny_('Only Owner role can apply milestone approval policy defaults.');
    const okApplyDefaults = await pmConfirmDialog_('Apply current Phase 15 default approval profile to this milestone?', { title:'Apply Milestone Policy Defaults', okText:'Apply' });
    if(!okApplyDefaults) return;
    ctx.ms.approvalPolicy = phase15NormalizePolicy_(dpol, dpol);
    try{ addActivity(`Phase15 applied default approval policy to milestone: ${ctx.ms.title}`); }catch{}
    saveState(); renderAll();
  });
  box.querySelector('#phase15BtnPolicySave')?.addEventListener('click', ()=>{
    if(!phase15CanAction_('policy_edit', ctx)) return phase15Deny_('Only Owner role can save milestone approval policy.');
    ctx.ms.approvalPolicy = readUiPolicy();
    try{ addActivity(`Phase15 saved milestone approval policy: ${ctx.ms.title}`); }catch{}
    saveState(); renderAll();
  });
}

function phase15PostRenderChecklist_(){
  const tab = document.querySelector('#tab-checklist');
  if(!tab) return;
  const cards = Array.from(tab.querySelectorAll('.card'));
  const tasksCard = cards[1] || cards[cards.length-1];
  if(!tasksCard) return;
  let box = document.querySelector('#phase15ChecklistRolePanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase15ChecklistRolePanel';
    box.className = 'phase15-box';
    const anchor = document.querySelector('#phase14ChecklistApprovalPanel');
    if(anchor && anchor.parentElement === tasksCard) anchor.insertAdjacentElement('beforebegin', box);
    else tasksCard.appendChild(box);
  }
  const ctx = phase15CurrentCtx_();
  const sess = phase15LoadSession_();
  const pol = phase15GetMilestonePolicy_(ctx.ms);
  box.innerHTML = `
    <div class="phase15-title">Phase 15 Approval Role Context</div>
    <div class="phase15-toolbar">
      <span class="phase15-tag ${escapeHtml(sess.role)}">${escapeHtml(phase15RoleLabel_(sess.role))}</span>
      <button class="btn btn--ghost" type="button" id="phase15BtnChecklistOpenRoles">Open Roles Panel</button>
      <button class="btn btn--ghost" type="button" id="phase15BtnChecklistOpenMsPolicy">Open Milestone Policy</button>
    </div>
    <div class="phase15-kv">
      <div><b>Task approve</b><span>${phase15CanAction_('task_approve', ctx) ? 'allowed' : 'blocked'}</span></div>
      <div><b>Task lock toggle</b><span>${phase15CanAction_('task_lock_toggle', ctx) ? 'allowed' : 'blocked'}</span></div>
      <div><b>Require review</b><span>${pol.requireReviewBeforeApprove ? 'yes' : 'no'}</span></div>
      <div><b>Unlock reason</b><span>${pol.requireUnlockReason ? 'required' : 'optional'}</span></div>
    </div>
    <div class="phase15-note" style="margin-top:8px">If a task/milestone is locked and you unlock it, Phase 15 may require an override reason depending on the milestone policy. Owner role always has lock-control override, but a reason can still be required.</div>
  `;
  box.querySelector('#phase15BtnChecklistOpenRoles')?.addEventListener('click', ()=>{ switchTab('dashboard'); setTimeout(()=>document.querySelector('#phase15RbacPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
  box.querySelector('#phase15BtnChecklistOpenMsPolicy')?.addEventListener('click', ()=>{ switchTab('milestones'); try{ openMilestoneDetailsModal && openMilestoneDetailsModal(); }catch{} setTimeout(()=>document.querySelector('#phase15MilestonePolicyPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
}

try{ initPhase15_(); }catch(err){ console.warn('Phase15 init failed', err); }


