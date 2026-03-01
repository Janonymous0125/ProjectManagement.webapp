/* ---------------------------
   Phase 10 Work Orchestration & Review
   - Review engine (daily/weekly review task generator)
   - Task bundle templates library (selected/visible tasks)
   - Approval gates (blocker/dependent task close + milestone done)
   - Workload trend panel (assignee score snapshots)
   - Comment @mention follow-up tracking + notifications
   - Status report generator (TXT/MD)
   - Recovery tools panel (undo/redo + safety snapshot)
---------------------------- */
var PHASE10_TASK_BUNDLE_KEY = 'stark_pm_phase10_task_bundle_templates_v1';
var PHASE10_REVIEW_MARKS_KEY = 'stark_pm_phase10_review_marks_v1';
var PHASE10_APPROVAL_CFG_KEY = 'stark_pm_phase10_approval_cfg_v1';
var PHASE10_MENTIONS_KEY = 'stark_pm_phase10_mentions_v1';
var PHASE10_MENTION_SNOOZE_KEY = 'stark_pm_phase10_mentions_snooze_v1';
var PHASE10_WORKLOAD_TREND_KEY = 'stark_pm_phase10_workload_trends_v1';

var phase10State_ = {
  inited:false,
  templates:null,
  reviewMarks:null,
  approvalCfg:null,
  mentions:null,
  mentionSnooze:null,
  workloadTrends:null,
};

function initPhase10_(){
  if(phase10State_.inited) return;
  phase10State_.inited = true;

  try{ phase10InjectStyles_(); }catch(err){ console.warn('Phase10 styles failed', err); }
  try{ phase10WrapCore_(); }catch(err){ console.warn('Phase10 core wraps failed', err); }
  try{ phase10EnsureTopbarButtons_(); }catch(err){ console.warn('Phase10 topbar failed', err); }
  try{ phase10InstallApprovalGateInterceptors_(); }catch(err){ console.warn('Phase10 approval interceptors failed', err); }
  try{ phase10HydrateWorkloadTrend_(); }catch{}
  try{ phase10LoadMentions_(); phase10PruneMentionSnooze_(); }catch{}
}

function phase10InjectStyles_(){
  if(document.querySelector('#phase10Styles')) return;
  const style = document.createElement('style');
  style.id = 'phase10Styles';
  style.textContent = `
    .phase10-box{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    .phase10-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9;margin-bottom:8px}
    .phase10-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .phase10-card{border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px;background:rgba(255,255,255,.012)}
    .phase10-list{display:grid;gap:8px}
    .phase10-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase10-row__name{font-weight:700;font-size:12px}
    .phase10-row__meta{font-size:11px;opacity:.78;line-height:1.3}
    .phase10-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .phase10-note{font-size:11px;opacity:.8;line-height:1.35}
    .phase10-tag{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:2px 8px;font-size:10px;letter-spacing:.06em;text-transform:uppercase}
    .phase10-tag.warn{border-color:rgba(255,191,92,.25)}
    .phase10-tag.risk{border-color:rgba(255,107,107,.28)}
    .phase10-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .phase10-kv > div{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase10-kv b{display:block;font-size:11px;opacity:.72;font-weight:600;margin-bottom:3px}
    .phase10-kv span{font-size:13px;font-weight:700}
    .phase10-check{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .phase10-inlineNum{width:86px}
    .phase10-pre{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;line-height:1.35;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.14)}
    @media (max-width: 980px){ .phase10-grid{grid-template-columns:1fr} .phase10-kv{grid-template-columns:1fr} }
  `;
  document.head.appendChild(style);
}

