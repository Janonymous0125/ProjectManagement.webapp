/* ---------------------------
   Render
---------------------------- */
function renderAll(){
  const selectionChanged = reconcileActiveSelection_();
  if(selectionChanged) saveState();

  const p = getActiveProject();
  const mod = p ? getActiveModule(p) : null;
  const m = p ? getActiveMilestone(p) : null;

  ui.activeProjectName.textContent = p ? p.name : "—";
  ui.activeModuleName.textContent = mod ? mod.name : "—";
  ui.activeMilestoneName.textContent = m ? m.title : "—";

  renderDashboard();
  renderProjects();
  renderMilestones();
  renderChecklist();

  // update sidebar stats
  const counts = computeCounts();
  animateNumber(ui.statProjects, counts.projects);
  animateNumber(ui.statMilestones, counts.milestones);
  animateNumber(ui.statTasks, counts.tasks);

  // refresh radar blips
  refreshRadarBlips(counts);

  updateUndoRedoUi_();
}

function renderProjects(){
  // list
  ui.projectList.innerHTML = "";
  for(const p of state.projects){
    const c = computeProjectCounts(p);
    const pct = c.tasks ? (c.done / c.tasks) * 100 : 0;
    const el = document.createElement("div");
    el.className = "item " + (state.activeProjectId === p.id ? "is-active" : "");
    el.innerHTML = `
      <div class="item__title">${escapeHtml(p.name)}</div>
      <div class="item__sub">
        <span class="badge">${p.status.toUpperCase()}</span>
        ${p.tag ? `<span class="badge">${escapeHtml(p.tag)}</span>` : ""}
        <span class="badge">${c.milestones} MS</span>
        <span class="badge">${c.done}/${c.tasks}</span>
        <span class="badge">${fmtPct(pct)}</span>
      </div>
    `;
    el.addEventListener("click", () => setActiveProject(p.id));
    el.addEventListener("dblclick", () => {
      setActiveProject(p.id);
      openProjectDetailsModal();
    });
    ui.projectList.appendChild(el);
  }
  if(!state.projects.length){
    ui.projectList.innerHTML = `<div class="hint">No projects yet. Create one or import.</div>`;
  }

  // launcher + details modal
  const ap = getActiveProject();

  if(ui.btnOpenProjectDetails){
    ui.btnOpenProjectDetails.disabled = !ap;
    ui.btnOpenProjectDetails.title = ap ? `Open details for ${ap.name}` : "Select a project first";
  }

  if(ui.projectDetailsActiveName){
    ui.projectDetailsActiveName.textContent = ap ? ap.name : "Select a project…";
  }

  if(ui.projectDetailsActiveMeta){
    if(!ap){
      ui.projectDetailsActiveMeta.textContent = "Pick a project from the list to manage its details.";
    } else {
      const c = computeProjectCounts(ap);
      const bits = [
        ap.status ? `Status: ${String(ap.status).toUpperCase()}` : "",
        ap.tag ? `Tag: ${ap.tag}` : "Tag: —",
        `${c.milestones} milestone(s)`,
        `${c.done}/${c.tasks} task(s)`,
      ].filter(Boolean);
      ui.projectDetailsActiveMeta.textContent = bits.join(" • ");
    }
  }

  if(ui.projectDetailsModalTitle){
    ui.projectDetailsModalTitle.textContent = ap ? `Editing ${ap.name}` : "Edit the active project in this popup.";
  }

  if(!ap){
    ui.projectName.value = "";
    ui.projectDesc.value = "";
    ui.projectStatus.value = "active";
    ui.projectTag.value = "";
    ui.projectMilestoneCount.textContent = "0";
    ui.projectTaskCount.textContent = "0";
    return;
  }

  ui.projectName.value = ap.name;
  ui.projectDesc.value = ap.desc;
  ui.projectStatus.value = ap.status;
  ui.projectTag.value = ap.tag;

  const c = computeProjectCounts(ap);
  ui.projectMilestoneCount.textContent = String(c.milestones);
  ui.projectTaskCount.textContent = `${c.done}/${c.tasks}`;
}

