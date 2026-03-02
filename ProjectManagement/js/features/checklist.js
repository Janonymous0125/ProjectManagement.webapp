/* ---------------------------
   Checklist
---------------------------- */
const taskEditModalState_ = {
  projectId: null,
  milestoneId: null,
  taskId: null,
  restoreFocusEl: null,
};

function wireChecklist(){
  ui.btnOpenTaskAdd?.addEventListener("click", openTaskAddModal);
  ui.btnCloseTaskAdd?.addEventListener("click", closeTaskAddModal);
  ui.taskAddModal?.addEventListener("click", (e) => {
    if(e.target?.dataset?.closeTaskAdd === "1") closeTaskAddModal();
  });
  ui.taskAddModal?.addEventListener("input", syncTaskAddModalUx_);
  ui.taskAddModal?.addEventListener("change", syncTaskAddModalUx_);

  ui.btnCloseTaskEdit?.addEventListener("click", () => closeTaskEditModal());
  ui.btnCancelTaskEdit?.addEventListener("click", () => closeTaskEditModal());
  ui.btnSaveTaskEdit?.addEventListener("click", saveTaskEditModal_);
  ui.taskEditModal?.addEventListener("click", (e) => {
    if(e.target?.dataset?.closeTaskEdit === "1") closeTaskEditModal();
  });
  ui.taskEditModal?.addEventListener("input", syncTaskEditModalUx_);
  ui.taskEditModal?.addEventListener("change", syncTaskEditModalUx_);
  document.addEventListener("keydown", handleTaskModalKeydown_);

  ui.btnAddTask.addEventListener("click", () => {
    const p = getActiveProject();
    if(!p){ alert("Create/select a project first."); return; }
    const m = getActiveMilestone(p);
    if(!m){ alert("Create/select a milestone first."); return; }

    const title = ui.taskText.value.trim();
    if(!title){ ui.taskText.focus(); return; }

    /** @type {Task} */
    const t = {
      id: uid(),
      title,
      done: false,
      severity: /** @type any */(ui.taskSeverity.value),
      assignee: ui.taskAssignee.value.trim(),
      createdAt: Date.now(),
      steps: [],
    };

    m.tasks.unshift(t);
    ui.taskText.value = "";
    ui.taskAssignee.value = "";
    addActivity(`Added task: ${t.title}`);
    saveState();
    renderAll();

    requestAnimationFrame(() => {
      if(ui.taskText && !ui.taskText.disabled){
        ui.taskText.focus();
      }
    });

    safeAnime(() => {
      const { animate } = anime;
      animate({ targets: "#taskList .task", opacity:[0,1], translateY:[6,0], duration: 320, easing:"easeOutQuad" });
    });
  });

  ui.btnJumpMilestones.addEventListener("click", () => {
    closeTaskAddModal({ restoreFocus:false });
    switchTab("milestones");
  });

  ui.btnSortTasks.addEventListener("click", () => {
    const p = getActiveProject();
    const m = p ? getActiveMilestone(p) : null;
    if(!m) return;

    m.tasks.sort((a,b) =>
      (Number(a.done) - Number(b.done)) ||
      (sevRank(b.severity) - sevRank(a.severity)) ||
      (b.createdAt - a.createdAt)
    );

    addActivity("Sorted tasks");
    saveState();
    renderAll();
  });

  ui.btnClearDone.addEventListener("click", async () => {
    const p = getActiveProject();
    const m = p ? getActiveMilestone(p) : null;
    if(!m) return;
    const doneCount = m.tasks.filter(t => t.done).length;
    if(!doneCount) return;

    const ok = await pmConfirmDialog_(`Remove ${doneCount} done task(s) from this milestone?`, { title:'Clear Done Tasks', okText:'Remove', danger:true });
    if(!ok) return;

    m.tasks = m.tasks.filter(t => !t.done);
    addActivity(`Cleared done tasks (${doneCount})`);
    saveState();
    renderAll();
  });

  syncTaskAddModalUx_();
  syncTaskEditModalUx_();
}

