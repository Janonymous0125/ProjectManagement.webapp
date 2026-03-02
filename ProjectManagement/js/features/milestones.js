/* ---------------------------
   Milestones
---------------------------- */
let moduleDetailsActionMenu_ = null;

function wireMilestones() {
    ui.btnNewModule.addEventListener("click", async () => {
        const p = getActiveProject();
        if (!p) { alert("Create/select a project first."); return; }

        p.modules = Array.isArray(p.modules) ? p.modules : [];
        const name = await pmPromptDialog_('Module name?', `Module ${p.modules.length + 1}`, { title:'New Module', placeholder:'Module name' });
        if (name == null) return;
        const trimmedName = String(name).trim();
        if (!trimmedName) return;

        const mod = mkModule(trimmedName);
        p.modules.push(mod);
        state.activeModuleId = mod.id;
        state.activeMilestoneId = mod.milestones[0]?.id ?? null;

        addActivity(`Created module: ${mod.name}`);
        saveState();
        renderAll();
    });

    ui.btnNewMilestone.addEventListener("click", async () => {
        const p = getActiveProject();
        if (!p) { alert("Create/select a project first."); return; }
        const mod = getActiveModule(p);
        if (!mod) { alert("Create/select a module first."); return; }

        const title = await pmPromptDialog_('Milestone title?', `Milestone ${mod.milestones.length + 1}`, { title:'New Milestone', placeholder:'Milestone title' });
        if (title == null) return;
        const trimmedTitle = String(title).trim();
        if (!trimmedTitle) return;

        const m = mkMilestone(trimmedTitle);
        mod.milestones.push(m);
        setActiveMilestone(m.id);

        addActivity(`Created milestone: ${m.title}`);
        saveState();
        renderAll();
    });

    ui.btnOpenModuleDetails?.addEventListener("click", openModuleDetailsModal);
    ui.btnCloseModuleDetails?.addEventListener("click", closeModuleDetailsModal);
    ui.moduleDetailsModal?.addEventListener("click", (e) => {
        if (e.target?.dataset?.closeModuleDetails === "1") closeModuleDetailsModal();
    });

    ui.btnSaveModule?.addEventListener("click", () => {
        const p = getActiveProject();
        const mod = p ? getActiveModule(p) : null;
        if (!mod) return;

        mod.name = ui.moduleName.value.trim() || mod.name;
        mod.desc = ui.moduleDesc.value.replace(/\r\n/g, "\n").trimEnd();
        mod.status = /** @type any */(ui.moduleStatus.value);
        mod.tag = ui.moduleTag.value.trim();

        addActivity(`Saved module: ${mod.name}`);
        saveState();
        renderAll();
    });

    ui.btnDeleteModule?.addEventListener("click", async () => {
        const p = getActiveProject();
        if (!p) return;
        const mod = getActiveModule(p);
        if (!mod) return;

        const ok = await pmConfirmDialog_(`Delete module "${mod.name}"?`, { title:'Delete Module', okText:'Delete', danger:true });
        if (!ok) return;

        p.modules = (Array.isArray(p.modules) ? p.modules : []).filter(x => x.id !== mod.id);
        const nextMod = p.modules[0] ?? null;
        state.activeModuleId = nextMod?.id ?? null;
        state.activeMilestoneId = nextMod?.milestones?.[0]?.id ?? null;

        closeModuleDetailsModal({ restoreFocus:false });
        addActivity(`Deleted module: ${mod.name}`);
        saveState();
        renderAll();
    });

    ensureModuleDetailsActionMenu_();

    ui.btnOpenMilestoneDetails?.addEventListener("click", openMilestoneDetailsModal);
    ui.btnCloseMilestoneDetails?.addEventListener("click", closeMilestoneDetailsModal);
    ui.milestoneDetailsModal?.addEventListener("click", (e) => {
        if (e.target?.dataset?.closeMilestoneDetails === "1") closeMilestoneDetailsModal();
    });
    document.addEventListener("keydown", handleMilestoneModalKeydown_);

    ui.btnSaveMilestone.addEventListener("click", () => {
        const p = getActiveProject();
        if (!p) return;
        const m = getActiveMilestone(p);
        if (!m) return;

        m.title = ui.milestoneTitle.value.trim() || m.title;
        m.notes = ui.milestoneNotes.value.trim();
        m.priority = /** @type any */(ui.milestonePriority.value);
        m.state = /** @type any */(ui.milestoneState.value);

        addActivity(`Saved milestone: ${m.title}`);
        saveState();
        renderAll();
    });

    ui.btnDeleteMilestone.addEventListener("click", async () => {
        const p = getActiveProject();
        if (!p) return;
        const mod = getActiveModule(p);
        const m = getActiveMilestone(p);
        if (!mod || !m) return;

        const ok = await pmConfirmDialog_(`Delete milestone "${m.title}"?`, { title:'Delete Milestone', okText:'Delete', danger:true });
        if (!ok) return;

        mod.milestones = mod.milestones.filter(x => x.id !== m.id);
        state.activeMilestoneId = mod.milestones[0]?.id ?? null;

        addActivity(`Deleted milestone: ${m.title}`);
        saveState();
        renderAll();
    });

    [
        ui.moduleName,
        ui.moduleDesc,
        ui.moduleStatus,
        ui.moduleTag,
        ui.milestoneTitle,
        ui.milestoneNotes,
        ui.milestonePriority,
        ui.milestoneState,
    ].forEach(el => {
        el?.addEventListener("input", pulseDirty);
        el?.addEventListener("change", pulseDirty);
    });
}

