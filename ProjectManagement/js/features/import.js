/* ---------------------------
   Import
---------------------------- */
function wireImport(){
  ui.fileInput.addEventListener("change", () => {
    syncImportSourceMeta_();
  });

  ui.pasteArea.addEventListener("input", () => {
    syncImportSourceMeta_();
  });

  ui.btnParse.addEventListener("click", async () => {
    const text = (ui.pasteArea.value || "").trim();
    const file = ui.fileInput.files?.[0] ?? null;

    let content = "";
    let ext = "txt";
    if(file){
      content = await file.text();
      ext = guessExt(file.name);
    }else{
      content = text;
      ext = guessPastedImportExt_(text);
    }

    if(!content.trim()){
      ui.importMsg.textContent = "Nothing to parse yet.";
      ui.importMsg.title = ui.importMsg.textContent;
      setImportBannerTone_("warn");
      setImportPreviewMode_("Awaiting Parse", "neutral");
      syncImportSourceMeta_();
      return;
    }

    try{
      importCandidate = makeImportCandidate(content, ext);
      renderImportPreview();
      safeAnime(() => pulseImportPreview());
    }catch(err){
      importCandidate = null;
      renderImportPreview();
      ui.importMsg.textContent = `Parse error: ${String(err?.message || err)}`;
      ui.importMsg.title = ui.importMsg.textContent;
      setImportBannerTone_("danger");
      setImportPreviewMode_("Parse Error", "danger");
    }
  });

  ui.btnClearImport.addEventListener("click", () => {
    ui.fileInput.value = "";
    ui.pasteArea.value = "";
    importCandidate = null;
    renderImportPreview();
    ui.importMsg.textContent = "Cleared import buffer.";
    ui.importMsg.title = ui.importMsg.textContent;
    setImportBannerTone_("ok");
    syncImportSourceMeta_();
  });

  ui.btnImport.addEventListener("click", () => {
    if(!importCandidate) return;
    applyImport(importCandidate, { forceNew: false });
  });

  ui.btnImportAsNew.addEventListener("click", () => {
    if(!importCandidate) return;
    applyImport(importCandidate, { forceNew: true });
  });

  // Drag/drop
  const dz = ui.dropzone;
  ["dragenter","dragover"].forEach(evt => dz.addEventListener(evt, (e) => {
    e.preventDefault();
    dz.classList.add("is-hot");
  }));
  ["dragleave","drop"].forEach(evt => dz.addEventListener(evt, (e) => {
    e.preventDefault();
    dz.classList.remove("is-hot");
  }));
  dz.addEventListener("drop", async (e) => {
    const f = e.dataTransfer?.files?.[0];
    if(!f) return;
    if(!/\.md$|\.txt$|\.json$/i.test(f.name)){
      ui.importMsg.textContent = "Only .md, .txt, or .json files are supported.";
      ui.importMsg.title = ui.importMsg.textContent;
      setImportBannerTone_("danger");
      setImportPreviewMode_("Unsupported File", "danger");
      return;
    }
    ui.fileInput.files = e.dataTransfer.files;
    syncImportSourceMeta_();
    const content = await f.text();
    try{
      importCandidate = makeImportCandidate(content, guessExt(f.name));
      renderImportPreview();
      safeAnime(() => pulseImportPreview());
    }catch(err){
      importCandidate = null;
      renderImportPreview();
      ui.importMsg.textContent = `Parse error: ${String(err?.message || err)}`;
      ui.importMsg.title = ui.importMsg.textContent;
      setImportBannerTone_("danger");
      setImportPreviewMode_("Parse Error", "danger");
    }
  });

  syncImportSourceMeta_();
}

function guessExt(name){
  if(/\.json$/i.test(name)) return "json";
  if(/\.md$/i.test(name)) return "md";
  return "txt";
}

function guessPastedImportExt_(text){
  const src = String(text || "").trim();
  if(!src) return "txt";
  if(looksLikeJsonStateText_(src)) return "json";
  return "txt";
}

function describeImportExt_(ext){
  if(ext === "json") return "JSON state restore";
  if(ext === "md") return "Markdown project doc";
  return "Plain text project doc";
}

function syncImportSourceMeta_(){
  const file = ui.fileInput.files?.[0] ?? null;
  const pasted = String(ui.pasteArea.value || "").trim();
  const ext = file ? guessExt(file.name) : guessPastedImportExt_(pasted);
  const sourceText = file
    ? `Selected file: ${file.name}`
    : pasted
      ? `Pasted text staged: ${pasted.split(/\n+/).filter(Boolean).length} line(s)`
      : "No file selected. You can also paste text below.";
  const typeText = file || pasted
    ? `Parser mode: ${describeImportExt_(ext)}`
    : "Parser mode: Awaiting source";

  if(ui.importSourceFile){
    ui.importSourceFile.textContent = sourceText;
    ui.importSourceFile.title = sourceText;
  }
  if(ui.importSourceType){
    ui.importSourceType.textContent = typeText;
    ui.importSourceType.title = typeText;
  }
}

function setImportBannerTone_(tone){
  if(!ui.importMsg) return;
  ui.importMsg.classList.remove("is-neutral", "is-info", "is-ok", "is-warn", "is-danger");
  ui.importMsg.classList.add(tone && /^is-/.test(tone) ? tone : `is-${tone || "neutral"}`);
}