function renderMilestones(){

  ui.moduleList.innerHTML = "";
  ui.milestoneList.innerHTML = "";

  ui.moduleName.value = "";
  ui.moduleName.disabled = true;
  ui.moduleDesc.value = "";
  ui.moduleDesc.disabled = true;
  ui.moduleStatus.value = "todo";
  ui.moduleStatus.disabled = true;
  ui.moduleTag.value = "";
  ui.moduleTag.disabled = true;
  ui.btnSaveModule.disabled = true;
  ui.btnDeleteModule.disabled = true;
  ui.moduleMilestoneCount.textContent = "0";
  ui.moduleTaskCount.textContent = "0";
  ui.moduleCompletion.textContent = "0%";

  const p = getActiveProject();
  if(!p){
    ui.moduleList.innerHTML = `<div class="hint">Select a project first.</div>`;
    ui.milestoneList.innerHTML = `<div class="hint">Select a project first.</div>`;
    ui.milestoneScopeHint.textContent = "For the active module.";

    if(ui.btnOpenModuleDetails){
      ui.btnOpenModuleDetails.disabled = true;
      ui.btnOpenModuleDetails.title = "Select a project first";
    }
    if(ui.moduleDetailsActiveName) ui.moduleDetailsActiveName.textContent = "Select a module…";
    if(ui.moduleDetailsActiveMeta) ui.moduleDetailsActiveMeta.textContent = "Pick a module to manage details in the popup.";
    if(ui.moduleDetailsModalTitle) ui.moduleDetailsModalTitle.textContent = "Edit the active module in this popup.";

    if(ui.btnOpenMilestoneDetails){
      ui.btnOpenMilestoneDetails.disabled = true;
      ui.btnOpenMilestoneDetails.title = "Select a project first";
    }
    if(ui.milestoneDetailsActiveName) ui.milestoneDetailsActiveName.textContent = "Select a milestone…";
    if(ui.milestoneDetailsActiveMeta) ui.milestoneDetailsActiveMeta.textContent = "Pick a module and milestone to manage details in the popup.";
    if(ui.milestoneDetailsModalTitle) ui.milestoneDetailsModalTitle.textContent = "Edit the active milestone in this popup.";

    ui.milestoneTitle.value = "";
    ui.milestoneTitle.disabled = true;
    ui.milestoneNotes.value = "";
    ui.milestoneNotes.disabled = true;
    ui.milestonePriority.value = "p2";
    ui.milestonePriority.disabled = true;
    ui.milestoneState.value = "todo";
    ui.milestoneState.disabled = true;
    ui.btnSaveMilestone.disabled = true;
    ui.btnDeleteMilestone.disabled = true;
    ui.milestoneTaskCount.textContent = "0";
    ui.milestoneCompletion.textContent = "0%";
    return;
  }

  const mods = Array.isArray(p.modules) ? p.modules : [];
  if(!mods.length){
    ui.moduleList.innerHTML = `<div class="hint">No modules yet. Create one.</div>`;
    ui.milestoneList.innerHTML = `<div class="hint">No milestones yet.</div>`;
    ui.milestoneScopeHint.textContent = `${p.name} • No module selected`;

    if(ui.btnOpenModuleDetails){
      ui.btnOpenModuleDetails.disabled = true;
      ui.btnOpenModuleDetails.title = "Create a module first";
    }
    if(ui.moduleDetailsActiveName) ui.moduleDetailsActiveName.textContent = p.name;
    if(ui.moduleDetailsActiveMeta) ui.moduleDetailsActiveMeta.textContent = "Create a module to manage details in the popup.";
    if(ui.moduleDetailsModalTitle) ui.moduleDetailsModalTitle.textContent = `Editing ${p.name}`;

    if(ui.btnOpenMilestoneDetails){
      ui.btnOpenMilestoneDetails.disabled = true;
      ui.btnOpenMilestoneDetails.title = "Create a module first";
    }
    if(ui.milestoneDetailsActiveName) ui.milestoneDetailsActiveName.textContent = p.name;
    if(ui.milestoneDetailsActiveMeta) ui.milestoneDetailsActiveMeta.textContent = "Create a module and milestone to manage details in the popup.";
    if(ui.milestoneDetailsModalTitle) ui.milestoneDetailsModalTitle.textContent = "Edit the active milestone in this popup.";

    ui.milestoneTitle.value = "";
    ui.milestoneTitle.disabled = true;
    ui.milestoneNotes.value = "";
    ui.milestoneNotes.disabled = true;
    ui.milestonePriority.value = "p2";
    ui.milestonePriority.disabled = true;
    ui.milestoneState.value = "todo";
    ui.milestoneState.disabled = true;
    ui.btnSaveMilestone.disabled = true;
    ui.btnDeleteMilestone.disabled = true;
    ui.milestoneTaskCount.textContent = "0";
    ui.milestoneCompletion.textContent = "0%";
    return;
  }

  const countModuleStats = (mod) => {
    const milestoneList = Array.isArray(mod?.milestones) ? mod.milestones : [];
    let tasks = 0;
    let done = 0;
    for(const ms of milestoneList){
      const ts = Array.isArray(ms?.tasks) ? ms.tasks : [];
      tasks += ts.length;
      done += ts.filter(t => t && t.done).length;
    }
    const pct = tasks ? (done / tasks) * 100 : 0;
    return { milestones: milestoneList.length, tasks, done, pct };
  };

  const activeMod = getActiveModule(p);

  // Modules list (selectable)
  for(const mod of mods){
    const c = countModuleStats(mod);

    const el = document.createElement("div");
    el.className = "item " + (activeMod && mod.id === activeMod.id ? "is-active" : "");
    el.innerHTML = `
      <div class="item__title">${escapeHtml(mod.name)}</div>
      <div class="item__sub">
        <span class="badge">${String(mod.status || "todo").toUpperCase()}</span>
        ${mod.tag ? `<span class="badge">${escapeHtml(mod.tag)}</span>` : ""}
        <span class="badge">${c.milestones} MS</span>
        <span class="badge">${c.done}/${c.tasks}</span>
        <span class="badge">${fmtPct(c.pct)}</span>
      </div>
    `;
    el.addEventListener("click", () => setActiveModule(mod.id));
    el.addEventListener("dblclick", () => {
      setActiveModule(mod.id);
      openModuleDetailsModal();
    });
    ui.moduleList.appendChild(el);
  }

  if(ui.btnOpenModuleDetails){
    ui.btnOpenModuleDetails.disabled = !activeMod;
    ui.btnOpenModuleDetails.title = activeMod ? `Open details for ${activeMod.name}` : "Select a module first";
  }

  if(ui.moduleDetailsActiveName){
    ui.moduleDetailsActiveName.textContent = activeMod ? activeMod.name : "Select a module…";
  }

  if(ui.moduleDetailsActiveMeta){
    if(!activeMod){
      ui.moduleDetailsActiveMeta.textContent = "Pick a module to manage details in the popup.";
    } else {
      const c = countModuleStats(activeMod);
      const bits = [
        `Status: ${String(activeMod.status || "todo").toUpperCase()}`,
        activeMod.tag ? `Tag: ${activeMod.tag}` : "",
        `${c.milestones} milestone(s)` ,
        `${c.done}/${c.tasks} task(s)` ,
        fmtPct(c.pct),
        activeMod.desc ? activeMod.desc : "",
      ].filter(Boolean);
      ui.moduleDetailsActiveMeta.textContent = bits.join(" • ");
    }
  }

  if(ui.moduleDetailsModalTitle){
    ui.moduleDetailsModalTitle.textContent = activeMod ? `Editing ${activeMod.name}` : "Edit the active module in this popup.";
  }

  if(activeMod){
    const c = countModuleStats(activeMod);
    ui.moduleName.disabled = false;
    ui.moduleDesc.disabled = false;
    ui.moduleStatus.disabled = false;
    ui.moduleTag.disabled = false;
    ui.btnSaveModule.disabled = false;
    ui.btnDeleteModule.disabled = false;
    ui.moduleName.value = activeMod.name;
    ui.moduleDesc.value = String(activeMod.desc || "");
    ui.moduleStatus.value = activeMod.status || "todo";
    ui.moduleTag.value = String(activeMod.tag || "");
    ui.moduleMilestoneCount.textContent = String(c.milestones);
    ui.moduleTaskCount.textContent = String(c.tasks);
    ui.moduleCompletion.textContent = fmtPct(c.pct);
  }

  ui.milestoneScopeHint.textContent = activeMod ? `${p.name} • ${activeMod.name}` : `${p.name}`;

  const active = getActiveMilestone(p);
  const msList = activeMod ? (Array.isArray(activeMod.milestones) ? activeMod.milestones : []) : [];

  for(const ms of msList){
    const c = computeMilestoneCounts(ms);
    const el = document.createElement("div");
    el.className = "item " + (active && ms.id === active.id ? "is-active" : "");
    el.innerHTML = `
      <div class="item__title">${escapeHtml(ms.title)}</div>
      <div class="item__sub">
        <span class="badge">${ms.priority.toUpperCase()}</span>
        <span class="badge">${ms.state.toUpperCase()}</span>
        <span class="badge">${c.done}/${c.tasks}</span>
        <span class="badge">${fmtPct(c.pct)}</span>
      </div>
    `;
    el.addEventListener("click", () => setActiveMilestone(ms.id));
    el.addEventListener("dblclick", () => {
      setActiveMilestone(ms.id);
      openMilestoneDetailsModal();
    });
    ui.milestoneList.appendChild(el);
  }

  if(!msList.length){
    ui.milestoneList.innerHTML = `<div class="hint">No milestones yet.</div>`;
  }

  if(ui.btnOpenMilestoneDetails){
    ui.btnOpenMilestoneDetails.disabled = !active;
    ui.btnOpenMilestoneDetails.title = active ? `Open details for ${active.title}` : "Select a milestone first";
  }

  if(ui.milestoneDetailsActiveName){
    ui.milestoneDetailsActiveName.textContent = active ? active.title : "Select a milestone…";
  }

  if(ui.milestoneDetailsActiveMeta){
    if(!activeMod){
      ui.milestoneDetailsActiveMeta.textContent = "Pick a module and milestone to manage details in the popup.";
    } else if(!active){
      ui.milestoneDetailsActiveMeta.textContent = `Module: ${activeMod.name} • Create or select a milestone to edit details.`;
    } else {
      const c = computeMilestoneCounts(active);
      const bits = [
        `Module: ${activeMod.name}`,
        `Priority: ${String(active.priority || "p2").toUpperCase()}`,
        `State: ${String(active.state || "todo").toUpperCase()}`,
        `${c.done}/${c.tasks} task(s)`,
        fmtPct(c.pct),
      ].filter(Boolean);
      ui.milestoneDetailsActiveMeta.textContent = bits.join(" • ");
    }
  }

  if(ui.milestoneDetailsModalTitle){
    ui.milestoneDetailsModalTitle.textContent = active ? `Editing ${active.title}` : "Edit the active milestone in this popup.";
  }

  if(!active){
    ui.milestoneTitle.value = "";
    ui.milestoneTitle.disabled = true;
    ui.milestoneNotes.value = "";
    ui.milestoneNotes.disabled = true;
    ui.milestonePriority.value = "p2";
    ui.milestonePriority.disabled = true;
    ui.milestoneState.value = "todo";
    ui.milestoneState.disabled = true;
    ui.btnSaveMilestone.disabled = true;
    ui.btnDeleteMilestone.disabled = true;
    ui.milestoneTaskCount.textContent = "0";
    ui.milestoneCompletion.textContent = "0%";
    return;
  }

  ui.milestoneTitle.disabled = false;
  ui.milestoneNotes.disabled = false;
  ui.milestonePriority.disabled = false;
  ui.milestoneState.disabled = false;
  ui.btnSaveMilestone.disabled = false;
  ui.btnDeleteMilestone.disabled = false;
  ui.milestoneTitle.value = active.title;
  ui.milestoneNotes.value = active.notes;
  ui.milestonePriority.value = active.priority;
  ui.milestoneState.value = active.state;

  const c = computeMilestoneCounts(active);
  ui.milestoneTaskCount.textContent = String(c.tasks);
  ui.milestoneCompletion.textContent = fmtPct(c.pct);
}