function handleTaskModalKeydown_(e){
  if(e.defaultPrevented) return;
  const key = String(e.key || "");
  if(key === "Escape"){
    if(ui.taskEditModal?.classList.contains("is-open")){
      closeTaskEditModal();
      return;
    }
    if(ui.taskAddModal?.classList.contains("is-open")){
      closeTaskAddModal();
      return;
    }
  }
  if(key === "Enter" && ui.taskEditModal?.classList.contains("is-open") && !e.shiftKey){
    const tag = String(e.target?.tagName || "").toUpperCase();
    if(tag === 'TEXTAREA') return;
    if(e.target === ui.taskEditTitle || e.target === ui.taskEditSeverity || e.target === ui.taskEditAssignee || e.target === ui.taskEditDue){
      e.preventDefault();
      saveTaskEditModal_();
    }
  }
}

function openTaskAddModal(){
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  if(!p || !m){
    ui.btnOpenTaskAdd?.focus();
    return;
  }

  syncTaskAddModalUx_();
  ui.taskAddModal?.classList.add("is-open");
  document.body.classList.add("pm-task-modal-open");
  ui.taskAddModal?.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    if(ui.taskText && !ui.taskText.disabled){
      ui.taskText.focus();
      ui.taskText.select?.();
      return;
    }
    ui.taskSeverity?.focus();
  });
}

function closeTaskAddModal({ restoreFocus = true } = {}){
  ui.taskAddModal?.classList.remove("is-open");
  document.body.classList.remove("pm-task-modal-open");
  ui.taskAddModal?.setAttribute("aria-hidden", "true");
  if(restoreFocus) ui.btnOpenTaskAdd?.focus();
}

function taskAddFmtDate_(value){
  const raw = Number(value || 0);
  if(!(raw > 0)) return '';
  try{
    if(typeof phase4FmtDate_ === 'function') return phase4FmtDate_(raw);
  }catch{}
  try{
    return new Date(raw).toLocaleDateString([], { month:'short', day:'numeric', year:'numeric' });
  }catch{}
  return '';
}

