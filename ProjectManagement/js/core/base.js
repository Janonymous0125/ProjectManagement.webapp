/* Stark PM — HUD (no build step)
   - Tabs: Dashboard / Project / Milestone / Checklist / Import
   - Data stored in localStorage
   - Import: .md / .txt (file input, drag&drop, paste)
   - Animations: Anime.js UMD (const { animate } = anime;)
*/

/** @typedef {{ id:string, text:string, done:boolean, children:Step[] }} Step */
/** @typedef {{ id:string, title:string, done:boolean, severity:'normal'|'high'|'blocker', assignee:string, createdAt:number, steps:Step[] }} Task */
/** @typedef {{ id:string, title:string, notes:string, priority:'p1'|'p2'|'p3', state:'todo'|'doing'|'done', tasks:Task[], createdAt:number }} Milestone */
/** @typedef {{ id:string, name:string, desc:string, status:'todo'|'doing'|'done', tag:string, milestones:Milestone[], createdAt:number }} Module */
/** @typedef {{ id:string, name:string, desc:string, status:'active'|'paused'|'done', tag:string, archived:boolean, modules:Module[], createdAt:number }} Project */
/** @typedef {{ version:number, projects:Project[], activeProjectId:string|null, activeModuleId:string|null, activeMilestoneId:string|null, activity:{ts:number,msg:string}[] }} State */

const STORAGE_KEY = "stark_pm_v1";
const STORAGE_BACKUPS_KEY = STORAGE_KEY + "__backups";
const STORAGE_EXPORT_CACHE_KEY = STORAGE_KEY + "__last_export";
const STORAGE_SCHEMA_VERSION = 2;
const MAX_STORAGE_BACKUPS = 8;
const SAVE_DEBOUNCE_MS = 220;
const MAX_HISTORY_ENTRIES = 80;
const MAX_ACTIVITY = 18;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const ui = {
  tabs: $$(".nav__item"),
  tabPanels: $$(".tab"),

  activeProjectName: $("#activeProjectName"),
  activeModuleName: $("#activeModuleName"),
  activeMilestoneName: $("#activeMilestoneName"),

  statProjects: $("#statProjects"),
  statMilestones: $("#statMilestones"),
  statTasks: $("#statTasks"),

  nowText: $("#nowText"),
  storeDot: $("#storeDot"),
  storeText: $("#storeText"),

  // Dashboard
  pctText: $("#pctText"),
  doneText: $("#doneText"),
  ringProgress: $("#ringProgress"),
  dashProjectTitle: $("#dashProjectTitle"),
  dashProjectBar: $("#dashProjectBar"),
  dashProjectMeta: $("#dashProjectMeta"),
  dashMilestoneList: $("#dashMilestoneList"),
  dashActivityList: $("#dashActivityList"),
  hotlist: $("#hotlist"),
  btnQuickNewProject: $("#btnQuickNewProject"),
  btnQuickGoImport: $("#btnQuickGoImport"),

  // Projects
  projectList: $("#projectList"),
  btnNewProject: $("#btnNewProject"),
  btnOpenProjectDetails: $("#btnOpenProjectDetails"),
  btnCloseProjectDetails: $("#btnCloseProjectDetails"),
  projectDetailsModal: $("#projectDetailsModal"),
  projectDetailsModalTitle: $("#projectDetailsModalTitle"),
  projectDetailsActiveName: $("#projectDetailsActiveName"),
  projectDetailsActiveMeta: $("#projectDetailsActiveMeta"),
  projectName: $("#projectName"),
  projectDesc: $("#projectDesc"),
  projectStatus: $("#projectStatus"),
  projectTag: $("#projectTag"),
  btnSaveProject: $("#btnSaveProject"),
  btnDeleteProject: $("#btnDeleteProject"),
  btnDuplicateProject: $("#btnDuplicateProject"),
  projectMilestoneCount: $("#projectMilestoneCount"),
  projectTaskCount: $("#projectTaskCount"),

  // Milestones
  moduleList: $("#moduleList"),
  btnNewModule: $("#btnNewModule"),
  btnOpenModuleDetails: $("#btnOpenModuleDetails"),
  btnCloseModuleDetails: $("#btnCloseModuleDetails"),
  moduleDetailsModal: $("#moduleDetailsModal"),
  moduleDetailsModalTitle: $("#moduleDetailsModalTitle"),
  moduleDetailsActiveName: $("#moduleDetailsActiveName"),
  moduleDetailsActiveMeta: $("#moduleDetailsActiveMeta"),
  moduleName: $("#moduleName"),
  moduleDesc: $("#moduleDesc"),
  moduleStatus: $("#moduleStatus"),
  moduleTag: $("#moduleTag"),
  btnSaveModule: $("#btnSaveModule"),
  btnDeleteModule: $("#btnDeleteModule"),
  moduleMilestoneCount: $("#moduleMilestoneCount"),
  moduleTaskCount: $("#moduleTaskCount"),
  moduleCompletion: $("#moduleCompletion"),
  milestoneScopeHint: $("#milestoneScopeHint"),
  btnOpenMilestoneDetails: $("#btnOpenMilestoneDetails"),
  btnCloseMilestoneDetails: $("#btnCloseMilestoneDetails"),
  milestoneDetailsModal: $("#milestoneDetailsModal"),
  milestoneDetailsModalTitle: $("#milestoneDetailsModalTitle"),
  milestoneDetailsActiveName: $("#milestoneDetailsActiveName"),
  milestoneDetailsActiveMeta: $("#milestoneDetailsActiveMeta"),

  milestoneList: $("#milestoneList"),
  btnNewMilestone: $("#btnNewMilestone"),
  milestoneTitle: $("#milestoneTitle"),
  milestoneNotes: $("#milestoneNotes"),
  milestonePriority: $("#milestonePriority"),
  milestoneState: $("#milestoneState"),
  btnSaveMilestone: $("#btnSaveMilestone"),
  btnDeleteMilestone: $("#btnDeleteMilestone"),
  milestoneTaskCount: $("#milestoneTaskCount"),
  milestoneCompletion: $("#milestoneCompletion"),

  // Checklist
  taskScopeHint: $("#taskScopeHint"),
  btnOpenTaskAdd: $("#btnOpenTaskAdd"),
  btnCloseTaskAdd: $("#btnCloseTaskAdd"),
  taskAddModal: $("#taskAddModal"),
  taskAddModalTitle: $("#taskAddModalTitle"),
  taskAddScopeProject: $("#taskAddScopeProject"),
  taskAddScopeMilestone: $("#taskAddScopeMilestone"),
  taskAddScopeOpen: $("#taskAddScopeOpen"),
  taskAddScopeBlocked: $("#taskAddScopeBlocked"),
  taskAddScopeOverdue: $("#taskAddScopeOverdue"),
  taskAddDraftTitle: $("#taskAddDraftTitle"),
  taskAddDraftMeta: $("#taskAddDraftMeta"),
  taskAddDraftChips: $("#taskAddDraftChips"),
  taskAddModalNote: $("#taskAddModalNote"),
  btnCloseTaskEdit: $("#btnCloseTaskEdit"),
  taskEditModal: $("#taskEditModal"),
  taskEditModalTitle: $("#taskEditModalTitle"),
  taskEditScopeProject: $("#taskEditScopeProject"),
  taskEditScopeMilestone: $("#taskEditScopeMilestone"),
  taskEditScopeSteps: $("#taskEditScopeSteps"),
  taskEditScopeRisk: $("#taskEditScopeRisk"),
  taskEditScopeCreated: $("#taskEditScopeCreated"),
  taskEditTitle: $("#taskEditTitle"),
  taskEditSeverity: $("#taskEditSeverity"),
  taskEditAssignee: $("#taskEditAssignee"),
  taskEditDue: $("#taskEditDue"),
  taskEditDraftTitle: $("#taskEditDraftTitle"),
  taskEditDraftMeta: $("#taskEditDraftMeta"),
  taskEditDraftChips: $("#taskEditDraftChips"),
  taskEditModalNote: $("#taskEditModalNote"),
  btnSaveTaskEdit: $("#btnSaveTaskEdit"),
  btnCancelTaskEdit: $("#btnCancelTaskEdit"),
  checklistAdvancedHost: $("#checklistAdvancedHost"),
  taskText: $("#taskText"),
  taskSeverity: $("#taskSeverity"),
  taskAssignee: $("#taskAssignee"),
  btnAddTask: $("#btnAddTask"),
  btnJumpMilestones: $("#btnJumpMilestones"),
  btnSortTasks: $("#btnSortTasks"),
  btnClearDone: $("#btnClearDone"),
  taskList: $("#taskList"),

  // Import
  dropzone: $("#dropzone"),
  fileInput: $("#fileInput"),
  pasteArea: $("#pasteArea"),
  btnParse: $("#btnParse"),
  btnClearImport: $("#btnClearImport"),
  importSourceFile: $("#importSourceFile"),
  importSourceType: $("#importSourceType"),
  previewProjectName: $("#previewProjectName"),
  previewMilestones: $("#previewMilestones"),
  previewTasks: $("#previewTasks"),
  previewWarnings: $("#previewWarnings"),
  importPreviewMode: $("#importPreviewMode"),
  previewTree: $("#previewTree"),
  btnImport: $("#btnImport"),
  btnImportAsNew: $("#btnImportAsNew"),
  importMsg: $("#importMsg"),

  // SFX
  startupSfx: $("#sfxStartup"),

  // Topbar
  btnWipe: $("#btnWipe"),
  btnUndo: $("#btnUndo"),
  btnRedo: $("#btnRedo"),
  btnExportJson: $("#btnExportJson"),
  btnExportMd: $("#btnExportMd"),
  btnExportTxt: $("#btnExportTxt"),
};