function renderChecklist(){
  ui.taskList.innerHTML = "";

  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;

  if(ui.btnOpenTaskAdd){
    ui.btnOpenTaskAdd.disabled = !p || !m;
    ui.btnOpenTaskAdd.title = (!p || !m)
      ? "Select a project and milestone first"
      : `Add a task to ${m.title}`;
  }

  if(ui.taskAddModalTitle){
    if(!p || !m) ui.taskAddModalTitle.textContent = "Create a task for the active milestone.";
    else ui.taskAddModalTitle.textContent = `Add a task to ${p.name} • ${m.title}`;
  }

  if(!p){
    ui.taskScopeHint.textContent = "Select a project first.";
    ui.taskList.innerHTML = `<div class="hint">No project selected.</div>`;
    return;
  }
  if(!m){
    ui.taskScopeHint.textContent = "Select a milestone first.";
    ui.taskList.innerHTML = `<div class="hint">No milestone selected.</div>`;
    return;
  }

  ui.taskScopeHint.textContent = `${p.name} • ${m.title}`;

  for(const t of m.tasks){
    if(!Array.isArray(t.steps)) t.steps = [];
    t.steps = autoNestStepsIfNeeded_(t.steps);
    const stepStats = countSteps_(t.steps);
    const stepsDone = stepStats.done;
    const stepsTotal = stepStats.total;
    const isOpen = expandedSteps.has(t.id);

    const el = document.createElement("div");
    el.className = "task " + (t.done ? "is-done" : "");
    el.innerHTML = `
      <div class="task__check" title="Toggle done"></div>
      <div class="task__body">
        <div class="task__title">${escapeHtml(t.title)}</div>
        <div class="task__meta">
          <span class="badge ${t.severity !== "normal" ? "badge--warn" : ""}">${t.severity.toUpperCase()}</span>
          ${t.assignee ? `<span class="badge">${escapeHtml(t.assignee)}</span>` : ""}
          <span class="badge">${new Date(t.createdAt).toLocaleDateString()}</span>
          <button class="steps__toggle ${isOpen ? "is-open" : ""}" data-act="toggleSteps" type="button" title="Toggle steps">
            <span class="steps__label">STEPS</span>
            <span class="steps__count">${stepsDone}/${stepsTotal}</span>
            <span class="steps__chev">${isOpen ? "▾" : "▸"}</span>
          </button>
        </div>

        <div class="steps ${isOpen ? "is-open" : ""}">
          <div class="steps__list">
            ${renderStepsHtml_(t.steps)}
            ${!t.steps.length ? `<div class="hint hint--mini">No steps yet. Add the first one below.</div>` : ""}
          </div>

          <div class="steps__add">
            <input class="input steps__input" type="text" placeholder="Add a step…" value="" />
            <button class="btn btn--mini" type="button" data-act="addStep">Add</button>
          </div>
        </div>
      </div>
      <div class="task__actions">
        <button class="iconbtn" title="Edit task" data-act="editTask">✎</button>
        <button class="iconbtn" title="Raise severity" data-act="raise">↑</button>
        <button class="iconbtn" title="Delete task" data-act="del">×</button>
      </div>
    `;

    el.querySelector(".task__check").addEventListener("click", () => {
      t.done = !t.done;
      addActivity(`${t.done ? "Completed" : "Reopened"} task: ${t.title}`);
      saveState();
      renderAll();
      safeAnime(() => {
        const { animate } = anime;
        animate({ targets: el, scale: [1, 1.02, 1], duration: 260, easing:"easeOutQuad" });
      });
    });

    

    el.querySelector('[data-act="editTask"]').addEventListener("click", () => {
      // Inline edit: title + severity + assignee
      const titleEl = el.querySelector(".task__title");
      const metaEl = el.querySelector(".task__meta");
      const actionsEl = el.querySelector(".task__actions");
      if(!titleEl || !metaEl || !actionsEl) return;

      const oldTitle = t.title;
      const oldSev = t.severity;
      const oldAssignee = t.assignee;

      // Title input
      const titleInput = document.createElement("input");
      titleInput.type = "text";
      titleInput.className = "input task__edit";
      titleInput.value = oldTitle;

      // Severity select
      const sevSelect = document.createElement("select");
      sevSelect.className = "input task__editSelect";
      ["normal","high","blocker"].forEach(v => {
        const opt = document.createElement("option");
        opt.value = v;
        opt.textContent = v.toUpperCase();
        if(v === oldSev) opt.selected = true;
        sevSelect.appendChild(opt);
      });

      // Assignee input
      const assigneeInput = document.createElement("input");
      assigneeInput.type = "text";
      assigneeInput.className = "input task__editAssignee";
      assigneeInput.placeholder = "Assignee…";
      assigneeInput.value = oldAssignee || "";

      // Keep createdAt badge
      const dateBadge = document.createElement("span");
      dateBadge.className = "badge";
      dateBadge.textContent = new Date(t.createdAt).toLocaleDateString();

      // Swap UI
      titleEl.replaceWith(titleInput);
      metaEl.innerHTML = "";
      metaEl.appendChild(sevSelect);
      metaEl.appendChild(assigneeInput);
      metaEl.appendChild(dateBadge);

      // Actions: save / cancel (disable other actions while editing)
      actionsEl.innerHTML = `
        <button class="iconbtn" title="Save" data-act="saveEdit">✔</button>
        <button class="iconbtn" title="Cancel" data-act="cancelEdit">↩</button>
      `;

      const commit = () => {
        const newTitle = titleInput.value.trim() || oldTitle;
        const newSev = /** @type any */(sevSelect.value);
        const newAssignee = assigneeInput.value.trim();

        const changedTitle = newTitle !== oldTitle;
        const changedSev = newSev !== oldSev;
        const changedAsg = newAssignee !== (oldAssignee || "");

        t.title = newTitle;
        t.severity = (newSev === "high" || newSev === "blocker") ? newSev : "normal";
        t.assignee = newAssignee;

        if(changedTitle) addActivity(`Renamed task: ${oldTitle} → ${newTitle}`);
        if(changedSev) addActivity(`Updated severity: ${newTitle} → ${t.severity.toUpperCase()}`);
        if(changedAsg) addActivity(`Updated assignee: ${newTitle} → ${newAssignee || "Unassigned"}`);

        saveState();
        renderChecklist();
      };

      const cancel = () => {
        // Restore original values without saving
        t.title = oldTitle;
        t.severity = oldSev;
        t.assignee = oldAssignee;
        renderChecklist();
      };

      const onKey = (e) => {
        if(e.key === "Enter"){ e.preventDefault(); commit(); }
        if(e.key === "Escape"){ e.preventDefault(); cancel(); }
      };

      [titleInput, sevSelect, assigneeInput].forEach(inp => inp.addEventListener("keydown", onKey));

      actionsEl.querySelector('[data-act="saveEdit"]').addEventListener("click", commit);
      actionsEl.querySelector('[data-act="cancelEdit"]').addEventListener("click", cancel);

      // Focus title
      titleInput.focus();
      titleInput.select();
    });
el.querySelector('[data-act="del"]').addEventListener("click", async () => {
      const ok = await pmConfirmDialog_(`Delete task "${t.title}"?`, { title:'Delete Task', okText:'Delete', danger:true });
      if(!ok) return;
      m.tasks = m.tasks.filter(x => x.id !== t.id);
      expandedSteps.delete(t.id);
      addActivity(`Deleted task: ${t.title}`);
      saveState();
      renderAll();
    });

    el.querySelector('[data-act="raise"]').addEventListener("click", () => {
      t.severity = (t.severity === "normal") ? "high" : (t.severity === "high") ? "blocker" : "blocker";
      addActivity(`Raised severity: ${t.title} → ${t.severity}`);
      saveState();
      renderAll();
    });

    el.querySelector('[data-act="toggleSteps"]').addEventListener("click", () => {
      if(expandedSteps.has(t.id)) expandedSteps.delete(t.id);
      else expandedSteps.add(t.id);
      renderChecklist();
    });

    const input = el.querySelector(".steps__input");
    const addBtn = el.querySelector('[data-act="addStep"]');

    const addStep = () => {
      const text = input.value.trim();
      if(!text) return;
      insertStepByNumbering_(t.steps, { id: uid(), text, done: false, children: [] });
      input.value = "";
      expandedSteps.add(t.id);
      addActivity(`Added step: ${text}`);
      saveState();
      renderChecklist();
    };

    addBtn.addEventListener("click", addStep);
    input.addEventListener("keydown", (e) => {
      if(e.key === "Enter"){ e.preventDefault(); addStep(); }
    });

    el.querySelectorAll(".step").forEach(row => {
      const stepId = row.getAttribute("data-step-id");
      const found = findStepById_(t.steps, stepId);
      const step = found ? found.step : null;
      if(!step) return;

      row.querySelector(".step__check").addEventListener("click", () => {
        step.done = !step.done;
        saveState();
        renderChecklist();
      });

      row.querySelector(".step__edit").addEventListener("click", () => {
        const textEl = row.querySelector(".step__text");
        if(!textEl) return;

        const old = step.text;
        const input = document.createElement("input");
        input.type = "text";
        input.className = "input step__editInput";
        input.value = old;

        textEl.replaceWith(input);
        input.focus();
        input.select();

        const commit = () => {
          const v = input.value.trim();
          step.text = v ? v : old;
          if(step.text !== old) addActivity(`Edited step: ${old} → ${step.text}`);
          t.steps = rebuildStepsByNumbering_(t.steps);
          saveState();
          renderChecklist();
        };
        const cancel = () => { renderChecklist(); };

        input.addEventListener("keydown", (e) => {
          if(e.key === "Enter"){ e.preventDefault(); commit(); }
          if(e.key === "Escape"){ e.preventDefault(); cancel(); }
        });
        input.addEventListener("blur", commit, { once:true });
      });

      row.querySelector(".step__del").addEventListener("click", () => {
        if(found) found.list.splice(found.index, 1);
        saveState();
        renderChecklist();
      });
    });

    ui.taskList.appendChild(el);
  }

  if(!m.tasks.length){
    ui.taskList.innerHTML = `<div class="hint">No tasks yet. Click <b>Add Task</b> to create one.</div>`;
  }
}