function taskDateInputToTs_(raw){
  const value = String(raw || '').trim();
  if(!value) return 0;
  const parts = value.split('-').map(Number);
  if(parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return 0;
  const [y,m,d] = parts;
  return new Date(y, m - 1, d).getTime();
}

function taskTsToDateInput_(value){
  const raw = Number(value || 0);
  if(!(raw > 0)) return '';
  const d = new Date(raw);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function taskAddDueTsFromField_(){
  return taskDateInputToTs_(document.querySelector('#phase4TaskDue')?.value || '');
}

function taskAddComputeScopeStats_(m){
  const tasks = Array.isArray(m?.tasks) ? m.tasks.filter(Boolean) : [];
  const done = tasks.filter(t => !!t.done).length;
  const open = Math.max(0, tasks.length - done);
  const todayStart = new Date();
  todayStart.setHours(0,0,0,0);
  const blocked = tasks.filter(t => {
    if(!t || t.done) return false;
    try{
      if(typeof phase4GetUnresolvedBlockers_ === 'function') return phase4GetUnresolvedBlockers_(m, t).length > 0;
    }catch{}
    return Array.isArray(t?.blockedBy) && t.blockedBy.length > 0;
  }).length;
  const overdue = tasks.filter(t => {
    if(!t || t.done) return false;
    const dueAt = Number(t?.dueAt || 0);
    if(!(dueAt > 0)) return false;
    try{
      if(typeof phase4DueBucket_ === 'function') return phase4DueBucket_(dueAt) === 'overdue';
    }catch{}
    return dueAt < todayStart.getTime();
  }).length;
  return { tasks, open, done, blocked, overdue };
}

function taskAddSeverityLabel_(sev){
  if(sev === 'high') return 'SEVERITY HIGH';
  if(sev === 'blocker') return 'SEVERITY BLOCKER';
  return 'SEVERITY NORMAL';
}

function taskAddSeverityMeta_(sev){
  if(sev === 'high') return 'High-priority execution item. Push near the top of the active queue.';
  if(sev === 'blocker') return 'Blocker item. Use for work that is actively preventing downstream progress.';
  return 'Standard execution item. Good for routine delivery, follow-ups, and next-step capture.';
}

function syncTaskAddModalUx_(){
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  const stats = taskAddComputeScopeStats_(m);
  const title = String(ui?.taskText?.value || '').trim();
  const assignee = String(ui?.taskAssignee?.value || '').trim();
  const severity = String(ui?.taskSeverity?.value || 'normal');
  const dueTs = taskAddDueTsFromField_();
  const dueText = dueTs ? taskAddFmtDate_(dueTs) : '';

  if(ui.taskAddScopeProject){
    ui.taskAddScopeProject.textContent = p ? String(p.name || 'Untitled Project') : 'No active project';
  }
  if(ui.taskAddScopeMilestone){
    ui.taskAddScopeMilestone.textContent = m
      ? `${String(m.title || 'Untitled Milestone')} • ${stats.tasks.length} task${stats.tasks.length === 1 ? '' : 's'} staged`
      : 'Pick an active milestone from the Checklist lane to stage a new task.';
  }
  if(ui.taskAddScopeOpen) ui.taskAddScopeOpen.textContent = String(stats.open || 0);
  if(ui.taskAddScopeBlocked) ui.taskAddScopeBlocked.textContent = String(stats.blocked || 0);
  if(ui.taskAddScopeOverdue) ui.taskAddScopeOverdue.textContent = String(stats.overdue || 0);

  if(ui.taskAddDraftTitle){
    ui.taskAddDraftTitle.textContent = title || 'Awaiting task title';
  }
  if(ui.taskAddDraftMeta){
    const parts = [];
    parts.push(taskAddSeverityMeta_(severity));
    if(assignee) parts.push(`Owner: ${assignee}.`);
    else parts.push('Owner is still open.');
    if(dueText) parts.push(`Target due: ${dueText}.`);
    else parts.push('No due date set yet.');
    ui.taskAddDraftMeta.textContent = parts.join(' ');
  }
  if(ui.taskAddDraftChips){
    const chips = [
      `<span class="badge ${severity === 'high' ? 'pm-task-draft__chip pm-task-draft__chip--high' : severity === 'blocker' ? 'pm-task-draft__chip pm-task-draft__chip--blocker' : 'pm-task-draft__chip pm-task-draft__chip--normal'}">${escapeHtml(taskAddSeverityLabel_(severity))}</span>`,
      `<span class="badge pm-task-draft__chip ${assignee ? 'pm-task-draft__chip--assigned' : 'pm-task-draft__chip--open'}">${escapeHtml(assignee ? `OWNER ${assignee}` : 'OWNER OPEN')}</span>`,
      `<span class="badge pm-task-draft__chip ${dueText ? 'pm-task-draft__chip--due' : 'pm-task-draft__chip--open'}">${escapeHtml(dueText ? `DUE ${dueText}` : 'DUE OPEN')}</span>`
    ];
    if(stats.blocked > 0) chips.push(`<span class="badge pm-task-draft__chip pm-task-draft__chip--warn">${escapeHtml(`BLOCKED ${stats.blocked}`)}</span>`);
    if(stats.overdue > 0) chips.push(`<span class="badge pm-task-draft__chip pm-task-draft__chip--warn">${escapeHtml(`OVERDUE ${stats.overdue}`)}</span>`);
    ui.taskAddDraftChips.innerHTML = chips.join('');
  }
  if(ui.taskAddModalNote){
    if(!p || !m){
      ui.taskAddModalNote.innerHTML = 'Checklist is tied to your <b>Active Project</b> + <b>Active Milestone</b>. Select both before staging a task.';
    }else if(stats.overdue > 0 || stats.blocked > 0){
      ui.taskAddModalNote.innerHTML = `This lane currently has <b>${stats.open}</b> open task${stats.open === 1 ? '' : 's'}, including <b>${stats.overdue}</b> overdue and <b>${stats.blocked}</b> blocked. Use severity to signal whether this draft is routine, urgent, or unblocking work.`;
    }else if(stats.open === 0){
      ui.taskAddModalNote.innerHTML = `This milestone is clear right now. Seed the next execution move for <b>${escapeHtml(String(m.title || 'this milestone'))}</b> and keep the queue intentional.`;
    }else{
      ui.taskAddModalNote.innerHTML = `This draft will land inside <b>${escapeHtml(String(m.title || 'the active milestone'))}</b>, where <b>${stats.open}</b> active task${stats.open === 1 ? '' : 's'} are already in motion. Keep titles crisp so the checklist stays readable at a glance.`;
    }
  }
}

function taskEditFindTarget_(projectId, milestoneId, taskId){
  for(const p of state.projects || []){
    if(projectId && p?.id !== projectId) continue;
    const mods = Array.isArray(p?.modules) ? p.modules : [];
    for(const mod of mods){
      const milestones = Array.isArray(mod?.milestones) ? mod.milestones : [];
      for(const m of milestones){
        if(milestoneId && m?.id !== milestoneId) continue;
        const tasks = Array.isArray(m?.tasks) ? m.tasks : [];
        const t = tasks.find(x => x && x.id === taskId);
        if(t) return { p, m, t };
      }
    }
  }
  return null;
}

function taskEditSeverityMeta_(sev){
  if(sev === 'high') return 'High-priority execution item. Keep the title sharp and the owner unambiguous.';
  if(sev === 'blocker') return 'Blocker item. Use the wording to spotlight what is actively stopping progress.';
  return 'Standard execution item. Tune the brief so it stays easy to scan in the queue.';
}

function taskEditRiskLabel_(m, t){
  if(!t) return 'CLEAR';
  if(t.done) return 'DONE';
  try{
    if(typeof phase4GetUnresolvedBlockers_ === 'function' && phase4GetUnresolvedBlockers_(m, t).length > 0) return 'BLOCKED';
  }catch{}
  const dueAt = Number(t?.dueAt || 0);
  if(dueAt > 0){
    try{
      if(typeof phase4DueBucket_ === 'function'){
        const bucket = phase4DueBucket_(dueAt);
        if(bucket === 'overdue') return 'OVERDUE';
        if(bucket === 'today') return 'DUE TODAY';
        if(bucket === 'soon') return 'DUE SOON';
      }
    }catch{}
    if(dueAt < Date.now()) return 'OVERDUE';
  }
  return 'CLEAR';
}

function openTaskEditModal_(milestoneId, taskId, restoreFocusEl = null){
  const target = taskEditFindTarget_(null, milestoneId, taskId);
  if(!target) return;

  taskEditModalState_.projectId = target.p.id;
  taskEditModalState_.milestoneId = target.m.id;
  taskEditModalState_.taskId = target.t.id;
  taskEditModalState_.restoreFocusEl = restoreFocusEl || document.activeElement || null;

  if(ui.taskEditTitle) ui.taskEditTitle.value = String(target.t.title || '');
  if(ui.taskEditSeverity) ui.taskEditSeverity.value = String(target.t.severity || 'normal');
  if(ui.taskEditAssignee) ui.taskEditAssignee.value = String(target.t.assignee || '');
  if(ui.taskEditDue) ui.taskEditDue.value = taskTsToDateInput_(target.t.dueAt);

  syncTaskEditModalUx_();
  ui.taskEditModal?.classList.add('is-open');
  document.body.classList.add('pm-task-modal-open');
  ui.taskEditModal?.setAttribute('aria-hidden', 'false');

  requestAnimationFrame(() => {
    ui.taskEditTitle?.focus();
    ui.taskEditTitle?.select?.();
  });
}

function closeTaskEditModal({ restoreFocus = true } = {}){
  ui.taskEditModal?.classList.remove('is-open');
  document.body.classList.remove('pm-task-modal-open');
  ui.taskEditModal?.setAttribute('aria-hidden', 'true');
  if(restoreFocus){
    const el = taskEditModalState_.restoreFocusEl;
    if(el && typeof el.focus === 'function' && document.contains(el)) el.focus();
    else ui.taskList?.focus?.();
  }
  taskEditModalState_.restoreFocusEl = null;
}

function syncTaskEditModalUx_(){
  const target = taskEditFindTarget_(taskEditModalState_.projectId, taskEditModalState_.milestoneId, taskEditModalState_.taskId);
  const p = target?.p || null;
  const m = target?.m || null;
  const t = target?.t || null;
  const title = String(ui?.taskEditTitle?.value || '').trim();
  const assignee = String(ui?.taskEditAssignee?.value || '').trim();
  const severity = String(ui?.taskEditSeverity?.value || t?.severity || 'normal');
  const dueTs = taskDateInputToTs_(ui?.taskEditDue?.value || '');
  const dueText = dueTs ? taskAddFmtDate_(dueTs) : '';
  const stepStats = countSteps_(t?.steps || []);
  const risk = taskEditRiskLabel_(m, { ...(t || {}), severity, dueAt: dueTs || null });
  const createdText = t?.createdAt ? taskAddFmtDate_(t.createdAt) : '—';

  if(ui.taskEditScopeProject){
    ui.taskEditScopeProject.textContent = p ? String(p.name || 'Untitled Project') : 'No task selected';
  }
  if(ui.taskEditScopeMilestone){
    ui.taskEditScopeMilestone.textContent = (p && m && t)
      ? `${String(m.title || 'Untitled Milestone')} • ${Array.isArray(m.tasks) ? m.tasks.length : 0} task${Array.isArray(m.tasks) && m.tasks.length === 1 ? '' : 's'} in lane`
      : 'Choose a task from the Checklist lane to open its details panel.';
  }
  if(ui.taskEditScopeSteps) ui.taskEditScopeSteps.textContent = `${stepStats.done} / ${stepStats.total}`;
  if(ui.taskEditScopeRisk) ui.taskEditScopeRisk.textContent = risk;
  if(ui.taskEditScopeCreated) ui.taskEditScopeCreated.textContent = createdText;

  if(ui.taskEditDraftTitle) ui.taskEditDraftTitle.textContent = title || 'Awaiting task title';
  if(ui.taskEditDraftMeta){
    const parts = [];
    parts.push(taskEditSeverityMeta_(severity));
    parts.push(assignee ? `Owner: ${assignee}.` : 'Owner is still open.');
    parts.push(dueText ? `Target due: ${dueText}.` : 'No due date set yet.');
    if(t?.done) parts.push('Task is currently marked done.');
    else if(stepStats.total > 0) parts.push(`Steps complete: ${stepStats.done}/${stepStats.total}.`);
    ui.taskEditDraftMeta.textContent = parts.join(' ');
  }
  if(ui.taskEditDraftChips){
    const chips = [
      `<span class="badge ${severity === 'high' ? 'pm-task-draft__chip pm-task-draft__chip--high' : severity === 'blocker' ? 'pm-task-draft__chip pm-task-draft__chip--blocker' : 'pm-task-draft__chip pm-task-draft__chip--normal'}">${escapeHtml(taskAddSeverityLabel_(severity))}</span>`,
      `<span class="badge pm-task-draft__chip ${assignee ? 'pm-task-draft__chip--assigned' : 'pm-task-draft__chip--open'}">${escapeHtml(assignee ? `OWNER ${assignee}` : 'OWNER OPEN')}</span>`,
      `<span class="badge pm-task-draft__chip ${dueText ? (risk === 'OVERDUE' || risk === 'DUE TODAY' ? 'pm-task-draft__chip--risk' : 'pm-task-draft__chip--due') : 'pm-task-draft__chip--open'}">${escapeHtml(dueText ? `DUE ${dueText}` : 'DUE OPEN')}</span>`,
      `<span class="badge pm-task-draft__chip ${t?.done ? 'pm-task-draft__chip--done' : risk === 'CLEAR' ? 'pm-task-draft__chip--clear' : 'pm-task-draft__chip--warn'}">${escapeHtml(risk)}</span>`
    ];
    if(stepStats.total > 0) chips.push(`<span class="badge pm-task-draft__chip pm-task-draft__chip--clear">${escapeHtml(`STEPS ${stepStats.done}/${stepStats.total}`)}</span>`);
    ui.taskEditDraftChips.innerHTML = chips.join('');
  }
  if(ui.taskEditModalTitle){
    ui.taskEditModalTitle.textContent = t
      ? `Refine “${String(t.title || 'Untitled Task')}” without losing checklist context.`
      : 'Refine the active task without losing checklist context.';
  }
  if(ui.taskEditModalNote){
    if(!t || !m){
      ui.taskEditModalNote.innerHTML = 'Choose a task from the <b>Checklist</b> lane to load its details, then save when the execution brief feels clear.';
    }else if(t.done){
      ui.taskEditModalNote.innerHTML = `This task is already marked <b>done</b>. Use this panel for title, owner, severity, or due-date cleanup without reopening the checklist card.`;
    }else if(risk === 'BLOCKED' || risk === 'OVERDUE' || risk === 'DUE TODAY'){
      ui.taskEditModalNote.innerHTML = `This task is currently in a <b>${escapeHtml(risk.toLowerCase())}</b> state. Tighten the owner, severity, and due date so the queue broadcasts the right urgency.`;
    }else if(stepStats.total > 0){
      ui.taskEditModalNote.innerHTML = `This task has <b>${stepStats.total}</b> execution step${stepStats.total === 1 ? '' : 's'}. Keep the title outcome-focused so the step stack stays easy to understand.`;
    }else{
      ui.taskEditModalNote.innerHTML = `Use this panel to sharpen the task brief for <b>${escapeHtml(String(m.title || 'this milestone'))}</b>. Crisp wording and clear ownership keep the checklist scan fast.`;
    }
  }
}

function saveTaskEditModal_(){
  const target = taskEditFindTarget_(taskEditModalState_.projectId, taskEditModalState_.milestoneId, taskEditModalState_.taskId);
  if(!target){
    closeTaskEditModal({ restoreFocus:false });
    return;
  }

  const oldTitle = String(target.t.title || '');
  const oldSeverity = String(target.t.severity || 'normal');
  const oldAssignee = String(target.t.assignee || '');
  const oldDueAt = Number(target.t.dueAt || 0) || 0;

  const newTitle = String(ui?.taskEditTitle?.value || '').trim() || oldTitle;
  const newSeverityRaw = String(ui?.taskEditSeverity?.value || oldSeverity);
  const newSeverity = (newSeverityRaw === 'high' || newSeverityRaw === 'blocker') ? newSeverityRaw : 'normal';
  const newAssignee = String(ui?.taskEditAssignee?.value || '').trim();
  const newDueAt = taskDateInputToTs_(ui?.taskEditDue?.value || '');

  target.t.title = newTitle;
  target.t.severity = newSeverity;
  target.t.assignee = newAssignee;
  target.t.dueAt = newDueAt || null;

  if(newTitle !== oldTitle) addActivity(`Renamed task: ${oldTitle} → ${newTitle}`);
  if(newSeverity !== oldSeverity) addActivity(`Updated severity: ${newTitle} → ${newSeverity.toUpperCase()}`);
  if(newAssignee !== oldAssignee) addActivity(`Updated assignee: ${newTitle} → ${newAssignee || 'Unassigned'}`);
  if((newDueAt || 0) !== oldDueAt){
    addActivity(`Updated due date: ${newTitle} → ${newDueAt ? taskAddFmtDate_(newDueAt) : 'Cleared'}`);
  }

  saveState();
  closeTaskEditModal({ restoreFocus:false });
  renderAll();
}

window.syncTaskAddModalUx_ = syncTaskAddModalUx_;
window.openTaskEditModal_ = openTaskEditModal_;
window.syncTaskEditModalUx_ = syncTaskEditModalUx_;
