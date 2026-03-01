/* ---------------------------
   Phase 9 Upgrade (Additive Patch)
   - Task comments / notes thread (per-task)
   - Reminder rules + snooze (Phase 8 notifications integration)
   - Assignment workflows (batch assign / clear / rebalance)
   - Audit trail export (TXT / JSON)
   - Snapshot restore dry-run compare guardrail (Phase 6/7 integration)
---------------------------- */
var PHASE9_REMINDER_KEY = 'stark_pm_phase9_reminder_rules_v1';
var PHASE9_NOTIFY_SNOOZE_KEY = 'stark_pm_phase9_notify_snooze_v1';
var phase9State_ = {
  inited: false,
  patched: false,
  reminderCfg: null,
  snooze: null,
};

function initPhase9_(){
  if(phase9State_.inited) return;
  phase9State_.inited = true;
  phase9EnsureStyles_();
  phase9PatchFunctions_();
  phase9EnsureTopbarButtons_();
  try{ phase9PostRenderChecklist_(); }catch{}
  try{ phase9PostRenderDashboard_(); }catch{}
  try{ phase9PostRenderNotificationsPanel_(); }catch{}
}

function phase9EnsureStyles_(){
  if(document.querySelector('#phase9Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase9Styles';
  st.textContent = `
    .phase9-box{margin-top:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:10px}
    .phase9-title{font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.86;margin-bottom:8px}
    .phase9-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .phase9-card{border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.015);padding:10px}
    .phase9-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .phase9-toolbar .btn{padding:6px 10px}
    .phase9-note{font-size:11px;opacity:.72}
    .phase9-commentsPreview{margin-top:6px;padding:6px 8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.012)}
    .phase9-commentsPreview__top{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .phase9-commentsPreview__count{font-size:10px;opacity:.72}
    .phase9-commentsPreview__text{font-size:11px;line-height:1.35;opacity:.92;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .phase9-tag{display:inline-flex;align-items:center;padding:2px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.12);font-size:10px}
    .phase9-tag.warn{border-color:rgba(255,174,102,.28);color:#ffd29a}
    .phase9-tag.risk{border-color:rgba(255,110,110,.35);color:#ffc0c0}
    .phase9-list{display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto}
    .phase9-row{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase9-row__name{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .phase9-row__meta{font-size:11px;opacity:.72;margin-top:2px}
    .phase9-check{display:flex;align-items:center;gap:6px;font-size:12px}
    .phase9-check input{accent-color:#7df1ff}
    .phase9-inlineNum{width:88px}
    @media (max-width: 980px){ .phase9-grid{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase9PatchFunctions_(){
  if(phase9State_.patched) return;
  phase9State_.patched = true;

  // Preserve task comments across imports/load/sanitize paths.
  if(typeof sanitizeTask === 'function' && !sanitizeTask._phase9WrappedComments){
    const _sanitizeTask = sanitizeTask;
    sanitizeTask = function(t){
      const out = _sanitizeTask(t);
      out.comments = phase9SanitizeTaskComments_(t?.comments);
      return out;
    };
    sanitizeTask._phase9WrappedComments = true;
  }
  if(typeof mkTask === 'function' && !mkTask._phase9WrappedComments){
    const _mkTask = mkTask;
    mkTask = function(title, done){
      const t = _mkTask(title, done);
      if(!Array.isArray(t.comments)) t.comments = [];
      return t;
    };
    mkTask._phase9WrappedComments = true;
  }

  if(typeof renderChecklist === 'function' && !renderChecklist._phase9Wrapped){
    const baseChecklist = renderChecklist;
    renderChecklist = function(){
      baseChecklist();
      try{ phase9PostRenderChecklist_(); }catch(err){ console.warn('Phase9 checklist render failed', err); }
    };
    renderChecklist._phase9Wrapped = true;
  }

  if(typeof renderDashboard === 'function' && !renderDashboard._phase9Wrapped){
    const baseDash = renderDashboard;
    renderDashboard = function(){
      baseDash();
      try{ phase9PostRenderDashboard_(); }catch(err){ console.warn('Phase9 dashboard render failed', err); }
    };
    renderDashboard._phase9Wrapped = true;
  }

  if(typeof phase8RenderNotificationsPanel_ === 'function' && !phase8RenderNotificationsPanel_._phase9WrappedUi){
    const baseNotif = phase8RenderNotificationsPanel_;
    phase8RenderNotificationsPanel_ = function(){
      baseNotif();
      try{ phase9PostRenderNotificationsPanel_(); }catch(err){ console.warn('Phase9 notifications post-render failed', err); }
    };
    phase8RenderNotificationsPanel_._phase9WrappedUi = true;
  }

  if(typeof phase8GenerateNotifications_ === 'function' && !phase8GenerateNotifications_._phase9WrappedRules){
    const baseGen = phase8GenerateNotifications_;
    phase8GenerateNotifications_ = function(){
      const arr = Array.isArray(baseGen()) ? baseGen() : [];
      return phase9FilterNotificationsByRulesAndSnooze_(arr);
    };
    phase8GenerateNotifications_._phase9WrappedRules = true;
  }

  if(typeof phase6RestoreSelectedSnapshot_ === 'function' && !phase6RestoreSelectedSnapshot_._phase9Wrapped){
    phase9WrapSnapshotRestore_();
  }

  if(typeof phase3BuildCmdkItems_ === 'function' && !phase3BuildCmdkItems_._phase9Wrapped){
    const baseBuild = phase3BuildCmdkItems_;
    phase3BuildCmdkItems_ = function(q){
      const items = baseBuild(q) || [];
      const query = String(q || '').trim().toLowerCase();
      const cmds = [
        { kind:'command', title:'Phase 9: Reminder Rules', sub:'Open dashboard reminder rules panel', tag:'PH9', act:'phase9Reminders' },
        { kind:'command', title:'Phase 9: Batch Assign', sub:'Open checklist assignment workflow panel', tag:'PH9', act:'phase9Assign' },
        { kind:'command', title:'Phase 9: Export Audit Log', sub:'Download activity trail (TXT/JSON)', tag:'PH9', act:'phase9AuditExport' },
      ];
      for(const c of cmds){
        const hay = `${c.title} ${c.sub} ${c.tag}`.toLowerCase();
        if(!query || hay.includes(query)) items.push(c);
      }
      return items;
    };
    phase3BuildCmdkItems_._phase9Wrapped = true;
  }
  if(typeof phase3RunCmdkAction_ === 'function' && !phase3RunCmdkAction_._phase9Wrapped){
    const baseRun = phase3RunCmdkAction_;
    phase3RunCmdkAction_ = function(it){
      if(it && it.act === 'phase9Reminders'){ switchTab('dashboard'); setTimeout(()=>document.querySelector('#phase9ReminderRulesPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); return; }
      if(it && it.act === 'phase9Assign'){ switchTab('checklist'); setTimeout(()=>document.querySelector('#phase9AssignPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); return; }
      if(it && it.act === 'phase9AuditExport'){ phase9PromptExportAudit_(); return; }
      return baseRun(it);
    };
    phase3RunCmdkAction_._phase9Wrapped = true;
  }
}

function phase9SanitizeTaskComments_(arr){
  const out = [];
  for(const c of (Array.isArray(arr) ? arr : [])){
    const text = String(c?.text || '').trim();
    if(!text) continue;
    out.push({
      id: String(c?.id || uid()),
      ts: Number(c?.ts || Date.now()),
      author: String(c?.author || 'ME').trim() || 'ME',
      text,
    });
  }
  return out.slice(-200);
}

function phase9EnsureTaskComments_(t){
  if(!t || typeof t !== 'object') return [];
  t.comments = phase9SanitizeTaskComments_(t.comments);
  return t.comments;
}

function phase9ChecklistContext_(){
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  return { p, m };
}

function phase9FindTaskInActiveMilestoneById_(id){
  const { m } = phase9ChecklistContext_();
  if(!m || !id) return null;
  return (m.tasks || []).find(t => t && t.id === id) || null;
}

function phase9PostRenderChecklist_(){
  phase9EnhanceTaskCards_();
  phase9RenderAssignPanel_();
}

function phase9EnhanceTaskCards_(){
  const { m } = phase9ChecklistContext_();
  if(!m) return;
  const cards = Array.from(document.querySelectorAll('#taskList .task'));
  for(const card of cards){
    const tid = String(card.dataset.taskId || '');
    if(!tid) continue;
    const t = (m.tasks || []).find(x => x && x.id === tid);
    if(!t) continue;
    const comments = phase9EnsureTaskComments_(t);

    const actions = card.querySelector('.task__actions');
    if(actions && !actions.querySelector('[data-act="phase9Comment"]')){
      const btn = document.createElement('button');
      btn.className = 'iconbtn';
      btn.type = 'button';
      btn.title = 'Comments / notes thread';
      btn.dataset.act = 'phase9Comment';
      btn.textContent = '💬';
      btn.addEventListener('click', ()=>phase9OpenTaskCommentsPrompt_(t));
      actions.insertBefore(btn, actions.firstChild || null);
    }

    const meta = card.querySelector('.task__meta');
    if(meta){
      let badge = meta.querySelector('.phase9-commentBadge');
      if(comments.length){
        if(!badge){
          badge = document.createElement('span');
          badge.className = 'badge phase9-commentBadge';
          meta.appendChild(badge);
        }
        badge.textContent = `COMMENTS ${comments.length}`;
        badge.title = 'Task comments/thread entries';
      } else if(badge){
        badge.remove();
      }
    }

    let preview = card.querySelector('.phase9-commentsPreview');
    if(!comments.length){ if(preview) preview.remove(); continue; }
    const last = comments[comments.length - 1];
    if(!preview){
      preview = document.createElement('div');
      preview.className = 'phase9-commentsPreview';
      const body = card.querySelector('.task__body');
      body && body.appendChild(preview);
    }
    preview.innerHTML = `
      <div class="phase9-commentsPreview__top">
        <span class="phase9-tag">💬 thread</span>
        <span class="phase9-commentsPreview__count">${comments.length} note(s)</span>
      </div>
      <div class="phase9-commentsPreview__text">${escapeHtml(String(last.author || 'ME'))}: ${escapeHtml(String(last.text || ''))}</div>
    `;
    preview.title = 'Click comment button to view/add notes';
  }
}

async function phase9OpenTaskCommentsPrompt_(t){
  if(!t) return;
  const comments = phase9EnsureTaskComments_(t);
  const lines = comments.slice(-12).map((c, i) => {
    const ts = Number(c.ts || 0);
    const when = Number.isFinite(ts) && ts > 0 ? new Date(ts).toLocaleString() : '—';
    return `${i+1}. [${when}] ${String(c.author || 'ME')}: ${String(c.text || '')}`;
  });
  const summary = lines.length ? lines.join('\n') : '(no comments yet)';
  const input = await pmPromptDialog_(
    `Task thread: ${t.title}\n\nRecent entries:\n${summary}\n\nEnter a new comment to append.\nOptional format: author | message\nCommands: /clear  /export`,
    '',
    { title:'Task Thread', placeholder:'author | message  (or /clear /export)' }
  );
  if(input == null) return;
  const raw = String(input || '').trim();
  if(!raw) return;
  if(raw === '/clear'){
    if(!comments.length){ alert('No comments to clear.'); return; }
    if(!(await pmConfirmDialog_(`Clear all ${comments.length} comment(s) for "${t.title}"?`, {
      title:'Clear Task Thread',
      okText:'Clear',
      danger:true
    }))) return;
    t.comments = [];
    addActivity(`Cleared task thread: ${t.title}`);
    saveState();
    renderChecklist();
    return;
  }
  if(raw === '/export'){
    await phase9ExportTaskThread_(t);
    return;
  }
  let author = 'ME';
  let text = raw;
  const sepIdx = raw.indexOf('|');
  if(sepIdx > 0){
    const a = raw.slice(0, sepIdx).trim();
    const b = raw.slice(sepIdx + 1).trim();
    if(a && b){ author = a; text = b; }
  }
  if(!text) return;
  comments.push({ id: uid(), ts: Date.now(), author, text });
  t.comments = phase9SanitizeTaskComments_(comments);
  addActivity(`Added task comment: ${t.title}`);
  saveState();
  renderChecklist();
}

async function phase9ExportTaskThread_(t){
  if(!t) return;
  const comments = phase9EnsureTaskComments_(t);
  if(!comments.length){ alert('No comments to export for this task.'); return; }
  const fmt = await pmPromptDialog_('Export task thread as TXT or JSON?', 'TXT', {
    title:'Export Task Thread',
    placeholder:'TXT or JSON'
  });
  if(fmt == null) return;
  const kind = String(fmt || '').trim().toLowerCase();
  const safeTask = String(t.title || 'task').replace(/[^a-z0-9\-_]+/ig, '_').slice(0,60) || 'task';
  if(kind === 'json'){
    downloadText(`${safeTask}_thread.json`, JSON.stringify({ taskId:t.id, title:t.title, comments }, null, 2), 'application/json');
  } else {
    const text = [
      `Task Thread Export`,
      `Task: ${t.title}`,
      `Task ID: ${t.id}`,
      `Exported: ${new Date().toLocaleString()}`,
      `Entries: ${comments.length}`,
      ``,
      ...comments.map(c => `- [${new Date(Number(c.ts||Date.now())).toLocaleString()}] ${String(c.author||'ME')}: ${String(c.text||'')}`)
    ].join('\n');
    downloadText(`${safeTask}_thread.txt`, text, 'text/plain');
  }
}

function phase9RenderAssignPanel_(){
  const host = document.querySelector('#phase8ChecklistHost') || document.querySelector('#tab-checklist');
  if(!host) return;
  let box = document.querySelector('#phase9AssignPanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase9AssignPanel';
    box.className = 'phase8-card';
    const targetGrid = document.querySelector('#phase8ChecklistGridA');
    if(targetGrid){
      let row = document.querySelector('#phase9ChecklistGridB');
      if(!row){
        row = document.createElement('div');
        row.id = 'phase9ChecklistGridB';
        row.className = 'phase8-grid';
        row.style.marginTop = '10px';
        const holder = document.createElement('div');
        holder.className = 'phase8-card';
        holder.id = 'phase9AssignPanelHolder';
        row.appendChild(holder);
        const holder2 = document.createElement('div');
        holder2.className = 'phase8-card';
        holder2.id = 'phase9ChecklistInfoPanel';
        row.appendChild(holder2);
        targetGrid.parentElement.appendChild(row);
      }
      const h = document.querySelector('#phase9AssignPanelHolder');
      if(h && !box.parentElement) h.appendChild(box);
    } else {
      host.appendChild(box);
    }
  }
  const infoBox = document.querySelector('#phase9ChecklistInfoPanel');

  const { p, m } = phase9ChecklistContext_();
  const tasks = Array.isArray(m?.tasks) ? m.tasks : [];
  const selectedIds = phase9GetSelectedOrVisibleTaskIds_(m, true);
  const selectedCount = selectedIds.length;
  const assigneeStats = phase9BuildAssigneeStats_(tasks);

  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Assignment Workflows</div><div class="phase8-item__meta">Batch assign / reassign selected or visible tasks</div></div>
    <div class="phase9-toolbar" style="margin-top:8px">
      <input class="input" id="phase9AssignName" placeholder="Assignee name" />
      <button class="btn btn--ghost" type="button" id="phase9BtnAssignSet">Assign</button>
      <button class="btn btn--ghost" type="button" id="phase9BtnAssignClear">Clear</button>
      <button class="btn btn--ghost" type="button" id="phase9BtnAssignRebalance">Rebalance…</button>
    </div>
    <div class="phase9-note" style="margin-top:6px">Target set: ${selectedCount} task(s) (${m ? escapeHtml(m.title) : 'No milestone'}). Uses selected tasks first, otherwise visible tasks.</div>
    <div class="phase9-list" id="phase9AssigneeQuickList" style="margin-top:8px"></div>
  `;

  const list = box.querySelector('#phase9AssigneeQuickList');
  if(!m){
    list.innerHTML = `<div class="phase8-empty">Select a project and milestone to use assignment workflows.</div>`;
  } else if(!assigneeStats.length){
    list.innerHTML = `<div class="phase8-empty">No assignees yet in this milestone. Enter a name above to batch assign.</div>`;
  } else {
    assigneeStats.forEach(r => {
      const row = document.createElement('div');
      row.className = 'phase9-row';
      row.innerHTML = `
        <div>
          <div class="phase9-row__name">${escapeHtml(r.name)}</div>
          <div class="phase9-row__meta">open ${r.open} • done ${r.done} • high/blocker ${r.hot}</div>
        </div>
        <div class="phase9-toolbar">
          <button class="btn btn--ghost" type="button" data-act="assign">Assign Selected</button>
          <button class="btn btn--ghost" type="button" data-act="filter">Focus</button>
        </div>
      `;
      row.querySelector('[data-act="assign"]')?.addEventListener('click', ()=>phase9BatchAssignSelected_('set', r.name));
      row.querySelector('[data-act="filter"]')?.addEventListener('click', ()=>phase9FocusAssigneeTasks_(r.name));
      list.appendChild(row);
    });
  }

  box.querySelector('#phase9BtnAssignSet')?.addEventListener('click', () => {
    const v = String(box.querySelector('#phase9AssignName')?.value || '').trim();
    phase9BatchAssignSelected_('set', v);
  });
  box.querySelector('#phase9BtnAssignClear')?.addEventListener('click', () => phase9BatchAssignSelected_('clear'));
  box.querySelector('#phase9BtnAssignRebalance')?.addEventListener('click', phase9PromptRebalanceSelected_);

  if(infoBox){
    const commentsCount = tasks.reduce((n,t)=>n + (Array.isArray(t?.comments)?t.comments.length:0), 0);
    const commentedTasks = tasks.filter(t => Array.isArray(t?.comments) && t.comments.length).length;
    infoBox.innerHTML = `
      <div class="phase8-item__top"><div class="phase8-item__title">Task Threads Summary</div><div class="phase8-item__meta">Comments/notes in active milestone</div></div>
      <div class="phase9-list" style="margin-top:8px">
        <div class="phase9-row"><div><div class="phase9-row__name">Milestone</div><div class="phase9-row__meta">${m ? escapeHtml(m.title) : '—'}</div></div><span class="phase9-tag">${tasks.length} tasks</span></div>
        <div class="phase9-row"><div><div class="phase9-row__name">Threaded tasks</div><div class="phase9-row__meta">Tasks with at least 1 comment/note</div></div><span class="phase9-tag">${commentedTasks}</span></div>
        <div class="phase9-row"><div><div class="phase9-row__name">Total entries</div><div class="phase9-row__meta">Persisted in task metadata</div></div><span class="phase9-tag">${commentsCount}</span></div>
      </div>
      <div class="phase9-note" style="margin-top:6px">Use the 💬 button on any task to append/view notes. Supports <span class="phase8-kbd">author | message</span> format.</div>
    `;
  }
}

function phase9BuildAssigneeStats_(tasks){
  const map = new Map();
  for(const t of (tasks || [])){
    const name = (String(t?.assignee || '').trim() || 'Unassigned');
    let r = map.get(name);
    if(!r){ r = { name, open:0, done:0, hot:0 }; map.set(name, r); }
    if(t?.done) r.done++; else r.open++;
    if(t?.severity === 'high') r.hot += 1;
    if(t?.severity === 'blocker') r.hot += 2;
  }
  return Array.from(map.values()).sort((a,b) => (b.open - a.open) || a.name.localeCompare(b.name));
}

function phase9GetSelectedOrVisibleTaskIds_(m, includeVisibleFallback){
  if(!m) return [];
  let selected = [];
  try{ if(typeof phase3GetSelectedTaskIdsForCurrentMilestone_ === 'function') selected = phase3GetSelectedTaskIdsForCurrentMilestone_(); }catch{}
  selected = Array.isArray(selected) ? selected.filter(Boolean) : [];
  if(selected.length) return Array.from(new Set(selected));
  if(!includeVisibleFallback) return [];
  const visibleCards = Array.from(document.querySelectorAll('#taskList .task')).filter(x => !x.classList.contains('phase3-hidden'));
  return Array.from(new Set(visibleCards.map(x => String(x.dataset.taskId || '')).filter(Boolean)));
}

function phase9BatchAssignSelected_(mode, assigneeValue){
  const { m } = phase9ChecklistContext_();
  if(!m){ alert('Select a project and milestone first.'); return; }
  const ids = phase9GetSelectedOrVisibleTaskIds_(m, true);
  if(!ids.length){ alert('No selected (or visible) tasks to assign.'); return; }
  const setIds = new Set(ids);
  let changed = 0;
  if(mode === 'clear'){
    for(const t of (m.tasks || [])){
      if(!setIds.has(t.id)) continue;
      if(String(t.assignee || '') !== ''){ t.assignee = ''; changed++; }
    }
    if(changed) addActivity(`Phase9 cleared assignee on ${changed} task(s)`);
  } else {
    const name = String(assigneeValue || '').trim();
    if(!name){ alert('Enter an assignee name first.'); return; }
    for(const t of (m.tasks || [])){
      if(!setIds.has(t.id)) continue;
      if(String(t.assignee || '') !== name){ t.assignee = name; changed++; }
    }
    if(changed) addActivity(`Phase9 assigned ${changed} task(s) to ${name}`);
  }
  if(changed){ saveState(); renderChecklist(); }
}

async function phase9PromptRebalanceSelected_(){
  const { p, m } = phase9ChecklistContext_();
  if(!m){ alert('Select a project and milestone first.'); return; }
  const ids = phase9GetSelectedOrVisibleTaskIds_(m, true);
  if(!ids.length){ alert('No selected (or visible) tasks to rebalance.'); return; }
  const seed = phase9BuildAssigneeStats_(m.tasks || []).map(x=>x.name).filter(n=>n !== 'Unassigned').slice(0,6).join(', ');
  const raw = await pmPromptDialog_('Rebalance across which assignees? (comma-separated)', seed || 'Alice, Bob', {
    title:'Rebalance Assignees',
    placeholder:'Alice, Bob'
  });
  if(raw == null) return;
  const names = Array.from(new Set(String(raw).split(',').map(s=>s.trim()).filter(Boolean)));
  if(!names.length){ alert('Enter at least one assignee.'); return; }

  // Load-aware rebalance using open-task counts across active project (best effort)
  const loads = Object.create(null);
  for(const n of names) loads[n] = 0;
  const scopeTasks = [];
  for(const mod of (p?.modules || [])) for(const ms of (mod?.milestones || [])) for(const t of (ms?.tasks || [])) scopeTasks.push(t);
  for(const t of scopeTasks){
    const a = String(t?.assignee || '').trim();
    if(a && a in loads && !t.done) loads[a] += 1;
  }
  const targets = new Set(ids);
  const selectedTasks = (m.tasks || []).filter(t => targets.has(t.id));
  // Prefer open tasks first to reduce pressure.
  selectedTasks.sort((a,b) => Number(a.done) - Number(b.done) || sevRank(b.severity) - sevRank(a.severity));
  let changed = 0;
  for(const t of selectedTasks){
    let pick = names[0];
    for(const n of names){ if((loads[n]||0) < (loads[pick]||0)) pick = n; }
    if(String(t.assignee || '') !== pick){ t.assignee = pick; changed++; }
    if(!t.done) loads[pick] = (loads[pick] || 0) + 1;
  }
  if(!changed){ alert('No assignee changes were needed.'); return; }
  addActivity(`Phase9 rebalanced ${changed} task(s) across ${names.length} assignee(s)`);
  saveState();
  renderChecklist();
}

function phase9FocusAssigneeTasks_(name){
  if(!name) return;
  switchTab('checklist');
  setTimeout(() => {
    const cards = Array.from(document.querySelectorAll('#taskList .task'));
    const hit = cards.find(card => {
      const tid = String(card.dataset.taskId || '');
      const t = phase9FindTaskInActiveMilestoneById_(tid);
      return t && String(t.assignee || '').trim() === String(name).trim();
    });
    if(hit){ hit.scrollIntoView({behavior:'smooth', block:'center'}); hit.classList.add('is-selected'); setTimeout(()=>hit.classList.remove('is-selected'), 900); }
  }, 30);
}

function phase9LoadReminderCfg_(){
  if(phase9State_.reminderCfg) return phase9State_.reminderCfg;
  const base = {
    enabled: true,
    showOverdue: true,
    showDueSoon: true,
    showBlocked: true,
    showCapacity: true,
    showSnapshot: true,
    defaultSnoozeHours: 12,
  };
  try{
    const raw = localStorage.getItem(PHASE9_REMINDER_KEY);
    if(raw){
      const x = JSON.parse(raw);
      Object.assign(base, {
        enabled: x?.enabled !== false,
        showOverdue: x?.showOverdue !== false,
        showDueSoon: x?.showDueSoon !== false,
        showBlocked: x?.showBlocked !== false,
        showCapacity: x?.showCapacity !== false,
        showSnapshot: x?.showSnapshot !== false,
        defaultSnoozeHours: Math.max(1, Math.min(720, Number(x?.defaultSnoozeHours || 12) || 12)),
      });
    }
  }catch{}
  phase9State_.reminderCfg = base;
  return base;
}

function phase9SaveReminderCfg_(){
  try{ localStorage.setItem(PHASE9_REMINDER_KEY, JSON.stringify(phase9LoadReminderCfg_())); }catch{}
}

function phase9LoadSnooze_(){
  if(phase9State_.snooze) return phase9State_.snooze;
  let map = {};
  try{ map = JSON.parse(localStorage.getItem(PHASE9_NOTIFY_SNOOZE_KEY) || '{}') || {}; }catch{ map = {}; }
  phase9State_.snooze = (map && typeof map === 'object') ? map : {};
  phase9PruneSnooze_();
  return phase9State_.snooze;
}

function phase9SaveSnooze_(){
  try{ localStorage.setItem(PHASE9_NOTIFY_SNOOZE_KEY, JSON.stringify(phase9LoadSnooze_())); }catch{}
}

function phase9PruneSnooze_(){
  const now = Date.now();
  const snooze = phase9State_.snooze || {};
  let changed = false;
  for(const [k,v] of Object.entries(snooze)){
    if(!Number.isFinite(Number(v)) || Number(v) <= now){ delete snooze[k]; changed = true; }
  }
  if(changed) phase9SaveSnooze_();
}

function phase9FilterNotificationsByRulesAndSnooze_(arr){
  const cfg = phase9LoadReminderCfg_();
  if(!cfg.enabled) return [];
  const snooze = phase9LoadSnooze_();
  const now = Date.now();
  return (arr || []).filter(n => {
    const type = String(n?.type || '');
    if(type === 'overdue' && !cfg.showOverdue) return false;
    if(type === 'dueSoon' && !cfg.showDueSoon) return false;
    if(type === 'blocked' && !cfg.showBlocked) return false;
    if(type === 'capacity' && !cfg.showCapacity) return false;
    if(type === 'snapshot' && !cfg.showSnapshot) return false;
    const until = Number(snooze[n.id] || 0);
    if(Number.isFinite(until) && until > now) return false;
    return true;
  });
}

function phase9PostRenderNotificationsPanel_(){
  const box = document.querySelector('#phase8NotificationsPanel');
  if(!box) return;

  // Add rules summary / shortcut toolbar once
  if(!box.querySelector('#phase9NotifRulesBar')){
    const toolbar = document.createElement('div');
    toolbar.id = 'phase9NotifRulesBar';
    toolbar.className = 'phase9-toolbar';
    toolbar.style.marginTop = '8px';
    const cfg = phase9LoadReminderCfg_();
    const snooze = phase9LoadSnooze_();
    const snoozeCount = Object.keys(snooze).length;
    toolbar.innerHTML = `
      <span class="phase9-tag ${cfg.enabled ? '' : 'risk'}">${cfg.enabled ? 'Reminders ON' : 'Reminders OFF'}</span>
      <span class="phase9-note">Snoozed: ${snoozeCount}</span>
      <button class="btn btn--ghost" type="button" id="phase9BtnNotifRules">Rules</button>
      <button class="btn btn--ghost" type="button" id="phase9BtnNotifUnsnoozeAll">Clear Snooze</button>
    `;
    const list = box.querySelector('#phase8NotifList');
    if(list) box.insertBefore(toolbar, list); else box.appendChild(toolbar);
    toolbar.querySelector('#phase9BtnNotifRules')?.addEventListener('click', () => { switchTab('dashboard'); setTimeout(()=>document.querySelector('#phase9ReminderRulesPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); });
    toolbar.querySelector('#phase9BtnNotifUnsnoozeAll')?.addEventListener('click', () => { phase9State_.snooze = {}; phase9SaveSnooze_(); phase8RenderNotificationsPanel_ && phase8RenderNotificationsPanel_(); });
  } else {
    const cfg = phase9LoadReminderCfg_();
    const snoozeCount = Object.keys(phase9LoadSnooze_()).length;
    const tag = box.querySelector('#phase9NotifRulesBar .phase9-tag');
    const note = box.querySelector('#phase9NotifRulesBar .phase9-note');
    if(tag){ tag.textContent = cfg.enabled ? 'Reminders ON' : 'Reminders OFF'; tag.classList.toggle('risk', !cfg.enabled); }
    if(note) note.textContent = `Snoozed: ${snoozeCount}`;
  }

  // Add snooze buttons to visible notification rows (order matches rendered rows)
  const notifyState = (typeof phase8LoadNotifyState_ === 'function') ? phase8LoadNotifyState_() : { dismissed:[] };
  const all = (typeof phase8GenerateNotifications_ === 'function') ? (phase8GenerateNotifications_() || []) : [];
  const visible = (all || []).filter(n => !(notifyState.dismissed || []).includes(n.id));
  const rows = Array.from(box.querySelectorAll('#phase8NotifList .phase8-item'));
  rows.forEach((row, idx) => {
    if(row.querySelector('[data-act="phase9Snooze"]')) return;
    const n = visible[idx];
    if(!n) return;
    const toolbar = row.querySelector('.phase8-toolbar') || row;
    const btn = document.createElement('button');
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.dataset.act = 'phase9Snooze';
    btn.textContent = 'Snooze';
    btn.title = 'Temporarily hide this notification';
    btn.addEventListener('click', async () => {
      const cfg = phase9LoadReminderCfg_();
      const hoursRaw = await pmPromptDialog_('Snooze for how many hours?', String(Math.max(1, Number(cfg.defaultSnoozeHours || 12) || 12)), {
        title:'Snooze Notification',
        placeholder:'Hours'
      });
      if(hoursRaw == null) return;
      const h = Number(hoursRaw);
      if(!Number.isFinite(h) || h <= 0){ alert('Enter a positive number of hours.'); return; }
      phase9LoadSnooze_()[n.id] = Date.now() + Math.round(h * 3600000);
      phase9SaveSnooze_();
      addActivity(`Phase9 snoozed notification (${n.type || 'notice'}): ${n.title}`);
      if(typeof phase8RenderNotificationsPanel_ === 'function') phase8RenderNotificationsPanel_();
    });
    toolbar.appendChild(btn);
  });
}

function phase9PostRenderDashboard_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return;
  let host = document.querySelector('#phase9DashboardHost');
  if(!host){
    host = document.createElement('div');
    host.id = 'phase9DashboardHost';
    host.className = 'phase9-box';
    host.innerHTML = `
      <div class="phase9-title">Phase 9 Collaboration & Execution</div>
      <div class="phase9-grid" id="phase9DashGrid">
        <div class="phase9-card" id="phase9ReminderRulesPanel"></div>
        <div class="phase9-card" id="phase9AuditExportPanel"></div>
      </div>
    `;
    tab.appendChild(host);
  }
  phase9RenderReminderRulesPanel_();
  phase9RenderAuditExportPanel_();
}

function phase9RenderReminderRulesPanel_(){
  const box = document.querySelector('#phase9ReminderRulesPanel');
  if(!box) return;
  const cfg = phase9LoadReminderCfg_();
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Reminder Rules</div><div class="phase8-item__meta">Controls Phase 8 Notifications Center visibility + snooze defaults</div></div>
    <div class="phase9-list" style="margin-top:8px">
      <label class="phase9-row phase9-check"><span>Enable reminders center output</span><input type="checkbox" id="phase9RuleEnabled" ${cfg.enabled ? 'checked' : ''}></label>
      <label class="phase9-row phase9-check"><span>Overdue alerts</span><input type="checkbox" id="phase9RuleOverdue" ${cfg.showOverdue ? 'checked' : ''}></label>
      <label class="phase9-row phase9-check"><span>Due soon alerts (Phase 8 horizon)</span><input type="checkbox" id="phase9RuleDueSoon" ${cfg.showDueSoon ? 'checked' : ''}></label>
      <label class="phase9-row phase9-check"><span>Blocked task alerts</span><input type="checkbox" id="phase9RuleBlocked" ${cfg.showBlocked ? 'checked' : ''}></label>
      <label class="phase9-row phase9-check"><span>Capacity overload alerts</span><input type="checkbox" id="phase9RuleCapacity" ${cfg.showCapacity ? 'checked' : ''}></label>
      <label class="phase9-row phase9-check"><span>Snapshot reminder</span><input type="checkbox" id="phase9RuleSnapshot" ${cfg.showSnapshot ? 'checked' : ''}></label>
    </div>
    <div class="phase9-toolbar" style="margin-top:8px">
      <label class="phase9-note">Default snooze (hours)</label>
      <input class="input phase9-inlineNum" type="number" min="1" max="720" step="1" id="phase9DefaultSnoozeHours" value="${escapeHtml(String(cfg.defaultSnoozeHours || 12))}">
      <button class="btn btn--ghost" type="button" id="phase9BtnSaveReminderRules">Save</button>
      <button class="btn btn--ghost" type="button" id="phase9BtnResetReminderRules">Reset</button>
    </div>
    <div class="phase9-note" style="margin-top:6px">Tip: Use <span class="phase8-kbd">Snooze</span> on individual notifications to temporarily hide them without dismissing.</div>
  `;
  box.querySelector('#phase9BtnSaveReminderRules')?.addEventListener('click', () => {
    const next = phase9LoadReminderCfg_();
    next.enabled = !!box.querySelector('#phase9RuleEnabled')?.checked;
    next.showOverdue = !!box.querySelector('#phase9RuleOverdue')?.checked;
    next.showDueSoon = !!box.querySelector('#phase9RuleDueSoon')?.checked;
    next.showBlocked = !!box.querySelector('#phase9RuleBlocked')?.checked;
    next.showCapacity = !!box.querySelector('#phase9RuleCapacity')?.checked;
    next.showSnapshot = !!box.querySelector('#phase9RuleSnapshot')?.checked;
    const h = Number(box.querySelector('#phase9DefaultSnoozeHours')?.value || 12);
    next.defaultSnoozeHours = Math.max(1, Math.min(720, Number.isFinite(h) ? Math.round(h) : 12));
    phase9SaveReminderCfg_();
    addActivity('Phase9 updated reminder rules');
    if(typeof phase8RenderNotificationsPanel_ === 'function') phase8RenderNotificationsPanel_();
    phase9RenderReminderRulesPanel_();
  });
  box.querySelector('#phase9BtnResetReminderRules')?.addEventListener('click', () => {
    phase9State_.reminderCfg = null;
    phase9SaveReminderCfg_();
    addActivity('Phase9 reset reminder rules to defaults');
    phase9State_.reminderCfg = null;
    phase9RenderReminderRulesPanel_();
    if(typeof phase8RenderNotificationsPanel_ === 'function') phase8RenderNotificationsPanel_();
  });
}

function phase9RenderAuditExportPanel_(){
  const box = document.querySelector('#phase9AuditExportPanel');
  if(!box) return;
  const q = (typeof phase8State_ === 'object' && phase8State_) ? String(phase8State_.auditQuery || '') : '';
  const rows = phase9CollectAuditRows_(q);
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Audit Export</div><div class="phase8-item__meta">Export activity trail (filtered or full)</div></div>
    <div class="phase9-note" style="margin-top:6px">${rows.length} row(s) match current Phase 8 audit filter${q ? `: "${escapeHtml(q)}"` : ' (no filter)'}</div>
    <div class="phase9-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" type="button" id="phase9BtnAuditExportTxt">Export TXT</button>
      <button class="btn btn--ghost" type="button" id="phase9BtnAuditExportJson">Export JSON</button>
      <button class="btn btn--ghost" type="button" id="phase9BtnAuditExportPrompt">Export…</button>
    </div>
    <div class="phase9-list" style="margin-top:8px" id="phase9AuditPreview"></div>
  `;
  const preview = box.querySelector('#phase9AuditPreview');
  if(!rows.length){
    preview.innerHTML = `<div class="phase8-empty">No matching audit rows.</div>`;
  } else {
    rows.slice(0,8).forEach(a => {
      const row = document.createElement('div');
      row.className = 'phase9-row';
      row.innerHTML = `<div><div class="phase9-row__name">${escapeHtml(String(a.msg || ''))}</div><div class="phase9-row__meta">${new Date(Number(a.ts || Date.now())).toLocaleString()}</div></div><span class="phase9-tag">activity</span>`;
      preview.appendChild(row);
    });
  }
  box.querySelector('#phase9BtnAuditExportTxt')?.addEventListener('click', ()=>phase9ExportAuditTrail_('txt'));
  box.querySelector('#phase9BtnAuditExportJson')?.addEventListener('click', ()=>phase9ExportAuditTrail_('json'));
  box.querySelector('#phase9BtnAuditExportPrompt')?.addEventListener('click', phase9PromptExportAudit_);
}

function phase9CollectAuditRows_(query){
  const q = String(query || '').trim().toLowerCase();
  return (state.activity || []).filter(a => !q || String(a?.msg || '').toLowerCase().includes(q));
}

async function phase9PromptExportAudit_(){
  const kindRaw = await pmPromptDialog_('Export audit trail as TXT or JSON?', 'TXT', { title:'Audit Export', placeholder:'TXT or JSON' });
  if(kindRaw == null) return;
  const kind = String(kindRaw || '').trim().toLowerCase() === 'json' ? 'json' : 'txt';
  phase9ExportAuditTrail_(kind);
}

function phase9ExportAuditTrail_(kind){
  const q = (typeof phase8State_ === 'object' && phase8State_) ? String(phase8State_.auditQuery || '') : '';
  const rows = phase9CollectAuditRows_(q);
  const ts = new Date();
  const stamp = `${ts.getFullYear()}${String(ts.getMonth()+1).padStart(2,'0')}${String(ts.getDate()).padStart(2,'0')}_${String(ts.getHours()).padStart(2,'0')}${String(ts.getMinutes()).padStart(2,'0')}`;
  if(kind === 'json'){
    const payload = { exportedAt: Date.now(), filter:q, count: rows.length, rows };
    downloadText(`audit_trail_${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
  } else {
    const lines = [
      'Audit Trail Export',
      `Exported: ${new Date().toLocaleString()}`,
      `Filter: ${q || '(none)'}`,
      `Rows: ${rows.length}`,
      '',
      ...rows.map(a => `- [${new Date(Number(a.ts||Date.now())).toLocaleString()}] ${String(a.msg || '')}`)
    ];
    downloadText(`audit_trail_${stamp}.txt`, lines.join('\n'), 'text/plain');
  }
  addActivity(`Phase9 exported audit trail (${kind.toUpperCase()})${q ? ` [filter:${q}]` : ''}`);
  try{ if(typeof phase8RenderAuditPanel_ === 'function') phase8RenderAuditPanel_(); }catch{}
  try{ phase9RenderAuditExportPanel_(); }catch{}
}

function phase9EnsureTopbarButtons_(){
  const topbarRight = document.querySelector('.topbar__right');
  if(!topbarRight) return;
  if(!document.querySelector('#phase9BtnReminders')){
    const btn = document.createElement('button');
    btn.id = 'phase9BtnReminders';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Reminder Rules';
    btn.title = 'Open Phase 9 reminder rules panel';
    btn.addEventListener('click', () => { openPanelInOwningTab_('#phase9ReminderRulesPanel', 'dashboard', 10); });
    topbarRight.appendChild(btn);
  }
  if(!document.querySelector('#phase9BtnAuditExport')){
    const btn = document.createElement('button');
    btn.id = 'phase9BtnAuditExport';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Audit Export';
    btn.title = 'Export activity/audit trail';
    btn.addEventListener('click', phase9PromptExportAudit_);
    topbarRight.appendChild(btn);
  }
}

function phase9WrapSnapshotRestore_(){
  if(typeof phase6RestoreSelectedSnapshot_ !== 'function') return;
  const _orig = phase6RestoreSelectedSnapshot_;
  phase6RestoreSelectedSnapshot_ = async function(){
    const p = getActiveProject();
    if(!p){ alert('Select an active project first.'); return; }
    const snap = (typeof phase6GetSelectedSnapshot_ === 'function') ? phase6GetSelectedSnapshot_() : null;
    if(!snap){ await pmAlertDialog_('No snapshot selected.', { title:'Restore Snapshot' }); return; }

    let restored = null;
    try{ restored = sanitizeProject(JSON.parse(JSON.stringify(snap.project || {}))); }
    catch(err){ await pmAlertDialog_('Snapshot is invalid/corrupted and could not be restored.', { title:'Restore Snapshot' }); return; }

    let preview = '';
    try{
      if(typeof phase7CompareProjects_ === 'function'){
        const diff = phase7CompareProjects_(p, restored);
        const c0 = diff.counts.left || {};
        const c1 = diff.counts.right || {};
        const samples = (diff.sampleChanges || []).slice(0,6);
        preview = [
          `Snapshot Restore Preview: ${snap.name}`,
          `Project: ${p.name}`,
          '',
          `Counts  modules ${c0.modules||0} -> ${c1.modules||0}`,
          `        milestones ${c0.milestones||0} -> ${c1.milestones||0}`,
          `        tasks ${c0.tasks||0} -> ${c1.tasks||0}`,
          `        done ${c0.done||0} -> ${c1.done||0}`,
          '',
          `Task diff  added:${diff.taskDiff?.added||0} removed:${diff.taskDiff?.removed||0} changed:${diff.taskDiff?.changed||0}`,
          diff.projectFieldChanges?.length ? `Project fields: ${diff.projectFieldChanges.join('; ')}` : 'Project fields: no top-level changes',
          samples.length ? `Sample changes:\n- ${samples.join('\n- ')}` : 'Sample changes: none detected',
          '',
          'Proceed to restore this snapshot?'
        ].join('\n');
      }
    }catch(err){
      console.warn('Phase9 snapshot preview failed', err);
    }
    if(!preview){
      preview = `Restore snapshot "${snap.name}" for project "${p.name}"?\n\nCurrent project state will be replaced.`;
    }
    const ok = await pmConfirmDialog_(preview, { title:'Snapshot Restore Preview', okText:'Restore', danger:true });
    if(!ok) return;

    // Re-implement restore path to avoid double confirm from original function.
    restored.id = p.id;
    const idx = state.projects.findIndex(x => x && x.id === p.id);
    if(idx < 0){ await pmAlertDialog_('Active project not found.', { title:'Restore Snapshot' }); return; }
    state.projects[idx] = restored;
    const firstMod = restored.modules?.[0] || null;
    state.activeModuleId = firstMod?.id || null;
    state.activeMilestoneId = firstMod?.milestones?.[0]?.id || null;
    reconcileActiveSelection_();
    addActivity(`Phase9 restored snapshot (previewed): ${snap.name}`);
    saveState();
    renderAll();
  };
  phase6RestoreSelectedSnapshot_._phase9Wrapped = true;
  phase6RestoreSelectedSnapshot_._phase9Original = _orig;
}

// boot phase 9 after phase 8 patch is loaded
try{ initPhase9_(); }catch(err){ console.warn('Phase9 init failed', err); }