let state = /** @type {State} */ (loadState());
let importCandidate = null; // { kind:"project-text", project: Project, existsMatchId: string|null, diagnostics?:any } | { kind:"state-json", state: State, diagnostics?:any }
let tabSwitchToken = 0;
const expandedSteps = new Set();
let startupSfxPlayed_ = false;
/** @type {Promise<boolean>|null} */
let startupSfxReadyPromise_ = null;
let saveDebounceTimer_ = null;
let pendingSavePayload_ = null;
let undoStack_ = [];
let redoStack_ = [];
let historySuspendDepth_ = 0;
let historyBaselineJson_ = null;
try{ historyBaselineJson_ = JSON.stringify(state); }catch{ historyBaselineJson_ = null; }

function getStateCounts_(){
  let projects = state.projects.length;
  let milestones = 0, tasks = 0, steps = 0;

  for(const p of state.projects){
    const mods = Array.isArray(p?.modules) ? p.modules : [];
    for(const mod of mods){
      const msList = Array.isArray(mod?.milestones) ? mod.milestones : [];
      milestones += msList.length;
      for(const m of msList){
        const ts = Array.isArray(m?.tasks) ? m.tasks : [];
        tasks += ts.length;
        for(const t of ts){
          steps += countSteps_(t?.steps || []).total;
        }
      }
    }
  }

  return { projects, milestones, tasks, steps };
}



