/* ---------------------------
   Phase 14 Approval Workflow + Export Center Cleanup (Additive Patch)
   - Task / milestone approval states + change locks
   - Review queue panels (dashboard / checklist / milestones)
   - Approval audit trail (with rollback notes)
   - Topbar export cleanup: single Export button + Export tab
---------------------------- */
var PHASE14_APPROVAL_AUDIT_KEY = 'stark_pm_phase14_approval_audit_v1';
var PHASE14_EXPORT_UI_KEY = 'stark_pm_phase14_export_ui_v1';
var phase14State_ = {
  inited:false,
  audit:null,
  exportUi:null,
};

function initPhase14_(){
  if(phase14State_.inited) return;
  phase14State_.inited = true;
  try{ phase14EnsureStyles_(); }catch(err){ console.warn('Phase14 styles failed', err); }
  try{ phase14PatchSanitizers_(); }catch(err){ console.warn('Phase14 sanitizer patch failed', err); }
  try{ phase14WrapCore_(); }catch(err){ console.warn('Phase14 core wrap failed', err); }
  try{ phase14InjectExportTab_(); }catch(err){ console.warn('Phase14 export tab inject failed', err); }
  try{ phase14EnhanceTopbarExport_(); }catch(err){ console.warn('Phase14 topbar cleanup failed', err); }
  try{ phase14BindGuardrails_(); }catch(err){ console.warn('Phase14 guardrails bind failed', err); }
  try{ phase14PostRenderDashboard_(); }catch{}
  try{ phase14PostRenderMilestones_(); }catch{}
  try{ phase14PostRenderChecklist_(); }catch{}
  try{ phase14RenderExportCenter_(); }catch{}
}