function setImportPreviewMode_(label, tone){
  if(!ui.importPreviewMode) return;
  ui.importPreviewMode.textContent = label;
  ui.importPreviewMode.title = label;
  ui.importPreviewMode.classList.remove("is-neutral", "is-info", "is-ok", "is-warn", "is-danger");
  ui.importPreviewMode.classList.add(tone && /^is-/.test(tone) ? tone : `is-${tone || "neutral"}`);
}

function getImportWarningCount_(cand){
  const warnings = cand?.diagnostics?.warnings;
  return Array.isArray(warnings) ? warnings.length : 0;
}

function looksLikeJsonStateText_(text){
  const src = String(text || "").trim();
  if(!(src.startsWith("{") || src.startsWith("["))) return false;
  return /"projects"\s*:/.test(src) || /"activeProjectId"\s*:/.test(src) || /"activeModuleId"\s*:/.test(src);
}

function pulseImportPreview(){
  if(!window.anime) return;
  const { animate } = anime;
  animate({
    targets: "#previewTree .tree",
    opacity: [0, 1],
    translateY: [8, 0],
    duration: 420,
    easing: "easeOutQuad"
  });
}

function makeImportCandidate(text, ext){
  if(ext === "json"){
    return makeStateImportCandidate_(text);
  }

  const parsed = parseProjectFromText(text, ext);
  const matchId = findProjectByName(parsed.name);
  const diagnostics = buildImportDiagnostics_(text, ext, parsed, !!matchId);
  return { kind:"project-text", project: parsed, existsMatchId: matchId, diagnostics };
}

function makeStateImportCandidate_(text){
  let rawParsed = null;
  try{
    rawParsed = JSON.parse(String(text || ""));
  }catch(err){
    throw new Error("Invalid JSON file/text");
  }

  if(!rawParsed || typeof rawParsed !== "object" || Array.isArray(rawParsed)){
    throw new Error("JSON import expects an exported app state object");
  }

  const sanitized = sanitizeState(migrateState_(rawParsed));
  const diagnostics = buildStateImportDiagnostics_(rawParsed, sanitized);

  return {
    kind:"state-json",
    state: sanitized,
    existsMatchId: null,
    diagnostics,
  };
}

function computeCountsForState_(s){
  const src = sanitizeState(migrateState_(s || {}));
  let milestones = 0;
  let tasks = 0;
  let done = 0;

  for(const p of (Array.isArray(src.projects) ? src.projects : [])){
    const c = computeProjectCounts(p);
    milestones += c.milestones;
    tasks += c.tasks;
    done += c.done;
  }

  return { projects: (src.projects || []).length, milestones, tasks, done };
}

function buildStateImportDiagnostics_(rawParsed, sanitized){
  const currentCounts = computeCountsForState_(state);
  const incomingCounts = computeCountsForState_(sanitized);
  const warnings = [];

  if(!Array.isArray(rawParsed?.projects)) warnings.push("Missing projects array (sanitized to empty)");
  if(incomingCounts.projects === 0) warnings.push("No projects found in JSON state");
  const rawVersion = Number(rawParsed?.version || 0) || 0;
  if(rawVersion > STORAGE_SCHEMA_VERSION) warnings.push(`JSON version ${rawVersion} is newer than app schema ${STORAGE_SCHEMA_VERSION}`);
  if(incomingCounts.tasks === 0) warnings.push("Imported state has zero tasks");

  return {
    rawVersion: rawVersion || null,
    currentCounts,
    incomingCounts,
    warnings,
  };
}

function buildStatePreviewTree_(s){
  const src = sanitizeState(migrateState_(s || {}));
  const projects = Array.isArray(src.projects) ? src.projects : [];
  const maxProjects = 8;

  return `
    <div class="tree">
      <div class="tree__head">JSON State Restore: <b>${projects.length}</b> project(s)</div>
      <div class="tree__node">
        ${projects.slice(0, maxProjects).map(p => {
          const mods = Array.isArray(p?.modules) ? p.modules : [];
          const counts = computeProjectCounts(p);
          return `
            <div class="tree__module">▣ ${escapeHtml(p.name)} <span class="badge">${counts.milestones} milestone(s)</span> <span class="badge">${counts.tasks} task(s)</span></div>
            <div class="tree__node">
              ${mods.slice(0, 4).map(mod => {
                const msList = Array.isArray(mod?.milestones) ? mod.milestones : [];
                return `<div class="tree__task">- ${escapeHtml(mod.name)} <span class="badge">${msList.length} milestone(s)</span></div>`;
              }).join("")}
              ${mods.length > 4 ? `<div class="tree__task">… (+${mods.length - 4} more module(s))</div>` : ""}
            </div>
          `;
        }).join("")}
        ${projects.length > maxProjects ? `<div class="tree__task">… (+${projects.length - maxProjects} more project(s))</div>` : ""}
      </div>
    </div>
  `;
}

function findProjectByName(name){
  const norm = normalizeName(name);
  const hit = state.projects.find(p => normalizeName(p.name) === norm);
  return hit ? hit.id : null;
}

function normalizeName(s){
  return String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
}

// Cleanup helpers used by the importer / name guessing
function cleanupTitle(s){
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/^#+\s+/, "")
    .replace(/^[-*]\s+/, "")
    .replace(/^\d+(?:\.\d+)*[\)\.-]\s+/, "")
    .replace(/^\s+|\s+$/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
}