function runBootSequence_(){
  /** @type {HTMLElement|null} */
  const overlay = document.querySelector("#bootOverlay");
  /** @type {HTMLElement|null} */
  const logEl = document.querySelector("#bootLog");

  // Keep HUD hidden until we explicitly finish the boot.
  document.body.classList.remove("app-ready");
  primeStartupSfx_();

  const log = (msg) => {
    if(!logEl) return;
    const line = document.createElement("div");
    line.className = "boot-log__line";
    line.textContent = String(msg);
    logEl.appendChild(line);
    logEl.scrollTop = logEl.scrollHeight;
  };

  // Initial scripted boot log (gives the “backend loading” feel even though everything is local).
  const scripted = [
    "Booting Futuristic HUD UI…",
    "Loading UI modules…",
    "Connecting local storage…",
    "Hydrating project state…",
    "Rendering dashboard panels…",
  ];
  let i = 0;
  const tick = () => {
    if(i < scripted.length){
      log(scripted[i++]);
      setTimeout(tick, 240);
    }
  };
  setTimeout(tick, 160);

  const finalize_ = () => {
    // Ensure we always land on dashboard after boot.
    try{ switchTab("dashboard"); }catch{ /* ignore */ }

    // Fade in the HUD, then dismiss the overlay with an orb shrink.
    requestAnimationFrame(() => {
      document.body.classList.add("app-ready");
      if(!overlay) return;
      overlay.classList.add("is-out");
      const kill = () => overlay.remove();
      overlay.addEventListener("animationend", kill, { once:true });
      setTimeout(kill, 1200);
    });
  };

  const done = async () => {
    await waitForStartupSfxReady_();

    // Attempt to play right at the transition moment.
    // If the browser blocks autoplay, we pause here and wait for the first user gesture.
    const played = await playStartupSfx_();
    if(!played){
      log("Audio locked by browser. Tap anywhere to enter…");

      const target = overlay || document.body;
      const unlockAndEnter = async () => {
        await waitForStartupSfxReady_();
        await playStartupSfx_();
        finalize_();
      };

      // First gesture unlocks audio on most browsers.
      target.addEventListener("pointerdown", unlockAndEnter, { once:true });
      document.addEventListener("keydown", (e) => {
        if(e && (e.key === "Enter" || e.key === " ")) unlockAndEnter();
      }, { once:true });
      return;
    }

    finalize_();
  };

  return { log, done };
}


function primeStartupSfx_(){
  const el = ui.startupSfx || document.querySelector("#sfxStartup");
  if(!el) return;
  if(startupSfxReadyPromise_) return;

  // Hint aggressively; browsers may still ignore, but this helps.
  try{ el.preload = "auto"; }catch{ /* ignore */ }

  startupSfxReadyPromise_ = new Promise((resolve) => {
    let resolved = false;

    const finish = (ok) => {
      if(resolved) return;
      resolved = true;
      cleanup();
      resolve(!!ok);
    };

    const ok = () => finish(true);
    const bad = () => finish(false);

    let to = 0;

    const cleanup = () => {
      clearTimeout(to);
      el.removeEventListener("canplaythrough", ok);
      el.removeEventListener("canplay", ok);
      el.removeEventListener("loadeddata", ok);
      el.removeEventListener("loadedmetadata", ok);
      el.removeEventListener("error", bad);
      el.removeEventListener("stalled", bad);
    };

    // readyState >= 2 means we have enough data to start immediately.
    if(el.readyState >= 2){
      resolve(true);
      return;
    }

    el.addEventListener("canplaythrough", ok, { once:true });
    el.addEventListener("canplay", ok, { once:true });
    el.addEventListener("loadeddata", ok, { once:true });
    el.addEventListener("loadedmetadata", ok, { once:true });
    el.addEventListener("error", bad, { once:true });
    el.addEventListener("stalled", bad, { once:true });

    // Never block the transition forever — if audio isn't ready quickly,
    // proceed anyway (it will still attempt to play).
    to = setTimeout(() => finish(el.readyState >= 2), 650);

    try{ el.load(); }catch{ /* ignore */ }
  });
}


async function waitForStartupSfxReady_(){
  if(startupSfxPlayed_) return true;
  if(!startupSfxReadyPromise_) primeStartupSfx_();
  try{ return await (startupSfxReadyPromise_ || Promise.resolve(true)); }
  catch{ return true; }
}
async function playStartupSfx_(){
  const el = ui.startupSfx || document.querySelector("#sfxStartup");
  if(!el || startupSfxPlayed_) return true;

  try{ el.currentTime = 0; }catch{ /* ignore */ }

  try{
    const p = el.play();
    // Some browsers return undefined; treat that as success.
    if(p && typeof p.then === "function") await p;
    startupSfxPlayed_ = true;
    return true;
  }catch{
    // Autoplay blocked (common on mobile) — caller will wait for a user gesture.
    return false;
  }
}

function boot(){
  document.body.classList.add("force-motion");
  const bootUi = runBootSequence_();

  // Real boot events based on actual local state.
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      bootUi.log(`Local storage OK (${(raw.length/1024).toFixed(1)} KB).`);
    }else{
      bootUi.log("No saved data found. Using defaults.");
    }
  }catch{
    bootUi.log("Local storage unavailable. Using in-memory defaults.");
  }

  const counts = getStateCounts_();
  bootUi.log(`Hydrated state: ${counts.projects} project(s), ${counts.milestones} milestone(s), ${counts.tasks} task(s), ${counts.steps} step(s).`);

  bootUi.log("Wiring navigation…");

  wireTabs();
  bootUi.log("Wiring controls…");
  wireTopbar();
  bootUi.log("Wiring projects…");
  wireProjects();
  bootUi.log("Wiring milestones…");
  wireMilestones();
  bootUi.log("Wiring checklist…");
  wireChecklist();
  bootUi.log("Wiring importer…");
  wireImport();
  wireHistoryShortcuts_();
  window.addEventListener("beforeunload", () => { try{ flushPendingSave_(true); }catch{ /* ignore */ } });

  tickClock();
  setInterval(tickClock, 1000);

  initRadar();
  bootUi.log("Initializing status widgets…");
  renderAll();
  {
    const c = getStateCounts_();
    bootUi.log(`Data loaded: ${c.projects} project(s), ${c.milestones} milestone(s), ${c.tasks} task(s), ${c.steps} step(s). Entering Dashboard…`);
  }

  // Initial UI animation
  safeAnime(() => {
    const { animate } = anime;
    animate({
      targets: ".panel, .card",
      opacity: [0, 1],
      translateY: [10, 0],
      delay: (_, i) => 40 * i,
      duration: 650,
      easing: "easeOutQuad",
    });
  });

  // Finish boot after the HUD has had a moment to paint.
  setTimeout(() => {
    Promise.resolve(bootUi.done()).finally(() => {
      showGreeting_();
    });
  }, 1800);
}

