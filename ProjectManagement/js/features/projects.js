/* ---------------------------
   Projects
---------------------------- */
let projectDetailsActionMenu_ = null;

function wireProjects(){
  ui.btnNewProject.addEventListener("click", newProject);
  ui.btnOpenProjectDetails?.addEventListener("click", openProjectDetailsModal);
  ui.btnCloseProjectDetails?.addEventListener("click", closeProjectDetailsModal);
  ui.projectDetailsModal?.addEventListener("click", (e) => {
    if(e.target?.dataset?.closeProjectDetails === "1") closeProjectDetailsModal();
  });

  ui.btnSaveProject.addEventListener("click", saveProjectDetails);
  ui.btnDeleteProject.addEventListener("click", deleteActiveProject);
  ui.btnDuplicateProject.addEventListener("click", duplicateActiveProject);

  ensureProjectDetailsActionMenu_();
  document.addEventListener("keydown", handleProjectDetailsModalKeydown_);

  // mark dirty when editing
  [ui.projectName, ui.projectDesc, ui.projectStatus, ui.projectTag].forEach(el => {
    el.addEventListener("input", pulseDirty);
    el.addEventListener("change", pulseDirty);
  });
}

function handleProjectDetailsModalKeydown_(e){
  if(e.defaultPrevented) return;
  if(String(e.key || "") !== "Escape") return;
  if(!ui.projectDetailsModal?.classList.contains("is-open")) return;
  if(projectDetailsActionMenu_?.isOpen?.()) return;
  closeProjectDetailsModal();
}

function ensureProjectDetailsActionMenu_(){
  if(projectDetailsActionMenu_?.root?.isConnected) return projectDetailsActionMenu_;
  const mount = document.getElementById('projectDetailsHeaderMenuMount');
  if(!mount || typeof pmDropdownCreate_ !== 'function') return null;

  const existingRoot = mount.querySelector('.pm-dropdown');
  if(existingRoot?._pmDropdownInstance){
    projectDetailsActionMenu_ = existingRoot._pmDropdownInstance;
    return projectDetailsActionMenu_;
  }

  const duplicateBtn = ui.btnDuplicateProject;
  const deleteBtn = ui.btnDeleteProject;
  if(!duplicateBtn || !deleteBtn) return null;

  const menu = pmDropdownCreate_({
    mount,
    triggerLabel: 'Actions ▾',
    panelMinWidth: 220,
    rootClassName: 'pm-project-modal__actionsMenu',
    triggerClassName: 'pm-project-modal__actionsMenuTrigger',
    panelClassName: 'pm-project-modal__actionsMenuPanel'
  });
  menu.ensureSection('project-actions', 'Project Actions');

  [duplicateBtn, deleteBtn].forEach((btn) => {
    btn.classList.add('pm-dropdown__item');
    btn.setAttribute('role', 'menuitem');
    menu.panel.appendChild(btn);
  });

  projectDetailsActionMenu_ = menu;
  return menu;
}

function openProjectDetailsModal(){
  const p = getActiveProject();
  if(!p){
    ui.btnOpenProjectDetails?.focus();
    return;
  }

  ui.projectDetailsModal?.classList.add("is-open");
  document.body.classList.add("pm-project-modal-open");
  ui.projectDetailsModal?.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => {
    ui.projectName?.focus();
    ui.projectName?.select?.();
  });
}

function closeProjectDetailsModal(){
  projectDetailsActionMenu_?.close?.();
  ui.projectDetailsModal?.classList.remove("is-open");
  document.body.classList.remove("pm-project-modal-open");
  ui.projectDetailsModal?.setAttribute("aria-hidden", "true");
  ui.btnOpenProjectDetails?.focus();
}

