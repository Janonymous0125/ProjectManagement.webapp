/* ---------------------------
   Dashboard render
---------------------------- */
function renderDashboard(){
  const counts = computeCounts();
  ui.statProjects.textContent = String(counts.projects);
  ui.statMilestones.textContent = String(counts.milestones);
  ui.statTasks.textContent = String(counts.tasks);

  const pct = counts.tasks ? (counts.done / counts.tasks) * 100 : 0;
  ui.pctText.textContent = fmtPct(pct);
  ui.doneText.textContent = `${counts.done} / ${counts.tasks}`;

  // ring: circumference ≈ 2πr = 2*3.1416*46 ≈ 289
  const circ = 289;
  const offset = circ - (circ * (Math.max(0, Math.min(100, pct)) / 100));
  ui.ringProgress.style.strokeDashoffset = String(offset);

  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;

  ui.dashProjectTitle.textContent = p ? p.name : "—";
  if(p){
    const pc = computeProjectCounts(p);
    const ppct = pc.tasks ? (pc.done / pc.tasks) * 100 : 0;
    ui.dashProjectBar.style.width = `${ppct}%`;
    ui.dashProjectMeta.textContent = `${pc.milestones} milestone(s) • ${pc.done}/${pc.tasks} tasks done`;
  } else {
    ui.dashProjectBar.style.width = "0%";
    ui.dashProjectMeta.textContent = "Select or import a project.";
  }

  // Milestone list (top 6)
  ui.dashMilestoneList.innerHTML = "";
  if(p){
    const mods = Array.isArray(p.modules) ? p.modules : [];
    /** @type {{mod:Module, ms:Milestone}[]} */
    const flat = [];
    for(const mod of mods){
      const msList = Array.isArray(mod?.milestones) ? mod.milestones : [];
      for(const ms of msList) flat.push({ mod, ms });
    }

    if(flat.length){
      flat.slice(0, 6).forEach(({ mod, ms }) => {
        const c = computeMilestoneCounts(ms);
        const el = document.createElement("div");
        el.className = "item " + (m && ms.id === m.id ? "is-active" : "");
        el.innerHTML = `
          <div class="item__title">${escapeHtml(ms.title)}</div>
          <div class="item__sub">
            <span class="badge">${escapeHtml(mod?.name || "MODULE")}</span>
            <span class="badge">${ms.priority.toUpperCase()}</span>
            <span class="badge">${ms.state.toUpperCase()}</span>
            <span class="badge">${c.done}/${c.tasks}</span>
          </div>
        `;
        el.addEventListener("click", () => {
          setActiveMilestone(ms.id);
          switchTab("checklist");
        });
        ui.dashMilestoneList.appendChild(el);
      });
    } else {
      ui.dashMilestoneList.innerHTML = `<div class="hint">No milestones yet.</div>`;
    }
  } else {
    ui.dashMilestoneList.innerHTML = `<div class="hint">Select a project to see milestones.</div>`;
  }

  // Activity
  ui.dashActivityList.innerHTML = "";
  if(state.activity.length){
    for(const a of state.activity.slice(0, 10)){
      const el = document.createElement("div");
      el.className = "item";
      el.innerHTML = `
        <div class="item__title">${escapeHtml(a.msg)}</div>
        <div class="item__sub">
          <span class="badge">${new Date(a.ts).toLocaleString()}</span>
        </div>
      `;
      ui.dashActivityList.appendChild(el);
    }
  } else {
    ui.dashActivityList.innerHTML = `<div class="hint">No activity yet.</div>`;
  }

  // Hotlist (blocker/high undone tasks)
  ui.hotlist.innerHTML = "";
  const hot = collectHotTasks(6);
  if(hot.length){
    for(const h of hot){
      const el = document.createElement("div");
      el.className = "hot";
      el.innerHTML = `
        <div class="hot__t">${escapeHtml(h.task.title)}</div>
        <div class="hot__m">
          <b>${escapeHtml(h.project.name)}</b> • ${escapeHtml(h.milestone.title)} • ${h.task.severity.toUpperCase()}
        </div>
      `;
      el.addEventListener("click", () => {
        setActiveProject(h.project.id);
        setActiveMilestone(h.milestone.id);
        switchTab("checklist");
      });
      ui.hotlist.appendChild(el);
    }
  } else {
    ui.hotlist.innerHTML = `<div class="hotlist__empty">No high-priority undone tasks.</div>`;
  }
}

function collectHotTasks(limit){
  /** @type {{project:Project, module:Module, milestone:Milestone, task:Task}[]} */
  const hits = [];
  for(const p of state.projects){
    const mods = Array.isArray(p?.modules) ? p.modules : [];
    for(const mod of mods){
      const msList = Array.isArray(mod?.milestones) ? mod.milestones : [];
      for(const m of msList){
        const ts = Array.isArray(m?.tasks) ? m.tasks : [];
        for(const t of ts){
          if(!t || t.done) continue;
          if(t.severity === "blocker" || t.severity === "high"){
            hits.push({ project:p, module:mod, milestone:m, task:t });
          }
        }
      }
    }
  }
  hits.sort((a,b) => sevRank(b.task.severity) - sevRank(a.task.severity) || b.task.createdAt - a.task.createdAt);
  return hits.slice(0, limit);
}

function sevRank(s){
  if(s === "blocker") return 3;
  if(s === "high") return 2;
  return 1;
}