function showGreeting_(){
  const el = document.querySelector("#greetingToast");
  if(!el) return;
  const h = new Date().getHours();
  const msg = (h >= 5 && h < 12) ? "Good morning" : (h >= 12 && h < 18) ? "Good afternoon" : "Good evening";
  el.textContent = msg;
  el.setAttribute("aria-hidden", "false");
  el.classList.remove("is-show");
  // restart animation
  void el.offsetWidth;
  el.classList.add("is-show");
  setTimeout(() => {
    el.classList.remove("is-show");
    el.setAttribute("aria-hidden", "true");
  }, 4000);
}

/* ---------------------------
   Storage
---------------------------- */
function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return mkEmptyState();
    const parsed = JSON.parse(raw);
    return sanitizeState(migrateState_(parsed));
  }catch(err){
    const recovered = recoverStateFromBackups_();
    if(recovered){
      try{
        recovered.activity.unshift({ ts: Date.now(), msg: "Recovered state from local backup snapshot" });
        recovered.activity = recovered.activity.slice(0, MAX_ACTIVITY);
      }catch{ /* ignore */ }
      pulseSaveError("RECOVERED");
      return recovered;
    }
    pulseSaveError("MEM ONLY");
    return mkEmptyState();
  }
}

function saveState(options){
  const opts = (options && typeof options === "object") ? options : {};
  try{
    state.version = STORAGE_SCHEMA_VERSION;
    const payload = JSON.stringify(state);

    if(!opts.skipHistory) captureHistorySnapshot_(payload);

    if(opts.immediate){
      pendingSavePayload_ = null;
      if(saveDebounceTimer_){ clearTimeout(saveDebounceTimer_); saveDebounceTimer_ = null; }
      return persistPayload_(payload);
    }

    pendingSavePayload_ = payload;
    pulseDirty();
    if(saveDebounceTimer_) clearTimeout(saveDebounceTimer_);
    saveDebounceTimer_ = setTimeout(() => {
      const next = pendingSavePayload_;
      pendingSavePayload_ = null;
      saveDebounceTimer_ = null;
      if(next) persistPayload_(next);
    }, SAVE_DEBOUNCE_MS);
    return true;
  }catch(err){
    pulseSaveError("SAVE ERR");
    return false;
  }
}

function flushPendingSave_(silent){
  if(saveDebounceTimer_){
    clearTimeout(saveDebounceTimer_);
    saveDebounceTimer_ = null;
  }
  if(!pendingSavePayload_) return true;
  const payload = pendingSavePayload_;
  pendingSavePayload_ = null;
  return persistPayload_(payload, { silent:Boolean(silent) });
}

function persistPayload_(payload, options){
  const opts = (options && typeof options === "object") ? options : {};
  try{
    localStorage.setItem(STORAGE_KEY, String(payload));
    recordStorageSnapshot_(String(payload));
    if(!opts.silent) pulseSaved();
    return true;
  }catch(err){
    try{
      pruneStorageBackups_(Math.max(2, Math.floor(MAX_STORAGE_BACKUPS / 2)));
      localStorage.setItem(STORAGE_KEY, String(payload));
      recordStorageSnapshot_(String(payload));
      if(!opts.silent) pulseSaved();
      return true;
    }catch{
      if(!opts.silent) pulseSaveError("SAVE ERR");
      return false;
    }
  }
}

function captureHistorySnapshot_(currentPayload){
  if(typeof currentPayload !== "string") return;

  if(historyBaselineJson_ == null){
    historyBaselineJson_ = currentPayload;
    updateUndoRedoUi_();
    return;
  }

  if(currentPayload === historyBaselineJson_){
    updateUndoRedoUi_();
    return;
  }

  if(historySuspendDepth_ > 0){
    historyBaselineJson_ = currentPayload;
    updateUndoRedoUi_();
    return;
  }

  undoStack_.push(historyBaselineJson_);
  if(undoStack_.length > MAX_HISTORY_ENTRIES) undoStack_ = undoStack_.slice(-MAX_HISTORY_ENTRIES);
  redoStack_ = [];
  historyBaselineJson_ = currentPayload;
  updateUndoRedoUi_();
}

function sanitizeState(s){
  const base = mkEmptyState();
  if(!s || typeof s !== "object") return base;
  const projects = Array.isArray(s.projects) ? s.projects : [];
  return {
    version: Number(s.version || STORAGE_SCHEMA_VERSION) || STORAGE_SCHEMA_VERSION,
    projects: projects.map(sanitizeProject),
    activeProjectId: s.activeProjectId ?? null,
    activeModuleId: s.activeModuleId ?? null,
    activeMilestoneId: s.activeMilestoneId ?? null,
    activity: Array.isArray(s.activity) ? s.activity.slice(0, MAX_ACTIVITY) : [],
  };
}