function ensureModuleDetailsActionMenu_(){
    if(moduleDetailsActionMenu_?.root?.isConnected) return moduleDetailsActionMenu_;
    const mount = document.getElementById('moduleDetailsHeaderMenuMount');
    if(!mount || typeof pmDropdownCreate_ !== 'function') return null;

    const existingRoot = mount.querySelector('.pm-dropdown');
    if(existingRoot?._pmDropdownInstance){
        moduleDetailsActionMenu_ = existingRoot._pmDropdownInstance;
        return moduleDetailsActionMenu_;
    }

    const deleteBtn = ui.btnDeleteModule;
    if(!deleteBtn) return null;

    const menu = pmDropdownCreate_({
        mount,
        triggerLabel: 'Actions ▾',
        panelMinWidth: 220,
        rootClassName: 'pm-module-modal__actionsMenu',
        triggerClassName: 'pm-module-modal__actionsMenuTrigger',
        panelClassName: 'pm-module-modal__actionsMenuPanel'
    });
    menu.ensureSection('module-actions', 'Module Actions');

    deleteBtn.classList.add('pm-dropdown__item');
    deleteBtn.setAttribute('role', 'menuitem');
    menu.panel.appendChild(deleteBtn);

    moduleDetailsActionMenu_ = menu;
    return menu;
}

function handleMilestoneModalKeydown_(e){
    if(e.defaultPrevented) return;
    if(String(e.key || "") !== "Escape") return;

    if(ui.moduleDetailsModal?.classList.contains("is-open")){
        if(moduleDetailsActionMenu_?.isOpen?.()) return;
        closeModuleDetailsModal();
        return;
    }
    if(ui.milestoneDetailsModal?.classList.contains("is-open")){
        closeMilestoneDetailsModal();
    }
}

function openModuleDetailsModal(){
    const p = getActiveProject();
    const mod = p ? getActiveModule(p) : null;
    if(!mod){
        ui.btnOpenModuleDetails?.focus();
        return;
    }

    ensureModuleDetailsActionMenu_();
    ui.moduleDetailsModal?.classList.add("is-open");
    document.body.classList.add("pm-module-modal-open");
    ui.moduleDetailsModal?.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
        if(ui.moduleName && !ui.moduleName.disabled){
            ui.moduleName.focus();
            ui.moduleName.select?.();
            return;
        }
        ui.moduleDesc?.focus();
    });
}

function closeModuleDetailsModal({ restoreFocus = true } = {}){
    moduleDetailsActionMenu_?.close?.();
    ui.moduleDetailsModal?.classList.remove("is-open");
    document.body.classList.remove("pm-module-modal-open");
    ui.moduleDetailsModal?.setAttribute("aria-hidden", "true");
    if(restoreFocus) ui.btnOpenModuleDetails?.focus();
}

function openMilestoneDetailsModal(){
    const p = getActiveProject();
    const m = p ? getActiveMilestone(p) : null;
    if(!m){
        ui.btnOpenMilestoneDetails?.focus();
        return;
    }

    ui.milestoneDetailsModal?.classList.add("is-open");
    document.body.classList.add("pm-milestone-modal-open");
    ui.milestoneDetailsModal?.setAttribute("aria-hidden", "false");

    requestAnimationFrame(() => {
        if(ui.milestoneTitle && !ui.milestoneTitle.disabled){
            ui.milestoneTitle.focus();
            ui.milestoneTitle.select?.();
            return;
        }
        ui.milestoneNotes?.focus();
    });
}

function closeMilestoneDetailsModal(){
    ui.milestoneDetailsModal?.classList.remove("is-open");
    document.body.classList.remove("pm-milestone-modal-open");
    ui.milestoneDetailsModal?.setAttribute("aria-hidden", "true");
    ui.btnOpenMilestoneDetails?.focus();
}