function phase10WrapCore_(){
  if(typeof renderDashboard === 'function' && !renderDashboard._phase10Wrapped){
    const baseDash = renderDashboard;
    renderDashboard = function(){
      baseDash();
      try{ phase10CaptureWorkloadTrend_(); }catch(err){ console.warn('Phase10 trend capture failed', err); }
      try{ phase10PostRenderDashboard_(); }catch(err){ console.warn('Phase10 dashboard render failed', err); }
    };
    renderDashboard._phase10Wrapped = true;
  }
  if(typeof renderChecklist === 'function' && !renderChecklist._phase10Wrapped){
    const baseChecklist = renderChecklist;
    renderChecklist = function(){
      baseChecklist();
      try{ phase10PostRenderChecklist_(); }catch(err){ console.warn('Phase10 checklist render failed', err); }
    };
    renderChecklist._phase10Wrapped = true;
  }

  // Wrap comments prompt to capture new @mentions in appended comments.
  if(typeof phase9OpenTaskCommentsPrompt_ === 'function' && !phase9OpenTaskCommentsPrompt_._phase10WrappedMentions){
    const baseCommentsPrompt = phase9OpenTaskCommentsPrompt_;
    phase9OpenTaskCommentsPrompt_ = function(t){
      const beforeIds = new Set(Array.isArray(t?.comments) ? t.comments.map(c => String(c?.id || '')) : []);
      const beforeLen = Array.isArray(t?.comments) ? t.comments.length : 0;
      baseCommentsPrompt(t);
      try{
        const after = Array.isArray(t?.comments) ? t.comments : [];
        if(after.length <= beforeLen) return;
        const added = after.filter(c => !beforeIds.has(String(c?.id || '')));
        for(const c of added){ phase10CaptureMentionsFromComment_(t, c); }
      }catch(err){ console.warn('Phase10 mention capture failed', err); }
    };
    phase9OpenTaskCommentsPrompt_._phase10WrappedMentions = true;
  }

  // Append mention-followup notifications after Phase8/9 notification generation.
  if(typeof phase8GenerateNotifications_ === 'function' && !phase8GenerateNotifications_._phase10WrappedMentions){
    const baseGen = phase8GenerateNotifications_;
    phase8GenerateNotifications_ = function(){
      const arr = Array.isArray(baseGen()) ? baseGen() : [];
      return phase10AppendMentionNotifications_(arr);
    };
    phase8GenerateNotifications_._phase10WrappedMentions = true;
  }

  // Command palette shortcuts if Phase3 exists.
  if(typeof phase3BuildCmdkItems_ === 'function' && !phase3BuildCmdkItems_._phase10Wrapped){
    const baseBuild = phase3BuildCmdkItems_;
    phase3BuildCmdkItems_ = function(q){
      const items = baseBuild(q) || [];
      const query = String(q || '').trim().toLowerCase();
      const cmds = [
        { kind:'command', title:'Phase 10: Generate Daily Review', sub:'Create a review checklist task from blockers/overdues', tag:'PH10', act:'phase10DailyReview' },
        { kind:'command', title:'Phase 10: Status Report Export', sub:'Download active project summary (TXT/MD)', tag:'PH10', act:'phase10StatusExport' },
        { kind:'command', title:'Phase 10: Task Bundle Templates', sub:'Open checklist bundle templates panel', tag:'PH10', act:'phase10Templates' },
      ];
      for(const c of cmds){
        const hay = `${c.title} ${c.sub} ${c.tag}`.toLowerCase();
        if(!query || hay.includes(query)) items.push(c);
      }
      return items;
    };
    phase3BuildCmdkItems_._phase10Wrapped = true;
  }
  if(typeof phase3RunCmdkAction_ === 'function' && !phase3RunCmdkAction_._phase10Wrapped){
    const baseRun = phase3RunCmdkAction_;
    phase3RunCmdkAction_ = function(it){
      if(it && it.act === 'phase10DailyReview'){ phase10GenerateReviewTask_('daily'); return; }
      if(it && it.act === 'phase10StatusExport'){ phase10PromptExportStatusReport_(); return; }
      if(it && it.act === 'phase10Templates'){ switchTab('checklist'); setTimeout(()=>document.querySelector('#phase10TaskTemplatePanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); return; }
      return baseRun(it);
    };
    phase3RunCmdkAction_._phase10Wrapped = true;
  }
}

function phase10EnsureTopbarButtons_(){
  const topbarRight = document.querySelector('.topbar__right');
  if(!topbarRight) return;
  if(!document.querySelector('#phase10BtnReview')){
    const btn = document.createElement('button');
    btn.id = 'phase10BtnReview';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Daily Review';
    btn.title = 'Generate daily review task in active milestone';
    btn.addEventListener('click', () => phase10GenerateReviewTask_('daily'));
    topbarRight.appendChild(btn);
  }
  if(!document.querySelector('#phase10BtnStatusReport')){
    const btn = document.createElement('button');
    btn.id = 'phase10BtnStatusReport';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Status Report';
    btn.title = 'Export active project status report';
    btn.addEventListener('click', phase10PromptExportStatusReport_);
    topbarRight.appendChild(btn);
  }
  if(!document.querySelector('#phase10BtnRecovery')){
    const btn = document.createElement('button');
    btn.id = 'phase10BtnRecovery';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Recovery';
    btn.title = 'Open recovery tools panel';
    btn.addEventListener('click', () => { openPanelInOwningTab_('#phase10RecoveryPanel', 'dashboard', 10); });
    topbarRight.appendChild(btn);
  }
}

function phase10PostRenderDashboard_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return;
  let host = document.querySelector('#phase10DashboardHost');
  if(!host){
    host = document.createElement('div');
    host.id = 'phase10DashboardHost';
    host.className = 'phase10-box';
    host.innerHTML = `
      <div class="phase10-title">Phase 10 Work Orchestration & Review</div>
      <div class="phase10-grid" id="phase10DashboardGridA">
        <div class="phase10-card" id="phase10ReviewPanel"></div>
        <div class="phase10-card" id="phase10StatusReportPanel"></div>
      </div>
      <div class="phase10-grid" id="phase10DashboardGridB" style="margin-top:10px">
        <div class="phase10-card" id="phase10ApprovalPanel"></div>
        <div class="phase10-card" id="phase10WorkloadTrendPanel"></div>
      </div>
      <div class="phase10-grid" id="phase10DashboardGridC" style="margin-top:10px">
        <div class="phase10-card" id="phase10MentionsPanel"></div>
        <div class="phase10-card" id="phase10RecoveryPanel"></div>
      </div>
    `;
    tab.appendChild(host);
  }
  phase10RenderReviewPanel_();
  phase10RenderStatusReportPanel_();
  phase10RenderApprovalPanel_();
  phase10RenderWorkloadTrendPanel_();
  phase10RenderMentionsPanel_();
  phase10RenderRecoveryPanel_();
}

function phase10PostRenderChecklist_(){
  const host = document.querySelector('#phase8ChecklistHost') || document.querySelector('#tab-checklist');
  if(!host) return;
  let row = document.querySelector('#phase10ChecklistRow');
  if(!row){
    row = document.createElement('div');
    row.id = 'phase10ChecklistRow';
    row.className = 'phase10-box';
    row.innerHTML = `
      <div class="phase10-title">Phase 10 Task Templates & Review Utilities</div>
      <div class="phase10-grid" id="phase10ChecklistGrid">
        <div class="phase10-card" id="phase10TaskTemplatePanel"></div>
        <div class="phase10-card" id="phase10ChecklistReviewPanel"></div>
      </div>
    `;
    host.appendChild(row);
  }
  phase10RenderTaskTemplatePanel_();
  phase10RenderChecklistReviewPanel_();
}

/* ---------- Approval gates ---------- */
function phase10DefaultApprovalCfg_(){
  return {
    confirmBlockerTaskClose: true,
    confirmDependentTaskClose: true,
    confirmMilestoneDoneWithOpenTasks: true,
    confirmMilestoneDoneWithBlockers: true,
  };
}
function phase10LoadApprovalCfg_(){
  if(phase10State_.approvalCfg) return phase10State_.approvalCfg;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE10_APPROVAL_CFG_KEY) || '{}') || {}; }catch{ raw = {}; }
  phase10State_.approvalCfg = Object.assign(phase10DefaultApprovalCfg_(), (raw && typeof raw === 'object') ? raw : {});
  return phase10State_.approvalCfg;
}
function phase10SaveApprovalCfg_(){
  try{ localStorage.setItem(PHASE10_APPROVAL_CFG_KEY, JSON.stringify(phase10LoadApprovalCfg_())); }catch{}
}
function phase10InstallApprovalGateInterceptors_(){
  if(document._phase10ApprovalTaskInterceptInstalled) return;
  document._phase10ApprovalTaskInterceptInstalled = true;

  document.addEventListener('click', (e) => {
    const check = e.target && e.target.closest ? e.target.closest('#taskList .task .task__check') : null;
    if(!check) return;
    const card = check.closest('.task');
    const tid = String(card?.dataset?.taskId || '');
    if(!tid) return;
    const p = getActiveProject();
    const m = p ? getActiveMilestone(p) : null;
    if(!m) return;
    const t = (m.tasks || []).find(x => x && x.id === tid);
    if(!t || t.done) return; // only gate when closing (todo -> done)
    const cfg = phase10LoadApprovalCfg_();

    let msgs = [];
    if(cfg.confirmBlockerTaskClose && String(t.severity||'') === 'blocker') msgs.push('This task is marked BLOCKER.');

    if(cfg.confirmDependentTaskClose){
      const dependents = (m.tasks || []).filter(x => !x.done && Array.isArray(x?.blockedBy) && x.blockedBy.map(String).includes(t.id));
      if(dependents.length) msgs.push(`There are ${dependents.length} open dependent task(s) linked to this task.`);
    }

    if(!msgs.length) return;
    if(check.__phase10ApprovalBypassOnce){
      try{ delete check.__phase10ApprovalBypassOnce; }catch{ check.__phase10ApprovalBypassOnce = false; }
      return;
    }
    if(check.__phase10ApprovalPending){
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    msgs.push('Mark task as done anyway?');
    e.preventDefault();
    e.stopImmediatePropagation();
    check.__phase10ApprovalPending = true;
    Promise.resolve().then(async () => {
      const ok = await pmConfirmDialog_(msgs.join('\n'), {
        title:'Approval Gate • Task Close',
        okText:'Mark Done'
      });
      if(ok){
        try{ addActivity(`Phase10 approval gate passed: close task ${t.title}`); }catch{}
        try{ check.__phase10ApprovalBypassOnce = true; }catch{}
        try{ check.click(); }catch{
          try{ check.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true })); }catch{}
        }
      }
    }).finally(() => {
      setTimeout(() => {
        try{ check.__phase10ApprovalPending = false; }catch{}
      }, 0);
    });
  }, true);

  document.addEventListener('click', (e) => {
    const btn = e.target && e.target.closest ? e.target.closest('#btnSaveMilestone') : null;
    if(!btn) return;
    if(!ui?.milestoneState || String(ui.milestoneState.value || '') !== 'done') return;
    const p = getActiveProject();
    const m = p ? getActiveMilestone(p) : null;
    if(!m) return;
    const cfg = phase10LoadApprovalCfg_();
    const tasks = Array.isArray(m.tasks) ? m.tasks : [];
    const open = tasks.filter(t => !t.done);
    let blockerOpen = [];
    try{ blockerOpen = open.filter(t => String(t.severity||'') === 'blocker'); }catch{ blockerOpen = []; }

    const msgs = [];
    if(cfg.confirmMilestoneDoneWithOpenTasks && open.length) msgs.push(`Milestone still has ${open.length} open task(s).`);
    if(cfg.confirmMilestoneDoneWithBlockers && blockerOpen.length) msgs.push(`Milestone still has ${blockerOpen.length} open blocker task(s).`);
    if(!msgs.length) return;
    if(btn.__phase10ApprovalBypassOnce){
      try{ delete btn.__phase10ApprovalBypassOnce; }catch{ btn.__phase10ApprovalBypassOnce = false; }
      return;
    }
    if(btn.__phase10ApprovalPending){
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    msgs.push('Save milestone as DONE anyway?');
    e.preventDefault();
    e.stopImmediatePropagation();
    btn.__phase10ApprovalPending = true;
    Promise.resolve().then(async () => {
      const ok = await pmConfirmDialog_(msgs.join('\n'), {
        title:'Approval Gate • Milestone Done',
        okText:'Save Done'
      });
      if(ok){
        try{ addActivity(`Phase10 approval gate passed: milestone done ${m.title}`); }catch{}
        try{ btn.__phase10ApprovalBypassOnce = true; }catch{}
        try{ btn.click(); }catch{
          try{ btn.dispatchEvent(new MouseEvent('click', { bubbles:true, cancelable:true })); }catch{}
        }
      }
    }).finally(() => {
      setTimeout(() => {
        try{ btn.__phase10ApprovalPending = false; }catch{}
      }, 0);
    });
  }, true);
}