function migrateState_(raw){
  if(!raw || typeof raw !== "object") return mkEmptyState();
  const next = { ...raw };
  const v = Number(next.version || 1) || 1;
  if(v < 2) next.version = 2;
  if(!next.version) next.version = STORAGE_SCHEMA_VERSION;
  return next;
}

function readStorageBackups_(){
  try{
    const raw = localStorage.getItem(STORAGE_BACKUPS_KEY);
    if(!raw) return [];
    const arr = JSON.parse(raw);
    if(!Array.isArray(arr)) return [];
    return arr.filter(x => x && typeof x.payload === "string" && Number.isFinite(Number(x.ts)));
  }catch{
    return [];
  }
}

function writeStorageBackups_(arr){
  try{
    localStorage.setItem(STORAGE_BACKUPS_KEY, JSON.stringify(arr.slice(0, MAX_STORAGE_BACKUPS)));
  }catch{
    // best-effort only
  }
}

function recordStorageSnapshot_(payload){
  try{
    const snap = String(payload || "");
    if(!snap) return;
    const prev = readStorageBackups_();
    if(prev[0] && prev[0].payload === snap) return;
    prev.unshift({ ts: Date.now(), payload: snap });
    writeStorageBackups_(prev);
  }catch{
    // ignore backup issues
  }
}

function pruneStorageBackups_(keep){
  const arr = readStorageBackups_();
  writeStorageBackups_(arr.slice(0, Math.max(0, keep|0)));
}

function recoverStateFromBackups_(){
  const backups = readStorageBackups_();
  for(const b of backups){
    try{
      const parsed = JSON.parse(String(b.payload || ""));
      return sanitizeState(migrateState_(parsed));
    }catch{
      // try next snapshot
    }
  }
  return null;
}

function sanitizeProject(p){
  const base = {
    id: String(p?.id ?? uid()),
    name: String(p?.name ?? "Untitled Project"),
    desc: String(p?.desc ?? ""),
    status: (p?.status === "paused" || p?.status === "done") ? p.status : "active",
    tag: String(p?.tag ?? ""),
    archived: Boolean(p?.archived),
    createdAt: Number(p?.createdAt ?? Date.now()),
  };

  // Preferred model: modules[]. Legacy model: milestones[] (migrate into a default module).
  let modules = [];
  if(Array.isArray(p?.modules)){
    modules = p.modules.map(sanitizeModule);
  }else if(Array.isArray(p?.milestones)){
    modules = [{
      id: uid(),
      name: "General",
      desc: "",
      status: "todo",
      tag: "",
      milestones: p.milestones.map(sanitizeMilestone),
      createdAt: Date.now(),
    }];
  }

  // Ensure at least one module + one milestone
  if(!modules.length){
    modules = [ mkModule("General") ];
  }else{
    for(const mod of modules){
      if(!Array.isArray(mod.milestones) || !mod.milestones.length){
        mod.milestones = [ mkMilestone("General") ];
      }
    }
  }

  return { ...base, modules };
}

function sanitizeModule(m){
  const mod = {
    id: String(m?.id ?? uid()),
    name: String(m?.name ?? "Module"),
    desc: String(m?.desc ?? ""),
    status: (m?.status === "doing" || m?.status === "done") ? m.status : "todo",
    tag: String(m?.tag ?? ""),
    createdAt: Number(m?.createdAt ?? Date.now()),
    milestones: Array.isArray(m?.milestones) ? m.milestones.map(sanitizeMilestone) : [],
  };
  if(!mod.milestones.length) mod.milestones = [ mkMilestone("General") ];
  return mod;
}

function sanitizeMilestone(m){
  return {
    id: String(m?.id ?? uid()),
    title: String(m?.title ?? "Untitled Milestone"),
    notes: String(m?.notes ?? ""),
    priority: (m?.priority === "p1" || m?.priority === "p3") ? m.priority : "p2",
    state: (m?.state === "doing" || m?.state === "done") ? m.state : "todo",
    createdAt: Number(m?.createdAt ?? Date.now()),
    tasks: Array.isArray(m?.tasks) ? m.tasks.map(sanitizeTask) : [],
  };
}

function sanitizeStep(s){
  return {
    id: String(s?.id ?? uid()),
    text: String(s?.text ?? ""),
    done: Boolean(s?.done),
    children: Array.isArray(s?.children) ? s.children.map(sanitizeStep).filter(c => c.text.trim()) : [],
  };
}

function sanitizeTask(t){
  const steps0 = Array.isArray(t?.steps) ? t.steps.map(sanitizeStep).filter(s => s.text.trim()) : [];
  const steps = autoNestStepsIfNeeded_(steps0);
  return {
    id: String(t?.id ?? uid()),
    title: String(t?.title ?? "Untitled Task"),
    done: Boolean(t?.done),
    severity: (t?.severity === "high" || t?.severity === "blocker") ? t.severity : "normal",
    assignee: String(t?.assignee ?? ""),
    createdAt: Number(t?.createdAt ?? Date.now()),
    steps,
  };
}


/* ---------------------------
   Steps: numbering-based nesting (e.g., 1.1 under 1)
---------------------------- */
function ensureStepChildren_(steps){
  if(!Array.isArray(steps)) return;
  for(const s of steps){
    if(!s || typeof s !== "object") continue;
    if(!Array.isArray(s.children)) s.children = [];
    ensureStepChildren_(s.children);
  }
}

function parseLeadingStepNumber_(text){
  const s = String(text || "").trim();
  // Matches "1. ...", "1) ...", "1.1 ...", "1.1.2 ...", and also "1.1" (end)
  const m = s.match(/^(\d+(?:\.\d+)*)(?:\s*[\)\.\-:])?(?:\s+|$)/);
  return m ? m[1] : null;
}

