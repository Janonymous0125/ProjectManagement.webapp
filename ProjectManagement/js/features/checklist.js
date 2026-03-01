/* ---------------------------
   Checklist
---------------------------- */
function wireChecklist(){
  ui.btnOpenTaskAdd?.addEventListener("click", openTaskAddModal);
  ui.btnCloseTaskAdd?.addEventListener("click", closeTaskAddModal);
  ui.taskAddModal?.addEventListener("click", (e) => {
    if(e.target?.dataset?.closeTaskAdd === "1") closeTaskAddModal();
  });
  document.addEventListener("keydown", handleTaskAddModalKeydown_);

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
}

function handleTaskAddModalKeydown_(e){
  if(e.defaultPrevented) return;
  if(String(e.key || "") !== "Escape") return;
  if(!ui.taskAddModal?.classList.contains("is-open")) return;
  closeTaskAddModal();
}

function openTaskAddModal(){
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  if(!p || !m){
    ui.btnOpenTaskAdd?.focus();
    return;
  }

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