function cleanupTask(s){
  return String(s || "")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*[-*]\s+/, "")
    .replace(/^\s*\[(x| )\]\s+/i, "")
    .replace(/^\d+(?:\.\d+)*[\)\.-]\s+/, "")
    .trim();
}

function buildImportDiagnostics_(text, ext, parsed, hasMatch){
  const src = String(text || "").replace(/\r\n/g, "\n");
  const lines = src.split("\n");
  const lineCount = lines.length;
  const moduleHeaderRe = /^\s*MODULE\s+\d+/i;
  const milestoneLikeRe = /^\s*(?:M\d+\s*[-—:]|Milestone\b|##+\s+)/i;
  const headingRe = /^\s*##+\s+/;
  const taskLikeRe = /^\s*(?:[-*]\s+\[(?:x| )\]\s+|\[(?:x| )\]\s+|[-*]\s+).+/i;

  const moduleHeaderHits = [];
  const milestoneLikeHits = [];
  const headingHits = [];
  const bulletTaskHits = [];
  const suspiciousLongLines = [];

  for(let i = 0; i < lines.length; i++){
    const line = String(lines[i] || "").trim();
    if(!line) continue;
    if(moduleHeaderRe.test(line)) moduleHeaderHits.push({ line: i + 1, text: line });
    if(milestoneLikeRe.test(line)) milestoneLikeHits.push({ line: i + 1, text: line });
    if(headingRe.test(line)) headingHits.push({ line: i + 1, text: line });
    if(taskLikeRe.test(line)) bulletTaskHits.push({ line: i + 1, text: line });
    if(line.length > 220) suspiciousLongLines.push({ line: i + 1, text: line.slice(0, 180) + "…" });
  }

  const counts = computeProjectCounts(parsed);
  const warnings = [];

  if(!counts.milestones) warnings.push("No milestones parsed");
  if(!counts.tasks) warnings.push("No tasks parsed");
  if(!moduleHeaderHits.length) warnings.push("No MODULE headers found (used default General module)");
  if(bulletTaskHits.length && counts.tasks === 0) warnings.push("Task-looking lines were found but none were parsed");
  if(bulletTaskHits.length > counts.tasks + 8) warnings.push("Some bullet lines may have been treated as notes/steps instead of tasks");
  if(suspiciousLongLines.length) warnings.push("Very long lines detected (parser may treat them as notes)");
  if(hasMatch) warnings.push("Project name matches existing project (Import will merge)");

  return {
    ext,
    lineCount,
    sourceTaskLikeLines: bulletTaskHits.length,
    parsedMilestones: counts.milestones,
    parsedTasks: counts.tasks,
    moduleHeaderCount: moduleHeaderHits.length,
    milestoneLikeCount: milestoneLikeHits.length,
    headingMilestoneCount: headingHits.length,
    suspiciousLongLineCount: suspiciousLongLines.length,
    moduleHeaderSamples: moduleHeaderHits.slice(0, 3),
    milestoneSamples: milestoneLikeHits.slice(0, 3),
    taskLikeSamples: bulletTaskHits.slice(0, 4),
    suspiciousLineSamples: suspiciousLongLines.slice(0, 2),
    warnings,
  };
}

function buildImportDiagnosticsHtml_(diag){
  if(!diag || typeof diag !== "object") return "";
  const rows = [
    ["Lines", diag.lineCount],
    ["MODULE headers", diag.moduleHeaderCount],
    ["Milestone-like lines", diag.milestoneLikeCount],
    ["Task-like lines", diag.sourceTaskLikeLines],
    ["Parsed milestones", diag.parsedMilestones],
    ["Parsed tasks", diag.parsedTasks],
  ];
  const renderSamples = (title, arr) => {
    if(!Array.isArray(arr) || !arr.length) return "";
    return `
      <div class="hint" style="margin-top:8px">
        <b>${escapeHtml(title)}</b>
        <ul>
          ${arr.map(x => `<li>L${Number(x.line||0)}: <code>${escapeHtml(String(x.text || ""))}</code></li>`).join("")}
        </ul>
      </div>
    `;
  };
  const warnHtml = (Array.isArray(diag.warnings) && diag.warnings.length)
    ? `<div class="hint" style="margin-top:8px"><b>Warnings (${diag.warnings.length})</b><ul>${diag.warnings.map(w => `<li>${escapeHtml(String(w))}</li>`).join("")}</ul></div>`
    : "";
  return `
    <div class="tree" style="margin-top:10px">
      <div class="tree__head">Parser Diagnostics</div>
      <div class="tree__node">
        ${rows.map(([k,v]) => `<div class="tree__task">- <b>${escapeHtml(String(k))}</b>: ${escapeHtml(String(v ?? 0))}</div>`).join("")}
        ${warnHtml}
        ${renderSamples("Sample MODULE headers", diag.moduleHeaderSamples)}
        ${renderSamples("Sample milestone-like lines", diag.milestoneSamples)}
        ${renderSamples("Sample task-like lines", diag.taskLikeSamples)}
        ${renderSamples("Sample long lines", diag.suspiciousLineSamples)}
      </div>
    </div>
  `;
}

function renderImportPreview(){
  const cand = importCandidate;

  ui.btnImport.textContent = "Import";
  ui.btnImportAsNew.textContent = "Import as New";

  if(!cand){
    ui.previewProjectName.textContent = "—";
    ui.previewProjectName.title = "";
    ui.previewMilestones.textContent = "0";
    ui.previewTasks.textContent = "0";
    if(ui.previewWarnings) ui.previewWarnings.textContent = "0";
    setImportPreviewMode_("Awaiting Parse", "neutral");
    ui.previewTree.innerHTML = `<div class="preview__empty">Parse a file to see a preview.</div>`;
    ui.btnImport.disabled = true;
    ui.btnImportAsNew.disabled = true;
    ui.importMsg.textContent = "—";
    ui.importMsg.title = "";
    setImportBannerTone_("neutral");
    syncImportSourceMeta_();
    return;
  }

  if(cand.kind === "state-json"){
    const diag = cand.diagnostics || {};
    const incoming = diag.incomingCounts || computeCountsForState_(cand.state);
    const current = diag.currentCounts || computeCountsForState_(state);
    const warnCount = getImportWarningCount_(cand);

    ui.previewProjectName.textContent = "[JSON STATE RESTORE]";
    ui.previewProjectName.title = ui.previewProjectName.textContent;
    ui.previewMilestones.textContent = String(incoming.milestones || 0);
    ui.previewTasks.textContent = String(incoming.tasks || 0);
    if(ui.previewWarnings) ui.previewWarnings.textContent = String(warnCount);

    ui.btnImport.disabled = false;
    ui.btnImportAsNew.disabled = true;
    ui.btnImport.textContent = "Restore State";

    const warnSuffix = (Array.isArray(diag.warnings) && diag.warnings.length)
      ? ` • WARN ${diag.warnings.length}: ${diag.warnings.slice(0,2).join("; ")}`
      : "";

    ui.importMsg.textContent =
      `JSON STATE PREVIEW • Restore replaces local data • Current ${current.projects}P/${current.milestones}M/${current.tasks}T → Incoming ${incoming.projects}P/${incoming.milestones}M/${incoming.tasks}T` + warnSuffix;
    ui.importMsg.title = ui.importMsg.textContent;
    setImportBannerTone_(warnCount ? "warn" : "info");
    setImportPreviewMode_("JSON Restore", warnCount ? "warn" : "info");

    ui.previewTree.innerHTML = buildStatePreviewTree_(cand.state);
    syncImportSourceMeta_();
    return;
  }

  const p = cand.project;
  const counts = computeProjectCounts(p);
  const diag = cand.diagnostics || null;
  const warnCount = getImportWarningCount_(cand);

  ui.previewProjectName.textContent = p.name;
  ui.previewProjectName.title = p.name;
  ui.previewMilestones.textContent = String(counts.milestones);
  ui.previewTasks.textContent = String(counts.tasks);
  if(ui.previewWarnings) ui.previewWarnings.textContent = String(warnCount);

  ui.btnImport.disabled = false;
  ui.btnImportAsNew.disabled = false;

  const already = cand.existsMatchId ? "MATCH FOUND (will merge if you click Import)" : "NO MATCH (Import will create new)";
  const warnSuffix = (diag && Array.isArray(diag.warnings) && diag.warnings.length)
    ? ` • WARN ${diag.warnings.length}: ${diag.warnings.slice(0,2).join("; ")}`
    : "";
  const target = cand.existsMatchId ? state.projects.find(x => x.id === cand.existsMatchId) : null;
  const mergeImpact = target ? computeMergeImpact_(target, cand.project) : null;
  ui.importMsg.textContent = already + warnSuffix + buildMergeImpactHint_(mergeImpact);
  ui.importMsg.title = ui.importMsg.textContent;
  setImportBannerTone_(warnCount ? "warn" : (cand.existsMatchId ? "info" : "ok"));
  setImportPreviewMode_(cand.existsMatchId ? "Merge Preview" : "New Project Preview", warnCount ? "warn" : (cand.existsMatchId ? "info" : "ok"));

  ui.previewTree.innerHTML = buildPreviewTree(p)
    + (diag ? buildImportDiagnosticsHtml_(diag) : "")
    + (mergeImpact ? buildMergeImpactHtml_(mergeImpact) : "");
  syncImportSourceMeta_();
}

function buildPreviewTree(p){
  const mods = Array.isArray(p?.modules) ? p.modules : null;
  const msLegacy = Array.isArray(p?.milestones) ? p.milestones : [];

  const renderMs = (m) => `
    <div class="tree__milestone">⟡ ${escapeHtml(m.title)} <span class="badge">${(m.tasks || []).length} task(s)</span></div>
    <div class="tree__node">
      ${(m.tasks || []).slice(0, 10).map(t => `<div class="tree__task">- ${t.done ? "✅" : "⬚"} <b>${escapeHtml(t.title)}</b> <span class="badge">${escapeHtml(t.severity || "normal")}</span></div>`).join("")}
      ${(m.tasks || []).length > 10 ? `<div class="tree__task">… (+${(m.tasks || []).length - 10} more)</div>` : ""}
    </div>
  `;

  // Preferred model: modules -> milestones
  if(mods){
    return `
      <div class="tree">
        <div class="tree__head">Project: <b>${escapeHtml(p.name)}</b></div>
        <div class="tree__node">
          ${mods.map(mod => {
            const msList = Array.isArray(mod?.milestones) ? mod.milestones : [];
            return `
              <div class="tree__module">▣ ${escapeHtml(mod.name)} <span class="badge">${msList.length} milestone(s)</span></div>
              <div class="tree__node">
                ${msList.map(renderMs).join("")}
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  // Legacy model
  return `
    <div class="tree">
      <div class="tree__head">Project: <b>${escapeHtml(p.name)}</b></div>
      <div class="tree__node">
        ${msLegacy.map(renderMs).join("")}
      </div>
    </div>
  `;
}

async function applyImport(cand, { forceNew }){
  if(cand?.kind === "state-json"){
    const incomingState = sanitizeState(migrateState_(cand.state || {}));
    const incomingCounts = computeCountsForState_(incomingState);

    const ok = await pmConfirmDialog_(
      `Restore full app state from JSON?\n\nThis will replace current local data.\nIncoming: ${incomingCounts.projects} project(s), ${incomingCounts.milestones} milestone(s), ${incomingCounts.tasks} task(s).`,
      { title:'Import JSON', okText:'Restore', danger:true }
    );
    if(!ok) return;

    try{
      recordStorageSnapshot_(JSON.stringify(state));
    }catch{
      // best-effort snapshot before restore
    }

    state = incomingState;
    reconcileActiveSelection_();
    addActivity(`Restored app state from JSON (${incomingCounts.projects} project(s))`);
    saveState({ immediate:true });
    importCandidate = null;
    renderImportPreview();
    renderAll();
    switchTab("dashboard");
    return;
  }

  const imported = sanitizeProject(cand.project);

  // If forceNew, always create new project (rename if collision).
  if(forceNew){
    const unique = uniqueProjectName(imported.name);
    imported.name = unique;
    state.projects.unshift(imported);
    state.activeProjectId = imported.id;
    state.activeModuleId = imported.modules?.[0]?.id ?? null;
    state.activeMilestoneId = imported.modules?.[0]?.milestones?.[0]?.id ?? null;
    addActivity(`Imported project (new): ${imported.name}`);
    saveState({ immediate:true });
    importCandidate = null;
    renderImportPreview();
    renderAll();
    switchTab("projects");
    return;
  }

  // Merge into match if exists, else create
  if(cand.existsMatchId){
    const target = state.projects.find(p => p.id === cand.existsMatchId);
    if(!target){
      state.projects.unshift(imported);
      state.activeProjectId = imported.id;
      state.activeModuleId = imported.modules?.[0]?.id ?? null;
      state.activeMilestoneId = imported.modules?.[0]?.milestones?.[0]?.id ?? null;
      addActivity(`Imported project: ${imported.name}`);
      saveState({ immediate:true });
      importCandidate = null;
      renderImportPreview();
      renderAll();
      switchTab("projects");
      return;
    }

    const mergeImpact = computeMergeImpact_(target, imported);
    const mergeOk = await pmConfirmDialog_(
      `Merge into existing project "${target.name}"?

` +
      `New modules: ${mergeImpact.newModules}
` +
      `New milestones: ${mergeImpact.newMilestones}
` +
      `New tasks: ${mergeImpact.newTasks}
` +
      `Task upgrades: ${mergeImpact.updatedTasks}`,
      { title:'Merge Import', okText:'Merge' }
    );
    if(!mergeOk) return;

    mergeProject(target, imported);
    setActiveProject(target.id);
    addActivity(`Merged import into: ${target.name}`);
    saveState({ immediate:true });
    importCandidate = null;
    renderImportPreview();
    renderAll();
    switchTab("milestones");
    return;
  }

  state.projects.unshift(imported);
  state.activeProjectId = imported.id;
  state.activeModuleId = imported.modules?.[0]?.id ?? null;
  state.activeMilestoneId = imported.modules?.[0]?.milestones?.[0]?.id ?? null;
  addActivity(`Imported project: ${imported.name}`);
  saveState({ immediate:true });
  importCandidate = null;
  renderImportPreview();
  renderAll();
  switchTab("projects");
}

function uniqueProjectName(name){
  let base = (name || "Imported Project").trim();
  if(!findProjectByName(base)) return base;
  let i = 2;
  while(findProjectByName(`${base} (${i})`)) i++;
  return `${base} (${i})`;
}

function computeMergeImpact_(target, incoming){
  const out = {
    matchProject: !!target,
    incoming: computeProjectCounts(incoming),
    targetBefore: target ? computeProjectCounts(target) : { milestones:0, tasks:0, done:0 },
    newModules: 0,
    mergedModules: 0,
    newMilestones: 0,
    mergedMilestones: 0,
    newTasks: 0,
    updatedTasks: 0,
  };
  if(!target) return out;

  const tgtMods = Array.isArray(target.modules) ? target.modules : [];
  const incMods = Array.isArray(incoming.modules) ? incoming.modules : [];
  for(const incMod of incMods){
    const modMatch = tgtMods.find(m => normalizeName(m.name) === normalizeName(incMod.name));
    if(!modMatch){
      out.newModules += 1;
      const c = computeProjectCounts({ modules:[incMod] });
      out.newMilestones += c.milestones;
      out.newTasks += c.tasks;
      continue;
    }
    out.mergedModules += 1;
    const modMs = Array.isArray(modMatch.milestones) ? modMatch.milestones : [];
    for(const incMs of (Array.isArray(incMod.milestones) ? incMod.milestones : [])){
      const msMatch = modMs.find(m => normalizeName(m.title) === normalizeName(incMs.title));
      if(!msMatch){
        out.newMilestones += 1;
        out.newTasks += Array.isArray(incMs.tasks) ? incMs.tasks.length : 0;
        continue;
      }
      out.mergedMilestones += 1;
      const tgtTasks = Array.isArray(msMatch.tasks) ? msMatch.tasks : [];
      for(const incTask of (Array.isArray(incMs.tasks) ? incMs.tasks : [])){
        const tmatch = tgtTasks.find(t => normalizeName(t.title) === normalizeName(incTask.title));
        if(!tmatch){ out.newTasks += 1; continue; }
        const willUpgrade = (!!incTask.done && !tmatch.done) || (sevRank(incTask.severity) > sevRank(tmatch.severity)) || (!!incTask.assignee && !tmatch.assignee);
        if(willUpgrade) out.updatedTasks += 1;
      }
    }
  }
  return out;
}

function buildMergeImpactHint_(impact){
  if(!impact || !impact.matchProject) return "";
  return ` • MERGE PREVIEW: +${impact.newModules} module(s), +${impact.newMilestones} milestone(s), +${impact.newTasks} task(s), ~${impact.updatedTasks} task update(s)`;
}

function buildMergeImpactHtml_(impact){
  if(!impact || !impact.matchProject) return "";
  return `
    <div class="tree" style="margin-top:10px">
      <div class="tree__head">Merge Preview</div>
      <div class="tree__node">
        <div class="tree__task">- Existing target: <b>${impact.targetBefore.milestones}</b> milestone(s), <b>${impact.targetBefore.tasks}</b> task(s)</div>
        <div class="tree__task">- Incoming import: <b>${impact.incoming.milestones}</b> milestone(s), <b>${impact.incoming.tasks}</b> task(s)</div>
        <div class="tree__task">- New modules: <b>${impact.newModules}</b></div>
        <div class="tree__task">- Merged modules: <b>${impact.mergedModules}</b></div>
        <div class="tree__task">- New milestones: <b>${impact.newMilestones}</b></div>
        <div class="tree__task">- Merged milestones: <b>${impact.mergedMilestones}</b></div>
        <div class="tree__task">- New tasks: <b>${impact.newTasks}</b></div>
        <div class="tree__task">- Task upgrades: <b>${impact.updatedTasks}</b></div>
      </div>
    </div>
  `;
}

function mergeProject(target, incoming){
  // merge strategy:
  // - keep target fields, but merge module->milestone->tasks (by title)
  // - if module name matches, merge inside; else append module
  target.desc = target.desc || incoming.desc;
  target.tag = target.tag || incoming.tag;
  // Preserve a completed target project during merge; only propagate completion forward.
  if(target.status !== "done" && incoming.status === "done"){
    target.status = "done";
  }

  target.modules = Array.isArray(target.modules) ? target.modules : [ mkModule("General") ];
  const incMods = Array.isArray(incoming.modules) ? incoming.modules : [];

  for(const incMod of incMods){
    const modMatch = target.modules.find(m => normalizeName(m.name) === normalizeName(incMod.name));
    if(!modMatch){
      target.modules.push(incMod);
      continue;
    }
    modMatch.desc = modMatch.desc || incMod.desc;


    modMatch.milestones = Array.isArray(modMatch.milestones) ? modMatch.milestones : [];
    for(const incMs of (Array.isArray(incMod.milestones) ? incMod.milestones : [])){
      const msMatch = modMatch.milestones.find(m => normalizeName(m.title) === normalizeName(incMs.title));
      if(!msMatch){
        modMatch.milestones.push(incMs);
        continue;
      }

      // merge notes if blank; merge priority/state only when target still at default values
      msMatch.notes = msMatch.notes || incMs.notes;
      if((!msMatch.priority || msMatch.priority === "p2") && incMs.priority && incMs.priority !== "p2"){
        msMatch.priority = incMs.priority;
      }
      if((!msMatch.state || msMatch.state === "todo") && incMs.state && incMs.state !== "todo"){
        msMatch.state = incMs.state;
      }

      msMatch.tasks = Array.isArray(msMatch.tasks) ? msMatch.tasks : [];
      for(const incTask of (Array.isArray(incMs.tasks) ? incMs.tasks : [])){
        const tmatch = msMatch.tasks.find(t => normalizeName(t.title) === normalizeName(incTask.title));
        if(!tmatch){
          msMatch.tasks.push(incTask);
        } else {
          if(incTask.done) tmatch.done = true;
          if(sevRank(incTask.severity) > sevRank(tmatch.severity)) tmatch.severity = incTask.severity;
          tmatch.assignee = tmatch.assignee || incTask.assignee;
        }
      }
    }
  }
}

/* ---------------------------
   Parser: md/txt -> project -> milestones -> tasks
---------------------------- */
function parseProjectFromText(text, ext){
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");

  const projectName = guessProjectName(lines, ext);
  /** @type {Project} */
  const p = {
    id: uid(),
    name: projectName,
    desc: "",
    status: "active",
    tag: "",
    modules: [],
    createdAt: Date.now(),
  };

  /** @type {Module|null} */
  let currentMod = null;
  /** @type {Milestone|null} */
  let currentMs = null;
  /** @type {Task|null} */
  let lastTask = null;

  /** @type {{kind:'desc'|'notes', buf:string[]} | null} */
  let pmBlock = null;

  /** @type {'project'|'module'|'milestone'} */
  let pmScope = "project";
  let seenModuleHeader = false;

  const isPlaceholderMilestone = (ms) => {
    if(!ms) return false;
    const title = normalizeName(ms.title);
    const notes = String(ms.notes || "").trim();
    const tasksLen = Array.isArray(ms.tasks) ? ms.tasks.length : 0;
    return title === "general" && !notes && tasksLen === 0;
  };

  const isPlaceholderModule = (m) => {
    if(!m) return false;
    const name = normalizeName(m.name);
    const ms = Array.isArray(m.milestones) ? m.milestones : [];
    return name === "general" && ms.length === 1 && isPlaceholderMilestone(ms[0]);
  };

  const ensureModule = (name) => {
    const nm = (name || "General").trim() || "General";
    currentMod = mkModule(nm);
    currentMs = currentMod.milestones?.[0] ?? null;
    p.modules.push(currentMod);
    lastTask = null;
  };

  const applyPmText = (kind, value) => {
    const normalized = String(value ?? "").replace(/\r\n/g, "\n").trimEnd();
    if(kind === "notes"){
      if(currentMs) currentMs.notes = normalized;
      return;
    }
    if(pmScope === "module" && currentMod){
      currentMod.desc = normalized;
      return;
    }
    p.desc = normalized;
  };

  const normalizeModuleStatus = (value) => {
    const v = String(value || "").trim().toLowerCase();
    if(v === "active") return "doing";
    if(v === "todo" || v === "doing" || v === "done") return v;
    return "";
  };

  const normalizeMilestoneState = (value) => {
    const v = String(value || "").trim().toLowerCase();
    if(v === "planned") return "todo";
    if(v === "active") return "doing";
    if(v === "todo" || v === "doing" || v === "done") return v;
    return "";
  };

  const pushMilestone = (title) => {
    const t = (title || "").trim();
    if(!t) return;
    if(!currentMod) ensureModule("General");
    pmScope = "milestone";

    const ms = mkMilestone(t);

    // Replace placeholder milestone if it’s still empty
    if(Array.isArray(currentMod.milestones) && currentMod.milestones.length === 1){
      if(isPlaceholderMilestone(currentMod.milestones[0]) && normalizeName(t) !== "general"){
        currentMod.milestones[0] = ms;
        currentMs = ms;
        lastTask = null;
        return;
      }
    }

    currentMod.milestones.push(ms);
    currentMs = ms;
    lastTask = null;
  };

  // Safe default: if the file has no MODULE headers, everything lands here.
  ensureModule("General");

  for(let i=0; i<lines.length; i++){
    const raw = lines[i];
    const line = raw.trim();

    // Multiline @pm blocks for desc/notes (round-trip safe)
    if(pmBlock){
      const end = line.match(/^@pm\s+(desc|notes)\s*:\s*>>>\s*$/i);
      if(end){
        const joined = pmBlock.buf.join("\n").replace(/\r\n/g, "\n").trimEnd();
        applyPmText(pmBlock.kind, joined);
        pmBlock = null;
        continue;
      }
      pmBlock.buf.push(raw);
      continue;
    }

    const start = line.match(/^@pm\s+(desc|notes)\s*:\s*<<<\s*$/i);
    if(start){
      pmBlock = { kind: String(start[1]).toLowerCase(), buf: [] };
      continue;
    }

    if(!line) continue;

    // Step (subtask) lines: indented list items under the most recent task.
    // Rule: any list item with >=2 leading spaces (or a tab) is treated as a step for the previous task.
    if(lastTask){
      const isIndented = (/^(\s{2,}|\t)/.test(raw));
      if(isIndented){
        const sBox = raw.match(/^\s+[-*]\s+\[(x| )\]\s+(.+)$/i);
        const sDash = raw.match(/^\s+[-*]\s+(.+)$/);
        if(sBox){
          const done = (sBox[1] || "").toLowerCase() === "x";
          const text = cleanupTask(sBox[2]);
          if(text){
            addStepToTask_(lastTask, text, done);
          }
          continue;
        }
        if(sDash){
          const text = cleanupTask(sDash[1]);
          if(text && text.length >= 2){
            addStepToTask_(lastTask, text, false);
          }
          continue;
        }
      }
    }

    // @pm meta lines (used by Export MD/TXT for round-trip imports)
    const pmProject = line.match(/^@pm\s+project\s+(.+)$/i);
    if(pmProject){
      const kv = parsePmKv_(pmProject[1]);
      pmScope = "project";
      if(kv.status && (kv.status === "active" || kv.status === "paused" || kv.status === "done")) p.status = kv.status;
      if(kv.tag !== undefined) p.tag = String(kv.tag || "");
      continue;
    }

    const pmDesc = line.match(/^@pm\s+desc\s*:\s*(.+)$/i);
    if(pmDesc){
      applyPmText("desc", pmDesc[1].trim());
      continue;
    }

    const pmModule = line.match(/^@pm\s+module\s+(.+)$/i);
    if(pmModule){
      const kv = parsePmKv_(pmModule[1]);
      if(!currentMod) ensureModule("General");
      pmScope = "module";
      const modStatus = normalizeModuleStatus(kv.status);
      if(modStatus) currentMod.status = modStatus;
      if(kv.tag !== undefined) currentMod.tag = String(kv.tag || "");
      continue;
    }

    const pmMilestone = line.match(/^@pm\s+milestone\s+(.+)$/i);
    if(pmMilestone){
      const kv = parsePmKv_(pmMilestone[1]);
      pmScope = "milestone";
      if(currentMs){
        if(kv.priority && (kv.priority === "p1" || kv.priority === "p2" || kv.priority === "p3")) currentMs.priority = kv.priority;
        const milestoneState = normalizeMilestoneState(kv.state);
        if(milestoneState) currentMs.state = milestoneState;
      }
      continue;
    }

    const pmNotes = line.match(/^@pm\s+notes\s*:\s*(.+)$/i);
    if(pmNotes){
      applyPmText("notes", pmNotes[1].trim());
      continue;
    }

    // Module header patterns:
    // - "MODULE 1 - Something", "MODULE 2 — Something"
    const mModule =
      line.match(/^MODULE\s+(\d+)\s*[-—:]\s*(.+)$/i) ||
      line.match(/^MODULE\s+(\d+)\s+(.+)$/i);

    if(mModule){
      // If this is the first real module header, drop the placeholder General module (if still empty).
      if(!seenModuleHeader && p.modules.length === 1 && isPlaceholderModule(p.modules[0])){
        p.modules = [];
        currentMod = null;
        currentMs = null;
      }
      seenModuleHeader = true;

      const num = String(mModule[1] || "").trim();
      let after = String(mModule[2] || "").trim();

      // Some files repeat the prefix: "MODULE 1 - MODULE 1 - X"
      after = after.replace(/^MODULE\s+\d+\s*[-—:]\s*/i, "").trim();

      const title = cleanupTitle(after ? `MODULE ${num} - ${after}` : `MODULE ${num}`);
      ensureModule(title || `MODULE ${num}`);
      pmScope = "module";
      continue;
    }

    // Ignore the preamble "1) ... MODULE PLAN ..." list (these are not milestones)
    if(!seenModuleHeader && /^\d+(\.\d+)?[\)\.\-]\s+/.test(line) && /MODULE\s+PLAN/i.test(line)){
      continue;
    }

    // Milestone header patterns:
    // - "M0 — Something", "M1 - Something", "Milestone: Something"
    // - Markdown headings: ## Something (treated as milestone)
    // - Numbered headings: "1) Something", "2. Something"
    const mMilestone =
      line.match(/^(M\d+)\s*[-—:]\s*(.+)$/i) ||
      line.match(/^Milestone\s*[-—:]\s*(.+)$/i) ||
      line.match(/^##+\s+(.+)$/) ||
      line.match(/^\d+(\.\d+)?[\)\.\-]\s+(.+)$/);

    if(mMilestone){
      const title = (mMilestone[2] || mMilestone[1] || "").toString();
      const cleaned = cleanupTitle(title);
      if(cleaned && normalizeName(cleaned) !== "general"){
        pushMilestone(cleaned);
      }
      continue;
    }

    // task patterns:
    // - "- [ ] task", "- [x] task"
    // - "- task", "* task"
    // - "[ ] task", "[x] task"
    const tBox = line.match(/^[-*]\s+\[(x| )\]\s+(.+)$/i) || line.match(/^\[(x| )\]\s+(.+)$/i);
    const tDash = line.match(/^[-*]\s+(.+)$/);

    if(tBox){
      const done = (tBox[1] || "").toLowerCase() === "x";
      const title = cleanupTask(tBox[2]);
      if(title){
        const parsed = parsePmInlineTaskMeta_(title);
        const t = mkTask(parsed.title, done);
        applyPmTaskMeta_(t, parsed.meta);
        currentMs?.tasks.push(t);
        lastTask = t;
      }
      continue;
    }

    if(tDash){
      const title = cleanupTask(tDash[1]);
      // avoid swallowing horizontal rules or tiny bullets
      if(title && title.length >= 3){
        const parsed = parsePmInlineTaskMeta_(title);
        const t = mkTask(parsed.title, false);
        applyPmTaskMeta_(t, parsed.meta);
        currentMs?.tasks.push(t);
        lastTask = t;
      }
      continue;
    }
  }

  return p;
}


function guessProjectName(lines, ext){
  // Prefer first H1 in md, else a "Project:" line, else first non-empty header-ish line
  for(const raw of lines){
    const line = raw.trim();
    if(!line) continue;
    const h1 = line.match(/^#\s+(.+)$/);
    if(h1) return cleanupTitle(h1[1]);
    const p = line.match(/^Project\s*[-—:]\s*(.+)$/i);
    if(p) return cleanupTitle(p[1]);
  }

  // fallback: first non-empty line up to 70 chars
  for(const raw of lines){
    const line = raw.trim();
    if(!line) continue;
    if(line.length <= 70) return cleanupTitle(line);
    break;
  }
  return ext === "md" ? "Imported Markdown Project" : "Imported Text Project";
}

function guessDescription(lines){
  const out = [];
  for(const raw of lines){
    const line = raw.trim();
    if(!line) {
      if(out.length) break;
      continue;
    }
    // stop if we hit a list or milestone header
    if(/^[-*]\s+/.test(line) || /^##+/.test(line) || /^M\d+/.test(line)) break;
    out.push(line);
    if(out.join(" ").length > 240) break;
  }
  return out.join(" ").trim();
}