function nestStepsByNumbering_(flat){
  // Expects a flat list. Children arrays will be populated based on leading numbering.
  const roots = [];
  /** @type {Record<string, Step>} */
  const byNum = Object.create(null);
  /** @type {Record<string, Step[]>} */
  const waiting = Object.create(null);

  for(const st of (flat || [])){
    if(!st || typeof st !== "object") continue;
    if(!Array.isArray(st.children)) st.children = [];

    const num = parseLeadingStepNumber_(st.text);
    if(num && num.includes(".")){
      const parentNum = num.split(".").slice(0, -1).join(".");
      const parent = byNum[parentNum];
      if(parent){
        parent.children.push(st);
      }else{
        (waiting[parentNum] = waiting[parentNum] || []).push(st);
      }
    }else{
      roots.push(st);
    }

    if(num){
      byNum[num] = st;
      if(waiting[num] && waiting[num].length){
        st.children.push(...waiting[num]);
        delete waiting[num];
      }
    }
  }

  // Orphaned children (no parent found): keep as top-level.
  for(const k of Object.keys(waiting)){
    roots.push(...waiting[k]);
  }

  return roots;
}

function autoNestStepsIfNeeded_(steps){
  if(!Array.isArray(steps)) return [];
  ensureStepChildren_(steps);

  // If there is already a nested structure, keep it as-is.
  const alreadyNested = steps.some(s => Array.isArray(s.children) && s.children.length);
  if(alreadyNested) return steps;

  // Only nest when we actually see "x.y" style numbering.
  const wants = steps.some(s => {
    const num = parseLeadingStepNumber_(s.text);
    return !!(num && num.includes("."));
  });
  if(!wants) return steps;

  return nestStepsByNumbering_(steps);
}

function flattenSteps_(steps, out){
  const acc = out || [];
  for(const s of (steps || [])){
    if(!s) continue;
    acc.push(s);
    if(Array.isArray(s.children) && s.children.length) flattenSteps_(s.children, acc);
    // Clear children so we can rebuild a clean tree if needed.
    s.children = [];
  }
  return acc;
}

function rebuildStepsByNumbering_(steps){
  const flat = flattenSteps_(steps, []);
  return autoNestStepsIfNeeded_(flat);
}

function findStepByNumber_(steps, num){
  for(const s of (steps || [])){
    if(!s) continue;
    const sn = parseLeadingStepNumber_(s.text);
    if(sn === num) return s;
    const hit = findStepByNumber_(s.children, num);
    if(hit) return hit;
  }
  return null;
}

function insertStepByNumbering_(roots, step){
  if(!Array.isArray(roots) || !step || typeof step !== "object") return;
  ensureStepChildren_(roots);
  if(!Array.isArray(step.children)) step.children = [];

  const num = parseLeadingStepNumber_(step.text);
  if(num && num.includes(".")){
    const parentNum = num.split(".").slice(0, -1).join(".");
    const parent = findStepByNumber_(roots, parentNum);
    if(parent){
      if(!Array.isArray(parent.children)) parent.children = [];
      parent.children.push(step);
      return;
    }
  }
  roots.push(step);
}

function addStepToTask_(task, text, done){
  if(!task) return;
  task.steps = Array.isArray(task.steps) ? task.steps : [];
  // Ensure current steps are in a stable tree form before inserting.
  task.steps = autoNestStepsIfNeeded_(task.steps);

  /** @type {Step} */
  const s = { id: uid(), text: String(text || "").trim(), done: Boolean(done), children: [] };
  if(!s.text) return;

  insertStepByNumbering_(task.steps, s);
}

function findStepById_(steps, id){
  if(!id) return null;
  for(let i = 0; i < (steps || []).length; i++){
    const s = steps[i];
    if(s && s.id === id) return { step: s, list: steps, index: i };
    const hit = findStepById_(s?.children, id);
    if(hit) return hit;
  }
  return null;
}

function countSteps_(steps){
  let total = 0;
  let done = 0;
  const walk = (arr) => {
    for(const s of (arr || [])){
      total++;
      if(s.done) done++;
      if(Array.isArray(s.children) && s.children.length) walk(s.children);
    }
  };
  walk(steps);
  return { total, done };
}

function walkSteps_(steps, cb, depth = 0){
  for(const s of (steps || [])){
    cb(s, depth);
    if(Array.isArray(s.children) && s.children.length) walkSteps_(s.children, cb, depth + 1);
  }
}

function renderStepsHtml_(steps, depth = 0){
  let out = "";
  for(const s of (steps || [])){
    const ml = depth ? ` style="margin-left:${depth * 16}px"` : "";
    out += `
      <div class="step ${s.done ? "is-done" : ""}" data-step-id="${s.id}"${ml}>
        <button class="step__check" type="button" title="Toggle step"></button>
        <div class="step__text">${escapeHtml(s.text)}</div>
        <button class="step__edit" type="button" title="Edit step">✎</button>
        <button class="step__del" type="button" title="Delete step">×</button>
      </div>
    `;
    if(Array.isArray(s.children) && s.children.length){
      out += renderStepsHtml_(s.children, depth + 1);
    }
  }
  return out;
}

function mkEmptyState(){
  return { version: STORAGE_SCHEMA_VERSION, projects: [], activeProjectId: null, activeModuleId: null, activeMilestoneId: null, activity: [] };
}

function setStoreStatus_(label, cssVar){
  if(ui.storeDot) ui.storeDot.style.background = cssVar;
  if(ui.storeText) ui.storeText.textContent = label;
}