function phase10RenderApprovalPanel_(){
  const box = document.querySelector('#phase10ApprovalPanel');
  if(!box) return;
  const cfg = phase10LoadApprovalCfg_();
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Approval Gates</div><div class="phase8-item__meta">Protects task close + milestone completion actions</div></div>
    <div class="phase10-list" style="margin-top:8px">
      <label class="phase10-row phase10-check"><span>Confirm closing blocker task</span><input type="checkbox" id="phase10GateBlocker" ${cfg.confirmBlockerTaskClose ? 'checked' : ''}></label>
      <label class="phase10-row phase10-check"><span>Confirm closing task with open dependents</span><input type="checkbox" id="phase10GateDependents" ${cfg.confirmDependentTaskClose ? 'checked' : ''}></label>
      <label class="phase10-row phase10-check"><span>Confirm milestone DONE when open tasks exist</span><input type="checkbox" id="phase10GateMsOpen" ${cfg.confirmMilestoneDoneWithOpenTasks ? 'checked' : ''}></label>
      <label class="phase10-row phase10-check"><span>Confirm milestone DONE when blocker tasks exist</span><input type="checkbox" id="phase10GateMsBlocker" ${cfg.confirmMilestoneDoneWithBlockers ? 'checked' : ''}></label>
    </div>
    <div class="phase10-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" type="button" id="phase10BtnSaveApproval">Save</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnResetApproval">Reset</button>
    </div>
    <div class="phase10-note" style="margin-top:6px">Task close guard applies before the checklist toggle runs. Milestone guard checks current milestone form state when saving.</div>
  `;
  box.querySelector('#phase10BtnSaveApproval')?.addEventListener('click', () => {
    cfg.confirmBlockerTaskClose = !!box.querySelector('#phase10GateBlocker')?.checked;
    cfg.confirmDependentTaskClose = !!box.querySelector('#phase10GateDependents')?.checked;
    cfg.confirmMilestoneDoneWithOpenTasks = !!box.querySelector('#phase10GateMsOpen')?.checked;
    cfg.confirmMilestoneDoneWithBlockers = !!box.querySelector('#phase10GateMsBlocker')?.checked;
    phase10SaveApprovalCfg_();
    addActivity('Phase10 updated approval gates');
    phase10RenderApprovalPanel_();
  });
  box.querySelector('#phase10BtnResetApproval')?.addEventListener('click', () => {
    phase10State_.approvalCfg = phase10DefaultApprovalCfg_();
    phase10SaveApprovalCfg_();
    addActivity('Phase10 reset approval gates');
    phase10RenderApprovalPanel_();
  });
}

/* ---------- Review engine ---------- */
function phase10LoadReviewMarks_(){
  if(phase10State_.reviewMarks) return phase10State_.reviewMarks;
  let obj = {};
  try{ obj = JSON.parse(localStorage.getItem(PHASE10_REVIEW_MARKS_KEY) || '{}') || {}; }catch{ obj = {}; }
  phase10State_.reviewMarks = (obj && typeof obj === 'object') ? obj : {};
  return phase10State_.reviewMarks;
}
function phase10SaveReviewMarks_(){ try{ localStorage.setItem(PHASE10_REVIEW_MARKS_KEY, JSON.stringify(phase10LoadReviewMarks_())); }catch{} }
function phase10DateKey_(d){
  const dt = d instanceof Date ? d : new Date();
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
}
function phase10WeekKey_(d){
  const dt = new Date((d instanceof Date ? d : new Date()).getTime());
  const day = (dt.getDay() + 6) % 7; // Mon=0
  dt.setHours(0,0,0,0);
  dt.setDate(dt.getDate() - day);
  return 'week_of_' + phase10DateKey_(dt);
}
function phase10ReviewMarkKey_(mode, p, m){
  return [String(mode||'daily'), String(p?.id||''), String(m?.id||''), mode==='weekly' ? phase10WeekKey_(new Date()) : phase10DateKey_(new Date())].join('|');
}
function phase10BuildReviewIssueRows_(m){
  const rows = [];
  if(!m || !Array.isArray(m.tasks)) return rows;
  const now = Date.now();
  const sod = new Date(); sod.setHours(0,0,0,0);
  const soonEnd = now + 7*86400000;
  for(const t of m.tasks){
    if(!t || t.done) continue;
    let unresolved = [];
    try{ unresolved = (typeof phase4GetUnresolvedBlockers_ === 'function') ? phase4GetUnresolvedBlockers_(m, t) : []; }catch{ unresolved = []; }
    const due = Number(t?.dueAt || 0);
    const tags = [];
    if(String(t.severity||'') === 'blocker') tags.push('BLOCKER');
    else if(String(t.severity||'') === 'high') tags.push('HIGH');
    if(due && due < sod.getTime()) tags.push('OVERDUE');
    else if(due && due >= now && due <= soonEnd) tags.push('DUE7');
    if(unresolved.length) tags.push(`BLOCKED(${unresolved.length})`);
    if(tags.length){
      rows.push({ t, unresolved, due, tags, weight: (tags.includes('OVERDUE')?6:0) + (tags.some(x=>x.startsWith('BLOCKED'))?4:0) + (tags.includes('BLOCKER')?4:0) + (tags.includes('HIGH')?2:0) + (tags.includes('DUE7')?1:0) });
    }
  }
  return rows.sort((a,b)=> b.weight - a.weight || String(a.t.title).localeCompare(String(b.t.title)));
}
async function phase10GenerateReviewTask_(mode){
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  if(!p || !m){ await pmAlertDialog_('Select an active project and milestone first.', { title:'Daily Review' }); return; }
  const marks = phase10LoadReviewMarks_();
  const markKey = phase10ReviewMarkKey_(mode, p, m);
  const already = marks[markKey];
  if(already){
    const again = await pmConfirmDialog_(`A ${mode} review was already generated for this milestone (${new Date(Number(already)||Date.now()).toLocaleString()}). Generate another one anyway?`, { title:'Generate Another Review?' });
    if(!again) return;
  }

  const issues = phase10BuildReviewIssueRows_(m);
  const dt = new Date();
  const title = `Review: ${mode === 'weekly' ? 'Weekly' : 'Daily'} ${phase10DateKey_(dt)}${mode==='weekly' ? ' (' + phase10WeekKey_(dt).replace('week_of_','W/O ') + ')' : ''}`;
  const t = (typeof mkTask === 'function') ? mkTask(title, false) : { id:uid(), title, done:false, severity:'normal', assignee:'', createdAt:Date.now(), steps:[] };
  t.severity = issues.some(x => x.tags.includes('BLOCKER') || x.tags.includes('OVERDUE')) ? 'high' : 'normal';
  t.assignee = '';
  t.reviewMeta = {
    phase: 10,
    mode: String(mode || 'daily'),
    createdAt: Date.now(),
    sourceMilestoneId: m.id,
    sourceMilestoneTitle: m.title,
    issueCount: issues.length,
  };
  const steps = [];
  const header = `1. Review summary — open issues: ${issues.length}; generated ${new Date().toLocaleString()}`;
  steps.push({ id:uid(), text: header, done:false, children:[] });
  const maxItems = mode === 'weekly' ? 12 : 8;
  const top = issues.slice(0, maxItems);
  top.forEach((r, idx) => {
    const dueTxt = r.due ? ` • due ${new Date(r.due).toLocaleDateString()}` : '';
    const asg = String(r.t.assignee || '').trim();
    const asgTxt = asg ? ` • ${asg}` : '';
    const line = `${idx+2}. ${r.t.title} [${r.tags.join(', ')}]${dueTxt}${asgTxt}`;
    steps.push({ id:uid(), text: line, done:false, children:[] });
  });
  if(typeof phase10GetOpenMentions_ === 'function'){
    const mentions = phase10GetOpenMentions_().filter(x => x.projectId === p.id && x.milestoneId === m.id).slice(0, 5);
    if(mentions.length){
      steps.push({ id:uid(), text: `${steps.length+1}. Mention follow-ups (${mentions.length})`, done:false, children: mentions.map((fu, i) => ({ id:uid(), text:`${steps.length+1}.${i+1} @${fu.name} — ${String(fu.text||'').slice(0,120)}`, done:false, children:[] })) });
    }
  }
  t.steps = steps;
  if(Array.isArray(m.tasks)) m.tasks.unshift(t); else m.tasks = [t];
  marks[markKey] = Date.now();
  phase10SaveReviewMarks_();
  addActivity(`Phase10 generated ${mode} review task: ${m.title}`);
  saveState();
  switchTab('checklist');
  renderAll();
}

function phase10RenderReviewPanel_(){
  const box = document.querySelector('#phase10ReviewPanel');
  if(!box) return;
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  const issues = m ? phase10BuildReviewIssueRows_(m) : [];
  const marks = phase10LoadReviewMarks_();
  const dailyKey = p && m ? phase10ReviewMarkKey_('daily', p, m) : '';
  const weeklyKey = p && m ? phase10ReviewMarkKey_('weekly', p, m) : '';
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Recurring Review Engine</div><div class="phase8-item__meta">Generate review tasks from blockers/overdues/due-soon items</div></div>
    <div class="phase10-note" style="margin-top:6px">Scope: ${p && m ? `${escapeHtml(p.name)} • ${escapeHtml(m.title)}` : 'Select active project + milestone'}</div>
    <div class="phase10-kv" style="margin-top:8px">
      <div><b>Open review-worthy issues</b><span>${issues.length}</span></div>
      <div><b>Top issue tags</b><span>${escapeHtml(issues.slice(0,3).map(r=>r.tags[0]).join(', ') || '—')}</span></div>
      <div><b>Daily generated</b><span>${dailyKey && marks[dailyKey] ? new Date(Number(marks[dailyKey])).toLocaleString() : 'No'}</span></div>
      <div><b>Weekly generated</b><span>${weeklyKey && marks[weeklyKey] ? new Date(Number(marks[weeklyKey])).toLocaleString() : 'No'}</span></div>
    </div>
    <div class="phase10-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" type="button" id="phase10BtnDailyReview" ${p&&m ? '' : 'disabled'}>Generate Daily Review</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnWeeklyReview" ${p&&m ? '' : 'disabled'}>Generate Weekly Review</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnOpenChecklistReview">Open Checklist</button>
    </div>
    <div class="phase10-pre" style="margin-top:8px">${escapeHtml(issues.slice(0,6).map((r,i)=>`${i+1}. ${r.t.title} [${r.tags.join(', ')}]`).join('\n') || 'No review candidates in this milestone right now.')}</div>
  `;
  box.querySelector('#phase10BtnDailyReview')?.addEventListener('click', () => phase10GenerateReviewTask_('daily'));
  box.querySelector('#phase10BtnWeeklyReview')?.addEventListener('click', () => phase10GenerateReviewTask_('weekly'));
  box.querySelector('#phase10BtnOpenChecklistReview')?.addEventListener('click', () => { switchTab('checklist'); setTimeout(()=>document.querySelector('#phase10ChecklistReviewPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); });
}

function phase10RenderChecklistReviewPanel_(){
  const box = document.querySelector('#phase10ChecklistReviewPanel');
  if(!box) return;
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  const issues = m ? phase10BuildReviewIssueRows_(m) : [];
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Review Utilities</div><div class="phase8-item__meta">Fast review generation while working in checklist</div></div>
    <div class="phase10-note" style="margin-top:6px">${p&&m ? `${escapeHtml(m.title)} • ${issues.length} review-worthy issue(s)` : 'No active milestone selected.'}</div>
    <div class="phase10-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" type="button" id="phase10BtnReviewDailyChecklist" ${p&&m ? '' : 'disabled'}>Daily Review</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnReviewWeeklyChecklist" ${p&&m ? '' : 'disabled'}>Weekly Review</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnScrollTop">Top</button>
    </div>
    <div class="phase10-note" style="margin-top:8px">Creates a review task in the current milestone with prioritized issue steps and mention follow-up reminders.</div>
  `;
  box.querySelector('#phase10BtnReviewDailyChecklist')?.addEventListener('click', () => phase10GenerateReviewTask_('daily'));
  box.querySelector('#phase10BtnReviewWeeklyChecklist')?.addEventListener('click', () => phase10GenerateReviewTask_('weekly'));
  box.querySelector('#phase10BtnScrollTop')?.addEventListener('click', () => window.scrollTo({top:0, behavior:'smooth'}));
}

/* ---------- Task bundle templates library ---------- */
function phase10LoadTaskTemplates_(){
  if(Array.isArray(phase10State_.templates)) return phase10State_.templates;
  let arr = [];
  try{ arr = JSON.parse(localStorage.getItem(PHASE10_TASK_BUNDLE_KEY) || '[]') || []; }catch{ arr = []; }
  phase10State_.templates = Array.isArray(arr) ? arr.filter(Boolean) : [];
  return phase10State_.templates;
}
function phase10SaveTaskTemplates_(){ try{ localStorage.setItem(PHASE10_TASK_BUNDLE_KEY, JSON.stringify(phase10LoadTaskTemplates_())); }catch{} }
function phase10ChecklistContext_(){
  const p = getActiveProject();
  return { p, m: p ? getActiveMilestone(p) : null };
}
function phase10DeepClone_(x){ try{ return JSON.parse(JSON.stringify(x)); }catch{ return null; } }
function phase10NormalizeTemplateTask_(t){
  const out = (typeof sanitizeTask === 'function') ? sanitizeTask(t || {}) : Object.assign({ id:uid(), title:'Untitled Task', done:false, severity:'normal', assignee:'', createdAt:Date.now(), steps:[] }, (t||{}));
  // preserve phase metadata if present
  const dd = Number(t?.dueAt || 0); if(Number.isFinite(dd) && dd > 0) out.dueAt = dd;
  if(Array.isArray(t?.blockedBy)) out.blockedBy = Array.from(new Set(t.blockedBy.map(String).filter(Boolean)));
  const rd = Number(t?.recurrenceDays || 0); if(Number.isFinite(rd) && rd > 0) out.recurrenceDays = Math.max(1, Math.round(rd));
  if(typeof t?.recurrenceTemplate === 'string') out.recurrenceTemplate = String(t.recurrenceTemplate);
  if(typeof t?.stage === 'string') out.stage = String(t.stage);
  if(Array.isArray(t?.comments)) out.comments = phase10DeepClone_(t.comments) || [];
  return out;
}
function phase10CloneTaskTemplateFresh_(srcTask, idMap){
  const t = phase10NormalizeTemplateTask_(srcTask || {});
  const oldId = String(t.id || uid());
  const newId = uid();
  idMap[oldId] = newId;
  t.id = newId;
  t.createdAt = Date.now();
  const reStep = (arr) => (Array.isArray(arr) ? arr : []).map(s => ({ ...s, id: uid(), children: reStep(s?.children) }));
  t.steps = reStep(t.steps);
  if(Array.isArray(t.comments)){
    t.comments = t.comments.map(c => ({ ...c, id: uid(), ts: Date.now() }));
  }
  return t;
}
function phase10RemapTaskTemplateLinks_(t, idMap){
  if(Array.isArray(t?.blockedBy)){
    t.blockedBy = Array.from(new Set(t.blockedBy.map(x => idMap[String(x)]).filter(Boolean)));
  }
}
async function phase10SaveTaskBundleTemplate_(){
  const { m } = phase10ChecklistContext_();
  if(!m){ alert('Select an active milestone first.'); return; }
  const ids = (typeof phase9GetSelectedOrVisibleTaskIds_ === 'function') ? phase9GetSelectedOrVisibleTaskIds_(m, true) : [];
  if(!ids.length){ alert('No selected (or visible) tasks found to save as a template.'); return; }
  const setIds = new Set(ids);
  const tasks = (m.tasks || []).filter(t => setIds.has(t.id));
  if(!tasks.length){ alert('Could not resolve selected tasks.'); return; }
  const name = await pmPromptDialog_('Task bundle template name?', `Bundle • ${m.title} • ${tasks.length} task(s)`, { title:'Save Task Bundle Template', placeholder:'Template name' });
  if(name == null || !String(name).trim()) return;
  const tpl = {
    id: uid(),
    name: String(name).trim(),
    createdAt: Date.now(),
    sourceMilestoneTitle: String(m.title || ''),
    taskCount: tasks.length,
    tasks: (phase10DeepClone_(tasks) || []).map(phase10NormalizeTemplateTask_),
  };
  const arr = phase10LoadTaskTemplates_();
  arr.unshift(tpl);
  phase10State_.templates = arr.slice(0, 60);
  phase10SaveTaskTemplates_();
  addActivity(`Phase10 saved task bundle template: ${tpl.name} (${tasks.length} task(s))`);
  phase10RenderTaskTemplatePanel_();
}
function phase10GetSelectedTaskTemplate_(){
  const sel = document.querySelector('#phase10TaskTplSelect');
  const id = String(sel?.value || '');
  return phase10LoadTaskTemplates_().find(t => String(t.id) === id) || null;
}
async function phase10ApplyTaskBundleTemplate_(){
  const { m } = phase10ChecklistContext_();
  if(!m){ alert('Select an active milestone first.'); return; }
  const tpl = phase10GetSelectedTaskTemplate_();
  if(!tpl){ alert('Select a task bundle template first.'); return; }
  const prefix = await pmPromptDialog_('Optional title prefix for imported tasks (blank = none)', '', { title:'Apply Task Bundle Template', placeholder:'Optional prefix' });
  if(prefix === null) return;
  const idMap = Object.create(null);
  const clones = (Array.isArray(tpl.tasks) ? tpl.tasks : []).map(t => phase10CloneTaskTemplateFresh_(t, idMap));
  clones.forEach(t => { phase10RemapTaskTemplateLinks_(t, idMap); if(prefix && String(prefix).trim()) t.title = `${String(prefix).trim()} ${t.title}`; t.done = false; });
  m.tasks = Array.isArray(m.tasks) ? m.tasks.concat(clones) : clones;
  addActivity(`Phase10 applied task bundle template: ${tpl.name} → ${clones.length} task(s)`);
  saveState();
  renderChecklist();
}
async function phase10DeleteTaskBundleTemplate_(){
  const tpl = phase10GetSelectedTaskTemplate_();
  if(!tpl){ alert('Select a task bundle template first.'); return; }
  const ok = await pmConfirmDialog_(`Delete task bundle template "${tpl.name}"?`, { title:'Delete Task Bundle Template', okText:'Delete', danger:true });
  if(!ok) return;
  phase10State_.templates = phase10LoadTaskTemplates_().filter(x => String(x.id) !== String(tpl.id));
  phase10SaveTaskTemplates_();
  addActivity(`Phase10 deleted task bundle template: ${tpl.name}`);
  phase10RenderTaskTemplatePanel_();
}
function phase10RenderTaskTemplatePanel_(){
  const box = document.querySelector('#phase10TaskTemplatePanel');
  if(!box) return;
  const { p, m } = phase10ChecklistContext_();
  const templates = phase10LoadTaskTemplates_().slice().sort((a,b)=>Number(b.createdAt||0)-Number(a.createdAt||0));
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Task Bundle Templates</div><div class="phase8-item__meta">Save selected/visible milestone tasks as reusable bundles</div></div>
    <div class="phase10-note" style="margin-top:6px">Scope: ${p&&m ? `${escapeHtml(p.name)} • ${escapeHtml(m.title)}` : 'Select an active milestone'}</div>
    <div class="phase10-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" type="button" id="phase10BtnSaveTaskTpl" ${m ? '' : 'disabled'}>Save Selected/Visible</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnApplyTaskTpl" ${m ? '' : 'disabled'}>Apply Selected</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnDeleteTaskTpl">Delete Selected</button>
    </div>
    <select class="select" id="phase10TaskTplSelect" style="margin-top:8px">
      <option value="">— Select task bundle template —</option>
      ${templates.map(t => `<option value="${escapeHtml(String(t.id))}">${escapeHtml(String(t.name||'Untitled'))} • ${Number(t.taskCount||((t.tasks||[]).length)||0)} task(s)</option>`).join('')}
    </select>
    <div class="phase10-pre" id="phase10TaskTplPreview" style="margin-top:8px">${templates.length ? 'Select a template to preview.' : 'No task bundle templates saved yet.'}</div>
  `;
  const sel = box.querySelector('#phase10TaskTplSelect');
  const renderPreview = () => {
    const tpl = phase10GetSelectedTaskTemplate_();
    const pre = box.querySelector('#phase10TaskTplPreview');
    if(!pre) return;
    if(!tpl){ pre.textContent = templates.length ? 'Select a template to preview.' : 'No task bundle templates saved yet.'; return; }
    const lines = [
      `Name: ${tpl.name}`,
      `Created: ${new Date(Number(tpl.createdAt||Date.now())).toLocaleString()}`,
      `Source milestone: ${tpl.sourceMilestoneTitle || '—'}`,
      `Tasks: ${(tpl.tasks || []).length}`,
      '',
      ...(tpl.tasks || []).slice(0,10).map((t,i)=>`${i+1}. ${String(t.title||'Untitled')} [${String(t.severity||'normal').toUpperCase()}]${Array.isArray(t.blockedBy)&&t.blockedBy.length?` blockers:${t.blockedBy.length}`:''}${Number(t?.dueAt||0)?` due:${new Date(Number(t.dueAt)).toLocaleDateString()}`:''}`)
    ];
    if((tpl.tasks || []).length > 10) lines.push(`... +${(tpl.tasks || []).length - 10} more task(s)`);
    pre.textContent = lines.join('\n');
  };
  sel?.addEventListener('change', renderPreview);
  box.querySelector('#phase10BtnSaveTaskTpl')?.addEventListener('click', phase10SaveTaskBundleTemplate_);
  box.querySelector('#phase10BtnApplyTaskTpl')?.addEventListener('click', phase10ApplyTaskBundleTemplate_);
  box.querySelector('#phase10BtnDeleteTaskTpl')?.addEventListener('click', phase10DeleteTaskBundleTemplate_);
  renderPreview();
}

/* ---------- Workload trend snapshots ---------- */
function phase10HydrateWorkloadTrend_(){
  if(phase10State_.workloadTrends) return phase10State_.workloadTrends;
  let obj = {};
  try{ obj = JSON.parse(localStorage.getItem(PHASE10_WORKLOAD_TREND_KEY) || '{}') || {}; }catch{ obj = {}; }
  phase10State_.workloadTrends = (obj && typeof obj === 'object') ? obj : {};
  return phase10State_.workloadTrends;
}
function phase10SaveWorkloadTrend_(){ try{ localStorage.setItem(PHASE10_WORKLOAD_TREND_KEY, JSON.stringify(phase10HydrateWorkloadTrend_())); }catch{} }
function phase10ComputeAssigneeLoadForProject_(p){
  const by = {};
  for(const mod of (p?.modules || [])){
    for(const ms of (mod?.milestones || [])){
      for(const t of (ms?.tasks || [])){
        const name = String(t?.assignee || 'Unassigned').trim() || 'Unassigned';
        by[name] = by[name] || { score:0, open:0, done:0, blocker:0, high:0 };
        if(t.done){ by[name].done++; continue; }
        by[name].open++;
        if(t.severity === 'blocker'){ by[name].score += 4; by[name].blocker++; }
        else if(t.severity === 'high'){ by[name].score += 2; by[name].high++; }
        else by[name].score += 1;
      }
    }
  }
  return by;
}
function phase10CaptureWorkloadTrend_(){
  const p = getActiveProject();
  if(!p) return;
  const store = phase10HydrateWorkloadTrend_();
  const by = phase10ComputeAssigneeLoadForProject_(p);
  const payload = { ts: Date.now(), by };
  const key = String(p.id);
  const arr = Array.isArray(store[key]) ? store[key] : [];
  const last = arr[arr.length - 1] || null;
  let shouldPush = true;
  if(last){
    const ageMs = Date.now() - Number(last.ts || 0);
    const same = JSON.stringify(last.by || {}) === JSON.stringify(by || {});
    if(ageMs < 5*60*1000 && same) shouldPush = false; // avoid noisy duplicates
  }
  if(shouldPush){
    arr.push(payload);
    store[key] = arr.slice(-96);
    phase10SaveWorkloadTrend_();
  }
}
function phase10RenderWorkloadTrendPanel_(){
  const box = document.querySelector('#phase10WorkloadTrendPanel');
  if(!box) return;
  const p = getActiveProject();
  const store = phase10HydrateWorkloadTrend_();
  const series = p ? (Array.isArray(store[p.id]) ? store[p.id] : []) : [];
  const cur = series[series.length - 1] || null;
  const prev = series[series.length - 2] || null;
  const curBy = cur?.by || {};
  const prevBy = prev?.by || {};
  const rows = Object.keys(curBy).map(name => ({ name, c: curBy[name], p: prevBy[name] || { score:0, open:0, done:0 } }))
    .sort((a,b)=> (b.c.score - a.c.score) || (b.c.open - a.c.open) || a.name.localeCompare(b.name));
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Assignee Workload Trend</div><div class="phase8-item__meta">Lightweight load snapshots (active project)</div></div>
    <div class="phase10-note" style="margin-top:6px">${p ? escapeHtml(p.name) : 'No active project selected.'} • samples ${series.length}${cur ? ` • latest ${new Date(Number(cur.ts)).toLocaleString()}` : ''}</div>
    <div class="phase10-list" id="phase10WorkloadTrendList" style="margin-top:8px"></div>
  `;
  const list = box.querySelector('#phase10WorkloadTrendList');
  if(!p){ list.innerHTML = `<div class="phase8-empty">Select a project to view workload trends.</div>`; return; }
  if(!rows.length){ list.innerHTML = `<div class="phase8-empty">No assignee workload data yet. Add tasks/assignees to build trend snapshots.</div>`; return; }
  rows.slice(0,8).forEach(r => {
    const ds = Number(r.c.score || 0) - Number(r.p.score || 0);
    const delta = ds === 0 ? '±0' : (ds > 0 ? `+${ds}` : `${ds}`);
    const row = document.createElement('div');
    row.className = 'phase10-row';
    row.innerHTML = `
      <div>
        <div class="phase10-row__name">${escapeHtml(r.name)}</div>
        <div class="phase10-row__meta">open ${r.c.open||0} • done ${r.c.done||0} • high ${r.c.high||0} • blocker ${r.c.blocker||0}</div>
      </div>
      <div class="phase10-toolbar"><span class="phase10-tag ${ds>0?'warn':''}">score ${r.c.score||0} (${delta})</span></div>
    `;
    list.appendChild(row);
  });
}

/* ---------- Mention follow-up tracking ---------- */
function phase10LoadMentions_(){
  if(Array.isArray(phase10State_.mentions)) return phase10State_.mentions;
  let arr = [];
  try{ arr = JSON.parse(localStorage.getItem(PHASE10_MENTIONS_KEY) || '[]') || []; }catch{ arr = []; }
  phase10State_.mentions = Array.isArray(arr) ? arr.filter(Boolean) : [];
  return phase10State_.mentions;
}
function phase10SaveMentions_(){ try{ localStorage.setItem(PHASE10_MENTIONS_KEY, JSON.stringify(phase10LoadMentions_())); }catch{} }
function phase10LoadMentionSnooze_(){
  if(phase10State_.mentionSnooze) return phase10State_.mentionSnooze;
  let obj = {};
  try{ obj = JSON.parse(localStorage.getItem(PHASE10_MENTION_SNOOZE_KEY) || '{}') || {}; }catch{ obj = {}; }
  phase10State_.mentionSnooze = (obj && typeof obj === 'object') ? obj : {};
  return phase10State_.mentionSnooze;
}
function phase10SaveMentionSnooze_(){ try{ localStorage.setItem(PHASE10_MENTION_SNOOZE_KEY, JSON.stringify(phase10LoadMentionSnooze_())); }catch{} }
function phase10PruneMentionSnooze_(){
  const snooze = phase10LoadMentionSnooze_();
  const now = Date.now();
  let changed = false;
  for(const [k,v] of Object.entries(snooze)){ if(!Number.isFinite(Number(v)) || Number(v) <= now){ delete snooze[k]; changed = true; } }
  if(changed) phase10SaveMentionSnooze_();
}
function phase10ExtractMentions_(text){
  const out = new Set();
  const s = String(text || '');
  let m;
  const re = /(^|\s)@([a-zA-Z0-9_.-]{2,40})\b/g;
  while((m = re.exec(s))){ out.add(String(m[2] || '').trim()); }
  return Array.from(out);
}
function phase10CaptureMentionsFromComment_(task, comment){
  if(!task || !comment) return;
  const names = phase10ExtractMentions_(comment.text || '');
  if(!names.length) return;
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  const mod = p ? getActiveModule(p) : null;
  const arr = phase10LoadMentions_();
  let added = 0;
  for(const name of names){
    const key = `${String(task.id)}|${String(comment.id || '')}|${name.toLowerCase()}`;
    if(arr.some(x => String(x.key||'') === key)) continue;
    arr.unshift({
      id: uid(),
      key,
      ts: Number(comment.ts || Date.now()),
      name,
      text: String(comment.text || ''),
      author: String(comment.author || 'ME'),
      status: 'open',
      taskId: String(task.id),
      taskTitle: String(task.title || 'Untitled Task'),
      projectId: String(p?.id || ''),
      projectName: String(p?.name || ''),
      moduleId: String(mod?.id || ''),
      moduleName: String(mod?.name || ''),
      milestoneId: String(m?.id || ''),
      milestoneTitle: String(m?.title || ''),
      dueAt: 0,
      createdAt: Date.now(),
    });
    added++;
  }
  if(added){
    phase10State_.mentions = arr.slice(0, 300);
    phase10SaveMentions_();
    addActivity(`Phase10 created ${added} mention follow-up(s): ${task.title}`);
  }
}
function phase10GetOpenMentions_(){
  phase10PruneMentionSnooze_();
  const snooze = phase10LoadMentionSnooze_();
  const now = Date.now();
  return phase10LoadMentions_().filter(x => String(x.status||'open') === 'open').filter(x => Number(snooze[x.id] || 0) <= now);
}
function phase10AppendMentionNotifications_(arr){
  const out = Array.isArray(arr) ? arr.slice() : [];
  const follows = phase10GetOpenMentions_().slice(0, 20);
  for(const fu of follows){
    out.push({
      id: `mfu:${fu.id}`,
      type: 'mentionFollowup',
      level: 'normal',
      title: `Follow-up: @${fu.name}`,
      meta: `${fu.projectName || 'Project'} • ${fu.milestoneTitle || 'Milestone'} • ${fu.taskTitle}`,
      action: () => phase10OpenMentionFollowup_(fu.id),
    });
  }
  const rank = { urgent:3, high:2, normal:1 };
  const seen = new Set();
  return out.filter(n => !seen.has(n.id) && seen.add(n.id)).sort((a,b)=> (rank[b.level]-rank[a.level]) || String(a.title).localeCompare(String(b.title))).slice(0, 90);
}
function phase10FindTaskEntryByIds_(projectId, milestoneId, taskId){
  for(const p of (state.projects || [])){
    if(projectId && String(p?.id) !== String(projectId)) continue;
    for(const mod of (p?.modules || [])){
      for(const ms of (mod?.milestones || [])){
        if(milestoneId && String(ms?.id) !== String(milestoneId)) continue;
        const t = (ms?.tasks || []).find(x => String(x?.id) === String(taskId));
        if(t) return { p, mod, ms, t };
      }
    }
  }
  return null;
}
function phase10OpenMentionFollowup_(followId){
  const fu = phase10LoadMentions_().find(x => String(x.id) === String(followId));
  if(!fu) return;
  const entry = phase10FindTaskEntryByIds_(fu.projectId, fu.milestoneId, fu.taskId);
  if(entry && typeof phase8FocusTask_ === 'function'){
    phase8FocusTask_(entry);
    return;
  }
  switchTab('dashboard');
  setTimeout(()=>document.querySelector('#phase10MentionsPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10);
}
function phase10UpdateMentionStatus_(id, status){
  const arr = phase10LoadMentions_();
  const item = arr.find(x => String(x.id) === String(id));
  if(!item) return;
  item.status = status;
  item.statusTs = Date.now();
  phase10SaveMentions_();
  addActivity(`Phase10 mention follow-up ${status}: @${item.name} • ${item.taskTitle}`);
  phase10RenderMentionsPanel_();
  try{ if(typeof phase8RenderNotificationsPanel_ === 'function') phase8RenderNotificationsPanel_(); }catch{}
}
async function phase10SnoozeMention_(id){
  const hoursRaw = await pmPromptDialog_('Snooze mention follow-up for how many hours?', '12', {
    title:'Snooze Mention Follow-up',
    placeholder:'Hours'
  });
  if(hoursRaw == null) return;
  const h = Number(hoursRaw);
  if(!Number.isFinite(h) || h <= 0){ alert('Enter a positive number of hours.'); return; }
  phase10LoadMentionSnooze_()[id] = Date.now() + Math.round(h * 3600000);
  phase10SaveMentionSnooze_();
  addActivity(`Phase10 snoozed mention follow-up (${Math.round(h)}h)`);
  phase10RenderMentionsPanel_();
  try{ if(typeof phase8RenderNotificationsPanel_ === 'function') phase8RenderNotificationsPanel_(); }catch{}
}
function phase10RenderMentionsPanel_(){
  const box = document.querySelector('#phase10MentionsPanel');
  if(!box) return;
  phase10PruneMentionSnooze_();
  const all = phase10LoadMentions_();
  const snooze = phase10LoadMentionSnooze_();
  const openRows = all.filter(x => String(x.status||'open') === 'open');
  const visible = openRows.filter(x => Number(snooze[x.id] || 0) <= Date.now());
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Comment Mentions Follow-up</div><div class="phase8-item__meta">Auto-created from task thread @mentions</div></div>
    <div class="phase10-kv" style="margin-top:8px">
      <div><b>Open follow-ups</b><span>${openRows.length}</span></div>
      <div><b>Visible now</b><span>${visible.length}</span></div>
    </div>
    <div class="phase10-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" type="button" id="phase10BtnMentionsRefresh">Refresh</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnMentionsUnsnooze">Clear Snooze</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnMentionsDoneAll" ${visible.length ? '' : 'disabled'}>Mark Visible Done</button>
    </div>
    <div class="phase10-list" id="phase10MentionsList" style="margin-top:8px"></div>
  `;
  const list = box.querySelector('#phase10MentionsList');
  if(!visible.length){
    list.innerHTML = `<div class="phase8-empty">No visible mention follow-ups. Add a task comment with @name to create one.</div>`;
  } else {
    visible.slice(0,12).forEach(fu => {
      const snoozeUntil = Number(snooze[fu.id] || 0);
      const row = document.createElement('div');
      row.className = 'phase10-row';
      row.innerHTML = `
        <div>
          <div class="phase10-row__name">@${escapeHtml(fu.name)} • ${escapeHtml(fu.taskTitle || 'Task')}</div>
          <div class="phase10-row__meta">${escapeHtml(fu.projectName || 'Project')} • ${escapeHtml(fu.milestoneTitle || 'Milestone')} • ${new Date(Number(fu.ts||Date.now())).toLocaleString()}</div>
          <div class="phase10-note">${escapeHtml(String(fu.text || '').slice(0,180))}${String(fu.text||'').length > 180 ? '…' : ''}</div>
          ${snoozeUntil > Date.now() ? `<div class="phase10-note">Snoozed until ${escapeHtml(new Date(snoozeUntil).toLocaleString())}</div>` : ''}
        </div>
        <div class="phase10-toolbar">
          <button class="btn btn--ghost" type="button" data-act="open">Open</button>
          <button class="btn btn--ghost" type="button" data-act="snooze">Snooze</button>
          <button class="btn btn--ghost" type="button" data-act="done">Done</button>
        </div>
      `;
      row.querySelector('[data-act="open"]')?.addEventListener('click', ()=>phase10OpenMentionFollowup_(fu.id));
      row.querySelector('[data-act="snooze"]')?.addEventListener('click', ()=>phase10SnoozeMention_(fu.id));
      row.querySelector('[data-act="done"]')?.addEventListener('click', ()=>phase10UpdateMentionStatus_(fu.id,'done'));
      list.appendChild(row);
    });
  }
  box.querySelector('#phase10BtnMentionsRefresh')?.addEventListener('click', phase10RenderMentionsPanel_);
  box.querySelector('#phase10BtnMentionsUnsnooze')?.addEventListener('click', ()=>{ phase10State_.mentionSnooze = {}; phase10SaveMentionSnooze_(); phase10RenderMentionsPanel_(); try{ if(typeof phase8RenderNotificationsPanel_ === 'function') phase8RenderNotificationsPanel_(); }catch{} });
  box.querySelector('#phase10BtnMentionsDoneAll')?.addEventListener('click', ()=>{
    const arr = phase10LoadMentions_();
    let changed = 0;
    for(const fu of arr){
      if(String(fu.status||'open') !== 'open') continue;
      if(Number(phase10LoadMentionSnooze_()[fu.id] || 0) > Date.now()) continue;
      fu.status = 'done'; fu.statusTs = Date.now(); changed++;
    }
    if(changed){ phase10SaveMentions_(); addActivity(`Phase10 completed ${changed} mention follow-up(s)`); }
    phase10RenderMentionsPanel_();
    try{ if(typeof phase8RenderNotificationsPanel_ === 'function') phase8RenderNotificationsPanel_(); }catch{}
  });
}

/* ---------- Status report export ---------- */
function phase10BuildStatusReport_(kind){
  const p = getActiveProject();
  if(!p) return null;
  const counts = (typeof computeProjectCounts === 'function') ? computeProjectCounts(p) : { milestones:0, tasks:0, done:0 };
  const health = (typeof phase8ScoreProjectHealth_ === 'function') ? phase8ScoreProjectHealth_(p) : null;
  const entries = [];
  for(const mod of (p.modules || [])){
    for(const ms of (mod.milestones || [])){
      for(const t of (ms.tasks || [])){
        entries.push({ p, mod, ms, t });
      }
    }
  }
  const now = Date.now();
  const sod = new Date(); sod.setHours(0,0,0,0);
  const dueSoonEnd = now + 7*86400000;
  const open = entries.filter(e => !e.t.done);
  const overdue = open.filter(e => Number(e.t?.dueAt || 0) && Number(e.t.dueAt) < sod.getTime());
  const dueSoon = open.filter(e => Number(e.t?.dueAt || 0) && Number(e.t.dueAt) >= now && Number(e.t.dueAt) <= dueSoonEnd);
  const blocked = open.filter(e => { try{ return typeof phase4GetUnresolvedBlockers_ === 'function' && phase4GetUnresolvedBlockers_(e.ms, e.t).length > 0; }catch{ return false; } });
  const assignees = phase10ComputeAssigneeLoadForProject_(p);
  const asgRows = Object.keys(assignees).map(name => ({ name, ...assignees[name] })).sort((a,b)=> b.score-a.score || b.open-a.open || a.name.localeCompare(b.name));
  const lines = [];
  const md = String(kind||'txt').toLowerCase() === 'md';
  if(md){
    lines.push(`# Project Status Report`);
    lines.push('');
    lines.push(`- Project: **${p.name}**`);
    lines.push(`- Exported: ${new Date().toLocaleString()}`);
    lines.push(`- Modules: ${p.modules?.length || 0}`);
    lines.push(`- Milestones: ${counts.milestones || 0}`);
    lines.push(`- Tasks: ${counts.tasks || 0}`);
    lines.push(`- Done: ${counts.done || 0}`);
    if(health) lines.push(`- Health: **${health.badge}** (${health.score}/100)`);
    lines.push('');
    lines.push('## Risk Summary');
    lines.push(`- Open: ${open.length}`);
    lines.push(`- Overdue: ${overdue.length}`);
    lines.push(`- Due in 7 days: ${dueSoon.length}`);
    lines.push(`- Blocked: ${blocked.length}`);
    lines.push(`- Mention follow-ups open: ${phase10GetOpenMentions_().filter(x=>x.projectId===p.id).length}`);
    lines.push('');
    lines.push('## Top Priority Tasks');
    const ranked = open.slice().sort((a,b)=>{
      const aw = (a.t.severity==='blocker'?4:a.t.severity==='high'?2:1) + (Number(a.t?.dueAt||0) && Number(a.t.dueAt) < sod.getTime() ? 4 : 0);
      const bw = (b.t.severity==='blocker'?4:b.t.severity==='high'?2:1) + (Number(b.t?.dueAt||0) && Number(b.t.dueAt) < sod.getTime() ? 4 : 0);
      return bw-aw || String(a.t.title).localeCompare(String(b.t.title));
    });
    if(!ranked.length) lines.push('- No open tasks.');
    ranked.slice(0,12).forEach(e => {
      let tags = [String(e.t.severity || 'normal').toUpperCase()];
      const due = Number(e.t?.dueAt || 0);
      if(due) tags.push(new Date(due).toLocaleDateString());
      try{ if(typeof phase4GetUnresolvedBlockers_ === 'function'){ const n = phase4GetUnresolvedBlockers_(e.ms, e.t).length; if(n) tags.push(`blocked:${n}`); } }catch{}
      lines.push(`- ${e.t.title} (${e.mod.name} / ${e.ms.title}) — ${tags.join(' • ')}`);
    });
    lines.push('');
    lines.push('## Assignee Load');
    if(!asgRows.length) lines.push('- No assignee data');
    asgRows.slice(0,12).forEach(r => lines.push(`- ${r.name}: score ${r.score}, open ${r.open}, done ${r.done}, blocker ${r.blocker || 0}, high ${r.high || 0}`));
  } else {
    lines.push('PROJECT STATUS REPORT');
    lines.push(`Exported: ${new Date().toLocaleString()}`);
    lines.push(`Project: ${p.name}`);
    lines.push(`Modules: ${p.modules?.length || 0}`);
    lines.push(`Milestones: ${counts.milestones || 0}`);
    lines.push(`Tasks: ${counts.tasks || 0}`);
    lines.push(`Done: ${counts.done || 0}`);
    if(health) lines.push(`Health: ${health.badge} (${health.score}/100)`);
    lines.push('');
    lines.push('RISK SUMMARY');
    lines.push(`- Open: ${open.length}`);
    lines.push(`- Overdue: ${overdue.length}`);
    lines.push(`- Due in 7 days: ${dueSoon.length}`);
    lines.push(`- Blocked: ${blocked.length}`);
    lines.push(`- Mention follow-ups open: ${phase10GetOpenMentions_().filter(x=>x.projectId===p.id).length}`);
    lines.push('');
    lines.push('TOP PRIORITY TASKS');
    const ranked = open.slice().sort((a,b)=>{
      const aw = (a.t.severity==='blocker'?4:a.t.severity==='high'?2:1) + (Number(a.t?.dueAt||0) && Number(a.t.dueAt) < sod.getTime() ? 4 : 0);
      const bw = (b.t.severity==='blocker'?4:b.t.severity==='high'?2:1) + (Number(b.t?.dueAt||0) && Number(b.t.dueAt) < sod.getTime() ? 4 : 0);
      return bw-aw || String(a.t.title).localeCompare(String(b.t.title));
    });
    if(!ranked.length) lines.push('- No open tasks.');
    ranked.slice(0,12).forEach((e,i) => {
      let meta = [`sev:${String(e.t.severity||'normal')}`];
      if(e.t.assignee) meta.push(`asg:${e.t.assignee}`);
      const due = Number(e.t?.dueAt || 0);
      if(due) meta.push(`due:${new Date(due).toLocaleDateString()}`);
      try{ if(typeof phase4GetUnresolvedBlockers_ === 'function'){ const n = phase4GetUnresolvedBlockers_(e.ms, e.t).length; if(n) meta.push(`blocked:${n}`); } }catch{}
      lines.push(`${i+1}. ${e.t.title}  [${e.mod.name} > ${e.ms.title}]  (${meta.join(' | ')})`);
    });
    lines.push('');
    lines.push('ASSIGNEE LOAD');
    if(!asgRows.length) lines.push('- No assignee data');
    asgRows.slice(0,12).forEach(r => lines.push(`- ${r.name}: score ${r.score}, open ${r.open}, done ${r.done}, blocker ${r.blocker || 0}, high ${r.high || 0}`));
  }
  return lines.join('\n');
}
function phase10ExportStatusReport_(kind){
  const p = getActiveProject();
  if(!p){ alert('Select an active project first.'); return; }
  const text = phase10BuildStatusReport_(kind);
  if(!text){ alert('Could not build status report.'); return; }
  const safe = String(p.name || 'project').replace(/[^a-z0-9\-_]+/ig,'_').slice(0,50) || 'project';
  const stamp = phase10DateKey_(new Date()).replace(/-/g,'');
  if(String(kind||'txt').toLowerCase() === 'md') downloadText(`${safe}_status_report_${stamp}.md`, text, 'text/markdown');
  else downloadText(`${safe}_status_report_${stamp}.txt`, text, 'text/plain');
  addActivity(`Phase10 exported status report (${String(kind||'txt').toUpperCase()}): ${p.name}`);
  try{ if(typeof phase8RenderAuditPanel_ === 'function') phase8RenderAuditPanel_(); }catch{}
  try{ if(typeof phase9RenderAuditExportPanel_ === 'function') phase9RenderAuditExportPanel_(); }catch{}
}
async function phase10PromptExportStatusReport_(){
  const kindRaw = await pmPromptDialog_('Export status report as TXT or MD?', 'MD', { title:'Status Report Export', placeholder:'MD or TXT' });
  if(kindRaw == null) return;
  const kind = String(kindRaw || '').trim().toLowerCase() === 'txt' ? 'txt' : 'md';
  phase10ExportStatusReport_(kind);
}
function phase10RenderStatusReportPanel_(){
  const box = document.querySelector('#phase10StatusReportPanel');
  if(!box) return;
  const p = getActiveProject();
  const preview = p ? (phase10BuildStatusReport_('txt') || '') : '';
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Status Report Generator</div><div class="phase8-item__meta">Export active project summary for PM updates</div></div>
    <div class="phase10-note" style="margin-top:6px">${p ? `Active project: ${escapeHtml(p.name)}` : 'Select an active project to export status report.'}</div>
    <div class="phase10-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" type="button" id="phase10BtnExportStatusMd" ${p ? '' : 'disabled'}>Export MD</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnExportStatusTxt" ${p ? '' : 'disabled'}>Export TXT</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnStatusOpenAudit">Open Audit Export</button>
    </div>
    <div class="phase10-pre" style="margin-top:8px">${escapeHtml((preview || 'No active project selected.').split('\n').slice(0,14).join('\n'))}</div>
  `;
  box.querySelector('#phase10BtnExportStatusMd')?.addEventListener('click', () => phase10ExportStatusReport_('md'));
  box.querySelector('#phase10BtnExportStatusTxt')?.addEventListener('click', () => phase10ExportStatusReport_('txt'));
  box.querySelector('#phase10BtnStatusOpenAudit')?.addEventListener('click', () => { switchTab('dashboard'); setTimeout(()=>document.querySelector('#phase9AuditExportPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); });
}

/* ---------- Recovery tools (surface existing undo/redo + snapshot) ---------- */
function phase10RenderRecoveryPanel_(){
  const box = document.querySelector('#phase10RecoveryPanel');
  if(!box) return;
  const undoCount = (typeof undoStack_ !== 'undefined' && Array.isArray(undoStack_)) ? undoStack_.length : 0;
  const redoCount = (typeof redoStack_ !== 'undefined' && Array.isArray(redoStack_)) ? redoStack_.length : 0;
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Recovery Tools</div><div class="phase8-item__meta">Undo/redo + safety snapshots</div></div>
    <div class="phase10-kv" style="margin-top:8px">
      <div><b>Undo stack</b><span>${undoCount}</span></div>
      <div><b>Redo stack</b><span>${redoCount}</span></div>
    </div>
    <div class="phase10-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" type="button" id="phase10BtnUndo" ${undoCount ? '' : 'disabled'}>Rollback Last Action</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnRedo" ${redoCount ? '' : 'disabled'}>Redo</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnSafetySnapshot">Create Safety Snapshot</button>
      <button class="btn btn--ghost" type="button" id="phase10BtnOpenSnapshots">Open Snapshots</button>
    </div>
    <div class="phase10-note" style="margin-top:6px">Rollback uses the built-in local undo/redo history. Safety Snapshot uses the Phase 6 snapshot system for project-level restore points.</div>
  `;
  box.querySelector('#phase10BtnUndo')?.addEventListener('click', () => { try{ undoState_ && undoState_(); }catch{} phase10RenderRecoveryPanel_(); });
  box.querySelector('#phase10BtnRedo')?.addEventListener('click', () => { try{ redoState_ && redoState_(); }catch{} phase10RenderRecoveryPanel_(); });
  box.querySelector('#phase10BtnSafetySnapshot')?.addEventListener('click', () => {
    if(typeof phase6CreateSnapshotPrompt_ === 'function') phase6CreateSnapshotPrompt_();
    else alert('Snapshot feature not available in this build.');
    setTimeout(()=>phase10RenderRecoveryPanel_(), 50);
  });
  box.querySelector('#phase10BtnOpenSnapshots')?.addEventListener('click', () => { switchTab('projects'); setTimeout(()=>document.querySelector('#phase6SnapshotsBox')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); });
}

// boot phase 10 after phase 9 patch is loaded
try{ initPhase10_(); }catch(err){ console.warn('Phase10 init failed', err); }