async function newProject(){
  const name = await pmPromptDialog_(`Project name?`, `Project ${state.projects.length + 1}`, { title:'New Project', placeholder:'Project name' });
  if(name == null) return;
  const trimmedName = String(name).trim();
  if(!trimmedName) return;

  const mod = mkModule("General");

  /** @type {Project} */
  const p = {
    id: uid(),
    name: trimmedName,
    desc: "",
    status: "active",
    tag: "",
    archived: false,
    modules: [ mod ],
    createdAt: Date.now(),
  };

  state.projects.unshift(p);
  state.activeProjectId = p.id;
  state.activeModuleId = mod.id;
  state.activeMilestoneId = mod.milestones[0]?.id ?? null;

  addActivity(`Created project: ${p.name}`);
  saveState();
  renderAll();

  safeAnime(() => {
    const { animate } = anime;
    animate({ targets: "#projectList .item", opacity:[0,1], translateY:[6,0], duration: 380, easing:"easeOutQuad" });
  });
}

function saveProjectDetails(){
  const p = getActiveProject();
  if(!p) return;

  p.name = ui.projectName.value.trim() || p.name;
  p.desc = ui.projectDesc.value.trim();
  p.status = /** @type any */(ui.projectStatus.value);
  p.tag = ui.projectTag.value.trim();

  addActivity(`Saved project: ${p.name}`);
  saveState();
  renderAll();
}

async function deleteActiveProject(){
  const p = getActiveProject();
  if(!p) return;
  const ok = await pmConfirmDialog_(`Delete project "${p.name}"? (Local PM only)`, { title:'Delete Project', okText:'Delete', danger:true });
  if(!ok) return;

  state.projects = state.projects.filter(x => x.id !== p.id);
  if(state.activeProjectId === p.id){
    state.activeProjectId = state.projects[0]?.id ?? null;
    const np = getActiveProject();
    if(np){
      const firstMod = Array.isArray(np.modules) ? np.modules[0] : null;
      state.activeModuleId = firstMod?.id ?? null;
      state.activeMilestoneId = firstMod?.milestones?.[0]?.id ?? null;
    } else {
      state.activeModuleId = null;
      state.activeMilestoneId = null;
      closeProjectDetailsModal();
    }
  }

  addActivity(`Deleted project: ${p.name}`);
  saveState();
  renderAll();
}

function duplicateActiveProject(){
  const p = getActiveProject();
  if(!p) return;

  const clone = JSON.parse(JSON.stringify(p));
  clone.id = uid();
  clone.name = `${p.name} (Copy)`;
  clone.createdAt = Date.now();

  const regenSteps = (steps) => {
    const arr = Array.isArray(steps) ? steps : [];
    return arr.map(s => ({
      ...s,
      id: uid(),
      children: regenSteps(s?.children),
    }));
  };

  clone.modules = (Array.isArray(clone.modules) ? clone.modules : []).map(mod => {
    mod.id = uid();
    mod.createdAt = Date.now();
    mod.milestones = (Array.isArray(mod.milestones) ? mod.milestones : []).map(ms => {
      ms.id = uid();
      ms.createdAt = Date.now();
      ms.tasks = (Array.isArray(ms.tasks) ? ms.tasks : []).map(t => ({
        ...t,
        id: uid(),
        createdAt: Date.now(),
        steps: regenSteps(t?.steps),
      }));
      return ms;
    });
    return mod;
  });

  state.projects.unshift(clone);
  setActiveProject(clone.id);
  addActivity(`Duplicated project: ${clone.name}`);
  saveState();
  renderAll();
}

function mkModule(name){
  /** @type {Module} */
  return {
    id: uid(),
    name: (name || "Module").trim(),
    desc: "",
    status: "todo",
    tag: "",
    milestones: [ mkMilestone("General") ],
    createdAt: Date.now(),
  };
}

function mkMilestone(title){
  /** @type {Milestone} */
  return {
    id: uid(),
    title,
    notes: "",
    priority: "p2",
    state: "todo",
    tasks: [],
    createdAt: Date.now(),
  };
}

function mkTask(title, done){
  /** @type {Task} */
  return {
    id: uid(),
    title: String(title || "Untitled Task").trim() || "Untitled Task",
    done: Boolean(done),
    severity: "normal",
    assignee: "",
    createdAt: Date.now(),
    steps: [],
  };
}