function pulseSaved(){
  setStoreStatus_("SAVED", "var(--ok)");
  safeAnime(() => {
    const { animate } = anime;
    animate({
      targets: ui.storeDot,
      scale: [1, 1.6, 1],
      duration: 420,
      easing: "easeOutQuad",
    });
  });
}

function pulseDirty(){
  setStoreStatus_("DIRTY", "var(--warn)");
  safeAnime(() => {
    const { animate } = anime;
    animate({
      targets: ui.storeDot,
      scale: [1, 1.6, 1],
      duration: 420,
      easing: "easeOutQuad",
    });
  });
}

function pulseSaveError(label = "SAVE ERR"){
  setStoreStatus_(label, "var(--warn)");
  safeAnime(() => {
    const { animate } = anime;
    animate({
      targets: ui.storeDot,
      scale: [1, 1.9, 1],
      duration: 520,
      easing: "easeOutQuad",
    });
  });
}

function canUndo_(){ return undoStack_.length > 0; }
function canRedo_(){ return redoStack_.length > 0; }

function updateUndoRedoUi_(){
  if(ui.btnUndo){
    ui.btnUndo.disabled = !canUndo_();
    ui.btnUndo.title = canUndo_() ? `Undo (${undoStack_.length})` : "Undo";
  }
  if(ui.btnRedo){
    ui.btnRedo.disabled = !canRedo_();
    ui.btnRedo.title = canRedo_() ? `Redo (${redoStack_.length})` : "Redo";
  }
}

function isTypingTarget_(el){
  if(!el) return false;
  const tag = (el.tagName || "").toLowerCase();
  if(tag === "input" || tag === "textarea" || tag === "select") return true;
  if(el.isContentEditable) return true;
  return false;
}

function wireHistoryShortcuts_(){
  document.addEventListener("keydown", (e) => {
    if(e.defaultPrevented) return;
    if(isTypingTarget_(e.target)) return;
    const key = String(e.key || "").toLowerCase();
    const mod = !!(e.ctrlKey || e.metaKey);
    if(!mod) return;

    if(key === "z" && e.shiftKey){
      e.preventDefault();
      redoState_();
      return;
    }
    if(key === "z"){
      e.preventDefault();
      undoState_();
      return;
    }
    if(key === "y"){
      e.preventDefault();
      redoState_();
    }
  });
}

function applySnapshotState_(snapshotJson, mode){
  try{
    const parsed = JSON.parse(String(snapshotJson || ""));
    const restored = sanitizeState(migrateState_(parsed));
    historySuspendDepth_++;
    state = restored;
    reconcileActiveSelection_();
    try{ historyBaselineJson_ = JSON.stringify(state); }catch{ historyBaselineJson_ = snapshotJson; }
    saveState({ immediate:true, skipHistory:true });
  }catch(err){
    pulseSaveError("UNDO ERR");
    return false;
  }finally{
    historySuspendDepth_ = Math.max(0, historySuspendDepth_ - 1);
  }

  importCandidate = null;
  renderImportPreview();
  renderAll();
  setStoreStatus_(mode === "redo" ? "REDO" : "UNDO", "var(--ok)");
  updateUndoRedoUi_();
  return true;
}

function undoState_(){
  if(!canUndo_()) return false;
  let current = null;
  try{ current = JSON.stringify(state); }catch{ current = historyBaselineJson_; }
  const prev = undoStack_.pop();
  if(typeof prev !== "string"){
    updateUndoRedoUi_();
    return false;
  }
  if(typeof current === "string" && current) redoStack_.push(current);
  if(redoStack_.length > MAX_HISTORY_ENTRIES) redoStack_ = redoStack_.slice(-MAX_HISTORY_ENTRIES);
  const ok = applySnapshotState_(prev, "undo");
  if(!ok && typeof current === "string" && current){
    redoStack_.pop();
    undoStack_.push(prev);
  }
  updateUndoRedoUi_();
  return ok;
}

function redoState_(){
  if(!canRedo_()) return false;
  let current = null;
  try{ current = JSON.stringify(state); }catch{ current = historyBaselineJson_; }
  const next = redoStack_.pop();
  if(typeof next !== "string"){
    updateUndoRedoUi_();
    return false;
  }
  if(typeof current === "string" && current) undoStack_.push(current);
  if(undoStack_.length > MAX_HISTORY_ENTRIES) undoStack_ = undoStack_.slice(-MAX_HISTORY_ENTRIES);
  const ok = applySnapshotState_(next, "redo");
  if(!ok && typeof current === "string" && current){
    undoStack_.pop();
    redoStack_.push(next);
  }
  updateUndoRedoUi_();
  return ok;
}

/* ---------------------------
   Helpers
---------------------------- */
function uid(){
  return Math.random().toString(16).slice(2) + "-" + Date.now().toString(16);
}

function fmtPct(n){
  return `${Math.max(0, Math.min(100, Math.round(n)))}%`;
}

function safeAnime(fn){
  try{
    if(window.anime) fn();
  }catch{ /* ignore */ }
}

function addActivity(msg){
  state.activity.unshift({ ts: Date.now(), msg });
  state.activity = state.activity.slice(0, MAX_ACTIVITY);
}

function getActiveProject(){
  if(!state.activeProjectId) return null;
  return state.projects.find(p => p.id === state.activeProjectId) ?? null;
}

function getActiveModule(project){
  if(!project) return null;
  const mods = Array.isArray(project.modules) ? project.modules : [];
  if(!mods.length) return null;
  if(state.activeModuleId){
    const hit = mods.find(m => m.id === state.activeModuleId);
    if(hit) return hit;
  }
  return mods[0] ?? null;
}