function phase14EnsureStyles_(){
  if(document.querySelector('#phase14Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase14Styles';
  st.textContent = `
    .phase14-box{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    .phase14-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9;margin-bottom:8px}
    .phase14-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:10px}
    .phase14-card{border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px;background:rgba(255,255,255,.012)}
    .phase14-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .phase14-toolbar .btn{padding:6px 10px}
    .phase14-note{font-size:11px;opacity:.78;line-height:1.35}
    .phase14-kv{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:8px}
    .phase14-kv>div{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase14-kv b{display:block;font-size:10px;letter-spacing:.05em;text-transform:uppercase;opacity:.72;margin-bottom:4px}
    .phase14-kv span{font-size:14px;font-weight:800}
    .phase14-list{display:grid;gap:8px;margin-top:8px}
    .phase14-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase14-row__name{font-size:12px;font-weight:700;line-height:1.25;word-break:break-word}
    .phase14-row__meta{font-size:11px;opacity:.76;line-height:1.3;margin-top:2px}
    .phase14-tags{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}
    .phase14-tag{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:2px 7px;font-size:10px;letter-spacing:.05em;text-transform:uppercase}
    .phase14-tag.review{border-color:rgba(255,191,92,.28);color:#ffd8a6}
    .phase14-tag.approved{border-color:rgba(79,209,197,.28);color:#b8fff6}
    .phase14-tag.locked{border-color:rgba(255,110,110,.32);color:#ffd0d0}
    .phase14-tag.draft{border-color:rgba(255,255,255,.12);opacity:.9}
    .phase14-inline{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .phase14-pre{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;line-height:1.35;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.14);margin-top:8px;max-height:260px;overflow:auto}
    .phase14-taskLocked{outline:1px solid rgba(255,110,110,.2);box-shadow:inset 0 0 0 1px rgba(255,110,110,.06)}
    .phase14-taskLocked .task__title{opacity:.95}
    .phase14-badge{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 6px;font-size:10px;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(255,255,255,.1)}
    .phase14-badge.review{border-color:rgba(255,191,92,.28);color:#ffd8a6}
    .phase14-badge.approved{border-color:rgba(79,209,197,.28);color:#b8fff6}
    .phase14-badge.locked{border-color:rgba(255,110,110,.32);color:#ffd0d0}
    .phase14-exportLayout{display:grid;grid-template-columns:1.05fr .95fr;gap:10px}
    .phase14-exportCard{border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.015);padding:12px}
    .phase14-exportCard h4{margin:0 0 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.88}
    .phase14-fields{display:grid;gap:8px}
    .phase14-fields .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .phase14-helpList{display:grid;gap:6px}
    .phase14-helpItem{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase14-helpItem b{display:block;font-size:11px;margin-bottom:2px}
    .phase14-helpItem span{font-size:11px;opacity:.76;line-height:1.3}
    .phase14-hidden{display:none !important}
    .phase14-lockHint{font-size:11px;color:#ffd0d0;opacity:.9;margin-top:6px}
    .phase14-topbar-export{font-weight:700}
    @media (max-width: 980px){ .phase14-grid,.phase14-exportLayout{grid-template-columns:1fr} .phase14-kv{grid-template-columns:1fr 1fr} .phase14-fields .row{grid-template-columns:1fr} }
    @media (max-width: 640px){ .phase14-kv{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase14PatchSanitizers_(){
  if(typeof sanitizeTask === 'function' && !sanitizeTask._phase14WrappedApproval){
    const _orig = sanitizeTask;
    sanitizeTask = function(t){
      const out = _orig(t);
      out.approval = phase14NormalizeApproval_(t && t.approval, 'task');
      return out;
    };
    sanitizeTask._phase14WrappedApproval = true;
  }
  if(typeof sanitizeMilestone === 'function' && !sanitizeMilestone._phase14WrappedApproval){
    const _orig = sanitizeMilestone;
    sanitizeMilestone = function(m){
      const out = _orig(m);
      out.approval = phase14NormalizeApproval_(m && m.approval, 'milestone');
      return out;
    };
    sanitizeMilestone._phase14WrappedApproval = true;
  }
  if(typeof mkTask === 'function' && !mkTask._phase14WrappedApproval){
    const _orig = mkTask;
    mkTask = function(){
      const t = _orig.apply(this, arguments);
      t.approval = phase14NormalizeApproval_(t.approval, 'task');
      return t;
    };
    mkTask._phase14WrappedApproval = true;
  }
  if(typeof mkMilestone === 'function' && !mkMilestone._phase14WrappedApproval){
    const _orig = mkMilestone;
    mkMilestone = function(){
      const m = _orig.apply(this, arguments);
      m.approval = phase14NormalizeApproval_(m.approval, 'milestone');
      return m;
    };
    mkMilestone._phase14WrappedApproval = true;
  }
}

function phase14WrapCore_(){
  if(typeof renderDashboard === 'function' && !renderDashboard._phase14Wrapped){
    const _orig = renderDashboard;
    renderDashboard = function(){
      const r = _orig.apply(this, arguments);
      try{ phase14PostRenderDashboard_(); }catch(err){ console.warn('Phase14 dashboard render failed', err); }
      return r;
    };
    renderDashboard._phase14Wrapped = true;
  }
  if(typeof renderMilestones === 'function' && !renderMilestones._phase14Wrapped){
    const _orig = renderMilestones;
    renderMilestones = function(){
      const r = _orig.apply(this, arguments);
      try{ phase14PostRenderMilestones_(); }catch(err){ console.warn('Phase14 milestones render failed', err); }
      return r;
    };
    renderMilestones._phase14Wrapped = true;
  }
  if(typeof renderChecklist === 'function' && !renderChecklist._phase14Wrapped){
    const _orig = renderChecklist;
    renderChecklist = function(){
      const r = _orig.apply(this, arguments);
      try{ phase14PostRenderChecklist_(); }catch(err){ console.warn('Phase14 checklist render failed', err); }
      return r;
    };
    renderChecklist._phase14Wrapped = true;
  }
  if(typeof renderAll === 'function' && !renderAll._phase14Wrapped){
    const _orig = renderAll;
    renderAll = function(){
      const r = _orig.apply(this, arguments);
      try{ phase14RenderExportCenter_(); }catch{}
      return r;
    };
    renderAll._phase14Wrapped = true;
  }
}

function phase14NormalizeApproval_(v, kind){
  const s = String(v && v.state || 'draft').toLowerCase();
  return {
    kind: kind || 'item',
    state: (s === 'review' || s === 'approved') ? s : 'draft',
    locked: !!(v && v.locked),
    requestedAt: Number(v && v.requestedAt || 0),
    approvedAt: Number(v && v.approvedAt || 0),
    updatedAt: Number(v && v.updatedAt || 0),
    reviewer: String(v && v.reviewer || ''),
    note: String(v && v.note || '').slice(0, 280),
  };
}
function phase14TaskApproval_(t){
  if(!t || typeof t !== 'object') return phase14NormalizeApproval_(null, 'task');
  t.approval = phase14NormalizeApproval_(t.approval, 'task');
  return t.approval;
}
function phase14MilestoneApproval_(m){
  if(!m || typeof m !== 'object') return phase14NormalizeApproval_(null, 'milestone');
  m.approval = phase14NormalizeApproval_(m.approval, 'milestone');
  return m.approval;
}
function phase14ApprovalLabel_(a){
  const s = String(a && a.state || 'draft');
  if(s === 'review') return 'IN REVIEW';
  if(s === 'approved') return 'APPROVED';
  return 'DRAFT';
}
function phase14ApprovalClass_(a){
  const s = String(a && a.state || 'draft');
  return (s === 'review' || s === 'approved') ? s : 'draft';
}
function phase14IsMilestoneLocked_(m){
  return !!phase14MilestoneApproval_(m).locked;
}
function phase14IsTaskLocked_(t){
  return !!phase14TaskApproval_(t).locked;
}
function phase14ActiveMilestoneLocked_(){
  const p = getActiveProject && getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  return !!(m && phase14IsMilestoneLocked_(m));
}

function phase14LoadAudit_(){
  if(Array.isArray(phase14State_.audit)) return phase14State_.audit;
  let arr = [];
  try{ arr = JSON.parse(localStorage.getItem(PHASE14_APPROVAL_AUDIT_KEY) || '[]') || []; }catch{ arr = []; }
  phase14State_.audit = Array.isArray(arr) ? arr.filter(Boolean).map(x => ({
    id: String(x && x.id || uid()),
    ts: Number(x && x.ts || Date.now()),
    scope: String(x && x.scope || 'item'),
    action: String(x && x.action || 'update'),
    targetType: String(x && x.targetType || 'item'),
    targetId: String(x && x.targetId || ''),
    projectId: String(x && x.projectId || ''),
    moduleId: String(x && x.moduleId || ''),
    milestoneId: String(x && x.milestoneId || ''),
    taskId: String(x && x.taskId || ''),
    title: String(x && x.title || ''),
    state: String(x && x.state || ''),
    locked: !!(x && x.locked),
    note: String(x && x.note || '').slice(0, 280),
  })) : [];
  return phase14State_.audit;
}
function phase14SaveAudit_(){ try{ localStorage.setItem(PHASE14_APPROVAL_AUDIT_KEY, JSON.stringify((phase14LoadAudit_()||[]).slice(0,1500))); }catch{} }
function phase14PushAudit_(payload){
  const rows = phase14LoadAudit_();
  rows.unshift({ id: uid(), ts: Date.now(), ...payload });
  if(rows.length > 1500) rows.length = 1500;
  phase14SaveAudit_();
}
function phase14AuditMessage_(payload){
  const bits = ['Phase14'];
  bits.push(payload.targetType === 'task' ? 'task' : 'milestone');
  bits.push(payload.action);
  if(payload.title) bits.push(`: ${payload.title}`);
  if(payload.state) bits.push(`[${String(payload.state).toUpperCase()}]`);
  if(payload.locked) bits.push('[LOCKED]');
  if(payload.note) bits.push(`(${payload.note})`);
  return bits.join(' ');
}
function phase14LogApprovalAction_(ctx, payload){
  const row = {
    scope:'approval',
    targetType: payload.targetType,
    action: payload.action,
    targetId: String(payload.targetId || ''),
    projectId: String(ctx && ctx.p && ctx.p.id || ''),
    moduleId: String(ctx && ctx.mod && ctx.mod.id || ''),
    milestoneId: String(ctx && ctx.ms && ctx.ms.id || ''),
    taskId: String(ctx && ctx.t && ctx.t.id || ''),
    title: String(payload.title || ''),
    state: String(payload.state || ''),
    locked: !!payload.locked,
    note: String(payload.note || ''),
  };
  phase14PushAudit_(row);
  try{ addActivity(phase14AuditMessage_(row)); }catch{}
}

function phase14TaskCtxInActive_(taskId){
  const p = getActiveProject && getActiveProject();
  const mod = p ? getActiveModule(p) : null;
  const ms = p ? getActiveMilestone(p) : null;
  if(!ms || !taskId) return null;
  const t = (ms.tasks || []).find(x => x && String(x.id) === String(taskId));
  if(!t) return null;
  return { p, mod, ms, t };
}
function phase14CurrentMilestoneCtx_(){
  const p = getActiveProject && getActiveProject();
  const mod = p ? getActiveModule(p) : null;
  const ms = p ? getActiveMilestone(p) : null;
  if(!ms) return null;
  return { p, mod, ms };
}

async function phase14SetTaskApprovalState_(taskId, nextState){
  const ctx = phase14TaskCtxInActive_(taskId);
  if(!ctx) return;
  const { p, mod, ms, t } = ctx;
  if(phase14IsMilestoneLocked_(ms) && nextState !== 'draft' && nextState !== 'review' && nextState !== 'approved') return;
  const a = phase14TaskApproval_(t);
  const prevState = a.state;
  const targetState = (nextState === 'approved' || nextState === 'review') ? nextState : 'draft';
  let rollbackNote = '';
  if(prevState === 'approved' && targetState !== 'approved'){
    const raw = await pmPromptDialog_(`Rollback note for task "${t.title}" (optional, recommended):`, a.note || '', { title:'Rollback Task Approval', placeholder:'Optional rollback note' });
    if(raw == null) return;
    rollbackNote = String(raw || '').trim().slice(0, 280);
  }
  if(prevState === targetState && !rollbackNote) return;
  a.state = targetState;
  if(targetState === 'review' && !a.requestedAt) a.requestedAt = Date.now();
  if(targetState === 'approved'){
    a.approvedAt = Date.now();
    a.reviewer = 'ME';
  }
  a.updatedAt = Date.now();
  if(rollbackNote) a.note = rollbackNote;
  phase14LogApprovalAction_({ p, mod, ms, t }, {
    targetType:'task',
    action: (targetState === 'review' ? 'request_review' : targetState === 'approved' ? 'approve' : 'rework'),
    targetId: t.id,
    title: t.title,
    state: targetState,
    locked: !!a.locked,
    note: rollbackNote || a.note || ''
  });
  saveState();
  renderAll();
}
function phase14ToggleTaskLock_(taskId){
  const ctx = phase14TaskCtxInActive_(taskId);
  if(!ctx) return;
  const { p, mod, ms, t } = ctx;
  const a = phase14TaskApproval_(t);
  a.locked = !a.locked;
  a.updatedAt = Date.now();
  if(a.locked && a.state === 'draft') a.state = 'review';
  phase14LogApprovalAction_({ p, mod, ms, t }, {
    targetType:'task', action: a.locked ? 'lock' : 'unlock', targetId:t.id, title:t.title, state:a.state, locked:a.locked
  });
  saveState();
  renderAll();
}
async function phase14SetMilestoneApprovalState_(nextState){
  const ctx = phase14CurrentMilestoneCtx_();
  if(!ctx) return;
  const { p, mod, ms } = ctx;
  const a = phase14MilestoneApproval_(ms);
  const prevState = a.state;
  const targetState = (nextState === 'approved' || nextState === 'review') ? nextState : 'draft';
  let rollbackNote = '';
  if(prevState === 'approved' && targetState !== 'approved'){
    const raw = await pmPromptDialog_(`Rollback note for milestone "${ms.title}" (optional, recommended):`, a.note || '', { title:'Rollback Milestone Approval', placeholder:'Optional rollback note' });
    if(raw == null) return;
    rollbackNote = String(raw || '').trim().slice(0, 280);
  }
  if(prevState === targetState && !rollbackNote) return;
  a.state = targetState;
  if(targetState === 'review' && !a.requestedAt) a.requestedAt = Date.now();
  if(targetState === 'approved'){
    a.approvedAt = Date.now();
    a.reviewer = 'ME';
  }
  a.updatedAt = Date.now();
  if(rollbackNote) a.note = rollbackNote;
  phase14LogApprovalAction_({ p, mod, ms }, {
    targetType:'milestone',
    action:(targetState === 'review' ? 'request_review' : targetState === 'approved' ? 'approve' : 'rework'),
    targetId: ms.id,
    title: ms.title,
    state: targetState,
    locked: !!a.locked,
    note: rollbackNote || a.note || ''
  });
  saveState();
  renderAll();
}
function phase14ToggleMilestoneLock_(){
  const ctx = phase14CurrentMilestoneCtx_();
  if(!ctx) return;
  const { p, mod, ms } = ctx;
  const a = phase14MilestoneApproval_(ms);
  a.locked = !a.locked;
  a.updatedAt = Date.now();
  if(a.locked && a.state === 'draft') a.state = 'review';
  phase14LogApprovalAction_({ p, mod, ms }, {
    targetType:'milestone', action:a.locked ? 'lock' : 'unlock', targetId:ms.id, title:ms.title, state:a.state, locked:a.locked
  });
  saveState();
  renderAll();
}

function phase14CollectApprovalQueue_(opts){
  opts = opts || {};
  const onlyActive = !!opts.onlyActiveProject;
  const active = getActiveProject && getActiveProject();
  const out = { taskDraft:0, taskReview:0, taskApproved:0, taskLocked:0, milestoneDraft:0, milestoneReview:0, milestoneApproved:0, milestoneLocked:0, taskRows:[], milestoneRows:[] };
  for(const p of (state.projects || [])){
    if(onlyActive && active && String(p.id) !== String(active.id)) continue;
    for(const mod of (p.modules || [])){
      for(const ms of (mod.milestones || [])){
        const ma = phase14MilestoneApproval_(ms);
        if(ma.state === 'review') out.milestoneReview++; else if(ma.state === 'approved') out.milestoneApproved++; else out.milestoneDraft++;
        if(ma.locked) out.milestoneLocked++;
        if(ma.state === 'review' || ma.locked){
          out.milestoneRows.push({ p, mod, ms, a:ma });
        }
        for(const t of (ms.tasks || [])){
          const ta = phase14TaskApproval_(t);
          if(ta.state === 'review') out.taskReview++; else if(ta.state === 'approved') out.taskApproved++; else out.taskDraft++;
          if(ta.locked) out.taskLocked++;
          if(ta.state === 'review' || ta.locked){
            out.taskRows.push({ p, mod, ms, t, a:ta });
          }
        }
      }
    }
  }
  out.taskRows.sort((a,b) => (Number(b.a.updatedAt||0)-Number(a.a.updatedAt||0)) || String(a.t.title||'').localeCompare(String(b.t.title||'')));
  out.milestoneRows.sort((a,b) => (Number(b.a.updatedAt||0)-Number(a.a.updatedAt||0)) || String(a.ms.title||'').localeCompare(String(b.ms.title||'')));
  return out;
}

function phase14PostRenderDashboard_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return;
  let box = document.querySelector('#phase14ApprovalQueuePanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase14ApprovalQueuePanel';
    box.className = 'phase14-box';
    const host = document.querySelector('#phase13DashboardHost') || document.querySelector('#phase12DashboardHost') || document.querySelector('#phase11DashboardHost') || document.querySelector('#phase10DashboardHost') || document.querySelector('#phase8DashboardHost');
    if(host && host.parentElement) host.parentElement.insertBefore(box, host);
    else tab.appendChild(box);
  }
  const q = phase14CollectApprovalQueue_({ onlyActiveProject:false });
  const active = getActiveProject && getActiveProject();
  const recentAudit = phase14LoadAudit_().slice(0, 6);
  box.innerHTML = `
    <div class="phase14-title">Phase 14 Approval Workflow & Review Queue</div>
    <div class="phase14-grid">
      <div class="phase14-card">
        <div class="phase14-toolbar">
          <button class="btn btn--ghost" type="button" id="phase14BtnOpenChecklistReview">Open Checklist Review</button>
          <button class="btn btn--ghost" type="button" id="phase14BtnOpenMilestoneApproval">Open Milestone Approval</button>
          <button class="btn btn--ghost" type="button" id="phase14BtnOpenExportApprovalAudit">Export Approval Audit</button>
        </div>
        <div class="phase14-kv">
          <div><b>Task Review</b><span>${q.taskReview}</span></div>
          <div><b>Task Locked</b><span>${q.taskLocked}</span></div>
          <div><b>MS Review</b><span>${q.milestoneReview}</span></div>
          <div><b>MS Locked</b><span>${q.milestoneLocked}</span></div>
        </div>
        <div class="phase14-note" style="margin-top:8px">Use task/milestone approvals to control when execution items can be changed. Locked items are protected by manual checklist/milestone guardrails. ${active ? `Active project: <b>${escapeHtml(String(active.name||''))}</b>.` : 'Select a project to review approvals.'}</div>
        <div class="phase14-list" id="phase14DashQueueList"></div>
      </div>
      <div class="phase14-card">
        <div class="phase14-title" style="margin-bottom:6px">Approval Audit (Recent)</div>
        <div class="phase14-pre" id="phase14DashAuditPreview"></div>
      </div>
    </div>
  `;
  const qList = box.querySelector('#phase14DashQueueList');
  const rows = q.taskRows.slice(0, 6).concat(q.milestoneRows.slice(0, 4));
  if(!rows.length){
    qList.innerHTML = `<div class="phase14-helpItem"><b>No pending review items</b><span>Queue fills when tasks/milestones are set to In Review or locked.</span></div>`;
  } else {
    for(const row of rows){
      const isTask = !!row.t;
      const title = isTask ? String(row.t.title||'') : String(row.ms.title||'');
      const meta = isTask
        ? `${row.p?.name || '—'} • ${row.mod?.name || '—'} • ${row.ms?.title || '—'}`
        : `${row.p?.name || '—'} • ${row.mod?.name || '—'}`;
      const a = row.a;
      const wrap = document.createElement('div');
      wrap.className = 'phase14-row';
      wrap.innerHTML = `
        <div>
          <div class="phase14-row__name">${isTask ? 'Task' : 'Milestone'} • ${escapeHtml(title)}</div>
          <div class="phase14-row__meta">${escapeHtml(meta)}</div>
        </div>
        <div class="phase14-tags">
          <span class="phase14-tag ${phase14ApprovalClass_(a)}">${escapeHtml(phase14ApprovalLabel_(a))}</span>
          ${a.locked ? '<span class="phase14-tag locked">LOCKED</span>' : ''}
          <button class="btn btn--ghost" type="button" data-act="open">Open</button>
        </div>
      `;
      wrap.querySelector('[data-act="open"]')?.addEventListener('click', () => {
        try{
          setActiveProject(row.p.id);
          setActiveModule(row.mod.id);
          setActiveMilestone(row.ms.id);
          if(isTask){
            switchTab('checklist');
            setTimeout(() => {
              const el = document.querySelector(`#taskList .task[data-task-id="${CSS.escape(String(row.t.id))}"]`);
              el?.scrollIntoView({ behavior:'smooth', block:'center' });
              el?.classList.add('is-selected'); setTimeout(()=>el?.classList.remove('is-selected'), 900);
            }, 60);
          } else {
            switchTab('milestones');
          }
        }catch{}
      });
      qList.appendChild(wrap);
    }
  }
  box.querySelector('#phase14BtnOpenChecklistReview')?.addEventListener('click', () => { switchTab('checklist'); setTimeout(()=>document.querySelector('#phase14ChecklistApprovalPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
  box.querySelector('#phase14BtnOpenMilestoneApproval')?.addEventListener('click', () => { switchTab('milestones'); setTimeout(()=>document.querySelector('#phase14MilestoneApprovalPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
  box.querySelector('#phase14BtnOpenExportApprovalAudit')?.addEventListener('click', () => { phase14OpenExportTab_({ type:'approval_audit', fmt:'JSON' }); });
  const previewLines = recentAudit.length ? recentAudit.map(a => {
    const when = new Date(Number(a.ts||Date.now())).toLocaleString();
    const bits = [`[${when}]`, a.targetType || 'item', a.action || 'update'];
    if(a.title) bits.push(a.title);
    if(a.state) bits.push(`(${String(a.state).toUpperCase()})`);
    if(a.locked) bits.push('[LOCKED]');
    if(a.note) bits.push(`- ${a.note}`);
    return bits.join(' ');
  }) : ['No approval audit entries yet.'];
  box.querySelector('#phase14DashAuditPreview').textContent = previewLines.join('\n');
}

function phase14PostRenderMilestones_(){
  const tab = document.querySelector('#tab-milestones');
  if(!tab) return;
  phase14DecorateMilestoneList_();

  const detailCard = document.querySelector('#milestoneDetailsModal .pm-milestone-modal__panel')
    || document.querySelector('#milestoneDetailsModal .card')
    || Array.from(tab.querySelectorAll('.card'))[1]
    || Array.from(tab.querySelectorAll('.card')).slice(-1)[0];
  if(!detailCard) return;
  let box = document.querySelector('#phase14MilestoneApprovalPanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase14MilestoneApprovalPanel';
    box.className = 'phase14-box';
    detailCard.appendChild(box);
  }else if(box.parentElement !== detailCard){
    detailCard.appendChild(box);
  }
  const ctx = phase14CurrentMilestoneCtx_();
  if(!ctx){
    box.innerHTML = `
      <div class="phase14-title">Milestone Approval</div>
      <div class="phase14-note">Select a milestone to manage approval state and change lock.</div>
    `;
    return;
  }
  const { p, mod, ms } = ctx;
  const a = phase14MilestoneApproval_(ms);
  const taskTotal = Array.isArray(ms.tasks) ? ms.tasks.length : 0;
  const tReview = (ms.tasks||[]).filter(t => phase14TaskApproval_(t).state === 'review').length;
  const tApproved = (ms.tasks||[]).filter(t => phase14TaskApproval_(t).state === 'approved').length;
  const tLocked = (ms.tasks||[]).filter(t => phase14TaskApproval_(t).locked).length;
  const canApprove = taskTotal === 0 || (tReview + tApproved) > 0;

  box.innerHTML = `
    <div class="phase14-title">Milestone Approval</div>
    <div class="phase14-toolbar">
      <span class="phase14-tag ${phase14ApprovalClass_(a)}">${escapeHtml(phase14ApprovalLabel_(a))}</span>
      ${a.locked ? '<span class="phase14-tag locked">LOCKED</span>' : ''}
      <button class="btn btn--ghost" type="button" id="phase14BtnMsReview">Request Review</button>
      <button class="btn btn--ghost" type="button" id="phase14BtnMsApprove" ${canApprove ? '' : 'disabled'}>Approve</button>
      <button class="btn btn--ghost" type="button" id="phase14BtnMsRework">Back to Draft</button>
      <button class="btn btn--ghost" type="button" id="phase14BtnMsLockToggle">${a.locked ? 'Unlock Changes' : 'Lock Changes'}</button>
    </div>
    <div class="phase14-kv">
      <div><b>Tasks</b><span>${taskTotal}</span></div>
      <div><b>Task Review</b><span>${tReview}</span></div>
      <div><b>Task Approved</b><span>${tApproved}</span></div>
      <div><b>Task Locked</b><span>${tLocked}</span></div>
    </div>
    <div class="phase14-note" style="margin-top:8px">${escapeHtml(String(p?.name||''))} • ${escapeHtml(String(mod?.name||''))} • ${escapeHtml(String(ms?.title||''))}</div>
    <div class="phase14-note">When the milestone is locked, manual edits on the milestone form and checklist mutation buttons are blocked until unlocked.</div>
    ${phase14IsMilestoneLocked_(ms) ? '<div class="phase14-lockHint">Milestone lock is active. Save/Delete milestone and checklist mutate actions are guarded.</div>' : ''}
  `;
  box.querySelector('#phase14BtnMsReview')?.addEventListener('click', ()=>phase14SetMilestoneApprovalState_('review'));
  box.querySelector('#phase14BtnMsApprove')?.addEventListener('click', ()=>phase14SetMilestoneApprovalState_('approved'));
  box.querySelector('#phase14BtnMsRework')?.addEventListener('click', ()=>phase14SetMilestoneApprovalState_('draft'));
  box.querySelector('#phase14BtnMsLockToggle')?.addEventListener('click', phase14ToggleMilestoneLock_);

  try{
    const saveBtn = document.querySelector('#btnSaveMilestone');
    const delBtn = document.querySelector('#btnDeleteMilestone');
    if(saveBtn){ saveBtn.disabled = !!a.locked; saveBtn.title = a.locked ? 'Milestone changes are locked (Phase 14)' : ''; }
    if(delBtn){ delBtn.disabled = !!a.locked; delBtn.title = a.locked ? 'Milestone changes are locked (Phase 14)' : ''; }
  }catch{}
}

function phase14DecorateMilestoneList_(){
  const p = getActiveProject && getActiveProject();
  const mod = p ? getActiveModule(p) : null;
  const items = Array.from(document.querySelectorAll('#milestoneList .item'));
  const rows = Array.isArray(mod && mod.milestones) ? mod.milestones : [];
  items.forEach((el, idx) => {
    const ms = rows[idx];
    if(!ms) return;
    const a = phase14MilestoneApproval_(ms);
    let sub = el.querySelector('.item__sub');
    if(!sub) return;
    let badge = sub.querySelector('.phase14-msBadgeState');
    if(!badge){ badge = document.createElement('span'); badge.className = `badge phase14-msBadgeState`; sub.appendChild(badge); }
    badge.textContent = phase14ApprovalLabel_(a);
    badge.className = `badge phase14-msBadgeState phase14-badge ${phase14ApprovalClass_(a)}`;
    let lockBadge = sub.querySelector('.phase14-msBadgeLock');
    if(a.locked){
      if(!lockBadge){ lockBadge = document.createElement('span'); lockBadge.className = 'badge phase14-msBadgeLock'; sub.appendChild(lockBadge); }
      lockBadge.textContent = 'LOCKED';
      lockBadge.className = 'badge phase14-msBadgeLock phase14-badge locked';
      el.classList.add('phase14-taskLocked');
    } else {
      if(lockBadge) lockBadge.remove();
      el.classList.remove('phase14-taskLocked');
    }
  });
}

function phase14PostRenderChecklist_(){
  const tab = document.querySelector('#tab-checklist');
  if(!tab) return;
  phase14DecorateTaskCards_();

  const cards = Array.from(tab.querySelectorAll('.card'));
  const tasksCard = cards[1] || cards[cards.length-1];
  if(!tasksCard) return;
  let box = document.querySelector('#phase14ChecklistApprovalPanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase14ChecklistApprovalPanel';
    box.className = 'phase14-box';
    tasksCard.appendChild(box);
  }
  const p = getActiveProject && getActiveProject();
  const mod = p ? getActiveModule(p) : null;
  const ms = p ? getActiveMilestone(p) : null;
  if(!ms){
    box.innerHTML = `<div class="phase14-title">Task Review Queue</div><div class="phase14-note">Select a milestone to review tasks and apply approval / lock states.</div>`;
    return;
  }
  const ma = phase14MilestoneApproval_(ms);
  const tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
  const counts = { draft:0, review:0, approved:0, locked:0 };
  for(const t of tasks){ const a = phase14TaskApproval_(t); counts[a.state] = (counts[a.state]||0)+1; if(a.locked) counts.locked++; }

  box.innerHTML = `
    <div class="phase14-title">Task Review Queue</div>
    <div class="phase14-toolbar">
      <span class="phase14-tag ${phase14ApprovalClass_(ma)}">Milestone ${escapeHtml(phase14ApprovalLabel_(ma))}</span>
      ${ma.locked ? '<span class="phase14-tag locked">MILESTONE LOCKED</span>' : ''}
      <button class="btn btn--ghost" type="button" id="phase14BtnTaskQueuePending">Pending Only</button>
      <button class="btn btn--ghost" type="button" id="phase14BtnTaskQueueAll">All Tasks</button>
      <button class="btn btn--ghost" type="button" id="phase14BtnTaskQueueApproveReview">Approve In Review</button>
    </div>
    <div class="phase14-kv">
      <div><b>Draft</b><span>${counts.draft||0}</span></div>
      <div><b>Review</b><span>${counts.review||0}</span></div>
      <div><b>Approved</b><span>${counts.approved||0}</span></div>
      <div><b>Locked</b><span>${counts.locked||0}</span></div>
    </div>
    <div class="phase14-note" style="margin-top:8px">${escapeHtml(String(p?.name||''))} • ${escapeHtml(String(mod?.name||''))} • ${escapeHtml(String(ms?.title||''))}</div>
    <div class="phase14-list" id="phase14ChecklistTaskQueueList"></div>
  `;
  const list = box.querySelector('#phase14ChecklistTaskQueueList');
  let mode = box.dataset.mode || 'pending';
  const renderRows = () => {
    box.dataset.mode = mode;
    list.innerHTML = '';
    let rows = tasks.slice();
    if(mode === 'pending') rows = rows.filter(t => { const a = phase14TaskApproval_(t); return a.state === 'review' || a.locked; });
    rows.sort((a,b) => {
      const aa = phase14TaskApproval_(a), bb = phase14TaskApproval_(b);
      const rank = x => x.state === 'review' ? 0 : x.locked ? 1 : x.state === 'approved' ? 2 : 3;
      return rank(aa) - rank(bb) || String(a.title||'').localeCompare(String(b.title||''));
    });
    if(!rows.length){
      list.innerHTML = `<div class="phase14-helpItem"><b>No ${mode === 'pending' ? 'pending review/locked' : ''} tasks</b><span>Use the buttons below each task row to move it into review or approve it.</span></div>`;
      return;
    }
    rows.slice(0, 80).forEach(t => {
      const a = phase14TaskApproval_(t);
      const row = document.createElement('div');
      row.className = 'phase14-row';
      row.innerHTML = `
        <div>
          <div class="phase14-row__name">${escapeHtml(String(t.title||''))}</div>
          <div class="phase14-row__meta">${t.done ? 'Done' : 'Open'} • ${escapeHtml(String(t.severity||'normal').toUpperCase())}${t.assignee ? ' • ' + escapeHtml(String(t.assignee)) : ''}${a.note ? ' • note: ' + escapeHtml(String(a.note)).slice(0,80) : ''}</div>
        </div>
        <div class="phase14-tags">
          <span class="phase14-tag ${phase14ApprovalClass_(a)}">${escapeHtml(phase14ApprovalLabel_(a))}</span>
          ${a.locked ? '<span class="phase14-tag locked">LOCKED</span>' : ''}
          <button class="btn btn--ghost" type="button" data-act="focus">Focus</button>
          <button class="btn btn--ghost" type="button" data-act="review">Review</button>
          <button class="btn btn--ghost" type="button" data-act="approve">Approve</button>
          <button class="btn btn--ghost" type="button" data-act="rework">Draft</button>
          <button class="btn btn--ghost" type="button" data-act="lock">${a.locked ? 'Unlock' : 'Lock'}</button>
        </div>
      `;
      row.querySelector('[data-act="focus"]')?.addEventListener('click', () => {
        const el = document.querySelector(`#taskList .task[data-task-id="${CSS.escape(String(t.id))}"]`);
        el?.scrollIntoView({ behavior:'smooth', block:'center' });
        el?.classList.add('is-selected'); setTimeout(()=>el?.classList.remove('is-selected'), 900);
      });
      row.querySelector('[data-act="review"]')?.addEventListener('click', ()=>phase14SetTaskApprovalState_(t.id, 'review'));
      row.querySelector('[data-act="approve"]')?.addEventListener('click', ()=>phase14SetTaskApprovalState_(t.id, 'approved'));
      row.querySelector('[data-act="rework"]')?.addEventListener('click', ()=>phase14SetTaskApprovalState_(t.id, 'draft'));
      row.querySelector('[data-act="lock"]')?.addEventListener('click', ()=>phase14ToggleTaskLock_(t.id));
      list.appendChild(row);
    });
  };
  renderRows();
  box.querySelector('#phase14BtnTaskQueuePending')?.addEventListener('click', ()=>{ mode='pending'; renderRows(); });
  box.querySelector('#phase14BtnTaskQueueAll')?.addEventListener('click', ()=>{ mode='all'; renderRows(); });
  box.querySelector('#phase14BtnTaskQueueApproveReview')?.addEventListener('click', async () => {
    if(phase14IsMilestoneLocked_(ms)) { alert('Milestone is locked. Unlock it first if you need to change approvals.'); return; }
    const ids = tasks.filter(t => phase14TaskApproval_(t).state === 'review').map(t => t.id);
    if(!ids.length){ alert('No tasks currently in review.'); return; }
    const okApprove = await pmConfirmDialog_(`Approve ${ids.length} task(s) currently in review?`, { title:'Approve Review Queue', okText:'Approve' });
    if(!okApprove) return;
    for(const id of ids){
      const tt = (ms.tasks || []).find(x => x && x.id === id); if(!tt) continue;
      const a = phase14TaskApproval_(tt);
      a.state = 'approved'; a.approvedAt = Date.now(); a.reviewer = 'ME'; a.updatedAt = Date.now();
      phase14LogApprovalAction_({ p, mod, ms, t:tt }, { targetType:'task', action:'approve', targetId:tt.id, title:tt.title, state:a.state, locked:a.locked });
    }
    saveState();
    renderAll();
  });

  // disable common checklist mutation buttons when milestone is locked
  const locked = phase14IsMilestoneLocked_(ms);
  ['btnAddTask','btnSortTasks','btnClearDone'].forEach(id => {
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.disabled = locked;
    btn.title = locked ? 'Milestone changes are locked (Phase 14)' : '';
  });
}

function phase14DecorateTaskCards_(){
  const p = getActiveProject && getActiveProject();
  const ms = p ? getActiveMilestone(p) : null;
  const cards = Array.from(document.querySelectorAll('#taskList .task'));
  if(!ms){ cards.forEach(c => c.classList.remove('phase14-taskLocked')); return; }
  for(const card of cards){
    const tid = String(card.dataset.taskId || '');
    const t = (ms.tasks || []).find(x => x && String(x.id) === tid);
    if(!t) continue;
    const a = phase14TaskApproval_(t);
    const meta = card.querySelector('.task__meta');
    if(meta){
      let stateBadge = meta.querySelector('.phase14-taskBadgeState');
      if(!stateBadge){ stateBadge = document.createElement('span'); stateBadge.className = 'badge phase14-taskBadgeState'; meta.appendChild(stateBadge); }
      stateBadge.textContent = phase14ApprovalLabel_(a);
      stateBadge.className = `badge phase14-taskBadgeState phase14-badge ${phase14ApprovalClass_(a)}`;
      let lockBadge = meta.querySelector('.phase14-taskBadgeLock');
      if(a.locked){
        if(!lockBadge){ lockBadge = document.createElement('span'); lockBadge.className = 'badge phase14-taskBadgeLock'; meta.appendChild(lockBadge); }
        lockBadge.textContent = 'LOCKED';
        lockBadge.className = 'badge phase14-taskBadgeLock phase14-badge locked';
      } else if(lockBadge){ lockBadge.remove(); }
    }
    card.classList.toggle('phase14-taskLocked', !!a.locked);
  }
}

function phase14BindGuardrails_(){
  if(document._phase14GuardrailsBound) return;
  document._phase14GuardrailsBound = true;

  const block = (e, msg) => {
    try{ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation(); }catch{}
    alert(msg || 'This item is locked by Phase 14 approval controls. Unlock it first.');
  };

  document.addEventListener('click', function(e){
    const t = e.target;
    if(!t || !(t instanceof Element)) return;

    // topbar export cleanup shortcut
    const exportBtn = t.closest('#phase14BtnExportCenter');
    if(exportBtn){
      e.preventDefault();
      phase14OpenExportTab_();
      return;
    }

    // Milestone-level guards
    const saveMs = t.closest('#btnSaveMilestone');
    const delMs = t.closest('#btnDeleteMilestone');
    if((saveMs || delMs) && phase14ActiveMilestoneLocked_()){
      return block(e, 'Milestone changes are locked. Use Phase 14 Milestone Approval panel to unlock first.');
    }
    const mutBtn = t.closest('#btnAddTask, #btnSortTasks, #btnClearDone, #phase9BtnAssignSet, #phase9BtnAssignClear, #phase9BtnAssignRebalance');
    if(mutBtn && phase14ActiveMilestoneLocked_()){
      return block(e, 'Checklist changes are locked because the active milestone is locked (Phase 14).');
    }

    // Task-level guard on task card interactive controls (allow comments thread button)
    const taskCard = t.closest('#taskList .task');
    if(taskCard){
      const tid = String(taskCard.dataset.taskId || '');
      const ctx = phase14TaskCtxInActive_(tid);
      if(!ctx) return;
      if(phase14IsMilestoneLocked_(ctx.ms)){
        const interactive = t.closest('button,input,select,textarea,label,.iconbtn');
        const allowComment = !!t.closest('[data-act="phase9Comment"]');
        if(interactive && !allowComment){
          return block(e, 'This milestone is locked. Unlock milestone changes from the Phase 14 Milestone Approval panel.');
        }
      }
      const ta = phase14TaskApproval_(ctx.t);
      if(ta.locked){
        const interactive = t.closest('button,input,select,textarea,label,.iconbtn');
        const allowComment = !!t.closest('[data-act="phase9Comment"]');
        if(interactive && !allowComment){
          return block(e, 'This task is locked by approval controls. Unlock the task in the Phase 14 Task Review Queue first.');
        }
      }
    }
  }, true);

  document.addEventListener('change', function(e){
    const t = e.target;
    if(!t || !(t instanceof Element)) return;
    const taskCard = t.closest('#taskList .task');
    if(!taskCard) return;
    const tid = String(taskCard.dataset.taskId || '');
    const ctx = phase14TaskCtxInActive_(tid);
    if(!ctx) return;
    if(phase14IsMilestoneLocked_(ctx.ms)){
      return block(e, 'This milestone is locked. Unlock milestone changes to edit tasks.');
    }
    if(phase14IsTaskLocked_(ctx.t)){
      return block(e, 'This task is locked by approval controls.');
    }
  }, true);
}

function phase14InjectExportTab_(){
  const sidebarNav = document.querySelector('.nav');
  const importTab = document.querySelector('#tab-import');
  if(!sidebarNav || !importTab) return;

  let navBtn = sidebarNav.querySelector('.nav__item[data-tab="export"]');
  if(!navBtn){
    const importBtn = sidebarNav.querySelector('.nav__item[data-tab="import"]');
    navBtn = document.createElement('button');
    navBtn.className = 'nav__item';
    navBtn.type = 'button';
    navBtn.dataset.tab = 'export';
    navBtn.textContent = 'Export';
    if(importBtn && importBtn.parentElement) importBtn.parentElement.insertBefore(navBtn, importBtn);
    else sidebarNav.appendChild(navBtn);
  }

  let panel = document.querySelector('#tab-export');
  if(!panel){
    panel = document.createElement('section');
    panel.className = 'tab';
    panel.id = 'tab-export';
    panel.dataset.tab = 'export';
    panel.innerHTML = `
      <div class="tab__header">
        <div class="tab__title">Export Center</div>
        <div class="tab__subtitle">Choose what to export, format, and scope from one place (replaces scattered export buttons in the top bar).</div>
      </div>
      <div id="phase14ExportCenterRoot"></div>
    `;
    importTab.parentElement.insertBefore(panel, importTab);
  }

  if(ui && Array.isArray(ui.tabs) && !ui.tabs.some(x => x && x.dataset && x.dataset.tab === 'export')) ui.tabs.push(navBtn);
  if(ui && Array.isArray(ui.tabPanels) && !ui.tabPanels.some(x => x && x.dataset && x.dataset.tab === 'export')) ui.tabPanels.push(panel);

  if(!navBtn._phase14Bound){
    navBtn.addEventListener('click', () => {
      switchTab('export');
      setTimeout(() => phase14RenderExportCenter_(), 20);
    });
    navBtn._phase14Bound = true;
  }
}

function phase14EnhanceTopbarExport_(){
  const topbarRight = document.querySelector('#topbarRight') || document.querySelector('.topbar__right') || document.querySelector('.topbar-right');
  if(!topbarRight) return;

  // Hide scattered export-related buttons and route users to Export Center.
  ['#btnExportJson','#btnExportMd','#btnExportTxt','#phase7BtnExportV2','#phase9BtnAuditExport','#phase10BtnStatusReport','#phase12BtnRiskDigest']
    .forEach(sel => { const el = document.querySelector(sel); if(el){ el.style.display = 'none'; el.dataset.phase14HiddenExport = '1'; } });

  let btn = document.querySelector('#phase14BtnExportCenter');
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'phase14BtnExportCenter';
    btn.className = 'btn phase14-topbar-export';
    btn.type = 'button';
    btn.textContent = 'Export';
    btn.title = 'Open Export Center';
    const before = document.querySelector('#phase7BtnImportV2') || topbarRight.firstElementChild || null;
    topbarRight.insertBefore(btn, before);
  }
}

function phase14LoadExportUi_(){
  if(phase14State_.exportUi) return phase14State_.exportUi;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE14_EXPORT_UI_KEY) || 'null'); }catch{}
  const x = (raw && typeof raw === 'object') ? raw : {};
  phase14State_.exportUi = {
    type: ['state_json','project_doc','portable_v2','status_report','risk_digest','audit_activity','approval_audit','dashboard_views','digest_presets'].includes(String(x.type||'')) ? String(x.type) : 'project_doc',
    fmt: ['JSON','MD','TXT'].includes(String(x.fmt||'').toUpperCase()) ? String(x.fmt).toUpperCase() : 'MD',
    allProjects: !!x.allProjects,
    includeApprovalAudit: x.includeApprovalAudit !== false,
  };
  return phase14State_.exportUi;
}
function phase14SaveExportUi_(){ try{ localStorage.setItem(PHASE14_EXPORT_UI_KEY, JSON.stringify(phase14LoadExportUi_())); }catch{} }

function phase14OpenExportTab_(opts){
  const uiCfg = phase14LoadExportUi_();
  if(opts && opts.type) uiCfg.type = opts.type;
  if(opts && opts.fmt) uiCfg.fmt = String(opts.fmt).toUpperCase();
  phase14SaveExportUi_();
  switchTab('export');
  setTimeout(() => {
    phase14RenderExportCenter_();
    const typeSel = document.querySelector('#phase14ExportType');
    const fmtSel = document.querySelector('#phase14ExportFmt');
    if(typeSel && opts && opts.type){ typeSel.value = uiCfg.type; typeSel.dispatchEvent(new Event('change')); }
    if(fmtSel && opts && opts.fmt){ fmtSel.value = uiCfg.fmt; fmtSel.dispatchEvent(new Event('change')); }
    document.querySelector('#phase14BtnRunExport')?.focus();
  }, 30);
}

function phase14RenderExportCenter_(){
  const root = document.querySelector('#phase14ExportCenterRoot');
  if(!root) return;
  const cfg = phase14LoadExportUi_();
  const p = getActiveProject && getActiveProject();
  const approvalAuditCount = (phase14LoadAudit_() || []).length;
  const dashViewsCount = (typeof phase11LoadDashViews_ === 'function') ? (phase11LoadDashViews_() || []).length : 0;
  const digestPresetCount = (typeof phase13LoadDigestPresets_ === 'function') ? (phase13LoadDigestPresets_() || []).length : 0;

  root.innerHTML = `
    <div class="phase14-exportLayout">
      <div class="phase14-exportCard">
        <h4>Export Request</h4>
        <div class="phase14-fields">
          <label class="field">
            <span class="field__label">What do you want to export?</span>
            <select class="select" id="phase14ExportType">
              <option value="project_doc">Active Project Document (.md / .txt)</option>
              <option value="state_json">Full App State JSON</option>
              <option value="portable_v2">Portable V2 Bundle JSON (Phase 7)</option>
              <option value="status_report">Status Report (Phase 10)</option>
              <option value="risk_digest">Risk Digest (Phase 12)</option>
              <option value="audit_activity">Activity Audit Trail (Phase 9)</option>
              <option value="approval_audit">Approval Audit Trail (Phase 14)</option>
              <option value="dashboard_views">Dashboard Views JSON (Phase 11/12)</option>
              <option value="digest_presets">Digest Presets JSON (Phase 13)</option>
            </select>
          </label>
          <div class="row">
            <label class="field">
              <span class="field__label">Format</span>
              <select class="select" id="phase14ExportFmt">
                <option value="MD">MD</option>
                <option value="TXT">TXT</option>
                <option value="JSON">JSON</option>
              </select>
            </label>
            <label class="field" id="phase14ExportScopeWrap">
              <span class="field__label">Scope</span>
              <select class="select" id="phase14ExportScope">
                <option value="active">Active Project</option>
                <option value="all">All Projects</option>
              </select>
            </label>
          </div>
          <label class="field" id="phase14ExportApprovalAuditToggleWrap">
            <span class="field__label">Include extra approval audit file (JSON/TXT only on supportable types)</span>
            <select class="select" id="phase14ExportApprovalAuditToggle">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <div class="phase14-helpItem" id="phase14ExportPreviewCard">
            <b>Export details</b>
            <span id="phase14ExportDetailsText">Choose an export type.</span>
          </div>
          <div class="phase14-toolbar">
            <button class="btn" type="button" id="phase14BtnRunExport">Run Export</button>
            <button class="btn btn--ghost" type="button" id="phase14BtnOpenImportTab">Open Import Tab</button>
            <button class="btn btn--ghost" type="button" id="phase14BtnExportRefresh">Refresh Summary</button>
          </div>
        </div>
      </div>
      <div class="phase14-exportCard">
        <h4>Available Sources</h4>
        <div class="phase14-helpList">
          <div class="phase14-helpItem"><b>Active Project</b><span>${p ? escapeHtml(String(p.name||'')) : 'No active project selected.'}</span></div>
          <div class="phase14-helpItem"><b>Approval Audit Entries</b><span>${approvalAuditCount} entries (Phase 14 local approval audit trail)</span></div>
          <div class="phase14-helpItem"><b>Dashboard Views</b><span>${dashViewsCount} saved views (Phase 11 / portable export supported)</span></div>
          <div class="phase14-helpItem"><b>Digest Presets</b><span>${digestPresetCount} saved digest presets (Phase 13)</span></div>
          <div class="phase14-helpItem"><b>Topbar Cleanup</b><span>Legacy export buttons are hidden and routed through this tab. Import buttons remain available.</span></div>
        </div>
        <div class="phase14-pre" id="phase14ExportExamplePreview"></div>
      </div>
    </div>
  `;

  const typeSel = root.querySelector('#phase14ExportType');
  const fmtSel = root.querySelector('#phase14ExportFmt');
  const scopeSel = root.querySelector('#phase14ExportScope');
  const scopeWrap = root.querySelector('#phase14ExportScopeWrap');
  const auditSel = root.querySelector('#phase14ExportApprovalAuditToggle');
  const auditWrap = root.querySelector('#phase14ExportApprovalAuditToggleWrap');
  const detailsText = root.querySelector('#phase14ExportDetailsText');
  const exPreview = root.querySelector('#phase14ExportExamplePreview');

  typeSel.value = cfg.type;
  fmtSel.value = cfg.fmt;
  scopeSel.value = cfg.allProjects ? 'all' : 'active';
  auditSel.value = cfg.includeApprovalAudit ? 'yes' : 'no';

  const applyTypeRules = () => {
    const type = typeSel.value;
    let fmts = ['JSON'];
    let allowAllScope = false;
    let desc = '';
    if(type === 'project_doc'){
      fmts = ['MD','TXT'];
      allowAllScope = false;
      desc = 'Exports the active project in your PM template-friendly document format. Best for sharing plans or archiving milestone/task structure.';
    } else if(type === 'state_json'){
      fmts = ['JSON'];
      allowAllScope = true;
      desc = 'Full app database snapshot (all projects + UI state). Use for backups or full restore preview.';
    } else if(type === 'portable_v2'){
      fmts = ['JSON'];
      allowAllScope = true;
      desc = 'Phase 7 portable V2 export bundle with metadata and compatibility helpers.';
    } else if(type === 'status_report'){
      fmts = ['MD','TXT'];
      allowAllScope = false;
      desc = 'Phase 10 active-project status report with risk summary + top priority tasks.';
    } else if(type === 'risk_digest'){
      fmts = ['MD','TXT'];
      allowAllScope = true;
      desc = 'Phase 12 risk digest generated from project health, SLA aging, and notification signals.';
    } else if(type === 'audit_activity'){
      fmts = ['TXT','JSON'];
      allowAllScope = true;
      desc = 'Phase 9 activity audit trail export (filtered state is used if Phase 8 audit search is active).';
    } else if(type === 'approval_audit'){
      fmts = ['JSON','TXT'];
      allowAllScope = true;
      desc = 'Phase 14 approval audit trail (task/milestone approval actions, locks, rollback notes).';
    } else if(type === 'dashboard_views'){
      fmts = ['JSON'];
      allowAllScope = true;
      desc = 'Portable backup of saved dashboard views (Phase 11 / Phase 12 import-export compatibility).';
    } else if(type === 'digest_presets'){
      fmts = ['JSON'];
      allowAllScope = true;
      desc = 'Phase 13 digest presets backup (status/risk export presets).';
    }

    // rebuild format options safely
    const oldFmt = fmtSel.value;
    fmtSel.innerHTML = fmts.map(x => `<option value="${x}">${x}</option>`).join('');
    fmtSel.value = fmts.includes(oldFmt) ? oldFmt : fmts[0];
    scopeWrap.classList.toggle('phase14-hidden', !allowAllScope && type !== 'risk_digest' && type !== 'state_json' && type !== 'portable_v2' && type !== 'audit_activity' && type !== 'approval_audit' && type !== 'dashboard_views' && type !== 'digest_presets');
    if(!allowAllScope) scopeSel.value = 'active';
    const allowExtraApproval = ['project_doc','status_report','risk_digest','audit_activity'].includes(type);
    auditWrap.classList.toggle('phase14-hidden', !allowExtraApproval);
    if(!allowExtraApproval) auditSel.value = 'no';

    const scopeLabel = (scopeSel.value === 'all') ? 'All Projects' : 'Active Project';
    detailsText.textContent = `${desc} Selected format: ${fmtSel.value}. Scope: ${scopeLabel}.`;

    const previewLines = [];
    previewLines.push(`Type: ${type}`);
    previewLines.push(`Format: ${fmtSel.value}`);
    previewLines.push(`Scope: ${scopeSel.value}`);
    if(p) previewLines.push(`Active Project: ${p.name}`);
    if(type === 'approval_audit') previewLines.push(`Approval Audit Entries: ${approvalAuditCount}`);
    if(type === 'dashboard_views') previewLines.push(`Dashboard Views: ${dashViewsCount}`);
    if(type === 'digest_presets') previewLines.push(`Digest Presets: ${digestPresetCount}`);
    if(auditSel.value === 'yes') previewLines.push(`Extra approval audit sidecar: YES`);
    previewLines.push('');
    previewLines.push('Tip: Use the topbar Export button to jump back here anytime.');
    exPreview.textContent = previewLines.join('\n');

    cfg.type = type;
    cfg.fmt = fmtSel.value;
    cfg.allProjects = (scopeSel.value === 'all');
    cfg.includeApprovalAudit = (auditSel.value === 'yes');
    phase14SaveExportUi_();
  };

  typeSel.addEventListener('change', applyTypeRules);
  fmtSel.addEventListener('change', applyTypeRules);
  scopeSel.addEventListener('change', applyTypeRules);
  auditSel.addEventListener('change', applyTypeRules);
  applyTypeRules();

  root.querySelector('#phase14BtnOpenImportTab')?.addEventListener('click', () => switchTab('import'));
  root.querySelector('#phase14BtnExportRefresh')?.addEventListener('click', () => phase14RenderExportCenter_());
  root.querySelector('#phase14BtnRunExport')?.addEventListener('click', () => phase14RunExportCenterRequest_());
}

function phase14SafeFile_(name){
  return String(name || 'export').replace(/[^a-z0-9\-_]+/ig,'_').replace(/^_+|_+$/g,'').slice(0,80) || 'export';
}
function phase14DateStamp_(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  const h = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${y}${m}${da}_${h}${mi}`;
}
function phase14ApprovalAuditText_(){
  const rows = phase14LoadAudit_();
  const L = [
    'PHASE 14 APPROVAL AUDIT EXPORT',
    `Exported: ${new Date().toLocaleString()}`,
    `Rows: ${rows.length}`,
    ''
  ];
  rows.forEach((r, i) => {
    const when = new Date(Number(r.ts||Date.now())).toLocaleString();
    const parts = [`${i+1}. [${when}]`, `${r.targetType||'item'}`, `${r.action||'update'}`];
    if(r.title) parts.push(r.title);
    if(r.state) parts.push(`[${String(r.state).toUpperCase()}]`);
    if(r.locked) parts.push('[LOCKED]');
    if(r.note) parts.push(`note=${r.note}`);
    L.push(parts.join(' '));
  });
  return L.join('\n');
}
function phase14ExportApprovalAudit_(fmt){
  const kind = String(fmt || 'JSON').toUpperCase() === 'TXT' ? 'TXT' : 'JSON';
  const stamp = phase14DateStamp_();
  const rows = phase14LoadAudit_();
  if(kind === 'JSON'){
    const payload = { version:1, exportedAt:Date.now(), type:'phase14_approval_audit', rows };
    downloadText(`phase14_approval_audit_${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
  } else {
    downloadText(`phase14_approval_audit_${stamp}.txt`, phase14ApprovalAuditText_(), 'text/plain');
  }
  try{ addActivity(`Phase14 exported approval audit (${kind})`); }catch{}
  try{ saveState({ skipHistory:true }); }catch{}
}

function phase14RunExportCenterRequest_(){
  const root = document.querySelector('#phase14ExportCenterRoot');
  if(!root) return;
  const type = String(root.querySelector('#phase14ExportType')?.value || 'project_doc');
  const fmt = String(root.querySelector('#phase14ExportFmt')?.value || 'MD').toUpperCase();
  const allProjects = String(root.querySelector('#phase14ExportScope')?.value || 'active') === 'all';
  const includeApprovalAudit = String(root.querySelector('#phase14ExportApprovalAuditToggle')?.value || 'no') === 'yes';
  const cfg = phase14LoadExportUi_();
  cfg.type = type; cfg.fmt = fmt; cfg.allProjects = allProjects; cfg.includeApprovalAudit = includeApprovalAudit; phase14SaveExportUi_();

  try{
    if(type === 'project_doc'){
      const p = getActiveProject && getActiveProject();
      if(!p){ alert('Select an active project first.'); return; }
      const safe = phase14SafeFile_(p.name || 'project');
      if(fmt === 'TXT'){
        if(typeof serializeProjectToText_ !== 'function') throw new Error('Project TXT export helper not found');
        downloadText(`${safe}.txt`, serializeProjectToText_(p), 'text/plain');
      } else {
        if(typeof serializeProjectToMarkdown_ !== 'function') throw new Error('Project MD export helper not found');
        downloadText(`${safe}.md`, serializeProjectToMarkdown_(p), 'text/markdown');
      }
      addActivity(`Phase14 export center exported project doc (${fmt}): ${p.name}`);
      if(includeApprovalAudit) phase14ExportApprovalAudit_(fmt === 'TXT' ? 'TXT' : 'JSON');
      return;
    }

    if(type === 'state_json'){
      const payload = (typeof sanitizeState === 'function') ? sanitizeState(state) : state;
      downloadText(`stark_pm_export_${phase14DateStamp_()}.json`, JSON.stringify(payload, null, 2), 'application/json');
      addActivity('Phase14 export center exported full state JSON');
      return;
    }

    if(type === 'portable_v2'){
      if(typeof phase7ExportV2Bundle_ === 'function'){
        phase7ExportV2Bundle_();
        addActivity('Phase14 export center triggered portable V2 export');
      } else {
        alert('Phase 7 portable V2 export is not available in this build.');
      }
      return;
    }

    if(type === 'status_report'){
      const p = getActiveProject && getActiveProject();
      if(!p){ alert('Select an active project first.'); return; }
      if(typeof phase10BuildStatusReport_ !== 'function'){ alert('Phase 10 status report generator is not available.'); return; }
      const kind = (fmt === 'TXT') ? 'txt' : 'md';
      const txt = phase10BuildStatusReport_(kind);
      if(!txt){ alert('Could not build status report.'); return; }
      const safe = phase14SafeFile_(String(p.name||'project'));
      downloadText(`${safe}_status_report_${phase14DateStamp()}.${kind === 'md' ? 'md' : 'txt'}`, txt, kind === 'md' ? 'text/markdown' : 'text/plain');
      addActivity(`Phase14 export center exported status report (${fmt}): ${p.name}`);
      if(includeApprovalAudit) phase14ExportApprovalAudit_(fmt === 'TXT' ? 'TXT' : 'JSON');
      return;
    }

    if(type === 'risk_digest'){
      if(typeof phase12BuildRiskDigestData_ !== 'function' || typeof phase12BuildRiskDigestText_ !== 'function'){
        alert('Phase 12 risk digest helpers are not available.'); return;
      }
      const d = phase12BuildRiskDigestData_({ allProjects });
      const kind = (fmt === 'TXT') ? 'TXT' : 'MD';
      const txt = phase12BuildRiskDigestText_(kind, d);
      const scope = allProjects ? 'all' : 'active';
      downloadText(`risk_digest_${scope}_${phase14DateStamp()}.${kind === 'MD' ? 'md' : 'txt'}`, txt, kind === 'MD' ? 'text/markdown' : 'text/plain');
      addActivity(`Phase14 export center exported risk digest (${kind}) [${scope}]`);
      if(includeApprovalAudit) phase14ExportApprovalAudit_(kind === 'TXT' ? 'TXT' : 'JSON');
      return;
    }

    if(type === 'audit_activity'){
      if(typeof phase9ExportAuditTrail_ === 'function'){
        phase9ExportAuditTrail_(fmt === 'JSON' ? 'json' : 'txt');
      } else {
        const rows = Array.isArray(state?.activity) ? state.activity : [];
        if(fmt === 'JSON') downloadText(`audit_trail_${phase14DateStamp()}.json`, JSON.stringify({ rows }, null, 2), 'application/json');
        else downloadText(`audit_trail_${phase14DateStamp()}.txt`, rows.map(a => `[${new Date(Number(a.ts||Date.now())).toLocaleString()}] ${String(a.msg||'')}`).join('\n'), 'text/plain');
        addActivity(`Phase14 export center exported audit trail fallback (${fmt})`);
      }
      if(includeApprovalAudit) phase14ExportApprovalAudit_(fmt === 'TXT' ? 'TXT' : 'JSON');
      return;
    }

    if(type === 'approval_audit'){
      phase14ExportApprovalAudit_(fmt);
      return;
    }

    if(type === 'dashboard_views'){
      let views = [];
      try{ views = (typeof phase11LoadDashViews_ === 'function') ? (phase11LoadDashViews_() || []) : []; }catch{ views = []; }
      const payload = { version:1, exportedAt:Date.now(), type:'phase11_dashboard_views', views };
      downloadText(`dashboard_views_${phase14DateStamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
      addActivity(`Phase14 export center exported dashboard views (${views.length})`);
      return;
    }

    if(type === 'digest_presets'){
      let presets = [];
      try{ presets = (typeof phase13LoadDigestPresets_ === 'function') ? (phase13LoadDigestPresets_() || []) : []; }catch{ presets = []; }
      const payload = { version:1, exportedAt:Date.now(), presets };
      downloadText(`phase13_digest_presets_${phase14DateStamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
      addActivity(`Phase14 export center exported digest presets (${presets.length})`);
      return;
    }
  } catch(err){
    console.warn('Phase14 export center failed', err);
    alert(`Export failed: ${err && err.message ? err.message : err}`);
    return;
  } finally {
    try{ saveState({ skipHistory:true }); }catch{}
    try{ phase14RenderExportCenter_(); }catch{}
  }
}

// alias typo-safe helper (used by export builder)
function phase14DateStamp(){ return phase14DateStamp_(); }

try{ initPhase14_(); }catch(err){ console.warn('Phase14 init failed', err); }