function getActiveMilestone(project){
  if(!project || !state.activeMilestoneId) return null;
  const mod = getActiveModule(project);
  const msList = Array.isArray(mod?.milestones) ? mod.milestones : [];
  return msList.find(m => m.id === state.activeMilestoneId) ?? null;
}

function computeCounts(){
  let milestones = 0;
  let tasks = 0;
  let done = 0;

  for(const p of state.projects){
    const mods = Array.isArray(p?.modules) ? p.modules : [];
    for(const mod of mods){
      const msList = Array.isArray(mod?.milestones) ? mod.milestones : [];
      milestones += msList.length;
      for(const m of msList){
        const ts = Array.isArray(m?.tasks) ? m.tasks : [];
        tasks += ts.length;
        done += ts.filter(t => t && t.done).length;
      }
    }
  }

  return { projects: state.projects.length, milestones, tasks, done };
}

function computeProjectCounts(p){
  let milestones = 0;
  let tasks = 0;
  let done = 0;

  // Preferred model: modules -> milestones -> tasks
  if(Array.isArray(p?.modules)){
    for(const mod of p.modules){
      const msList = Array.isArray(mod?.milestones) ? mod.milestones : [];
      milestones += msList.length;
      for(const m of msList){
        const ts = Array.isArray(m?.tasks) ? m.tasks : [];
        tasks += ts.length;
        done += ts.filter(t => t && t.done).length;
      }
    }
    return { milestones, tasks, done };
  }

  // Legacy model: project.milestones
  const msLegacy = Array.isArray(p?.milestones) ? p.milestones : [];
  milestones = msLegacy.length;
  for(const m of msLegacy){
    const ts = Array.isArray(m?.tasks) ? m.tasks : [];
    tasks += ts.length;
    done += ts.filter(t => t && t.done).length;
  }

  return { milestones, tasks, done };
}

function computeMilestoneCounts(m){
  const tasks = m.tasks.length;
  const done = m.tasks.filter(t => t.done).length;
  return { tasks, done, pct: tasks ? (done / tasks) * 100 : 0 };
}

function reconcileActiveSelection_(){
  let changed = false;

  if(!Array.isArray(state.projects)){
    state.projects = [];
    changed = true;
  }

  if(!state.projects.length){
    if(state.activeProjectId !== null){ state.activeProjectId = null; changed = true; }
    if(state.activeModuleId !== null){ state.activeModuleId = null; changed = true; }
    if(state.activeMilestoneId !== null){ state.activeMilestoneId = null; changed = true; }
    return changed;
  }

  let p = state.projects.find(x => x && x.id === state.activeProjectId) || null;
  if(!p){
    state.activeProjectId = state.projects[0].id;
    p = state.projects[0];
    changed = true;
  }

  const mods = Array.isArray(p.modules) ? p.modules : [];
  if(!mods.length){
    if(state.activeModuleId !== null){ state.activeModuleId = null; changed = true; }
    if(state.activeMilestoneId !== null){ state.activeMilestoneId = null; changed = true; }
    return changed;
  }

  let mod = mods.find(x => x && x.id === state.activeModuleId) || null;
  if(!mod){
    state.activeModuleId = mods[0].id;
    mod = mods[0];
    changed = true;
  }

  const msList = Array.isArray(mod.milestones) ? mod.milestones : [];
  const nextMsId = (msList.find(x => x && x.id === state.activeMilestoneId) || msList[0] || {}).id ?? null;
  if(state.activeMilestoneId !== nextMsId){
    state.activeMilestoneId = nextMsId;
    changed = true;
  }

  return changed;
}

function setActiveProject(id){
  state.activeProjectId = id;
  const p = getActiveProject();
  if(p){
    // Ensure module + milestone selection is valid
    const mods = Array.isArray(p.modules) ? p.modules : [];
    if(mods.length){
      if(!state.activeModuleId || !mods.some(m => m.id === state.activeModuleId)){
        state.activeModuleId = mods[0].id;
      }
      const mod = mods.find(m => m.id === state.activeModuleId) || mods[0];
      if(mod){
        const msList = Array.isArray(mod.milestones) ? mod.milestones : [];
        if(!state.activeMilestoneId || !msList.some(m => m.id === state.activeMilestoneId)){
          state.activeMilestoneId = msList[0]?.id ?? null;
        }
      } else {
        state.activeMilestoneId = null;
      }
    } else {
      state.activeModuleId = null;
      state.activeMilestoneId = null;
    }

    addActivity(`Active project: ${p.name}`);
  } else {
    state.activeModuleId = null;
    state.activeMilestoneId = null;
  }
  saveState();
  renderAll();
}


function setActiveModule(id){
  state.activeModuleId = id;
  const p = getActiveProject();
  if(p){
    const mod = getActiveModule(p);
    if(mod){
      const msList = Array.isArray(mod.milestones) ? mod.milestones : [];
      if(!state.activeMilestoneId || !msList.some(m => m.id === state.activeMilestoneId)){
        state.activeMilestoneId = msList[0]?.id ?? null;
      }
      addActivity(`Active module: ${mod.name}`);
    } else {
      state.activeMilestoneId = null;
    }
  } else {
    state.activeMilestoneId = null;
  }
  saveState();
  renderAll();
}

function setActiveMilestone(id){
  const p = getActiveProject();

  // If the milestone belongs to a different module, switch module too.
  if(p){
    const mods = Array.isArray(p.modules) ? p.modules : [];
    const parent = mods.find(mod => (Array.isArray(mod.milestones) ? mod.milestones : []).some(ms => ms.id === id)) || null;
    if(parent) state.activeModuleId = parent.id;
  }

  state.activeMilestoneId = id;

  const m = p ? getActiveMilestone(p) : null;
  if(m) addActivity(`Active milestone: ${m.title}`);
  saveState();
  renderAll();
}

