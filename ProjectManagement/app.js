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
  milestoneScopeHint: $("#milestoneScopeHint"),

  moduleDesc: $("#moduleDesc"),

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
  previewProjectName: $("#previewProjectName"),
  previewMilestones: $("#previewMilestones"),
  previewTasks: $("#previewTasks"),
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


boot();

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
    // keep most recent lines visible
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

/* ---------------------------
   Tabs + animation
---------------------------- */
function wireTabs(){
  ui.tabs.forEach(btn => {
    btn.addEventListener("click", () => {
      const tab = btn.dataset.tab;
      switchTab(tab);
    });
  });
}

function switchTab(tabName){
  const token = ++tabSwitchToken;

  const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const main = document.querySelector(".main");
  const wipe = document.querySelector("#tabWipe");

  const currentPanel = document.querySelector(".tab.is-active");
  const currentName = currentPanel ? currentPanel.dataset.tab : null;
  if(currentName === tabName) return;

  const nextPanel = document.querySelector(`.tab[data-tab="${tabName}"]`);
  if(!nextPanel) return;

  // Determine direction based on nav order.
  const order = ["dashboard","projects","milestones","checklist","import"];
  const currentIndex = Math.max(0, order.indexOf(currentName));
  const nextIndex = Math.max(0, order.indexOf(tabName));
  const dir = (nextIndex >= currentIndex) ? "forward" : "back";

  // Update nav state immediately.
  ui.tabs.forEach(b => b.classList.toggle("is-active", b.dataset.tab === tabName));

  if(main){
    main.dataset.dir = dir;
  }

  // Reduced motion: instant swap.
  if(reduceMotion){
    ui.tabPanels.forEach(p => {
      const active = p.dataset.tab === tabName;
      p.classList.toggle("is-active", active);
      p.classList.remove("slide-in-left","slide-in-right","slide-out-left","slide-out-right");
      p.setAttribute("aria-hidden", active ? "false" : "true");
      p.style.opacity = "";
      p.style.transform = "";
      p.style.filter = "";
    });
    if(main) main.classList.remove("is-switching");
    return;
  }

  // Clear inline styles + cancel WAAPI animations that could keep panels stuck.
  [currentPanel, nextPanel].forEach(el => {
    if(!el) return;
    el.style.opacity = "";
    el.style.transform = "";
    el.style.filter = "";
    try{ if(el.getAnimations) el.getAnimations().forEach(a => a.cancel()); }catch{ /* ignore */ }
  });

  // Trigger wipe sweep (restart animation each time).
  if(main && wipe){
    main.classList.remove("is-switching");
    void wipe.offsetWidth; // force reflow so animation restarts
    main.classList.add("is-switching");
    setTimeout(() => {
      if(token !== tabSwitchToken) return;
      main.classList.remove("is-switching");
    }, 1120);
  }

  // EXIT: keep .is-active on the current panel while applying slide-out,
  // so it animates from visible -> hidden instead of disappearing instantly.
  if(currentPanel){
    currentPanel.classList.remove("slide-in-left","slide-in-right","slide-out-left","slide-out-right");
    currentPanel.classList.add(dir === "forward" ? "slide-out-left" : "slide-out-right");
    currentPanel.setAttribute("aria-hidden", "true");
    // Keep pointer events off during the exit.
    currentPanel.style.pointerEvents = "none";
  }

  // ENTER: set a true "from" state (slide-in-*) then remove it next frame to animate to .is-active baseline.
  nextPanel.classList.remove("slide-in-left","slide-in-right","slide-out-left","slide-out-right");
  nextPanel.classList.add("is-active", dir === "forward" ? "slide-in-right" : "slide-in-left");
  nextPanel.setAttribute("aria-hidden", "false");

  setTimeout(() => {
    requestAnimationFrame(() => {
      if(token !== tabSwitchToken) return;
      nextPanel.classList.remove("slide-in-left","slide-in-right");
      animateTabItems_(nextPanel, dir, token);
    });
  }, 140);

  // Cleanup: after transition, fully deactivate the previous panel and clear helper classes.
  if(currentPanel){
    setTimeout(() => {
      if(token !== tabSwitchToken) return;
      currentPanel.classList.remove("slide-out-left","slide-out-right");
      currentPanel.classList.remove("is-active");
      currentPanel.style.pointerEvents = "";
      currentPanel.style.opacity = "";
      currentPanel.style.transform = "";
      currentPanel.style.filter = "";
    }, 980);
  }
}








/* ---------------------------
   HUD item entrance (tab content)
---------------------------- */
function animateTabItems_(panel, dir, token){
  if(!panel) return;

  const reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  if(reduceMotion) return;

  const tab = panel.dataset.tab || "";
  if(!(tab === "dashboard" || tab === "projects" || tab === "milestones" || tab === "checklist")) return;

  /** @type {HTMLElement[]} */
  let targets = [];

  if(tab === "dashboard"){
    targets = Array.from(panel.querySelectorAll("#dashMilestoneList .item, #dashActivityList .item, #hotlist .hot"));
  }else if(tab === "projects"){
    targets = Array.from(panel.querySelectorAll("#projectList .item"));
  }else if(tab === "milestones"){
    targets = Array.from(panel.querySelectorAll("#milestoneList .item"));
  }else if(tab === "checklist"){
    targets = Array.from(panel.querySelectorAll("#taskList .task"));
  }

  // Keep it snappy on very large lists.
  const MAX = 28;
  targets = targets.slice(0, MAX);

  if(!targets.length) return;

  const fromX = (dir === "forward") ? 40 : -40;

  // Prep initial state (avoid leaving inline transforms behind by clearing on complete).
  for(const el of targets){
    el.style.willChange = "transform, opacity";
    el.style.opacity = "0";
    el.style.transform = `translateX(${fromX}px) translateY(10px) translateZ(-18px) scale(0.985)`;
  }

  safeAnime(() => {
    const { animate } = anime;
    animate({
      targets,
      opacity: [0, 1],
      translateX: [fromX, 0],
      translateY: [10, 0],
      translateZ: [-18, 0],
      scale: [0.985, 1],
      delay: (_, i) => 80 + (34 * i),
      duration: 780,
      easing: "easeOutQuad",
      complete: () => {
        if(token !== tabSwitchToken) return;
        for(const el of targets){
          el.style.willChange = "";
          el.style.opacity = "";
          el.style.transform = "";
        }
      },
    });
  });
}

/* ---------------------------
   Topbar
---------------------------- */
function tickClock(){
  const d = new Date();
  ui.nowText.textContent = d.toLocaleTimeString([], { hour12:false });
}

function initTopbarDeclutter_(){
  const topbarRight = document.querySelector('#topbarRight') || document.querySelector('.topbar__right');
  if(!topbarRight) return;

  if(topbarRight._topbarDeclutterSync){
    try{ topbarRight._topbarDeclutterSync(); }catch(err){ console.warn('Topbar declutter resync failed', err); }
    return;
  }

  const hiddenClass = 'topbar__btn-hidden';
  const coreVisibleIds = new Set(['btnUndo', 'btnRedo', 'btnUiMode']);
  const exportIds = ['btnExportJson', 'btnExportMd', 'btnExportTxt'];
  const toolsFixedIds = ['btnWipe'];
  const advancedOnlyToolIds = new Set([
    'phase8BtnNotifications',
    'phase9BtnReminders',
    'phase10BtnRecovery',
    'phase11BtnSla',
    'phase11BtnDashViews',
    'phase12BtnRiskDigest',
    'phase12BtnCheckins',
    'phase13BtnAutomation',
    'phase15BtnRoles',
    'phase16BtnTeamProfiles'
  ]);
  const proxyMap = new Map();
  let autoIdSeq = 0;

  function ensureId_(el){
    if(!el) return '';
    if(el.id) return el.id;
    autoIdSeq += 1;
    el.id = `topbarAutoBtn_${autoIdSeq}`;
    return el.id;
  }

  function safeLabel_(el){
    const text = String((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
    return text || String(el?.title || 'Action').trim() || 'Action';
  }

  function mkMenu_(key, triggerLabel, anchorEl){
    const existing = topbarRight.querySelector(`.topbar-menu[data-menu-key="${key}"]`);
    if(existing){
      return {
        root: existing,
        trigger: existing.querySelector('.topbar-menu__trigger'),
        panel: existing.querySelector('.topbar-menu__panel')
      };
    }

    const root = document.createElement('div');
    root.className = 'topbar-menu';
    root.dataset.menuKey = key;

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'btn btn--ghost topbar-menu__trigger';
    trigger.setAttribute('aria-haspopup', 'menu');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.textContent = triggerLabel;

    const panel = document.createElement('div');
    panel.className = 'topbar-menu__panel';
    panel.setAttribute('role', 'menu');

    root.appendChild(trigger);
    root.appendChild(panel);

    const anchor = anchorEl && anchorEl.parentElement === topbarRight ? anchorEl : null;
    topbarRight.insertBefore(root, anchor);

    trigger.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const isOpen = root.classList.contains('is-open');
      closeMenus_();
      if(!isOpen){
        syncProxyStates_();
        root.classList.add('is-open');
        trigger.setAttribute('aria-expanded', 'true');
      }
    });

    return { root, trigger, panel };
  }

  function closeMenus_(){
    topbarRight.querySelectorAll('.topbar-menu.is-open').forEach((menu) => {
      menu.classList.remove('is-open');
      const t = menu.querySelector('.topbar-menu__trigger');
      if(t) t.setAttribute('aria-expanded', 'false');
    });
  }

  document.addEventListener('click', (ev) => {
    if(!topbarRight.contains(ev.target)) closeMenus_();
  });
  document.addEventListener('keydown', (ev) => {
    if(ev.key === 'Escape') closeMenus_();
  });

  const exportMenu = mkMenu_('export', 'Export ▾', document.getElementById('btnExportJson'));
  const toolsMenu = mkMenu_('tools', 'Tools ▾', document.getElementById('btnWipe'));

  function ensureSection_(panel, key, label){
    let sec = panel.querySelector(`.topbar-menu__section[data-section-key="${key}"]`);
    if(!sec){
      sec = document.createElement('div');
      sec.className = 'topbar-menu__section';
      sec.dataset.sectionKey = key;
      sec.textContent = label;
      panel.appendChild(sec);
    }
    return sec;
  }

  ensureSection_(exportMenu.panel, 'exports', 'Exports');
  ensureSection_(toolsMenu.panel, 'tools', 'Topbar Tools');

  function upsertProxy_(menuPanel, targetEl, opts){
    if(!menuPanel || !targetEl) return;
    if(targetEl.dataset.topbarProxy === '1') return;

    const targetId = ensureId_(targetEl);
    if(!targetId) return;

    let proxy = proxyMap.get(targetId);
    if(!proxy){
      proxy = document.createElement('button');
      proxy.type = 'button';
      proxy.className = 'btn btn--ghost topbar-menu__item';
      proxy.dataset.topbarProxy = '1';
      proxy.dataset.proxyFor = targetId;
      proxy.addEventListener('click', () => {
        closeMenus_();
        const target = document.getElementById(targetId);
        if(target && !target.disabled){
          target.click();
        }
      });
      proxyMap.set(targetId, proxy);
      menuPanel.appendChild(proxy);
    }else if(proxy.parentElement !== menuPanel){
      menuPanel.appendChild(proxy);
    }

    targetEl.classList.add(hiddenClass);
    targetEl.setAttribute('aria-hidden', 'true');
    targetEl.tabIndex = -1;

    const label = opts && opts.label ? opts.label : safeLabel_(targetEl);
    proxy.textContent = label;
    proxy.title = String(targetEl.title || label);
    proxy.disabled = !!targetEl.disabled;
    const advancedOnly = !!((opts && opts.advancedOnly) || advancedOnlyToolIds.has(targetId));
    proxy.dataset.advancedOnly = advancedOnly ? '1' : '0';
    proxy.classList.toggle('btn--danger', !!(opts && opts.danger));
    proxy.classList.toggle('is-danger', !!(opts && opts.danger));
    if(opts && opts.danger){
      proxy.classList.remove('btn--ghost');
    }else{
      proxy.classList.add('btn--ghost');
      proxy.classList.remove('btn--danger');
      proxy.classList.remove('is-danger');
    }
  }

  function syncProxyStates_(){
    let isAdvMode = true;
    try{
      if(typeof phase18UiModeIsAdvanced_ === 'function') isAdvMode = !!phase18UiModeIsAdvanced_();
    }catch{}

    proxyMap.forEach((proxy, targetId) => {
      const target = document.getElementById(targetId);
      if(!target){
        proxy.remove();
        proxyMap.delete(targetId);
        return;
      }

      const isAdvancedOnly = (proxy.dataset.advancedOnly === '1') || advancedOnlyToolIds.has(targetId);
      const hiddenForMode = isAdvancedOnly && !isAdvMode;
      proxy.classList.toggle('phase18uimode-hidden', hiddenForMode);
      proxy.disabled = hiddenForMode || !!target.disabled;

      const nextLabel = safeLabel_(target);
      if(proxy.dataset.proxyFor && !proxy.dataset.customLabel){
        proxy.textContent = nextLabel;
      }
      if(target.classList) target.classList.add(hiddenClass);
    });
  }

  function syncMenus_(){
    exportIds.forEach((id) => {
      const el = document.getElementById(id);
      if(el) upsertProxy_(exportMenu.panel, el, { label: safeLabel_(el), danger:false });
    });

    toolsFixedIds.forEach((id) => {
      const el = document.getElementById(id);
      if(el) upsertProxy_(toolsMenu.panel, el, { label: safeLabel_(el), danger:true });
    });

    const directButtons = Array.from(topbarRight.children).filter((child) => child && child.tagName === 'BUTTON');
    directButtons.forEach((btn) => {
      if(btn.dataset.topbarProxy === '1') return;
      const id = ensureId_(btn);
      if(!id) return;
      if(coreVisibleIds.has(id)) return;
      if(exportIds.includes(id)) return;
      if(toolsFixedIds.includes(id)) return;
      upsertProxy_(toolsMenu.panel, btn, { label: safeLabel_(btn), danger: btn.classList.contains('btn--danger') });
    });

    syncProxyStates_();
  }

  let syncQueued = false;
  function queueSync_(){
    if(syncQueued) return;
    syncQueued = true;
    setTimeout(() => {
      syncQueued = false;
      syncMenus_();
    }, 0);
  }

  const observer = new MutationObserver((mutations) => {
    for(const m of mutations){
      if(m.type === 'childList'){
        queueSync_();
        return;
      }
    }
  });
  observer.observe(topbarRight, { childList:true });

  topbarRight._topbarDeclutterSync = syncMenus_;
  topbarRight._topbarDeclutterObserver = observer;

  syncMenus_();
}

function openPanelInOwningTab_(selector, fallbackTab, delay){
  const pickDelay = Number(delay);
  const waitMs = Number.isFinite(pickDelay) ? Math.max(0, pickDelay) : 40;
  const fallback = String(fallbackTab || 'dashboard');
  const findTarget = () => {
    try{ return document.querySelector(selector); }catch{ return null; }
  };
  const scrollWithTopPad_ = (node) => {
    if(!node) return;
    try{ scrollIntoViewWithTopPad_(node, { behavior:'smooth', block:'start' }, 18); }catch{}
  };

  let target = findTarget();
  let tabId = fallback;
  try{
    const ownerTab = target && target.closest ? target.closest('.tab[data-tab]') : null;
    const detected = ownerTab && ownerTab.dataset ? String(ownerTab.dataset.tab || '').trim() : '';
    if(detected) tabId = detected;
  }catch{}

  try{ switchTab(tabId); }catch{}

  setTimeout(() => {
    const node = findTarget();
    if(!node){
      if(fallback && tabId !== fallback){
        try{ switchTab(fallback); }catch{}
        setTimeout(() => {
          const fallbackNode = findTarget();
          if(fallbackNode) scrollWithTopPad_(fallbackNode);
        }, 30);
      }
      return;
    }
    scrollWithTopPad_(node);
  }, waitMs);
}

function scrollIntoViewWithTopPad_(node, opts, topPad){
  if(!node) return false;
  const padNum = Number(topPad);
  const pad = Number.isFinite(padNum) ? Math.max(0, Math.round(padNum)) : 18;
  const options = (opts && typeof opts === 'object') ? opts : {};
  const behavior = (typeof options.behavior === 'string' && options.behavior) ? options.behavior : 'auto';

  try{
    const tabScroller = node.closest ? node.closest('.tab') : null;
    if(tabScroller && typeof tabScroller.scrollTop === 'number'){
      const tabRect = tabScroller.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      const delta = nodeRect.top - tabRect.top;
      const nextTop = Math.max(0, Math.round(tabScroller.scrollTop + delta - pad));
      tabScroller.scrollTo({ top: nextTop, behavior });
      return true;
    }
  }catch{}

  const native = scrollIntoViewWithTopPad_._native || null;
  try{
    if(typeof native === 'function'){
      const nextOpts = Object.assign({}, options, { block:'start', behavior });
      native.call(node, nextOpts);
    }else{
      node.scrollIntoView({ behavior, block:'start' });
    }
  }catch{}
  try{ window.scrollBy({ top: -pad, behavior }); }catch{}
  return true;
}

function installScrollIntoViewTopPadPatch_(){
  if(installScrollIntoViewTopPadPatch_._done) return;
  const proto = (typeof Element !== 'undefined' && Element.prototype) ? Element.prototype : null;
  if(!proto || typeof proto.scrollIntoView !== 'function') return;

  const native = proto.scrollIntoView;
  if(native && native._pmTopPadPatched){
    installScrollIntoViewTopPadPatch_._done = true;
    return;
  }

  scrollIntoViewWithTopPad_._native = native;

  const patched = function(arg){
    try{
      if(arg && typeof arg === 'object'){
        const block = String(arg.block || '').toLowerCase();
        if(block === 'start'){
          scrollIntoViewWithTopPad_(this, arg, 18);
          return;
        }
      }
    }catch{}
    return native.apply(this, arguments);
  };
  try{ patched._pmTopPadPatched = true; }catch{}
  proto.scrollIntoView = patched;
  installScrollIntoViewTopPadPatch_._done = true;
}

installScrollIntoViewTopPadPatch_();


function ensureUiDialogHost_(){
  if(typeof document === 'undefined') return null;
  let host = document.getElementById('pmUiDialogHost');
  if(host) return host;

  try{
    const style = document.createElement('style');
    style.id = 'pmUiDialogStyles';
    style.textContent = `
      body.pm-ui-dialog-open{overflow:hidden}
      .pm-ui-dialog{position:fixed;inset:0;display:none;align-items:center;justify-content:center;z-index:9999;padding:16px}
      .pm-ui-dialog.is-open,.pm-ui-dialog.is-closing{display:flex}
      .pm-ui-dialog__backdrop{
        position:absolute;inset:0;
        background:
          radial-gradient(900px 520px at 15% 10%, rgba(56,246,255,.08), transparent 58%),
          radial-gradient(900px 560px at 85% 88%, rgba(155,92,255,.10), transparent 62%),
          rgba(6,10,18,.76);
        backdrop-filter:blur(4px);
        opacity:0;
        will-change:opacity;
      }
      .pm-ui-dialog__card{
        position:relative;z-index:1;
        opacity:0;
        transform:translateY(10px) scale(.985);
        will-change:transform, opacity;
        width:min(620px,calc(100vw - 32px));max-width:620px;max-height:min(88vh,760px);overflow:auto;
        border-radius:16px;
        border:1px solid rgba(56,246,255,.18);
        background:
          radial-gradient(520px 180px at 14% 0%, rgba(56,246,255,.10), transparent 62%),
          radial-gradient(420px 180px at 88% 14%, rgba(155,92,255,.10), transparent 62%),
          linear-gradient(180deg, rgba(12,18,28,.96), rgba(10,18,28,.92));
        box-shadow:0 28px 72px rgba(0,0,0,.48), 0 0 0 1px rgba(155,92,255,.07) inset;
        padding:14px 14px 12px;
        color:var(--txt, #d7ecff);
      }
      .pm-ui-dialog__head{
        display:flex;align-items:center;justify-content:space-between;gap:10px;
        margin:0 0 10px;padding-bottom:8px;
        border-bottom:1px solid rgba(56,246,255,.08);
      }
      .pm-ui-dialog__kind{
        display:inline-flex;align-items:center;gap:6px;
        font-size:10px;font-weight:700;letter-spacing:.10em;text-transform:uppercase;
        border-radius:999px;padding:4px 9px;
        border:1px solid rgba(56,246,255,.20);
        background:rgba(10,18,28,.34);
        color:var(--muted, #8fb9d6);
        box-shadow:0 0 0 1px rgba(155,92,255,.05) inset;
      }
      .pm-ui-dialog[data-kind="alert"] .pm-ui-dialog__kind{
        border-color:rgba(56,246,255,.26);
        background:rgba(56,246,255,.09);
        color:rgba(215,236,255,.94);
      }
      .pm-ui-dialog[data-kind="confirm"] .pm-ui-dialog__kind{
        border-color:rgba(155,92,255,.28);
        background:rgba(155,92,255,.09);
        color:rgba(215,236,255,.94);
      }
      .pm-ui-dialog[data-kind="prompt"] .pm-ui-dialog__kind{
        border-color:rgba(56,246,255,.24);
        background:rgba(56,246,255,.07);
        color:rgba(215,236,255,.94);
      }
      .pm-ui-dialog[data-danger="1"] .pm-ui-dialog__kind{
        border-color:rgba(255,77,125,.34);
        background:rgba(255,77,125,.10);
        color:rgba(255,226,236,.96);
      }
      .pm-ui-dialog__title{
        font-size:13px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;
        color:rgba(215,236,255,.96);margin:0;
        font-family:var(--mono, ui-monospace);
      }
      .pm-ui-dialog__message{
        white-space:pre-wrap;line-height:1.5;font-size:13px;opacity:.98;
        color:rgba(215,236,255,.94);
      }
      .pm-ui-dialog__hint{
        margin-top:8px;font-size:11px;opacity:.92;
        color:var(--muted, #8fb9d6);
        font-family:var(--mono, ui-monospace);
      }
      .pm-ui-dialog__input{
        width:100%;margin-top:10px;padding:10px 12px;border-radius:12px;
        border:1px solid rgba(56,246,255,.14);
        background:rgba(10,18,28,.28);
        color:var(--txt, #d7ecff);
        font:inherit;
        box-shadow:0 0 0 1px rgba(155,92,255,.03) inset;
        outline:none;
      }
      .pm-ui-dialog__input::placeholder{color:rgba(143,185,214,.72)}
      .pm-ui-dialog__input:focus{
        border-color:rgba(56,246,255,.36);
        box-shadow:0 0 0 3px rgba(56,246,255,.10), 0 0 0 1px rgba(155,92,255,.10) inset;
      }
      .pm-ui-dialog__actions{
        display:flex;justify-content:flex-end;gap:8px;margin-top:12px;flex-wrap:wrap;
        padding-top:10px;border-top:1px solid rgba(56,246,255,.06);
      }
      .pm-ui-dialog__btn{
        appearance:none;border:1px solid rgba(56,246,255,.14);
        background:rgba(10,18,28,.28);
        color:rgba(215,236,255,.92);
        border-radius:12px;padding:9px 12px;
        font:12px var(--mono, ui-monospace);
        letter-spacing:.06em;
        cursor:pointer;min-width:84px;
        transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease, background .12s ease;
      }
      .pm-ui-dialog__btn:hover{
        transform:translateY(-1px);
        border-color:rgba(56,246,255,.24);
        background:rgba(10,18,28,.40);
        box-shadow:0 0 18px rgba(56,246,255,.08);
      }
      .pm-ui-dialog__btn:active{transform:translateY(0)}
      .pm-ui-dialog__btn:focus-visible{
        outline:none;
        border-color:rgba(56,246,255,.34);
        box-shadow:0 0 0 3px rgba(56,246,255,.12), 0 0 0 1px rgba(155,92,255,.08) inset;
      }
      .pm-ui-dialog__btn--primary{
        background:linear-gradient(180deg, rgba(56,246,255,.18), rgba(56,246,255,.08));
        border-color:rgba(56,246,255,.26);
        color:rgba(215,236,255,.96);
      }
      .pm-ui-dialog__btn--primary:hover{
        border-color:rgba(56,246,255,.40);
        box-shadow:0 0 22px rgba(56,246,255,.12);
      }
      .pm-ui-dialog__btn--danger{
        background:linear-gradient(180deg, rgba(255,77,125,.18), rgba(255,77,125,.08));
        border-color:rgba(255,77,125,.26);
        color:rgba(255,235,241,.97);
      }
      .pm-ui-dialog__btn--danger:hover{
        border-color:rgba(255,77,125,.40);
        box-shadow:0 0 22px rgba(255,77,125,.12);
      }

      .pm-ui-dialog.is-open .pm-ui-dialog__backdrop{animation:pmUiDialogBackdropIn .16s ease-out forwards}
      .pm-ui-dialog.is-open .pm-ui-dialog__card{animation:pmUiDialogCardIn .18s cubic-bezier(.2,.8,.2,1) forwards}
      .pm-ui-dialog.is-closing .pm-ui-dialog__backdrop{animation:pmUiDialogBackdropOut .12s ease-in forwards}
      .pm-ui-dialog.is-closing .pm-ui-dialog__card{animation:pmUiDialogCardOut .14s ease-in forwards}
      @keyframes pmUiDialogBackdropIn{from{opacity:0}to{opacity:1}}
      @keyframes pmUiDialogBackdropOut{from{opacity:1}to{opacity:0}}
      @keyframes pmUiDialogCardIn{from{opacity:0;transform:translateY(10px) scale(.985)}to{opacity:1;transform:translateY(0) scale(1)}}
      @keyframes pmUiDialogCardOut{from{opacity:1;transform:translateY(0) scale(1)}to{opacity:0;transform:translateY(6px) scale(.992)}}
      @media (prefers-reduced-motion: reduce){
        .pm-ui-dialog.is-open .pm-ui-dialog__backdrop,
        .pm-ui-dialog.is-open .pm-ui-dialog__card,
        .pm-ui-dialog.is-closing .pm-ui-dialog__backdrop,
        .pm-ui-dialog.is-closing .pm-ui-dialog__card{animation:none !important;opacity:1;transform:none}
        .pm-ui-dialog.is-closing .pm-ui-dialog__backdrop,
        .pm-ui-dialog.is-closing .pm-ui-dialog__card{opacity:0}
      }
    `;
    document.head.appendChild(style);
  }catch{}

  host = document.createElement('div');
  host.id = 'pmUiDialogHost';
  host.className = 'pm-ui-dialog';
  host.setAttribute('aria-hidden', 'true');
  host.innerHTML = `
    <div class="pm-ui-dialog__backdrop" data-act="backdrop"></div>
    <div class="pm-ui-dialog__card" role="dialog" aria-modal="true" aria-labelledby="pmUiDialogTitle" aria-describedby="pmUiDialogMessage">
      <div class="pm-ui-dialog__head">
        <div class="pm-ui-dialog__title" id="pmUiDialogTitle">Message</div>
        <div class="pm-ui-dialog__kind" id="pmUiDialogKind">Notice</div>
      </div>
      <div class="pm-ui-dialog__message" id="pmUiDialogMessage"></div>
      <div class="pm-ui-dialog__hint" id="pmUiDialogHint" style="display:none"></div>
      <input class="pm-ui-dialog__input" id="pmUiDialogInput" type="text" autocomplete="off" style="display:none">
      <div class="pm-ui-dialog__actions" id="pmUiDialogActions"></div>
    </div>
  `;
  host.addEventListener('click', (ev) => {
    if(ev.target && ev.target.dataset && ev.target.dataset.act === 'backdrop'){
      const cancel = host._pmUiDialogCancel;
      if(typeof cancel === 'function') cancel();
    }
  });
  document.body.appendChild(host);
  return host;
}

function pmDialogNormalizeMeta_(kind, opts){
  const messageRaw = String(opts?.message ?? '').trim();
  const msgLine1 = messageRaw.split(/\n+/).map(v => v.trim()).find(Boolean) || '';
  const hasTitle = typeof opts?.title === 'string' && opts.title.trim();
  const dangerExplicit = Object.prototype.hasOwnProperty.call(opts || {}, 'danger');
  const lower = msgLine1.toLowerCase();

  const looksDelete = /\b(delete|remove|wipe|clear|purge|reset|discard)\b/.test(lower);
  const looksRestore = /\brestore|recover\b/.test(lower);
  const looksImport = /\bimport\b/.test(lower);
  const looksExport = /\bexport\b/.test(lower);
  const looksSave = /\bsave|create|clone|rename|apply\b/.test(lower);
  const looksRepair = /\brepair|fix\b/.test(lower);
  const looksSnooze = /\bsnooze\b/.test(lower);
  const looksHours = /\bhours?\b/.test(lower);
  const looksFormat = /\btxt\b|\bjson\b|\bmd\b|\bformat\b/.test(lower);
  const looksName = /\bname\b/.test(lower);

  let title = hasTitle ? String(opts.title).trim() : '';
  let okText = (typeof opts?.okText === 'string' && opts.okText.trim()) ? String(opts.okText).trim() : '';
  let cancelText = (typeof opts?.cancelText === 'string' && opts.cancelText.trim()) ? String(opts.cancelText).trim() : 'Cancel';
  let placeholder = (typeof opts?.placeholder === 'string' && opts.placeholder.trim()) ? String(opts.placeholder).trim() : '';
  let hint = (typeof opts?.hint === 'string' && opts.hint.trim()) ? String(opts.hint).trim() : '';
  let danger = dangerExplicit ? !!opts.danger : false;

  if(!title){
    if(kind === 'alert') title = 'Notice';
    else if(kind === 'confirm') title = 'Confirm Action';
    else title = 'Input Required';
    if(looksDelete) title = 'Delete';
    else if(/\bwipe\b/.test(lower)) title = 'Wipe Data';
    else if(/\bclear\b/.test(lower)) title = 'Clear';
    else if(looksRestore) title = 'Restore';
    else if(looksImport) title = 'Import';
    else if(looksExport) title = 'Export';
    else if(looksRepair) title = 'Repair';
    else if(looksSnooze) title = 'Snooze';
    else if(looksName && kind === 'prompt') title = 'Name';
  }

  if(!okText){
    if(kind === 'alert') okText = 'OK';
    else if(kind === 'prompt') okText = 'Save';
    else okText = 'Confirm';
    if(looksDelete) okText = 'Delete';
    else if(/\bwipe\b/.test(lower)) okText = 'Wipe';
    else if(looksRestore) okText = 'Restore';
    else if(looksImport) okText = 'Import';
    else if(looksExport) okText = 'Export';
    else if(looksRepair) okText = 'Repair';
    else if(/\bclear\b/.test(lower)) okText = 'Clear';
    else if(/\bapply\b/.test(lower)) okText = 'Apply';
    else if(/\bsave|create|clone\b/.test(lower)) okText = 'Save';
    else if(/\brename\b/.test(lower)) okText = 'Rename';
    else if(/\bcontinue\b/.test(lower)) okText = 'Continue';
    else if(/\bmark done\b/.test(lower)) okText = 'Mark Done';
    else if(looksSnooze) okText = 'Snooze';
  }

  if(!danger && (looksDelete || /\bwipe\b/.test(lower) || /\bpurge\b/.test(lower) || (/\bclear\b/.test(lower) && kind === 'confirm'))){
    danger = true;
  }

  if(kind === 'prompt' && !placeholder){
    if(looksFormat) placeholder = 'e.g. TXT, JSON, or MD';
    else if(looksHours) placeholder = 'Hours';
    else if(looksName) placeholder = 'Name';
    else if(/\bdays?\b/.test(lower)) placeholder = 'Days';
    else if(/\bassignees?\b/.test(lower)) placeholder = 'Alice, Bob';
    else placeholder = 'Enter value';
  }

  if(kind === 'prompt' && !hint){
    hint = 'Press Enter to confirm • Esc to cancel';
  }else if((kind === 'confirm' || kind === 'alert') && !hint){
    hint = 'Press Enter to confirm • Esc to cancel';
  }

  return {
    kind,
    message: messageRaw,
    title,
    okText,
    cancelText,
    placeholder,
    hint,
    danger,
    defaultValue: opts?.defaultValue == null ? '' : String(opts.defaultValue)
  };
}

function pmUiDialogAsk_(opts){
  if(!pmUiDialogAsk_._queue) pmUiDialogAsk_._queue = Promise.resolve();
  const job = () => new Promise((resolve) => {
    const host = ensureUiDialogHost_();
    const kind0 = String(opts?.kind || 'alert');
    const polished0 = pmDialogNormalizeMeta_(kind0, opts || {});
    if(!host){
      const msg0 = polished0.message;
      const def0 = polished0.defaultValue;
      if(kind0 === 'confirm'){ resolve(window.confirm ? window.confirm(msg0) : false); return; }
      if(kind0 === 'prompt'){ resolve(window.prompt ? window.prompt(msg0, def0) : null); return; }
      try{ if(window._pmNativeAlert) window._pmNativeAlert(msg0); else if(window.alert) window.alert(msg0); }catch{}
      resolve(undefined);
      return;
    }

    const kind = polished0.kind;
    const title = polished0.title;
    const message = polished0.message;
    const defaultValue = polished0.defaultValue;
    const placeholder = polished0.placeholder;
    const hint = polished0.hint;
    const danger = polished0.danger;
    const okText = polished0.okText;
    const cancelText = polished0.cancelText;
    const titleEl = host.querySelector('#pmUiDialogTitle');
    const kindEl = host.querySelector('#pmUiDialogKind');
    const msgEl = host.querySelector('#pmUiDialogMessage');
    const hintEl = host.querySelector('#pmUiDialogHint');
    const inputEl = host.querySelector('#pmUiDialogInput');
    const actionsEl = host.querySelector('#pmUiDialogActions');
    const previouslyFocused = document.activeElement && document.activeElement.focus ? document.activeElement : null;

    host.dataset.kind = kind;
    host.dataset.danger = danger ? '1' : '0';
    if(titleEl) titleEl.textContent = title;
    if(kindEl) kindEl.textContent = kind === 'confirm' ? 'Confirm' : kind === 'prompt' ? 'Input' : 'Notice';
    if(msgEl) msgEl.textContent = message;
    if(hintEl){
      hintEl.textContent = hint || '';
      hintEl.style.display = hint ? '' : 'none';
    }
    if(actionsEl) actionsEl.innerHTML = '';
    if(inputEl){
      inputEl.value = defaultValue;
      inputEl.placeholder = placeholder;
      inputEl.style.display = kind === 'prompt' ? '' : 'none';
    }

    let settled = false;
    const finish = (value) => {
      if(settled) return;
      settled = true;
      const closeMs = 150;
      const finalizeClose = () => {
        host.classList.remove('is-open');
        host.classList.remove('is-closing');
        host.setAttribute('aria-hidden', 'true');
        try{ document.body.classList.remove('pm-ui-dialog-open'); }catch{}
        host._pmUiDialogCancel = null;
        document.removeEventListener('keydown', onKey, true);
        setTimeout(() => { try{ previouslyFocused && previouslyFocused.focus && previouslyFocused.focus(); }catch{} }, 0);
        resolve(value);
      };
      try{ if(host._pmUiDialogCloseTimer){ clearTimeout(host._pmUiDialogCloseTimer); host._pmUiDialogCloseTimer = null; } }catch{}
      if(host.classList.contains('is-open')){
        host.classList.remove('is-open');
        host.classList.add('is-closing');
        host._pmUiDialogCloseTimer = setTimeout(() => {
          try{ host._pmUiDialogCloseTimer = null; }catch{}
          finalizeClose();
        }, closeMs);
        return;
      }
      finalizeClose();
    };
    const cancel = () => {
      if(kind === 'prompt') finish(null);
      else if(kind === 'confirm') finish(false);
      else finish(undefined);
    };
    host._pmUiDialogCancel = cancel;

    const mkBtn = (label, type) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pm-ui-dialog__btn';
      if(type === 'primary') btn.classList.add('pm-ui-dialog__btn--primary');
      if(type === 'danger') btn.classList.add('pm-ui-dialog__btn--danger');
      btn.textContent = label;
      return btn;
    };

    if(kind === 'confirm' || kind === 'prompt'){
      const cancelBtn = mkBtn(cancelText, 'secondary');
      cancelBtn.addEventListener('click', cancel);
      actionsEl && actionsEl.appendChild(cancelBtn);
    }
    const okBtn = mkBtn(okText, danger ? 'danger' : 'primary');
    okBtn.addEventListener('click', () => {
      if(kind === 'prompt') finish(inputEl ? inputEl.value : '');
      else if(kind === 'confirm') finish(true);
      else finish(undefined);
    });
    actionsEl && actionsEl.appendChild(okBtn);

    const onKey = (ev) => {
      if(!host.classList.contains('is-open')) return;
      if(ev.key === 'Escape'){
        ev.preventDefault();
        cancel();
        return;
      }
      if(kind === 'prompt' && ev.key === 'Enter' && ev.target === inputEl){
        ev.preventDefault();
        finish(inputEl ? inputEl.value : '');
        return;
      }
      if((kind === 'confirm' || kind === 'alert') && ev.key === 'Enter'){
        if(ev.target && ev.target.tagName === 'BUTTON') return;
        ev.preventDefault();
        if(kind === 'confirm') finish(true); else finish(undefined);
      }
    };
    document.addEventListener('keydown', onKey, true);

    try{ if(host._pmUiDialogCloseTimer){ clearTimeout(host._pmUiDialogCloseTimer); host._pmUiDialogCloseTimer = null; } }catch{}
    host.classList.remove('is-closing');
    host.classList.add('is-open');
    host.setAttribute('aria-hidden', 'false');
    try{ document.body.classList.add('pm-ui-dialog-open'); }catch{}
    setTimeout(() => {
      try{
        if(kind === 'prompt' && inputEl){ inputEl.focus(); inputEl.select(); }
        else { okBtn.focus(); }
      }catch{}
    }, 0);
  });

  const chain = pmUiDialogAsk_._queue.then(job, job);
  pmUiDialogAsk_._queue = chain.then(()=>undefined, ()=>undefined);
  return chain;
}

function pmAlertDialog_(message, opts){
  return pmUiDialogAsk_(Object.assign({ title:'Notice', okText:'OK' }, opts || {}, { kind:'alert', message:String(message || '') }));
}
function pmConfirmDialog_(message, opts){
  return pmUiDialogAsk_(Object.assign({ cancelText:'Cancel' }, opts || {}, { kind:'confirm', message:String(message || '') }));
}
function pmPromptDialog_(message, defaultValue, opts){
  return pmUiDialogAsk_(Object.assign({ cancelText:'Cancel' }, opts || {}, { kind:'prompt', message:String(message || ''), defaultValue: defaultValue == null ? '' : String(defaultValue) }));
}

function installUiAlertPatch_(){
  if(installUiAlertPatch_._done) return;
  const nativeAlert = window.alert ? window.alert.bind(window) : null;
  window.pmAlertDialog_ = pmAlertDialog_;
  window.pmConfirmDialog_ = pmConfirmDialog_;
  window.pmPromptDialog_ = pmPromptDialog_;
  if(nativeAlert){
    window._pmNativeAlert = nativeAlert;
    window.alert = function(message){
      try{ pmAlertDialog_(message, { title:'Notice' }); }
      catch(err){ try{ nativeAlert(message); }catch{} }
    };
  }
  installUiAlertPatch_._done = true;
}

try{ installUiAlertPatch_(); }catch(err){ console.warn('UI dialog patch failed', err); }

function wireTopbar(){
  ui.btnWipe.addEventListener("click", async () => {
    const ok = await pmConfirmDialog_('Wipe all local PM data? (This only clears localStorage)', { title:'Confirm Wipe', okText:'Wipe', danger:true });
    if(!ok) return;
    state = mkEmptyState();
    undoStack_ = [];
    redoStack_ = [];
    historyBaselineJson_ = JSON.stringify(state);
    pendingSavePayload_ = null;
    if(saveDebounceTimer_){ clearTimeout(saveDebounceTimer_); saveDebounceTimer_ = null; }
    try{
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_BACKUPS_KEY);
      localStorage.removeItem(STORAGE_EXPORT_CACHE_KEY);
    }catch{
      pulseSaveError("MEM ONLY");
    }
    importCandidate = null;
    addActivity("Local PM data wiped");
    renderAll();
    pulseSaved();
  });

  if(ui.btnUndo){
    ui.btnUndo.addEventListener("click", () => undoState_());
  }
  if(ui.btnRedo){
    ui.btnRedo.addEventListener("click", () => redoState_());
  }

  ui.btnExportJson.addEventListener("click", () => {
    flushPendingSave_(true);
    const payload = JSON.stringify(state, null, 2);
    const filename = buildStampedFilename_("stark_pm_export", ".json");
    cacheLastExport_(filename, payload, "application/json", "json");
    downloadText(filename, payload, "application/json");
    addActivity("Exported JSON: " + filename);
    saveState({ immediate:true });
  });

  ui.btnExportMd.addEventListener("click", () => {
    flushPendingSave_(true);
    const p = getExportProject_();
    if(!p) return;
    const payload = serializeProjectToMarkdown_(p);
    const filename = buildStampedFilename_(sanitizeFilename_(p.name), ".md");
    cacheLastExport_(filename, payload, "text/markdown", "md");
    downloadText(filename, payload, "text/markdown");
    addActivity("Exported MD: " + filename);
    saveState({ immediate:true });
  });

  ui.btnExportTxt.addEventListener("click", () => {
    flushPendingSave_(true);
    const p = getExportProject_();
    if(!p) return;
    const payload = serializeProjectToText_(p);
    const filename = buildStampedFilename_(sanitizeFilename_(p.name), ".txt");
    cacheLastExport_(filename, payload, "text/plain", "txt");
    downloadText(filename, payload, "text/plain");
    addActivity("Exported TXT: " + filename);
    saveState({ immediate:true });
  });

  ui.btnQuickNewProject.addEventListener("click", () => {
    switchTab("projects");
    newProject();
  });

  ui.btnQuickGoImport.addEventListener("click", () => {
    switchTab("import");
    ui.pasteArea.focus();
  });

  initTopbarDeclutter_();
}

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

/* ---------------------------
   Projects
---------------------------- */
function wireProjects(){
  ui.btnNewProject.addEventListener("click", newProject);
  ui.btnSaveProject.addEventListener("click", saveProjectDetails);
  ui.btnDeleteProject.addEventListener("click", deleteActiveProject);
  ui.btnDuplicateProject.addEventListener("click", duplicateActiveProject);

  // mark dirty when editing
  [ui.projectName, ui.projectDesc, ui.projectStatus, ui.projectTag].forEach(el => {
    el.addEventListener("input", pulseDirty);
    el.addEventListener("change", pulseDirty);
  });
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

/* ---------------------------
   Milestones
---------------------------- */
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
    ui.moduleDesc.addEventListener("change", () => {
        const p = getActiveProject();
        const mod = p ? getActiveModule(p) : null;
        if(!mod) return;
        mod.desc = ui.moduleDesc.value.replace(/\r\n/g, "\n").trimEnd();
        saveState();
    });



    [ui.moduleDesc, ui.milestoneTitle, ui.milestoneNotes, ui.milestonePriority, ui.milestoneState].forEach(el => {
        el.addEventListener("input", pulseDirty);
        el.addEventListener("change", pulseDirty);
    });
}

/* ---------------------------
   Checklist
---------------------------- */
function wireChecklist(){
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

    safeAnime(() => {
      const { animate } = anime;
      animate({ targets: "#taskList .task", opacity:[0,1], translateY:[6,0], duration: 320, easing:"easeOutQuad" });
    });
  });

  ui.btnJumpMilestones.addEventListener("click", () => switchTab("milestones"));

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

/* ---------------------------
   Import
---------------------------- */
function wireImport(){
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
    }
  });

  ui.btnClearImport.addEventListener("click", () => {
    ui.fileInput.value = "";
    ui.pasteArea.value = "";
    importCandidate = null;
    renderImportPreview();
    ui.importMsg.textContent = "Cleared import buffer.";
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
      return;
    }
    ui.fileInput.files = e.dataTransfer.files;
    const content = await f.text();
    try{
      importCandidate = makeImportCandidate(content, guessExt(f.name));
      renderImportPreview();
      safeAnime(() => pulseImportPreview());
    }catch(err){
      importCandidate = null;
      renderImportPreview();
      ui.importMsg.textContent = `Parse error: ${String(err?.message || err)}`;
    }
  });
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
    ui.previewMilestones.textContent = "0";
    ui.previewTasks.textContent = "0";
    ui.previewTree.innerHTML = `<div class="preview__empty">Parse a file to see a preview.</div>`;
    ui.btnImport.disabled = true;
    ui.btnImportAsNew.disabled = true;
    ui.importMsg.textContent = "—";
    return;
  }

  if(cand.kind === "state-json"){
    const diag = cand.diagnostics || {};
    const incoming = diag.incomingCounts || computeCountsForState_(cand.state);
    const current = diag.currentCounts || computeCountsForState_(state);

    ui.previewProjectName.textContent = "[JSON STATE RESTORE]";
    ui.previewMilestones.textContent = String(incoming.milestones || 0);
    ui.previewTasks.textContent = String(incoming.tasks || 0);

    ui.btnImport.disabled = false;
    ui.btnImportAsNew.disabled = true;
    ui.btnImport.textContent = "Restore State";

    const warnSuffix = (Array.isArray(diag.warnings) && diag.warnings.length)
      ? ` • WARN ${diag.warnings.length}: ${diag.warnings.slice(0,2).join("; ")}`
      : "";

    ui.importMsg.textContent =
      `JSON STATE PREVIEW • Restore replaces local data • Current ${current.projects}P/${current.milestones}M/${current.tasks}T → Incoming ${incoming.projects}P/${incoming.milestones}M/${incoming.tasks}T` + warnSuffix;

    ui.previewTree.innerHTML = buildStatePreviewTree_(cand.state);
    return;
  }

  const p = cand.project;
  const counts = computeProjectCounts(p);

  ui.previewProjectName.textContent = p.name;
  ui.previewMilestones.textContent = String(counts.milestones);
  ui.previewTasks.textContent = String(counts.tasks);

  ui.btnImport.disabled = false;
  ui.btnImportAsNew.disabled = false;

  const already = cand.existsMatchId ? "MATCH FOUND (will merge if you click Import)" : "NO MATCH (Import will create new)";
  const diag = cand.diagnostics || null;
  const warnSuffix = (diag && Array.isArray(diag.warnings) && diag.warnings.length)
    ? ` • WARN ${diag.warnings.length}: ${diag.warnings.slice(0,2).join("; ")}`
    : "";
  const target = cand.existsMatchId ? state.projects.find(x => x.id === cand.existsMatchId) : null;
  const mergeImpact = target ? computeMergeImpact_(target, cand.project) : null;
  ui.importMsg.textContent = already + warnSuffix + buildMergeImpactHint_(mergeImpact);

  ui.previewTree.innerHTML = buildPreviewTree(p)
    + (diag ? buildImportDiagnosticsHtml_(diag) : "")
    + (mergeImpact ? buildMergeImpactHtml_(mergeImpact) : "");
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

  const pushMilestone = (title) => {
    const t = (title || "").trim();
    if(!t) return;
    if(!currentMod) ensureModule("General");

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
        if(pmBlock.kind === "desc") p.desc = joined;
        if(pmBlock.kind === "notes" && currentMs) currentMs.notes = joined;
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
      if(kv.status && (kv.status === "active" || kv.status === "paused" || kv.status === "done")) p.status = kv.status;
      if(kv.tag !== undefined) p.tag = String(kv.tag || "");
      continue;
    }

    const pmDesc = line.match(/^@pm\s+desc\s*:\s*(.+)$/i);
    if(pmDesc){
      p.desc = pmDesc[1].trim();
      continue;
    }

    const pmModule = line.match(/^@pm\s+module\s+(.+)$/i);
    if(pmModule){
      const kv = parsePmKv_(pmModule[1]);
      if(!currentMod) ensureModule("General");
      if(kv.status && (kv.status === "todo" || kv.status === "doing" || kv.status === "done")) currentMod.status = kv.status;
      if(kv.tag !== undefined) currentMod.tag = String(kv.tag || "");
      continue;
    }

    const pmMilestone = line.match(/^@pm\s+milestone\s+(.+)$/i);
    if(pmMilestone){
      const kv = parsePmKv_(pmMilestone[1]);
      if(currentMs){
        if(kv.priority && (kv.priority === "p1" || kv.priority === "p2" || kv.priority === "p3")) currentMs.priority = kv.priority;
        if(kv.state && (kv.state === "todo" || kv.state === "doing" || kv.state === "done")) currentMs.state = kv.state;
      }
      continue;
    }

    const pmNotes = line.match(/^@pm\s+notes\s*:\s*(.+)$/i);
    if(pmNotes){
      if(currentMs) currentMs.notes = pmNotes[1].trim();
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
    ui.projectList.appendChild(el);
  }
  if(!state.projects.length){
    ui.projectList.innerHTML = `<div class="hint">No projects yet. Create one or import.</div>`;
  }

  // details
  const ap = getActiveProject();
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
  ui.moduleDesc.value = "";
  ui.moduleDesc.disabled = true;

  const p = getActiveProject();
  if(!p){
    ui.moduleList.innerHTML = `<div class="hint">Select a project first.</div>`;
    ui.milestoneList.innerHTML = `<div class="hint">Select a project first.</div>`;
    ui.milestoneScopeHint.textContent = "For the active module.";
    ui.milestoneTitle.value = "";
    ui.milestoneNotes.value = "";
    ui.milestonePriority.value = "p2";
    ui.milestoneState.value = "todo";
    ui.milestoneTaskCount.textContent = "0";
    ui.milestoneCompletion.textContent = "0%";
    return;
  }

  const mods = Array.isArray(p.modules) ? p.modules : [];
  if(!mods.length){
    ui.moduleList.innerHTML = `<div class="hint">No modules yet. Create one.</div>`;
    ui.milestoneList.innerHTML = `<div class="hint">No milestones yet.</div>`;
    ui.milestoneScopeHint.textContent = `${p.name} • No module selected`;
    ui.milestoneTitle.value = "";
    ui.milestoneNotes.value = "";
    ui.milestonePriority.value = "p2";
    ui.milestoneState.value = "todo";
    ui.milestoneTaskCount.textContent = "0";
    ui.milestoneCompletion.textContent = "0%";
    return;
  }

  const activeMod = getActiveModule(p);
  ui.moduleDesc.disabled = !activeMod;
  ui.moduleDesc.value = activeMod ? String(activeMod.desc || "") : "";

  // Modules list (selectable)
  for(const mod of mods){
    const msList = Array.isArray(mod?.milestones) ? mod.milestones : [];
    let tasks = 0;
    let done = 0;
    for(const ms of msList){
      const ts = Array.isArray(ms?.tasks) ? ms.tasks : [];
      tasks += ts.length;
      done += ts.filter(t => t && t.done).length;
    }
    const pct = tasks ? (done / tasks) * 100 : 0;

    const el = document.createElement("div");
    el.className = "item " + (activeMod && mod.id === activeMod.id ? "is-active" : "");
    el.innerHTML = `
      <div class="item__title">${escapeHtml(mod.name)}</div>
      <div class="item__sub">
        <span class="badge">${String(mod.status || "todo").toUpperCase()}</span>
        ${mod.tag ? `<span class="badge">${escapeHtml(mod.tag)}</span>` : ""}
        <span class="badge">${msList.length} MS</span>
        <span class="badge">${done}/${tasks}</span>
        <span class="badge">${fmtPct(pct)}</span>
      </div>
    `;
    el.addEventListener("click", () => setActiveModule(mod.id));
    ui.moduleList.appendChild(el);
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
    ui.milestoneList.appendChild(el);
  }

  if(!msList.length){
    ui.milestoneList.innerHTML = `<div class="hint">No milestones yet.</div>`;
  }

  // milestone details
  if(!active){
    ui.milestoneTitle.value = "";
    ui.milestoneNotes.value = "";
    ui.milestonePriority.value = "p2";
    ui.milestoneState.value = "todo";
    ui.milestoneTaskCount.textContent = "0";
    ui.milestoneCompletion.textContent = "0%";
    return;
  }

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
    ui.taskList.innerHTML = `<div class="hint">No tasks yet. Add one on the left.</div>`;
  }
}

/* ---------------------------
   Radar animation (ambient)
---------------------------- */
// NOTE: boot() runs before the file finishes executing. Using `var` avoids
// a temporal-dead-zone crash when initRadar() references radarTimer early.
var radarTimer = null;

function initRadar(){
  const radarSweep = $("#radarSweep");
  const radarBlips = $("#radarBlips");

  // Radar UI is optional now (dashboard keeps counters only).
  if(!radarSweep || !radarBlips){
    if(radarTimer){
      clearInterval(radarTimer);
      radarTimer = null;
    }
    return;
  }

  safeAnime(() => {
    const { animate } = anime;
    animate({
      targets: radarSweep,
      rotate: [0, 360],
      duration: 2400,
      easing: "linear",
      loop: true,
    });
  });

  // create a few blips (positions updated later)
  radarBlips.innerHTML = "";
  for(let i=0;i<8;i++){
    const b = document.createElement("div");
    b.className = "blip";
    b.style.left = `${10 + Math.random()*80}%`;
    b.style.top = `${10 + Math.random()*80}%`;
    radarBlips.appendChild(b);
  }

  if(radarTimer) clearInterval(radarTimer);
  radarTimer = setInterval(() => {
    const blips = $$("#radarBlips .blip");
    safeAnime(() => {
      const { animate } = anime;
      const pick = blips[Math.floor(Math.random() * blips.length)];
      if(!pick) return;
      animate({
        targets: pick,
        opacity: [0, 1, 0],
        scale: [1, 1.8, 1],
        duration: 900,
        easing: "easeOutQuad"
      });
    });
  }, 520);
}

function refreshRadarBlips(counts){
  const blips = $$("#radarBlips .blip");
  if(!blips.length) return;
  // reposition lightly based on totals for "alive" feel
  const energy = Math.min(1, (counts.tasks + counts.milestones + counts.projects) / 60);
  blips.forEach((b, i) => {
    const base = 10 + (i * 9) % 80;
    const jitter = (Math.random()*10 - 5) * (0.3 + energy);
    b.style.left = `${clamp(base + jitter, 6, 94)}%`;
    b.style.top = `${clamp(18 + (i*11)%70 + jitter, 6, 94)}%`;
  });
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

function animateNumber(el, next){
  const cur = Number(el.textContent || "0");
  if(cur === next) return;
  safeAnime(() => {
    const { animate } = anime;
    const obj = { v: cur };
    animate({
      targets: obj,
      v: next,
      duration: 380,
      easing: "easeOutQuad",
      update: () => { el.textContent = String(Math.round(obj.v)); }
    });
  });
  if(!window.anime) el.textContent = String(next);
}


/* ---------------------------
   Export (.md / .txt) — round-trip with Import
---------------------------- */
function getExportProject_(){
  const p = getActiveProject() || state.projects[0] || null;
  if(!p){
    alert("No project to export yet.");
    return null;
  }
  return p;
}

function sanitizeFilename_(name){
  const base = String(name || "project").trim() || "project";
  return base
    .replace(/[\\/\:*?"<>|]+/g, "_")
    .replace(/\s+/g, "_")
    .slice(0, 80);
}

function exportStamp_(){
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function buildStampedFilename_(base, ext){
  const safeBase = sanitizeFilename_(String(base || "export"));
  return `${safeBase}_${exportStamp_()}${ext || ""}`;
}

function cacheLastExport_(filename, payload, mime, kind){
  try{
    const item = {
      ts: Date.now(),
      filename: String(filename || ""),
      mime: String(mime || "text/plain"),
      kind: String(kind || "text"),
      size: String(payload || "").length,
      payload: String(payload || ""),
    };
    localStorage.setItem(STORAGE_EXPORT_CACHE_KEY, JSON.stringify(item));
  }catch{
    // best-effort cache only
  }
}

function quotePmValue_(v){
  const s = String(v ?? "");
  if(!s) return "";
  // Quote if whitespace or special chars are present
  if(/[\s"'=\{\}]/.test(s)) return JSON.stringify(s);
  return s;
}

function buildPmTaskMeta_(t){
  const parts = [];
  if(t.severity && t.severity !== "normal") parts.push("severity=" + t.severity);
  if(t.assignee && String(t.assignee).trim()) parts.push("assignee=" + quotePmValue_(String(t.assignee).trim()));
  return parts.length ? "{pm " + parts.join(" ") + "}" : "";
}


function pushPmTextBlock_(lines, key, value){
  const raw = String(value ?? "");
  if(!raw.trim()) return;
  const v = raw.replace(/\r\n/g, "\n");
  if(v.includes("\n")){
    lines.push(`@pm ${key}: <<<`);
    lines.push(...v.split("\n"));
    lines.push(`@pm ${key}: >>>`);
    return;
  }
  lines.push(`@pm ${key}: ${v.trim()}`);
}

function serializeProjectToMarkdown_(p){
  const lines = [];
  lines.push("# " + p.name);
  lines.push("");
  lines.push(("@pm project status=" + p.status + " tag=" + quotePmValue_(p.tag)).trim());
  pushPmTextBlock_(lines, "desc", p.desc);
  lines.push("");

  // Export modules explicitly so round-trip Import preserves module structure.
  if(Array.isArray(p?.modules) && p.modules.length){
    let mi = 1;
    for(const mod of p.modules){
      const header = formatExportModuleHeader_(mod, mi);
      lines.push(header);
      lines.push(("@pm module status=" + mod.status + " tag=" + quotePmValue_(mod.tag)).trim());
      lines.push("");

      for(const ms of (Array.isArray(mod?.milestones) ? mod.milestones : [])){
        lines.push("## " + ms.title);
        lines.push("@pm milestone priority=" + ms.priority + " state=" + ms.state);
        pushPmTextBlock_(lines, "notes", ms.notes);
        lines.push("");

        for(const t of (ms.tasks || [])){
          const box = t.done ? "x" : " ";
          const meta = buildPmTaskMeta_(t);
          lines.push("- [" + box + "] " + t.title + (meta ? " " + meta : ""));
          // Steps (subtasks) are exported as nested checklist items for round-trip import.
          walkSteps_(t.steps || [], (s, depth) => {
            const sbox = s.done ? "x" : " ";
            const indent = "  ".repeat(depth + 1); // base under the task
            lines.push(indent + "- [" + sbox + "] " + String(s.text || "").trim());
          });
        }
        lines.push("");
      }

      mi++;
    }
  } else {
    // Legacy model: milestones[] directly under project.
    for(const ms of (Array.isArray(p?.milestones) ? p.milestones : [])){
      lines.push("## " + ms.title);
      lines.push("@pm milestone priority=" + ms.priority + " state=" + ms.state);
      pushPmTextBlock_(lines, "notes", ms.notes);
      lines.push("");

      for(const t of (ms.tasks || [])){
        const box = t.done ? "x" : " ";
        const meta = buildPmTaskMeta_(t);
        lines.push("- [" + box + "] " + t.title + (meta ? " " + meta : ""));
        walkSteps_(t.steps || [], (s, depth) => {
          const sbox = s.done ? "x" : " ";
          const indent = "  ".repeat(depth + 1);
          lines.push(indent + "- [" + sbox + "] " + String(s.text || "").trim());
        });
      }
      lines.push("");
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

function serializeProjectToText_(p){
  const lines = [];
  lines.push("Project: " + p.name);
  lines.push(("@pm project status=" + p.status + " tag=" + quotePmValue_(p.tag)).trim());
  pushPmTextBlock_(lines, "desc", p.desc);
  lines.push("");

  // Export modules explicitly so the .txt export includes the module plan.
  let i = 1;
  if(Array.isArray(p?.modules) && p.modules.length){
    let mi = 1;
    for(const mod of p.modules){
      const header = formatExportModuleHeader_(mod, mi);
      lines.push(header);
      lines.push(("@pm module status=" + mod.status + " tag=" + quotePmValue_(mod.tag)).trim());
      lines.push("");

      for(const ms of (Array.isArray(mod?.milestones) ? mod.milestones : [])){
        lines.push("M" + i + " - " + ms.title);
        lines.push("@pm milestone priority=" + ms.priority + " state=" + ms.state);
        pushPmTextBlock_(lines, "notes", ms.notes);
        for(const t of (ms.tasks || [])){
          const box = t.done ? "x" : " ";
          const meta = buildPmTaskMeta_(t);
          lines.push("- [" + box + "] " + t.title + (meta ? " " + meta : ""));
          walkSteps_(t.steps || [], (s, depth) => {
            const sbox = s.done ? "x" : " ";
            const indent = "  ".repeat(depth + 1);
            lines.push(indent + "- [" + sbox + "] " + String(s.text || "").trim());
          });
        }
        lines.push("");
        i++;
      }

      mi++;
    }
  } else {
    // Legacy model
    for(const ms of (Array.isArray(p?.milestones) ? p.milestones : [])){
      lines.push("M" + i + " - " + ms.title);
      lines.push("@pm milestone priority=" + ms.priority + " state=" + ms.state);
      pushPmTextBlock_(lines, "notes", ms.notes);
      for(const t of (ms.tasks || [])){
        const box = t.done ? "x" : " ";
        const meta = buildPmTaskMeta_(t);
        lines.push("- [" + box + "] " + t.title + (meta ? " " + meta : ""));
        walkSteps_(t.steps || [], (s, depth) => {
          const sbox = s.done ? "x" : " ";
          const indent = "  ".repeat(depth + 1);
          lines.push(indent + "- [" + sbox + "] " + String(s.text || "").trim());
        });
      }
      lines.push("");
      i++;
    }
  }

  return lines.join("\n").trimEnd() + "\n";
}

function formatExportModuleHeader_(mod, index){
  const raw = String(mod?.name || "").trim();
  const m = raw.match(/^module\s+(\d+)\s*(?:[-—:]\s*)?(.*)$/i);
  if(m){
    const num = String(m[1] || index).trim() || String(index);
    const rest = String(m[2] || "").trim();
    return rest ? `MODULE ${num} - ${rest}` : `MODULE ${num}`;
  }
  // If the name already starts with "MODULE <n>", normalize casing and separator.
  const m2 = raw.match(/^MODULE\s+(\d+)\s*(?:[-—:]\s*)?(.*)$/i);
  if(m2){
    const num = String(m2[1] || index).trim() || String(index);
    const rest = String(m2[2] || "").trim();
    return rest ? `MODULE ${num} - ${rest}` : `MODULE ${num}`;
  }
  return `MODULE ${index} - ${raw || ("Module " + index)}`;
}

function parsePmInlineTaskMeta_(s){
  const m = String(s || "").match(/^(.*?)\s*\{([^{}]+)\}\s*$/);
  if(!m) return { title: String(s || "").trim(), meta: {} };
  const title = String(m[1] || "").trim();
  const metaRaw = String(m[2] || "").trim().replace(/^pm\s+/i, "");
  const meta = parsePmKv_(metaRaw);
  return { title, meta };
}

function parsePmKv_(s){
  const str = String(s || "");
  const out = {};
  let i = 0;

  function skip(){
    while(i < str.length && /\s/.test(str[i])) i++;
  }

  function readKey(){
    const start = i;
    while(i < str.length && !/\s|=/.test(str[i])) i++;
    return str.slice(start, i);
  }

  function readQuoted(quote){
    i++; // skip opening
    let buf = "";
    while(i < str.length){
      const ch = str[i];
      if(ch === "\\" && i + 1 < str.length){
        buf += str[i + 1];
        i += 2;
        continue;
      }
      if(ch === quote){
        i++;
        return buf;
      }
      buf += ch;
      i++;
    }
    return buf;
  }

  function readValue(){
    if(i >= str.length) return "";
    const ch = str[i];
    if(ch === '"' || ch === "'") return readQuoted(ch);
    const start = i;
    while(i < str.length && !/\s/.test(str[i])) i++;
    return str.slice(start, i);
  }

  while(i < str.length){
    skip();
    if(i >= str.length) break;

    // skip optional leading 'pm' token
    if(str.slice(i, i + 2).toLowerCase() === "pm" && (i + 2 == str.length || /\s/.test(str[i + 2]))){
      i += 2;
      continue;
    }

    const key = readKey();
    skip();
    if(!key){
      i++;
      continue;
    }
    if(i >= str.length || str[i] !== "="){
      // token without value; ignore
      continue;
    }

    i++; // '='
    skip();
    const val = readValue();
    out[key.toLowerCase()] = val;
  }

  return out;
}

function applyPmTaskMeta_(t, meta){
  if(!meta || typeof meta !== "object") return;
  if(meta.severity && (meta.severity === "normal" || meta.severity === "high" || meta.severity === "blocker")) t.severity = meta.severity;
  if(meta.assignee !== undefined) t.assignee = String(meta.assignee || "");
}

/* ---------------------------
   Utils
---------------------------- */
function escapeHtml(s){
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function downloadText(filename, text, mime){
  const blob = new Blob([text], { type: mime || "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ---------------------------
   Phase 3 Enhancements
   - Global search command palette (Ctrl/Cmd+K)
   - Project archive mode + filtering
   - Project templates
   - Checklist filters + bulk actions
---------------------------- */
var phase3State_ = {
  inited: false,
  patched: false,
  projectQuery: "",
  showArchived: false,
  taskQuery: "",
  taskStatus: "all",   // all | open | done
  taskSeverity: "all", // all | normal | high | blocker
  taskSelection: new Set(),
  cmdOpen: false,
  cmdIndex: 0,
};

function initPhase3_(){
  if(phase3State_.inited) return;
  phase3State_.inited = true;

  injectPhase3Styles_();
  ensurePhase3ProjectControls_();
  ensurePhase3ChecklistControls_();
  ensurePhase3CommandPalette_();
  patchPhase3Renderers_();
  patchPhase3Behavior_();

  // Refresh once after patching so post-render hooks run.
  try{ renderAll(); }catch{ /* ignore */ }
}

function injectPhase3Styles_(){
  if(document.querySelector("#phase3Styles")) return;
  const st = document.createElement("style");
  st.id = "phase3Styles";
  st.textContent = `
    .phase3-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0 12px}
    .phase3-toolbar .input,.phase3-toolbar .select{min-width:0}
    .phase3-toolbar .input{flex:1 1 200px}
    .phase3-toolbar .btn{white-space:nowrap}
    .phase3-sep{width:1px;height:20px;background:rgba(255,255,255,.12)}
    .phase3-muted{opacity:.8;font-size:12px}
    .phase3-empty{margin-top:10px;padding:10px;border:1px dashed rgba(255,255,255,.14);border-radius:10px;color:var(--muted,#9fb3c8)}
    .phase3-taskPick{appearance:none;width:16px;height:16px;border:1px solid rgba(255,255,255,.24);border-radius:4px;background:transparent;cursor:pointer;margin:0 6px 0 2px;align-self:flex-start;position:relative;top:2px}
    .phase3-taskPick:checked{background:rgba(0,255,255,.18);border-color:rgba(0,255,255,.55);box-shadow:0 0 0 1px rgba(0,255,255,.15) inset}
    .phase3-taskPick:checked::after{content:"✓";display:block;text-align:center;line-height:14px;font-size:11px;color:#bff}
    .task.phase3-hidden{display:none!important}
    .task.is-selected{outline:1px solid rgba(0,255,255,.35);box-shadow:0 0 0 1px rgba(0,255,255,.08) inset}
    .phase3-taskHeader{display:flex;align-items:center;gap:6px;min-width:0}
    .phase3-taskHeader .task__title{margin:0}
    .phase3-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);font-size:12px;background:rgba(255,255,255,.02)}
    .phase3-chip input{margin:0}
    .phase3-project-archived .item__title{opacity:.75}
    .phase3-archived-badge{border-color:rgba(255,165,0,.35)!important;color:#ffd39a}
    .phase3-cmdk{position:fixed;inset:0;display:none;z-index:60;background:rgba(5,8,14,.58);backdrop-filter:blur(8px)}
    .phase3-cmdk.is-open{display:block}
    .phase3-cmdk__panel{width:min(860px,92vw);max-height:min(78vh,720px);margin:7vh auto 0;background:rgba(10,14,24,.9);border:1px solid rgba(255,255,255,.12);border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.35);display:flex;flex-direction:column;overflow:hidden}
    .phase3-cmdk__top{display:flex;align-items:center;gap:8px;padding:12px;border-bottom:1px solid rgba(255,255,255,.08)}
    .phase3-cmdk__search{flex:1;background:transparent;border:0;outline:0;color:inherit;font-size:15px}
    .phase3-cmdk__hint{font-size:11px;opacity:.7;white-space:nowrap}
    .phase3-cmdk__list{overflow:auto;padding:8px}
    .phase3-cmdk__item{display:flex;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:12px;cursor:pointer;border:1px solid transparent}
    .phase3-cmdk__item:hover,.phase3-cmdk__item.is-active{background:rgba(255,255,255,.03);border-color:rgba(0,255,255,.22)}
    .phase3-cmdk__main{min-width:0}
    .phase3-cmdk__title{font-size:14px}
    .phase3-cmdk__sub{font-size:12px;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .phase3-cmdk__tag{font-size:11px;opacity:.85;white-space:nowrap}
    .phase3-cmdk__empty{padding:14px 12px;color:var(--muted,#9fb3c8)}
    .phase3-topbarSearchBtn{font-weight:600}
    .phase3-topbarSearchBtn .phase3-kbd{opacity:.75;font-size:11px;margin-left:4px}
    .phase3-taskTools{margin-bottom:10px}
    .phase3-taskTools .select{min-width:120px}
    .phase3-taskTools .input{min-width:180px}
    .phase3-taskTools .btn.btn--mini{padding:5px 8px;font-size:12px}
  `;
  document.head.appendChild(st);
}

function ensurePhase3ProjectControls_(){
  // Project list controls
  const projectList = document.querySelector("#projectList");
  if(projectList && !document.querySelector("#phase3ProjectToolbar")){
    const toolbar = document.createElement("div");
    toolbar.id = "phase3ProjectToolbar";
    toolbar.className = "phase3-toolbar";
    toolbar.innerHTML = `
      <input id="phase3ProjectSearch" class="input" type="text" placeholder="Filter projects (name / tag / desc)…" />
      <label class="phase3-chip"><input type="checkbox" id="phase3ShowArchived" /> Show archived</label>
      <button class="btn btn--ghost" id="phase3BtnTemplate" type="button">Templates</button>
      <span class="phase3-muted" id="phase3ProjectFilterInfo">All projects</span>
    `;
    projectList.parentElement.insertBefore(toolbar, projectList);

    const search = toolbar.querySelector("#phase3ProjectSearch");
    const showArchived = toolbar.querySelector("#phase3ShowArchived");
    const btnTpl = toolbar.querySelector("#phase3BtnTemplate");

    search.addEventListener("input", () => {
      phase3State_.projectQuery = (search.value || "").trim();
      renderProjects();
    });
    showArchived.addEventListener("change", () => {
      phase3State_.showArchived = !!showArchived.checked;
      renderProjects();
    });
    btnTpl.addEventListener("click", phase3OpenTemplatePrompt_);
  }

  // Archive/unarchive button in project detail actions row
  const actions = document.querySelector("#btnDeleteProject")?.closest(".row");
  if(actions && !document.querySelector("#phase3BtnArchiveProject")){
    const btn = document.createElement("button");
    btn.id = "phase3BtnArchiveProject";
    btn.type = "button";
    btn.className = "btn btn--ghost";
    btn.textContent = "Archive";
    btn.addEventListener("click", phase3ToggleArchiveActiveProject_);
    // insert before delete
    const del = document.querySelector("#btnDeleteProject");
    actions.insertBefore(btn, del);
  }
}

function ensurePhase3ChecklistControls_(){
  const taskList = document.querySelector("#taskList");
  if(taskList && !document.querySelector("#phase3TaskToolbar")){
    const box = document.createElement("div");
    box.id = "phase3TaskToolbar";
    box.className = "phase3-toolbar phase3-taskTools";
    box.innerHTML = `
      <input id="phase3TaskSearch" class="input" type="text" placeholder="Filter tasks (title / assignee / steps)…" />
      <select id="phase3TaskStatus" class="select">
        <option value="all">All</option>
        <option value="open">Open</option>
        <option value="done">Done</option>
      </select>
      <select id="phase3TaskSeverity" class="select">
        <option value="all">All Severities</option>
        <option value="normal">Normal</option>
        <option value="high">High</option>
        <option value="blocker">Blocker</option>
      </select>
      <button class="btn btn--ghost btn--mini" id="phase3BtnSelectVisible" type="button">Select Visible</button>
      <button class="btn btn--ghost btn--mini" id="phase3BtnClearSelection" type="button">Clear Sel</button>
      <button class="btn btn--ghost btn--mini" id="phase3BtnBulkDone" type="button">Bulk Done</button>
      <button class="btn btn--ghost btn--mini" id="phase3BtnBulkOpen" type="button">Bulk Reopen</button>
      <button class="btn btn--ghost btn--mini" id="phase3BtnBulkDelete" type="button">Bulk Delete</button>
      <span class="phase3-muted" id="phase3TaskFilterInfo">No filter</span>
    `;
    taskList.parentElement.insertBefore(box, taskList);

    box.querySelector("#phase3TaskSearch").addEventListener("input", (e) => {
      phase3State_.taskQuery = String(e.target.value || "").trim();
      renderChecklist();
    });
    box.querySelector("#phase3TaskStatus").addEventListener("change", (e) => {
      phase3State_.taskStatus = String(e.target.value || "all");
      renderChecklist();
    });
    box.querySelector("#phase3TaskSeverity").addEventListener("change", (e) => {
      phase3State_.taskSeverity = String(e.target.value || "all");
      renderChecklist();
    });

    box.querySelector("#phase3BtnSelectVisible").addEventListener("click", phase3ToggleSelectVisibleTasks_);
    box.querySelector("#phase3BtnClearSelection").addEventListener("click", phase3ClearCurrentTaskSelection_);
    box.querySelector("#phase3BtnBulkDone").addEventListener("click", () => phase3BulkSetTaskDone_(true));
    box.querySelector("#phase3BtnBulkOpen").addEventListener("click", () => phase3BulkSetTaskDone_(false));
    box.querySelector("#phase3BtnBulkDelete").addEventListener("click", phase3BulkDeleteTasks_);
  }
}

function ensurePhase3CommandPalette_(){
  const topbarRight = document.querySelector(".topbar__right");
  if(topbarRight && !document.querySelector("#phase3BtnCmdk")){
    const btn = document.createElement("button");
    btn.id = "phase3BtnCmdk";
    btn.className = "btn btn--ghost phase3-topbarSearchBtn";
    btn.type = "button";
    btn.innerHTML = `Search <span class="phase3-kbd">Ctrl/Cmd+K</span>`;
    btn.addEventListener("click", () => phase3OpenCmdk_());
    // Insert near undo/redo
    const anchor = document.querySelector("#btnExportJson") || topbarRight.firstElementChild;
    topbarRight.insertBefore(btn, anchor);
  }

  if(document.querySelector("#phase3Cmdk")) return;
  const wrap = document.createElement("div");
  wrap.id = "phase3Cmdk";
  wrap.className = "phase3-cmdk";
  wrap.innerHTML = `
    <div class="phase3-cmdk__panel" role="dialog" aria-modal="true" aria-label="Global Search & Command Palette">
      <div class="phase3-cmdk__top">
        <span>⌕</span>
        <input id="phase3CmdkInput" class="phase3-cmdk__search" type="text" placeholder="Search projects, milestones, tasks, or run a command…" />
        <span class="phase3-cmdk__hint">Enter • Esc • ↑↓</span>
      </div>
      <div id="phase3CmdkList" class="phase3-cmdk__list"></div>
    </div>
  `;
  document.body.appendChild(wrap);

  wrap.addEventListener("click", (e) => {
    if(e.target === wrap) phase3CloseCmdk_();
  });

  const input = wrap.querySelector("#phase3CmdkInput");
  const list = wrap.querySelector("#phase3CmdkList");

  input.addEventListener("input", () => {
    phase3State_.cmdIndex = 0;
    phase3RenderCmdkResults_();
  });

  input.addEventListener("keydown", (e) => {
    const items = Array.from(list.querySelectorAll(".phase3-cmdk__item"));
    if(e.key === "Escape"){
      e.preventDefault();
      phase3CloseCmdk_();
      return;
    }
    if(e.key === "ArrowDown"){
      e.preventDefault();
      phase3State_.cmdIndex = Math.min(items.length - 1, phase3State_.cmdIndex + 1);
      phase3RenderCmdkResults_();
      return;
    }
    if(e.key === "ArrowUp"){
      e.preventDefault();
      phase3State_.cmdIndex = Math.max(0, phase3State_.cmdIndex - 1);
      phase3RenderCmdkResults_();
      return;
    }
    if(e.key === "Enter"){
      e.preventDefault();
      const data = items[phase3State_.cmdIndex]?.dataset?.payload;
      if(!data) return;
      try{
        phase3RunCmdkAction_(JSON.parse(data));
      }catch{
        // ignore malformed payload
      }
    }
  });
}

function patchPhase3Renderers_(){
  if(phase3State_.patched) return;
  phase3State_.patched = true;

  const baseRenderProjects = renderProjects;
  renderProjects = function(){
    baseRenderProjects();
    phase3PostRenderProjects_();
  };

  const baseRenderChecklist = renderChecklist;
  renderChecklist = function(){
    baseRenderChecklist();
    phase3PostRenderChecklist_();
  };

  const baseCollectHotTasks = collectHotTasks;
  collectHotTasks = function(limit){
    const out = baseCollectHotTasks(Math.max(limit || 0, 40));
    return out.filter(h => !Boolean(h?.project?.archived)).slice(0, limit);
  };
}

function patchPhase3Behavior_(){
  document.addEventListener("keydown", (e) => {
    if(e.defaultPrevented) return;
    const key = String(e.key || "").toLowerCase();

    // Global command palette
    if((e.ctrlKey || e.metaKey) && key === "k"){
      e.preventDefault();
      phase3OpenCmdk_();
      return;
    }

    // quick focus for checklist filter when checklist tab active
    if(key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey){
      const activeTab = document.querySelector(".tab.is-active")?.dataset?.tab;
      if(activeTab === "checklist" && !isTypingTarget_(e.target)){
        const inp = document.querySelector("#phase3TaskSearch");
        if(inp){
          e.preventDefault();
          inp.focus();
          inp.select();
        }
      }
    }
  });
}

function phase3PostRenderProjects_(){
  const list = ui.projectList;
  if(!list) return;

  const pSearch = document.querySelector("#phase3ProjectSearch");
  const pShow = document.querySelector("#phase3ShowArchived");
  const pInfo = document.querySelector("#phase3ProjectFilterInfo");
  if(pSearch && pSearch.value !== phase3State_.projectQuery) pSearch.value = phase3State_.projectQuery;
  if(pShow) pShow.checked = !!phase3State_.showArchived;

  const cards = Array.from(list.querySelectorAll(".item"));
  const projects = Array.isArray(state.projects) ? state.projects : [];
  if(cards.length && cards.length === projects.length){
    let visible = 0;
    const q = phase3State_.projectQuery.trim().toLowerCase();

    cards.forEach((el, idx) => {
      const p = projects[idx];
      if(!p) return;
      const hay = `${p.name} ${p.tag || ""} ${p.desc || ""}`.toLowerCase();
      const matchQuery = !q || hay.includes(q);
      const matchArchive = phase3State_.showArchived ? true : !Boolean(p.archived);
      const show = matchQuery && matchArchive;

      el.classList.toggle("phase3-project-archived", !!p.archived);
      // add archived badge once
      const sub = el.querySelector(".item__sub");
      if(sub && p.archived && !sub.querySelector(".phase3-archived-badge")){
        const badge = document.createElement("span");
        badge.className = "badge phase3-archived-badge";
        badge.textContent = "ARCHIVED";
        sub.appendChild(badge);
      }

      el.style.display = show ? "" : "none";
      if(show) visible++;
    });

    let empty = document.querySelector("#phase3ProjectsEmpty");
    if(!empty){
      empty = document.createElement("div");
      empty.id = "phase3ProjectsEmpty";
      empty.className = "phase3-empty";
      list.parentElement.appendChild(empty);
    }
    empty.textContent = "No projects match the current filter.";
    empty.style.display = visible ? "none" : (projects.length ? "" : "none");

    if(pInfo){
      const archivedCount = projects.filter(p => p && p.archived).length;
      pInfo.textContent = `${visible}/${projects.length} visible • ${archivedCount} archived`;
    }
  }else{
    const empty = document.querySelector("#phase3ProjectsEmpty");
    if(empty) empty.style.display = "none";
    if(pInfo) pInfo.textContent = "All projects";
  }

  // Keep project details archive button state synced
  const ap = getActiveProject();
  const btnArchive = document.querySelector("#phase3BtnArchiveProject");
  if(btnArchive){
    btnArchive.disabled = !ap;
    btnArchive.textContent = ap && ap.archived ? "Unarchive" : "Archive";
    btnArchive.title = ap ? (ap.archived ? "Move project back to active list" : "Hide project in archive mode") : "Select a project first";
  }

  // Soft hint near active project label if active project is archived
  if(ui.activeProjectName){
    ui.activeProjectName.title = (ap && ap.archived) ? "Archived project (hidden when 'Show archived' is off)" : "";
  }
}

function phase3TaskMatchesFilter_(task){
  if(!task) return false;

  if(phase3State_.taskStatus === "open" && task.done) return false;
  if(phase3State_.taskStatus === "done" && !task.done) return false;
  if(phase3State_.taskSeverity !== "all" && task.severity !== phase3State_.taskSeverity) return false;

  const q = phase3State_.taskQuery.trim().toLowerCase();
  if(!q) return true;

  let stepText = "";
  try{
    walkSteps_(task.steps || [], (s) => { stepText += " " + String(s.text || ""); });
  }catch{ /* ignore */ }

  const hay = `${task.title || ""} ${task.assignee || ""} ${stepText}`.toLowerCase();
  return hay.includes(q);
}

function phase3PostRenderChecklist_(){
  const taskList = ui.taskList;
  const info = document.querySelector("#phase3TaskFilterInfo");
  const inp = document.querySelector("#phase3TaskSearch");
  const statusSel = document.querySelector("#phase3TaskStatus");
  const sevSel = document.querySelector("#phase3TaskSeverity");
  if(inp && inp.value !== phase3State_.taskQuery) inp.value = phase3State_.taskQuery;
  if(statusSel) statusSel.value = phase3State_.taskStatus;
  if(sevSel) sevSel.value = phase3State_.taskSeverity;

  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  if(!p || !m || !taskList){
    const empty = document.querySelector("#phase3TasksEmpty");
    if(empty) empty.style.display = "none";
    if(info) info.textContent = "No filter";
    return;
  }

  const tasks = Array.isArray(m.tasks) ? m.tasks : [];
  const cards = Array.from(taskList.querySelectorAll(".task"));
  // cleanup stale selection (tasks not in active milestone)
  const idsNow = new Set(tasks.map(t => t.id));
  for(const id of Array.from(phase3State_.taskSelection)){
    if(!idsNow.has(id)) phase3State_.taskSelection.delete(id);
  }

  let visible = 0;
  let selectedVisible = 0;

  cards.forEach((el, idx) => {
    const t = tasks[idx];
    if(!t) return;
    el.dataset.taskId = t.id;

    // Insert pick checkbox once
    let pick = el.querySelector(".phase3-taskPick");
    if(!pick){
      pick = document.createElement("input");
      pick.type = "checkbox";
      pick.className = "phase3-taskPick";
      pick.title = "Select task for bulk actions";
      pick.addEventListener("click", (e) => e.stopPropagation());
      pick.addEventListener("change", (e) => {
        const checked = !!e.target.checked;
        if(checked) phase3State_.taskSelection.add(t.id);
        else phase3State_.taskSelection.delete(t.id);
        phase3PostRenderChecklist_();
      });

      // Place before task body so the done-toggle remains the first control.
      const body = el.querySelector(".task__body");
      if(body){
        el.insertBefore(pick, body);
      }else{
        el.appendChild(pick);
      }
    }

    const match = phase3TaskMatchesFilter_(t);
    el.classList.toggle("phase3-hidden", !match);

    const isSel = phase3State_.taskSelection.has(t.id);
    pick.checked = isSel;
    el.classList.toggle("is-selected", isSel);

    if(match){
      visible++;
      if(isSel) selectedVisible++;
    }

    // Add tiny ARCHIVED label to scope if project archived (once per render via hint text below)
  });

  let empty = document.querySelector("#phase3TasksEmpty");
  if(!empty){
    empty = document.createElement("div");
    empty.id = "phase3TasksEmpty";
    empty.className = "phase3-empty";
    empty.textContent = "No tasks match the current checklist filters.";
    taskList.parentElement.appendChild(empty);
  }
  empty.style.display = (tasks.length && visible === 0) ? "" : "none";

  const activeCount = tasks.length;
  const selectedCount = Array.from(phase3State_.taskSelection).filter(id => idsNow.has(id)).length;

  if(info){
    const bits = [];
    if(phase3State_.taskQuery) bits.push(`search`);
    if(phase3State_.taskStatus !== "all") bits.push(phase3State_.taskStatus);
    if(phase3State_.taskSeverity !== "all") bits.push(phase3State_.taskSeverity);
    const label = bits.length ? bits.join(" • ") : "No filter";
    info.textContent = `${label} • visible ${visible}/${activeCount} • selected ${selectedCount}`;
  }

  if(ui.taskScopeHint){
    const base = `${p.name} • ${m.title}${p.archived ? " • ARCHIVED" : ""}`;
    ui.taskScopeHint.textContent = `${base} • ${visible}/${activeCount} shown`;
  }

  // Update action button labels
  const btnSelectVisible = document.querySelector("#phase3BtnSelectVisible");
  if(btnSelectVisible){
    btnSelectVisible.textContent = (visible && selectedVisible === visible) ? "Deselect Visible" : "Select Visible";
  }
}

function phase3GetChecklistContext_(){
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  return { p, m };
}

function phase3GetVisibleTaskIds_(m){
  const out = [];
  for(const t of (m?.tasks || [])){
    if(phase3TaskMatchesFilter_(t)) out.push(t.id);
  }
  return out;
}

function phase3ToggleSelectVisibleTasks_(){
  const { m } = phase3GetChecklistContext_();
  if(!m) return;
  const ids = phase3GetVisibleTaskIds_(m);
  if(!ids.length) return;
  const allSelected = ids.every(id => phase3State_.taskSelection.has(id));
  if(allSelected){
    ids.forEach(id => phase3State_.taskSelection.delete(id));
  }else{
    ids.forEach(id => phase3State_.taskSelection.add(id));
  }
  renderChecklist();
}

function phase3ClearCurrentTaskSelection_(){
  const { m } = phase3GetChecklistContext_();
  if(!m) return;
  const ids = new Set((m.tasks || []).map(t => t.id));
  for(const id of Array.from(phase3State_.taskSelection)){
    if(ids.has(id)) phase3State_.taskSelection.delete(id);
  }
  renderChecklist();
}

function phase3GetSelectedTaskIdsForCurrentMilestone_(){
  const { m } = phase3GetChecklistContext_();
  if(!m) return [];
  const ids = new Set((m.tasks || []).map(t => t.id));
  return Array.from(phase3State_.taskSelection).filter(id => ids.has(id));
}

function phase3BulkSetTaskDone_(done){
  const { p, m } = phase3GetChecklistContext_();
  if(!m || !p) return;

  let ids = phase3GetSelectedTaskIdsForCurrentMilestone_();
  if(!ids.length){
    ids = phase3GetVisibleTaskIds_(m);
    if(!ids.length) return;
  }

  let changed = 0;
  for(const t of (m.tasks || [])){
    if(ids.includes(t.id) && t.done !== !!done){
      t.done = !!done;
      changed++;
    }
  }
  if(!changed) return;

  addActivity(`${done ? "Marked done" : "Reopened"} ${changed} task(s) in ${m.title}`);
  saveState();
  renderAll();
}

async function phase3BulkDeleteTasks_(){
  const { p, m } = phase3GetChecklistContext_();
  if(!m || !p) return;

  let ids = phase3GetSelectedTaskIdsForCurrentMilestone_();
  if(!ids.length){
    ids = phase3GetVisibleTaskIds_(m);
    if(!ids.length) return;
  }

  const msg = `Delete ${ids.length} task(s) from "${m.title}"?`;
  const ok = await pmConfirmDialog_(msg, { title:'Bulk Delete Tasks', okText:'Delete', danger:true });
  if(!ok) return;

  const idSet = new Set(ids);
  const before = m.tasks.length;
  m.tasks = (m.tasks || []).filter(t => !idSet.has(t.id));
  for(const id of ids) phase3State_.taskSelection.delete(id);
  const removed = before - m.tasks.length;
  if(!removed) return;

  addActivity(`Bulk deleted ${removed} task(s) in ${m.title}`);
  saveState();
  renderAll();
}

async function phase3ToggleArchiveActiveProject_(){
  const p = getActiveProject();
  if(!p) return;

  const next = !Boolean(p.archived);
  if(next){
    // Optional safety prompt if there are open tasks
    const counts = computeProjectCounts(p);
    const open = Math.max(0, counts.tasks - counts.done);
    if(open > 0){
      const ok = await pmConfirmDialog_(`Archive "${p.name}" with ${open} open task(s)?`, { title:'Archive Project', okText:'Archive' });
      if(!ok) return;
    }
  }

  p.archived = next;
  addActivity(`${next ? "Archived" : "Unarchived"} project: ${p.name}`);

  // If hidden archive mode is active and the active project was archived, switch to the first visible project.
  if(next && !phase3State_.showArchived){
    const nextVisible = (state.projects || []).find(x => x && !x.archived && x.id !== p.id) || null;
    if(nextVisible){
      state.activeProjectId = nextVisible.id;
      const mods = Array.isArray(nextVisible.modules) ? nextVisible.modules : [];
      state.activeModuleId = mods[0]?.id ?? null;
      state.activeMilestoneId = (mods[0]?.milestones || [])[0]?.id ?? null;
    }
  }

  saveState();
  renderAll();
}

function phase3Templates_(){
  return [
    {
      key: "software-module",
      name: "Software Module Build",
      summary: "Planning → Build → QA → Release",
      modules: [
        {
          name: "Module 1 - Planning & Setup",
          milestones: [
            {
              title: "Requirements + Architecture",
              tasks: [
                { title: "Define scope and constraints", severity: "high" },
                { title: "Create milestone breakdown" },
                { title: "Confirm acceptance criteria", severity: "high" },
              ],
            },
            {
              title: "Environment + Foundation",
              tasks: [
                { title: "Prepare local/dev environment" },
                { title: "Set coding standards + lint checks" },
                { title: "Create base folders + app shell" },
              ],
            },
          ],
        },
        {
          name: "Module 2 - Implementation",
          milestones: [
            {
              title: "Core Features",
              tasks: [
                { title: "Implement feature set A", severity: "high" },
                { title: "Implement feature set B" },
                { title: "Add validation and error handling", severity: "blocker" },
              ],
            },
            {
              title: "QA + Release",
              tasks: [
                { title: "Write regression checklist", severity: "high" },
                { title: "Run end-to-end verification" },
                { title: "Prepare release notes + backup" },
              ],
            },
          ],
        },
      ],
    },
    {
      key: "client-delivery",
      name: "Client Delivery Project",
      summary: "Discovery → Delivery → Handover",
      modules: [
        {
          name: "Module 1 - Discovery",
          milestones: [
            {
              title: "Client Intake",
              tasks: [
                { title: "Capture requirements", severity: "high" },
                { title: "Collect reference files and constraints" },
                { title: "Define timeline + milestones", severity: "high" },
              ],
            },
            {
              title: "Proposal + Approval",
              tasks: [
                { title: "Draft scope proposal" },
                { title: "Align deliverables with client", severity: "high" },
                { title: "Lock baseline version" },
              ],
            },
          ],
        },
        {
          name: "Module 2 - Delivery",
          milestones: [
            {
              title: "Build + Review",
              tasks: [
                { title: "Implement deliverable v1" },
                { title: "Internal QA pass", severity: "high" },
                { title: "Client review + revisions", severity: "high" },
              ],
            },
            {
              title: "Handover",
              tasks: [
                { title: "Package final files" },
                { title: "Write user guide / notes" },
                { title: "Handover and sign-off", severity: "blocker" },
              ],
            },
          ],
        },
      ],
    },
    {
      key: "research-sprint",
      name: "Research Sprint",
      summary: "Question → Experiments → Findings",
      modules: [
        {
          name: "Module 1 - Research Setup",
          milestones: [
            {
              title: "Research Question + Plan",
              tasks: [
                { title: "Define research objective", severity: "high" },
                { title: "List hypotheses" },
                { title: "Create experiment checklist" },
              ],
            },
            {
              title: "Data + Tools",
              tasks: [
                { title: "Collect references / datasets", severity: "high" },
                { title: "Set evaluation criteria" },
                { title: "Prepare log template for results" },
              ],
            },
          ],
        },
        {
          name: "Module 2 - Experiment + Report",
          milestones: [
            {
              title: "Experiments",
              tasks: [
                { title: "Run experiment batch 1", severity: "high" },
                { title: "Run experiment batch 2" },
                { title: "Compare outcomes + anomalies", severity: "high" },
              ],
            },
            {
              title: "Report + Next Steps",
              tasks: [
                { title: "Summarize findings" },
                { title: "Document recommendations", severity: "high" },
                { title: "Define follow-up tasks" },
              ],
            },
          ],
        },
      ],
    },
  ];
}

async function phase3OpenTemplatePrompt_(){
  const templates = phase3Templates_();
  const lines = templates.map((t, i) => `${i + 1}. ${t.name} — ${t.summary}`);
  const ans = await pmPromptDialog_(`Create project from template:\n\n${lines.join("\n")}\n\nEnter number or key`, '1', { title:'Project Templates', placeholder:'1 / key' });
  if(ans == null) return;
  const raw = String(ans).trim().toLowerCase();
  if(!raw) return;
  let tpl = templates.find(t => t.key === raw) || null;
  if(!tpl){
    const idx = Number(raw);
    if(Number.isFinite(idx) && idx >= 1 && idx <= templates.length) tpl = templates[idx - 1];
  }
  if(!tpl){
    alert("Template not found.");
    return;
  }
  await phase3CreateProjectFromTemplate_(tpl);
}

async function phase3CreateProjectFromTemplate_(tpl){
  if(!tpl) return;
  const customName = await pmPromptDialog_('Project name?', tpl.name, { title:'Create Project From Template', placeholder:'Project name' });
  if(customName == null) return;
  const name = String(customName).trim() || tpl.name;

  /** @type {Project} */
  const p = {
    id: uid(),
    name,
    desc: `Template: ${tpl.name}`,
    status: "active",
    tag: "template",
    archived: false,
    modules: [],
    createdAt: Date.now(),
  };

  const modules = [];
  for(const mdef of (tpl.modules || [])){
    const mod = mkModule(mdef.name || "Module");
    mod.milestones = [];
    for(const msdef of (mdef.milestones || [])){
      const ms = mkMilestone(msdef.title || "Milestone");
      ms.tasks = [];
      for(const tdef of (msdef.tasks || [])){
        const t = mkTask(tdef.title || "Task", false);
        if(tdef.severity && (tdef.severity === "normal" || tdef.severity === "high" || tdef.severity === "blocker")) t.severity = tdef.severity;
        if(tdef.assignee) t.assignee = String(tdef.assignee);
        ms.tasks.push(t);
      }
      mod.milestones.push(ms);
    }
    if(!mod.milestones.length) mod.milestones.push(mkMilestone("General"));
    modules.push(mod);
  }
  p.modules = modules.length ? modules : [ mkModule("General") ];

  state.projects.unshift(p);
  state.activeProjectId = p.id;
  state.activeModuleId = p.modules[0]?.id ?? null;
  state.activeMilestoneId = p.modules[0]?.milestones?.[0]?.id ?? null;

  addActivity(`Created project from template: ${p.name}`);
  saveState();
  renderAll();
  switchTab("projects");
}

function phase3BuildCmdkItems_(query){
  const q = String(query || "").trim().toLowerCase();
  const items = [];

  // Commands
  const commands = [
    { kind:"command", title:"Go: Dashboard", sub:"Switch tab", tag:"TAB", act:"tab", tab:"dashboard" },
    { kind:"command", title:"Go: Project", sub:"Switch tab", tag:"TAB", act:"tab", tab:"projects" },
    { kind:"command", title:"Go: Milestone", sub:"Switch tab", tag:"TAB", act:"tab", tab:"milestones" },
    { kind:"command", title:"Go: Checklist", sub:"Switch tab", tag:"TAB", act:"tab", tab:"checklist" },
    { kind:"command", title:"Go: Import", sub:"Switch tab", tag:"TAB", act:"tab", tab:"import" },
    { kind:"command", title:"Create New Project", sub:"Open project flow", tag:"ACTION", act:"newProject" },
    { kind:"command", title:"Create from Template", sub:"Open built-in templates", tag:"ACTION", act:"template" },
    { kind:"command", title:"Export Active Project (MD)", sub:"Topbar export", tag:"ACTION", act:"exportMd" },
    { kind:"command", title:"Export Active Project (TXT)", sub:"Topbar export", tag:"ACTION", act:"exportTxt" },
  ];
  for(const c of commands){
    const hay = `${c.title} ${c.sub} ${c.tag}`.toLowerCase();
    if(!q || hay.includes(q)) items.push(c);
  }

  // Entities
  for(const p of (state.projects || [])){
    const pTag = p.archived ? "PROJECT • ARCHIVED" : "PROJECT";
    const pHay = `${p.name} ${p.tag || ""} ${p.desc || ""}`.toLowerCase();
    if(!q || pHay.includes(q)){
      items.push({ kind:"project", title:p.name, sub:(p.tag || p.status || "project"), tag:pTag, pId:p.id });
    }
    for(const mod of (p.modules || [])){
      const mHay = `${mod.name} ${mod.desc || ""} ${p.name}`.toLowerCase();
      if(!q || mHay.includes(q)){
        items.push({ kind:"module", title:mod.name, sub:p.name, tag:"MODULE", pId:p.id, modId:mod.id });
      }
      for(const ms of (mod.milestones || [])){
        const msHay = `${ms.title} ${ms.notes || ""} ${mod.name} ${p.name}`.toLowerCase();
        if(!q || msHay.includes(q)){
          items.push({ kind:"milestone", title:ms.title, sub:`${p.name} • ${mod.name}`, tag:"MILESTONE", pId:p.id, modId:mod.id, msId:ms.id });
        }
        for(const t of (ms.tasks || [])){
          const tHay = `${t.title} ${t.assignee || ""} ${ms.title} ${mod.name} ${p.name}`.toLowerCase();
          if(!q || tHay.includes(q)){
            items.push({ kind:"task", title:t.title, sub:`${p.name} • ${ms.title}${t.done ? " • DONE" : ""}`, tag:`TASK • ${String(t.severity || "normal").toUpperCase()}`, pId:p.id, modId:mod.id, msId:ms.id, tId:t.id });
          }
        }
      }
    }
  }

  // Simple relevance sort
  const score = (x) => {
    if(!q) return 0;
    const t = String(x.title || "").toLowerCase();
    const s = String(x.sub || "").toLowerCase();
    let sc = 0;
    if(t === q) sc += 100;
    if(t.startsWith(q)) sc += 60;
    if(t.includes(q)) sc += 30;
    if(s.includes(q)) sc += 10;
    if(x.kind === "command") sc += 5;
    return sc;
  };

  items.sort((a,b) => score(b) - score(a) || String(a.title).localeCompare(String(b.title)));
  return items.slice(0, 80);
}

function phase3RenderCmdkResults_(){
  const wrap = document.querySelector("#phase3Cmdk");
  const input = document.querySelector("#phase3CmdkInput");
  const list = document.querySelector("#phase3CmdkList");
  if(!wrap || !input || !list) return;

  const items = phase3BuildCmdkItems_(input.value || "");
  if(!items.length){
    list.innerHTML = `<div class="phase3-cmdk__empty">No results.</div>`;
    phase3State_.cmdIndex = 0;
    return;
  }

  phase3State_.cmdIndex = Math.max(0, Math.min(phase3State_.cmdIndex, items.length - 1));

  list.innerHTML = "";
  items.forEach((it, idx) => {
    const row = document.createElement("div");
    row.className = "phase3-cmdk__item " + (idx === phase3State_.cmdIndex ? "is-active" : "");
    row.dataset.payload = JSON.stringify(it);
    row.innerHTML = `
      <div class="phase3-cmdk__main">
        <div class="phase3-cmdk__title">${escapeHtml(it.title || "")}</div>
        <div class="phase3-cmdk__sub">${escapeHtml(it.sub || "")}</div>
      </div>
      <div class="phase3-cmdk__tag">${escapeHtml(it.tag || "")}</div>
    `;
    row.addEventListener("mouseenter", () => {
      phase3State_.cmdIndex = idx;
      // visual only, avoid full rerender
      Array.from(list.querySelectorAll(".phase3-cmdk__item")).forEach((el, i) => el.classList.toggle("is-active", i === idx));
    });
    row.addEventListener("click", () => phase3RunCmdkAction_(it));
    list.appendChild(row);
  });

  // Keep active row visible
  const active = list.querySelector(".phase3-cmdk__item.is-active");
  if(active && active.scrollIntoView){
    active.scrollIntoView({ block:"nearest" });
  }
}

function phase3OpenCmdk_(seed){
  const wrap = document.querySelector("#phase3Cmdk");
  const input = document.querySelector("#phase3CmdkInput");
  if(!wrap || !input) return;
  phase3State_.cmdOpen = true;
  wrap.classList.add("is-open");
  if(typeof seed === "string"){
    input.value = seed;
  }
  phase3State_.cmdIndex = 0;
  phase3RenderCmdkResults_();
  setTimeout(() => { input.focus(); input.select(); }, 0);
}

function phase3CloseCmdk_(){
  const wrap = document.querySelector("#phase3Cmdk");
  if(!wrap) return;
  phase3State_.cmdOpen = false;
  wrap.classList.remove("is-open");
}

function phase3RunCmdkAction_(it){
  if(!it || typeof it !== "object") return;
  phase3CloseCmdk_();

  if(it.kind === "command"){
    if(it.act === "tab" && it.tab){ switchTab(it.tab); return; }
    if(it.act === "newProject"){ switchTab("projects"); newProject(); return; }
    if(it.act === "template"){ switchTab("projects"); phase3OpenTemplatePrompt_(); return; }
    if(it.act === "exportMd"){ ui.btnExportMd?.click(); return; }
    if(it.act === "exportTxt"){ ui.btnExportTxt?.click(); return; }
    return;
  }

  if(it.pId) setActiveProject(it.pId);
  if(it.modId) setActiveModule(it.modId);
  if(it.msId) setActiveMilestone(it.msId);

  if(it.kind === "project"){
    switchTab("projects");
    return;
  }
  if(it.kind === "module" || it.kind === "milestone"){
    switchTab("milestones");
    return;
  }
  if(it.kind === "task"){
    switchTab("checklist");
    // Pre-fill checklist filter to surface the task quickly (non-destructive)
    if(it.tId){
      phase3State_.taskStatus = "all";
      phase3State_.taskSeverity = "all";
      phase3State_.taskQuery = String(it.title || "").trim();
      renderChecklist();
      const taskEl = Array.from(document.querySelectorAll("#taskList .task")).find(el => el.dataset.taskId === it.tId && !el.classList.contains("phase3-hidden"));
      if(taskEl){
        taskEl.scrollIntoView({ behavior:"smooth", block:"center" });
        taskEl.classList.add("is-selected");
        setTimeout(() => taskEl.classList.remove("is-selected"), 1200);
      }
    }
    return;
  }
}

// Boot phase-3 after the base app definitions are loaded.
try{ initPhase3_(); }catch(err){ console.warn("Phase3 init failed", err); }

/* =========================================================
   PHASE 4 PATCH (Dependencies, Due Dates, Saved Views, Integrity)
   Additive monkey-patch layer on top of Phase 3
========================================================= */
var phase4State_ = {
  inited: false,
  uiReady: false,
  taskDueFilter: "all", // all|overdue|today|week|has|none
  blockedOnly: false,
  savedViews: {},
  pendingAddDue: null,
  suppressTaskCheckGuard: false,
};

const PHASE4_VIEWS_KEY = "stark_pm_phase4_views_v1";

function initPhase4_(){
  if(phase4State_.inited) return;
  phase4State_.inited = true;

  phase4LoadViews_();
  phase4InjectStyles_();
  phase4EnsureUi_();
  phase4PatchFunctions_();
  phase4WireGuards_();
  phase4NormalizeCurrentState_();
  try{ renderAll(); }catch{ /* ignore */ }
}

function phase4InjectStyles_(){
  if(document.querySelector('#phase4Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase4Styles';
  st.textContent = `
    .phase4-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px}
    .phase4-toolbar .select,.phase4-toolbar .input{min-width:0}
    .phase4-toolbar .select{min-width:128px}
    .phase4-toolbar .btn.btn--mini{padding:5px 8px;font-size:12px}
    .phase4-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);font-size:12px;background:rgba(255,255,255,.02)}
    .phase4-due-badge.badge--overdue{border-color:rgba(255,99,99,.45);color:#ffd0d0}
    .phase4-due-badge.badge--today{border-color:rgba(255,215,90,.45);color:#ffe9a3}
    .phase4-due-badge.badge--soon{border-color:rgba(95,220,255,.35);color:#c5f4ff}
    .phase4-blocked-badge{border-color:rgba(255,130,130,.35)!important;color:#ffd0d0}
    .phase4-planner-btn{font-weight:700}
    .phase4-timeline{margin:10px 0 12px;border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:10px;background:rgba(255,255,255,.015)}
    .phase4-timeline__head{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:8px}
    .phase4-timeline__title{font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.85}
    .phase4-timeline__hint{font-size:12px;opacity:.75}
    .phase4-timeline__list{display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:auto}
    .phase4-timeline__row{display:flex;justify-content:space-between;gap:10px;align-items:center;border:1px solid rgba(255,255,255,.08);border-radius:10px;padding:7px 9px;background:rgba(255,255,255,.01);cursor:pointer}
    .phase4-timeline__row:hover{border-color:rgba(0,255,255,.22);background:rgba(255,255,255,.02)}
    .phase4-timeline__row.is-overdue{border-color:rgba(255,99,99,.22)}
    .phase4-timeline__row.is-today{border-color:rgba(255,215,90,.22)}
    .phase4-timeline__left{min-width:0}
    .phase4-timeline__task{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .phase4-timeline__sub{font-size:11px;opacity:.7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .phase4-timeline__date{font-size:11px;opacity:.9;white-space:nowrap}
    .phase4-inlineField{margin-top:8px}
    .phase4-taskmeta-note{opacity:.8;font-size:11px}
  `;
  document.head.appendChild(st);
}

function phase4EnsureUi_(){
  if(!window.ui) return;

  // Quick due date input in Add Task card
  if(ui.taskAssignee && !document.querySelector('#phase4TaskDueWrap')){
    const row = ui.taskAssignee.closest('.row') || ui.taskAssignee.closest('.form');
    const actionsRow = ui.btnAddTask ? ui.btnAddTask.closest('.row') : null;
    const wrap = document.createElement('label');
    wrap.id = 'phase4TaskDueWrap';
    wrap.className = 'field phase4-inlineField';
    wrap.innerHTML = `
      <span class="field__label">Due Date (optional)</span>
      <input class="input" id="phase4TaskDue" type="date" />
    `;
    if(actionsRow && actionsRow.parentElement){
      actionsRow.parentElement.insertBefore(wrap, actionsRow);
    }else if(row && row.parentElement){
      row.parentElement.appendChild(wrap);
    }
  }

  // Task timeline panel above task list
  if(ui.taskList && !document.querySelector('#phase4Timeline')){
    const panel = document.createElement('div');
    panel.id = 'phase4Timeline';
    panel.className = 'phase4-timeline';
    panel.innerHTML = `
      <div class="phase4-timeline__head">
        <div class="phase4-timeline__title">Task Timeline</div>
        <div class="phase4-timeline__hint" id="phase4TimelineHint">No due dates yet.</div>
      </div>
      <div class="phase4-timeline__list" id="phase4TimelineList"></div>
    `;
    ui.taskList.parentElement.insertBefore(panel, ui.taskList);
  }

  // Extend Phase 3 task toolbar
  const tb = document.querySelector('#phase3TaskToolbar');
  if(tb && !document.querySelector('#phase4TaskToolbarExt')){
    const ext = document.createElement('div');
    ext.id = 'phase4TaskToolbarExt';
    ext.className = 'phase4-toolbar';
    ext.innerHTML = `
      <select id="phase4TaskDueFilter" class="select" title="Due date filter">
        <option value="all">Due: All</option>
        <option value="overdue">Due: Overdue</option>
        <option value="today">Due: Today</option>
        <option value="week">Due: 7 Days</option>
        <option value="has">Due: Has Date</option>
        <option value="none">Due: No Date</option>
      </select>
      <label class="phase4-chip"><input type="checkbox" id="phase4BlockedOnly" /> Blocked only</label>
      <span class="phase3-sep"></span>
      <select id="phase4ViewPreset" class="select" title="Saved checklist views"></select>
      <button class="btn btn--ghost btn--mini" id="phase4BtnApplyView" type="button">Apply View</button>
      <button class="btn btn--ghost btn--mini" id="phase4BtnSaveView" type="button">Save View</button>
      <button class="btn btn--ghost btn--mini" id="phase4BtnDeleteView" type="button">Delete View</button>
    `;
    tb.appendChild(ext);

    ext.querySelector('#phase4TaskDueFilter').addEventListener('change', (e) => {
      phase4State_.taskDueFilter = String(e.target.value || 'all');
      renderChecklist();
    });
    ext.querySelector('#phase4BlockedOnly').addEventListener('change', (e) => {
      phase4State_.blockedOnly = !!e.target.checked;
      renderChecklist();
    });
    ext.querySelector('#phase4BtnApplyView').addEventListener('click', phase4ApplySelectedView_);
    ext.querySelector('#phase4BtnSaveView').addEventListener('click', phase4SaveViewPrompt_);
    ext.querySelector('#phase4BtnDeleteView').addEventListener('click', phase4DeleteSelectedView_);
    phase4RefreshSavedViewSelect_();
  }

  // Integrity button in topbar
  const topbarRight = document.querySelector('.topbar__right');
  if(topbarRight && !document.querySelector('#phase4BtnIntegrity')){
    const btn = document.createElement('button');
    btn.id = 'phase4BtnIntegrity';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Integrity';
    btn.addEventListener('click', phase4OpenIntegrityReport_);
    topbarRight.appendChild(btn);
  }

  phase4SyncToolbarUi_();
  phase4State_.uiReady = true;
}

function phase4PatchFunctions_(){
  if(phase4PatchFunctions_._done) return; phase4PatchFunctions_._done = true;

  // Extend task factory (used by import/template paths)
  const _mkTask = mkTask;
  mkTask = function(title, done){
    const t = _mkTask(title, done);
    phase4NormalizeTaskMeta_(t);
    return t;
  };

  // Additional checklist filtering (wrap Phase3 matcher if present)
  if(typeof phase3TaskMatchesFilter_ === 'function'){
    const _phase3TaskMatches = phase3TaskMatchesFilter_;
    phase3TaskMatchesFilter_ = function(task){
      if(!_phase3TaskMatches(task)) return false;
      phase4NormalizeTaskMeta_(task);

      if(phase4State_.blockedOnly && !phase4IsTaskBlocked_(task)) return false;

      const f = phase4State_.taskDueFilter || 'all';
      if(f !== 'all'){
        const due = Number(task.dueAt || 0) || 0;
        const bucket = phase4DueBucket_(due);
        if(f === 'has' && !due) return false;
        if(f === 'none' && due) return false;
        if(f === 'overdue' && bucket !== 'overdue') return false;
        if(f === 'today' && bucket !== 'today') return false;
        if(f === 'week' && !(bucket === 'today' || bucket === 'soon')) return false;
      }
      return true;
    };
  }

  // Post-render enrichments after Phase3 checklist processing
  if(typeof phase3PostRenderChecklist_ === 'function'){
    const _phase3Post = phase3PostRenderChecklist_;
    phase3PostRenderChecklist_ = function(){
      _phase3Post();
      phase4EnsureUi_();
      phase4PostRenderChecklist_();
    };
  }

  // Bulk done should skip blocked tasks
  if(typeof phase3BulkSetTaskDone_ === 'function'){
    const _bulk = phase3BulkSetTaskDone_;
    phase3BulkSetTaskDone_ = async function(done){
      if(!done) return _bulk(done);
      const ctx = phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null;
      const m = ctx && ctx.m;
      if(!m) return _bulk(done);
      const candidateIds = (typeof phase3GetSelectedTaskIdsForCurrentMilestone_ === 'function' && phase3GetSelectedTaskIdsForCurrentMilestone_().length)
        ? phase3GetSelectedTaskIdsForCurrentMilestone_()
        : (typeof phase3GetVisibleTaskIds_ === 'function' ? phase3GetVisibleTaskIds_(m) : []);
      const byId = new Map((m.tasks || []).map(t => [t.id, t]));
      const blocked = candidateIds.filter(id => {
        const t = byId.get(id);
        return t && !t.done && phase4IsTaskBlocked_(t, m);
      });
      if(blocked.length){
        const names = blocked.slice(0,3).map(id => byId.get(id)?.title || id).join(', ');
        const ok = await pmConfirmDialog_(`Some selected task(s) are blocked and will be skipped.\nBlocked: ${blocked.length}${names ? `\nExamples: ${names}` : ''}\n\nContinue?`, {
          title:'Bulk Complete • Blocked Tasks',
          okText:'Continue'
        });
        if(!ok) return;
      }
      phase4State_.suppressTaskCheckGuard = true;
      try{ _bulk(done); } finally { phase4State_.suppressTaskCheckGuard = false; }
    };
  }

  // Ensure current add-task due date is applied even though base wireChecklist already bound listeners
  if(ui && ui.btnAddTask && !ui.btnAddTask.__phase4Patched){
    ui.btnAddTask.__phase4Patched = true;
    ui.btnAddTask.addEventListener('click', phase4CapturePendingDue_, true); // capture before base handler
    ui.btnAddTask.addEventListener('click', phase4ApplyPendingDueToLatestTask_); // bubble after base handler
  }
}

function phase4WireGuards_(){
  if(!ui || !ui.taskList || ui.taskList.__phase4GuardWired) return;
  ui.taskList.__phase4GuardWired = true;

  ui.taskList.addEventListener('click', (e) => {
    if(phase4State_.suppressTaskCheckGuard) return;
    const target = e.target;
    if(!(target instanceof Element)) return;
    const check = target.closest('.task__check');
    if(!check) return;
    const card = target.closest('.task');
    const taskId = card?.dataset?.taskId;
    if(!taskId) return;
    const ctx = phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null;
    const m = ctx && ctx.m;
    if(!m) return;
    const task = (m.tasks || []).find(t => t.id === taskId);
    if(!task) return;
    if(task.done) return; // reopening is allowed
    if(phase4IsTaskBlocked_(task, m)){
      const blockers = phase4BlockedTaskTitles_(task, m).join(', ') || 'unfinished dependency task(s)';
      alert(`This task is blocked and cannot be completed yet.\nBlockers: ${blockers}`);
      e.preventDefault();
      e.stopPropagation();
      if(typeof e.stopImmediatePropagation === 'function') e.stopImmediatePropagation();
    }
  }, true);
}

function phase4NormalizeCurrentState_(){
  try{
    for(const p of state.projects || []){
      p.modules = Array.isArray(p.modules) ? p.modules : [];
      for(const mod of p.modules){
        mod.milestones = Array.isArray(mod.milestones) ? mod.milestones : [];
        for(const ms of mod.milestones){
          ms.tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
          for(const t of ms.tasks) phase4NormalizeTaskMeta_(t);
        }
      }
    }
  }catch{ /* ignore */ }
}

function phase4NormalizeTaskMeta_(t){
  if(!t || typeof t !== 'object') return t;
  if(!Array.isArray(t.blockedBy)) t.blockedBy = [];
  t.blockedBy = Array.from(new Set(t.blockedBy.filter(x => typeof x === 'string' && x.trim())));
  if(typeof t.blockerNote !== 'string') t.blockerNote = '';
  if(t.dueAt != null && t.dueAt !== ''){
    const n = Number(t.dueAt);
    t.dueAt = Number.isFinite(n) && n > 0 ? n : null;
  }else{
    t.dueAt = null;
  }
  return t;
}

function phase4GetTaskDueInput_(){
  return document.querySelector('#phase4TaskDue');
}

function phase4CapturePendingDue_(){
  const inp = phase4GetTaskDueInput_();
  const raw = inp ? String(inp.value || '').trim() : '';
  const title = ui?.taskText ? String(ui.taskText.value || '').trim() : '';
  phase4State_.pendingAddDue = raw ? { raw, at: Date.now(), title } : null;
}

function phase4ApplyPendingDueToLatestTask_(){
  const pending = phase4State_.pendingAddDue;
  if(!pending) return;
  phase4State_.pendingAddDue = null;
  const ctx = phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null;
  const m = ctx && ctx.m;
  if(!m || !Array.isArray(m.tasks) || !m.tasks.length) return;

  const t = m.tasks[0];
  if(!t) return;
  phase4NormalizeTaskMeta_(t);
  // Apply only to a task that looks freshly added and lacks due date
  const age = Date.now() - Number(t.createdAt || 0);
  if(age > 5000) return;
  if(t.dueAt) return;
  if(pending.title && t.title && String(t.title).trim() !== pending.title) return;

  const ts = phase4ParseDateInputToTs_(pending.raw);
  if(!ts) return;
  t.dueAt = ts;
  addActivity(`Set due date: ${t.title} → ${phase4FmtDate_(ts)}`);
  const inp = phase4GetTaskDueInput_();
  if(inp) inp.value = '';
  saveState();
  renderChecklist();
}

function phase4ParseDateInputToTs_(raw){
  const s = String(raw || '').trim();
  if(!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!m) return null;
  const y = Number(m[1]), mo = Number(m[2]) - 1, d = Number(m[3]);
  const dt = new Date(y, mo, d, 12, 0, 0, 0);
  const ts = dt.getTime();
  return Number.isFinite(ts) ? ts : null;
}

function phase4FmtDate_(ts){
  const n = Number(ts || 0);
  if(!n) return '—';
  const d = new Date(n);
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function phase4TodayStart_(){
  const d = new Date();
  d.setHours(0,0,0,0);
  return d.getTime();
}

function phase4DueBucket_(dueAt){
  const due = Number(dueAt || 0);
  if(!due) return 'none';
  const day = 86400000;
  const today = phase4TodayStart_();
  const dueDay = new Date(due); dueDay.setHours(0,0,0,0);
  const dueTs = dueDay.getTime();
  const diffDays = Math.round((dueTs - today) / day);
  if(diffDays < 0) return 'overdue';
  if(diffDays === 0) return 'today';
  if(diffDays <= 7) return 'soon';
  return 'later';
}

function phase4GetTaskByIdInMilestone_(taskId, ms){
  const ctx = ms ? { m: ms } : (phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null);
  const m = ctx && ctx.m;
  if(!m) return null;
  return (m.tasks || []).find(t => t.id === taskId) || null;
}

function phase4IsTaskBlocked_(task, ms){
  phase4NormalizeTaskMeta_(task);
  if(!task || !Array.isArray(task.blockedBy) || !task.blockedBy.length) return false;
  const ctx = ms ? { m: ms } : (phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null);
  const m = ctx && ctx.m;
  if(!m) return false;
  const byId = new Map((m.tasks || []).map(t => [t.id, t]));
  for(const depId of task.blockedBy){
    const dep = byId.get(depId);
    if(dep && !dep.done) return true;
  }
  return false;
}

function phase4BlockedTaskTitles_(task, ms){
  phase4NormalizeTaskMeta_(task);
  const ctx = ms ? { m: ms } : (phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null);
  const m = ctx && ctx.m;
  if(!m) return [];
  const byId = new Map((m.tasks || []).map(t => [t.id, t]));
  return (task.blockedBy || [])
    .map(id => byId.get(id))
    .filter(dep => dep && !dep.done)
    .map(dep => dep.title);
}

function phase4PostRenderChecklist_(){
  phase4SyncToolbarUi_();
  phase4RenderTimeline_();

  const ctx = phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null;
  const m = ctx && ctx.m;
  const cards = Array.from(document.querySelectorAll('#taskList .task'));
  if(!m || !cards.length) return;
  const tasks = Array.isArray(m.tasks) ? m.tasks : [];

  cards.forEach((el, idx) => {
    const t = tasks[idx];
    if(!t) return;
    phase4NormalizeTaskMeta_(t);

    // Planner button (once)
    const actions = el.querySelector('.task__actions');
    if(actions && !actions.querySelector('[data-act="phase4Plan"]')){
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'iconbtn phase4-planner-btn';
      btn.title = 'Planner (due date + blockers)';
      btn.dataset.act = 'phase4Plan';
      btn.textContent = '⛓';
      btn.addEventListener('click', () => phase4OpenTaskPlanner_(t));
      actions.insertBefore(btn, actions.firstChild || null);
    }

    // Add due / blocked badges
    const meta = el.querySelector('.task__meta');
    if(meta){
      Array.from(meta.querySelectorAll('.phase4-due-badge,.phase4-blocked-badge')).forEach(n => n.remove());
      if(t.dueAt){
        const dueBucket = phase4DueBucket_(t.dueAt);
        const b = document.createElement('span');
        b.className = 'badge phase4-due-badge';
        if(dueBucket === 'overdue') b.classList.add('badge--overdue');
        else if(dueBucket === 'today') b.classList.add('badge--today');
        else if(dueBucket === 'soon') b.classList.add('badge--soon');
        b.textContent = `DUE ${phase4FmtDate_(t.dueAt)}`;
        b.title = dueBucket === 'overdue' ? 'Overdue' : dueBucket === 'today' ? 'Due today' : dueBucket === 'soon' ? 'Due within 7 days' : 'Has due date';
        meta.appendChild(b);
      }
      if((t.blockedBy || []).length){
        const b2 = document.createElement('span');
        b2.className = 'badge phase4-blocked-badge';
        const blockedNow = phase4IsTaskBlocked_(t, m);
        b2.textContent = blockedNow ? `BLOCKED ${t.blockedBy.length}` : `DEPS ${t.blockedBy.length}`;
        const tipLines = phase4BlockedTaskTitles_(t, m);
        b2.title = tipLines.length ? `Waiting on: ${tipLines.join(', ')}` : `Dependencies: ${t.blockedBy.length}`;
        meta.appendChild(b2);
      }
    }
  });
}

function phase4SyncToolbarUi_(){
  const dueSel = document.querySelector('#phase4TaskDueFilter');
  const blockedChk = document.querySelector('#phase4BlockedOnly');
  if(dueSel) dueSel.value = phase4State_.taskDueFilter || 'all';
  if(blockedChk) blockedChk.checked = !!phase4State_.blockedOnly;
  phase4RefreshSavedViewSelect_();
}

function phase4RenderTimeline_(){
  const list = document.querySelector('#phase4TimelineList');
  const hint = document.querySelector('#phase4TimelineHint');
  if(!list || !hint) return;
  const ctx = phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null;
  const p = ctx && ctx.p;
  const m = ctx && ctx.m;
  if(!p || !m){
    hint.textContent = 'Select a project + milestone.';
    list.innerHTML = '';
    return;
  }

  const dueTasks = (m.tasks || [])
    .map(t => (phase4NormalizeTaskMeta_(t), t))
    .filter(t => t.dueAt)
    .sort((a,b) => Number(a.dueAt||0) - Number(b.dueAt||0) || Number(a.done) - Number(b.done));

  if(!dueTasks.length){
    hint.textContent = 'No due dates in this milestone yet.';
    list.innerHTML = '';
    return;
  }

  const overdue = dueTasks.filter(t => phase4DueBucket_(t.dueAt) === 'overdue').length;
  const today = dueTasks.filter(t => phase4DueBucket_(t.dueAt) === 'today').length;
  hint.textContent = `${dueTasks.length} due • ${overdue} overdue • ${today} today`;

  list.innerHTML = '';
  dueTasks.slice(0, 40).forEach(t => {
    const bucket = phase4DueBucket_(t.dueAt);
    const row = document.createElement('div');
    row.className = 'phase4-timeline__row' + (bucket === 'overdue' ? ' is-overdue' : bucket === 'today' ? ' is-today' : '');
    row.innerHTML = `
      <div class="phase4-timeline__left">
        <div class="phase4-timeline__task">${escapeHtml(t.title || '')}${t.done ? ' ✓' : ''}</div>
        <div class="phase4-timeline__sub">${escapeHtml(t.assignee || 'Unassigned')}${phase4IsTaskBlocked_(t,m) ? ' • BLOCKED' : ''}</div>
      </div>
      <div class="phase4-timeline__date">${escapeHtml(phase4FmtDate_(t.dueAt))}</div>
    `;
    row.addEventListener('click', () => {
      const card = Array.from(document.querySelectorAll('#taskList .task')).find(el => el.dataset.taskId === t.id);
      if(card){
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('is-selected');
        setTimeout(() => card.classList.remove('is-selected'), 1000);
      }
    });
    list.appendChild(row);
  });
}

async function phase4OpenTaskPlanner_(task){
  const ctx = phase3GetChecklistContext_ ? phase3GetChecklistContext_() : null;
  const m = ctx && ctx.m;
  if(!task || !m) return;
  phase4NormalizeTaskMeta_(task);

  // Due date prompt
  const currentDue = task.dueAt ? phase4FmtDate_(task.dueAt) : '';
  const dueInput = await pmPromptDialog_(`Set due date for task (YYYY-MM-DD).\nLeave blank to clear.`, currentDue, { title:'Task Planner • Due Date', placeholder:'YYYY-MM-DD' });
  if(dueInput === null) return; // cancel entire planner
  const dueTrim = String(dueInput || '').trim();
  if(!dueTrim){
    task.dueAt = null;
  }else{
    const ts = phase4ParseDateInputToTs_(dueTrim);
    if(!ts){ alert('Invalid date format. Use YYYY-MM-DD.'); return; }
    task.dueAt = ts;
  }

  // Blockers prompt (same milestone only)
  const candidates = (m.tasks || []).filter(x => x.id !== task.id);
  const lines = candidates.map((x, i) => `${i+1}. ${x.done ? '[✓]' : '[ ]'} ${x.title}`).join('\n');
  const currentIdxCsv = (task.blockedBy || []).map(id => String(candidates.findIndex(x => x.id === id) + 1)).filter(x => x !== '0').join(',');
  const blockerInput = await pmPromptDialog_(
    `Dependencies / blockers (same milestone only). Enter numbers separated by commas.\nLeave blank for none.\n\n${lines || '(No other tasks available)'}`,
    currentIdxCsv,
    { title:'Task Planner • Dependencies', placeholder:'e.g. 1,2,4' }
  );
  if(blockerInput === null) return; // keep due change already made intentionally

  const nextBlocked = [];
  const raw = String(blockerInput || '').trim();
  if(raw){
    const nums = Array.from(new Set(raw.split(/[\s,]+/).map(v => Number(v)).filter(n => Number.isInteger(n) && n >= 1 && n <= candidates.length)));
    for(const n of nums){
      const dep = candidates[n - 1];
      if(dep) nextBlocked.push(dep.id);
    }
  }
  task.blockedBy = nextBlocked;

  const noteInput = await pmPromptDialog_('Optional blocker note (why blocked / waiting on what). Leave blank to clear.', task.blockerNote || '', { title:'Task Planner • Blocker Note', placeholder:'Optional note' });
  if(noteInput !== null){
    task.blockerNote = String(noteInput || '').trim();
  }

  addActivity(`Planned task: ${task.title}${task.dueAt ? ` • due ${phase4FmtDate_(task.dueAt)}` : ''}${task.blockedBy.length ? ` • deps ${task.blockedBy.length}` : ''}`);
  saveState();
  renderChecklist();
}

function phase4PresetViews_(){
  return {
    '__preset_all': { name:'All Tasks', phase3:{ query:'', status:'all', severity:'all' }, phase4:{ due:'all', blocked:false } },
    '__preset_today': { name:'Due Today', phase3:{ query:'', status:'open', severity:'all' }, phase4:{ due:'today', blocked:false } },
    '__preset_overdue': { name:'Overdue', phase3:{ query:'', status:'open', severity:'all' }, phase4:{ due:'overdue', blocked:false } },
    '__preset_blocked': { name:'Blocked', phase3:{ query:'', status:'open', severity:'all' }, phase4:{ due:'all', blocked:true } },
    '__preset_week': { name:'Due This Week', phase3:{ query:'', status:'open', severity:'all' }, phase4:{ due:'week', blocked:false } },
    '__preset_high_open': { name:'High Priority Open', phase3:{ query:'', status:'open', severity:'high' }, phase4:{ due:'all', blocked:false } },
    '__preset_blockers_overdue': { name:'Blockers + Overdue', phase3:{ query:'', status:'open', severity:'blocker' }, phase4:{ due:'overdue', blocked:false } },
  };
}

function phase4LoadViews_(){
  try{
    const raw = localStorage.getItem(PHASE4_VIEWS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    phase4State_.savedViews = (parsed && typeof parsed === 'object') ? parsed : {};
  }catch{ phase4State_.savedViews = {}; }
}

function phase4PersistViews_(){
  try{ localStorage.setItem(PHASE4_VIEWS_KEY, JSON.stringify(phase4State_.savedViews || {})); }catch{ /* ignore */ }
}

function phase4RefreshSavedViewSelect_(){
  const sel = document.querySelector('#phase4ViewPreset');
  if(!sel) return;
  const prev = sel.value;
  const presets = phase4PresetViews_();
  const customNames = Object.keys(phase4State_.savedViews || {}).sort((a,b) => a.localeCompare(b));
  sel.innerHTML = '';
  const groups = [
    { label:'Presets', entries: Object.entries(presets) },
    { label:'Saved Views', entries: customNames.map(name => [name, phase4State_.savedViews[name]]) }
  ];
  groups.forEach(g => {
    const og = document.createElement('optgroup');
    og.label = g.label;
    g.entries.forEach(([key, val]) => {
      const opt = document.createElement('option');
      opt.value = key;
      opt.textContent = (val && val.name) ? val.name : key;
      og.appendChild(opt);
    });
    sel.appendChild(og);
  });
  if(Array.from(sel.options).some(o => o.value === prev)) sel.value = prev;
  else if(sel.options.length) sel.selectedIndex = 0;
}

function phase4GetCurrentViewState_(){
  return {
    name: 'Custom View',
    phase3: {
      query: String(phase3State_?.taskQuery || ''),
      status: String(phase3State_?.taskStatus || 'all'),
      severity: String(phase3State_?.taskSeverity || 'all'),
    },
    phase4: {
      due: String(phase4State_.taskDueFilter || 'all'),
      blocked: !!phase4State_.blockedOnly,
    }
  };
}

function phase4ApplyViewState_(view){
  if(!view || typeof view !== 'object') return;
  if(window.phase3State_){
    phase3State_.taskQuery = String(view.phase3?.query || '');
    phase3State_.taskStatus = String(view.phase3?.status || 'all');
    phase3State_.taskSeverity = String(view.phase3?.severity || 'all');
  }
  phase4State_.taskDueFilter = String(view.phase4?.due || 'all');
  phase4State_.blockedOnly = !!view.phase4?.blocked;
  renderChecklist();
}

function phase4ApplySelectedView_(){
  const sel = document.querySelector('#phase4ViewPreset');
  if(!sel || !sel.value) return;
  const presets = phase4PresetViews_();
  const key = sel.value;
  const view = presets[key] || phase4State_.savedViews[key];
  if(!view) return;
  phase4ApplyViewState_(view);
  addActivity(`Applied view: ${view.name || key}`);
}

async function phase4SaveViewPrompt_(){
  const name = await pmPromptDialog_('Save current checklist filters as view name?', 'My View', { title:'Save Checklist View', placeholder:'View name' });
  if(name == null) return;
  const key = String(name).trim();
  if(!key) return;
  const view = phase4GetCurrentViewState_();
  view.name = key;
  phase4State_.savedViews[key] = view;
  phase4PersistViews_();
  phase4RefreshSavedViewSelect_();
  const sel = document.querySelector('#phase4ViewPreset');
  if(sel) sel.value = key;
  addActivity(`Saved view: ${key}`);
}

async function phase4DeleteSelectedView_(){
  const sel = document.querySelector('#phase4ViewPreset');
  if(!sel || !sel.value) return;
  const key = sel.value;
  if(String(key).startsWith('__preset_')){
    alert('Preset views cannot be deleted.');
    return;
  }
  if(!phase4State_.savedViews[key]) return;
  const ok = await pmConfirmDialog_(`Delete saved view "${key}"?`, { title:'Delete Checklist View', okText:'Delete', danger:true });
  if(!ok) return;
  delete phase4State_.savedViews[key];
  phase4PersistViews_();
  phase4RefreshSavedViewSelect_();
  addActivity(`Deleted view: ${key}`);
}

async function phase4OpenIntegrityReport_(){
  const report = phase4ScanIntegrity_();
  const lines = [];
  lines.push('Phase 4 Integrity Scan');
  lines.push('');
  lines.push(`Projects: ${report.counts.projects} • Modules: ${report.counts.modules} • Milestones: ${report.counts.milestones} • Tasks: ${report.counts.tasks}`);
  lines.push(`Tasks w/ due date: ${report.counts.tasksWithDue} • Tasks w/ deps: ${report.counts.tasksWithDeps}`);
  lines.push('');
  if(!report.issues.length){
    lines.push('No integrity issues found.');
  }else{
    lines.push(`Issues (${report.issues.length}):`);
    report.issues.slice(0, 30).forEach((x, i) => lines.push(`${i+1}. ${x}`));
    if(report.issues.length > 30) lines.push(`…and ${report.issues.length - 30} more`);
  }
  if(report.warnings.length){
    lines.push('');
    lines.push(`Warnings (${report.warnings.length}):`);
    report.warnings.slice(0, 20).forEach((x, i) => lines.push(`${i+1}. ${x}`));
    if(report.warnings.length > 20) lines.push(`…and ${report.warnings.length - 20} more`);
  }

  await pmAlertDialog_(lines.join('\n'), { title:'Phase 4 Integrity Scan' });

  if(report.fixableCount > 0){
    const ok = await pmConfirmDialog_(`Apply safe repairs now?\n\nThis will normalize Phase 4 task metadata and remove invalid blocker references.\nFixable items: ${report.fixableCount}`, { title:'Integrity Repair', okText:'Apply Repairs' });
    if(ok){
      const fixed = phase4RepairIntegrity_();
      if(fixed > 0){
        addActivity(`Integrity repair applied (${fixed} fix${fixed===1?'':'es'})`);
        saveState();
        renderAll();
      }else{
        alert('No repairs applied.');
      }
    }
  }
}

function phase4ScanIntegrity_(){
  const out = {
    counts: { projects:0, modules:0, milestones:0, tasks:0, tasksWithDue:0, tasksWithDeps:0 },
    issues: [],
    warnings: [],
    fixableCount: 0,
  };

  for(const p of state.projects || []){
    out.counts.projects++;
    for(const mod of (p.modules || [])){
      out.counts.modules++;
      for(const ms of (mod.milestones || [])){
        out.counts.milestones++;
        const tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
        const byId = new Map(tasks.map(t => [t.id, t]));
        for(const t of tasks){
          out.counts.tasks++;
          phase4NormalizeTaskMeta_(t);
          if(t.dueAt) out.counts.tasksWithDue++;
          if((t.blockedBy || []).length) out.counts.tasksWithDeps++;

          if(t.blockedBy.includes(t.id)){
            out.issues.push(`${p.name} / ${mod.name} / ${ms.title} :: task "${t.title}" depends on itself`);
            out.fixableCount++;
          }

          const seen = new Set();
          for(const depId of (t.blockedBy || [])){
            if(seen.has(depId)){
              out.issues.push(`${p.name} / ${mod.name} / ${ms.title} :: task "${t.title}" has duplicate dependency ref`);
              out.fixableCount++;
              continue;
            }
            seen.add(depId);
            if(!byId.has(depId)){
              out.issues.push(`${p.name} / ${mod.name} / ${ms.title} :: task "${t.title}" references missing dependency`);
              out.fixableCount++;
            }
          }
        }

        // Lightweight cycle warnings (DFS within milestone)
        try{
          const visiting = new Set(), visited = new Set();
          const hasCycleFrom = (id) => {
            if(visiting.has(id)) return true;
            if(visited.has(id)) return false;
            visiting.add(id);
            const t = byId.get(id);
            for(const depId of (t?.blockedBy || [])){
              if(!byId.has(depId)) continue;
              if(hasCycleFrom(depId)) return true;
            }
            visiting.delete(id);
            visited.add(id);
            return false;
          };
          for(const id of byId.keys()){
            if(hasCycleFrom(id)){
              out.warnings.push(`${p.name} / ${mod.name} / ${ms.title} :: possible dependency cycle detected`);
              break;
            }
          }
        }catch{ /* ignore */ }
      }
    }
  }
  return out;
}

function phase4RepairIntegrity_(){
  let fixes = 0;
  for(const p of state.projects || []){
    for(const mod of (p.modules || [])){
      for(const ms of (mod.milestones || [])){
        const tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
        const byId = new Set(tasks.map(t => t.id));
        for(const t of tasks){
          const beforeDue = t.dueAt;
          const beforeNote = t.blockerNote;
          const beforeDeps = Array.isArray(t.blockedBy) ? [...t.blockedBy] : t.blockedBy;
          phase4NormalizeTaskMeta_(t);
          let deps = (t.blockedBy || []).filter(id => id !== t.id && byId.has(id));
          deps = Array.from(new Set(deps));
          if(JSON.stringify(beforeDeps || []) !== JSON.stringify(deps)){ fixes++; }
          t.blockedBy = deps;
          if(beforeDue !== t.dueAt) fixes++;
          if(typeof beforeNote !== 'string') fixes++;
        }
      }
    }
  }
  return fixes;
}

// boot phase 4 after phase 3 patch is loaded
try{ initPhase4_(); }catch(err){ console.warn('Phase4 init failed', err); }

/* =========================================================
   Phase 5 Upgrade (Additive Patch)
   - Drag-and-drop task reorder (Checklist List view)
   - Kanban view (Todo / Doing / Done)
   - Recurring task templates + recurring task generator
   - Project settings panel (owner / target date / risk / budget / client / links)
   - Export meta enrichment (due / blockers / stage / recurrence)
========================================================= */

var PHASE5_REC_TPL_KEY = 'stark_pm_phase5_recurring_templates_v1';
var phase5State_ = {
  inited: false,
  patched: false,
  checklistView: 'list', // list|kanban
  dragTaskId: null,
  kanbanDragTaskId: null,
  pendingAddMeta: null,
};

function initPhase5_(){
  if(phase5State_.inited) return;
  phase5State_.inited = true;
  phase5LoadState_();
  phase5EnsureStyles_();
  phase5PatchFunctions_();
  phase5PatchButtons_();
  // render once if app is already up
  try{ renderAll(); }catch{ /* ignore */ }
}

function phase5LoadState_(){
  try{
    const raw = localStorage.getItem('stark_pm_phase5_ui');
    if(!raw) return;
    const x = JSON.parse(raw);
    if(x && (x.checklistView === 'list' || x.checklistView === 'kanban')){
      phase5State_.checklistView = x.checklistView;
    }
  }catch{ /* ignore */ }
}

function phase5SaveUiState_(){
  try{
    localStorage.setItem('stark_pm_phase5_ui', JSON.stringify({ checklistView: phase5State_.checklistView }));
  }catch{ /* ignore */ }
}

function phase5EnsureStyles_(){
  if(document.querySelector('#phase5Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase5Styles';
  st.textContent = `
    .phase5-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}
    .phase5-toolbar .phase5-spacer{flex:1 1 auto}
    .phase5-muted{opacity:.8;font-size:12px}
    .phase5-segment{display:inline-flex;gap:6px;padding:4px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(255,255,255,.02)}
    .phase5-segment .btn{padding:6px 10px;min-height:auto}
    .phase5-segment .btn.is-active{outline:1px solid rgba(124,249,255,.35);box-shadow:0 0 0 1px rgba(124,249,255,.15) inset}

    .phase5-projectSettings{margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.08)}
    .phase5-projectSettings__title{font-size:12px;letter-spacing:.08em;opacity:.8;margin-bottom:10px;text-transform:uppercase}
    .phase5-projectMetaPills{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}

    .phase5-recurringBox{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.02)}
    .phase5-recurringBox .row{align-items:end}
    .phase5-recurringBox .field__label{font-size:11px}
    .phase5-recurringHint{font-size:12px;opacity:.8;margin-top:6px}

    .phase5-taskGrip{cursor:grab;user-select:none}
    .phase5-taskGrip:active{cursor:grabbing}
    .task.phase5-dragging{opacity:.45}
    .task.phase5-drop-before{box-shadow:0 -2px 0 rgba(124,249,255,.75)}
    .task.phase5-drop-after{box-shadow:0 2px 0 rgba(124,249,255,.75)}

    .phase5-kanban{display:none;margin-top:8px}
    .phase5-kanban.is-open{display:block}
    .phase5-kanban__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .phase5-lane{border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02);min-height:220px;display:flex;flex-direction:column}
    .phase5-lane.phase5-lane--drag{box-shadow:0 0 0 1px rgba(124,249,255,.3) inset}
    .phase5-lane__head{padding:10px 10px 8px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid rgba(255,255,255,.06)}
    .phase5-lane__title{font-weight:600;font-size:13px;letter-spacing:.04em}
    .phase5-lane__count{font-size:11px;opacity:.8}
    .phase5-lane__body{padding:8px;display:flex;flex-direction:column;gap:8px;min-height:160px}
    .phase5-kcard{border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:8px;background:rgba(255,255,255,.02);cursor:grab}
    .phase5-kcard:active{cursor:grabbing}
    .phase5-kcard.is-done{opacity:.8}
    .phase5-kcard.phase5-kdrag{opacity:.45}
    .phase5-kcard__title{font-size:13px;line-height:1.25;margin-bottom:6px;word-break:break-word}
    .phase5-kcard__meta{display:flex;gap:6px;flex-wrap:wrap}
    .phase5-kcard__meta .badge{font-size:11px}
    .phase5-kcard__foot{margin-top:6px;display:flex;justify-content:space-between;align-items:center;gap:6px;font-size:11px;opacity:.85}
    .phase5-kempty{padding:10px;border:1px dashed rgba(255,255,255,.08);border-radius:10px;font-size:12px;opacity:.7;text-align:center}

    .phase5-recur-badge{border-color:rgba(146,255,176,.25)}
    .phase5-projectSettings .row.row--3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    @media (max-width: 980px){
      .phase5-kanban__grid{grid-template-columns:1fr}
      .phase5-projectSettings .row.row--3{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(st);
}

function phase5PatchFunctions_(){
  if(phase5State_.patched) return;
  phase5State_.patched = true;

  // Preserve new project settings when loading/importing JSON.
  const _sanitizeProject = sanitizeProject;
  sanitizeProject = function(p){
    const out = _sanitizeProject(p);
    out.settings = phase5SanitizeProjectSettings_(p?.settings || {
      owner: p?.owner,
      targetDate: p?.targetDate,
      risk: p?.risk,
      budget: p?.budget,
      client: p?.client,
      links: p?.links,
    });
    return out;
  };

  // Preserve Phase4 + Phase5 task meta when loading/importing JSON.
  const _sanitizeTask = sanitizeTask;
  sanitizeTask = function(t){
    const out = _sanitizeTask(t);
    // phase4 fields
    if(!Array.isArray(out.blockedBy)) out.blockedBy = [];
    out.blockedBy = Array.from(new Set((Array.isArray(t?.blockedBy) ? t.blockedBy : []).filter(x => typeof x === 'string' && x.trim())));
    out.blockerNote = typeof t?.blockerNote === 'string' ? String(t.blockerNote) : '';
    const dueN = Number(t?.dueAt || 0);
    out.dueAt = Number.isFinite(dueN) && dueN > 0 ? dueN : null;
    // phase5 fields
    out.kanbanStage = phase5NormalizeStage_(t?.kanbanStage, out.done);
    const rd = Number(t?.recurrenceDays || 0);
    out.recurrenceDays = Number.isFinite(rd) && rd > 0 ? Math.max(1, Math.round(rd)) : 0;
    out.recurrenceTemplate = String(t?.recurrenceTemplate || '');
    const rlg = Number(t?.lastRecurringGeneratedAt || 0);
    out.lastRecurringGeneratedAt = Number.isFinite(rlg) && rlg > 0 ? rlg : null;
    return out;
  };

  // Sync UI project settings into save path.
  const _saveProjectDetails = saveProjectDetails;
  saveProjectDetails = function(){
    const p = getActiveProject();
    if(p) phase5ApplyProjectSettingsFromUi_(p);
    return _saveProjectDetails();
  };

  // Render extra UI after core renders.
  const _renderProjects = renderProjects;
  renderProjects = function(){
    _renderProjects();
    phase5PostRenderProjects_();
  };

  const _renderChecklist = renderChecklist;
  renderChecklist = function(){
    _renderChecklist();
    phase5PostRenderChecklist_();
  };

  // Export enrichment for md/txt inline task meta.
  const _buildPmTaskMeta = buildPmTaskMeta_;
  buildPmTaskMeta_ = function(t){
    phase5NormalizeTaskMeta_(t);
    let base = String(_buildPmTaskMeta(t) || '').trim();
    let inner = '';
    if(base){
      const m = base.match(/^\{\s*pm\s+([\s\S]*?)\s*\}$/i);
      inner = m ? String(m[1] || '').trim() : '';
    }
    const parts = [];
    if(inner) parts.push(inner);
    if(t?.dueAt) parts.push('due=' + quotePmValue_(phase5FmtDateISO_(t.dueAt)));
    if(Array.isArray(t?.blockedBy) && t.blockedBy.length) parts.push('deps=' + String(t.blockedBy.length));
    if(t?.blockerNote && String(t.blockerNote).trim()) parts.push('blockernote=' + quotePmValue_(String(t.blockerNote).trim()));
    if(t?.kanbanStage && t.kanbanStage !== 'todo') parts.push('stage=' + t.kanbanStage);
    if(Number(t?.recurrenceDays || 0) > 0) parts.push('recur_days=' + String(Math.max(1, Math.round(Number(t.recurrenceDays)))));
    if(t?.recurrenceTemplate && String(t.recurrenceTemplate).trim()) parts.push('recur_tpl=' + quotePmValue_(String(t.recurrenceTemplate).trim()));
    return parts.length ? '{pm ' + parts.join(' ') + '}' : '';
  };

  // Import enrichment for md/txt round-trip.
  const _applyPmTaskMeta = applyPmTaskMeta_;
  applyPmTaskMeta_ = function(t, meta){
    _applyPmTaskMeta(t, meta);
    if(!meta || typeof meta !== 'object') return;
    if(meta.due !== undefined){
      const ts = phase5ParsePmDue_(meta.due);
      t.dueAt = ts || null;
    }
    if(meta.blockernote !== undefined) t.blockerNote = String(meta.blockernote || '');
    if(meta.stage && (meta.stage === 'todo' || meta.stage === 'doing' || meta.stage === 'done')){
      t.kanbanStage = phase5NormalizeStage_(meta.stage, t.done);
      if(meta.stage === 'done') t.done = true;
    }
    if(meta.recur_days !== undefined){
      const n = Number(meta.recur_days || 0);
      t.recurrenceDays = Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : 0;
    }
    if(meta.recur_tpl !== undefined){
      t.recurrenceTemplate = String(meta.recur_tpl || '');
    }
    phase5NormalizeTaskMeta_(t);
  };
}

function phase5PatchButtons_(){
  if(ui && ui.btnAddTask && !ui.btnAddTask.__phase5Patched){
    ui.btnAddTask.__phase5Patched = true;
    // Capture add-form recurring meta before core add handler runs.
    ui.btnAddTask.addEventListener('click', phase5CapturePendingAddMeta_, true);
    // Apply to newest task after core + phase4 handlers.
    ui.btnAddTask.addEventListener('click', phase5ApplyPendingAddMeta_);
  }
}

function phase5SanitizeProjectSettings_(s){
  const x = (s && typeof s === 'object') ? s : {};
  let risk = String(x.risk || '').toLowerCase();
  if(risk !== 'low' && risk !== 'medium' && risk !== 'high' && risk !== 'critical') risk = 'medium';
  return {
    owner: String(x.owner || ''),
    targetDate: String(x.targetDate || ''), // YYYY-MM-DD
    risk,
    budget: String(x.budget || ''),
    client: String(x.client || ''),
    links: String(x.links || ''),
  };
}

function phase5GetProjectSettings_(p){
  if(!p) return phase5SanitizeProjectSettings_({});
  if(!p.settings || typeof p.settings !== 'object') p.settings = phase5SanitizeProjectSettings_(p.settings);
  return p.settings;
}

function phase5EnsureProjectSettingsUi_(){
  const card = document.querySelector('#btnSaveProject')?.closest('.card');
  const form = card?.querySelector('.form');
  if(!card || !form) return;

  if(!document.querySelector('#phase5ProjectSettings')){
    const box = document.createElement('div');
    box.id = 'phase5ProjectSettings';
    box.className = 'phase5-projectSettings';
    box.innerHTML = `
      <div class="phase5-projectSettings__title">Project Settings</div>
      <div class="row row--2">
        <label class="field">
          <span class="field__label">Owner</span>
          <input class="input" id="phase5ProjectOwner" placeholder="e.g., ZhiQi / Team Lead" />
        </label>
        <label class="field">
          <span class="field__label">Target Date</span>
          <input class="input" id="phase5ProjectTargetDate" type="date" />
        </label>
      </div>
      <div class="row row--3">
        <label class="field">
          <span class="field__label">Risk</span>
          <select class="select" id="phase5ProjectRisk">
            <option value="low">Low</option>
            <option value="medium" selected>Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
        </label>
        <label class="field">
          <span class="field__label">Budget</span>
          <input class="input" id="phase5ProjectBudget" placeholder="e.g., RM 15,000" />
        </label>
        <label class="field">
          <span class="field__label">Client / Stakeholder</span>
          <input class="input" id="phase5ProjectClient" placeholder="e.g., Internal / Boss / Company" />
        </label>
      </div>
      <label class="field">
        <span class="field__label">Links (comma-separated)</span>
        <input class="input" id="phase5ProjectLinks" placeholder="Repo, docs, design, deployment URLs" />
      </label>
      <div class="phase5-projectMetaPills" id="phase5ProjectSettingsPreview"></div>
    `;
    form.appendChild(box);

    ['#phase5ProjectOwner','#phase5ProjectTargetDate','#phase5ProjectRisk','#phase5ProjectBudget','#phase5ProjectClient','#phase5ProjectLinks']
      .map(sel => document.querySelector(sel))
      .filter(Boolean)
      .forEach(el => {
        el.addEventListener('input', () => { pulseDirty(); phase5RenderProjectSettingsPreview_(); });
        el.addEventListener('change', () => { pulseDirty(); phase5RenderProjectSettingsPreview_(); });
      });
  }
}

function phase5PostRenderProjects_(){
  phase5EnsureProjectSettingsUi_();
  const p = getActiveProject();
  const s = phase5GetProjectSettings_(p);

  const ownerEl = document.querySelector('#phase5ProjectOwner');
  const dateEl = document.querySelector('#phase5ProjectTargetDate');
  const riskEl = document.querySelector('#phase5ProjectRisk');
  const budgetEl = document.querySelector('#phase5ProjectBudget');
  const clientEl = document.querySelector('#phase5ProjectClient');
  const linksEl = document.querySelector('#phase5ProjectLinks');

  if(ownerEl) ownerEl.value = p ? String(s.owner || '') : '';
  if(dateEl) dateEl.value = p ? String(s.targetDate || '') : '';
  if(riskEl) riskEl.value = p ? String(s.risk || 'medium') : 'medium';
  if(budgetEl) budgetEl.value = p ? String(s.budget || '') : '';
  if(clientEl) clientEl.value = p ? String(s.client || '') : '';
  if(linksEl) linksEl.value = p ? String(s.links || '') : '';

  if(ownerEl) ownerEl.disabled = !p;
  if(dateEl) dateEl.disabled = !p;
  if(riskEl) riskEl.disabled = !p;
  if(budgetEl) budgetEl.disabled = !p;
  if(clientEl) clientEl.disabled = !p;
  if(linksEl) linksEl.disabled = !p;

  phase5RenderProjectSettingsPreview_(p);

  // Add quick summary badges on active project card in dashboard (optional, non-invasive)
  const dashMeta = document.querySelector('#dashProjectMeta');
  if(dashMeta && p){
    dashMeta.title = [
      s.owner ? ('Owner: ' + s.owner) : '',
      s.targetDate ? ('Target: ' + s.targetDate) : '',
      s.risk ? ('Risk: ' + s.risk.toUpperCase()) : '',
    ].filter(Boolean).join(' • ');
  }
}

function phase5ApplyProjectSettingsFromUi_(p){
  if(!p) return;
  p.settings = phase5SanitizeProjectSettings_({
    owner: document.querySelector('#phase5ProjectOwner')?.value || '',
    targetDate: document.querySelector('#phase5ProjectTargetDate')?.value || '',
    risk: document.querySelector('#phase5ProjectRisk')?.value || 'medium',
    budget: document.querySelector('#phase5ProjectBudget')?.value || '',
    client: document.querySelector('#phase5ProjectClient')?.value || '',
    links: document.querySelector('#phase5ProjectLinks')?.value || '',
  });
}

function phase5RenderProjectSettingsPreview_(pArg){
  const p = pArg || getActiveProject();
  const box = document.querySelector('#phase5ProjectSettingsPreview');
  if(!box) return;
  if(!p){ box.innerHTML = ''; return; }
  const s = phase5GetProjectSettings_(p);
  const chips = [];
  if(s.owner) chips.push(`<span class="badge">OWNER ${escapeHtml(s.owner)}</span>`);
  if(s.targetDate) chips.push(`<span class="badge">TARGET ${escapeHtml(s.targetDate)}</span>`);
  if(s.risk) chips.push(`<span class="badge ${s.risk === 'high' || s.risk === 'critical' ? 'badge--warn' : ''}">RISK ${escapeHtml(String(s.risk).toUpperCase())}</span>`);
  if(s.budget) chips.push(`<span class="badge">BUDGET ${escapeHtml(s.budget)}</span>`);
  if(s.client) chips.push(`<span class="badge">CLIENT ${escapeHtml(s.client)}</span>`);
  box.innerHTML = chips.join('');
}

function phase5NormalizeStage_(stage, done){
  let s = String(stage || '').toLowerCase();
  if(s !== 'todo' && s !== 'doing' && s !== 'done') s = done ? 'done' : 'todo';
  if(done) return 'done';
  if(!done && s === 'done') return 'todo';
  return s;
}

function phase5NormalizeTaskMeta_(t){
  if(!t || typeof t !== 'object') return;
  if(typeof phase4NormalizeTaskMeta_ === 'function'){
    try{ phase4NormalizeTaskMeta_(t); }catch{ /* ignore */ }
  }
  t.kanbanStage = phase5NormalizeStage_(t.kanbanStage, !!t.done);
  const rd = Number(t.recurrenceDays || 0);
  t.recurrenceDays = Number.isFinite(rd) && rd > 0 ? Math.max(1, Math.round(rd)) : 0;
  if(typeof t.recurrenceTemplate !== 'string') t.recurrenceTemplate = '';
  if(t.lastRecurringGeneratedAt != null){
    const n = Number(t.lastRecurringGeneratedAt || 0);
    t.lastRecurringGeneratedAt = Number.isFinite(n) && n > 0 ? n : null;
  }else{
    t.lastRecurringGeneratedAt = null;
  }
  if(t.done) t.kanbanStage = 'done';
  else if(t.kanbanStage === 'done') t.kanbanStage = 'todo';
}

function phase5GetChecklistContext_(){
  if(typeof phase3GetChecklistContext_ === 'function') return phase3GetChecklistContext_();
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  return { p, m };
}

function phase5EnsureChecklistUi_(){
  const tasksCard = document.querySelector('#taskList')?.closest('.card');
  const taskList = document.querySelector('#taskList');
  if(tasksCard && taskList && !document.querySelector('#phase5ChecklistToolbar')){
    const tb = document.createElement('div');
    tb.id = 'phase5ChecklistToolbar';
    tb.className = 'phase5-toolbar';
    tb.innerHTML = `
      <div class="phase5-segment">
        <button class="btn btn--ghost" type="button" id="phase5BtnViewList">List</button>
        <button class="btn btn--ghost" type="button" id="phase5BtnViewKanban">Kanban</button>
      </div>
      <span class="phase5-muted" id="phase5DnDHint">Drag tasks to reorder (List) or move across columns (Kanban).</span>
      <span class="phase5-spacer"></span>
      <span class="phase5-muted" id="phase5ViewStats"></span>
    `;
    taskList.parentElement.insertBefore(tb, taskList);

    const kanban = document.createElement('div');
    kanban.id = 'phase5KanbanWrap';
    kanban.className = 'phase5-kanban';
    kanban.innerHTML = `<div class="phase5-kanban__grid" id="phase5KanbanGrid"></div>`;
    taskList.parentElement.insertBefore(kanban, taskList.nextSibling);

    document.querySelector('#phase5BtnViewList')?.addEventListener('click', () => {
      phase5State_.checklistView = 'list';
      phase5SaveUiState_();
      phase5SyncChecklistViewUi_();
    });
    document.querySelector('#phase5BtnViewKanban')?.addEventListener('click', () => {
      phase5State_.checklistView = 'kanban';
      phase5SaveUiState_();
      phase5SyncChecklistViewUi_();
      phase5RenderKanban_();
    });
  }

  const addCard = document.querySelector('#btnAddTask')?.closest('.card');
  if(addCard && !document.querySelector('#phase5RecurringBox')){
    const divider = document.createElement('div');
    divider.className = 'divider';
    const box = document.createElement('div');
    box.id = 'phase5RecurringBox';
    box.className = 'phase5-recurringBox';
    box.innerHTML = `
      <div class="card__label" style="margin-bottom:8px">Recurring Task Templates</div>
      <div class="row row--2">
        <label class="field">
          <span class="field__label">Template</span>
          <select class="select" id="phase5TemplateSelect"><option value="">— Select template —</option></select>
        </label>
        <div class="row row--actions" style="align-items:end;gap:8px">
          <button class="btn btn--ghost" type="button" id="phase5BtnApplyTemplate">Apply</button>
          <button class="btn btn--ghost" type="button" id="phase5BtnSaveTemplate">Save as Template</button>
          <button class="btn btn--ghost" type="button" id="phase5BtnDeleteTemplate">Delete</button>
        </div>
      </div>
      <div class="row row--2">
        <label class="field">
          <span class="field__label">Due Offset (days)</span>
          <input class="input" id="phase5TaskDueOffset" type="number" min="0" step="1" placeholder="0" />
        </label>
        <label class="field">
          <span class="field__label">Repeat Every (days)</span>
          <input class="input" id="phase5TaskRepeatDays" type="number" min="0" step="1" placeholder="0 = one-time" />
        </label>
      </div>
      <div class="phase5-recurringHint">Tip: set repeat days before clicking <b>Add</b> to create a recurring task directly.</div>
    `;
    // place before the existing final hint block if possible
    const hint = addCard.querySelector('.hint');
    if(hint){
      addCard.insertBefore(divider, hint);
      addCard.insertBefore(box, hint);
    }else{
      addCard.appendChild(divider);
      addCard.appendChild(box);
    }

    document.querySelector('#phase5BtnSaveTemplate')?.addEventListener('click', phase5SaveTemplateFromForm_);
    document.querySelector('#phase5BtnApplyTemplate')?.addEventListener('click', phase5ApplySelectedTemplate_);
    document.querySelector('#phase5BtnDeleteTemplate')?.addEventListener('click', phase5DeleteSelectedTemplate_);
    document.querySelector('#phase5TemplateSelect')?.addEventListener('change', phase5LoadTemplateIntoForm_);
  }

  phase5RefreshTemplateSelect_();
  phase5SyncChecklistViewUi_();
}

function phase5PostRenderChecklist_(){
  phase5EnsureChecklistUi_();

  const ctx = phase5GetChecklistContext_();
  const p = ctx && ctx.p;
  const m = ctx && ctx.m;
  const taskList = document.querySelector('#taskList');
  if(!taskList){ return; }

  // Normalize tasks (also keeps stage/done sync)
  if(m && Array.isArray(m.tasks)){
    for(const t of m.tasks) phase5NormalizeTaskMeta_(t);
  }

  phase5AttachChecklistDnD_(taskList, m);
  phase5InjectTaskRowExtras_(m);
  phase5SyncChecklistViewUi_();
  if(phase5State_.checklistView === 'kanban') phase5RenderKanban_();

  const statsEl = document.querySelector('#phase5ViewStats');
  if(statsEl){
    const total = Array.isArray(m?.tasks) ? m.tasks.length : 0;
    const visible = Array.from(taskList.querySelectorAll('.task')).filter(el => !el.classList.contains('phase3-hidden')).length;
    statsEl.textContent = p && m ? `${visible}/${total} visible • ${phase5State_.checklistView.toUpperCase()}` : '';
  }
}

function phase5SyncChecklistViewUi_(){
  const listBtn = document.querySelector('#phase5BtnViewList');
  const kanBtn = document.querySelector('#phase5BtnViewKanban');
  const taskList = document.querySelector('#taskList');
  const kan = document.querySelector('#phase5KanbanWrap');
  if(listBtn) listBtn.classList.toggle('is-active', phase5State_.checklistView === 'list');
  if(kanBtn) kanBtn.classList.toggle('is-active', phase5State_.checklistView === 'kanban');
  if(taskList) taskList.style.display = (phase5State_.checklistView === 'list') ? '' : 'none';
  if(kan) kan.classList.toggle('is-open', phase5State_.checklistView === 'kanban');
}

function phase5AttachChecklistDnD_(taskList, m){
  if(!taskList) return;
  if(taskList.__phase5DndBound) return;
  taskList.__phase5DndBound = true;

  taskList.addEventListener('dragover', (e) => {
    const active = taskList.querySelector('.task.phase5-dragging');
    if(!active) return;
    e.preventDefault();
    const target = e.target && e.target.closest ? e.target.closest('.task') : null;
    phase5ClearListDropMarkers_(taskList);
    if(target && target !== active){
      const r = target.getBoundingClientRect();
      const after = e.clientY > (r.top + r.height / 2);
      target.classList.add(after ? 'phase5-drop-after' : 'phase5-drop-before');
    }
  });

  taskList.addEventListener('drop', (e) => {
    const ctx = phase5GetChecklistContext_();
    const ms = ctx && ctx.m;
    if(!ms || !Array.isArray(ms.tasks)) return;
    const fromId = phase5State_.dragTaskId;
    if(!fromId) return;
    e.preventDefault();

    // Disable reorder when any task is hidden (filtering active) to avoid confusing index outcomes.
    const hasHidden = Array.from(taskList.querySelectorAll('.task')).some(el => el.classList.contains('phase3-hidden'));
    if(hasHidden){
      phase5ClearListDropMarkers_(taskList);
      alert('Turn off checklist filters before drag reordering in List view.');
      return;
    }

    const target = e.target && e.target.closest ? e.target.closest('.task') : null;
    const fromIdx = ms.tasks.findIndex(t => t && t.id === fromId);
    if(fromIdx < 0){ phase5ClearListDropMarkers_(taskList); return; }

    let toIdx = ms.tasks.length - 1;
    let insertAfter = true;
    if(target){
      const tid = target.dataset.taskId;
      const idx = ms.tasks.findIndex(t => t && t.id === tid);
      if(idx >= 0){
        toIdx = idx;
        const r = target.getBoundingClientRect();
        insertAfter = e.clientY > (r.top + r.height / 2);
      }
    }

    if(!target){
      toIdx = ms.tasks.length - 1;
      insertAfter = true;
    }

    let insertIdx = Math.max(0, Math.min(ms.tasks.length, toIdx + (insertAfter ? 1 : 0)));
    const [moved] = ms.tasks.splice(fromIdx, 1);
    if(!moved){ phase5ClearListDropMarkers_(taskList); return; }
    if(fromIdx < insertIdx) insertIdx -= 1;
    insertIdx = Math.max(0, Math.min(ms.tasks.length, insertIdx));
    ms.tasks.splice(insertIdx, 0, moved);

    phase5ClearListDropMarkers_(taskList);
    addActivity(`Reordered task: ${moved.title}`);
    saveState();
    renderAll();
  });

  taskList.addEventListener('dragend', () => {
    phase5State_.dragTaskId = null;
    phase5ClearListDropMarkers_(taskList);
    Array.from(taskList.querySelectorAll('.task.phase5-dragging')).forEach(el => el.classList.remove('phase5-dragging'));
  });
}

function phase5InjectTaskRowExtras_(m){
  const taskList = document.querySelector('#taskList');
  if(!taskList || !m || !Array.isArray(m.tasks)) return;
  const cards = Array.from(taskList.querySelectorAll('.task'));
  cards.forEach((el) => {
    const tid = el.dataset.taskId;
    const t = m.tasks.find(x => x.id === tid);
    if(!t) return;
    phase5NormalizeTaskMeta_(t);

    // Drag handle
    const actions = el.querySelector('.task__actions');
    if(actions && !actions.querySelector('[data-act="phase5Grip"]')){
      const grip = document.createElement('button');
      grip.type = 'button';
      grip.className = 'iconbtn phase5-taskGrip';
      grip.dataset.act = 'phase5Grip';
      grip.title = 'Drag to reorder task';
      grip.textContent = '⋮⋮';
      grip.draggable = true;
      grip.addEventListener('dragstart', (e) => {
        if(phase5State_.checklistView !== 'list'){ e.preventDefault(); return; }
        phase5State_.dragTaskId = t.id;
        el.classList.add('phase5-dragging');
        try{
          e.dataTransfer.effectAllowed = 'move';
          e.dataTransfer.setData('text/plain', t.id);
        }catch{ /* ignore */ }
      });
      grip.addEventListener('dragend', () => {
        el.classList.remove('phase5-dragging');
      });
      actions.insertBefore(grip, actions.firstChild || null);
    }

    // Recurring badge + generate-next action
    const meta = el.querySelector('.task__meta');
    if(meta){
      Array.from(meta.querySelectorAll('.phase5-recur-badge')).forEach(n => n.remove());
      if(t.recurrenceDays > 0){
        const b = document.createElement('span');
        b.className = 'badge phase5-recur-badge';
        b.textContent = `R/${t.recurrenceDays}d`;
        b.title = t.recurrenceTemplate ? `Recurring template: ${t.recurrenceTemplate}` : `Repeats every ${t.recurrenceDays} day(s)`;
        meta.appendChild(b);
      }
    }

    if(actions){
      if(t.recurrenceDays > 0 && !actions.querySelector('[data-act="phase5NextRecurring"]')){
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'iconbtn';
        btn.dataset.act = 'phase5NextRecurring';
        btn.title = 'Generate next recurring task';
        btn.textContent = '⟳';
        btn.addEventListener('click', () => phase5GenerateNextRecurringTask_(m, t));
        actions.insertBefore(btn, actions.firstChild || null);
      }
      if(t.recurrenceDays <= 0){
        const stale = actions.querySelector('[data-act="phase5NextRecurring"]');
        if(stale) stale.remove();
      }
    }
  });
}

function phase5ClearListDropMarkers_(taskList){
  if(!taskList) return;
  Array.from(taskList.querySelectorAll('.task.phase5-drop-before,.task.phase5-drop-after')).forEach(el => {
    el.classList.remove('phase5-drop-before', 'phase5-drop-after');
  });
}

function phase5RenderKanban_(){
  const grid = document.querySelector('#phase5KanbanGrid');
  const wrap = document.querySelector('#phase5KanbanWrap');
  if(!grid || !wrap) return;

  const ctx = phase5GetChecklistContext_();
  const p = ctx && ctx.p;
  const m = ctx && ctx.m;
  if(!p || !m){
    grid.innerHTML = '';
    return;
  }

  const tasks = Array.isArray(m.tasks) ? m.tasks : [];
  const filtered = tasks.filter(t => {
    try{
      return (typeof phase3TaskMatchesFilter_ === 'function') ? phase3TaskMatchesFilter_(t) : true;
    }catch{ return true; }
  });
  filtered.forEach(phase5NormalizeTaskMeta_);

  const lanes = {
    todo: filtered.filter(t => t.kanbanStage === 'todo'),
    doing: filtered.filter(t => t.kanbanStage === 'doing'),
    done: filtered.filter(t => t.kanbanStage === 'done' || t.done),
  };

  const defs = [
    ['todo','TO DO'],
    ['doing','DOING'],
    ['done','DONE'],
  ];

  grid.innerHTML = defs.map(([key, label]) => {
    const items = lanes[key] || [];
    const body = items.map(t => phase5RenderKanbanCardHtml_(t)).join('') || `<div class="phase5-kempty">Drop tasks here</div>`;
    return `
      <div class="phase5-lane" data-stage="${key}">
        <div class="phase5-lane__head">
          <div class="phase5-lane__title">${label}</div>
          <div class="phase5-lane__count">${items.length}</div>
        </div>
        <div class="phase5-lane__body">${body}</div>
      </div>
    `;
  }).join('');

  // Bind lane events
  Array.from(grid.querySelectorAll('.phase5-lane')).forEach(lane => {
    lane.addEventListener('dragenter', (e) => {
      e.preventDefault();
      lane.classList.add('phase5-lane--drag');
    });
    lane.addEventListener('dragover', (e) => {
      e.preventDefault();
      lane.classList.add('phase5-lane--drag');
    });
    lane.addEventListener('dragleave', (e) => {
      if(lane.contains(e.relatedTarget)) return;
      lane.classList.remove('phase5-lane--drag');
    });
    lane.addEventListener('drop', (e) => {
      e.preventDefault();
      lane.classList.remove('phase5-lane--drag');
      const stage = String(lane.dataset.stage || 'todo');
      phase5HandleKanbanDrop_(m, stage, e);
    });
  });

  // Bind card drag + quick actions
  Array.from(grid.querySelectorAll('.phase5-kcard')).forEach(card => {
    const tid = card.dataset.taskId;
    const t = tasks.find(x => x.id === tid);
    if(!t) return;

    card.draggable = true;
    card.addEventListener('dragstart', (e) => {
      phase5State_.kanbanDragTaskId = t.id;
      card.classList.add('phase5-kdrag');
      try{
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', t.id);
      }catch{ /* ignore */ }
    });
    card.addEventListener('dragend', () => {
      phase5State_.kanbanDragTaskId = null;
      card.classList.remove('phase5-kdrag');
      Array.from(grid.querySelectorAll('.phase5-lane--drag')).forEach(el => el.classList.remove('phase5-lane--drag'));
    });

    const editBtn = card.querySelector('[data-act="phase5OpenInList"]');
    if(editBtn){
      editBtn.addEventListener('click', () => {
        phase5State_.checklistView = 'list';
        phase5SaveUiState_();
        phase5SyncChecklistViewUi_();
        const row = document.querySelector(`#taskList .task[data-task-id="${CSS.escape(t.id)}"]`);
        if(row) row.scrollIntoView({ behavior:'smooth', block:'center' });
      });
    }

    const recurBtn = card.querySelector('[data-act="phase5KNextRecurring"]');
    if(recurBtn){
      recurBtn.addEventListener('click', () => phase5GenerateNextRecurringTask_(m, t));
    }
  });
}

function phase5RenderKanbanCardHtml_(t){
  phase5NormalizeTaskMeta_(t);
  const dueText = t.dueAt ? phase5FmtDateISO_(t.dueAt) : '';
  const dueBucket = (typeof phase4DueBucket_ === 'function' && t.dueAt) ? phase4DueBucket_(t.dueAt) : '';
  const dueWarn = (dueBucket === 'overdue' || dueBucket === 'today') ? ' badge--warn' : '';
  return `
    <div class="phase5-kcard ${t.done ? 'is-done' : ''}" data-task-id="${escapeHtml(t.id)}">
      <div class="phase5-kcard__title">${escapeHtml(t.title || '')}</div>
      <div class="phase5-kcard__meta">
        <span class="badge ${t.severity !== 'normal' ? 'badge--warn' : ''}">${escapeHtml(String(t.severity || 'normal').toUpperCase())}</span>
        ${t.assignee ? `<span class="badge">${escapeHtml(t.assignee)}</span>` : ''}
        ${dueText ? `<span class="badge${dueWarn}">DUE ${escapeHtml(dueText)}</span>` : ''}
        ${Array.isArray(t.blockedBy) && t.blockedBy.length ? `<span class="badge">DEPS ${t.blockedBy.length}</span>` : ''}
        ${Number(t.recurrenceDays||0) > 0 ? `<span class="badge phase5-recur-badge">R/${t.recurrenceDays}d</span>` : ''}
      </div>
      <div class="phase5-kcard__foot">
        <button class="iconbtn" type="button" data-act="phase5OpenInList" title="Open in List">↩</button>
        ${Number(t.recurrenceDays||0) > 0 ? `<button class="iconbtn" type="button" data-act="phase5KNextRecurring" title="Generate next recurring">⟳</button>` : '<span></span>'}
      </div>
    </div>
  `;
}

function phase5HandleKanbanDrop_(m, stage, ev){
  if(!m || !Array.isArray(m.tasks)) return;
  const fromId = phase5State_.kanbanDragTaskId || (() => { try{ return ev.dataTransfer.getData('text/plain'); }catch{ return ''; } })();
  if(!fromId) return;
  const t = m.tasks.find(x => x.id === fromId);
  if(!t) return;
  phase5NormalizeTaskMeta_(t);

  const prevStage = t.kanbanStage;
  const nextStage = (stage === 'doing' || stage === 'done') ? stage : 'todo';
  t.kanbanStage = nextStage;
  t.done = nextStage === 'done';

  // Optional reorder inside array: move near target card if dropped over a card.
  const targetCard = ev.target && ev.target.closest ? ev.target.closest('.phase5-kcard') : null;
  if(targetCard){
    const targetId = targetCard.dataset.taskId;
    if(targetId && targetId !== t.id){
      const fromIdx = m.tasks.findIndex(x => x.id === t.id);
      const toIdx = m.tasks.findIndex(x => x.id === targetId);
      if(fromIdx >= 0 && toIdx >= 0){
        const [moved] = m.tasks.splice(fromIdx, 1);
        let insert = toIdx;
        if(fromIdx < insert) insert -= 1;
        m.tasks.splice(Math.max(0, insert), 0, moved);
      }
    }
  } else {
    // Append to end of same milestone for lane drop (keeps board grouping less jumpy)
    const idx = m.tasks.findIndex(x => x.id === t.id);
    if(idx >= 0){
      const [moved] = m.tasks.splice(idx, 1);
      m.tasks.push(moved);
    }
  }

  if(prevStage !== nextStage){
    addActivity(`Kanban move: ${t.title} → ${String(nextStage).toUpperCase()}`);
    saveState();
    renderAll();
  }else{
    saveState();
    renderAll();
  }
}

function phase5GetTemplates_(){
  try{
    const arr = JSON.parse(localStorage.getItem(PHASE5_REC_TPL_KEY) || '[]');
    if(!Array.isArray(arr)) return [];
    return arr.filter(x => x && typeof x === 'object').map(phase5SanitizeTemplate_);
  }catch{ return []; }
}

function phase5SaveTemplates_(arr){
  try{ localStorage.setItem(PHASE5_REC_TPL_KEY, JSON.stringify((arr || []).map(phase5SanitizeTemplate_))); }catch{ /* ignore */ }
}

function phase5SanitizeTemplate_(t){
  const dueOffsetDays = Number(t?.dueOffsetDays || 0);
  const recurrenceDays = Number(t?.recurrenceDays || 0);
  return {
    id: String(t?.id || uid()),
    name: String(t?.name || 'Template').trim() || 'Template',
    title: String(t?.title || '').trim(),
    severity: (t?.severity === 'high' || t?.severity === 'blocker') ? t.severity : 'normal',
    assignee: String(t?.assignee || ''),
    dueOffsetDays: Number.isFinite(dueOffsetDays) && dueOffsetDays >= 0 ? Math.round(dueOffsetDays) : 0,
    recurrenceDays: Number.isFinite(recurrenceDays) && recurrenceDays > 0 ? Math.max(1, Math.round(recurrenceDays)) : 0,
    createdAt: Number(t?.createdAt || Date.now()),
    updatedAt: Date.now(),
  };
}

function phase5RefreshTemplateSelect_(){
  const sel = document.querySelector('#phase5TemplateSelect');
  if(!sel) return;
  const prev = sel.value;
  const templates = phase5GetTemplates_().sort((a,b) => a.name.localeCompare(b.name));
  sel.innerHTML = `<option value="">— Select template —</option>` + templates.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}${t.recurrenceDays ? ` • R/${t.recurrenceDays}d` : ''}</option>`).join('');
  if(templates.some(t => t.id === prev)) sel.value = prev;
}

function phase5CurrentTaskFormMeta_(){
  const dueOffset = Number(document.querySelector('#phase5TaskDueOffset')?.value || 0);
  const repeat = Number(document.querySelector('#phase5TaskRepeatDays')?.value || 0);
  return {
    dueOffsetDays: Number.isFinite(dueOffset) && dueOffset >= 0 ? Math.round(dueOffset) : 0,
    recurrenceDays: Number.isFinite(repeat) && repeat > 0 ? Math.max(1, Math.round(repeat)) : 0,
  };
}

function phase5CapturePendingAddMeta_(){
  phase5State_.pendingAddMeta = phase5CurrentTaskFormMeta_();
}

function phase5ApplyPendingAddMeta_(){
  const meta = phase5State_.pendingAddMeta;
  phase5State_.pendingAddMeta = null;
  if(!meta) return;
  if(!(meta.dueOffsetDays > 0 || meta.recurrenceDays > 0)) return;

  const ctx = phase5GetChecklistContext_();
  const m = ctx && ctx.m;
  if(!m || !Array.isArray(m.tasks) || !m.tasks.length) return;
  const t = m.tasks[0]; // core add inserts unshift
  if(!t) return;

  phase5NormalizeTaskMeta_(t);
  if(meta.recurrenceDays > 0){
    t.recurrenceDays = meta.recurrenceDays;
    if(!t.recurrenceTemplate) t.recurrenceTemplate = '';
  }
  if(meta.dueOffsetDays > 0 && !t.dueAt){
    t.dueAt = phase5DatePlusDays_(Date.now(), meta.dueOffsetDays);
  }

  addActivity(`Task scheduling meta applied: ${t.title}${meta.recurrenceDays ? ` • every ${meta.recurrenceDays}d` : ''}${meta.dueOffsetDays ? ` • due +${meta.dueOffsetDays}d` : ''}`);
  saveState();
  renderAll();
}

async function phase5SaveTemplateFromForm_(){
  const title = String(ui?.taskText?.value || '').trim();
  if(!title){
    alert('Enter a task title first (in Add Task) before saving as a template.');
    ui?.taskText?.focus?.();
    return;
  }

  const ask = await pmPromptDialog_('Template name?', title, { title:'Save Recurring Template', placeholder:'Template name' });
  if(ask == null) return;
  const name = String(ask || '').trim();
  if(!name) return;

  const meta = phase5CurrentTaskFormMeta_();
  const tpl = phase5SanitizeTemplate_({
    id: uid(),
    name,
    title,
    severity: ui?.taskSeverity?.value || 'normal',
    assignee: String(ui?.taskAssignee?.value || '').trim(),
    dueOffsetDays: meta.dueOffsetDays,
    recurrenceDays: meta.recurrenceDays,
    createdAt: Date.now(),
  });

  const arr = phase5GetTemplates_();
  const idx = arr.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
  if(idx >= 0){
    const ok = await pmConfirmDialog_(`Template "${name}" already exists. Replace it?`, { title:'Replace Template', okText:'Replace', danger:true });
    if(!ok) return;
    tpl.id = arr[idx].id;
    arr[idx] = tpl;
  }else{
    arr.push(tpl);
  }

  phase5SaveTemplates_(arr);
  phase5RefreshTemplateSelect_();
  const sel = document.querySelector('#phase5TemplateSelect');
  if(sel) sel.value = tpl.id;
  addActivity(`Saved recurring template: ${tpl.name}`);
}

function phase5LoadTemplateIntoForm_(){
  const sel = document.querySelector('#phase5TemplateSelect');
  const id = String(sel?.value || '');
  if(!id) return;
  const tpl = phase5GetTemplates_().find(x => x.id === id);
  if(!tpl) return;
  if(ui?.taskText) ui.taskText.value = tpl.title || '';
  if(ui?.taskSeverity) ui.taskSeverity.value = tpl.severity || 'normal';
  if(ui?.taskAssignee) ui.taskAssignee.value = tpl.assignee || '';
  const dueEl = document.querySelector('#phase5TaskDueOffset');
  const repEl = document.querySelector('#phase5TaskRepeatDays');
  if(dueEl) dueEl.value = String(tpl.dueOffsetDays || 0);
  if(repEl) repEl.value = String(tpl.recurrenceDays || 0);
  pulseDirty();
}

async function phase5DeleteSelectedTemplate_(){
  const sel = document.querySelector('#phase5TemplateSelect');
  const id = String(sel?.value || '');
  if(!id) return;
  const arr = phase5GetTemplates_();
  const tpl = arr.find(x => x.id === id);
  if(!tpl) return;
  const ok = await pmConfirmDialog_(`Delete template "${tpl.name}"?`, { title:'Delete Recurring Template', okText:'Delete', danger:true });
  if(!ok) return;
  phase5SaveTemplates_(arr.filter(x => x.id !== id));
  phase5RefreshTemplateSelect_();
  addActivity(`Deleted recurring template: ${tpl.name}`);
}

function phase5ApplySelectedTemplate_(){
  const sel = document.querySelector('#phase5TemplateSelect');
  const id = String(sel?.value || '');
  if(!id){
    alert('Select a template first.');
    return;
  }
  const tpl = phase5GetTemplates_().find(x => x.id === id);
  if(!tpl){
    alert('Template not found.');
    return;
  }

  const ctx = phase5GetChecklistContext_();
  const p = ctx && ctx.p;
  const m = ctx && ctx.m;
  if(!p){ alert('Create/select a project first.'); return; }
  if(!m){ alert('Create/select a milestone first.'); return; }

  /** @type {Task} */
  const t = {
    id: uid(),
    title: tpl.title || tpl.name,
    done: false,
    severity: tpl.severity || 'normal',
    assignee: tpl.assignee || '',
    createdAt: Date.now(),
    steps: [],
  };
  phase5NormalizeTaskMeta_(t);
  if(tpl.dueOffsetDays > 0) t.dueAt = phase5DatePlusDays_(Date.now(), tpl.dueOffsetDays);
  if(tpl.recurrenceDays > 0) t.recurrenceDays = tpl.recurrenceDays;
  t.recurrenceTemplate = tpl.name;

  m.tasks.unshift(t);
  addActivity(`Applied template: ${tpl.name} → ${t.title}`);
  saveState();
  renderAll();

  if(ui?.taskText) ui.taskText.value = t.title;
}

function phase5GenerateNextRecurringTask_(m, sourceTask){
  if(!m || !sourceTask) return;
  phase5NormalizeTaskMeta_(sourceTask);
  const every = Number(sourceTask.recurrenceDays || 0);
  if(!(every > 0)) return;

  const now = Date.now();
  // simple duplicate guard to avoid accidental double-click spam
  if(sourceTask.lastRecurringGeneratedAt && (now - Number(sourceTask.lastRecurringGeneratedAt || 0)) < 1200){
    return;
  }

  const baseDue = Number(sourceTask.dueAt || 0) > 0 ? Number(sourceTask.dueAt) : now;
  const nextDue = phase5DatePlusDays_(baseDue, every);

  const next = {
    id: uid(),
    title: String(sourceTask.title || 'Recurring Task'),
    done: false,
    severity: sourceTask.severity || 'normal',
    assignee: sourceTask.assignee || '',
    createdAt: now,
    steps: phase5CloneStepsResetDone_(sourceTask.steps || []),
    blockedBy: [],
    blockerNote: '',
    dueAt: nextDue,
    kanbanStage: 'todo',
    recurrenceDays: every,
    recurrenceTemplate: String(sourceTask.recurrenceTemplate || ''),
    lastRecurringGeneratedAt: null,
  };
  phase5NormalizeTaskMeta_(next);

  // insert right after source when possible
  const idx = m.tasks.findIndex(x => x.id === sourceTask.id);
  if(idx >= 0) m.tasks.splice(idx + 1, 0, next);
  else m.tasks.unshift(next);

  sourceTask.lastRecurringGeneratedAt = now;
  addActivity(`Generated next recurring task: ${next.title} (every ${every}d)`);
  saveState();
  renderAll();
}

function phase5CloneStepsResetDone_(steps){
  if(!Array.isArray(steps)) return [];
  return steps.map(s => ({
    id: uid(),
    text: String(s?.text || ''),
    done: false,
    children: phase5CloneStepsResetDone_(Array.isArray(s?.children) ? s.children : []),
  }));
}

function phase5DatePlusDays_(baseTs, days){
  const d = new Date(Number(baseTs || Date.now()));
  d.setHours(12,0,0,0);
  d.setDate(d.getDate() + Math.max(0, Math.round(Number(days || 0))));
  return d.getTime();
}

function phase5FmtDateISO_(ts){
  const d = new Date(Number(ts || 0));
  if(!Number.isFinite(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}

function phase5ParsePmDue_(raw){
  const s = String(raw || '').trim();
  if(!s) return 0;
  if(/^\d{4}-\d{2}-\d{2}$/.test(s)){
    const [y,m,d] = s.split('-').map(Number);
    const dt = new Date(y, (m||1)-1, d||1, 12, 0, 0, 0);
    return Number.isFinite(dt.getTime()) ? dt.getTime() : 0;
  }
  const n = Number(s);
  if(Number.isFinite(n) && n > 0) return n;
  const parsed = Date.parse(s);
  return Number.isFinite(parsed) ? parsed : 0;
}

// boot phase 5 after phase 4 patch is loaded
try{ initPhase5_(); }catch(err){ console.warn('Phase5 init failed', err); }

/* ---------------------------
   Phase 6 Upgrade (Additive Patch)
   - Dependency Graph View + Cycle Repair (active milestone)
   - Critical Path / Risk Summary (active milestone)
   - Workload Planner (dashboard)
   - Project Snapshots / Restore (active project)
---------------------------- */
var PHASE6_UI_KEY = 'stark_pm_phase6_ui_v1';
var PHASE6_SNAPSHOT_PREFIX = 'stark_pm_phase6_snapshots__';
var phase6State_ = {
  inited: false,
  patched: false,
  graphCollapsed: false,
  autoRefreshGraph: true,
};

function initPhase6_(){
  if(phase6State_.inited) return;
  phase6State_.inited = true;
  phase6LoadUiState_();
  phase6EnsureStyles_();
  phase6PatchFunctions_();
  phase6EnsureTopbarButton_();
  try{ renderAll(); }catch{ /* ignore */ }
}

function phase6LoadUiState_(){
  try{
    const raw = localStorage.getItem(PHASE6_UI_KEY);
    if(!raw) return;
    const x = JSON.parse(raw);
    phase6State_.graphCollapsed = !!x.graphCollapsed;
    phase6State_.autoRefreshGraph = x.autoRefreshGraph !== false;
  }catch{ /* ignore */ }
}

function phase6SaveUiState_(){
  try{
    localStorage.setItem(PHASE6_UI_KEY, JSON.stringify({
      graphCollapsed: !!phase6State_.graphCollapsed,
      autoRefreshGraph: !!phase6State_.autoRefreshGraph,
    }));
  }catch{ /* ignore */ }
}

function phase6EnsureStyles_(){
  if(document.querySelector('#phase6Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase6Styles';
  st.textContent = `
    .phase6-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0 8px}
    .phase6-toolbar .btn{padding:6px 10px}
    .phase6-hint{font-size:12px;opacity:.78}

    .phase6-grid{display:grid;grid-template-columns:1.2fr .8fr;gap:10px;margin:10px 0}
    .phase6-card{border:1px solid rgba(255,255,255,.09);border-radius:14px;background:rgba(255,255,255,.02);overflow:hidden}
    .phase6-card__head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid rgba(255,255,255,.06)}
    .phase6-card__title{font-size:12px;letter-spacing:.12em;text-transform:uppercase;opacity:.9}
    .phase6-card__body{padding:10px 12px}
    .phase6-card__body.is-collapsed{display:none}
    .phase6-badges{display:flex;gap:6px;flex-wrap:wrap}

    .phase6-graphSvg{width:100%;height:280px;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(255,255,255,.01)}
    .phase6-graphEdge{stroke:rgba(190,240,255,.28);stroke-width:1.5}
    .phase6-graphEdge--cycle{stroke:rgba(255,110,110,.55);stroke-dasharray:4 3}
    .phase6-graphEdge--missing{stroke:rgba(255,180,110,.4);stroke-dasharray:2 4}
    .phase6-graphNode{cursor:pointer}
    .phase6-graphNode circle{fill:rgba(255,255,255,.05);stroke:rgba(255,255,255,.18);stroke-width:1}
    .phase6-graphNode.is-done circle{opacity:.75}
    .phase6-graphNode.is-overdue circle{stroke:rgba(255,110,110,.55)}
    .phase6-graphNode.is-blocked circle{stroke:rgba(255,190,120,.55)}
    .phase6-graphNode text{fill:currentColor;font-size:11px;opacity:.92}
    .phase6-graphLegend{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px;font-size:11px;opacity:.8}
    .phase6-graphLegend span{display:inline-flex;align-items:center;gap:5px}
    .phase6-graphLegend i{display:inline-block;width:18px;height:0;border-top:2px solid rgba(190,240,255,.28)}
    .phase6-graphLegend i.cycle{border-top-color:rgba(255,110,110,.6);border-top-style:dashed}
    .phase6-graphList{margin-top:8px;display:flex;flex-direction:column;gap:6px;max-height:180px;overflow:auto}
    .phase6-graphRow{display:flex;justify-content:space-between;gap:10px;align-items:center;padding:7px 8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.01);cursor:pointer}
    .phase6-graphRow:hover{border-color:rgba(0,255,255,.2)}
    .phase6-graphRow__deps{font-size:11px;opacity:.75;text-align:right}

    .phase6-riskKv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .phase6-riskTile{border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:8px;background:rgba(255,255,255,.01)}
    .phase6-riskTile__k{font-size:11px;opacity:.7;text-transform:uppercase;letter-spacing:.08em}
    .phase6-riskTile__v{font-size:16px;font-weight:600;margin-top:2px}
    .phase6-riskPath{margin-top:8px;padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.01)}
    .phase6-riskPath__chain{font-size:12px;line-height:1.35;word-break:break-word}
    .phase6-riskPath__hint{font-size:11px;opacity:.75;margin-top:4px}

    .phase6-dashPanel{margin-top:10px}
    .phase6-tableWrap{overflow:auto}
    .phase6-table{width:100%;border-collapse:separate;border-spacing:0 6px;font-size:12px}
    .phase6-table th{font-size:11px;letter-spacing:.06em;text-transform:uppercase;opacity:.7;text-align:left;padding:0 8px}
    .phase6-table td{padding:8px;border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase6-table td:first-child{border-left:1px solid rgba(255,255,255,.06);border-radius:10px 0 0 10px}
    .phase6-table td:last-child{border-right:1px solid rgba(255,255,255,.06);border-radius:0 10px 10px 0}
    .phase6-table tr:hover td{border-color:rgba(0,255,255,.18)}
    .phase6-namebtn{background:none;border:none;color:inherit;padding:0;cursor:pointer;text-align:left;font:inherit}
    .phase6-namebtn:hover{text-decoration:underline}

    .phase6-snapBox{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08)}
    .phase6-snapTitle{font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.85;margin-bottom:8px}
    .phase6-snapList{display:flex;flex-direction:column;gap:6px;max-height:210px;overflow:auto}
    .phase6-snapItem{border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:8px;background:rgba(255,255,255,.01)}
    .phase6-snapItem.is-active{border-color:rgba(0,255,255,.25)}
    .phase6-snapItem__top{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .phase6-snapItem__name{font-size:12px;font-weight:600}
    .phase6-snapItem__meta{font-size:11px;opacity:.75;margin-top:4px}
    .phase6-snapActions{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}

    @media (max-width: 980px){
      .phase6-grid{grid-template-columns:1fr}
      .phase6-riskKv{grid-template-columns:1fr 1fr}
    }
    @media (max-width: 640px){
      .phase6-riskKv{grid-template-columns:1fr}
    }
  `;
  document.head.appendChild(st);
}

function phase6PatchFunctions_(){
  if(phase6State_.patched) return;
  phase6State_.patched = true;

  const baseRenderChecklist = renderChecklist;
  renderChecklist = function(){
    baseRenderChecklist();
    try{ phase6PostRenderChecklist_(); }catch(err){ console.warn('Phase6 checklist render failed', err); }
  };

  const baseRenderDashboard = renderDashboard;
  renderDashboard = function(){
    baseRenderDashboard();
    try{ phase6PostRenderDashboard_(); }catch(err){ console.warn('Phase6 dashboard render failed', err); }
  };

  const baseRenderProjects = renderProjects;
  renderProjects = function(){
    baseRenderProjects();
    try{ phase6PostRenderProjects_(); }catch(err){ console.warn('Phase6 projects render failed', err); }
  };

  if(typeof phase3BuildCmdkItems_ === 'function' && !phase3BuildCmdkItems_._phase6Wrapped){
    const oldBuild = phase3BuildCmdkItems_;
    phase3BuildCmdkItems_ = function(query){
      const items = oldBuild(query) || [];
      const q = String(query || '').trim().toLowerCase();
      const extra = [
        { kind:'command', title:'Phase 6: Dependency Graph', sub:'Open checklist and focus graph panel', tag:'PH6', act:'phase6OpenGraph' },
        { kind:'command', title:'Phase 6: Workload Planner', sub:'Open dashboard workload panel', tag:'PH6', act:'phase6Workload' },
        { kind:'command', title:'Phase 6: Create Project Snapshot', sub:'Save a restore point for active project', tag:'PH6', act:'phase6Snapshot' },
      ];
      for(const it of extra){
        const hay = `${it.title} ${it.sub} ${it.tag}`.toLowerCase();
        if(!q || hay.includes(q)) items.push(it);
      }
      return items;
    };
    phase3BuildCmdkItems_._phase6Wrapped = true;
  }

  if(typeof phase3RunCmdkAction_ === 'function' && !phase3RunCmdkAction_._phase6Wrapped){
    const oldRun = phase3RunCmdkAction_;
    phase3RunCmdkAction_ = function(it){
      if(it && it.act === 'phase6OpenGraph'){
        switchTab('checklist');
        phase6State_.graphCollapsed = false;
        phase6SaveUiState_();
        setTimeout(() => document.querySelector('#phase6GraphPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10);
        renderChecklist();
        return;
      }
      if(it && it.act === 'phase6Workload'){
        switchTab('dashboard');
        setTimeout(() => document.querySelector('#phase6DashWorkload')?.scrollIntoView({behavior:'smooth', block:'start'}), 10);
        renderDashboard();
        return;
      }
      if(it && it.act === 'phase6Snapshot'){
        switchTab('projects');
        phase6CreateSnapshotPrompt_();
        return;
      }
      return oldRun(it);
    };
    phase3RunCmdkAction_._phase6Wrapped = true;
  }
}

function phase6EnsureTopbarButton_(){
  const topbar = document.querySelector('.topbar__right');
  if(!topbar || document.querySelector('#phase6BtnSnapshotQuick')) return;
  const btn = document.createElement('button');
  btn.id = 'phase6BtnSnapshotQuick';
  btn.type = 'button';
  btn.className = 'btn btn--ghost';
  btn.textContent = 'Snapshot';
  btn.title = 'Create project snapshot (Phase 6)';
  btn.addEventListener('click', phase6CreateSnapshotPrompt_);
  const anchor = document.querySelector('#phase4BtnIntegrity') || document.querySelector('#btnExportJson');
  topbar.insertBefore(btn, anchor || null);
}

function phase6GetChecklistContext_(){
  if(typeof phase5GetChecklistContext_ === 'function') return phase5GetChecklistContext_();
  if(typeof phase3GetChecklistContext_ === 'function') return phase3GetChecklistContext_();
  const p = getActiveProject();
  return { p, m: p ? getActiveMilestone(p) : null };
}

function phase6PostRenderChecklist_(){
  const taskList = document.querySelector('#taskList');
  if(!taskList) return;
  phase6EnsureChecklistPanels_(taskList);
  phase6RenderChecklistPanels_();
}

function phase6EnsureChecklistPanels_(taskList){
  const anchor = document.querySelector('#phase5KanbanWrap') || taskList;
  let wrap = document.querySelector('#phase6ChecklistPanels');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'phase6ChecklistPanels';
    wrap.className = 'phase6-grid';
    anchor.insertAdjacentElement('afterend', wrap);
  }

  if(!document.querySelector('#phase6GraphPanel')){
    const left = document.createElement('div');
    left.id = 'phase6GraphPanel';
    left.className = 'phase6-card';
    left.innerHTML = `
      <div class="phase6-card__head">
        <div class="phase6-card__title">Dependency Graph</div>
        <div class="phase6-toolbar">
          <label class="phase6-hint"><input type="checkbox" id="phase6AutoRefreshGraph" /> auto</label>
          <button class="btn btn--ghost" type="button" id="phase6BtnRefreshGraph">Refresh</button>
          <button class="btn btn--ghost" type="button" id="phase6BtnToggleGraph">Collapse</button>
          <button class="btn btn--ghost" type="button" id="phase6BtnRepairCycles">Repair Cycles</button>
        </div>
      </div>
      <div class="phase6-card__body" id="phase6GraphBody">
        <div class="phase6-badges" id="phase6GraphStats"></div>
        <svg class="phase6-graphSvg" id="phase6GraphSvg" viewBox="0 0 900 280" preserveAspectRatio="none"></svg>
        <div class="phase6-graphLegend">
          <span><i></i> dependency</span>
          <span><i class="cycle"></i> cycle edge</span>
          <span>○ node color reflects blocked / overdue</span>
        </div>
        <div class="phase6-graphList" id="phase6GraphList"></div>
      </div>
    `;
    wrap.appendChild(left);

    left.querySelector('#phase6BtnRefreshGraph')?.addEventListener('click', () => phase6RenderChecklistPanels_());
    left.querySelector('#phase6BtnToggleGraph')?.addEventListener('click', () => {
      phase6State_.graphCollapsed = !phase6State_.graphCollapsed;
      phase6SaveUiState_();
      phase6RenderChecklistPanels_();
    });
    left.querySelector('#phase6BtnRepairCycles')?.addEventListener('click', phase6RepairCyclesPrompt_);
    left.querySelector('#phase6AutoRefreshGraph')?.addEventListener('change', (e) => {
      phase6State_.autoRefreshGraph = !!e.target.checked;
      phase6SaveUiState_();
    });
  }

  if(!document.querySelector('#phase6RiskPanel')){
    const right = document.createElement('div');
    right.id = 'phase6RiskPanel';
    right.className = 'phase6-card';
    right.innerHTML = `
      <div class="phase6-card__head">
        <div class="phase6-card__title">Critical Path & Risk</div>
        <div class="phase6-hint" id="phase6RiskScopeHint">Active milestone</div>
      </div>
      <div class="phase6-card__body" id="phase6RiskBody">
        <div class="phase6-riskKv" id="phase6RiskKv"></div>
        <div class="phase6-riskPath" id="phase6RiskPath"></div>
      </div>
    `;
    wrap.appendChild(right);
  }
}

function phase6RenderChecklistPanels_(){
  const { p, m } = phase6GetChecklistContext_();
  const body = document.querySelector('#phase6GraphBody');
  const toggle = document.querySelector('#phase6BtnToggleGraph');
  const autoBox = document.querySelector('#phase6AutoRefreshGraph');
  if(autoBox) autoBox.checked = !!phase6State_.autoRefreshGraph;
  if(body) body.classList.toggle('is-collapsed', !!phase6State_.graphCollapsed);
  if(toggle) toggle.textContent = phase6State_.graphCollapsed ? 'Expand' : 'Collapse';

  if(!p || !m){
    if(document.querySelector('#phase6GraphStats')) document.querySelector('#phase6GraphStats').innerHTML = `<span class="badge">No active milestone</span>`;
    if(document.querySelector('#phase6GraphSvg')) document.querySelector('#phase6GraphSvg').innerHTML = '';
    if(document.querySelector('#phase6GraphList')) document.querySelector('#phase6GraphList').innerHTML = `<div class="hint">Select a project + milestone.</div>`;
    phase6RenderRiskPanel_(null, null, null);
    return;
  }

  const graph = phase6BuildMilestoneGraph_(m);
  phase6RenderGraphPanel_(p, m, graph);
  const risk = phase6AnalyzeMilestoneRisk_(m, graph);
  phase6RenderRiskPanel_(p, m, risk);
}

function phase6BuildMilestoneGraph_(m){
  const tasks = Array.isArray(m?.tasks) ? m.tasks : [];
  const byId = new Map();
  for(const t of tasks){
    if(!t) continue;
    if(typeof phase5NormalizeTaskMeta_ === 'function') phase5NormalizeTaskMeta_(t);
    else if(typeof phase4NormalizeTaskMeta_ === 'function') phase4NormalizeTaskMeta_(t, t);
    byId.set(t.id, t);
  }

  const nodes = tasks.map((t, index) => ({ id: t.id, task: t, index }));
  const edges = [];
  const invalidEdges = [];
  const selfEdges = [];
  let missingRefs = 0;

  for(const t of tasks){
    const deps = Array.isArray(t?.blockedBy) ? t.blockedBy : [];
    const seen = new Set();
    for(const depIdRaw of deps){
      const depId = String(depIdRaw || '');
      if(!depId || seen.has(depId)) continue;
      seen.add(depId);
      if(depId === t.id){ selfEdges.push({ from: t.id, to: depId }); continue; }
      const dep = byId.get(depId);
      if(!dep){ missingRefs++; invalidEdges.push({ from: t.id, to: depId }); continue; }
      edges.push({ from: t.id, to: depId }); // t depends on dep
    }
  }

  const adj = new Map(nodes.map(n => [n.id, []]));
  for(const e of edges){
    if(adj.has(e.from)) adj.get(e.from).push(e.to);
  }

  // DFS cycle detection, collect back-edges and node set
  const colors = new Map(nodes.map(n => [n.id, 0])); // 0 white,1 gray,2 black
  const cycleEdges = [];
  const cycleNodeIds = new Set();
  const stack = [];
  function dfs(id){
    colors.set(id, 1);
    stack.push(id);
    const nexts = adj.get(id) || [];
    for(const to of nexts){
      const c = colors.get(to) || 0;
      if(c === 0){
        dfs(to);
      } else if(c === 1){
        cycleEdges.push({ from:id, to });
        cycleNodeIds.add(id); cycleNodeIds.add(to);
        for(let i = stack.length - 1; i >= 0; i--){
          cycleNodeIds.add(stack[i]);
          if(stack[i] === to) break;
        }
      }
    }
    stack.pop();
    colors.set(id, 2);
  }
  for(const n of nodes){ if((colors.get(n.id)||0) === 0) dfs(n.id); }

  // compute dependency depth (longest chain toward leaves)
  const depthMemo = new Map();
  const depthSeen = new Set();
  function depthOf(id){
    if(depthMemo.has(id)) return depthMemo.get(id);
    if(depthSeen.has(id)) return 0; // cycle fallback
    depthSeen.add(id);
    let d = 0;
    for(const depId of (adj.get(id) || [])) d = Math.max(d, 1 + depthOf(depId));
    depthSeen.delete(id);
    depthMemo.set(id, d);
    return d;
  }
  nodes.forEach(n => n.depth = depthOf(n.id));

  return {
    tasks, byId, nodes, edges, adj,
    missingRefs, invalidEdges, selfEdges,
    cycleEdges, cycleNodeIds,
  };
}

function phase6RenderGraphPanel_(p, m, graph){
  const statsEl = document.querySelector('#phase6GraphStats');
  const svg = document.querySelector('#phase6GraphSvg');
  const list = document.querySelector('#phase6GraphList');
  if(!statsEl || !svg || !list) return;

  const unresolvedBlocked = (graph.tasks || []).filter(t => !t.done && (typeof phase4GetUnresolvedBlockers_ === 'function' ? phase4GetUnresolvedBlockers_(m, t).length : (Array.isArray(t.blockedBy)&&t.blockedBy.length))).length;
  const overdue = (graph.tasks || []).filter(t => !t.done && typeof phase4IsOverdue_ === 'function' && phase4IsOverdue_(t)).length;
  const cycleCount = graph.cycleEdges.length;

  statsEl.innerHTML = [
    `<span class="badge">TASKS ${graph.tasks.length}</span>`,
    `<span class="badge">DEPS ${graph.edges.length}</span>`,
    `<span class="badge ${cycleCount ? 'badge--warn' : ''}">CYCLE EDGES ${cycleCount}</span>`,
    `<span class="badge ${graph.missingRefs ? 'badge--warn' : ''}">MISSING REFS ${graph.missingRefs}</span>`,
    `<span class="badge ${unresolvedBlocked ? 'badge--warn' : ''}">BLOCKED ${unresolvedBlocked}</span>`,
    `<span class="badge ${overdue ? 'badge--warn' : ''}">OVERDUE ${overdue}</span>`,
  ].join('');

  // Build simple layered SVG layout
  const nodes = graph.nodes.slice();
  nodes.sort((a,b) => (a.depth - b.depth) || (Number(a.task.done) - Number(b.task.done)) || String(a.task.title||'').localeCompare(String(b.task.title||'')));
  const maxDepth = Math.max(0, ...nodes.map(n => Number(n.depth||0)));
  const colBuckets = Array.from({length: maxDepth + 1}, () => []);
  nodes.forEach(n => colBuckets[n.depth || 0].push(n));

  const W = 900, H = 280, padX = 60, padY = 24;
  const colGap = (W - padX*2) / Math.max(1, maxDepth || 1);
  const pos = new Map();
  colBuckets.forEach((bucket, col) => {
    const rowGap = (H - padY*2) / Math.max(1, Math.max(bucket.length - 1, 1));
    bucket.forEach((n, row) => {
      const x = padX + (maxDepth ? colGap * col : (W - padX*2)/2);
      const y = padY + (bucket.length === 1 ? (H - padY*2)/2 : rowGap * row);
      pos.set(n.id, { x, y });
    });
  });

  const cycleEdgeSet = new Set(graph.cycleEdges.map(e => `${e.from}>${e.to}`));
  const lines = [];
  const edgeByTarget = new Map();
  graph.edges.forEach(e => {
    const a = pos.get(e.from); const b = pos.get(e.to);
    if(!a || !b) return;
    const key = `${e.from}>${e.to}`;
    const isCycle = cycleEdgeSet.has(key);
    const mx = (a.x + b.x) / 2;
    const d = `M ${a.x} ${a.y} C ${mx} ${a.y}, ${mx} ${b.y}, ${b.x} ${b.y}`;
    lines.push(`<path class="phase6-graphEdge ${isCycle ? 'phase6-graphEdge--cycle' : ''}" d="${d}"/>`);
    if(!edgeByTarget.has(e.from)) edgeByTarget.set(e.from, []);
    edgeByTarget.get(e.from).push(e.to);
  });

  const nodeEls = [];
  for(const n of nodes){
    const pnt = pos.get(n.id); if(!pnt) continue;
    const t = n.task;
    const unresolved = (typeof phase4GetUnresolvedBlockers_ === 'function') ? phase4GetUnresolvedBlockers_(m, t).length : 0;
    const over = (!t.done && typeof phase4IsOverdue_ === 'function' && phase4IsOverdue_(t));
    const cls = ['phase6-graphNode'];
    if(t.done) cls.push('is-done');
    if(over) cls.push('is-overdue');
    if(unresolved) cls.push('is-blocked');
    const label = phase6Trunc_(String(t.title || ''), 20);
    const safeLabel = escapeHtml(label);
    nodeEls.push(`<g class="${cls.join(' ')}" data-task-id="${escapeHtml(t.id)}" transform="translate(${pnt.x},${pnt.y})"><circle r="16"></circle><text x="22" y="4">${safeLabel}</text></g>`);
  }

  svg.innerHTML = `<g>${lines.join('')}</g><g>${nodeEls.join('')}</g>`;
  Array.from(svg.querySelectorAll('.phase6-graphNode')).forEach(g => {
    g.addEventListener('click', () => {
      const tid = g.getAttribute('data-task-id');
      phase6ScrollToTask_(tid);
    });
  });

  list.innerHTML = '';
  const rows = graph.tasks.slice().sort((a,b) => (Number(a.done)-Number(b.done)) || (Number(!!a.dueAt)-Number(!!b.dueAt)) || String(a.title||'').localeCompare(String(b.title||'')));
  if(!rows.length){
    list.innerHTML = `<div class="hint">No tasks in this milestone yet.</div>`;
  } else {
    rows.forEach(t => {
      const deps = (Array.isArray(t.blockedBy) ? t.blockedBy : []).map(id => graph.byId.get(id)?.title || '[missing]').filter(Boolean);
      const unresolved = (typeof phase4GetUnresolvedBlockers_ === 'function') ? phase4GetUnresolvedBlockers_(m, t).length : 0;
      const row = document.createElement('div');
      row.className = 'phase6-graphRow';
      row.dataset.taskId = t.id;
      row.innerHTML = `
        <div>
          <div>${escapeHtml(t.title)} ${t.done ? '✓' : ''}</div>
          <div class="phase6-hint">${escapeHtml((t.assignee || '').trim() || 'Unassigned')}${t.dueAt ? ' • ' + escapeHtml(phase6FmtShortDate_(t.dueAt)) : ''}${unresolved ? ' • BLOCKED '+unresolved : ''}</div>
        </div>
        <div class="phase6-graphRow__deps">${deps.length ? escapeHtml(deps.slice(0,2).join(', ')) + (deps.length>2 ? '…' : '') : 'No deps'}</div>
      `;
      row.addEventListener('click', () => phase6ScrollToTask_(t.id));
      list.appendChild(row);
    });
  }
}

function phase6AnalyzeMilestoneRisk_(m, graph){
  if(!m || !graph) return null;
  const tasks = graph.tasks || [];
  const active = tasks.filter(t => !t.done);
  const byId = graph.byId;

  // Use a DAG approximation by skipping cycle edges (back-edges already flagged)
  const cycleEdgeSet = new Set((graph.cycleEdges || []).map(e => `${e.from}>${e.to}`));
  const parents = new Map(tasks.map(t => [t.id, []]));
  const children = new Map(tasks.map(t => [t.id, []]));
  for(const e of (graph.edges || [])){
    if(cycleEdgeSet.has(`${e.from}>${e.to}`)) continue;
    // dependency direction in scheduling graph: dep -> task
    if(children.has(e.to)) children.get(e.to).push(e.from);
    if(parents.has(e.from)) parents.get(e.from).push(e.to);
  }

  const indeg = new Map(tasks.map(t => [t.id, (parents.get(t.id)||[]).length]));
  const q = [];
  indeg.forEach((v,k) => { if(v === 0) q.push(k); });
  const topo = [];
  while(q.length){
    const id = q.shift();
    topo.push(id);
    for(const c of (children.get(id) || [])){
      indeg.set(c, (indeg.get(c)||0) - 1);
      if((indeg.get(c)||0) === 0) q.push(c);
    }
  }
  // if cycles remain, append leftovers so analysis still works
  for(const t of tasks){ if(!topo.includes(t.id)) topo.push(t.id); }

  const dist = new Map();
  const prev = new Map();
  for(const id of topo){
    const t = byId.get(id);
    const w = phase6EstimateEffortDays_(t);
    let best = w;
    let bestPrev = null;
    for(const pId of (parents.get(id) || [])){
      const cand = (dist.get(pId) || phase6EstimateEffortDays_(byId.get(pId))) + w;
      if(cand > best){ best = cand; bestPrev = pId; }
    }
    dist.set(id, best);
    if(bestPrev) prev.set(id, bestPrev);
  }

  let endId = topo[0] || null;
  for(const id of topo){ if((dist.get(id)||0) > (dist.get(endId)||0)) endId = id; }
  const pathIds = [];
  const seen = new Set();
  let cur = endId;
  while(cur && !seen.has(cur)){
    seen.add(cur);
    pathIds.push(cur);
    cur = prev.get(cur) || null;
  }
  pathIds.reverse();
  const pathTasks = pathIds.map(id => byId.get(id)).filter(Boolean);

  const overdueCount = active.filter(t => typeof phase4IsOverdue_ === 'function' && phase4IsOverdue_(t)).length;
  const due7Count = active.filter(t => typeof phase4IsDueInNextDays_ === 'function' && phase4IsDueInNextDays_(t, 7)).length;
  const blockedCount = active.filter(t => (typeof phase4GetUnresolvedBlockers_ === 'function' ? phase4GetUnresolvedBlockers_(m, t).length : 0) > 0).length;
  const unassignedCount = active.filter(t => !String(t.assignee || '').trim()).length;
  const highRiskOpen = active.filter(t => t.severity === 'high' || t.severity === 'blocker').length;

  let riskScore = 0;
  riskScore += overdueCount * 3;
  riskScore += blockedCount * 2;
  riskScore += graph.cycleEdges.length * 4;
  riskScore += graph.missingRefs * 2;
  riskScore += Math.min(due7Count, 8);
  riskScore += Math.ceil(highRiskOpen / 2);
  riskScore += Math.ceil(unassignedCount / 4);
  const riskLevel = riskScore >= 18 ? 'critical' : riskScore >= 10 ? 'high' : riskScore >= 5 ? 'medium' : 'low';

  return {
    totalTasks: tasks.length,
    openTasks: active.length,
    overdueCount,
    due7Count,
    blockedCount,
    unassignedCount,
    highRiskOpen,
    cycleEdges: graph.cycleEdges.length,
    missingRefs: graph.missingRefs,
    criticalPathDays: Math.round(dist.get(endId) || 0),
    pathTasks,
    riskScore,
    riskLevel,
  };
}

function phase6RenderRiskPanel_(p, m, risk){
  const kv = document.querySelector('#phase6RiskKv');
  const pathEl = document.querySelector('#phase6RiskPath');
  const hint = document.querySelector('#phase6RiskScopeHint');
  if(hint) hint.textContent = p && m ? `${p.name} • ${m.title}` : 'Active milestone';
  if(!kv || !pathEl) return;
  if(!p || !m || !risk){
    kv.innerHTML = `<div class="hint">No active milestone selected.</div>`;
    pathEl.innerHTML = `<div class="phase6-hint">Critical path analysis appears here.</div>`;
    return;
  }

  const riskBadgeClass = risk.riskLevel === 'critical' || risk.riskLevel === 'high' ? 'badge--warn' : '';
  const tiles = [
    ['Risk', `<span class="badge ${riskBadgeClass}">${String(risk.riskLevel).toUpperCase()}</span> • score ${risk.riskScore}`],
    ['Critical Path', `${risk.criticalPathDays} day est.`],
    ['Open / Total', `${risk.openTasks} / ${risk.totalTasks}`],
    ['Blocked (open)', `${risk.blockedCount}`],
    ['Overdue', `${risk.overdueCount}`],
    ['Due 7 Days', `${risk.due7Count}`],
    ['Cycles / Missing', `${risk.cycleEdges} / ${risk.missingRefs}`],
    ['Unassigned Open', `${risk.unassignedCount}`],
  ];
  kv.innerHTML = tiles.map(([k,v]) => `<div class="phase6-riskTile"><div class="phase6-riskTile__k">${escapeHtml(k)}</div><div class="phase6-riskTile__v">${v}</div></div>`).join('');

  if(!risk.pathTasks.length){
    pathEl.innerHTML = `<div class="phase6-riskPath__chain">No path available yet.</div>`;
    return;
  }
  const chain = risk.pathTasks.map(t => {
    const parts = [String(t.title || '')];
    if(t.done) parts.push('✓');
    if(t.dueAt) parts.push(phase6FmtShortDate_(t.dueAt));
    return parts.join(' ');
  }).join(' → ');
  pathEl.innerHTML = `
    <div class="phase6-riskPath__chain">${escapeHtml(chain)}</div>
    <div class="phase6-riskPath__hint">Heuristic estimate based on severity + step count + dependency depth. Use it to spot likely delay chains fast.</div>
  `;
}

function phase6EstimateEffortDays_(t){
  if(!t) return 1;
  const sev = String(t.severity || 'normal');
  let base = sev === 'blocker' ? 4 : sev === 'high' ? 2 : 1;
  const stepCount = Array.isArray(t.steps) ? phase6CountSteps_(t.steps) : 0;
  base += Math.min(3, Math.floor(stepCount / 3));
  if((typeof phase4GetUnresolvedBlockers_ === 'function') && phase6GetChecklistContext_()?.m){
    try{
      const m = phase6GetChecklistContext_().m;
      if(m && phase4GetUnresolvedBlockers_(m, t).length) base += 1;
    }catch{ /* ignore */ }
  }
  return Math.max(1, base);
}

function phase6CountSteps_(steps){
  if(!Array.isArray(steps)) return 0;
  let n = 0;
  const walk = (arr) => {
    for(const s of (arr || [])){
      n += 1;
      if(Array.isArray(s?.children) && s.children.length) walk(s.children);
    }
  };
  walk(steps);
  return n;
}

function phase6Trunc_(s, n){
  s = String(s || '');
  return s.length > n ? s.slice(0, Math.max(0, n-1)) + '…' : s;
}

function phase6FmtShortDate_(ts){
  const d = new Date(Number(ts || 0));
  if(!Number.isFinite(d.getTime())) return '—';
  return d.toLocaleDateString();
}

function phase6ScrollToTask_(taskId){
  if(!taskId) return;
  switchTab('checklist');
  // ensure list view for row visibility
  try{
    if(phase5State_ && phase5State_.checklistView !== 'list'){
      phase5State_.checklistView = 'list';
      if(typeof phase5SaveUiState_ === 'function') phase5SaveUiState_();
      if(typeof phase5SyncChecklistViewUi_ === 'function') phase5SyncChecklistViewUi_();
    }
  }catch{ /* ignore */ }
  setTimeout(() => {
    const selector = `#taskList .task[data-task-id="${CSS.escape(String(taskId))}"]`;
    const row = document.querySelector(selector);
    if(row){
      row.scrollIntoView({ behavior:'smooth', block:'center' });
      row.classList.add('is-selected');
      setTimeout(() => row.classList.remove('is-selected'), 900);
    }
  }, 20);
}

async function phase6RepairCyclesPrompt_(){
  const ctx = phase6GetChecklistContext_();
  const m = ctx && ctx.m;
  if(!m){ alert('Select an active milestone first.'); return; }
  const graph = phase6BuildMilestoneGraph_(m);
  const removable = [];
  const cycleSet = new Set(graph.cycleEdges.map(e => `${e.from}>${e.to}`));
  for(const e of graph.edges){
    if(cycleSet.has(`${e.from}>${e.to}`)) removable.push(e);
  }
  if(!removable.length){
    alert('No cycle edges detected in the active milestone.');
    return;
  }

  const preview = removable.slice(0,6).map(e => `${graph.byId.get(e.from)?.title || e.from} -> ${graph.byId.get(e.to)?.title || e.to}`).join('\n');
  const ok = await pmConfirmDialog_(`Repair dependency cycles by removing ${removable.length} back-edge(s)?\n\n${preview}${removable.length > 6 ? '\n…' : ''}`, {
    title:'Repair Dependency Cycles',
    okText:'Repair'
  });
  if(!ok) return;

  let removed = 0;
  for(const e of removable){
    const t = graph.byId.get(e.from);
    if(!t || !Array.isArray(t.blockedBy)) continue;
    const before = t.blockedBy.length;
    t.blockedBy = t.blockedBy.filter(id => String(id) !== String(e.to));
    if(t.blockedBy.length !== before) removed++;
  }
  if(removed){
    addActivity(`Phase 6 repaired ${removed} cyclic dependency edge(s)`);
    saveState();
    renderChecklist();
  }
}

function phase6PostRenderDashboard_(){
  const hostCard = document.querySelector('#tab-dashboard .grid.grid--2');
  if(!hostCard) return;
  let panel = document.querySelector('#phase6DashWorkload');
  if(!panel){
    panel = document.createElement('div');
    panel.id = 'phase6DashWorkload';
    panel.className = 'card phase6-dashPanel';
    panel.innerHTML = `
      <div class="card__top">
        <div>
          <div class="card__label">Workload Planner</div>
          <div class="card__hint">Open workload by assignee (active project, with overdue + blocked signals)</div>
        </div>
        <div class="phase6-toolbar">
          <select class="select" id="phase6WorkloadScope">
            <option value="project">Active Project</option>
            <option value="all">All Projects</option>
          </select>
          <button class="btn btn--ghost" type="button" id="phase6BtnRefreshWorkload">Refresh</button>
        </div>
      </div>
      <div class="phase6-tableWrap"><table class="phase6-table" id="phase6WorkloadTable"></table></div>
    `;
    hostCard.insertAdjacentElement('afterend', panel);
    panel.querySelector('#phase6WorkloadScope')?.addEventListener('change', () => phase6RenderWorkloadPlanner_());
    panel.querySelector('#phase6BtnRefreshWorkload')?.addEventListener('click', () => phase6RenderWorkloadPlanner_());
  }
  phase6RenderWorkloadPlanner_();
}

function phase6CollectTasksForWorkload_(scope){
  const out = [];
  const activeProject = getActiveProject();
  const projects = scope === 'all' ? (state.projects || []).filter(Boolean) : (activeProject ? [activeProject] : []);
  for(const p of projects){
    if(p.archived) continue;
    for(const mod of (p.modules || [])){
      for(const ms of (mod.milestones || [])){
        for(const t of (ms.tasks || [])){
          if(!t) continue;
          if(typeof phase5NormalizeTaskMeta_ === 'function') phase5NormalizeTaskMeta_(t);
          out.push({ p, mod, ms, t });
        }
      }
    }
  }
  return out;
}

function phase6RenderWorkloadPlanner_(){
  const table = document.querySelector('#phase6WorkloadTable');
  const sel = document.querySelector('#phase6WorkloadScope');
  if(!table) return;
  const scope = String(sel?.value || 'project');
  const rows = phase6CollectTasksForWorkload_(scope);
  const map = new Map();

  const ctx = phase6GetChecklistContext_();
  for(const r of rows){
    const name = String(r.t.assignee || '').trim() || 'Unassigned';
    if(!map.has(name)) map.set(name, { name, total:0, open:0, overdue:0, due7:0, blocked:0, high:0, blocker:0, done:0 });
    const a = map.get(name);
    a.total++;
    if(r.t.done){ a.done++; }
    else { a.open++; }
    if(!r.t.done && typeof phase4IsOverdue_ === 'function' && phase4IsOverdue_(r.t)) a.overdue++;
    if(!r.t.done && typeof phase4IsDueInNextDays_ === 'function' && phase4IsDueInNextDays_(r.t, 7)) a.due7++;
    if(!r.t.done){
      try{
        const unresolved = (typeof phase4GetUnresolvedBlockers_ === 'function') ? phase4GetUnresolvedBlockers_(r.ms, r.t).length : 0;
        if(unresolved) a.blocked++;
      }catch{ /* ignore */ }
    }
    if(r.t.severity === 'high') a.high++;
    if(r.t.severity === 'blocker') a.blocker++;
  }

  const list = Array.from(map.values()).sort((a,b) =>
    (b.overdue - a.overdue) || (b.blocked - a.blocked) || (b.blocker - a.blocker) || (b.open - a.open) || a.name.localeCompare(b.name)
  );

  if(!list.length){
    table.innerHTML = `<tr><td class="hint">No tasks to analyze yet.</td></tr>`;
    return;
  }

  table.innerHTML = `
    <thead><tr>
      <th>Assignee</th><th>Open</th><th>Overdue</th><th>Due 7d</th><th>Blocked</th><th>High/Blocker</th><th>Done</th>
    </tr></thead>
    <tbody>
      ${list.map(a => `
        <tr>
          <td><button class="phase6-namebtn" type="button" data-assignee="${escapeHtml(a.name)}">${escapeHtml(a.name)}</button></td>
          <td>${a.open}</td>
          <td>${a.overdue ? `<span class="badge badge--warn">${a.overdue}</span>` : a.overdue}</td>
          <td>${a.due7}</td>
          <td>${a.blocked ? `<span class="badge badge--warn">${a.blocked}</span>` : a.blocked}</td>
          <td>${a.high}/${a.blocker}</td>
          <td>${a.done}</td>
        </tr>
      `).join('')}
    </tbody>
  `;

  Array.from(table.querySelectorAll('[data-assignee]')).forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.getAttribute('data-assignee') || '';
      const activeProject = getActiveProject();
      if(!activeProject){ switchTab('checklist'); return; }
      // best-effort navigation: jump to first open task for assignee in active project
      for(const mod of (activeProject.modules || [])){
        for(const ms of (mod.milestones || [])){
          const hit = (ms.tasks || []).find(t => !t.done && ((String(t.assignee || '').trim() || 'Unassigned') === name));
          if(hit){
            setActiveMilestone(ms.id);
            switchTab('checklist');
            setTimeout(() => phase6ScrollToTask_(hit.id), 20);
            return;
          }
        }
      }
      switchTab('checklist');
    });
  });
}

function phase6PostRenderProjects_(){
  const formCard = document.querySelector('#tab-projects .grid.grid--2 > .card:nth-child(2)');
  if(!formCard) return;
  if(!document.querySelector('#phase6ProjectSnapshots')){
    const box = document.createElement('div');
    box.id = 'phase6ProjectSnapshots';
    box.className = 'phase6-snapBox';
    box.innerHTML = `
      <div class="phase6-snapTitle">Project Snapshots</div>
      <div class="row row--actions" style="margin-bottom:8px">
        <button class="btn btn--ghost" type="button" id="phase6BtnCreateSnapshot">Create Snapshot</button>
        <button class="btn btn--ghost" type="button" id="phase6BtnRestoreSnapshot">Restore Selected</button>
        <button class="btn btn--ghost" type="button" id="phase6BtnDeleteSnapshot">Delete Selected</button>
      </div>
      <div class="phase6-snapList" id="phase6SnapshotList"></div>
      <div class="phase6-hint" id="phase6SnapshotHint">Create restore points before large edits or imports.</div>
    `;
    formCard.appendChild(box);
    box.querySelector('#phase6BtnCreateSnapshot')?.addEventListener('click', phase6CreateSnapshotPrompt_);
    box.querySelector('#phase6BtnRestoreSnapshot')?.addEventListener('click', phase6RestoreSelectedSnapshot_);
    box.querySelector('#phase6BtnDeleteSnapshot')?.addEventListener('click', phase6DeleteSelectedSnapshot_);
  }
  phase6RenderSnapshotList_();
}

function phase6SnapshotStorageKey_(projectId){
  return PHASE6_SNAPSHOT_PREFIX + String(projectId || 'none');
}

function phase6LoadSnapshotsForProject_(projectId){
  if(!projectId) return [];
  try{
    const raw = localStorage.getItem(phase6SnapshotStorageKey_(projectId));
    const arr = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(arr)) return [];
    return arr.filter(x => x && typeof x === 'object').map(x => ({
      id: String(x.id || uid()),
      name: String(x.name || 'Snapshot'),
      ts: Number(x.ts || Date.now()),
      note: String(x.note || ''),
      project: x.project || null,
    }));
  }catch{ return []; }
}

function phase6SaveSnapshotsForProject_(projectId, arr){
  if(!projectId) return;
  try{
    const clean = (arr || []).slice(0, 20).map(x => ({
      id: String(x.id || uid()),
      name: String(x.name || 'Snapshot'),
      ts: Number(x.ts || Date.now()),
      note: String(x.note || ''),
      project: x.project || null,
    }));
    localStorage.setItem(phase6SnapshotStorageKey_(projectId), JSON.stringify(clean));
  }catch(err){ console.warn('Phase6 snapshot save failed', err); }
}

function phase6CountProjectTotals_(p){
  let modules = 0, milestones = 0, tasks = 0, done = 0;
  for(const mod of (p?.modules || [])){
    modules++;
    for(const ms of (mod?.milestones || [])){
      milestones++;
      for(const t of (ms?.tasks || [])){
        tasks++;
        if(t?.done) done++;
      }
    }
  }
  return { modules, milestones, tasks, done };
}

function phase6RenderSnapshotList_(){
  const list = document.querySelector('#phase6SnapshotList');
  const hint = document.querySelector('#phase6SnapshotHint');
  if(!list) return;
  const p = getActiveProject();
  if(!p){
    list.innerHTML = `<div class="hint">Select a project to manage snapshots.</div>`;
    if(hint) hint.textContent = 'No active project selected.';
    return;
  }
  const snaps = phase6LoadSnapshotsForProject_(p.id).sort((a,b) => b.ts - a.ts);
  if(hint) hint.textContent = `${snaps.length} snapshot(s) for active project. Stored locally in your browser.`;
  if(!snaps.length){
    list.innerHTML = `<div class="hint">No snapshots yet.</div>`;
    return;
  }

  const selectedId = list.dataset.selectedId || snaps[0].id;
  list.innerHTML = '';
  snaps.forEach(s => {
    const counts = phase6CountProjectTotals_(sanitizeProject(s.project || {}));
    const item = document.createElement('div');
    item.className = 'phase6-snapItem' + (selectedId === s.id ? ' is-active' : '');
    item.dataset.snapId = s.id;
    item.innerHTML = `
      <div class="phase6-snapItem__top">
        <div class="phase6-snapItem__name">${escapeHtml(s.name)}</div>
        <div class="badge">${new Date(s.ts).toLocaleString()}</div>
      </div>
      <div class="phase6-snapItem__meta">${counts.modules} module(s) • ${counts.milestones} milestone(s) • ${counts.done}/${counts.tasks} tasks done${s.note ? ` • ${escapeHtml(phase6Trunc_(s.note, 80))}` : ''}</div>
      <div class="phase6-snapActions">
        <button class="btn btn--ghost" type="button" data-act="select">Select</button>
        <button class="btn btn--ghost" type="button" data-act="restore">Restore</button>
        <button class="btn btn--ghost" type="button" data-act="delete">Delete</button>
      </div>
    `;
    item.querySelector('[data-act="select"]')?.addEventListener('click', () => {
      list.dataset.selectedId = s.id;
      phase6RenderSnapshotList_();
    });
    item.querySelector('[data-act="restore"]')?.addEventListener('click', () => {
      list.dataset.selectedId = s.id;
      phase6RestoreSelectedSnapshot_();
    });
    item.querySelector('[data-act="delete"]')?.addEventListener('click', () => {
      list.dataset.selectedId = s.id;
      phase6DeleteSelectedSnapshot_();
    });
    list.appendChild(item);
  });
  list.dataset.selectedId = selectedId;
}

async function phase6CreateSnapshotPrompt_(){
  const p = getActiveProject();
  if(!p){ await pmAlertDialog_('Select an active project first.', { title:'Create Snapshot' }); return; }
  const defaultName = `Snapshot ${new Date().toLocaleString()}`;
  const name = await pmPromptDialog_('Snapshot name?', defaultName, { title:'Create Snapshot', placeholder:'Snapshot name' });
  if(name === null) return;
  const trimmed = String(name || '').trim() || defaultName;
  const note = await pmPromptDialog_('Optional snapshot note (what changed / why)?', '', { title:'Create Snapshot', placeholder:'Optional note' });
  if(note === null) return;

  // Make sure latest project settings UI values are captured if user is editing in Projects tab
  try{ if(typeof phase5ApplyProjectSettingsFromUi_ === 'function') phase5ApplyProjectSettingsFromUi_(p); }catch{}

  const snaps = phase6LoadSnapshotsForProject_(p.id);
  const clone = JSON.parse(JSON.stringify(p));
  snaps.unshift({ id: uid(), name: trimmed, note: String(note || '').trim(), ts: Date.now(), project: clone });
  phase6SaveSnapshotsForProject_(p.id, snaps);
  addActivity(`Created project snapshot: ${p.name}`);
  phase6RenderSnapshotList_();
}

function phase6GetSelectedSnapshot_(){
  const p = getActiveProject();
  const list = document.querySelector('#phase6SnapshotList');
  if(!p || !list) return null;
  const selectedId = list.dataset.selectedId || '';
  const snaps = phase6LoadSnapshotsForProject_(p.id);
  return snaps.find(s => s.id === selectedId) || snaps[0] || null;
}

async function phase6RestoreSelectedSnapshot_(){
  const p = getActiveProject();
  if(!p){ await pmAlertDialog_('Select an active project first.', { title:'Restore Snapshot' }); return; }
  const snap = phase6GetSelectedSnapshot_();
  if(!snap){ await pmAlertDialog_('No snapshot selected.', { title:'Restore Snapshot' }); return; }
  const ok = await pmConfirmDialog_(`Restore snapshot "${snap.name}" for project "${p.name}"?\n\nCurrent project state will be replaced.`, { title:'Restore Snapshot', okText:'Restore', danger:true });
  if(!ok) return;

  let restored = null;
  try{
    restored = sanitizeProject(JSON.parse(JSON.stringify(snap.project || {})));
  }catch(err){
    await pmAlertDialog_('Snapshot is invalid/corrupted and could not be restored.', { title:'Restore Snapshot' });
    return;
  }
  // keep current project id stable if snapshot id differs
  restored.id = p.id;

  const idx = state.projects.findIndex(x => x && x.id === p.id);
  if(idx < 0){ await pmAlertDialog_('Active project not found.', { title:'Restore Snapshot' }); return; }
  state.projects[idx] = restored;

  // Reset active selections to valid objects from restored project
  const firstMod = restored.modules?.[0] || null;
  state.activeModuleId = firstMod?.id || null;
  state.activeMilestoneId = firstMod?.milestones?.[0]?.id || null;
  reconcileActiveSelection_();

  addActivity(`Restored snapshot: ${snap.name}`);
  saveState();
  renderAll();
}

async function phase6DeleteSelectedSnapshot_(){
  const p = getActiveProject();
  if(!p){ await pmAlertDialog_('Select an active project first.', { title:'Delete Snapshot' }); return; }
  const snap = phase6GetSelectedSnapshot_();
  if(!snap){ await pmAlertDialog_('No snapshot selected.', { title:'Delete Snapshot' }); return; }
  const ok = await pmConfirmDialog_(`Delete snapshot "${snap.name}"?`, { title:'Delete Snapshot', okText:'Delete', danger:true });
  if(!ok) return;
  const snaps = phase6LoadSnapshotsForProject_(p.id).filter(s => s.id !== snap.id);
  phase6SaveSnapshotsForProject_(p.id, snaps);
  addActivity(`Deleted project snapshot: ${snap.name}`);
  phase6RenderSnapshotList_();
}

// boot phase 6 after phase 5 patch is loaded
try{ initPhase6_(); }catch(err){ console.warn('Phase6 init failed', err); }

/* ---------------------------
   Phase 7 Upgrade (Additive Patch)
   - Blueprint templates (project / module / milestone)
   - Auto recurring safe mode (on complete)
   - Dependency-aware scheduling assist (suggest/push due dates)
   - Assignee capacity settings + overload warnings
   - Snapshot compare view
   - Portable Export/Import V2 bundle (state + local phase data)
---------------------------- */

var PHASE7_BLUEPRINT_KEY = 'stark_pm_phase7_blueprints_v1';
var PHASE7_CAPACITY_KEY = 'stark_pm_phase7_capacity_v1';
var PHASE7_CFG_KEY = 'stark_pm_phase7_cfg_v1';
var phase7State_ = {
  inited: false,
  patched: false,
  cfg: {
    autoRecurringOnComplete: false,
    autoRecurringOnlyWhenDueExists: false,
    scheduleGapDays: 1,
    scheduleBaseDays: 1,
    scheduleSeverityWeight: true,
  },
};

function initPhase7_(){
  if(phase7State_.inited) return;
  phase7State_.inited = true;
  phase7LoadCfg_();
  phase7EnsureStyles_();
  phase7PatchFunctions_();
  phase7EnsureTopbarButtons_();
  phase7EnsureBundleImportInput_();
  try{ phase7PostRenderChecklist_(); }catch{}
  try{ phase7PostRenderDashboard_(); }catch{}
  try{ phase7PostRenderProjects_(); }catch{}
}

function phase7LoadCfg_(){
  try{
    const raw = localStorage.getItem(PHASE7_CFG_KEY);
    const x = raw ? JSON.parse(raw) : {};
    if(!x || typeof x !== 'object') return;
    phase7State_.cfg.autoRecurringOnComplete = !!x.autoRecurringOnComplete;
    phase7State_.cfg.autoRecurringOnlyWhenDueExists = !!x.autoRecurringOnlyWhenDueExists;
    const g = Number(x.scheduleGapDays);
    const b = Number(x.scheduleBaseDays);
    phase7State_.cfg.scheduleGapDays = Number.isFinite(g) && g >= 0 ? Math.round(g) : 1;
    phase7State_.cfg.scheduleBaseDays = Number.isFinite(b) && b > 0 ? Math.max(1, Math.round(b)) : 1;
    phase7State_.cfg.scheduleSeverityWeight = x.scheduleSeverityWeight !== false;
  }catch{}
}

function phase7SaveCfg_(){
  try{ localStorage.setItem(PHASE7_CFG_KEY, JSON.stringify(phase7State_.cfg || {})); }catch{}
}

function phase7EnsureStyles_(){
  if(document.querySelector('#phase7Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase7Styles';
  st.textContent = `
    .phase7-box{margin-top:10px;padding-top:10px;border-top:1px solid rgba(255,255,255,.08)}
    .phase7-title{font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.88;margin-bottom:8px}
    .phase7-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .phase7-card{border:1px solid rgba(255,255,255,.08);border-radius:12px;background:rgba(255,255,255,.02);padding:10px}
    .phase7-card .row{margin-top:8px}
    .phase7-card .row:first-child{margin-top:0}
    .phase7-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
    .phase7-kv .badge{justify-self:start}
    .phase7-hint{font-size:12px;opacity:.78}
    .phase7-list{display:flex;flex-direction:column;gap:6px;max-height:220px;overflow:auto}
    .phase7-diff{font-size:12px;line-height:1.35}
    .phase7-diff ul{margin:6px 0 0 18px;padding:0}
    .phase7-diff li{margin:2px 0}
    .phase7-capTable{width:100%;border-collapse:separate;border-spacing:0 6px;font-size:12px}
    .phase7-capTable th{text-align:left;font-size:11px;opacity:.75;padding:0 8px}
    .phase7-capTable td{padding:8px;background:rgba(255,255,255,.01);border-top:1px solid rgba(255,255,255,.06);border-bottom:1px solid rgba(255,255,255,.06)}
    .phase7-capTable td:first-child{border-left:1px solid rgba(255,255,255,.06);border-radius:10px 0 0 10px}
    .phase7-capTable td:last-child{border-right:1px solid rgba(255,255,255,.06);border-radius:0 10px 10px 0}
    .phase7-capInput{width:88px}
    .phase7-mini{font-size:11px;opacity:.75}
    .phase7-toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .phase7-toolbar .btn{padding:6px 10px}
    .phase7-over{border-color:rgba(255,110,110,.25)!important;background:rgba(255,80,80,.03)!important}
    .phase7-ok{border-color:rgba(146,255,176,.18)!important}
    .phase7-schedRow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
    .phase7-schedRow .input,.phase7-schedRow .select{max-width:160px}
    .phase7-path{padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.01);margin-top:8px}
    .phase7-bpGrid{display:grid;grid-template-columns:1fr;gap:8px}
    .phase7-bpSection{border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:8px;background:rgba(255,255,255,.01)}
    .phase7-bpSection .phase7-mini{margin-top:4px}
    .phase7-inline{display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap}
    .phase7-tag{font-size:11px;opacity:.75}
    @media (max-width: 980px){ .phase7-grid{grid-template-columns:1fr} .phase7-kv{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase7PatchFunctions_(){
  if(phase7State_.patched) return;
  phase7State_.patched = true;

  if(typeof renderChecklist === 'function' && !renderChecklist._phase7Wrapped){
    const orig = renderChecklist;
    renderChecklist = function(){
      const out = orig.apply(this, arguments);
      try{ phase7PostRenderChecklist_(); }catch(err){ console.warn('Phase7 checklist render failed', err); }
      return out;
    };
    renderChecklist._phase7Wrapped = true;
  }

  if(typeof renderDashboard === 'function' && !renderDashboard._phase7Wrapped){
    const orig = renderDashboard;
    renderDashboard = function(){
      const out = orig.apply(this, arguments);
      try{ phase7PostRenderDashboard_(); }catch(err){ console.warn('Phase7 dashboard render failed', err); }
      return out;
    };
    renderDashboard._phase7Wrapped = true;
  }

  if(typeof renderProjects === 'function' && !renderProjects._phase7Wrapped){
    const orig = renderProjects;
    renderProjects = function(){
      const out = orig.apply(this, arguments);
      try{ phase7PostRenderProjects_(); }catch(err){ console.warn('Phase7 projects render failed', err); }
      return out;
    };
    renderProjects._phase7Wrapped = true;
  }

  if(typeof phase5HandleKanbanDrop_ === 'function' && !phase5HandleKanbanDrop_._phase7Wrapped){
    const orig = phase5HandleKanbanDrop_;
    phase5HandleKanbanDrop_ = function(m, stage, ev){
      let tid = null, wasDone = null;
      try{ tid = phase5State_?.kanbanDragTaskId || null; }catch{}
      try{ const t0 = Array.isArray(m?.tasks) ? m.tasks.find(x => x && x.id === tid) : null; if(t0) wasDone = !!t0.done; }catch{}
      const out = orig.apply(this, arguments);
      try{
        if(tid && m && Array.isArray(m.tasks)){
          const t = m.tasks.find(x => x && x.id === tid);
          if(t && !wasDone && !!t.done) phase7TryAutoRecurringOnComplete_(m, t, 'kanban');
        }
      }catch(err){ console.warn('Phase7 kanban auto recurring failed', err); }
      return out;
    };
    phase5HandleKanbanDrop_._phase7Wrapped = true;
  }

  if(typeof phase6RenderSnapshotList_ === 'function' && !phase6RenderSnapshotList_._phase7Wrapped){
    const orig = phase6RenderSnapshotList_;
    phase6RenderSnapshotList_ = function(){
      const out = orig.apply(this, arguments);
      try{ phase7RenderSnapshotCompare_(); }catch(err){ console.warn('Phase7 snapshot compare refresh failed', err); }
      return out;
    };
    phase6RenderSnapshotList_._phase7Wrapped = true;
  }

  if(typeof phase3BuildCmdkItems_ === 'function' && !phase3BuildCmdkItems_._phase7Wrapped){
    const orig = phase3BuildCmdkItems_;
    phase3BuildCmdkItems_ = function(){
      const items = orig.apply(this, arguments) || [];
      items.push(
        { kind:'command', title:'Phase 7: Blueprint Templates', sub:'Open Projects tab and focus blueprint panel', tag:'PH7', act:'phase7Blueprints' },
        { kind:'command', title:'Phase 7: Scheduling Assist', sub:'Open Checklist and focus scheduling helper', tag:'PH7', act:'phase7Scheduling' },
        { kind:'command', title:'Phase 7: Capacity Planner', sub:'Open Dashboard capacity panel', tag:'PH7', act:'phase7Capacity' },
        { kind:'command', title:'Phase 7: Export V2 Bundle', sub:'Portable backup with templates/snapshots/capacity', tag:'PH7', act:'phase7ExportV2' }
      );
      return items;
    };
    phase3BuildCmdkItems_._phase7Wrapped = true;
  }

  if(typeof phase3RunCmdkAction_ === 'function' && !phase3RunCmdkAction_._phase7Wrapped){
    const orig = phase3RunCmdkAction_;
    phase3RunCmdkAction_ = function(it){
      if(it && it.act === 'phase7Blueprints'){
        switchTab('projects');
        setTimeout(() => document.querySelector('#phase7BlueprintsBox')?.scrollIntoView({behavior:'smooth', block:'start'}), 10);
        return true;
      }
      if(it && it.act === 'phase7Scheduling'){
        switchTab('checklist');
        setTimeout(() => document.querySelector('#phase7SchedulingAssist')?.scrollIntoView({behavior:'smooth', block:'start'}), 10);
        return true;
      }
      if(it && it.act === 'phase7Capacity'){
        switchTab('dashboard');
        setTimeout(() => document.querySelector('#phase7CapacityPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10);
        return true;
      }
      if(it && it.act === 'phase7ExportV2'){
        phase7ExportV2Bundle_();
        return true;
      }
      return orig.apply(this, arguments);
    };
    phase3RunCmdkAction_._phase7Wrapped = true;
  }
}

function phase7EnsureTopbarButtons_(){
  const topbarRight = document.querySelector('.topbar__right');
  if(!topbarRight) return;
  if(!document.querySelector('#phase7BtnExportV2')){
    const exp = document.createElement('button');
    exp.id = 'phase7BtnExportV2';
    exp.className = 'btn btn--ghost';
    exp.type = 'button';
    exp.textContent = 'Export V2';
    exp.title = 'Portable bundle export (state + snapshots/templates/capacity/blueprints)';
    exp.addEventListener('click', phase7ExportV2Bundle_);
    const anchor = document.querySelector('#btnExportJson') || topbarRight.firstElementChild;
    topbarRight.insertBefore(exp, anchor);
  }
  if(!document.querySelector('#phase7BtnImportV2')){
    const imp = document.createElement('button');
    imp.id = 'phase7BtnImportV2';
    imp.className = 'btn btn--ghost';
    imp.type = 'button';
    imp.textContent = 'Import V2';
    imp.title = 'Import portable V2 bundle';
    imp.addEventListener('click', () => document.querySelector('#phase7BundleInput')?.click());
    const anchor = document.querySelector('#phase7BtnExportV2')?.nextSibling || document.querySelector('#btnExportJson');
    topbarRight.insertBefore(imp, anchor || null);
  }
}

function phase7EnsureBundleImportInput_(){
  if(document.querySelector('#phase7BundleInput')) return;
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.id = 'phase7BundleInput';
  inp.accept = '.json,application/json';
  inp.style.display = 'none';
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0];
    if(!f) return;
    try{
      const text = await f.text();
      phase7ImportV2BundleFromText_(text, f.name || 'bundle.json');
    }catch(err){
      alert('Failed to read bundle file.');
      console.warn('Phase7 import read failed', err);
    }finally{
      inp.value = '';
    }
  });
  document.body.appendChild(inp);
}

function phase7GetChecklistCtx_(){
  if(typeof phase6GetChecklistContext_ === 'function') return phase6GetChecklistContext_();
  if(typeof phase5GetChecklistContext_ === 'function') return phase5GetChecklistContext_();
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  return { p, m };
}

function phase7PostRenderChecklist_(){
  phase7BindChecklistAutoRecurring_();
  phase7EnsureRecurringAutoUi_();
  phase7EnsureSchedulingAssistUi_();
  phase7RenderSchedulingAssist_();
}

function phase7BindChecklistAutoRecurring_(){
  const taskList = document.querySelector('#taskList');
  if(!taskList || taskList.__phase7AutoRecurringBound) return;
  taskList.__phase7AutoRecurringBound = true;
  taskList.addEventListener('click', (e) => {
    const check = e.target && e.target.closest ? e.target.closest('.task__check') : null;
    if(!check) return;
    const taskEl = check.closest('.task');
    const tid = taskEl ? String(taskEl.dataset.taskId || '') : '';
    if(!tid) return;
    setTimeout(() => {
      try{
        const ctx = phase7GetChecklistCtx_();
        const m = ctx && ctx.m;
        if(!m || !Array.isArray(m.tasks)) return;
        const t = m.tasks.find(x => x && x.id === tid);
        if(t && t.done) phase7TryAutoRecurringOnComplete_(m, t, 'list');
      }catch(err){ console.warn('Phase7 list auto recurring failed', err); }
    }, 0);
  }, true);
}

function phase7EnsureRecurringAutoUi_(){
  const host = document.querySelector('#phase5RecurringBox');
  if(!host || document.querySelector('#phase7RecurringAutoBox')) return;
  const box = document.createElement('div');
  box.id = 'phase7RecurringAutoBox';
  box.className = 'phase7-box';
  box.innerHTML = `
    <div class="phase7-title">Auto Recurring Safe Mode</div>
    <div class="phase7-toolbar">
      <label class="phase7-inline"><input type="checkbox" id="phase7AutoRecurringToggle" /> Auto-generate next recurring task when marked done</label>
      <label class="phase7-inline"><input type="checkbox" id="phase7AutoRecurringDueOnly" /> Only if source task has due date</label>
    </div>
    <div class="phase7-hint">Safe mode generates at most once per source task completion. Manual ⟳ generation still works.</div>
  `;
  host.appendChild(box);

  const t1 = box.querySelector('#phase7AutoRecurringToggle');
  const t2 = box.querySelector('#phase7AutoRecurringDueOnly');
  if(t1) t1.checked = !!phase7State_.cfg.autoRecurringOnComplete;
  if(t2) t2.checked = !!phase7State_.cfg.autoRecurringOnlyWhenDueExists;
  t1?.addEventListener('change', () => {
    phase7State_.cfg.autoRecurringOnComplete = !!t1.checked;
    phase7SaveCfg_();
  });
  t2?.addEventListener('change', () => {
    phase7State_.cfg.autoRecurringOnlyWhenDueExists = !!t2.checked;
    phase7SaveCfg_();
  });
}

function phase7TryAutoRecurringOnComplete_(m, t, source){
  if(!phase7State_.cfg.autoRecurringOnComplete) return;
  if(!m || !t) return;
  try{ if(typeof phase5NormalizeTaskMeta_ === 'function') phase5NormalizeTaskMeta_(t); }catch{}
  const every = Number(t.recurrenceDays || 0);
  if(!(every > 0)) return;
  if(phase7State_.cfg.autoRecurringOnlyWhenDueExists && !(Number(t.dueAt || 0) > 0)) return;
  if(!t.done) return;

  // Prevent duplicate auto-generation from repeated renders/toggles.
  if(t.phase7AutoRecurringGeneratedOnce) return;
  t.phase7AutoRecurringGeneratedOnce = true;

  try{
    if(typeof phase5GenerateNextRecurringTask_ === 'function'){
      phase5GenerateNextRecurringTask_(m, t);
      addActivity(`Auto recurring generated (${source || 'done'}): ${t.title}`);
    }
  }catch(err){
    t.phase7AutoRecurringGeneratedOnce = false;
    console.warn('Phase7 auto recurring generate failed', err);
  }
}

function phase7EnsureSchedulingAssistUi_(){
  const taskList = document.querySelector('#taskList');
  if(!taskList || !taskList.parentElement) return;
  let box = document.querySelector('#phase7SchedulingAssist');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase7SchedulingAssist';
    box.className = 'card';
    box.innerHTML = `
      <div class="card__top">
        <div>
          <div class="card__label">Scheduling Assist</div>
          <div class="card__hint">Dependency-aware due date suggestions and downstream push helper (active milestone)</div>
        </div>
        <div class="phase7-toolbar">
          <button class="btn btn--ghost" type="button" id="phase7BtnSchedSuggest">Suggest Missing Due Dates</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnSchedPush">Push Downstream</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnSchedRefresh">Refresh</button>
        </div>
      </div>
      <div class="phase7-schedRow" style="margin:8px 0 6px">
        <label class="phase7-inline">Gap days <input class="input" id="phase7SchedGap" type="number" min="0" step="1" /></label>
        <label class="phase7-inline">Base days/task <input class="input" id="phase7SchedBase" type="number" min="1" step="1" /></label>
        <label class="phase7-inline"><input type="checkbox" id="phase7SchedWeight" /> Severity weighted duration</label>
      </div>
      <div id="phase7SchedSummary" class="phase7-hint">No analysis yet.</div>
      <div id="phase7SchedPath" class="phase7-path phase7-diff"></div>
    `;
    taskList.parentElement.insertBefore(box, taskList);

    box.querySelector('#phase7BtnSchedRefresh')?.addEventListener('click', phase7RenderSchedulingAssist_);
    box.querySelector('#phase7BtnSchedSuggest')?.addEventListener('click', phase7ApplySuggestedDueDates_);
    box.querySelector('#phase7BtnSchedPush')?.addEventListener('click', phase7PushDownstreamDueDates_);

    const gapEl = box.querySelector('#phase7SchedGap');
    const baseEl = box.querySelector('#phase7SchedBase');
    const wEl = box.querySelector('#phase7SchedWeight');
    if(gapEl) gapEl.value = String(phase7State_.cfg.scheduleGapDays || 1);
    if(baseEl) baseEl.value = String(phase7State_.cfg.scheduleBaseDays || 1);
    if(wEl) wEl.checked = !!phase7State_.cfg.scheduleSeverityWeight;
    gapEl?.addEventListener('change', () => {
      const n = Number(gapEl.value || 0);
      phase7State_.cfg.scheduleGapDays = Number.isFinite(n) && n >= 0 ? Math.round(n) : 1;
      phase7SaveCfg_();
      phase7RenderSchedulingAssist_();
    });
    baseEl?.addEventListener('change', () => {
      const n = Number(baseEl.value || 1);
      phase7State_.cfg.scheduleBaseDays = Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n)) : 1;
      phase7SaveCfg_();
      phase7RenderSchedulingAssist_();
    });
    wEl?.addEventListener('change', () => {
      phase7State_.cfg.scheduleSeverityWeight = !!wEl.checked;
      phase7SaveCfg_();
      phase7RenderSchedulingAssist_();
    });
  }
}

function phase7TaskDurationDays_(t){
  const base = Math.max(1, Math.round(Number(phase7State_.cfg.scheduleBaseDays || 1)));
  if(!phase7State_.cfg.scheduleSeverityWeight) return base;
  const sev = String(t?.severity || 'normal');
  if(sev === 'blocker') return base + 2;
  if(sev === 'high') return base + 1;
  return base;
}

function phase7AnalyzeMilestoneSchedule_(m){
  const graph = (typeof phase6BuildMilestoneGraph_ === 'function') ? phase6BuildMilestoneGraph_(m) : null;
  const tasks = Array.isArray(m?.tasks) ? m.tasks : [];
  const byId = graph?.byId || new Map(tasks.map(t => [t.id, t]));
  const depMemo = new Map();
  const stack = new Set();
  const gapDays = Math.max(0, Math.round(Number(phase7State_.cfg.scheduleGapDays || 0)));
  const dayMs = 86400000;
  const today = (typeof phase4TodayStart_ === 'function') ? phase4TodayStart_() : (() => { const d = new Date(); d.setHours(0,0,0,0); return d.getTime(); })();
  const baseStart = today + 12 * 3600 * 1000;

  function normDue(ts){
    const n = Number(ts || 0);
    if(!(n > 0)) return 0;
    const d = new Date(n); d.setHours(12,0,0,0); return d.getTime();
  }

  function plannedDue(id){
    if(depMemo.has(id)) return depMemo.get(id);
    if(stack.has(id)) return baseStart; // cycle fallback
    stack.add(id);
    const t = byId.get(id);
    if(!t){ stack.delete(id); return baseStart; }
    const deps = Array.isArray(t.blockedBy) ? t.blockedBy : [];
    let earliest = baseStart;
    for(const depIdRaw of deps){
      const depId = String(depIdRaw || '');
      const dep = byId.get(depId);
      if(!dep) continue;
      const depDue = Math.max(normDue(dep.dueAt), plannedDue(depId));
      earliest = Math.max(earliest, depDue + gapDays * dayMs);
    }
    const dur = phase7TaskDurationDays_(t);
    const result = earliest + Math.max(0, dur - 1) * dayMs;
    depMemo.set(id, result);
    stack.delete(id);
    return result;
  }

  const plan = [];
  for(const t of tasks){
    if(!t) continue;
    const suggestedDue = plannedDue(t.id);
    const existingDue = normDue(t.dueAt);
    const deps = Array.isArray(t.blockedBy) ? t.blockedBy : [];
    let minAllowedDue = baseStart;
    for(const depIdRaw of deps){
      const dep = byId.get(String(depIdRaw || ''));
      if(!dep) continue;
      const depDue = Math.max(normDue(dep.dueAt), depMemo.get(dep.id) || baseStart);
      minAllowedDue = Math.max(minAllowedDue, depDue + gapDays * dayMs);
    }
    plan.push({
      task: t,
      suggestedDue,
      existingDue,
      minAllowedDue,
      missingDue: !(existingDue > 0),
      needsPush: !!existingDue && existingDue < minAllowedDue && !t.done,
      durationDays: phase7TaskDurationDays_(t),
    });
  }

  const longest = plan
    .filter(x => !x.task.done)
    .sort((a,b) => (b.suggestedDue - a.suggestedDue) || ((Array.isArray(b.task.blockedBy)?b.task.blockedBy.length:0) - (Array.isArray(a.task.blockedBy)?a.task.blockedBy.length:0)))[0] || null;

  const chain = [];
  if(longest){
    let cur = longest.task;
    const seen = new Set();
    while(cur && !seen.has(cur.id)){
      seen.add(cur.id);
      chain.push(cur);
      const deps = Array.isArray(cur.blockedBy) ? cur.blockedBy : [];
      let next = null;
      let best = -Infinity;
      for(const depId of deps){
        const d = byId.get(String(depId || ''));
        if(!d) continue;
        const score = Number(depMemo.get(d.id) || 0);
        if(score > best){ best = score; next = d; }
      }
      cur = next;
    }
  }

  return {
    graph,
    plan,
    missingCount: plan.filter(x => x.missingDue && !x.task.done).length,
    pushCount: plan.filter(x => x.needsPush).length,
    overdueOpen: plan.filter(x => !x.task.done && typeof phase4IsOverdue_ === 'function' && phase4IsOverdue_(x.task)).length,
    longest,
    chain,
  };
}

function phase7RenderSchedulingAssist_(){
  const out = document.querySelector('#phase7SchedSummary');
  const path = document.querySelector('#phase7SchedPath');
  if(!out || !path) return;
  const ctx = phase7GetChecklistCtx_();
  const p = ctx && ctx.p;
  const m = ctx && ctx.m;
  if(!p || !m){
    out.textContent = 'Select a project and milestone to analyze scheduling.';
    path.innerHTML = '<div class="phase7-mini">No active milestone.</div>';
    return;
  }
  const a = phase7AnalyzeMilestoneSchedule_(m);
  const total = Array.isArray(m.tasks) ? m.tasks.length : 0;
  const open = (m.tasks || []).filter(t => !t.done).length;
  const cycles = Number(a.graph?.cycleEdges?.length || 0);
  out.innerHTML = `Open ${open}/${total} • Missing due: <b>${a.missingCount}</b> • Needs downstream push: <b>${a.pushCount}</b> • Overdue open: <b>${a.overdueOpen}</b>${cycles ? ` • <span class="badge badge--warn">Cycles: ${cycles}</span>` : ''}`;

  const topList = a.plan
    .filter(x => (x.missingDue || x.needsPush) && !x.task.done)
    .sort((u,v) => (Number(v.needsPush)-Number(u.needsPush)) || ((Array.isArray(v.task.blockedBy)?v.task.blockedBy.length:0) - (Array.isArray(u.task.blockedBy)?u.task.blockedBy.length:0)))
    .slice(0, 6);

  path.innerHTML = `
    <div><b>Critical path (heuristic):</b> ${a.chain.length ? a.chain.map(t => escapeHtml(t.title)).join(' → ') : '—'}</div>
    <div class="phase7-mini" style="margin-top:4px">Gap=${phase7State_.cfg.scheduleGapDays}d • Base=${phase7State_.cfg.scheduleBaseDays}d/task${phase7State_.cfg.scheduleSeverityWeight ? ' • severity weighted' : ''}</div>
    <div style="margin-top:6px"><b>Top scheduling fixes</b></div>
    <ul>${topList.length ? topList.map(x => `<li>${escapeHtml(x.task.title)} — ${x.needsPush ? `push to ≥ ${escapeHtml((typeof phase4FmtDate_==='function'?phase4FmtDate_(x.minAllowedDue):phase5FmtDateISO_(x.minAllowedDue)))}` : `suggest ${escapeHtml((typeof phase4FmtDate_==='function'?phase4FmtDate_(x.suggestedDue):phase5FmtDateISO_(x.suggestedDue)))}`}</li>`).join('') : '<li>No urgent scheduling fixes detected.</li>'}</ul>
  `;
}

function phase7ApplySuggestedDueDates_(){
  const ctx = phase7GetChecklistCtx_();
  const m = ctx && ctx.m;
  if(!m){ alert('Select a milestone first.'); return; }
  const a = phase7AnalyzeMilestoneSchedule_(m);
  let changed = 0;
  for(const x of a.plan){
    if(x.task.done) continue;
    if(!x.missingDue){ continue; }
    x.task.dueAt = Number(x.suggestedDue || 0) || x.task.dueAt;
    if(x.task.dueAt) changed++;
  }
  if(!changed){ alert('No missing due dates to suggest right now.'); return; }
  addActivity(`Scheduling assist: applied ${changed} due date suggestion(s)`);
  saveState();
  renderAll();
}

function phase7PushDownstreamDueDates_(){
  const ctx = phase7GetChecklistCtx_();
  const m = ctx && ctx.m;
  if(!m){ alert('Select a milestone first.'); return; }
  const a = phase7AnalyzeMilestoneSchedule_(m);
  let changed = 0;
  for(const x of a.plan){
    if(x.task.done) continue;
    if(!x.needsPush) continue;
    x.task.dueAt = Number(x.minAllowedDue || x.task.dueAt || 0) || x.task.dueAt;
    changed++;
  }
  if(!changed){ alert('No downstream due dates need pushing.'); return; }
  addActivity(`Scheduling assist: pushed ${changed} downstream due date(s)`);
  saveState();
  renderAll();
}

function phase7PostRenderDashboard_(){
  phase7EnsureCapacityPanel_();
  phase7RenderCapacityPanel_();
}

function phase7LoadCapacities_(){
  try{
    const raw = localStorage.getItem(PHASE7_CAPACITY_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return (obj && typeof obj === 'object') ? obj : {};
  }catch{ return {}; }
}

function phase7SaveCapacities_(obj){
  try{ localStorage.setItem(PHASE7_CAPACITY_KEY, JSON.stringify(obj || {})); }catch{}
}

function phase7CapacityKey_(name){
  return String(name || '').trim().toLowerCase();
}

function phase7GetAssigneeCapacity_(name){
  const caps = phase7LoadCapacities_();
  const key = phase7CapacityKey_(name);
  const n = Number(caps[key]);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
}

function phase7SetAssigneeCapacity_(name, cap){
  const caps = phase7LoadCapacities_();
  const key = phase7CapacityKey_(name);
  if(!key) return;
  const n = Number(cap);
  if(Number.isFinite(n) && n > 0) caps[key] = Math.round(n);
  else delete caps[key];
  phase7SaveCapacities_(caps);
}

function phase7EnsureCapacityPanel_(){
  const host = document.querySelector('#phase6DashWorkload') || document.querySelector('#tab-dashboard .grid.grid--2');
  if(!host) return;
  if(document.querySelector('#phase7CapacityPanel')) return;
  const panel = document.createElement('div');
  panel.id = 'phase7CapacityPanel';
  panel.className = 'card phase6-dashPanel';
  panel.innerHTML = `
    <div class="card__top">
      <div>
        <div class="card__label">Assignee Capacity</div>
        <div class="card__hint">Set weekly capacity targets and watch overload risk based on upcoming/overdue work.</div>
      </div>
      <div class="phase7-toolbar">
        <button class="btn btn--ghost" type="button" id="phase7BtnCapRefresh">Refresh</button>
      </div>
    </div>
    <div class="phase7-hint" id="phase7CapSummary"></div>
    <div style="overflow:auto"><table class="phase7-capTable" id="phase7CapTable"></table></div>
  `;
  if(host.id === 'phase6DashWorkload') host.insertAdjacentElement('afterend', panel);
  else host.appendChild(panel);
  panel.querySelector('#phase7BtnCapRefresh')?.addEventListener('click', () => phase7RenderCapacityPanel_());
}

function phase7CollectCapacityRows_(){
  const scope = String(document.querySelector('#phase6WorkloadScope')?.value || 'project');
  const rows = (typeof phase6CollectTasksForWorkload_ === 'function') ? phase6CollectTasksForWorkload_(scope) : [];
  const map = new Map();
  for(const r of rows){
    const t = r.t;
    const name = String(t.assignee || '').trim() || 'Unassigned';
    if(!map.has(name)) map.set(name, { name, open:0, overdue:0, due7:0, blocked:0, blocker:0, high:0, done:0, score:0 });
    const a = map.get(name);
    if(t.done) a.done++; else a.open++;
    if(!t.done && typeof phase4IsOverdue_ === 'function' && phase4IsOverdue_(t)) a.overdue++;
    if(!t.done && typeof phase4IsDueInNextDays_ === 'function' && phase4IsDueInNextDays_(t, 7)) a.due7++;
    if(!t.done && typeof phase4GetUnresolvedBlockers_ === 'function'){
      try{ if(phase4GetUnresolvedBlockers_(r.ms, t).length) a.blocked++; }catch{}
    }
    if(t.severity === 'blocker') a.blocker++;
    if(t.severity === 'high') a.high++;
  }
  const list = Array.from(map.values());
  list.forEach(a => { a.score = a.overdue*3 + a.due7*2 + a.blocked + a.blocker; });
  list.sort((x,y) => (y.score-x.score) || (y.open-x.open) || x.name.localeCompare(y.name));
  return list;
}

function phase7RenderCapacityPanel_(){
  const table = document.querySelector('#phase7CapTable');
  const sum = document.querySelector('#phase7CapSummary');
  if(!table) return;
  const list = phase7CollectCapacityRows_();
  if(!list.length){
    if(sum) sum.textContent = 'No assignee tasks found in current scope.';
    table.innerHTML = '<tr><td class="hint">No tasks yet.</td></tr>';
    return;
  }
  let overCount = 0;
  table.innerHTML = `
    <thead><tr>
      <th>Assignee</th><th>Load Score</th><th>Due7</th><th>Overdue</th><th>Blocked</th><th>Capacity/wk</th><th>Status</th>
    </tr></thead>
    <tbody>
      ${list.map(a => {
        const cap = phase7GetAssigneeCapacity_(a.name);
        const over = cap > 0 ? (a.score > cap) : false;
        if(over) overCount++;
        return `
          <tr class="${over ? 'phase7-over' : 'phase7-ok'}" data-assignee="${escapeHtml(a.name)}">
            <td>${escapeHtml(a.name)}</td>
            <td><b>${a.score}</b> <span class="phase7-mini">(open ${a.open})</span></td>
            <td>${a.due7}</td>
            <td>${a.overdue ? `<span class="badge badge--warn">${a.overdue}</span>` : a.overdue}</td>
            <td>${a.blocked}</td>
            <td><input class="input phase7-capInput" type="number" min="0" step="1" value="${cap || ''}" data-cap="${escapeHtml(a.name)}" placeholder="none" /></td>
            <td>${cap > 0 ? (over ? `<span class="badge badge--warn">Over +${a.score-cap}</span>` : `<span class="badge">OK (${cap-a.score} spare)</span>`) : `<span class="phase7-mini">No cap</span>`}</td>
          </tr>
        `;
      }).join('')}
    </tbody>
  `;
  if(sum) sum.innerHTML = `Scope: <b>${escapeHtml(String(document.querySelector('#phase6WorkloadScope')?.value || 'project').toUpperCase())}</b> • Assignees: <b>${list.length}</b> • Over capacity: <b>${overCount}</b>`;
  Array.from(table.querySelectorAll('input[data-cap]')).forEach(inp => {
    inp.addEventListener('change', () => {
      const name = String(inp.getAttribute('data-cap') || '');
      phase7SetAssigneeCapacity_(name, Number(inp.value || 0));
      phase7RenderCapacityPanel_();
    });
  });
}

function phase7PostRenderProjects_(){
  phase7EnsureBlueprintsUi_();
  phase7RenderBlueprintsUi_();
  phase7EnsureSnapshotCompareUi_();
  phase7RenderSnapshotCompare_();
}

function phase7LoadBlueprints_(){
  try{
    const raw = localStorage.getItem(PHASE7_BLUEPRINT_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    if(!Array.isArray(arr)) return [];
    return arr.filter(x => x && typeof x === 'object').map(phase7SanitizeBlueprint_);
  }catch{ return []; }
}

function phase7SaveBlueprints_(arr){
  try{ localStorage.setItem(PHASE7_BLUEPRINT_KEY, JSON.stringify((arr || []).map(phase7SanitizeBlueprint_).slice(0, 120))); }catch{}
}

function phase7SanitizeBlueprint_(b){
  const type = (b?.type === 'project' || b?.type === 'module' || b?.type === 'milestone') ? b.type : 'project';
  return {
    id: String(b?.id || uid()),
    type,
    name: String(b?.name || `${type} blueprint`).trim() || `${type} blueprint`,
    ts: Number(b?.ts || Date.now()),
    note: String(b?.note || ''),
    payload: b?.payload || null,
  };
}

function phase7BlueprintSections_(){
  return {
    project: phase7LoadBlueprints_().filter(x => x.type === 'project').sort((a,b) => b.ts - a.ts),
    module: phase7LoadBlueprints_().filter(x => x.type === 'module').sort((a,b) => b.ts - a.ts),
    milestone: phase7LoadBlueprints_().filter(x => x.type === 'milestone').sort((a,b) => b.ts - a.ts),
  };
}

function phase7EnsureBlueprintsUi_(){
  const formCard = document.querySelector('#tab-projects .grid.grid--2 > .card:nth-child(2)');
  if(!formCard || document.querySelector('#phase7BlueprintsBox')) return;
  const box = document.createElement('div');
  box.id = 'phase7BlueprintsBox';
  box.className = 'phase7-box';
  box.innerHTML = `
    <div class="phase7-title">Blueprint Templates</div>
    <div class="phase7-hint">Save reusable project/module/milestone structures and apply fresh copies with regenerated IDs.</div>
    <div class="phase7-bpGrid" style="margin-top:8px">
      <div class="phase7-bpSection">
        <div class="phase7-inline"><b>Project Blueprints</b><span class="phase7-tag">create full project structures</span></div>
        <div class="row row--actions" style="margin-top:6px">
          <button class="btn btn--ghost" type="button" id="phase7BtnSaveProjectBp">Save Active Project</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnApplyProjectBp">Create Project from Selected</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnDeleteProjectBp">Delete Selected</button>
        </div>
        <select class="select" id="phase7ProjectBpSelect" style="margin-top:6px"></select>
      </div>
      <div class="phase7-bpSection">
        <div class="phase7-inline"><b>Module Blueprints</b><span class="phase7-tag">apply into active project</span></div>
        <div class="row row--actions" style="margin-top:6px">
          <button class="btn btn--ghost" type="button" id="phase7BtnSaveModuleBp">Save Active Module</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnApplyModuleBp">Add Module from Selected</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnDeleteModuleBp">Delete Selected</button>
        </div>
        <select class="select" id="phase7ModuleBpSelect" style="margin-top:6px"></select>
      </div>
      <div class="phase7-bpSection">
        <div class="phase7-inline"><b>Milestone Blueprints</b><span class="phase7-tag">apply into active module</span></div>
        <div class="row row--actions" style="margin-top:6px">
          <button class="btn btn--ghost" type="button" id="phase7BtnSaveMilestoneBp">Save Active Milestone</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnApplyMilestoneBp">Add Milestone from Selected</button>
          <button class="btn btn--ghost" type="button" id="phase7BtnDeleteMilestoneBp">Delete Selected</button>
        </div>
        <select class="select" id="phase7MilestoneBpSelect" style="margin-top:6px"></select>
      </div>
    </div>
  `;
  formCard.appendChild(box);

  box.querySelector('#phase7BtnSaveProjectBp')?.addEventListener('click', () => phase7SaveBlueprintFromActive_('project'));
  box.querySelector('#phase7BtnSaveModuleBp')?.addEventListener('click', () => phase7SaveBlueprintFromActive_('module'));
  box.querySelector('#phase7BtnSaveMilestoneBp')?.addEventListener('click', () => phase7SaveBlueprintFromActive_('milestone'));
  box.querySelector('#phase7BtnApplyProjectBp')?.addEventListener('click', () => phase7ApplySelectedBlueprint_('project'));
  box.querySelector('#phase7BtnApplyModuleBp')?.addEventListener('click', () => phase7ApplySelectedBlueprint_('module'));
  box.querySelector('#phase7BtnApplyMilestoneBp')?.addEventListener('click', () => phase7ApplySelectedBlueprint_('milestone'));
  box.querySelector('#phase7BtnDeleteProjectBp')?.addEventListener('click', () => phase7DeleteSelectedBlueprint_('project'));
  box.querySelector('#phase7BtnDeleteModuleBp')?.addEventListener('click', () => phase7DeleteSelectedBlueprint_('module'));
  box.querySelector('#phase7BtnDeleteMilestoneBp')?.addEventListener('click', () => phase7DeleteSelectedBlueprint_('milestone'));
}

function phase7RenderBlueprintsUi_(){
  const secs = phase7BlueprintSections_();
  phase7FillBlueprintSelect_('#phase7ProjectBpSelect', secs.project, '— Select project blueprint —');
  phase7FillBlueprintSelect_('#phase7ModuleBpSelect', secs.module, '— Select module blueprint —');
  phase7FillBlueprintSelect_('#phase7MilestoneBpSelect', secs.milestone, '— Select milestone blueprint —');
}

function phase7FillBlueprintSelect_(selQuery, arr, placeholder){
  const sel = document.querySelector(selQuery);
  if(!sel) return;
  const prev = sel.value;
  sel.innerHTML = `<option value="">${placeholder}</option>` + (arr || []).map(b => {
    let meta = '';
    try{
      if(b.type === 'project') meta = `${(b.payload?.modules||[]).length} module(s)`;
      if(b.type === 'module') meta = `${(b.payload?.milestones||[]).length} milestone(s)`;
      if(b.type === 'milestone') meta = `${(b.payload?.tasks||[]).length} task(s)`;
    }catch{}
    return `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name)}${meta ? ` • ${escapeHtml(meta)}` : ''}</option>`;
  }).join('');
  if((arr || []).some(b => b.id === prev)) sel.value = prev;
}

async function phase7SaveBlueprintFromActive_(type){
  let payload = null;
  let defaultName = '';
  if(type === 'project'){
    const p = getActiveProject(); if(!p){ alert('Select an active project first.'); return; }
    try{ if(typeof phase5ApplyProjectSettingsFromUi_ === 'function') phase5ApplyProjectSettingsFromUi_(p); }catch{}
    payload = JSON.parse(JSON.stringify(p));
    defaultName = `${p.name} Blueprint`;
  } else if(type === 'module'){
    const p = getActiveProject(); const mod = p ? getActiveModule(p) : null;
    if(!mod){ alert('Select an active module first.'); return; }
    payload = JSON.parse(JSON.stringify(mod));
    defaultName = `${mod.name} Blueprint`;
  } else {
    const p = getActiveProject(); const ms = p ? getActiveMilestone(p) : null;
    if(!ms){ alert('Select an active milestone first.'); return; }
    payload = JSON.parse(JSON.stringify(ms));
    defaultName = `${ms.title} Blueprint`;
  }
  const name = await pmPromptDialog_('Blueprint name?', defaultName, { title:'Save Blueprint', placeholder:'Blueprint name' });
  if(name === null) return;
  const trimmed = String(name || '').trim() || defaultName;
  const note = (await pmPromptDialog_('Optional note / usage hint?', '', { title:'Save Blueprint', placeholder:'Optional note (optional)' })) || '';
  const arr = phase7LoadBlueprints_();
  const existing = arr.find(x => x.type === type && x.name.toLowerCase() === trimmed.toLowerCase());
  const bp = phase7SanitizeBlueprint_({ id: existing?.id || uid(), type, name: trimmed, note, ts: Date.now(), payload });
  if(existing){
    const okReplace = await pmConfirmDialog_(`Replace existing ${type} blueprint "${trimmed}"?`, { title:'Replace Blueprint', okText:'Replace', danger:true });
    if(!okReplace) return;
    const idx = arr.findIndex(x => x.id === existing.id);
    if(idx >= 0) arr[idx] = bp;
  } else arr.unshift(bp);
  phase7SaveBlueprints_(arr);
  phase7RenderBlueprintsUi_();
  addActivity(`Saved ${type} blueprint: ${trimmed}`);
}

function phase7GetSelectedBlueprint_(type){
  const selMap = { project:'#phase7ProjectBpSelect', module:'#phase7ModuleBpSelect', milestone:'#phase7MilestoneBpSelect' };
  const id = String(document.querySelector(selMap[type])?.value || '');
  if(!id) return null;
  return phase7LoadBlueprints_().find(x => x.id === id && x.type === type) || null;
}

async function phase7DeleteSelectedBlueprint_(type){
  const bp = phase7GetSelectedBlueprint_(type);
  if(!bp){ alert('Select a blueprint first.'); return; }
  const okDelete = await pmConfirmDialog_(`Delete ${type} blueprint "${bp.name}"?`, { title:'Delete Blueprint', okText:'Delete', danger:true });
  if(!okDelete) return;
  phase7SaveBlueprints_(phase7LoadBlueprints_().filter(x => x.id !== bp.id));
  phase7RenderBlueprintsUi_();
  addActivity(`Deleted ${type} blueprint: ${bp.name}`);
}

function phase7CloneSteps_(steps, resetDone){
  return (Array.isArray(steps) ? steps : []).map(s => ({
    id: uid(),
    text: String(s?.text || ''),
    done: resetDone ? false : !!s?.done,
    children: phase7CloneSteps_(Array.isArray(s?.children) ? s.children : [], resetDone),
  }));
}

function phase7CloneTaskFresh_(t, opts){
  const resetDone = opts?.resetDone !== false;
  const src = (t && typeof t === 'object') ? t : {};
  const out = {
    id: uid(),
    title: String(src.title || 'Untitled Task'),
    done: resetDone ? false : !!src.done,
    severity: (src.severity === 'high' || src.severity === 'blocker') ? src.severity : 'normal',
    assignee: String(src.assignee || ''),
    createdAt: Date.now(),
    steps: phase7CloneSteps_(src.steps, resetDone),
  };

  // Preserve Phase 4 / 5 metadata (dependency + due + kanban + recurrence).
  out.blockedBy = Array.isArray(src.blockedBy) ? src.blockedBy.map(x => String(x || '')).filter(Boolean) : [];
  out.blockerNote = String(src.blockerNote || '');
  const dueN = Number(src.dueAt || 0);
  out.dueAt = Number.isFinite(dueN) && dueN > 0 ? dueN : null;

  const stage = String(src.kanbanStage || '');
  out.kanbanStage = resetDone ? 'todo' : (stage === 'doing' || stage === 'done' ? stage : 'todo');

  const recN = Number(src.recurrenceDays || 0);
  out.recurrenceDays = Number.isFinite(recN) && recN > 0 ? Math.max(1, Math.round(recN)) : 0;
  out.recurrenceTemplate = String(src.recurrenceTemplate || '');
  out.lastRecurringGeneratedAt = null;

  if(typeof phase4NormalizeTaskMeta_ === 'function'){
    try{ phase4NormalizeTaskMeta_(out); }catch{}
  }
  if(typeof phase5NormalizeTaskMeta_ === 'function'){
    try{ phase5NormalizeTaskMeta_(out); }catch{}
  }
  out.done = resetDone ? false : !!out.done;
  if(resetDone) out.phase7AutoRecurringGeneratedOnce = false;
  return out;
}

function phase7CloneMilestoneFresh_(ms, opts){
  const src = (ms && typeof ms === 'object') ? ms : {};
  const out = {
    id: uid(),
    title: String(src.title || 'Milestone'),
    notes: String(src.notes || ''),
    priority: (src.priority === 'p1' || src.priority === 'p3') ? src.priority : 'p2',
    state: (opts?.resetDone !== false) ? 'todo' : ((src.state === 'doing' || src.state === 'done') ? src.state : 'todo'),
    createdAt: Date.now(),
    tasks: [],
  };
  const rawTasks = Array.isArray(src.tasks) ? src.tasks : [];
  const taskIdMap = new Map();
  for(const t of rawTasks){
    const c = phase7CloneTaskFresh_(t, opts);
    out.tasks.push(c);
    taskIdMap.set(String(t?.id || ''), c.id);
  }
  // Remap blocker refs to cloned task ids inside same milestone.
  for(let i=0;i<out.tasks.length;i++){
    const srcTask = rawTasks[i];
    const cloneTask = out.tasks[i];
    const refs = Array.isArray(srcTask?.blockedBy) ? srcTask.blockedBy : [];
    const next = [];
    const seen = new Set();
    for(const oldId of refs){
      const mapped = taskIdMap.get(String(oldId || ''));
      if(!mapped || mapped === cloneTask.id || seen.has(mapped)) continue;
      seen.add(mapped);
      next.push(mapped);
    }
    cloneTask.blockedBy = next;
    if(typeof phase4NormalizeTaskMeta_ === 'function'){
      try{ phase4NormalizeTaskMeta_(cloneTask); }catch{}
    }
    if(typeof phase5NormalizeTaskMeta_ === 'function'){
      try{ phase5NormalizeTaskMeta_(cloneTask); }catch{}
    }
  }
  return out;
}

function phase7CloneModuleFresh_(mod, opts){
  const src = (mod && typeof mod === 'object') ? mod : {};
  return {
    id: uid(),
    name: String(src.name || 'Module'),
    desc: String(src.desc || ''),
    status: (opts?.resetDone !== false) ? 'todo' : String(src.status || 'todo'),
    tag: String(src.tag || ''),
    createdAt: Date.now(),
    milestones: (Array.isArray(src.milestones) ? src.milestones : []).map(ms => phase7CloneMilestoneFresh_(ms, opts)),
  };
}

function phase7CloneProjectFresh_(p, opts){
  const src = (p && typeof p === 'object') ? p : {};
  return {
    id: uid(),
    name: String(src.name || 'Project'),
    desc: String(src.desc || ''),
    status: (opts?.resetDone !== false) ? 'active' : String(src.status || 'active'),
    tag: String(src.tag || ''),
    archived: false,
    createdAt: Date.now(),
    settings: src.settings ? JSON.parse(JSON.stringify(src.settings)) : undefined,
    modules: (Array.isArray(src.modules) ? src.modules : []).map(mod => phase7CloneModuleFresh_(mod, opts)),
  };
}

async function phase7ApplySelectedBlueprint_(type){
  const bp = phase7GetSelectedBlueprint_(type);
  if(!bp){ alert('Select a blueprint first.'); return; }
  const resetDone = await pmConfirmDialog_('Apply as a fresh blueprint instance with progress reset?\n\nOK = reset done states (recommended)\nCancel = keep current task done states from blueprint', { title:'Apply Blueprint', okText:'Reset Progress' });
  const opts = { resetDone };

  if(type === 'project'){
    const p = phase7CloneProjectFresh_(bp.payload || {}, opts);
    const nextProjectName = await pmPromptDialog_('New project name?', p.name.replace(/\s*Blueprint$/i,''), { title:'Apply Project Blueprint', placeholder:'Project name' });
    p.name = nextProjectName || p.name;
    state.projects.unshift(p);
    setActiveProject(p.id);
    addActivity(`Applied project blueprint: ${bp.name}`);
    saveState();
    renderAll();
    return;
  }

  if(type === 'module'){
    const p = getActiveProject();
    if(!p){ alert('Select an active project first.'); return; }
    const mod = phase7CloneModuleFresh_(bp.payload || {}, opts);
    p.modules = Array.isArray(p.modules) ? p.modules : [];
    p.modules.push(mod);
    state.activeModuleId = mod.id;
    state.activeMilestoneId = mod.milestones?.[0]?.id || null;
    addActivity(`Applied module blueprint: ${bp.name}`);
    saveState();
    renderAll();
    return;
  }

  const p = getActiveProject();
  const mod = p ? getActiveModule(p) : null;
  if(!mod){ alert('Select an active module first.'); return; }
  const ms = phase7CloneMilestoneFresh_(bp.payload || {}, opts);
  mod.milestones = Array.isArray(mod.milestones) ? mod.milestones : [];
  mod.milestones.push(ms);
  state.activeMilestoneId = ms.id;
  addActivity(`Applied milestone blueprint: ${bp.name}`);
  saveState();
  renderAll();
}

function phase7EnsureSnapshotCompareUi_(){
  const snapBox = document.querySelector('#phase6ProjectSnapshots');
  if(!snapBox || document.querySelector('#phase7SnapshotCompareBox')) return;
  const box = document.createElement('div');
  box.id = 'phase7SnapshotCompareBox';
  box.className = 'phase7-box';
  box.innerHTML = `
    <div class="phase7-title">Snapshot Compare</div>
    <div class="phase7-toolbar">
      <button class="btn btn--ghost" type="button" id="phase7BtnCompareSnapActive">Compare Selected ↔ Active</button>
      <button class="btn btn--ghost" type="button" id="phase7BtnCompareSnapLatest2">Compare Latest 2</button>
      <button class="btn btn--ghost" type="button" id="phase7BtnCompareSnapRefresh">Refresh</button>
    </div>
    <div class="phase7-diff" id="phase7SnapshotCompareOut">Select a snapshot to compare.</div>
  `;
  snapBox.appendChild(box);
  box.querySelector('#phase7BtnCompareSnapActive')?.addEventListener('click', () => phase7RenderSnapshotCompare_('active'));
  box.querySelector('#phase7BtnCompareSnapLatest2')?.addEventListener('click', () => phase7RenderSnapshotCompare_('latest2'));
  box.querySelector('#phase7BtnCompareSnapRefresh')?.addEventListener('click', () => phase7RenderSnapshotCompare_());
}

function phase7FlattenProjectTaskMap_(p){
  const map = new Map();
  const byPath = new Map();
  for(const mod of (p?.modules || [])){
    for(const ms of (mod?.milestones || [])){
      for(const t of (ms?.tasks || [])){
        const rec = {
          id: String(t?.id || ''),
          title: String(t?.title || ''),
          path: `${String(mod?.name||'')}>${String(ms?.title||'')}>${String(t?.title||'')}`,
          done: !!t?.done,
          severity: String(t?.severity || 'normal'),
          assignee: String(t?.assignee || ''),
          dueAt: Number(t?.dueAt || 0),
          deps: Array.isArray(t?.blockedBy) ? t.blockedBy.length : 0,
          steps: countSteps_(Array.isArray(t?.steps) ? t.steps : []).total,
        };
        if(rec.id) map.set(rec.id, rec);
        byPath.set(rec.path, rec);
      }
    }
  }
  return { map, byPath };
}

function phase7CompareProjects_(left, right){
  const a = sanitizeProject(left || {});
  const b = sanitizeProject(right || {});
  const ca = (typeof phase6CountProjectTotals_ === 'function') ? phase6CountProjectTotals_(a) : { modules:(a.modules||[]).length, milestones:0, tasks:0, done:0 };
  const cb = (typeof phase6CountProjectTotals_ === 'function') ? phase6CountProjectTotals_(b) : { modules:(b.modules||[]).length, milestones:0, tasks:0, done:0 };

  const fa = phase7FlattenProjectTaskMap_(a);
  const fb = phase7FlattenProjectTaskMap_(b);
  const usedB = new Set();
  let added=0, removed=0, changed=0;
  const changes = [];

  for(const [id, ta] of fa.map.entries()){
    let tb = fb.map.get(id) || null;
    let matchedByPath = false;
    if(!tb){ tb = fb.byPath.get(ta.path) || null; matchedByPath = !!tb; }
    if(!tb){ removed++; if(changes.length < 8) changes.push(`Removed: ${ta.title} (${ta.path})`); continue; }
    if(tb.id) usedB.add(tb.id);
    const delta = [];
    if(ta.done !== tb.done) delta.push(`done ${ta.done?'✓':'○'}→${tb.done?'✓':'○'}`);
    if(ta.severity !== tb.severity) delta.push(`sev ${ta.severity}→${tb.severity}`);
    if((ta.assignee||'') !== (tb.assignee||'')) delta.push(`asg ${ta.assignee||'—'}→${tb.assignee||'—'}`);
    if((ta.dueAt||0) !== (tb.dueAt||0)) delta.push(`due ${(ta.dueAt?phase5FmtDateISO_(ta.dueAt):'—')}→${(tb.dueAt?phase5FmtDateISO_(tb.dueAt):'—')}`);
    if(ta.deps !== tb.deps) delta.push(`deps ${ta.deps}→${tb.deps}`);
    if(delta.length){ changed++; if(changes.length < 8) changes.push(`${matchedByPath ? '[title-match] ' : ''}${ta.title}: ${delta.join(', ')}`); }
  }
  for(const [id, tb] of fb.map.entries()){
    if(usedB.has(id)) continue;
    // if matched by path with missing id, treat as handled by content check
    if(fa.byPath.has(tb.path)) continue;
    added++; if(changes.length < 8) changes.push(`Added: ${tb.title} (${tb.path})`);
  }

  const settingsA = JSON.stringify((a.settings||{}));
  const settingsB = JSON.stringify((b.settings||{}));
  const projectFieldChanges = [];
  ['name','desc','status','tag'].forEach(k => { if(String(a[k]||'') !== String(b[k]||'')) projectFieldChanges.push(`${k}: ${String(a[k]||'—')} → ${String(b[k]||'—')}`); });
  if(settingsA !== settingsB) projectFieldChanges.push('settings changed');

  return {
    left: a, right: b,
    counts: { left:ca, right:cb },
    deltaCounts: {
      modules: (cb.modules||0) - (ca.modules||0),
      milestones: (cb.milestones||0) - (ca.milestones||0),
      tasks: (cb.tasks||0) - (ca.tasks||0),
      done: (cb.done||0) - (ca.done||0),
    },
    taskDiff: { added, removed, changed },
    projectFieldChanges,
    sampleChanges: changes,
  };
}

function phase7RenderSnapshotCompare_(mode){
  const out = document.querySelector('#phase7SnapshotCompareOut');
  if(!out) return;
  const p = getActiveProject();
  if(!p){ out.textContent = 'Select an active project first.'; return; }
  const snaps = (typeof phase6LoadSnapshotsForProject_ === 'function') ? phase6LoadSnapshotsForProject_(p.id) : [];
  if(!snaps.length){ out.textContent = 'No snapshots available for this project.'; return; }

  let left = null, right = null, label = '';
  if(mode === 'latest2'){
    if(snaps.length < 2){ out.textContent = 'Need at least 2 snapshots to compare latest 2.'; return; }
    left = snaps[1]?.project; right = snaps[0]?.project;
    label = `Latest 2 snapshots: ${snaps[1]?.name || 'older'} → ${snaps[0]?.name || 'latest'}`;
  } else {
    const sel = (typeof phase6GetSelectedSnapshot_ === 'function') ? phase6GetSelectedSnapshot_() : snaps[0];
    if(!sel){ out.textContent = 'Select a snapshot first.'; return; }
    left = sel.project; right = p;
    label = `Selected snapshot ↔ Active project (${sel.name})`;
  }

  try{
    const d = phase7CompareProjects_(left, right);
    out.innerHTML = `
      <div><b>${escapeHtml(label)}</b></div>
      <div style="margin-top:6px">
        Counts: modules <b>${d.counts.left.modules}</b>→<b>${d.counts.right.modules}</b> (${d.deltaCounts.modules>=0?'+':''}${d.deltaCounts.modules}),
        milestones <b>${d.counts.left.milestones}</b>→<b>${d.counts.right.milestones}</b> (${d.deltaCounts.milestones>=0?'+':''}${d.deltaCounts.milestones}),
        tasks <b>${d.counts.left.tasks}</b>→<b>${d.counts.right.tasks}</b> (${d.deltaCounts.tasks>=0?'+':''}${d.deltaCounts.tasks}),
        done <b>${d.counts.left.done}</b>→<b>${d.counts.right.done}</b> (${d.deltaCounts.done>=0?'+':''}${d.deltaCounts.done})
      </div>
      <div style="margin-top:6px">Task diff: <b>${d.taskDiff.added}</b> added • <b>${d.taskDiff.removed}</b> removed • <b>${d.taskDiff.changed}</b> changed</div>
      <div style="margin-top:6px">Project fields: ${d.projectFieldChanges.length ? d.projectFieldChanges.map(x => `<span class="badge">${escapeHtml(x)}</span>`).join(' ') : '<span class="phase7-mini">No top-level project field changes.</span>'}</div>
      <div style="margin-top:6px"><b>Sample changes</b></div>
      <ul>${d.sampleChanges.length ? d.sampleChanges.map(x => `<li>${escapeHtml(x)}</li>`).join('') : '<li>No sampled changes detected.</li>'}</ul>
    `;
  }catch(err){
    out.textContent = 'Compare failed (snapshot may be incompatible/corrupted).';
    console.warn('Phase7 snapshot compare failed', err);
  }
}

function phase7CollectAllPhase6Snapshots_(){
  const out = {};
  for(const p of (state.projects || [])){
    if(!p || !p.id) continue;
    try{ out[p.id] = (typeof phase6LoadSnapshotsForProject_ === 'function') ? phase6LoadSnapshotsForProject_(p.id) : []; }catch{}
  }
  return out;
}

function phase7ExportV2Bundle_(){
  try{ flushPendingSave_ && flushPendingSave_(true); }catch{}
  try{
    // capture current project settings form edits if open
    const p = getActiveProject();
    if(p && typeof phase5ApplyProjectSettingsFromUi_ === 'function') phase5ApplyProjectSettingsFromUi_(p);
  }catch{}
  const bundle = {
    type: 'stark_pm_bundle_v2',
    version: 2,
    exportedAt: Date.now(),
    appPhase: 7,
    state: state,
    local: {
      phase5RecurringTemplates: (typeof phase5GetTemplates_ === 'function') ? phase5GetTemplates_() : [],
      phase6SnapshotsByProject: phase7CollectAllPhase6Snapshots_(),
      phase7Blueprints: phase7LoadBlueprints_(),
      phase7Capacities: phase7LoadCapacities_(),
      phase7Config: phase7State_.cfg || {},
    }
  };
  const payload = JSON.stringify(bundle, null, 2);
  const filename = buildStampedFilename_('stark_pm_bundle_v2', '.json');
  cacheLastExport_(filename, payload, 'application/json', 'json');
  downloadText(filename, payload, 'application/json');
  addActivity('Exported V2 bundle: ' + filename);
  try{ saveState({ immediate:true }); }catch{}
}

async function phase7ImportV2BundleFromText_(text, filename){
  let bundle = null;
  try{ bundle = JSON.parse(String(text || '')); }catch{ alert('Invalid JSON file.'); return; }
  if(!bundle || typeof bundle !== 'object' || bundle.type !== 'stark_pm_bundle_v2'){
    alert('This file is not a valid Stark PM V2 bundle.');
    return;
  }
  const ok = await pmConfirmDialog_(`Import V2 bundle${filename ? ` (${filename})` : ''}?\n\nThis will replace your current local PM state and restore included local templates/snapshots/capacity settings.`, { title:'Import V2 Bundle', okText:'Import', danger:true });
  if(!ok) return;

  let nextState = null;
  try{
    nextState = sanitizeState(migrateState_(bundle.state || {}));
  }catch(err){
    console.warn('Phase7 bundle state sanitize failed', err);
    alert('Bundle state is invalid or incompatible.');
    return;
  }

  try{
    // restore local phase data first (best effort)
    if(bundle.local){
      try{ if(Array.isArray(bundle.local.phase5RecurringTemplates) && typeof phase5SaveTemplates_ === 'function') phase5SaveTemplates_(bundle.local.phase5RecurringTemplates); }catch{}
      try{ if(Array.isArray(bundle.local.phase7Blueprints)) phase7SaveBlueprints_(bundle.local.phase7Blueprints); }catch{}
      try{ if(bundle.local.phase7Capacities && typeof bundle.local.phase7Capacities === 'object') phase7SaveCapacities_(bundle.local.phase7Capacities); }catch{}
      try{ if(bundle.local.phase7Config && typeof bundle.local.phase7Config === 'object'){ Object.assign(phase7State_.cfg, bundle.local.phase7Config); phase7SaveCfg_(); } }catch{}
    }

    state = nextState;
    reconcileActiveSelection_();

    // restore snapshots after state ids are loaded
    try{
      const snapMap = bundle.local?.phase6SnapshotsByProject;
      if(snapMap && typeof snapMap === 'object' && typeof phase6SaveSnapshotsForProject_ === 'function'){
        for(const p of (state.projects || [])){
          phase6SaveSnapshotsForProject_(p.id, Array.isArray(snapMap[p.id]) ? snapMap[p.id] : []);
        }
      }
    }catch(err){ console.warn('Phase7 snapshot restore failed', err); }

    addActivity('Imported V2 bundle' + (filename ? `: ${filename}` : ''));
    saveState();
    renderAll();
  }catch(err){
    console.warn('Phase7 bundle import failed', err);
    alert('Import failed. Your current state may be unchanged.');
  }
}

// boot phase 7 after phase 6 patch is loaded
try{ initPhase7_(); }catch(err){ console.warn('Phase7 init failed', err); }

/* ---------------------------
   Phase 8 Upgrade (Additive Patch)
   - Saved views quick presets hub (dashboard)
   - Notifications Center + dismiss/read state
   - Dependency matrix + batch editor (checklist)
   - Gantt-lite timeline (checklist)
   - Project health scoring panel (dashboard)
   - Import V2 dry-run diff preview guard (Phase 7 wrapper)
   - Activity/Audit filter panel (dashboard)
---------------------------- */
var PHASE8_VIEWS_KEY = 'stark_pm_phase8_pinned_views_v1';
var PHASE8_NOTIFY_KEY = 'stark_pm_phase8_notify_state_v1';
var phase8State_ = {
  inited: false,
  patched: false,
  pinnedViews: null,
  notify: null,
  depFilter: 'all',
  auditQuery: '',
};

function initPhase8_(){
  if(phase8State_.inited) return;
  phase8State_.inited = true;
  phase8EnsureStyles_();
  phase8PatchFunctions_();
  phase8EnsureTopbarButtons_();
  try{ phase8PostRenderDashboard_(); }catch{}
  try{ phase8PostRenderChecklist_(); }catch{}
}

function phase8EnsureStyles_(){
  if(document.querySelector('#phase8Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase8Styles';
  st.textContent = `
    .phase8-box{margin-top:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:10px}
    .phase8-title{font-size:12px;letter-spacing:.1em;text-transform:uppercase;opacity:.86;margin-bottom:8px}
    .phase8-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .phase8-grid--3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
    .phase8-card{border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.015);padding:10px}
    .phase8-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
    .phase8-toolbar .btn{padding:6px 10px}
    .phase8-list{display:flex;flex-direction:column;gap:6px;max-height:260px;overflow:auto}
    .phase8-item{border:1px solid rgba(255,255,255,.06);border-radius:10px;padding:8px;background:rgba(255,255,255,.01)}
    .phase8-item__top{display:flex;justify-content:space-between;gap:8px;align-items:center}
    .phase8-item__title{font-size:13px;line-height:1.25}
    .phase8-item__meta{font-size:11px;opacity:.72;margin-top:4px}
    .phase8-sev{display:inline-flex;align-items:center;padding:2px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.12);font-size:10px}
    .phase8-sev.is-high{border-color:rgba(255,174,102,.28);color:#ffd29a}
    .phase8-sev.is-urgent{border-color:rgba(255,110,110,.35);color:#ffbbbb}
    .phase8-health{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase8-health__name{font-size:13px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .phase8-health__score{font-weight:700;font-size:12px}
    .phase8-health__badge{font-size:10px;padding:3px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.12)}
    .phase8-health__badge.ok{border-color:rgba(146,255,176,.25);color:#b8ffd0}
    .phase8-health__badge.warn{border-color:rgba(255,210,120,.28);color:#ffdba3}
    .phase8-health__badge.risk{border-color:rgba(255,110,110,.35);color:#ffc0c0}
    .phase8-pills{display:flex;gap:6px;flex-wrap:wrap}
    .phase8-pill{font-size:11px;padding:4px 7px;border-radius:999px;border:1px solid rgba(255,255,255,.12);cursor:pointer;background:rgba(255,255,255,.02)}
    .phase8-pill:hover{border-color:rgba(0,255,255,.25)}
    .phase8-pill.is-active{border-color:rgba(0,255,255,.32);box-shadow:0 0 0 1px rgba(0,255,255,.08) inset}
    .phase8-empty{font-size:12px;opacity:.72;padding:8px}
    .phase8-tableWrap{max-height:280px;overflow:auto;border:1px solid rgba(255,255,255,.06);border-radius:10px}
    .phase8-table{width:100%;border-collapse:collapse;font-size:12px}
    .phase8-table th,.phase8-table td{padding:7px 8px;border-bottom:1px solid rgba(255,255,255,.06);vertical-align:top}
    .phase8-table th{text-align:left;font-size:11px;opacity:.75;position:sticky;top:0;background:rgba(12,15,22,.95)}
    .phase8-table tr:hover td{background:rgba(255,255,255,.015)}
    .phase8-kbd{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;opacity:.85}
    .phase8-gantt{display:flex;flex-direction:column;gap:6px;max-height:320px;overflow:auto}
    .phase8-ganttRow{display:grid;grid-template-columns:200px minmax(220px,1fr) auto;gap:8px;align-items:center}
    .phase8-ganttLabel{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .phase8-ganttTrack{position:relative;height:18px;border-radius:999px;border:1px solid rgba(255,255,255,.08);background:linear-gradient(90deg, rgba(255,255,255,.02), rgba(255,255,255,.01));overflow:hidden}
    .phase8-ganttBar{position:absolute;top:2px;height:12px;border-radius:999px;border:1px solid rgba(0,255,255,.16);background:rgba(0,255,255,.14)}
    .phase8-ganttBar.is-overdue{border-color:rgba(255,110,110,.28);background:rgba(255,80,80,.13)}
    .phase8-ganttBar.is-done{border-color:rgba(146,255,176,.22);background:rgba(120,255,170,.12)}
    .phase8-ganttDate{font-size:11px;opacity:.78;white-space:nowrap}
    .phase8-auditList{max-height:260px;overflow:auto;display:flex;flex-direction:column;gap:6px}
    .phase8-auditRow{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase8-auditRow__msg{font-size:12px;line-height:1.3}
    .phase8-auditRow__meta{font-size:11px;opacity:.72;margin-top:4px}
    @media (max-width: 980px){ .phase8-grid,.phase8-grid--3{grid-template-columns:1fr} .phase8-ganttRow{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase8PatchFunctions_(){
  if(phase8State_.patched) return;
  phase8State_.patched = true;

  if(typeof renderDashboard === 'function' && !renderDashboard._phase8Wrapped){
    const base = renderDashboard;
    renderDashboard = function(){
      base();
      try{ phase8PostRenderDashboard_(); }catch(err){ console.warn('Phase8 dashboard render failed', err); }
    };
    renderDashboard._phase8Wrapped = true;
  }

  if(typeof renderChecklist === 'function' && !renderChecklist._phase8Wrapped){
    const base = renderChecklist;
    renderChecklist = function(){
      base();
      try{ phase8PostRenderChecklist_(); }catch(err){ console.warn('Phase8 checklist render failed', err); }
    };
    renderChecklist._phase8Wrapped = true;
  }

  if(typeof phase7ImportV2BundleFromText_ === 'function' && !phase7ImportV2BundleFromText_._phase8Wrapped){
    const baseImport = phase7ImportV2BundleFromText_;
    phase7ImportV2BundleFromText_ = async function(text, filename){
      let bundle = null;
      try{ bundle = JSON.parse(String(text || '')); }catch{ alert('Invalid JSON file.'); return; }
      if(!bundle || bundle.type !== 'stark_pm_bundle_v2'){
        return baseImport(text, filename);
      }
      const preview = phase8BuildBundleDiffPreview_(bundle);
      const ok = await pmConfirmDialog_(`Phase 8 Import Dry-Run Preview${filename ? ` (${filename})` : ''}\n\n${preview}\n\nProceed to import?`, { title:'Import Dry-Run Preview', okText:'Proceed Import' });
      if(!ok) return;
      return baseImport(text, filename);
    };
    phase7ImportV2BundleFromText_._phase8Wrapped = true;
  }

  if(typeof phase3BuildCmdkItems_ === 'function' && !phase3BuildCmdkItems_._phase8Wrapped){
    const baseBuild = phase3BuildCmdkItems_;
    phase3BuildCmdkItems_ = function(q){
      const items = baseBuild(q) || [];
      const query = String(q || '').trim().toLowerCase();
      const cmds = [
        { kind:'command', title:'Phase 8: Notifications Center', sub:'Open dashboard notifications panel', tag:'PH8', act:'phase8Notify' },
        { kind:'command', title:'Phase 8: Dependency Matrix', sub:'Open checklist dependency table', tag:'PH8', act:'phase8Deps' },
        { kind:'command', title:'Phase 8: Gantt Lite', sub:'Open checklist gantt timeline', tag:'PH8', act:'phase8Gantt' },
      ];
      for(const c of cmds){
        const hay = `${c.title} ${c.sub} ${c.tag}`.toLowerCase();
        if(!query || hay.includes(query)) items.push(c);
      }
      return items;
    };
    phase3BuildCmdkItems_._phase8Wrapped = true;
  }

  if(typeof phase3RunCmdkAction_ === 'function' && !phase3RunCmdkAction_._phase8Wrapped){
    const baseRun = phase3RunCmdkAction_;
    phase3RunCmdkAction_ = function(it){
      if(it && it.act === 'phase8Notify'){ switchTab('dashboard'); setTimeout(()=>document.querySelector('#phase8NotificationsPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); return; }
      if(it && it.act === 'phase8Deps'){ switchTab('checklist'); setTimeout(()=>document.querySelector('#phase8DepsPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); return; }
      if(it && it.act === 'phase8Gantt'){ switchTab('checklist'); setTimeout(()=>document.querySelector('#phase8GanttPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); return; }
      return baseRun(it);
    };
    phase3RunCmdkAction_._phase8Wrapped = true;
  }
}

function phase8EnsureTopbarButtons_(){
  const topbar = document.querySelector('.topbar__right');
  if(!topbar) return;
  if(!document.querySelector('#phase8BtnNotifications')){
    const btn = document.createElement('button');
    btn.id = 'phase8BtnNotifications';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Notifications';
    btn.addEventListener('click', () => { openPanelInOwningTab_('#phase8NotificationsPanel', 'dashboard', 10); });
    const anchor = document.querySelector('#phase7BtnImportV2') || document.querySelector('#btnExportJson');
    topbar.insertBefore(btn, anchor || null);
  }
}

function phase8LoadPinnedViews_(){
  if(Array.isArray(phase8State_.pinnedViews)) return phase8State_.pinnedViews;
  try{
    const raw = localStorage.getItem(PHASE8_VIEWS_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    phase8State_.pinnedViews = Array.isArray(arr) ? arr : [];
  }catch{ phase8State_.pinnedViews = []; }
  return phase8State_.pinnedViews;
}
function phase8SavePinnedViews_(){ try{ localStorage.setItem(PHASE8_VIEWS_KEY, JSON.stringify(phase8LoadPinnedViews_())); }catch{} }
function phase8LoadNotifyState_(){
  if(phase8State_.notify && typeof phase8State_.notify === 'object') return phase8State_.notify;
  try{
    const raw = localStorage.getItem(PHASE8_NOTIFY_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    phase8State_.notify = { dismissed: Array.isArray(obj.dismissed)?obj.dismissed:[] };
  }catch{ phase8State_.notify = { dismissed: [] }; }
  return phase8State_.notify;
}
function phase8SaveNotifyState_(){ try{ localStorage.setItem(PHASE8_NOTIFY_KEY, JSON.stringify(phase8LoadNotifyState_())); }catch{} }

function phase8BuildBundleDiffPreview_(bundle){
  const nextCounts = phase8CountState_(bundle.state || {});
  const curCounts = phase8CountState_(state || {});
  const local = bundle.local || {};
  const nTpl = Array.isArray(local.phase5RecurringTemplates) ? local.phase5RecurringTemplates.length : 0;
  const nBp = Array.isArray(local.phase7Blueprints) ? local.phase7Blueprints.length : 0;
  const nCap = local.phase7Capacities && typeof local.phase7Capacities === 'object' ? Object.keys(local.phase7Capacities).length : 0;
  let nSnapProjects = 0;
  try{ if(local.phase6SnapshotsByProject && typeof local.phase6SnapshotsByProject === 'object') nSnapProjects = Object.keys(local.phase6SnapshotsByProject).length; }catch{}
  return [
    `Current → Bundle counts`,
    `Projects: ${curCounts.projects} → ${nextCounts.projects} (${phase8FmtDelta_(nextCounts.projects-curCounts.projects)})`,
    `Milestones: ${curCounts.milestones} → ${nextCounts.milestones} (${phase8FmtDelta_(nextCounts.milestones-curCounts.milestones)})`,
    `Tasks: ${curCounts.tasks} → ${nextCounts.tasks} (${phase8FmtDelta_(nextCounts.tasks-curCounts.tasks)})`,
    `Done tasks: ${curCounts.done} → ${nextCounts.done} (${phase8FmtDelta_(nextCounts.done-curCounts.done)})`,
    ``,
    `Bundle local assets:`,
    `Recurring templates: ${nTpl}`,
    `Blueprints: ${nBp}`,
    `Capacity profiles: ${nCap}`,
    `Snapshot project buckets: ${nSnapProjects}`,
  ].join('\n');
}
function phase8FmtDelta_(n){ return `${n>0?'+':''}${n}`; }
function phase8CountState_(s){
  const x = { projects:0, milestones:0, tasks:0, done:0 };
  if(!s || !Array.isArray(s.projects)) return x;
  x.projects = s.projects.length;
  for(const p of s.projects){
    for(const mod of (p?.modules || [])){
      for(const ms of (mod?.milestones || [])){
        x.milestones++;
        for(const t of (ms?.tasks || [])){
          x.tasks++;
          if(t?.done) x.done++;
        }
      }
    }
  }
  return x;
}

function phase8AllTaskEntries_(opts){
  opts = opts || {};
  const entries = [];
  const onlyActiveProject = !!opts.onlyActiveProject;
  const activeP = onlyActiveProject ? getActiveProject() : null;
  const projects = onlyActiveProject ? (activeP ? [activeP] : []) : (state.projects || []);
  for(const p of projects){
    for(const mod of (p?.modules || [])){
      for(const ms of (mod?.milestones || [])){
        for(const t of (ms?.tasks || [])){
          entries.push({ p, mod, ms, t });
        }
      }
    }
  }
  return entries;
}

function phase8PostRenderDashboard_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return;
  let host = document.querySelector('#phase8DashboardHost');
  if(!host){
    host = document.createElement('div');
    host.id = 'phase8DashboardHost';
    host.className = 'phase8-box';
    host.innerHTML = `
      <div class="phase8-title">Phase 8 Operations Center</div>
      <div class="phase8-grid" id="phase8DashGridA">
        <div class="phase8-card" id="phase8SavedViewsPanel"></div>
        <div class="phase8-card" id="phase8NotificationsPanel"></div>
      </div>
      <div class="phase8-grid" id="phase8DashGridB" style="margin-top:10px">
        <div class="phase8-card" id="phase8HealthPanel"></div>
        <div class="phase8-card" id="phase8AuditPanel"></div>
      </div>
    `;
    tab.appendChild(host);
  }
  phase8RenderSavedViewsPanel_();
  phase8RenderNotificationsPanel_();
  phase8RenderHealthPanel_();
  phase8RenderAuditPanel_();
}

function phase8RenderSavedViewsPanel_(){
  const box = document.querySelector('#phase8SavedViewsPanel');
  if(!box) return;
  const presets = [
    { key:'__preset_today', label:'Due Today' },
    { key:'__preset_overdue', label:'Overdue' },
    { key:'__preset_blocked', label:'Blocked' },
    { key:'__preset_week', label:'This Week' },
    { key:'__preset_high_open', label:'High Priority' },
  ];
  const pinned = phase8LoadPinnedViews_();
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Saved Views Hub</div><div class="phase8-item__meta">Quick jump to checklist filters</div></div>
    <div class="phase8-item__meta">Presets</div>
    <div class="phase8-pills" id="phase8PresetPills"></div>
    <div class="phase8-item__meta" style="margin-top:8px">Pinned views</div>
    <div class="phase8-pills" id="phase8PinnedPills"></div>
    <div class="phase8-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" id="phase8BtnPinCurrentView" type="button">Pin Current View</button>
      <button class="btn btn--ghost" id="phase8BtnManagePins" type="button">Remove Pin</button>
    </div>
  `;
  const presetHost = box.querySelector('#phase8PresetPills');
  presets.forEach(v => {
    const b = document.createElement('button');
    b.className = 'phase8-pill'; b.type='button'; b.textContent = v.label;
    b.addEventListener('click', () => phase8ApplyChecklistViewKey_(v.key));
    presetHost.appendChild(b);
  });
  const pinHost = box.querySelector('#phase8PinnedPills');
  if(!pinned.length){
    pinHost.innerHTML = `<div class="phase8-empty">No pinned views yet. Save/pin your most-used checklist filters.</div>`;
  } else {
    pinned.forEach(v => {
      const b = document.createElement('button');
      b.className = 'phase8-pill'; b.type='button'; b.textContent = v.name;
      b.title = v.key;
      b.addEventListener('click', () => phase8ApplyChecklistViewKey_(v.key));
      pinHost.appendChild(b);
    });
  }
  box.querySelector('#phase8BtnPinCurrentView')?.addEventListener('click', phase8PinCurrentChecklistView_);
  box.querySelector('#phase8BtnManagePins')?.addEventListener('click', phase8PromptRemovePinnedView_);
}

function phase8ApplyChecklistViewKey_(key){
  switchTab('checklist');
  setTimeout(() => {
    const sel = document.querySelector('#phase4ViewPreset');
    if(typeof phase4PresetViews_ === 'function' && typeof phase4ApplySelectedView_ === 'function' && sel){
      sel.value = String(key||'');
      phase4ApplySelectedView_();
    }
  }, 10);
}

async function phase8PinCurrentChecklistView_(){
  if(typeof phase4GetCurrentViewState_ !== 'function'){
    alert('Checklist view saving is not available yet.');
    return;
  }
  const name = await pmPromptDialog_('Pin current checklist view as:', 'Pinned View', { title:'Pin Checklist View', placeholder:'Pinned view name' });
  if(name == null) return;
  const n = String(name).trim();
  if(!n) return;
  let key = '';
  if(typeof phase4State_ === 'object' && typeof phase4GetCurrentViewState_ === 'function'){
    phase4State_.savedViews = phase4State_.savedViews || {};
    phase4State_.savedViews[n] = phase4GetCurrentViewState_();
    try{ phase4PersistViews_(); }catch{}
    try{ phase4RefreshSavedViewSelect_(); }catch{}
    key = n;
  } else {
    key = 'all';
  }
  const arr = phase8LoadPinnedViews_();
  const idx = arr.findIndex(x => x && x.name === n);
  const item = { name:n, key };
  if(idx >= 0) arr[idx] = item; else arr.push(item);
  phase8SavePinnedViews_();
  addActivity(`Pinned view: ${n}`);
  phase8RenderSavedViewsPanel_();
}

async function phase8PromptRemovePinnedView_(){
  const arr = phase8LoadPinnedViews_();
  if(!arr.length){ alert('No pinned views to remove.'); return; }
  const menu = arr.map((x,i)=>`${i+1}. ${x.name}`).join('\n');
  const ans = await pmPromptDialog_(`Remove which pinned view?\n\n${menu}`, '1', { title:'Remove Pinned View', placeholder:'Enter number' });
  if(ans == null) return;
  const idx = Number(ans)-1;
  if(!Number.isInteger(idx) || idx < 0 || idx >= arr.length){ alert('Invalid selection.'); return; }
  const [removed] = arr.splice(idx,1);
  phase8SavePinnedViews_();
  addActivity(`Removed pinned view: ${removed?.name || 'unknown'}`);
  phase8RenderSavedViewsPanel_();
}

function phase8GenerateNotifications_(){
  const out = [];
  const now = Date.now();
  const dueSoonEnd = now + 7*86400000;
  const entries = phase8AllTaskEntries_();
  const byAssigneeLoad = {};
  for(const e of entries){
    const t = e.t;
    const assignee = String(t.assignee || 'Unassigned').trim() || 'Unassigned';
    byAssigneeLoad[assignee] = byAssigneeLoad[assignee] || { score:0, open:0 };
    if(!t.done){
      byAssigneeLoad[assignee].open++;
      if(t.severity === 'blocker') byAssigneeLoad[assignee].score += 4;
      else if(t.severity === 'high') byAssigneeLoad[assignee].score += 2;
      else byAssigneeLoad[assignee].score += 1;
    }
    const due = Number(t?.dueAt || 0);
    let unresolved = [];
    try{ unresolved = (typeof phase4GetUnresolvedBlockers_ === 'function') ? phase4GetUnresolvedBlockers_(e.ms, t) : []; }catch{ unresolved = []; }
    if(!t.done && due && due < (new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())).getTime()){
      out.push({ id:`ov:${e.p.id}:${e.ms.id}:${t.id}`, type:'overdue', level:'urgent', title:`Overdue: ${t.title}`, meta:`${e.p.name} • ${e.ms.title}${assignee ? ' • ' + assignee : ''}`, action:()=>phase8FocusTask_(e) });
    } else if(!t.done && due && due >= now && due <= dueSoonEnd){
      out.push({ id:`soon:${e.p.id}:${e.ms.id}:${t.id}`, type:'dueSoon', level:'high', title:`Due soon: ${t.title}`, meta:`${e.p.name} • ${e.ms.title} • ${new Date(due).toLocaleDateString()}`, action:()=>phase8FocusTask_(e) });
    }
    if(!t.done && unresolved.length){
      out.push({ id:`blk:${e.p.id}:${e.ms.id}:${t.id}`, type:'blocked', level:'high', title:`Blocked: ${t.title}`, meta:`Waiting on ${unresolved.length} task(s) • ${e.p.name} • ${e.ms.title}`, action:()=>phase8FocusTask_(e) });
    }
  }

  // Capacity overload notifications (Phase 7 integration)
  try{
    if(typeof phase7LoadCapacities_ === 'function'){
      const caps = phase7LoadCapacities_() || {};
      for(const [name,v] of Object.entries(byAssigneeLoad)){
        const cap = Number(caps[name]);
        if(Number.isFinite(cap) && cap > 0 && v.score > cap){
          out.push({ id:`cap:${name}`, type:'capacity', level:'urgent', title:`Capacity overload: ${name}`, meta:`Load score ${v.score} > weekly capacity ${cap}`, action:()=>{ switchTab('dashboard'); setTimeout(()=>document.querySelector('#phase7CapacityPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); } });
        }
      }
    }
  }catch{}

  // Snapshot reminder if no snapshot exists for active project
  try{
    const p = getActiveProject();
    if(p && typeof phase6LoadSnapshotsForProject_ === 'function'){
      const snaps = phase6LoadSnapshotsForProject_(p.id) || [];
      if(!snaps.length){
        out.push({ id:`snap:${p.id}`, type:'snapshot', level:'normal', title:`No snapshots yet for active project`, meta:`Create a restore point for ${p.name}`, action:()=>{ switchTab('projects'); setTimeout(()=>document.querySelector('#phase6SnapshotsBox, #phase8SnapshotButton')?.scrollIntoView({behavior:'smooth', block:'start'}),10);} });
      }
    }
  }catch{}

  // Dedup + sort
  const seen = new Set();
  const rank = { urgent:3, high:2, normal:1 };
  return out.filter(n => !seen.has(n.id) && seen.add(n.id)).sort((a,b) => (rank[b.level]-rank[a.level]) || String(a.title).localeCompare(String(b.title))).slice(0, 80);
}

function phase8RenderNotificationsPanel_(){
  const box = document.querySelector('#phase8NotificationsPanel');
  if(!box) return;
  const notifyState = phase8LoadNotifyState_();
  const all = phase8GenerateNotifications_();
  const visible = all.filter(n => !(notifyState.dismissed || []).includes(n.id));
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Notifications Center</div><div class="phase8-item__meta">${visible.length} active</div></div>
    <div class="phase8-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" id="phase8BtnRefreshNotif" type="button">Refresh</button>
      <button class="btn btn--ghost" id="phase8BtnClearNotifDismissed" type="button">Reset Dismissed</button>
      <button class="btn btn--ghost" id="phase8BtnDismissAllVisible" type="button">Dismiss All Visible</button>
    </div>
    <div class="phase8-list" id="phase8NotifList" style="margin-top:8px"></div>
  `;
  const list = box.querySelector('#phase8NotifList');
  if(!visible.length){
    list.innerHTML = `<div class="phase8-empty">No active notifications right now.</div>`;
  } else {
    visible.slice(0,30).forEach(n => {
      const row = document.createElement('div');
      row.className = 'phase8-item';
      const sevCls = n.level === 'urgent' ? 'is-urgent' : (n.level === 'high' ? 'is-high' : '');
      row.innerHTML = `
        <div class="phase8-item__top">
          <div class="phase8-item__title">${escapeHtml(n.title)}</div>
          <span class="phase8-sev ${sevCls}">${escapeHtml(String(n.level).toUpperCase())}</span>
        </div>
        <div class="phase8-item__meta">${escapeHtml(n.meta || '')}</div>
        <div class="phase8-toolbar" style="margin-top:6px">
          <button class="btn btn--ghost" type="button" data-act="open">Open</button>
          <button class="btn btn--ghost" type="button" data-act="dismiss">Dismiss</button>
        </div>
      `;
      row.querySelector('[data-act="open"]')?.addEventListener('click', () => { try{ n.action && n.action(); }catch{} });
      row.querySelector('[data-act="dismiss"]')?.addEventListener('click', () => {
        const st = phase8LoadNotifyState_();
        if(!st.dismissed.includes(n.id)) st.dismissed.push(n.id);
        phase8SaveNotifyState_();
        phase8RenderNotificationsPanel_();
      });
      list.appendChild(row);
    });
  }
  box.querySelector('#phase8BtnRefreshNotif')?.addEventListener('click', () => phase8RenderNotificationsPanel_());
  box.querySelector('#phase8BtnClearNotifDismissed')?.addEventListener('click', () => { phase8LoadNotifyState_().dismissed = []; phase8SaveNotifyState_(); phase8RenderNotificationsPanel_(); });
  box.querySelector('#phase8BtnDismissAllVisible')?.addEventListener('click', () => {
    const st = phase8LoadNotifyState_();
    for(const n of visible){ if(!st.dismissed.includes(n.id)) st.dismissed.push(n.id); }
    phase8SaveNotifyState_();
    phase8RenderNotificationsPanel_();
  });
}

function phase8ScoreProjectHealth_(p){
  let tasks=0, done=0, overdue=0, blocked=0, dueSoon=0, high=0;
  const now = Date.now();
  const dueSoonEnd = now + 7*86400000;
  for(const mod of (p?.modules || [])){
    for(const ms of (mod?.milestones || [])){
      for(const t of (ms?.tasks || [])){
        tasks++;
        if(t.done){ done++; continue; }
        const due = Number(t?.dueAt || 0);
        if(due && due < (new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())).getTime()) overdue++;
        else if(due && due <= dueSoonEnd) dueSoon++;
        if(t.severity === 'high') high++;
        if(t.severity === 'blocker') high += 2;
        try{ if(typeof phase4GetUnresolvedBlockers_ === 'function' && phase4GetUnresolvedBlockers_(ms, t).length) blocked++; }catch{}
      }
    }
  }
  const open = tasks - done;
  let score = 100;
  score -= overdue * 8;
  score -= blocked * 5;
  score -= dueSoon * 2;
  score -= Math.max(0, open - done) * 0.5;
  score -= high;
  if(tasks){ score += (done / tasks) * 15; }
  score = Math.max(0, Math.min(100, Math.round(score)));
  const badge = score >= 80 ? 'Healthy' : (score >= 55 ? 'Watch' : 'At Risk');
  const badgeClass = score >= 80 ? 'ok' : (score >= 55 ? 'warn' : 'risk');
  return { score, badge, badgeClass, tasks, open, overdue, blocked, dueSoon };
}

function phase8RenderHealthPanel_(){
  const box = document.querySelector('#phase8HealthPanel');
  if(!box) return;
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Project Health Scoring</div><div class="phase8-item__meta">Overdue + blockers + due-soon weighted</div></div>
    <div class="phase8-list" id="phase8HealthList" style="margin-top:8px"></div>
  `;
  const list = box.querySelector('#phase8HealthList');
  const projects = (state.projects || []).slice();
  if(!projects.length){ list.innerHTML = `<div class="phase8-empty">No projects available.</div>`; return; }
  const rows = projects.map(p => ({ p, h: phase8ScoreProjectHealth_(p) }))
                      .sort((a,b) => a.h.score - b.h.score || a.p.name.localeCompare(b.p.name));
  rows.forEach(({p,h}) => {
    const row = document.createElement('div');
    row.className = 'phase8-health';
    row.innerHTML = `
      <div>
        <div class="phase8-health__name">${escapeHtml(p.name)}</div>
        <div class="phase8-item__meta">open ${h.open}/${h.tasks} • overdue ${h.overdue} • blocked ${h.blocked} • due7 ${h.dueSoon}</div>
      </div>
      <div class="phase8-health__score">${h.score}</div>
      <div class="phase8-health__badge ${h.badgeClass}">${escapeHtml(h.badge)}</div>
    `;
    row.addEventListener('click', () => { setActiveProject(p.id); switchTab('dashboard'); renderAll(); });
    list.appendChild(row);
  });
}

function phase8RenderAuditPanel_(){
  const box = document.querySelector('#phase8AuditPanel');
  if(!box) return;
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Audit Trail Filter</div><div class="phase8-item__meta">Search recent activity</div></div>
    <div class="phase8-toolbar" style="margin-top:8px">
      <input class="input" id="phase8AuditQuery" placeholder="e.g., Export, snapshot, import, recurring" value="${escapeHtml(String(phase8State_.auditQuery||''))}" />
      <button class="btn btn--ghost" id="phase8BtnAuditApply" type="button">Apply</button>
      <button class="btn btn--ghost" id="phase8BtnAuditClear" type="button">Clear</button>
    </div>
    <div class="phase8-auditList" id="phase8AuditList" style="margin-top:8px"></div>
  `;
  const queryInput = box.querySelector('#phase8AuditQuery');
  const renderList = () => {
    phase8State_.auditQuery = String(queryInput?.value || '').trim();
    const q = phase8State_.auditQuery.toLowerCase();
    const list = box.querySelector('#phase8AuditList');
    list.innerHTML = '';
    const rows = (state.activity || []).filter(a => !q || String(a.msg || '').toLowerCase().includes(q)).slice(0, 40);
    if(!rows.length){ list.innerHTML = `<div class="phase8-empty">No matching activity.</div>`; return; }
    rows.forEach(a => {
      const row = document.createElement('div');
      row.className = 'phase8-auditRow';
      row.innerHTML = `<div class="phase8-auditRow__msg">${escapeHtml(a.msg)}</div><div class="phase8-auditRow__meta">${new Date(a.ts).toLocaleString()}</div>`;
      list.appendChild(row);
    });
  };
  box.querySelector('#phase8BtnAuditApply')?.addEventListener('click', renderList);
  box.querySelector('#phase8BtnAuditClear')?.addEventListener('click', () => { if(queryInput) queryInput.value = ''; renderList(); });
  queryInput?.addEventListener('keydown', (e)=>{ if(e.key === 'Enter') renderList(); });
  renderList();
}

function phase8FocusTask_(e){
  if(!e || !e.p || !e.ms || !e.t) return;
  setActiveProject(e.p.id);
  setActiveMilestone(e.ms.id);
  switchTab('checklist');
  setTimeout(() => {
    const target = Array.from(document.querySelectorAll('#taskList .task')).find(x => x.dataset.taskId === e.t.id);
    if(target){ target.scrollIntoView({behavior:'smooth', block:'center'}); target.classList.add('is-selected'); setTimeout(()=>target.classList.remove('is-selected'), 900); }
  }, 80);
}

function phase8PostRenderChecklist_(){
  const tab = document.querySelector('#tab-checklist');
  if(!tab) return;
  let host = document.querySelector('#phase8ChecklistHost');
  if(!host){
    host = document.createElement('div');
    host.id = 'phase8ChecklistHost';
    host.className = 'phase8-box';
    host.innerHTML = `
      <div class="phase8-title">Phase 8 Planning & Dependencies</div>
      <div class="phase8-grid" id="phase8ChecklistGridA">
        <div class="phase8-card" id="phase8DepsPanel"></div>
        <div class="phase8-card" id="phase8GanttPanel"></div>
      </div>
    `;
    tab.appendChild(host);
  }
  phase8RenderDepsPanel_();
  phase8RenderGanttPanel_();
}

function phase8ChecklistContext_(){
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  return { p, m };
}

function phase8DepRowsForMilestone_(m){
  const rows = [];
  if(!m) return rows;
  const tasks = Array.isArray(m.tasks) ? m.tasks : [];
  const byId = new Map(tasks.map(t => [t.id, t]));
  for(const t of tasks){
    try{ if(typeof phase4NormalizeTaskMeta_ === 'function') phase4NormalizeTaskMeta_(t,t); }catch{}
    const blockers = Array.isArray(t.blockedBy) ? t.blockedBy : [];
    const missing = [];
    const selfRefs = [];
    const resolved = [];
    const seen = new Set();
    const dupes = [];
    for(const id of blockers){
      if(id === t.id){ selfRefs.push(id); continue; }
      if(seen.has(id)){ dupes.push(id); continue; }
      seen.add(id);
      const b = byId.get(id);
      if(!b) missing.push(id);
      else resolved.push(b);
    }
    const unresolvedOpen = resolved.filter(x => !x.done);
    rows.push({ t, blockers, resolved, unresolvedOpen, missing, selfRefs, dupes });
  }
  return rows;
}

function phase8RenderDepsPanel_(){
  const box = document.querySelector('#phase8DepsPanel');
  if(!box) return;
  const { p, m } = phase8ChecklistContext_();
  const rows = phase8DepRowsForMilestone_(m);
  const depRows = rows.filter(r => (r.blockers?.length || 0) || r.missing.length || r.selfRefs.length || r.dupes.length);
  const cycleInfo = phase8FindDependencyCycleEdges_(m);
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Dependency Matrix & Batch Editor</div><div class="phase8-item__meta">${p ? escapeHtml(p.name) : 'No project'}${m ? ' • ' + escapeHtml(m.title) : ''}</div></div>
    <div class="phase8-toolbar" style="margin-top:8px">
      <select class="select" id="phase8DepFilter">
        <option value="all">All tasks</option>
        <option value="withdeps">With deps</option>
        <option value="blocked">Blocked open</option>
        <option value="issues">Issues only</option>
      </select>
      <button class="btn btn--ghost" id="phase8BtnDepNormalize" type="button">Normalize</button>
      <button class="btn btn--ghost" id="phase8BtnDepClearInvalid" type="button">Clear Invalid</button>
      <button class="btn btn--ghost" id="phase8BtnDepRepairCycles" type="button">Repair Cycles</button>
    </div>
    <div class="phase8-toolbar" style="margin-top:6px">
      <button class="btn btn--ghost" id="phase8BtnBatchClearDeps" type="button">Clear blockers (selected)</button>
      <button class="btn btn--ghost" id="phase8BtnBatchClearDue" type="button">Clear due (selected)</button>
      <button class="btn btn--ghost" id="phase8BtnBatchShiftDue" type="button">Shift due ±days (selected)</button>
    </div>
    <div class="phase8-item__meta" style="margin-top:6px">cycles: ${cycleInfo.edges.length} • tasks with deps: ${depRows.length} • total tasks: ${rows.length}</div>
    <div class="phase8-tableWrap" style="margin-top:8px"><table class="phase8-table"><thead><tr><th>Task</th><th>Deps</th><th>Status</th><th>Due</th><th>Actions</th></tr></thead><tbody id="phase8DepsTbody"></tbody></table></div>
  `;
  const sel = box.querySelector('#phase8DepFilter');
  if(sel) sel.value = phase8State_.depFilter || 'all';
  const tbody = box.querySelector('#phase8DepsTbody');
  const filter = phase8State_.depFilter || 'all';
  const filtered = rows.filter(r => {
    if(filter === 'withdeps') return (r.blockers?.length || 0) > 0;
    if(filter === 'blocked') return !r.t.done && r.unresolvedOpen.length > 0;
    if(filter === 'issues') return r.missing.length > 0 || r.selfRefs.length > 0 || r.dupes.length > 0 || cycleInfo.edgeSet.has(String(r.t.id));
    return true;
  });
  if(!m){ tbody.innerHTML = `<tr><td colspan="5"><div class="phase8-empty">Select a project and milestone.</div></td></tr>`; }
  else if(!filtered.length){ tbody.innerHTML = `<tr><td colspan="5"><div class="phase8-empty">No rows for current filter.</div></td></tr>`; }
  else {
    filtered.forEach(r => {
      const tr = document.createElement('tr');
      const issues = [];
      if(r.unresolvedOpen.length && !r.t.done) issues.push(`blocked:${r.unresolvedOpen.length}`);
      if(r.missing.length) issues.push(`missing:${r.missing.length}`);
      if(r.selfRefs.length) issues.push(`self:${r.selfRefs.length}`);
      if(r.dupes.length) issues.push(`dupes:${r.dupes.length}`);
      const hasCycleEdge = cycleInfo.edgeSet.has(String(r.t.id));
      if(hasCycleEdge) issues.push('cycle');
      const depNames = r.resolved.slice(0,3).map(x => x.title).join(', ');
      const dueTxt = r.t.dueAt ? new Date(Number(r.t.dueAt)).toLocaleDateString() : '—';
      tr.innerHTML = `
        <td>
          <div>${escapeHtml(r.t.title)}</div>
          <div class="phase8-item__meta">${r.t.done ? 'done' : 'open'} • ${escapeHtml(r.t.severity || 'normal')}</div>
        </td>
        <td>
          <div>${r.blockers.length || 0}</div>
          <div class="phase8-item__meta">${escapeHtml(depNames)}${r.resolved.length > 3 ? '…' : ''}</div>
        </td>
        <td>${issues.length ? escapeHtml(issues.join(' • ')) : 'ok'}</td>
        <td>${escapeHtml(dueTxt)}</td>
        <td>
          <div class="phase8-toolbar">
            <button class="btn btn--ghost" type="button" data-act="focus">Open</button>
            <button class="btn btn--ghost" type="button" data-act="planner">Planner</button>
          </div>
        </td>`;
      tr.querySelector('[data-act="focus"]')?.addEventListener('click', ()=>phase8FocusTask_({ p:getActiveProject(), m, t:r.t }));
      tr.querySelector('[data-act="planner"]')?.addEventListener('click', ()=>{ if(typeof phase4OpenTaskPlanner_ === 'function') phase4OpenTaskPlanner_(r.t); });
      tbody.appendChild(tr);
    });
  }

  sel?.addEventListener('change', (e)=>{ phase8State_.depFilter = String(e.target.value||'all'); phase8RenderDepsPanel_(); });
  box.querySelector('#phase8BtnDepNormalize')?.addEventListener('click', () => {
    let changed = 0;
    for(const r of rows){ const b = JSON.stringify({d:r.t.dueAt,bb:r.t.blockedBy, n:r.t.blockerNote}); try{ if(typeof phase4NormalizeTaskMeta_ === 'function') phase4NormalizeTaskMeta_(r.t,r.t); }catch{} const a = JSON.stringify({d:r.t.dueAt,bb:r.t.blockedBy, n:r.t.blockerNote}); if(a!==b) changed++; }
    addActivity(`Phase8 normalized dependency metadata on ${changed} task(s)`); if(changed){ saveState(); renderChecklist(); }
  });
  box.querySelector('#phase8BtnDepClearInvalid')?.addEventListener('click', () => {
    if(!m) return;
    const byId = new Set((m.tasks||[]).map(t=>t.id));
    let changed = 0;
    for(const t of (m.tasks||[])){
      const before = JSON.stringify(t.blockedBy || []);
      const next = Array.from(new Set((Array.isArray(t.blockedBy)?t.blockedBy:[]).filter(id => id && id !== t.id && byId.has(id))));
      t.blockedBy = next;
      if(JSON.stringify(next)!==before) changed++;
    }
    addActivity(`Phase8 cleared invalid/self/duplicate blockers on ${changed} task(s)`);
    if(changed){ saveState(); renderChecklist(); }
  });
  box.querySelector('#phase8BtnDepRepairCycles')?.addEventListener('click', async () => {
    if(!m) return;
    const info = phase8FindDependencyCycleEdges_(m);
    if(!info.edges.length){ alert('No cycle edges detected.'); return; }
    if(!(await pmConfirmDialog_(`Repair ${info.edges.length} detected cycle edge(s)? This removes back-edges from blockedBy lists.`, {
      title:'Dependency Health',
      okText:'Repair'
    }))) return;
    let changed = 0;
    const removeByTask = new Map();
    for(const edge of info.edges){
      const arr = removeByTask.get(edge.from) || []; arr.push(edge.to); removeByTask.set(edge.from, arr);
    }
    for(const t of (m.tasks||[])){
      const rem = new Set(removeByTask.get(t.id) || []);
      if(!rem.size) continue;
      const before = JSON.stringify(t.blockedBy || []);
      t.blockedBy = (Array.isArray(t.blockedBy)?t.blockedBy:[]).filter(id => !rem.has(id));
      if(JSON.stringify(t.blockedBy)!==before) changed++;
    }
    addActivity(`Phase8 repaired ${changed} cycle-linked task(s)`);
    if(changed){ saveState(); renderChecklist(); }
  });
  box.querySelector('#phase8BtnBatchClearDeps')?.addEventListener('click', () => phase8BatchEditSelectedTasks_('clearDeps'));
  box.querySelector('#phase8BtnBatchClearDue')?.addEventListener('click', () => phase8BatchEditSelectedTasks_('clearDue'));
  box.querySelector('#phase8BtnBatchShiftDue')?.addEventListener('click', () => phase8BatchEditSelectedTasks_('shiftDue'));
}

function phase8FindDependencyCycleEdges_(m){
  const result = { edges: [], edgeSet: new Set() };
  if(!m || !Array.isArray(m.tasks)) return result;
  const byId = new Map((m.tasks||[]).map(t => [t.id, t]));
  const visiting = new Set();
  const visited = new Set();
  const path = [];
  const pathIdx = new Map();
  const edgeKey = new Set();
  function dfs(id){
    if(visiting.has(id)) return;
    if(visited.has(id)) return;
    visiting.add(id);
    pathIdx.set(id, path.length);
    path.push(id);
    const t = byId.get(id);
    for(const depId of (Array.isArray(t?.blockedBy)?t.blockedBy:[])){
      if(!byId.has(depId)) continue;
      if(visiting.has(depId)){
        const from = id, to = depId;
        const k = `${from}->${to}`;
        if(!edgeKey.has(k)){
          edgeKey.add(k);
          result.edges.push({ from, to });
          result.edgeSet.add(String(from));
        }
        continue;
      }
      dfs(depId);
    }
    visiting.delete(id);
    visited.add(id);
    pathIdx.delete(id);
    path.pop();
  }
  for(const t of (m.tasks||[])) dfs(t.id);
  return result;
}

async function phase8BatchEditSelectedTasks_(mode){
  const { m } = phase8ChecklistContext_();
  if(!m) return;
  let selected = [];
  try{ if(typeof phase3GetSelectedTaskIdsForCurrentMilestone_ === 'function') selected = phase3GetSelectedTaskIdsForCurrentMilestone_(); }catch{}
  if(!selected.length){
    const allVisibleCards = Array.from(document.querySelectorAll('#taskList .task')).filter(x => !x.classList.contains('phase3-hidden'));
    selected = allVisibleCards.map(x => x.dataset.taskId).filter(Boolean);
  }
  if(!selected.length){ alert('No selected (or visible) tasks to edit.'); return; }
  const setIds = new Set(selected);
  let changed = 0;
  if(mode === 'shiftDue'){
    const raw = await pmPromptDialog_('Shift due dates by how many days? (Use negative to pull earlier)', '1', {
      title:'Shift Due Dates',
      placeholder:'e.g. 1 or -2'
    });
    if(raw == null) return;
    const n = Number(raw);
    if(!Number.isFinite(n) || !Number.isInteger(n)){ alert('Enter a whole number of days.'); return; }
    for(const t of (m.tasks||[])){
      if(!setIds.has(t.id) || !t.dueAt) continue;
      const before = Number(t.dueAt);
      t.dueAt = before + (n * 86400000);
      changed++;
    }
    addActivity(`Phase8 shifted due dates by ${n} day(s) on ${changed} task(s)`);
  } else if(mode === 'clearDue'){
    for(const t of (m.tasks||[])){
      if(!setIds.has(t.id)) continue;
      if(t.dueAt){ t.dueAt = null; changed++; }
    }
    addActivity(`Phase8 cleared due dates on ${changed} task(s)`);
  } else if(mode === 'clearDeps'){
    for(const t of (m.tasks||[])){
      if(!setIds.has(t.id)) continue;
      if(Array.isArray(t.blockedBy) && t.blockedBy.length){ t.blockedBy = []; changed++; }
    }
    addActivity(`Phase8 cleared blockers on ${changed} task(s)`);
  }
  if(changed){ saveState(); renderChecklist(); }
}

function phase8RenderGanttPanel_(){
  const box = document.querySelector('#phase8GanttPanel');
  if(!box) return;
  const { p, m } = phase8ChecklistContext_();
  const tasks = Array.isArray(m?.tasks) ? m.tasks.slice() : [];
  const rows = [];
  for(const t of tasks){
    if(!t?.dueAt) continue;
    const due = Number(t.dueAt);
    if(!Number.isFinite(due) || due <= 0) continue;
    let durationDays = 1;
    try{
      const stepsLen = Array.isArray(t.steps) ? t.steps.length : 0;
      durationDays = Math.max(1, Math.min(14, (t.severity === 'blocker' ? 4 : t.severity === 'high' ? 2 : 1) + Math.ceil(stepsLen/4)));
      if(typeof phase4GetUnresolvedBlockers_ === 'function' && m && phase4GetUnresolvedBlockers_(m,t).length) durationDays += 1;
    }catch{}
    const start = due - (durationDays-1)*86400000;
    rows.push({ t, start, due, durationDays });
  }
  rows.sort((a,b) => a.start - b.start || a.due - b.due || String(a.t.title).localeCompare(String(b.t.title)));
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Timeline / Gantt-lite</div><div class="phase8-item__meta">${p ? escapeHtml(p.name) : 'No project'}${m ? ' • ' + escapeHtml(m.title) : ''}</div></div>
    <div class="phase8-item__meta" style="margin-top:6px">Bars use due dates + lightweight duration heuristic (severity/steps/blockers).</div>
    <div class="phase8-gantt" id="phase8GanttList" style="margin-top:8px"></div>
  `;
  const list = box.querySelector('#phase8GanttList');
  if(!m){ list.innerHTML = `<div class="phase8-empty">Select a project and milestone to see timeline bars.</div>`; return; }
  if(!rows.length){ list.innerHTML = `<div class="phase8-empty">No due dates in this milestone yet.</div>`; return; }
  const minTs = Math.min(...rows.map(r => r.start));
  const maxTs = Math.max(...rows.map(r => r.due));
  const span = Math.max(86400000, maxTs - minTs);
  rows.slice(0, 60).forEach(r => {
    const row = document.createElement('div');
    row.className = 'phase8-ganttRow';
    const leftPct = ((r.start - minTs)/span) * 100;
    const widthPct = Math.max(3, ((r.due - r.start + 86400000)/span) * 100);
    const isOverdue = !r.t.done && r.due < (new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())).getTime();
    row.innerHTML = `
      <button type="button" class="phase8-ganttLabel btn btn--ghost" data-act="open">${escapeHtml(r.t.title)}</button>
      <div class="phase8-ganttTrack"><div class="phase8-ganttBar ${isOverdue ? 'is-overdue' : ''} ${r.t.done ? 'is-done' : ''}" style="left:${leftPct}%;width:${Math.min(100-leftPct, widthPct)}%"></div></div>
      <div class="phase8-ganttDate">${new Date(r.start).toLocaleDateString()} → ${new Date(r.due).toLocaleDateString()}</div>
    `;
    row.querySelector('[data-act="open"]')?.addEventListener('click', ()=>phase8FocusTask_({ p:getActiveProject(), m, t:r.t }));
    list.appendChild(row);
  });
}

// boot phase 8 after phase 7 patch is loaded
try{ initPhase8_(); }catch(err){ console.warn('Phase8 init failed', err); }


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


/* ---------------------------
   Phase 11 Team Ops + SLA Aging (Additive Patch)
   - SLA aging rules (task/blocker/milestone stale thresholds)
   - Stale update alerts integrated into Notifications Center (Phase 8)
   - Saved Dashboard Views (jump presets for dashboard sections)
---------------------------- */
var PHASE11_SLA_CFG_KEY = 'stark_pm_phase11_sla_cfg_v1';
var PHASE11_DASH_VIEWS_KEY = 'stark_pm_phase11_dashboard_views_v1';

var phase11State_ = {
  inited:false,
  slaCfg:null,
  dashViews:null,
  scopeActiveOnly:false,
};

function initPhase11_(){
  if(phase11State_.inited) return;
  phase11State_.inited = true;
  try{ phase11InjectStyles_(); }catch(err){ console.warn('Phase11 styles failed', err); }
  try{ phase11LoadSlaCfg_(); phase11LoadDashViews_(); }catch{}
  try{ phase11WrapCore_(); }catch(err){ console.warn('Phase11 core wrap failed', err); }
  try{ phase11EnsureTopbarButtons_(); }catch(err){ console.warn('Phase11 topbar failed', err); }
}

function phase11InjectStyles_(){
  if(document.querySelector('#phase11Styles')) return;
  const style = document.createElement('style');
  style.id = 'phase11Styles';
  style.textContent = `
    .phase11-box{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    .phase11-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9;margin-bottom:8px}
    .phase11-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:10px}
    .phase11-card{border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px;background:rgba(255,255,255,.012)}
    .phase11-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .phase11-toolbar .input,.phase11-toolbar .select{min-width:120px}
    .phase11-note{font-size:11px;opacity:.8;line-height:1.35}
    .phase11-kv{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:8px}
    .phase11-kv > div{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase11-kv b{display:block;font-size:10px;opacity:.72;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px}
    .phase11-kv span{font-size:14px;font-weight:800}
    .phase11-list{display:grid;gap:8px;margin-top:8px}
    .phase11-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase11-row__name{font-size:12px;font-weight:700;line-height:1.25}
    .phase11-row__meta{font-size:11px;opacity:.78;line-height:1.3;margin-top:2px}
    .phase11-tags{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}
    .phase11-tag{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:2px 7px;font-size:10px;letter-spacing:.05em;text-transform:uppercase}
    .phase11-tag.warn{border-color:rgba(255,191,92,.25)}
    .phase11-tag.risk{border-color:rgba(255,107,107,.28)}
    .phase11-tag.ok{border-color:rgba(79,209,197,.25)}
    .phase11-two{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:8px}
    .phase11-mini{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase11-mini h4{margin:0 0 6px;font-size:11px;letter-spacing:.05em;text-transform:uppercase;opacity:.78}
    .phase11-mini .phase11-list{margin-top:0}
    .phase11-check{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.01)}
    .phase11-inlineNum{width:86px}
    @media (max-width: 980px){ .phase11-grid{grid-template-columns:1fr} .phase11-kv{grid-template-columns:1fr 1fr} .phase11-two{grid-template-columns:1fr} }
    @media (max-width: 640px){ .phase11-kv{grid-template-columns:1fr} }
  `;
  document.head.appendChild(style);
}

function phase11WrapCore_(){
  if(typeof renderDashboard === 'function' && !renderDashboard._phase11Wrapped){
    const base = renderDashboard;
    renderDashboard = function(){
      base();
      try{ phase11PostRenderDashboard_(); }catch(err){ console.warn('Phase11 dashboard render failed', err); }
    };
    renderDashboard._phase11Wrapped = true;
  }

  if(typeof phase8GenerateNotifications_ === 'function' && !phase8GenerateNotifications_._phase11WrappedSla){
    const baseGen = phase8GenerateNotifications_;
    phase8GenerateNotifications_ = function(){
      const arr = Array.isArray(baseGen()) ? baseGen() : [];
      return phase11AppendSlaNotifications_(arr);
    };
    phase8GenerateNotifications_._phase11WrappedSla = true;
  }

  if(typeof phase3BuildCmdkItems_ === 'function' && !phase3BuildCmdkItems_._phase11Wrapped){
    const baseBuild = phase3BuildCmdkItems_;
    phase3BuildCmdkItems_ = function(q){
      const items = baseBuild(q) || [];
      const query = String(q || '').trim().toLowerCase();
      const cmds = [
        { kind:'command', title:'Phase 11: SLA Aging Panel', sub:'Open dashboard SLA aging and stale alerts', tag:'PH11', act:'phase11Sla' },
        { kind:'command', title:'Phase 11: Dashboard Views', sub:'Open saved dashboard views panel', tag:'PH11', act:'phase11DashViews' },
      ];
      for(const c of cmds){
        const hay = `${c.title} ${c.sub} ${c.tag}`.toLowerCase();
        if(!query || hay.includes(query)) items.push(c);
      }
      return items;
    };
    phase3BuildCmdkItems_._phase11Wrapped = true;
  }
  if(typeof phase3RunCmdkAction_ === 'function' && !phase3RunCmdkAction_._phase11Wrapped){
    const baseRun = phase3RunCmdkAction_;
    phase3RunCmdkAction_ = function(it){
      if(it && it.act === 'phase11Sla'){ phase11OpenSlaPanel_(); return; }
      if(it && it.act === 'phase11DashViews'){ phase11OpenDashViewsPanel_(); return; }
      return baseRun(it);
    };
    phase3RunCmdkAction_._phase11Wrapped = true;
  }
}

function phase11EnsureTopbarButtons_(){
  const topbarRight = document.querySelector('.topbar__right');
  if(!topbarRight) return;
  if(!document.querySelector('#phase11BtnSla')){
    const btn = document.createElement('button');
    btn.id = 'phase11BtnSla';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'SLA';
    btn.title = 'Open SLA aging + stale alerts panel';
    btn.addEventListener('click', phase11OpenSlaPanel_);
    topbarRight.appendChild(btn);
  }
  if(!document.querySelector('#phase11BtnDashViews')){
    const btn = document.createElement('button');
    btn.id = 'phase11BtnDashViews';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Dash Views';
    btn.title = 'Open saved dashboard views panel';
    btn.addEventListener('click', phase11OpenDashViewsPanel_);
    topbarRight.appendChild(btn);
  }
}

function phase11OpenSlaPanel_(){
  openPanelInOwningTab_('#phase11SlaPanel', 'dashboard', 40);
}
function phase11OpenDashViewsPanel_(){
  openPanelInOwningTab_('#phase11DashViewsPanel', 'dashboard', 40);
}

function phase11DefaultSlaCfg_(){
  return {
    enabled: true,
    alertStaleTasks: true,
    alertStaleBlockers: true,
    alertStaleMilestones: true,
    staleTaskDays: 5,
    staleBlockerDays: 2,
    staleMilestoneDays: 7,
    notifMaxPerType: 8,
  };
}
function phase11NormalizeSlaCfg_(v){
  const d = phase11DefaultSlaCfg_();
  const n = (x, fallback, min, max) => {
    const m = Number(x);
    if(!Number.isFinite(m)) return fallback;
    return Math.max(min, Math.min(max, Math.round(m)));
  };
  return {
    enabled: v?.enabled !== false,
    alertStaleTasks: v?.alertStaleTasks !== false,
    alertStaleBlockers: v?.alertStaleBlockers !== false,
    alertStaleMilestones: v?.alertStaleMilestones !== false,
    staleTaskDays: n(v?.staleTaskDays, d.staleTaskDays, 1, 365),
    staleBlockerDays: n(v?.staleBlockerDays, d.staleBlockerDays, 1, 365),
    staleMilestoneDays: n(v?.staleMilestoneDays, d.staleMilestoneDays, 1, 365),
    notifMaxPerType: n(v?.notifMaxPerType, d.notifMaxPerType, 1, 20),
  };
}
function phase11LoadSlaCfg_(){
  if(phase11State_.slaCfg) return phase11State_.slaCfg;
  let cfg = null;
  try{ cfg = JSON.parse(localStorage.getItem(PHASE11_SLA_CFG_KEY) || 'null'); }catch{ cfg = null; }
  phase11State_.slaCfg = phase11NormalizeSlaCfg_(cfg || {});
  return phase11State_.slaCfg;
}
function phase11SaveSlaCfg_(){
  try{ localStorage.setItem(PHASE11_SLA_CFG_KEY, JSON.stringify(phase11LoadSlaCfg_())); }catch{}
}

function phase11NormalizeDashView_(v){
  return {
    id: String(v?.id || uid()),
    name: String(v?.name || 'Dashboard View').trim() || 'Dashboard View',
    targetId: String(v?.targetId || ''),
    scrollY: Number.isFinite(Number(v?.scrollY)) ? Math.max(0, Math.round(Number(v.scrollY))) : 0,
    createdAt: Number(v?.createdAt || Date.now()),
    updatedAt: Number(v?.updatedAt || Date.now()),
  };
}
function phase11LoadDashViews_(){
  if(Array.isArray(phase11State_.dashViews)) return phase11State_.dashViews;
  let arr = [];
  try{ arr = JSON.parse(localStorage.getItem(PHASE11_DASH_VIEWS_KEY) || '[]') || []; }catch{ arr = []; }
  phase11State_.dashViews = Array.isArray(arr) ? arr.filter(Boolean).map(phase11NormalizeDashView_) : [];
  return phase11State_.dashViews;
}
function phase11SaveDashViews_(){
  try{ localStorage.setItem(PHASE11_DASH_VIEWS_KEY, JSON.stringify((phase11LoadDashViews_() || []).map(phase11NormalizeDashView_))); }catch{}
}

function phase11DashboardTargets_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return [];
  const nodes = Array.from(tab.querySelectorAll('[id]'));
  const out = [];
  for(const el of nodes){
    const id = String(el.id || '');
    if(!id) continue;
    if(['tab-dashboard','phase8DashboardHost','phase10DashboardHost','phase11DashboardHost'].includes(id)) continue;
    if(!/phase\d+/i.test(id)) continue;
    let label = '';
    const titleNode = el.querySelector?.('.phase8-item__title, .phase9-title, .phase10-title, .phase11-title, h3, h4');
    if(titleNode) label = String(titleNode.textContent || '').trim();
    if(!label) label = id.replace(/([a-z])([A-Z])/g, '$1 $2');
    out.push({ id, label });
  }
  const seen = new Set();
  return out.filter(x => !seen.has(x.id) && seen.add(x.id));
}

function phase11ApplyDashView_(viewOrId){
  const views = phase11LoadDashViews_();
  const v = (typeof viewOrId === 'string') ? (views.find(x => x.id === viewOrId) || null) : viewOrId;
  if(!v) return;
  switchTab('dashboard');
  const targetId = String(v.targetId || '');
  setTimeout(() => {
    const el = targetId ? document.getElementById(targetId) : null;
    if(el){
      el.scrollIntoView({ behavior:'smooth', block:'start' });
      try{ el.classList.add('is-selected'); setTimeout(()=>el.classList.remove('is-selected'), 900); }catch{}
    } else {
      try{ window.scrollTo({ top: Math.max(0, Number(v.scrollY || 0)), behavior:'smooth' }); }catch{}
    }
  }, 60);
}

function phase11TaskLastTouchTs_(t){
  let ts = Number(t?.createdAt || 0);
  if(Number.isFinite(Number(t?.updatedAt))) ts = Math.max(ts, Number(t.updatedAt));
  if(Array.isArray(t?.comments)){
    for(const c of t.comments){
      const cts = Number(c?.ts || 0);
      if(Number.isFinite(cts)) ts = Math.max(ts, cts);
    }
  }
  return ts || Date.now();
}

function phase11CollectSlaAging_(opts){
  opts = opts || {};
  const cfg = phase11LoadSlaCfg_();
  const onlyActiveProject = !!opts.onlyActiveProject;
  const DAY = 86400000;
  const now = Date.now();
  const entries = (typeof phase8AllTaskEntries_ === 'function')
    ? (phase8AllTaskEntries_({ onlyActiveProject }) || [])
    : [];

  const staleTasks = [];
  const staleBlockers = [];
  const milestoneMap = new Map();
  const bucket = { lt2:0, d2_4:0, d5_9:0, d10p:0 };
  let openCount = 0, doneCount = 0;

  for(const e of entries){
    const t = e?.t;
    if(!t) continue;
    if(t.done){ doneCount++; continue; }
    openCount++;
    const touchTs = phase11TaskLastTouchTs_(t);
    const ageDays = Math.floor((now - touchTs) / DAY);
    if(ageDays < 2) bucket.lt2++;
    else if(ageDays < 5) bucket.d2_4++;
    else if(ageDays < 10) bucket.d5_9++;
    else bucket.d10p++;

    const key = `${String(e.p?.id||'')}|${String(e.ms?.id||'')}`;
    const agg = milestoneMap.get(key) || { p:e.p, mod:e.mod, ms:e.ms, open:0, oldestOpenAgeDays:0, newestTouchTs:0, blockerOpen:0 };
    agg.open++;
    agg.oldestOpenAgeDays = Math.max(agg.oldestOpenAgeDays, ageDays);
    agg.newestTouchTs = Math.max(agg.newestTouchTs, touchTs);
    if(t.severity === 'blocker') agg.blockerOpen++;
    milestoneMap.set(key, agg);

    const row = { e, t, touchTs, ageDays };
    if(ageDays >= Number(cfg.staleTaskDays || 5)) staleTasks.push(row);
    if(t.severity === 'blocker' && ageDays >= Number(cfg.staleBlockerDays || 2)) staleBlockers.push(row);
  }

  const staleMilestones = [];
  for(const agg of milestoneMap.values()){
    const ageDays = Math.floor((now - Number(agg.newestTouchTs || 0)) / DAY);
    if(agg.open > 0 && ageDays >= Number(cfg.staleMilestoneDays || 7)){
      staleMilestones.push({ ...agg, ageDays });
    }
  }

  staleTasks.sort((a,b)=> (b.ageDays - a.ageDays) || String(a.t?.title||'').localeCompare(String(b.t?.title||'')));
  staleBlockers.sort((a,b)=> (b.ageDays - a.ageDays) || String(a.t?.title||'').localeCompare(String(b.t?.title||'')));
  staleMilestones.sort((a,b)=> (b.ageDays - a.ageDays) || String(a.ms?.title||'').localeCompare(String(b.ms?.title||'')));

  return {
    now,
    cfg,
    onlyActiveProject,
    openCount,
    doneCount,
    bucket,
    staleTasks,
    staleBlockers,
    staleMilestones,
    taskTotal: entries.length,
  };
}

function phase11FocusMilestone_(x){
  if(!x || !x.p || !x.ms) return;
  try{ setActiveProject(x.p.id); }catch{}
  try{ setActiveMilestone(x.ms.id); }catch{}
  switchTab('checklist');
  setTimeout(() => document.querySelector('#taskList')?.scrollIntoView({ behavior:'smooth', block:'start' }), 80);
}

function phase11AppendSlaNotifications_(arr){
  const out = Array.isArray(arr) ? arr.slice() : [];
  const cfg = phase11LoadSlaCfg_();
  if(!cfg.enabled) return out;
  const sla = phase11CollectSlaAging_({ onlyActiveProject:false });
  const maxPerType = Math.max(1, Number(cfg.notifMaxPerType || 8));

  if(cfg.alertStaleBlockers){
    for(const r of sla.staleBlockers.slice(0, maxPerType)){
      const e = r.e;
      out.push({
        id:`ph11:staleblk:${e.p.id}:${e.ms.id}:${r.t.id}`,
        type:'staleBlocker',
        level: r.ageDays >= (cfg.staleBlockerDays + 3) ? 'urgent' : 'high',
        title:`Stale blocker: ${String(r.t.title || 'Untitled Task')}`,
        meta:`No update ~${r.ageDays}d • ${e.p.name} • ${e.ms.title}`,
        action:()=>{ if(typeof phase8FocusTask_ === 'function') phase8FocusTask_(e); else phase11FocusMilestone_(e); }
      });
    }
  }
  if(cfg.alertStaleTasks){
    for(const r of sla.staleTasks.slice(0, maxPerType)){
      const e = r.e;
      out.push({
        id:`ph11:staletask:${e.p.id}:${e.ms.id}:${r.t.id}`,
        type:'staleTask',
        level: r.ageDays >= (cfg.staleTaskDays + 5) ? 'high' : 'normal',
        title:`Stale task: ${String(r.t.title || 'Untitled Task')}`,
        meta:`No update ~${r.ageDays}d • ${e.p.name} • ${e.ms.title}`,
        action:()=>{ if(typeof phase8FocusTask_ === 'function') phase8FocusTask_(e); else phase11FocusMilestone_(e); }
      });
    }
  }
  if(cfg.alertStaleMilestones){
    for(const m of sla.staleMilestones.slice(0, maxPerType)){
      out.push({
        id:`ph11:stalems:${m.p.id}:${m.ms.id}`,
        type:'staleMilestone',
        level: m.ageDays >= (cfg.staleMilestoneDays + 7) ? 'high' : 'normal',
        title:`Stale milestone: ${String(m.ms?.title || 'Untitled Milestone')}`,
        meta:`No updates ~${m.ageDays}d • open ${m.open||0} • ${String(m.p?.name||'')}`,
        action:()=>phase11FocusMilestone_(m)
      });
    }
  }

  const seen = new Set();
  const rank = { urgent:3, high:2, normal:1 };
  return out.filter(n => !seen.has(n.id) && seen.add(n.id)).sort((a,b)=> (rank[b.level]-rank[a.level]) || String(a.title).localeCompare(String(b.title))).slice(0, 120);
}

function phase11PostRenderDashboard_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return;
  let host = document.querySelector('#phase11DashboardHost');
  if(!host){
    host = document.createElement('div');
    host.id = 'phase11DashboardHost';
    host.className = 'phase11-box';
    host.innerHTML = `
      <div class="phase11-title">Phase 11 Team Ops + SLA Aging</div>
      <div class="phase11-grid" id="phase11DashGrid">
        <div class="phase11-card" id="phase11SlaPanel"></div>
        <div class="phase11-card" id="phase11DashViewsPanel"></div>
      </div>
    `;
    tab.appendChild(host);
  }
  phase11RenderSlaPanel_();
  phase11RenderDashViewsPanel_();
}

function phase11RenderSlaPanel_(){
  const box = document.querySelector('#phase11SlaPanel');
  if(!box) return;
  const cfg = phase11LoadSlaCfg_();
  const sla = phase11CollectSlaAging_({ onlyActiveProject: !!phase11State_.scopeActiveOnly });
  const activeLabel = phase11State_.scopeActiveOnly ? (getActiveProject()?.name || 'Active project') : 'All projects';

  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">SLA Aging & Stale Update Alerts</div><div class="phase8-item__meta">Rules + stale monitoring (${escapeHtml(activeLabel)})</div></div>
    <div class="phase11-note" style="margin-top:6px">Stale means no recent task/thread activity for the configured number of days. Alerts feed into the Phase 8 Notifications Center.</div>
    <div class="phase11-toolbar" style="margin-top:8px">
      <label class="phase11-check"><span>Enabled</span><input type="checkbox" id="phase11SlaEnabled" ${cfg.enabled ? 'checked' : ''}></label>
      <label class="phase11-check"><span>Scope: Active Project</span><input type="checkbox" id="phase11SlaScope" ${phase11State_.scopeActiveOnly ? 'checked' : ''}></label>
      <button class="btn btn--ghost" type="button" id="phase11BtnSlaSave">Save Rules</button>
      <button class="btn btn--ghost" type="button" id="phase11BtnSlaRefresh">Refresh</button>
      <button class="btn btn--ghost" type="button" id="phase11BtnSlaOpenNotif">Notifications</button>
    </div>
    <div class="phase11-two">
      <div class="phase11-mini">
        <h4>Thresholds</h4>
        <div class="phase11-list">
          <label class="phase11-check"><span>Stale Task Days</span><input class="input phase11-inlineNum" id="phase11StaleTaskDays" type="number" min="1" max="365" value="${Number(cfg.staleTaskDays||5)}"></label>
          <label class="phase11-check"><span>Stale Blocker Days</span><input class="input phase11-inlineNum" id="phase11StaleBlockerDays" type="number" min="1" max="365" value="${Number(cfg.staleBlockerDays||2)}"></label>
          <label class="phase11-check"><span>Stale Milestone Days</span><input class="input phase11-inlineNum" id="phase11StaleMilestoneDays" type="number" min="1" max="365" value="${Number(cfg.staleMilestoneDays||7)}"></label>
          <label class="phase11-check"><span>Notif Max / Type</span><input class="input phase11-inlineNum" id="phase11NotifMaxPerType" type="number" min="1" max="20" value="${Number(cfg.notifMaxPerType||8)}"></label>
        </div>
      </div>
      <div class="phase11-mini">
        <h4>Notification Types</h4>
        <div class="phase11-list">
          <label class="phase11-check"><span>Stale Tasks</span><input type="checkbox" id="phase11AlertStaleTasks" ${cfg.alertStaleTasks ? 'checked' : ''}></label>
          <label class="phase11-check"><span>Stale Blockers</span><input type="checkbox" id="phase11AlertStaleBlockers" ${cfg.alertStaleBlockers ? 'checked' : ''}></label>
          <label class="phase11-check"><span>Stale Milestones</span><input type="checkbox" id="phase11AlertStaleMilestones" ${cfg.alertStaleMilestones ? 'checked' : ''}></label>
        </div>
      </div>
    </div>
    <div class="phase11-kv">
      <div><b>Open Tasks</b><span>${sla.openCount}</span></div>
      <div><b>Stale Tasks</b><span>${sla.staleTasks.length}</span></div>
      <div><b>Stale Blockers</b><span>${sla.staleBlockers.length}</span></div>
      <div><b>Stale Milestones</b><span>${sla.staleMilestones.length}</span></div>
    </div>
    <div class="phase11-two">
      <div class="phase11-mini" id="phase11SlaTopTasks"></div>
      <div class="phase11-mini" id="phase11SlaTopMilestones"></div>
    </div>
  `;

  const tasksBox = box.querySelector('#phase11SlaTopTasks');
  const msBox = box.querySelector('#phase11SlaTopMilestones');
  if(tasksBox){
    tasksBox.innerHTML = `<h4>Top stale tasks / blockers</h4><div class="phase11-list" id="phase11SlaTasksList"></div>`;
    const list = tasksBox.querySelector('#phase11SlaTasksList');
    const rows = [];
    const blockerIds = new Set((sla.staleBlockers || []).map(r => String(r.t?.id || '')));
    for(const r of (sla.staleBlockers || []).slice(0,5)) rows.push({ ...r, kind:'blocker' });
    for(const r of (sla.staleTasks || []).slice(0,8)) if(!blockerIds.has(String(r.t?.id || ''))) rows.push({ ...r, kind:'task' });
    if(!rows.length){ list.innerHTML = `<div class="phase8-empty">No stale task alerts with current thresholds.</div>`; }
    else rows.slice(0,8).forEach(r => {
      const e = r.e;
      const row = document.createElement('div');
      row.className = 'phase11-row';
      row.innerHTML = `
        <div>
          <div class="phase11-row__name">${escapeHtml(String(r.t?.title || 'Untitled Task'))}</div>
          <div class="phase11-row__meta">${escapeHtml(String(e?.p?.name || ''))} • ${escapeHtml(String(e?.ms?.title || ''))}${e?.t?.assignee ? ` • ${escapeHtml(String(e.t.assignee))}` : ''}</div>
        </div>
        <div class="phase11-tags">
          <span class="phase11-tag ${r.kind==='blocker'?'risk':'warn'}">${r.kind==='blocker' ? 'blocker' : 'task'}</span>
          <span class="phase11-tag warn">${r.ageDays}d stale</span>
          <button class="btn btn--ghost" type="button" data-open>Open</button>
        </div>
      `;
      row.querySelector('[data-open]')?.addEventListener('click', () => { if(typeof phase8FocusTask_ === 'function') phase8FocusTask_(e); else phase11FocusMilestone_(e); });
      list.appendChild(row);
    });
  }
  if(msBox){
    msBox.innerHTML = `<h4>Top stale milestones + aging buckets</h4><div class="phase11-list" id="phase11SlaMsList"></div>`;
    const list = msBox.querySelector('#phase11SlaMsList');
    const bucketRow = document.createElement('div');
    bucketRow.className = 'phase11-row';
    bucketRow.innerHTML = `
      <div>
        <div class="phase11-row__name">Open-task aging buckets</div>
        <div class="phase11-row__meta">Based on last task/thread activity time</div>
      </div>
      <div class="phase11-tags">
        <span class="phase11-tag ok">&lt;2d ${sla.bucket.lt2||0}</span>
        <span class="phase11-tag">2-4d ${sla.bucket.d2_4||0}</span>
        <span class="phase11-tag warn">5-9d ${sla.bucket.d5_9||0}</span>
        <span class="phase11-tag risk">10d+ ${sla.bucket.d10p||0}</span>
      </div>
    `;
    list.appendChild(bucketRow);
    if(!(sla.staleMilestones || []).length){
      const empty = document.createElement('div');
      empty.className = 'phase8-empty';
      empty.textContent = 'No stale milestones with current threshold.';
      list.appendChild(empty);
    } else {
      for(const m of sla.staleMilestones.slice(0,6)){
        const row = document.createElement('div');
        row.className = 'phase11-row';
        row.innerHTML = `
          <div>
            <div class="phase11-row__name">${escapeHtml(String(m.ms?.title || 'Untitled Milestone'))}</div>
            <div class="phase11-row__meta">${escapeHtml(String(m.p?.name || ''))} • open ${m.open||0}${m.blockerOpen ? ` • blockers ${m.blockerOpen}` : ''}</div>
          </div>
          <div class="phase11-tags">
            <span class="phase11-tag warn">${m.ageDays}d stale</span>
            <button class="btn btn--ghost" type="button" data-open>Open</button>
          </div>
        `;
        row.querySelector('[data-open]')?.addEventListener('click', () => phase11FocusMilestone_(m));
        list.appendChild(row);
      }
    }
  }

  box.querySelector('#phase11BtnSlaOpenNotif')?.addEventListener('click', () => {
    switchTab('dashboard');
    setTimeout(() => document.querySelector('#phase8NotificationsPanel')?.scrollIntoView({ behavior:'smooth', block:'start' }), 40);
  });
  box.querySelector('#phase11BtnSlaRefresh')?.addEventListener('click', () => {
    try{ if(typeof phase8RenderNotificationsPanel_ === 'function') phase8RenderNotificationsPanel_(); }catch{}
    phase11RenderSlaPanel_();
  });
  box.querySelector('#phase11SlaScope')?.addEventListener('change', (e) => { phase11State_.scopeActiveOnly = !!e.target.checked; phase11RenderSlaPanel_(); });
  box.querySelector('#phase11BtnSlaSave')?.addEventListener('click', () => {
    const next = phase11NormalizeSlaCfg_({
      enabled: !!box.querySelector('#phase11SlaEnabled')?.checked,
      alertStaleTasks: !!box.querySelector('#phase11AlertStaleTasks')?.checked,
      alertStaleBlockers: !!box.querySelector('#phase11AlertStaleBlockers')?.checked,
      alertStaleMilestones: !!box.querySelector('#phase11AlertStaleMilestones')?.checked,
      staleTaskDays: Number(box.querySelector('#phase11StaleTaskDays')?.value || cfg.staleTaskDays),
      staleBlockerDays: Number(box.querySelector('#phase11StaleBlockerDays')?.value || cfg.staleBlockerDays),
      staleMilestoneDays: Number(box.querySelector('#phase11StaleMilestoneDays')?.value || cfg.staleMilestoneDays),
      notifMaxPerType: Number(box.querySelector('#phase11NotifMaxPerType')?.value || cfg.notifMaxPerType),
    });
    phase11State_.slaCfg = next;
    phase11SaveSlaCfg_();
    addActivity(`Phase11 SLA rules updated (task ${next.staleTaskDays}d, blocker ${next.staleBlockerDays}d, milestone ${next.staleMilestoneDays}d)`);
    try{ if(typeof phase8RenderNotificationsPanel_ === 'function') phase8RenderNotificationsPanel_(); }catch{}
    phase11RenderSlaPanel_();
  });
}

function phase11RenderDashViewsPanel_(){
  const box = document.querySelector('#phase11DashViewsPanel');
  if(!box) return;
  const views = phase11LoadDashViews_().slice().sort((a,b)=> Number(b.updatedAt||0)-Number(a.updatedAt||0));
  const targets = phase11DashboardTargets_();
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Saved Dashboard Views</div><div class="phase8-item__meta">Jump presets for dashboard sections</div></div>
    <div class="phase11-note" style="margin-top:6px">Save named dashboard jump points (panel target + current scroll position). Useful for daily PM routines (SLA, Notifications, Health, Recovery, etc.).</div>
    <div class="phase11-toolbar" style="margin-top:8px">
      <input class="input" id="phase11DashViewName" type="text" placeholder="View name (e.g. Morning Ops)" />
      <select class="select" id="phase11DashViewTarget">
        <option value="">— Current scroll position only —</option>
        ${targets.map(t => `<option value="${escapeHtml(String(t.id))}">${escapeHtml(String(t.label))}</option>`).join('')}
      </select>
      <button class="btn btn--ghost" type="button" id="phase11BtnSaveDashView">Save Current View</button>
    </div>
    <div class="phase11-toolbar" style="margin-top:8px">
      <select class="select" id="phase11SavedDashViewsSelect">
        <option value="">— Select saved dashboard view —</option>
        ${views.map(v => `<option value="${escapeHtml(String(v.id))}">${escapeHtml(String(v.name))}${v.targetId ? ` • ${escapeHtml(String(v.targetId))}` : ''}</option>`).join('')}
      </select>
      <button class="btn btn--ghost" type="button" id="phase11BtnOpenDashView">Open Selected</button>
      <button class="btn btn--ghost" type="button" id="phase11BtnDeleteDashView">Delete Selected</button>
    </div>
    <div class="phase11-list" id="phase11DashViewsList"></div>
  `;

  const list = box.querySelector('#phase11DashViewsList');
  if(!views.length){
    list.innerHTML = `<div class="phase8-empty">No saved dashboard views yet. Save one for your daily PM workflow.</div>`;
  } else {
    for(const v of views.slice(0,12)){
      const row = document.createElement('div');
      row.className = 'phase11-row';
      const targetLabel = (targets.find(t => t.id === v.targetId)?.label) || (v.targetId ? v.targetId : 'Current scroll');
      row.innerHTML = `
        <div>
          <div class="phase11-row__name">${escapeHtml(String(v.name))}</div>
          <div class="phase11-row__meta">${escapeHtml(String(targetLabel))} • ${new Date(Number(v.updatedAt||v.createdAt||Date.now())).toLocaleString()}</div>
        </div>
        <div class="phase11-tags">
          ${v.targetId ? `<span class="phase11-tag">${escapeHtml(String(v.targetId))}</span>` : `<span class="phase11-tag ok">scroll</span>`}
          <button class="btn btn--ghost" type="button" data-open>Open</button>
          <button class="btn btn--ghost" type="button" data-del>Delete</button>
        </div>
      `;
      row.querySelector('[data-open]')?.addEventListener('click', ()=> phase11ApplyDashView_(v));
      row.querySelector('[data-del]')?.addEventListener('click', async ()=> {
        const okDelete = await pmConfirmDialog_(`Delete dashboard view "${v.name}"?`, { title:'Delete Dashboard View', okText:'Delete', danger:true });
        if(!okDelete) return;
        phase11State_.dashViews = phase11LoadDashViews_().filter(x => x.id !== v.id);
        phase11SaveDashViews_();
        addActivity(`Phase11 deleted dashboard view: ${v.name}`);
        phase11RenderDashViewsPanel_();
      });
      list.appendChild(row);
    }
  }

  box.querySelector('#phase11BtnSaveDashView')?.addEventListener('click', () => {
    const nameRaw = String(box.querySelector('#phase11DashViewName')?.value || '').trim();
    const targetId = String(box.querySelector('#phase11DashViewTarget')?.value || '');
    const name = nameRaw || (targetId ? `Dashboard • ${targetId}` : `Dashboard • ${new Date().toLocaleTimeString()}`);
    const viewsArr = phase11LoadDashViews_();
    const item = phase11NormalizeDashView_({ id: uid(), name, targetId, scrollY: Math.round(window.scrollY || 0), createdAt: Date.now(), updatedAt: Date.now() });
    viewsArr.unshift(item);
    phase11State_.dashViews = viewsArr.slice(0, 30);
    phase11SaveDashViews_();
    addActivity(`Phase11 saved dashboard view: ${item.name}`);
    phase11RenderDashViewsPanel_();
  });

  box.querySelector('#phase11BtnOpenDashView')?.addEventListener('click', () => {
    const id = String(box.querySelector('#phase11SavedDashViewsSelect')?.value || '');
    if(!id){ alert('Select a saved dashboard view first.'); return; }
    phase11ApplyDashView_(id);
  });
  box.querySelector('#phase11BtnDeleteDashView')?.addEventListener('click', async () => {
    const id = String(box.querySelector('#phase11SavedDashViewsSelect')?.value || '');
    if(!id){ alert('Select a saved dashboard view first.'); return; }
    const v = phase11LoadDashViews_().find(x => x.id === id);
    if(!v) return;
    const okDelete = await pmConfirmDialog_(`Delete dashboard view "${v.name}"?`, { title:'Delete Dashboard View', okText:'Delete', danger:true });
    if(!okDelete) return;
    phase11State_.dashViews = phase11LoadDashViews_().filter(x => x.id !== id);
    phase11SaveDashViews_();
    addActivity(`Phase11 deleted dashboard view: ${v.name}`);
    phase11RenderDashViewsPanel_();
  });
}

try{ initPhase11_(); }catch(err){ console.warn('Phase11 init failed', err); }


/* ---------------------------
   Phase 12 Team Execution Automation (Additive Patch)
   - SLA breach actions (nudge / assign / escalate) from stale alerts
   - Stale status audit transitions (breach/recovery) into activity trail
   - Saved dashboard views export/import (portable JSON)
   - Assignee check-in generator from stale/blocker workload
   - Risk digest export (TXT / MD)
---------------------------- */
var PHASE12_CFG_KEY = 'stark_pm_phase12_cfg_v1';
var PHASE12_STALE_AUDIT_KEY = 'stark_pm_phase12_stale_audit_v1';
var phase12State_ = {
  inited:false,
  cfg:null,
  staleAudit:null,
  lastAuditScanTs:0,
};

function initPhase12_(){
  if(phase12State_.inited) return;
  phase12State_.inited = true;
  try{ phase12InjectStyles_(); }catch(err){ console.warn('Phase12 styles failed', err); }
  try{ phase12LoadCfg_(); phase12LoadStaleAuditState_(); }catch{}
  try{ phase12WrapCore_(); }catch(err){ console.warn('Phase12 wrap failed', err); }
  try{ phase12EnsureTopbarButtons_(); }catch(err){ console.warn('Phase12 topbar failed', err); }
}

function phase12InjectStyles_(){
  if(document.querySelector('#phase12Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase12Styles';
  st.textContent = `
    .phase12-box{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    .phase12-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9;margin-bottom:8px}
    .phase12-grid{display:grid;grid-template-columns:1.05fr .95fr;gap:10px}
    .phase12-card{border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px;background:rgba(255,255,255,.012)}
    .phase12-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .phase12-note{font-size:11px;opacity:.8;line-height:1.35}
    .phase12-list{display:grid;gap:8px;margin-top:8px}
    .phase12-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase12-row__name{font-size:12px;font-weight:700;line-height:1.25}
    .phase12-row__meta{font-size:11px;opacity:.78;line-height:1.3;margin-top:2px}
    .phase12-tags{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end;align-items:center}
    .phase12-tag{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:2px 7px;font-size:10px;letter-spacing:.05em;text-transform:uppercase}
    .phase12-tag.warn{border-color:rgba(255,191,92,.25)}
    .phase12-tag.risk{border-color:rgba(255,107,107,.28)}
    .phase12-kv{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:8px}
    .phase12-kv > div{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase12-kv b{display:block;font-size:10px;opacity:.72;font-weight:700;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px}
    .phase12-kv span{font-size:14px;font-weight:800}
    .phase12-pre{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;line-height:1.35;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.14);margin-top:8px}
    .phase12-inlineNum{width:90px}
    .phase12-check{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.05);background:rgba(255,255,255,.01)}
    .phase12-notifExtra{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}
    @media (max-width: 980px){ .phase12-grid{grid-template-columns:1fr} .phase12-kv{grid-template-columns:1fr 1fr} }
    @media (max-width: 640px){ .phase12-kv{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase12DefaultCfg_(){
  return {
    staleAuditEnabled: true,
    staleAuditCooldownMin: 10,
    dashViewImportMode: 'merge',
    checkinDueHour: 9,
    checkinIncludeStale: true,
    checkinIncludeBlocked: true,
    riskDigestAllProjects: true,
  };
}
function phase12LoadCfg_(){
  if(phase12State_.cfg) return phase12State_.cfg;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE12_CFG_KEY) || 'null'); }catch{}
  const d = phase12DefaultCfg_();
  const x = (raw && typeof raw === 'object') ? raw : {};
  phase12State_.cfg = {
    staleAuditEnabled: x.staleAuditEnabled !== false,
    staleAuditCooldownMin: Math.max(1, Math.min(240, Number(x.staleAuditCooldownMin || d.staleAuditCooldownMin))),
    dashViewImportMode: (x.dashViewImportMode === 'replace') ? 'replace' : 'merge',
    checkinDueHour: Math.max(0, Math.min(23, Number(x.checkinDueHour ?? d.checkinDueHour))),
    checkinIncludeStale: x.checkinIncludeStale !== false,
    checkinIncludeBlocked: x.checkinIncludeBlocked !== false,
    riskDigestAllProjects: x.riskDigestAllProjects !== false,
  };
  return phase12State_.cfg;
}
function phase12SaveCfg_(){ try{ localStorage.setItem(PHASE12_CFG_KEY, JSON.stringify(phase12LoadCfg_())); }catch{} }

function phase12LoadStaleAuditState_(){
  if(phase12State_.staleAudit) return phase12State_.staleAudit;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE12_STALE_AUDIT_KEY) || 'null'); }catch{}
  const base = (raw && typeof raw === 'object') ? raw : {};
  phase12State_.staleAudit = {
    active: (base.active && typeof base.active === 'object') ? base.active : {},
    lastScanTs: Number(base.lastScanTs || 0),
    lastTransitionsTs: Number(base.lastTransitionsTs || 0),
  };
  return phase12State_.staleAudit;
}
function phase12SaveStaleAuditState_(){ try{ localStorage.setItem(PHASE12_STALE_AUDIT_KEY, JSON.stringify(phase12LoadStaleAuditState_())); }catch{} }

function phase12WrapCore_(){
  if(typeof renderDashboard === 'function' && !renderDashboard._phase12Wrapped){
    const _orig = renderDashboard;
    renderDashboard = function(){
      const ret = _orig.apply(this, arguments);
      try{ phase12RunStaleAuditScan_(); }catch(err){ console.warn('Phase12 stale audit scan failed', err); }
      try{ phase12PostRenderDashboard_(); }catch(err){ console.warn('Phase12 dashboard render failed', err); }
      return ret;
    };
    renderDashboard._phase12Wrapped = true;
  }
  if(typeof phase8RenderNotificationsPanel_ === 'function' && !phase8RenderNotificationsPanel_._phase12Wrapped){
    const _orig = phase8RenderNotificationsPanel_;
    phase8RenderNotificationsPanel_ = function(){
      const ret = _orig.apply(this, arguments);
      try{ phase12EnhanceNotificationsPanel_(); }catch(err){ console.warn('Phase12 notif enhance failed', err); }
      return ret;
    };
    phase8RenderNotificationsPanel_._phase12Wrapped = true;
  }
  if(typeof phase11RenderDashViewsPanel_ === 'function' && !phase11RenderDashViewsPanel_._phase12Wrapped){
    const _orig = phase11RenderDashViewsPanel_;
    phase11RenderDashViewsPanel_ = function(){
      const ret = _orig.apply(this, arguments);
      try{ phase12EnhanceDashViewsPanel_(); }catch(err){ console.warn('Phase12 dash views io enhance failed', err); }
      return ret;
    };
    phase11RenderDashViewsPanel_._phase12Wrapped = true;
  }
  if(typeof phase3BuildCmdkItems_ === 'function' && !phase3BuildCmdkItems_._phase12Wrapped){
    const _orig = phase3BuildCmdkItems_;
    phase3BuildCmdkItems_ = function(){
      const arr = _orig.apply(this, arguments) || [];
      arr.push(
        { kind:'command', title:'Phase 12: Risk Digest Export', sub:'Open dashboard risk digest panel', tag:'PH12', act:'phase12RiskDigest' },
        { kind:'command', title:'Phase 12: Generate Assignee Check-ins', sub:'Create check-in tasks from stale/blocker workload', tag:'PH12', act:'phase12Checkins' },
        { kind:'command', title:'Phase 12: Dashboard Views Import/Export', sub:'Open dashboard views portability tools', tag:'PH12', act:'phase12DashIo' },
      );
      return arr;
    };
    phase3BuildCmdkItems_._phase12Wrapped = true;
  }
  if(typeof phase3RunCmdkAction_ === 'function' && !phase3RunCmdkAction_._phase12Wrapped){
    const _orig = phase3RunCmdkAction_;
    phase3RunCmdkAction_ = function(it){
      if(it && it.act === 'phase12RiskDigest'){ phase12OpenRiskDigestPanel_(); return; }
      if(it && it.act === 'phase12Checkins'){ phase12OpenCheckinPanel_(); return; }
      if(it && it.act === 'phase12DashIo'){ phase12OpenDashViewsIo_(); return; }
      return _orig.apply(this, arguments);
    };
    phase3RunCmdkAction_._phase12Wrapped = true;
  }
}

function phase12EnsureTopbarButtons_(){
  const topbarRight = document.querySelector('#topbarRight') || document.querySelector('.topbar__right') || document.querySelector('.topbar-right');
  if(!topbarRight) return;
  if(!document.querySelector('#phase12BtnRiskDigest')){
    const btn = document.createElement('button');
    btn.id = 'phase12BtnRiskDigest';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Risk Digest';
    btn.title = 'Open risk digest export panel';
    btn.addEventListener('click', phase12OpenRiskDigestPanel_);
    topbarRight.appendChild(btn);
  }
  if(!document.querySelector('#phase12BtnCheckins')){
    const btn = document.createElement('button');
    btn.id = 'phase12BtnCheckins';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Check-ins';
    btn.title = 'Open assignee check-in generator';
    btn.addEventListener('click', phase12OpenCheckinPanel_);
    topbarRight.appendChild(btn);
  }
}

function phase12OpenRiskDigestPanel_(){ openPanelInOwningTab_('#phase12RiskDigestPanel', 'dashboard', 40); }
function phase12OpenCheckinPanel_(){ openPanelInOwningTab_('#phase12CheckinPanel', 'dashboard', 40); }
function phase12OpenDashViewsIo_(){ openPanelInOwningTab_('#phase12DashViewsIoBox', 'dashboard', 40); }

function phase12PostRenderDashboard_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return;
  let host = document.querySelector('#phase12DashboardHost');
  if(!host){
    host = document.createElement('div');
    host.id = 'phase12DashboardHost';
    host.className = 'phase12-box';
    host.innerHTML = `
      <div class="phase12-title">Phase 12 Team Execution Automation</div>
      <div class="phase12-grid" id="phase12DashGridA">
        <div class="phase12-card" id="phase12RiskDigestPanel"></div>
        <div class="phase12-card" id="phase12CheckinPanel"></div>
      </div>
      <div class="phase12-grid" id="phase12DashGridB" style="margin-top:10px">
        <div class="phase12-card" id="phase12StaleAuditPanel"></div>
        <div class="phase12-card" id="phase12DashViewsIoPanel"></div>
      </div>
    `;
    tab.appendChild(host);
  }
  phase12RenderRiskDigestPanel_();
  phase12RenderCheckinPanel_();
  phase12RenderStaleAuditPanel_();
  phase12RenderDashViewsIoPanel_();
}

function phase12AllTaskEntries_(){
  const rows = [];
  for(const p of (state.projects || [])){
    for(const mod of (p?.modules || [])){
      for(const ms of (mod?.milestones || [])){
        for(const t of (ms?.tasks || [])) rows.push({ p, mod, ms, t });
      }
    }
  }
  return rows;
}

function phase12ResolveSlaTargetFromNotif_(notif){
  const id = String(notif?.id || '');
  if(!id.startsWith('ph11:')) return null;
  const parts = id.split(':');
  const typ = parts[1] || '';
  if(typ === 'stalems'){
    const pId = parts[2], mId = parts[3];
    const p = (state.projects || []).find(x => String(x?.id) === String(pId));
    if(!p) return null;
    for(const mod of (p.modules || [])){
      const ms = (mod.milestones || []).find(x => String(x?.id) === String(mId));
      if(ms) return { kind:'milestone', staleType:'milestone', p, mod, ms };
    }
    return null;
  }
  if(typ === 'staletask' || typ === 'staleblk'){
    const pId = parts[2], mId = parts[3], tId = parts[4];
    const p = (state.projects || []).find(x => String(x?.id) === String(pId));
    if(!p) return null;
    for(const mod of (p.modules || [])){
      const ms = (mod.milestones || []).find(x => String(x?.id) === String(mId));
      if(!ms) continue;
      const t = (ms.tasks || []).find(x => String(x?.id) === String(tId));
      if(t) return { kind:'task', staleType: (typ === 'staleblk' ? 'blocker' : 'task'), p, mod, ms, t };
    }
  }
  return null;
}

function phase12EnsureTaskCommentsArray_(t){
  if(!t || typeof t !== 'object') return [];
  try{
    if(typeof phase9EnsureTaskComments_ === 'function') return phase9EnsureTaskComments_(t);
  }catch{}
  if(!Array.isArray(t.comments)) t.comments = [];
  return t.comments;
}

async function phase12ApplySlaAction_(notif, action){
  const ref = phase12ResolveSlaTargetFromNotif_(notif);
  if(!ref){ alert('Target item not found (it may have been changed/removed).'); return; }
  const nowTxt = new Date().toLocaleString();
  if(action === 'nudge'){
    if(ref.kind === 'task'){
      const msg = await pmPromptDialog_('Nudge note to append (task thread). Leave blank for default message.', `Stale ${ref.staleType} follow-up review requested.`, { title:'SLA Nudge (Task)', placeholder:'Optional nudge note' });
      if(msg == null) return;
      const comments = phase12EnsureTaskCommentsArray_(ref.t);
      comments.push({ id: uid(), ts: Date.now(), author: 'SYSTEM', text: String(msg).trim() || `Stale ${ref.staleType} nudge sent (${nowTxt})` });
      ref.t.comments = comments;
      addActivity(`Phase12 nudge sent for stale ${ref.staleType}: ${ref.t.title}`);
    } else {
      const msg = await pmPromptDialog_('Milestone nudge note to append to milestone notes:', `Stale milestone follow-up requested (${nowTxt}).`, { title:'SLA Nudge (Milestone)', placeholder:'Optional nudge note' });
      if(msg == null) return;
      const line = String(msg).trim() || `Stale milestone nudge (${nowTxt})`;
      ref.ms.notes = String(ref.ms.notes || '') + (String(ref.ms.notes || '').trim() ? `\n` : '') + `[Phase12] ${line}`;
      addActivity(`Phase12 milestone nudge: ${ref.ms.title}`);
    }
    saveState(); renderAll();
    return;
  }
  if(action === 'assign'){
    if(ref.kind !== 'task'){ alert('Assign action is available for task alerts only.'); return; }
    const seed = String(ref.t.assignee || '');
    const who = await pmPromptDialog_(`Assign/reassign task:\n${ref.t.title}`, seed || '', { title:'SLA Assign Task', placeholder:'Assignee name' });
    if(who == null) return;
    ref.t.assignee = String(who).trim();
    const comments = phase12EnsureTaskCommentsArray_(ref.t);
    comments.push({ id: uid(), ts: Date.now(), author: 'SYSTEM', text: `SLA assign action: ${ref.t.assignee || 'Unassigned'} (${nowTxt})` });
    addActivity(`Phase12 SLA assign: ${ref.t.title} -> ${ref.t.assignee || 'Unassigned'}`);
    saveState(); renderAll();
    return;
  }
  if(action === 'escalate'){
    if(ref.kind === 'task'){
      const nextSeverity = ref.staleType === 'blocker' ? 'blocker' : (ref.t.severity === 'normal' ? 'high' : ref.t.severity);
      ref.t.severity = nextSeverity;
      const comments = phase12EnsureTaskCommentsArray_(ref.t);
      comments.push({ id: uid(), ts: Date.now(), author: 'SYSTEM', text: `SLA escalation action applied (${nowTxt})` });
      addActivity(`Phase12 escalated stale ${ref.staleType}: ${ref.t.title} (${nextSeverity})`);
    } else {
      const t = (typeof mkTask === 'function') ? mkTask(`Escalation: stale milestone ${ref.ms.title}`, false) : { id:uid(), title:`Escalation: stale milestone ${ref.ms.title}`, done:false, severity:'high', assignee:'', createdAt:Date.now(), steps:[] };
      t.severity = 'high';
      t.assignee = '';
      t.notes = `Generated by Phase12 SLA escalation for stale milestone. Project: ${ref.p.name}\nMilestone: ${ref.ms.title}`;
      t.steps = [{ id: uid(), text:'Review stalled milestone blockers and next actions', done:false, children:[] }];
      ref.ms.tasks = Array.isArray(ref.ms.tasks) ? ref.ms.tasks : [];
      ref.ms.tasks.unshift(t);
      addActivity(`Phase12 escalated stale milestone: ${ref.ms.title}`);
    }
    saveState(); renderAll();
    return;
  }
}

function phase12EnhanceNotificationsPanel_(){
  const box = document.querySelector('#phase8NotificationsPanel');
  if(!box) return;
  const list = box.querySelector('#phase8NotifList');
  if(!list) return;
  if(typeof phase8GenerateNotifications_ !== 'function' || typeof phase8LoadNotifyState_ !== 'function') return;
  const st = phase8LoadNotifyState_();
  const visible = (phase8GenerateNotifications_() || []).filter(n => !((st.dismissed || []).includes(n.id))).slice(0,30);
  const rows = Array.from(list.children || []).filter(el => el && el.classList && el.classList.contains('phase8-item'));
  for(let i=0;i<rows.length && i<visible.length;i++){
    const row = rows[i];
    const n = visible[i];
    if(!n || !String(n.id||'').startsWith('ph11:stale')) continue;
    let extra = row.querySelector('.phase12-notifExtra');
    if(!extra){
      extra = document.createElement('div');
      extra.className = 'phase12-notifExtra';
      extra.innerHTML = `
        <button class="btn btn--ghost" type="button" data-p12="nudge">Nudge</button>
        <button class="btn btn--ghost" type="button" data-p12="assign">Assign</button>
        <button class="btn btn--ghost" type="button" data-p12="escalate">Escalate</button>
      `;
      row.appendChild(extra);
      extra.querySelector('[data-p12="nudge"]')?.addEventListener('click', ()=> phase12ApplySlaAction_(n, 'nudge'));
      extra.querySelector('[data-p12="assign"]')?.addEventListener('click', ()=> phase12ApplySlaAction_(n, 'assign'));
      extra.querySelector('[data-p12="escalate"]')?.addEventListener('click', ()=> phase12ApplySlaAction_(n, 'escalate'));
    }
    if(String(n.id||'').includes(':stalems:')){
      const assignBtn = extra.querySelector('[data-p12="assign"]');
      if(assignBtn){ assignBtn.disabled = true; assignBtn.title = 'Assign is task-only'; }
    }
  }
}

function phase12RunStaleAuditScan_(force){
  const cfg = phase12LoadCfg_();
  if(!cfg.staleAuditEnabled || typeof phase11CollectSlaAging_ !== 'function') return;
  const st = phase12LoadStaleAuditState_();
  const now = Date.now();
  const minGap = Math.max(1, Number(cfg.staleAuditCooldownMin || 10)) * 60000;
  if(!force && (now - Number(st.lastScanTs || 0) < Math.min(minGap, 20000))) return;
  const sla = phase11CollectSlaAging_({ onlyActiveProject:false });
  const nextActive = {};
  const metaByKey = {};
  const pushTask = (r, kind) => {
    if(!r || !r.e || !r.t) return;
    const key = `task|${kind}|${r.e.p.id}|${r.e.ms.id}|${r.t.id}`;
    nextActive[key] = now;
    metaByKey[key] = { kind, title:String(r.t.title||'Untitled Task'), p:String(r.e.p.name||''), ms:String(r.e.ms.title||'') };
  };
  const pushMs = (m) => {
    if(!m || !m.p || !m.ms) return;
    const key = `ms|${m.p.id}|${m.ms.id}`;
    nextActive[key] = now;
    metaByKey[key] = { kind:'milestone', title:String(m.ms.title||'Untitled Milestone'), p:String(m.p.name||''), ms:String(m.ms.title||'') };
  };
  (sla.staleBlockers || []).forEach(r => pushTask(r, 'blocker'));
  (sla.staleTasks || []).forEach(r => pushTask(r, 'task'));
  (sla.staleMilestones || []).forEach(pushMs);

  const prevActive = (st.active && typeof st.active === 'object') ? st.active : {};
  const entered = Object.keys(nextActive).filter(k => !prevActive[k]);
  const recovered = Object.keys(prevActive).filter(k => !nextActive[k]);

  if(now - Number(st.lastTransitionsTs || 0) >= minGap){
    const maxLogs = 8;
    let logged = 0;
    for(const k of entered){
      const m = metaByKey[k] || {};
      const kindLabel = m.kind === 'milestone' ? 'stale milestone' : `stale ${m.kind || 'task'}`;
      addActivity(`Phase12 SLA breach: ${kindLabel} • ${m.title || 'Untitled'} • ${m.p || ''}`.trim());
      if(++logged >= maxLogs) break;
    }
    if(logged < maxLogs){
      for(const k of recovered){
        const parts = String(k).split('|');
        let title = 'item';
        let kindLabel = 'stale item';
        if(parts[0] === 'ms'){
          kindLabel = 'stale milestone';
          const pId = parts[1], mId = parts[2];
          const p = (state.projects || []).find(x => String(x.id) === pId);
          if(p){
            for(const mod of (p.modules||[])){ const ms = (mod.milestones||[]).find(x => String(x.id) === mId); if(ms){ title = ms.title; break; } }
          }
        } else if(parts[0] === 'task'){
          kindLabel = `stale ${parts[1] || 'task'}`;
          const pId = parts[2], mId = parts[3], tId = parts[4];
          const p = (state.projects || []).find(x => String(x.id) === pId);
          if(p){
            for(const mod of (p.modules||[])){
              const ms = (mod.milestones||[]).find(x => String(x.id) === mId); if(!ms) continue;
              const t = (ms.tasks||[]).find(x => String(x.id) === tId); if(t){ title = t.title; break; }
            }
          }
        }
        addActivity(`Phase12 SLA recovery: ${kindLabel} • ${title}`);
        if(++logged >= maxLogs) break;
      }
    }
    if((entered.length || recovered.length) && typeof saveState === 'function') saveState({ skipHistory:true });
    st.lastTransitionsTs = now;
  }

  st.active = nextActive;
  st.lastScanTs = now;
  phase12SaveStaleAuditState_();
}

function phase12RenderStaleAuditPanel_(){
  const box = document.querySelector('#phase12StaleAuditPanel');
  if(!box) return;
  const cfg = phase12LoadCfg_();
  const st = phase12LoadStaleAuditState_();
  const activeKeys = Object.keys(st.active || {});
  const sample = activeKeys.slice(0,6);
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Stale Audit Trail</div><div class="phase8-item__meta">Breach/recovery activity logging</div></div>
    <div class="phase12-note" style="margin-top:6px">Phase 12 logs SLA breach and recovery transitions into the activity trail using the Phase 11 stale scan. Use a cooldown to avoid spam while you are editing.</div>
    <div class="phase12-toolbar" style="margin-top:8px">
      <label class="phase12-check"><span>Enabled</span><input type="checkbox" id="phase12AuditEnabled" ${cfg.staleAuditEnabled ? 'checked' : ''}></label>
      <label class="phase12-check"><span>Cooldown (min)</span><input class="input phase12-inlineNum" type="number" min="1" max="240" id="phase12AuditCooldown" value="${Number(cfg.staleAuditCooldownMin||10)}"></label>
      <button class="btn btn--ghost" type="button" id="phase12BtnAuditSave">Save</button>
      <button class="btn btn--ghost" type="button" id="phase12BtnAuditScanNow">Scan Now</button>
      <button class="btn btn--ghost" type="button" id="phase12BtnAuditOpenLog">Open Activity</button>
    </div>
    <div class="phase12-kv">
      <div><b>Tracked active stale</b><span>${activeKeys.length}</span></div>
      <div><b>Last scan</b><span>${st.lastScanTs ? new Date(Number(st.lastScanTs)).toLocaleTimeString() : '—'}</span></div>
      <div><b>Last transitions log</b><span>${st.lastTransitionsTs ? new Date(Number(st.lastTransitionsTs)).toLocaleTimeString() : '—'}</span></div>
      <div><b>Mode</b><span>${cfg.staleAuditEnabled ? 'ON' : 'OFF'}</span></div>
    </div>
    <div class="phase12-pre">${escapeHtml(sample.length ? sample.join('\n') : 'No active stale items tracked yet.')}</div>
  `;
  box.querySelector('#phase12BtnAuditSave')?.addEventListener('click', () => {
    cfg.staleAuditEnabled = !!box.querySelector('#phase12AuditEnabled')?.checked;
    cfg.staleAuditCooldownMin = Math.max(1, Math.min(240, Number(box.querySelector('#phase12AuditCooldown')?.value || cfg.staleAuditCooldownMin)));
    phase12SaveCfg_();
    addActivity(`Phase12 stale audit rules updated (${cfg.staleAuditEnabled ? 'on' : 'off'}, ${cfg.staleAuditCooldownMin}m cooldown)`);
    saveState({ skipHistory:true });
    phase12RenderStaleAuditPanel_();
  });
  box.querySelector('#phase12BtnAuditScanNow')?.addEventListener('click', () => {
    phase12RunStaleAuditScan_(true);
    phase12RenderStaleAuditPanel_();
    if(typeof phase8RenderNotificationsPanel_ === 'function') try{ phase8RenderNotificationsPanel_(); }catch{}
  });
  box.querySelector('#phase12BtnAuditOpenLog')?.addEventListener('click', () => { switchTab('dashboard'); setTimeout(()=>document.querySelector('#dashActivityList, #phase8AuditPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 10); });
}

function phase12BuildRiskDigestData_(opts){
  const allProjects = !!(opts && opts.allProjects);
  const projects = allProjects ? (state.projects || []).slice() : (getActiveProject() ? [getActiveProject()] : []);
  const healthRows = [];
  for(const p of projects){
    let h = null;
    try{ h = (typeof phase8ScoreProjectHealth_ === 'function') ? phase8ScoreProjectHealth_(p) : null; }catch{}
    if(!h) h = { score:0, badge:'Unknown', open:0, overdue:0, blocked:0, dueSoon:0, tasks:0 };
    healthRows.push({ p, h });
  }
  healthRows.sort((a,b)=> Number(a.h.score||0)-Number(b.h.score||0));

  let sla = null;
  try{ if(typeof phase11CollectSlaAging_ === 'function') sla = phase11CollectSlaAging_({ onlyActiveProject: !allProjects }); }catch{}
  if(!sla) sla = { staleTasks:[], staleBlockers:[], staleMilestones:[], taskTotal:0, bucket:{} };

  let notifs = [];
  try{ if(typeof phase8GenerateNotifications_ === 'function') notifs = phase8GenerateNotifications_() || []; }catch{}
  const notifCounts = {};
  for(const n of notifs){ notifCounts[n.type || 'other'] = (notifCounts[n.type || 'other'] || 0) + 1; }

  const entries = phase12AllTaskEntries_().filter(e => allProjects ? true : (!projects.length ? false : e.p.id === projects[0].id));
  const topRiskTasks = [];
  for(const e of entries){
    const t = e.t;
    if(t.done) continue;
    let score = 0;
    if(t.severity === 'blocker') score += 10; else if(t.severity === 'high') score += 6; else score += 2;
    const due = Number(t.dueAt || 0);
    if(due){
      const diffDays = Math.floor((due - Date.now())/86400000);
      if(diffDays < 0) score += 8;
      else if(diffDays <= 1) score += 5;
      else if(diffDays <= 7) score += 2;
    }
    try{
      if(typeof phase4GetUnresolvedBlockers_ === 'function' && phase4GetUnresolvedBlockers_(e.ms, t).length) score += 4;
    }catch{}
    if(score <= 0) continue;
    topRiskTasks.push({ e, t, score });
  }
  topRiskTasks.sort((a,b)=> b.score-a.score || String(a.t.title).localeCompare(String(b.t.title)));

  return {
    generatedAt: Date.now(),
    allProjects,
    projects,
    healthRows,
    sla,
    notifications: notifs,
    notifCounts,
    topRiskTasks: topRiskTasks.slice(0,12),
  };
}

function phase12BuildRiskDigestText_(fmt, data){
  const md = String(fmt||'TXT').toUpperCase() === 'MD';
  const L = [];
  const title = data.allProjects ? 'Risk Digest (All Projects)' : `Risk Digest (${data.projects[0]?.name || 'Active Project'})`;
  if(md){
    L.push(`# ${title}`);
    L.push('');
    L.push(`Generated: ${new Date(Number(data.generatedAt||Date.now())).toLocaleString()}`);
    L.push('');
    L.push('## Summary');
  }else{
    L.push(title);
    L.push(`Generated: ${new Date(Number(data.generatedAt||Date.now())).toLocaleString()}`);
    L.push('');
    L.push('SUMMARY');
  }
  const sla = data.sla || {};
  const notifCounts = data.notifCounts || {};
  const sumRows = [
    ['Projects', data.projects.length],
    ['Stale blockers', (sla.staleBlockers||[]).length],
    ['Stale tasks', (sla.staleTasks||[]).length],
    ['Stale milestones', (sla.staleMilestones||[]).length],
    ['Notifications', (data.notifications||[]).length],
  ];
  sumRows.forEach(([k,v]) => L.push(md ? `- **${k}:** ${v}` : `- ${k}: ${v}`));
  L.push('');

  if(md) L.push('## Project Health'); else L.push('PROJECT HEALTH');
  if(!data.healthRows.length){
    L.push(md ? '- No active project selected.' : '- No active project selected.');
  } else {
    data.healthRows.forEach(({p,h}) => {
      const line = `${p.name} — score ${h.score} (${h.badge}) | open ${h.open}/${h.tasks} | overdue ${h.overdue} | blocked ${h.blocked} | due7 ${h.dueSoon}`;
      L.push(md ? `- ${line}` : `- ${line}`);
    });
  }
  L.push('');

  if(md) L.push('## Notifications by Type'); else L.push('NOTIFICATIONS BY TYPE');
  const notifEntries = Object.entries(notifCounts);
  if(!notifEntries.length){ L.push('- none'); }
  else notifEntries.sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]))).forEach(([k,v]) => L.push(`- ${k}: ${v}`));
  L.push('');

  if(md) L.push('## Top Risk Tasks'); else L.push('TOP RISK TASKS');
  if(!(data.topRiskTasks||[]).length){ L.push('- none'); }
  else data.topRiskTasks.forEach((r,i) => {
    const due = Number(r.t.dueAt || 0);
    const dueTxt = due ? new Date(due).toLocaleDateString() : 'no due';
    const line = `${i+1}. [${r.score}] ${r.t.title} (${r.e.p.name} • ${r.e.ms.title}) • ${r.t.severity||'normal'} • ${dueTxt}${r.t.assignee ? ` • ${r.t.assignee}` : ''}`;
    L.push(line);
  });
  L.push('');

  if(md) L.push('## SLA Aging Snapshot'); else L.push('SLA AGING SNAPSHOT');
  const bucket = sla.bucket || {};
  L.push(`- Buckets: <2d ${bucket.lt2||0}, 2-4d ${bucket.d2_4||0}, 5-9d ${bucket.d5_9||0}, 10d+ ${bucket.d10p||0}`);
  const sb = (sla.staleBlockers||[]).slice(0,5);
  const st = (sla.staleTasks||[]).slice(0,5);
  if(sb.length){
    L.push('- Stale blockers (top):');
    sb.forEach(r => L.push(`  - ${r.t?.title || 'Untitled'} • ${r.ageDays}d • ${r.e?.p?.name || ''} / ${r.e?.ms?.title || ''}`));
  }
  if(st.length){
    L.push('- Stale tasks (top):');
    st.forEach(r => L.push(`  - ${r.t?.title || 'Untitled'} • ${r.ageDays}d • ${r.e?.p?.name || ''} / ${r.e?.ms?.title || ''}`));
  }
  return L.join('\n');
}

async function phase12PromptExportRiskDigest_(){
  const cfg = phase12LoadCfg_();
  const fmtRaw = await pmPromptDialog_('Export risk digest as TXT or MD?', 'MD', { title:'Risk Digest Export', placeholder:'TXT or MD' });
  if(fmtRaw == null) return;
  const fmt = String(fmtRaw).trim().toUpperCase() === 'TXT' ? 'TXT' : 'MD';
  const scopeRaw = await pmPromptDialog_('Scope risk digest to ACTIVE project only? (yes/no)', cfg.riskDigestAllProjects ? 'no' : 'yes', { title:'Risk Digest Scope', placeholder:'yes or no' });
  if(scopeRaw == null) return;
  const activeOnly = /^y/i.test(String(scopeRaw).trim());
  cfg.riskDigestAllProjects = !activeOnly; phase12SaveCfg_();
  const data = phase12BuildRiskDigestData_({ allProjects: !activeOnly });
  const text = phase12BuildRiskDigestText_(fmt, data);
  const fn = `risk_digest_${!activeOnly ? 'all' : 'active'}_${new Date().toISOString().slice(0,10)}.${fmt === 'MD' ? 'md' : 'txt'}`;
  downloadText(fn, text, fmt === 'MD' ? 'text/markdown' : 'text/plain');
  addActivity(`Phase12 exported risk digest (${fmt}, ${!activeOnly ? 'all projects' : 'active project'})`);
  saveState({ skipHistory:true });
}

function phase12RenderRiskDigestPanel_(){
  const box = document.querySelector('#phase12RiskDigestPanel');
  if(!box) return;
  const cfg = phase12LoadCfg_();
  const data = phase12BuildRiskDigestData_({ allProjects: !!cfg.riskDigestAllProjects });
  const rows = data.healthRows || [];
  const worst = rows[0] || null;
  const topNotifs = Object.entries(data.notifCounts || {}).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const preview = phase12BuildRiskDigestText_('TXT', data).split('\n').slice(0,14).join('\n');
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Risk Digest Export</div><div class="phase8-item__meta">Daily/weekly PM risk summary (TXT/MD)</div></div>
    <div class="phase12-toolbar" style="margin-top:8px">
      <label class="phase12-check"><span>Scope: All Projects</span><input type="checkbox" id="phase12RiskAllProjects" ${cfg.riskDigestAllProjects ? 'checked' : ''}></label>
      <button class="btn btn--ghost" type="button" id="phase12BtnRefreshDigest">Refresh</button>
      <button class="btn btn--ghost" type="button" id="phase12BtnExportDigestMd">Export MD</button>
      <button class="btn btn--ghost" type="button" id="phase12BtnExportDigestTxt">Export TXT</button>
      <button class="btn btn--ghost" type="button" id="phase12BtnCopyDigestPreview">Copy Preview</button>
    </div>
    <div class="phase12-kv">
      <div><b>Projects</b><span>${data.projects.length}</span></div>
      <div><b>Worst Health</b><span>${worst ? `${worst.h.score} (${escapeHtml(String(worst.p?.name||''))})` : '—'}</span></div>
      <div><b>Stale Blockers</b><span>${(data.sla?.staleBlockers||[]).length}</span></div>
      <div><b>Notifications</b><span>${(data.notifications||[]).length}</span></div>
    </div>
    <div class="phase12-list">
      <div class="phase12-row"><div><div class="phase12-row__name">Top notification types</div><div class="phase12-row__meta">Counts from Notifications Center pipeline</div></div><div class="phase12-tags">${topNotifs.length ? topNotifs.map(([k,v])=>`<span class=\"phase12-tag\">${escapeHtml(String(k))} ${v}</span>`).join('') : '<span class="phase12-tag">none</span>'}</div></div>
    </div>
    <div class="phase12-pre" id="phase12RiskDigestPreview">${escapeHtml(preview)}</div>
  `;
  box.querySelector('#phase12RiskAllProjects')?.addEventListener('change', (e) => { cfg.riskDigestAllProjects = !!e.target.checked; phase12SaveCfg_(); phase12RenderRiskDigestPanel_(); });
  box.querySelector('#phase12BtnRefreshDigest')?.addEventListener('click', () => phase12RenderRiskDigestPanel_());
  box.querySelector('#phase12BtnExportDigestMd')?.addEventListener('click', () => { const d = phase12BuildRiskDigestData_({ allProjects: !!cfg.riskDigestAllProjects }); const txt = phase12BuildRiskDigestText_('MD', d); downloadText(`risk_digest_${cfg.riskDigestAllProjects?'all':'active'}_${new Date().toISOString().slice(0,10)}.md`, txt, 'text/markdown'); addActivity('Phase12 exported risk digest (MD)'); saveState({skipHistory:true}); });
  box.querySelector('#phase12BtnExportDigestTxt')?.addEventListener('click', () => { const d = phase12BuildRiskDigestData_({ allProjects: !!cfg.riskDigestAllProjects }); const txt = phase12BuildRiskDigestText_('TXT', d); downloadText(`risk_digest_${cfg.riskDigestAllProjects?'all':'active'}_${new Date().toISOString().slice(0,10)}.txt`, txt, 'text/plain'); addActivity('Phase12 exported risk digest (TXT)'); saveState({skipHistory:true}); });
  box.querySelector('#phase12BtnCopyDigestPreview')?.addEventListener('click', async () => {
    const pre = box.querySelector('#phase12RiskDigestPreview')?.textContent || '';
    try{ await navigator.clipboard.writeText(pre); addActivity('Phase12 copied risk digest preview'); saveState({skipHistory:true}); }catch{ alert('Clipboard copy failed.'); }
  });
}

function phase12TomorrowDueTs_(hour){
  const d = new Date();
  d.setDate(d.getDate()+1);
  d.setHours(Number(hour)||9, 0, 0, 0);
  return d.getTime();
}

function phase12BuildCheckinCandidatesForActiveMilestone_(){
  const p = getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  if(!p || !m) return { p, m, groups:[] };
  const cfg = phase12LoadCfg_();
  const byId = Object.create(null);
  const addItem = (t, kind, detail) => {
    if(!t || t.done) return;
    const assignee = String(t.assignee || 'Unassigned').trim() || 'Unassigned';
    byId[assignee] = byId[assignee] || { assignee, items:[], blocker:0, stale:0 };
    const row = { t, kind, detail:String(detail||'').trim() };
    byId[assignee].items.push(row);
    if(kind === 'blocked') byId[assignee].blocker++;
    if(kind === 'staleTask' || kind === 'staleBlocker') byId[assignee].stale++;
  };

  if(cfg.checkinIncludeBlocked){
    for(const t of (m.tasks || [])){
      if(t.done) continue;
      let unresolved = [];
      try{ unresolved = (typeof phase4GetUnresolvedBlockers_ === 'function') ? phase4GetUnresolvedBlockers_(m, t) : []; }catch{}
      if(unresolved.length) addItem(t, 'blocked', `${unresolved.length} blocker(s) unresolved`);
    }
  }

  if(cfg.checkinIncludeStale && typeof phase11TaskLastTouchTs_ === 'function' && typeof phase11LoadSlaCfg_ === 'function'){
    const slaCfg = phase11LoadSlaCfg_();
    const now = Date.now();
    const staleTaskMs = Math.max(1, Number(slaCfg.staleTaskDays || 5)) * 86400000;
    const staleBlockerMs = Math.max(1, Number(slaCfg.staleBlockerDays || 2)) * 86400000;
    for(const t of (m.tasks || [])){
      if(t.done) continue;
      const last = Number(phase11TaskLastTouchTs_(t) || t.createdAt || 0);
      const age = Math.max(0, Math.floor((now - last)/86400000));
      const thr = (t.severity === 'blocker') ? staleBlockerMs : staleTaskMs;
      if(now - last >= thr){
        addItem(t, t.severity === 'blocker' ? 'staleBlocker' : 'staleTask', `${age}d stale`);
      }
    }
  }

  const groups = Object.values(byId).map(g => {
    const uniq = [];
    const seen = new Set();
    for(const it of g.items){ if(!seen.has(it.t.id + '|' + it.kind)){ seen.add(it.t.id + '|' + it.kind); uniq.push(it); } }
    g.items = uniq.sort((a,b)=>{
      const ra = a.t.severity === 'blocker' ? 3 : a.t.severity === 'high' ? 2 : 1;
      const rb = b.t.severity === 'blocker' ? 3 : b.t.severity === 'high' ? 2 : 1;
      return rb-ra || String(a.t.title).localeCompare(String(b.t.title));
    });
    return g;
  }).sort((a,b)=> (b.blocker+a.items.length) - (a.blocker+b.items.length) || String(a.assignee).localeCompare(String(b.assignee)));

  return { p, m, groups };
}

function phase12GenerateAssigneeCheckins_(){
  const { p, m, groups } = phase12BuildCheckinCandidatesForActiveMilestone_();
  if(!p || !m){ alert('Select an active project and milestone first.'); return; }
  if(!groups.length){ alert('No stale/blocker check-in candidates found in the active milestone.'); return; }
  const dateKey = new Date().toISOString().slice(0,10);
  const cfg = phase12LoadCfg_();
  const dueAt = phase12TomorrowDueTs_(cfg.checkinDueHour || 9);
  let created = 0, skipped = 0;
  m.tasks = Array.isArray(m.tasks) ? m.tasks : [];
  for(const g of groups){
    const assigneeLabel = g.assignee;
    const title = `Check-in: ${assigneeLabel} • ${dateKey}`;
    const dup = (m.tasks || []).find(t => String(t.title||'') === title);
    if(dup){ skipped++; continue; }
    const t = (typeof mkTask === 'function') ? mkTask(title, false) : { id:uid(), title, done:false, severity:'normal', assignee:'', createdAt:Date.now(), steps:[] };
    t.assignee = assigneeLabel === 'Unassigned' ? '' : assigneeLabel;
    t.severity = g.blocker > 0 ? 'high' : 'normal';
    t.dueAt = dueAt;
    t.notes = `Generated by Phase12 check-in generator for ${p.name} / ${m.title}.\nItems: ${g.items.length} (blocked ${g.blocker}, stale ${g.stale}).`;
    t.steps = g.items.slice(0,12).map((it, idx) => ({ id: uid(), text: `${idx+1}. Follow up: ${it.t.title} [${it.kind}]${it.detail ? ' — ' + it.detail : ''}`, done:false, children:[] }));
    if(g.items.length > 12){ t.steps.push({ id: uid(), text:`${g.items.length-12} more item(s) not listed`, done:false, children:[] }); }
    t.phase12CheckinMeta = { generatedAt: Date.now(), assignee: assigneeLabel, sourceKinds: { blocker:g.blocker, stale:g.stale }, sourceMilestoneId: m.id };
    m.tasks.unshift(t);
    created++;
  }
  if(!created){ alert('Check-in tasks for today already exist in this milestone.'); return; }
  addActivity(`Phase12 generated ${created} assignee check-in task(s)${skipped ? ` (skipped ${skipped} duplicate)` : ''}`);
  saveState();
  renderAll();
}

function phase12RenderCheckinPanel_(){
  const box = document.querySelector('#phase12CheckinPanel');
  if(!box) return;
  const cfg = phase12LoadCfg_();
  const { p, m, groups } = phase12BuildCheckinCandidatesForActiveMilestone_();
  const totalItems = groups.reduce((n,g)=> n + g.items.length, 0);
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Assignee Check-in Generator</div><div class="phase8-item__meta">Create follow-up tasks from stale + blocked workload</div></div>
    <div class="phase12-note" style="margin-top:6px">Scope: ${p&&m ? `${escapeHtml(p.name)} • ${escapeHtml(m.title)}` : 'Select active project + milestone'}.</div>
    <div class="phase12-toolbar" style="margin-top:8px">
      <label class="phase12-check"><span>Include stale</span><input type="checkbox" id="phase12CheckinIncludeStale" ${cfg.checkinIncludeStale ? 'checked' : ''}></label>
      <label class="phase12-check"><span>Include blocked</span><input type="checkbox" id="phase12CheckinIncludeBlocked" ${cfg.checkinIncludeBlocked ? 'checked' : ''}></label>
      <label class="phase12-check"><span>Due hour (next day)</span><input class="input phase12-inlineNum" type="number" min="0" max="23" id="phase12CheckinDueHour" value="${Number(cfg.checkinDueHour||9)}"></label>
      <button class="btn btn--ghost" type="button" id="phase12BtnCheckinRefresh">Refresh</button>
      <button class="btn btn--ghost" type="button" id="phase12BtnGenerateCheckins" ${p&&m ? '' : 'disabled'}>Generate Check-ins</button>
    </div>
    <div class="phase12-kv">
      <div><b>Assignees</b><span>${groups.length}</span></div>
      <div><b>Candidate items</b><span>${totalItems}</span></div>
      <div><b>Blocked groups</b><span>${groups.filter(g=>g.blocker>0).length}</span></div>
      <div><b>Next due time</b><span>${new Date(phase12TomorrowDueTs_(cfg.checkinDueHour||9)).toLocaleString()}</span></div>
    </div>
    <div class="phase12-list" id="phase12CheckinList"></div>
  `;
  const list = box.querySelector('#phase12CheckinList');
  if(!groups.length){
    list.innerHTML = `<div class="phase8-empty">No stale/blocker candidates in the active milestone using current filters.</div>`;
  }else{
    for(const g of groups.slice(0,12)){
      const row = document.createElement('div');
      row.className = 'phase12-row';
      row.innerHTML = `
        <div>
          <div class="phase12-row__name">${escapeHtml(g.assignee)}</div>
          <div class="phase12-row__meta">${g.items.length} item(s) • blocked ${g.blocker} • stale ${g.stale}</div>
        </div>
        <div class="phase12-tags">
          ${g.blocker ? `<span class="phase12-tag risk">blocked ${g.blocker}</span>` : ''}
          ${g.stale ? `<span class="phase12-tag warn">stale ${g.stale}</span>` : ''}
          <button class="btn btn--ghost" type="button" data-open>Focus</button>
        </div>
      `;
      row.querySelector('[data-open]')?.addEventListener('click', () => {
        if(!p || !m) return;
        setActiveProject(p.id); setActiveMilestone(m.id); switchTab('checklist');
        const tid = g.items[0]?.t?.id;
        setTimeout(()=>{
          if(tid && typeof phase8FocusTask_ === 'function'){
            try{ phase8FocusTask_({ p, ms:m, t:g.items[0].t }); return; }catch{}
          }
          document.querySelector('#taskList')?.scrollIntoView({behavior:'smooth', block:'start'});
        }, 30);
      });
      list.appendChild(row);
    }
  }
  const saveUiCfg = () => {
    cfg.checkinIncludeStale = !!box.querySelector('#phase12CheckinIncludeStale')?.checked;
    cfg.checkinIncludeBlocked = !!box.querySelector('#phase12CheckinIncludeBlocked')?.checked;
    cfg.checkinDueHour = Math.max(0, Math.min(23, Number(box.querySelector('#phase12CheckinDueHour')?.value || cfg.checkinDueHour)));
    phase12SaveCfg_();
  };
  box.querySelector('#phase12BtnCheckinRefresh')?.addEventListener('click', () => { saveUiCfg(); phase12RenderCheckinPanel_(); });
  box.querySelector('#phase12BtnGenerateCheckins')?.addEventListener('click', () => { saveUiCfg(); phase12GenerateAssigneeCheckins_(); });
}

function phase12EnhanceDashViewsPanel_(){
  const box = document.querySelector('#phase11DashViewsPanel');
  if(!box || box.querySelector('#phase12DashViewsIoBox')) return;
  const wrap = document.createElement('div');
  wrap.id = 'phase12DashViewsIoBox';
  wrap.className = 'phase12-box';
  wrap.style.marginTop = '8px';
  wrap.innerHTML = `
    <div class="phase12-title">Phase 12 Dashboard Views Import / Export</div>
    <div class="phase12-note">Portable backup for Phase 11 saved dashboard views. Export to JSON and import later after browser reset or on another machine.</div>
    <div class="phase12-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" type="button" id="phase12BtnExportDashViewsJson">Export JSON</button>
      <button class="btn btn--ghost" type="button" id="phase12BtnImportDashViewsJson">Import JSON</button>
      <label class="phase12-check"><span>Replace on import</span><input type="checkbox" id="phase12DashViewsReplace"></label>
      <input type="file" id="phase12DashViewsFile" accept="application/json,.json" style="display:none" />
    </div>
  `;
  const host = box.querySelector('.phase11-list') || box;
  host.parentNode.insertBefore(wrap, host);
  const cfg = phase12LoadCfg_();
  const replaceCb = wrap.querySelector('#phase12DashViewsReplace');
  if(replaceCb) replaceCb.checked = (cfg.dashViewImportMode === 'replace');
  replaceCb?.addEventListener('change', (e) => { cfg.dashViewImportMode = e.target.checked ? 'replace' : 'merge'; phase12SaveCfg_(); });
  wrap.querySelector('#phase12BtnExportDashViewsJson')?.addEventListener('click', () => {
    const arr = (typeof phase11LoadDashViews_ === 'function') ? phase11LoadDashViews_() : [];
    const payload = { version: 1, exportedAt: Date.now(), type: 'phase11_dashboard_views', views: Array.isArray(arr) ? arr : [] };
    downloadText(`dashboard_views_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
    addActivity(`Phase12 exported dashboard views (${(payload.views||[]).length})`);
    saveState({ skipHistory:true });
  });
  wrap.querySelector('#phase12BtnImportDashViewsJson')?.addEventListener('click', () => wrap.querySelector('#phase12DashViewsFile')?.click());
  wrap.querySelector('#phase12DashViewsFile')?.addEventListener('change', async (ev) => {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if(!file) return;
    let txt = '';
    try{ txt = await file.text(); }catch{ alert('Could not read selected file.'); return; }
    let data = null;
    try{ data = JSON.parse(txt); }catch{ alert('Invalid JSON file.'); return; }
    let views = Array.isArray(data?.views) ? data.views : (Array.isArray(data) ? data : null);
    if(!views){ alert('No dashboard views found in this file.'); return; }
    views = views.filter(Boolean).map(v => (typeof phase11NormalizeDashView_ === 'function') ? phase11NormalizeDashView_(v) : v);
    const mode = cfg.dashViewImportMode === 'replace' ? 'replace' : 'merge';
    const okImport = await pmConfirmDialog_(`Import ${views.length} dashboard view(s)? Mode: ${mode}.`, { title:'Import Dashboard Views', okText:'Import' });
    if(!okImport) return;
    let next = [];
    if(mode === 'replace') next = views.slice(0, 50);
    else {
      const cur = (typeof phase11LoadDashViews_ === 'function') ? phase11LoadDashViews_().slice() : [];
      const byKey = new Map();
      for(const v of cur){ byKey.set(String(v.id||v.name||uid()), v); }
      for(const v of views){ byKey.set(String(v.id||v.name||uid()), v); }
      next = Array.from(byKey.values()).sort((a,b)=> Number(b.updatedAt||0)-Number(a.updatedAt||0)).slice(0, 50);
    }
    if(typeof phase11State_ === 'object') phase11State_.dashViews = next;
    if(typeof phase11SaveDashViews_ === 'function') phase11SaveDashViews_();
    else try{ localStorage.setItem(typeof PHASE11_DASH_VIEWS_KEY !== 'undefined' ? PHASE11_DASH_VIEWS_KEY : 'stark_pm_phase11_dashboard_views_v1', JSON.stringify(next)); }catch{}
    addActivity(`Phase12 imported dashboard views (${views.length}, ${mode})`);
    saveState({ skipHistory:true });
    try{ phase11RenderDashViewsPanel_(); }catch{ renderAll(); }
    try{ phase12RenderDashViewsIoPanel_(); }catch{}
  });
}

function phase12RenderDashViewsIoPanel_(){
  const box = document.querySelector('#phase12DashViewsIoPanel');
  if(!box) return;
  const cfg = phase12LoadCfg_();
  const views = (typeof phase11LoadDashViews_ === 'function') ? phase11LoadDashViews_() : [];
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Dashboard Views Portability</div><div class="phase8-item__meta">Backup/import saved dashboard jump presets</div></div>
    <div class="phase12-note" style="margin-top:6px">This mirrors the Phase 11 dashboard views and lets you export/import portable JSON without using the dashboard views panel directly.</div>
    <div class="phase12-toolbar" style="margin-top:8px">
      <button class="btn btn--ghost" type="button" id="phase12BtnOpenDashViewsSection">Open Dashboard Views</button>
      <button class="btn btn--ghost" type="button" id="phase12BtnDashViewsExport2">Export JSON</button>
      <button class="btn btn--ghost" type="button" id="phase12BtnDashViewsImport2">Import JSON</button>
      <label class="phase12-check"><span>Replace mode</span><input type="checkbox" id="phase12DashIoReplace" ${cfg.dashViewImportMode === 'replace' ? 'checked' : ''}></label>
    </div>
    <div class="phase12-kv">
      <div><b>Saved views</b><span>${Array.isArray(views) ? views.length : 0}</span></div>
      <div><b>Import mode</b><span>${cfg.dashViewImportMode}</span></div>
      <div><b>Latest updated</b><span>${views?.[0]?.updatedAt ? new Date(Number(views[0].updatedAt)).toLocaleDateString() : '—'}</span></div>
      <div><b>Status</b><span>ready</span></div>
    </div>
    <div class="phase12-pre">${escapeHtml((views || []).slice(0,8).map(v => `${v.name}${v.targetId ? ' • ' + v.targetId : ''}`).join('\n') || 'No saved dashboard views yet.')}</div>
  `;
  box.querySelector('#phase12BtnOpenDashViewsSection')?.addEventListener('click', phase12OpenDashViewsIo_);
  box.querySelector('#phase12BtnDashViewsExport2')?.addEventListener('click', () => document.querySelector('#phase12BtnExportDashViewsJson')?.click());
  box.querySelector('#phase12BtnDashViewsImport2')?.addEventListener('click', () => document.querySelector('#phase12BtnImportDashViewsJson')?.click());
  box.querySelector('#phase12DashIoReplace')?.addEventListener('change', (e) => { cfg.dashViewImportMode = e.target.checked ? 'replace' : 'merge'; phase12SaveCfg_(); phase12RenderDashViewsIoPanel_(); });
}

try{ initPhase12_(); }catch(err){ console.warn('Phase12 init failed', err); }



/* =========================================================
   Phase 13 Workflow Automation & Recurrence (Additive Patch)
   - Recurring generation sweeper (repair/automation)
   - SLA action rules engine (auto nudge/assign/escalate)
   - Digest scheduler presets (risk/status exports)
   - Mention follow-up tracking states (nudged/ack/reopen)
   - Bulk milestone maintenance tools
========================================================= */
var PHASE13_CFG_KEY = 'stark_pm_phase13_cfg_v1';
var PHASE13_MARKS_KEY = 'stark_pm_phase13_marks_v1';
var PHASE13_DIGEST_PRESETS_KEY = 'stark_pm_phase13_digest_presets_v1';
var PHASE13_FOLLOWUP_UI_KEY = 'stark_pm_phase13_followup_ui_v1';

var phase13State_ = {
  inited:false,
  cfg:null,
  marks:null,
  digestPresets:null,
  followupUi:null,
};

function initPhase13_(){
  if(phase13State_.inited) return;
  phase13State_.inited = true;
  try{ phase13InjectStyles_(); }catch(err){ console.warn('Phase13 styles failed', err); }
  try{ phase13WrapCore_(); }catch(err){ console.warn('Phase13 core wrap failed', err); }
  try{ phase13EnsureTopbarButtons_(); }catch(err){ console.warn('Phase13 topbar failed', err); }
  try{ phase13EnsureDigestPresetImportInput_(); }catch(err){}
}

function phase13InjectStyles_(){
  if(document.querySelector('#phase13Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase13Styles';
  st.textContent = `
    .phase13-box{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    .phase13-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9;margin-bottom:8px}
    .phase13-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
    .phase13-card{border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px;background:rgba(255,255,255,.012)}
    .phase13-toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .phase13-kv{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}
    .phase13-kv>div{padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.01)}
    .phase13-kv b{display:block;font-size:11px;opacity:.72;margin-bottom:3px}
    .phase13-kv span{font-size:13px;font-weight:700}
    .phase13-note{font-size:11px;opacity:.8;line-height:1.35}
    .phase13-list{display:grid;gap:8px;margin-top:8px}
    .phase13-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase13-row__name{font-weight:700;font-size:12px}
    .phase13-row__meta{font-size:11px;opacity:.78;line-height:1.3}
    .phase13-tags{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .phase13-tag{display:inline-flex;align-items:center;gap:4px;border:1px solid rgba(255,255,255,.08);border-radius:999px;padding:2px 8px;font-size:10px;letter-spacing:.06em;text-transform:uppercase}
    .phase13-tag.warn{border-color:rgba(255,191,92,.25)}
    .phase13-tag.risk{border-color:rgba(255,107,107,.28)}
    .phase13-inlineNum{width:86px}
    .phase13-check{display:flex;align-items:center;justify-content:space-between;gap:8px}
    .phase13-pre{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;line-height:1.35;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.14);margin-top:8px}
    @media (max-width: 980px){ .phase13-grid{grid-template-columns:1fr} .phase13-kv{grid-template-columns:1fr} .phase13-row{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase13DefaultCfg_(){
  return {
    recurringEnabled: true,
    recurringAutoRun: false,
    recurringScopeAllProjects: true,
    recurringMaxPerRun: 6,
    recurringCooldownMin: 30,

    slaRulesEnabled: false,
    slaRulesAutoRun: false,
    slaRulesScopeAllProjects: true,
    slaRulesCooldownMin: 60,
    slaRulesFallbackAssignee: '',
    slaRulesAutoNudge: true,
    slaRulesAutoAssignUnassigned: true,
    slaRulesAutoEscalate: true,
    slaRulesEscalateExtraDays: 3,

    bulkOpenOnly: true,
    bulkShiftDays: 1,
    bulkAssignee: '',
    bulkSeverity: 'high',
  };
}
function phase13LoadCfg_(){
  if(phase13State_.cfg) return phase13State_.cfg;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE13_CFG_KEY) || 'null'); }catch{}
  const d = phase13DefaultCfg_();
  const x = (raw && typeof raw === 'object') ? raw : {};
  phase13State_.cfg = {
    recurringEnabled: x.recurringEnabled !== false,
    recurringAutoRun: !!x.recurringAutoRun,
    recurringScopeAllProjects: x.recurringScopeAllProjects !== false,
    recurringMaxPerRun: Math.max(1, Math.min(50, Number(x.recurringMaxPerRun || d.recurringMaxPerRun))),
    recurringCooldownMin: Math.max(1, Math.min(1440, Number(x.recurringCooldownMin || d.recurringCooldownMin))),

    slaRulesEnabled: !!x.slaRulesEnabled,
    slaRulesAutoRun: !!x.slaRulesAutoRun,
    slaRulesScopeAllProjects: x.slaRulesScopeAllProjects !== false,
    slaRulesCooldownMin: Math.max(1, Math.min(1440, Number(x.slaRulesCooldownMin || d.slaRulesCooldownMin))),
    slaRulesFallbackAssignee: String(x.slaRulesFallbackAssignee || ''),
    slaRulesAutoNudge: x.slaRulesAutoNudge !== false,
    slaRulesAutoAssignUnassigned: x.slaRulesAutoAssignUnassigned !== false,
    slaRulesAutoEscalate: x.slaRulesAutoEscalate !== false,
    slaRulesEscalateExtraDays: Math.max(0, Math.min(60, Number(x.slaRulesEscalateExtraDays ?? d.slaRulesEscalateExtraDays))),

    bulkOpenOnly: x.bulkOpenOnly !== false,
    bulkShiftDays: Number.isFinite(Number(x.bulkShiftDays)) ? Math.max(-365, Math.min(365, Number(x.bulkShiftDays))) : d.bulkShiftDays,
    bulkAssignee: String(x.bulkAssignee || ''),
    bulkSeverity: (String(x.bulkSeverity||'') === 'blocker' || String(x.bulkSeverity||'') === 'high' || String(x.bulkSeverity||'') === 'normal') ? String(x.bulkSeverity) : d.bulkSeverity,
  };
  return phase13State_.cfg;
}
function phase13SaveCfg_(){ try{ localStorage.setItem(PHASE13_CFG_KEY, JSON.stringify(phase13LoadCfg_())); }catch{} }

function phase13LoadMarks_(){
  if(phase13State_.marks) return phase13State_.marks;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE13_MARKS_KEY) || 'null'); }catch{}
  const x = (raw && typeof raw === 'object') ? raw : {};
  phase13State_.marks = {
    recurring: (x.recurring && typeof x.recurring === 'object') ? x.recurring : {},
    sla: (x.sla && typeof x.sla === 'object') ? x.sla : {},
    engine: (x.engine && typeof x.engine === 'object') ? x.engine : { recurringLastRunTs:0, slaLastRunTs:0 },
  };
  return phase13State_.marks;
}
function phase13SaveMarks_(){ try{ localStorage.setItem(PHASE13_MARKS_KEY, JSON.stringify(phase13LoadMarks_())); }catch{} }
function phase13PruneMarks_(){
  const marks = phase13LoadMarks_();
  const now = Date.now();
  const TTL = 180 * 86400000; // ~6 months
  const pruneMap = (obj) => {
    let changed = false;
    for(const [k,v] of Object.entries(obj || {})){
      if(!Number.isFinite(Number(v)) || (now - Number(v)) > TTL){ delete obj[k]; changed = true; }
    }
    return changed;
  };
  const c1 = pruneMap(marks.recurring);
  const c2 = pruneMap(marks.sla);
  if(c1 || c2) phase13SaveMarks_();
}

function phase13LoadDigestPresets_(){
  if(Array.isArray(phase13State_.digestPresets)) return phase13State_.digestPresets;
  let arr = [];
  try{ arr = JSON.parse(localStorage.getItem(PHASE13_DIGEST_PRESETS_KEY) || '[]') || []; }catch{}
  phase13State_.digestPresets = Array.isArray(arr) ? arr.filter(Boolean).map(phase13NormalizeDigestPreset_) : [];
  return phase13State_.digestPresets;
}
function phase13SaveDigestPresets_(){ try{ localStorage.setItem(PHASE13_DIGEST_PRESETS_KEY, JSON.stringify((phase13LoadDigestPresets_()||[]).map(phase13NormalizeDigestPreset_))); }catch{} }
function phase13NormalizeDigestPreset_(v){
  return {
    id: String(v?.id || uid()),
    name: String(v?.name || 'Digest Preset').trim().slice(0,80) || 'Digest Preset',
    kind: (String(v?.kind || 'risk') === 'status') ? 'status' : 'risk',
    fmt: (String(v?.fmt || 'MD').toUpperCase() === 'TXT') ? 'TXT' : 'MD',
    allProjects: !!v?.allProjects,
    note: String(v?.note || '').slice(0,140),
    createdAt: Number(v?.createdAt || Date.now()),
    updatedAt: Number(v?.updatedAt || Date.now()),
  };
}

function phase13LoadFollowupUi_(){
  if(phase13State_.followupUi) return phase13State_.followupUi;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE13_FOLLOWUP_UI_KEY) || 'null'); }catch{}
  const x = (raw && typeof raw === 'object') ? raw : {};
  phase13State_.followupUi = {
    filter: ['all','open','nudged','ack','done'].includes(String(x.filter||'')) ? String(x.filter) : 'open',
    query: String(x.query || ''),
  };
  return phase13State_.followupUi;
}
function phase13SaveFollowupUi_(){ try{ localStorage.setItem(PHASE13_FOLLOWUP_UI_KEY, JSON.stringify(phase13LoadFollowupUi_())); }catch{} }

function phase13WrapCore_(){
  if(typeof renderDashboard === 'function' && !renderDashboard._phase13Wrapped){
    const _orig = renderDashboard;
    renderDashboard = function(){
      const ret = _orig.apply(this, arguments);
      try{ phase13MaybeRunEngines_('dashboard'); }catch(err){ console.warn('Phase13 engines dashboard failed', err); }
      try{ phase13PostRenderDashboard_(); }catch(err){ console.warn('Phase13 dashboard render failed', err); }
      return ret;
    };
    renderDashboard._phase13Wrapped = true;
  }
  if(typeof renderChecklist === 'function' && !renderChecklist._phase13Wrapped){
    const _orig = renderChecklist;
    renderChecklist = function(){
      const ret = _orig.apply(this, arguments);
      try{ phase13MaybeRunEngines_('checklist'); }catch(err){ console.warn('Phase13 engines checklist failed', err); }
      try{ phase13PostRenderChecklist_(); }catch(err){ console.warn('Phase13 checklist render failed', err); }
      return ret;
    };
    renderChecklist._phase13Wrapped = true;
  }
  if(typeof phase3BuildCmdkItems_ === 'function' && !phase3BuildCmdkItems_._phase13Wrapped){
    const _orig = phase3BuildCmdkItems_;
    phase3BuildCmdkItems_ = function(){
      const arr = _orig.apply(this, arguments) || [];
      arr.push(
        { kind:'command', title:'Phase 13: Workflow Automation', sub:'Open dashboard automation panels', tag:'PH13', act:'phase13Dashboard' },
        { kind:'command', title:'Phase 13: Bulk Milestone Maintenance', sub:'Open checklist bulk maintenance tools', tag:'PH13', act:'phase13Bulk' },
        { kind:'command', title:'Phase 13: Run Automation Sweep', sub:'Run recurring + SLA rule engines now', tag:'PH13', act:'phase13Sweep' }
      );
      return arr;
    };
    phase3BuildCmdkItems_._phase13Wrapped = true;
  }
  if(typeof phase3RunCmdkAction_ === 'function' && !phase3RunCmdkAction_._phase13Wrapped){
    const _orig = phase3RunCmdkAction_;
    phase3RunCmdkAction_ = function(it){
      if(it && it.act === 'phase13Dashboard'){ phase13OpenDashboard_(); return; }
      if(it && it.act === 'phase13Bulk'){ phase13OpenBulkPanel_(); return; }
      if(it && it.act === 'phase13Sweep'){ phase13RunAutomationSweepPrompt_(); return; }
      return _orig.apply(this, arguments);
    };
    phase3RunCmdkAction_._phase13Wrapped = true;
  }
}

function phase13EnsureTopbarButtons_(){
  const topbarRight = document.querySelector('#topbarRight') || document.querySelector('.topbar__right') || document.querySelector('.topbar-right');
  if(!topbarRight) return;
  if(!document.querySelector('#phase13BtnAutomation')){
    const btn = document.createElement('button');
    btn.id = 'phase13BtnAutomation';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Automation+';
    btn.title = 'Open Phase 13 workflow automation panels';
    btn.addEventListener('click', phase13OpenDashboard_);
    topbarRight.appendChild(btn);
  }
  if(!document.querySelector('#phase13BtnBulkMaint')){
    const btn = document.createElement('button');
    btn.id = 'phase13BtnBulkMaint';
    btn.className = 'btn btn--ghost';
    btn.type = 'button';
    btn.textContent = 'Bulk Maint';
    btn.title = 'Open Phase 13 bulk milestone maintenance panel';
    btn.addEventListener('click', phase13OpenBulkPanel_);
    topbarRight.appendChild(btn);
  }
}

function phase13OpenDashboard_(){ openPanelInOwningTab_('#phase13DashboardHost', 'dashboard', 30); }
function phase13OpenBulkPanel_(){ switchTab('checklist'); setTimeout(()=>document.querySelector('#phase13BulkMaintenancePanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); }

function phase13MaybeRunEngines_(source){
  const cfg = phase13LoadCfg_();
  const marks = phase13LoadMarks_();
  const now = Date.now();
  phase13PruneMarks_();

  if(cfg.recurringEnabled && cfg.recurringAutoRun){
    const gap = Math.max(1, Number(cfg.recurringCooldownMin || 30)) * 60000;
    if(now - Number(marks.engine.recurringLastRunTs || 0) >= gap){
      const r = phase13RunRecurringGenerationSweep_({ auto:true, noRender:true, source:source });
      if(r && r.generated > 0){
        try{ saveState({ skipHistory:true }); }catch{}
      }
      marks.engine.recurringLastRunTs = Date.now();
      phase13SaveMarks_();
    }
  }
  if(cfg.slaRulesEnabled && cfg.slaRulesAutoRun){
    const gap = Math.max(1, Number(cfg.slaRulesCooldownMin || 60)) * 60000;
    if(now - Number(marks.engine.slaLastRunTs || 0) >= gap){
      const r = phase13RunSlaRulesEngine_({ auto:true, noRender:true, source:source });
      if(r && r.changed){
        try{ saveState({ skipHistory:true }); }catch{}
      }
      marks.engine.slaLastRunTs = Date.now();
      phase13SaveMarks_();
    }
  }
}

function phase13AllTaskEntries_(){
  if(typeof phase12AllTaskEntries_ === 'function') return phase12AllTaskEntries_() || [];
  const rows = [];
  for(const p of (state.projects || [])){
    for(const mod of (p.modules || [])){
      for(const ms of (mod.milestones || [])){
        for(const t of (ms.tasks || [])) rows.push({ p, mod, ms, t });
      }
    }
  }
  return rows;
}

function phase13DateKey_(ts){
  const d = new Date(Number(ts || Date.now()));
  return d.toISOString().slice(0,10);
}

function phase13RecurringCandidateRows_(opts){
  const cfg = phase13LoadCfg_();
  const onlyActiveProject = !(opts && opts.scopeAllProjects !== undefined ? !!opts.scopeAllProjects : !!cfg.recurringScopeAllProjects);
  const active = getActiveProject && getActiveProject();
  const rows = [];
  for(const e of phase13AllTaskEntries_()){
    if(onlyActiveProject && active && e.p && String(e.p.id) !== String(active.id)) continue;
    const t = e.t || {};
    try{ if(typeof phase5NormalizeTaskMeta_ === 'function') phase5NormalizeTaskMeta_(t); }catch{}
    const every = Math.max(0, Number(t.recurrenceDays || 0));
    if(!(every > 0)) continue;
    if(!t.done) continue;
    rows.push(e);
  }
  return rows;
}
function phase13HasFutureRecurringSibling_(ms, srcTask){
  if(!ms || !Array.isArray(ms.tasks)) return false;
  const every = Math.max(0, Number(srcTask?.recurrenceDays || 0));
  if(!(every > 0)) return false;
  const srcCreated = Number(srcTask?.createdAt || 0);
  const srcDue = Number(srcTask?.dueAt || 0);
  const maxTs = (srcDue > 0 ? srcDue : srcCreated) + (every * 3 * 86400000);
  const normTitle = String(srcTask?.title || '').trim().toLowerCase();
  for(const t of (ms.tasks || [])){
    if(!t || String(t.id) === String(srcTask.id)) continue;
    const tEvery = Math.max(0, Number(t.recurrenceDays || 0));
    if(tEvery !== every) continue;
    if(String(t.title || '').trim().toLowerCase() !== normTitle) continue;
    const tCreated = Number(t.createdAt || 0);
    const tDue = Number(t.dueAt || 0);
    const anchor = tDue > 0 ? tDue : tCreated;
    if(anchor <= (srcDue > 0 ? srcDue : srcCreated)) continue;
    if(anchor > maxTs && maxTs > 0) continue;
    if(!t.done) return true;
  }
  return false;
}
function phase13RunRecurringGenerationSweep_(opts){
  opts = opts || {};
  const cfg = phase13LoadCfg_();
  const marks = phase13LoadMarks_();
  if(!cfg.recurringEnabled) return { generated:0, scanned:0, skipped:0, reasons:{} };
  const maxRun = Math.max(1, Number(opts.maxPerRun || cfg.recurringMaxPerRun || 6));
  const rows = phase13RecurringCandidateRows_({ scopeAllProjects: (opts.scopeAllProjects !== undefined ? !!opts.scopeAllProjects : !!cfg.recurringScopeAllProjects) });
  let generated = 0, skipped = 0;
  const reasons = { futureExists:0, marked:0, noFn:0 };
  for(const e of rows){
    if(generated >= maxRun) break;
    const t = e.t;
    const cycleKey = `rgen|${e.p.id}|${e.ms.id}|${t.id}|${phase13DateKey_(Number(t.dueAt || t.createdAt || Date.now()))}|${Math.max(1, Number(t.recurrenceDays || 1))}`;
    if(marks.recurring[cycleKey]){ skipped++; reasons.marked++; continue; }
    if(phase13HasFutureRecurringSibling_(e.ms, t)){ skipped++; reasons.futureExists++; marks.recurring[cycleKey] = Date.now(); continue; }
    if(typeof phase5GenerateNextRecurringTask_ !== 'function'){ skipped++; reasons.noFn++; break; }
    try{
      phase5GenerateNextRecurringTask_(e.ms, t);
      generated++;
      marks.recurring[cycleKey] = Date.now();
      addActivity(`Phase13 recurring sweep generated next task: ${t.title} • ${e.p?.name || ''} / ${e.ms?.title || ''}`);
    }catch(err){
      console.warn('Phase13 recurring sweep generate failed', err);
    }
  }
  phase13SaveMarks_();
  if(generated && !opts.noRender){
    try{ saveState(); }catch{}
    try{ renderAll(); }catch{}
  }
  return { generated, scanned: rows.length, skipped, reasons };
}

function phase13EnsureTaskComments_(t){
  try{ if(typeof phase12EnsureTaskCommentsArray_ === 'function') return phase12EnsureTaskCommentsArray_(t); }catch{}
  if(!Array.isArray(t.comments)) t.comments = [];
  return t.comments;
}
function phase13TaskRefKey_(r){ return r && r.e && r.t ? `${r.e.p.id}|${r.e.ms.id}|${r.t.id}` : ''; }

function phase13ApplySlaRuleNudge_(r){
  if(!r || !r.t) return false;
  const marks = phase13LoadMarks_();
  const k = `nudge|${phase13TaskRefKey_(r)}|${phase13DateKey_()}`;
  if(marks.sla[k]) return false;
  const comments = phase13EnsureTaskComments_(r.t);
  comments.push({ id: uid(), ts: Date.now(), author: 'SYSTEM', text: `Phase13 SLA auto-nudge: stale ${r.t.severity === 'blocker' ? 'blocker' : 'task'} review requested.` });
  marks.sla[k] = Date.now();
  return true;
}
function phase13ApplySlaRuleAssign_(r, fallbackAssignee){
  if(!r || !r.t) return false;
  const who = String(fallbackAssignee || '').trim();
  if(!who) return false;
  if(String(r.t.assignee || '').trim()) return false;
  const marks = phase13LoadMarks_();
  const k = `assign|${phase13TaskRefKey_(r)}|${who.toLowerCase()}`;
  if(marks.sla[k]) return false;
  r.t.assignee = who;
  phase13EnsureTaskComments_(r.t).push({ id: uid(), ts: Date.now(), author: 'SYSTEM', text: `Phase13 SLA auto-assign fallback owner: ${who}` });
  marks.sla[k] = Date.now();
  return true;
}
function phase13ApplySlaRuleEscalate_(r, extraDays){
  if(!r || !r.t) return false;
  const t = r.t;
  const cfg11 = (typeof phase11LoadSlaCfg_ === 'function') ? phase11LoadSlaCfg_() : { staleTaskDays:5, staleBlockerDays:2 };
  const threshold = (t.severity === 'blocker' ? Number(cfg11.staleBlockerDays || 2) : Number(cfg11.staleTaskDays || 5)) + Math.max(0, Number(extraDays || 0));
  if(Number(r.ageDays || 0) < threshold) return false;
  let next = String(t.severity || 'normal');
  if(next === 'normal') next = 'high';
  else if(next === 'high') next = 'blocker';
  else return false;
  const marks = phase13LoadMarks_();
  const k = `escalate|${phase13TaskRefKey_(r)}|${next}`;
  if(marks.sla[k]) return false;
  t.severity = next;
  phase13EnsureTaskComments_(t).push({ id: uid(), ts: Date.now(), author: 'SYSTEM', text: `Phase13 SLA auto-escalation applied (${next.toUpperCase()}) after ${Math.max(0, Number(r.ageDays || 0))}d stale.` });
  marks.sla[k] = Date.now();
  return true;
}

function phase13RunSlaRulesEngine_(opts){
  opts = opts || {};
  const cfg = phase13LoadCfg_();
  if(!cfg.slaRulesEnabled || typeof phase11CollectSlaAging_ !== 'function') return { changed:false, touched:0, nudge:0, assign:0, escalate:0, rows:0 };
  const sla = phase11CollectSlaAging_({ onlyActiveProject: !(opts.scopeAllProjects !== undefined ? !!opts.scopeAllProjects : !!cfg.slaRulesScopeAllProjects) });
  const rows = [];
  const seen = new Set();
  for(const r of (sla.staleBlockers || [])){ const k = phase13TaskRefKey_(r); if(k && !seen.has(k)){ seen.add(k); rows.push(r); } }
  for(const r of (sla.staleTasks || [])){ const k = phase13TaskRefKey_(r); if(k && !seen.has(k)){ seen.add(k); rows.push(r); } }

  let nudge = 0, assign = 0, escalate = 0;
  for(const r of rows){
    if(cfg.slaRulesAutoNudge && phase13ApplySlaRuleNudge_(r)){ nudge++; addActivity(`Phase13 SLA auto-nudge: ${r.t.title}`); }
    if(cfg.slaRulesAutoAssignUnassigned && phase13ApplySlaRuleAssign_(r, cfg.slaRulesFallbackAssignee)){ assign++; addActivity(`Phase13 SLA auto-assign: ${r.t.title} -> ${r.t.assignee}`); }
    if(cfg.slaRulesAutoEscalate && phase13ApplySlaRuleEscalate_(r, cfg.slaRulesEscalateExtraDays)){ escalate++; addActivity(`Phase13 SLA auto-escalate: ${r.t.title} -> ${r.t.severity}`); }
  }
  const changed = !!(nudge || assign || escalate);
  phase13SaveMarks_();
  if(changed){
    try{ saveState(opts.noRender ? { skipHistory:true } : undefined); }catch{}
    if(!opts.noRender) try{ renderAll(); }catch{}
  }
  return { changed, touched:(nudge+assign+escalate), nudge, assign, escalate, rows: rows.length, staleRows: rows.length };
}

async function phase13RunAutomationSweepPrompt_(){
  const doRec = await pmConfirmDialog_('Run Phase13 recurring generation sweep now? Click OK to run both engines, Cancel to open dashboard only.', { title:'Run Automation Sweep', okText:'Run Sweep' });
  if(!doRec){ phase13OpenDashboard_(); return; }
  const r1 = phase13RunRecurringGenerationSweep_({ noRender:true });
  const r2 = phase13RunSlaRulesEngine_({ noRender:true });
  try{ saveState({ skipHistory:true }); }catch{}
  try{ renderAll(); }catch{}
  alert(`Phase13 automation sweep complete.\nRecurring generated: ${r1.generated}/${r1.scanned}\nSLA actions: ${r2.touched} (nudge ${r2.nudge}, assign ${r2.assign}, escalate ${r2.escalate})`);
}

function phase13PostRenderDashboard_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return;
  let host = document.querySelector('#phase13DashboardHost');
  if(!host){
    host = document.createElement('div');
    host.id = 'phase13DashboardHost';
    host.className = 'phase13-box';
    host.innerHTML = `
      <div class="phase13-title">Phase 13 Workflow Automation & Recurrence</div>
      <div class="phase13-grid" id="phase13GridA">
        <div class="phase13-card" id="phase13RecurringPanel"></div>
        <div class="phase13-card" id="phase13SlaRulesPanel"></div>
      </div>
      <div class="phase13-grid" id="phase13GridB" style="margin-top:10px">
        <div class="phase13-card" id="phase13DigestPresetsPanel"></div>
        <div class="phase13-card" id="phase13FollowupStatesPanel"></div>
      </div>
    `;
    tab.appendChild(host);
  }
  phase13RenderRecurringPanel_();
  phase13RenderSlaRulesPanel_();
  phase13RenderDigestPresetsPanel_();
  phase13RenderFollowupStatesPanel_();
}

function phase13PostRenderChecklist_(){
  const taskList = document.querySelector('#taskList');
  if(!taskList || !taskList.parentElement) return;
  let box = document.querySelector('#phase13BulkMaintenancePanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase13BulkMaintenancePanel';
    box.className = 'card';
    box.style.marginTop = '10px';
    box.innerHTML = `
      <div class="card__top">
        <div>
          <div class="card__label">Bulk Milestone Maintenance</div>
          <div class="card__hint">Phase 13 mass actions for active milestone tasks (assign / severity / due date shift)</div>
        </div>
      </div>
      <div class="phase13-box" style="margin-top:8px;padding:8px" id="phase13BulkMaintenanceBox"></div>
    `;
    taskList.parentElement.appendChild(box);
  }
  phase13RenderBulkMaintenancePanel_();
}

function phase13ActiveMilestoneCtx_(){
  const p = getActiveProject ? getActiveProject() : null;
  const m = p && getActiveMilestone ? getActiveMilestone(p) : null;
  const mod = p && getActiveModule ? getActiveModule(p) : null;
  return { p, m, mod };
}

function phase13RenderRecurringPanel_(){
  const box = document.querySelector('#phase13RecurringPanel');
  if(!box) return;
  const cfg = phase13LoadCfg_();
  const cands = phase13RecurringCandidateRows_({ scopeAllProjects: cfg.recurringScopeAllProjects });
  const samples = cands.slice(0,6).map(e => `${e.t.title} • ${e.p.name} / ${e.ms.title} • R/${Math.max(1, Number(e.t.recurrenceDays||1))}d`);
  const marks = phase13LoadMarks_();
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Recurring Generation Sweep</div><div class="phase8-item__meta">Repair/generate missing next recurring tasks</div></div>
    <div class="phase13-note" style="margin-top:6px">This complements Phase 5 + Phase 7 by sweeping completed recurring tasks and generating missing next instances (useful after imports/manual edits).</div>
    <div class="phase13-toolbar" style="margin-top:8px">
      <label class="phase13-check"><span>Enabled</span><input type="checkbox" id="phase13RecEnabled" ${cfg.recurringEnabled ? 'checked' : ''}></label>
      <label class="phase13-check"><span>Auto-run</span><input type="checkbox" id="phase13RecAuto" ${cfg.recurringAutoRun ? 'checked' : ''}></label>
      <label class="phase13-check"><span>All Projects</span><input type="checkbox" id="phase13RecAll" ${cfg.recurringScopeAllProjects ? 'checked' : ''}></label>
      <label class="phase13-check"><span>Max/run</span><input class="input phase13-inlineNum" type="number" min="1" max="50" id="phase13RecMax" value="${Number(cfg.recurringMaxPerRun||6)}"></label>
      <label class="phase13-check"><span>Cooldown min</span><input class="input phase13-inlineNum" type="number" min="1" max="1440" id="phase13RecCooldown" value="${Number(cfg.recurringCooldownMin||30)}"></label>
      <button class="btn btn--ghost" type="button" id="phase13BtnRunRecurring">Run Now</button>
    </div>
    <div class="phase13-kv">
      <div><b>Candidates</b><span>${cands.length}</span></div>
      <div><b>Last engine run</b><span>${phase13LoadMarks_().engine.recurringLastRunTs ? new Date(Number(marks.engine.recurringLastRunTs)).toLocaleString() : '—'}</span></div>
      <div><b>Scope</b><span>${cfg.recurringScopeAllProjects ? 'all projects' : 'active project'}</span></div>
      <div><b>Status</b><span>${cfg.recurringEnabled ? (cfg.recurringAutoRun ? 'auto + manual' : 'manual') : 'disabled'}</span></div>
    </div>
    <div class="phase13-pre">${escapeHtml(samples.length ? samples.join('\n') : 'No completed recurring task candidates found.')}</div>
  `;
  const bindSave = () => {
    cfg.recurringEnabled = !!box.querySelector('#phase13RecEnabled')?.checked;
    cfg.recurringAutoRun = !!box.querySelector('#phase13RecAuto')?.checked;
    cfg.recurringScopeAllProjects = !!box.querySelector('#phase13RecAll')?.checked;
    cfg.recurringMaxPerRun = Math.max(1, Math.min(50, Number(box.querySelector('#phase13RecMax')?.value || cfg.recurringMaxPerRun)));
    cfg.recurringCooldownMin = Math.max(1, Math.min(1440, Number(box.querySelector('#phase13RecCooldown')?.value || cfg.recurringCooldownMin)));
    phase13SaveCfg_();
  };
  ['#phase13RecEnabled','#phase13RecAuto','#phase13RecAll','#phase13RecMax','#phase13RecCooldown'].forEach(sel => {
    box.querySelector(sel)?.addEventListener('change', ()=>{ bindSave(); phase13RenderRecurringPanel_(); });
  });
  box.querySelector('#phase13BtnRunRecurring')?.addEventListener('click', () => {
    bindSave();
    const res = phase13RunRecurringGenerationSweep_();
    alert(`Recurring sweep complete.\nGenerated: ${res.generated}\nScanned candidates: ${res.scanned}\nSkipped: ${res.skipped}`);
    phase13RenderRecurringPanel_();
  });
}

function phase13RenderSlaRulesPanel_(){
  const box = document.querySelector('#phase13SlaRulesPanel');
  if(!box) return;
  const cfg = phase13LoadCfg_();
  let sla = { staleBlockers:[], staleTasks:[] };
  try{ if(typeof phase11CollectSlaAging_ === 'function') sla = phase11CollectSlaAging_({ onlyActiveProject: !cfg.slaRulesScopeAllProjects }); }catch{}
  const preview = [];
  (sla.staleBlockers || []).slice(0,4).forEach(r => preview.push(`[BLK ${r.ageDays}d] ${r.t?.title || 'Untitled'} • ${r.e?.p?.name || ''}`));
  (sla.staleTasks || []).slice(0,4).forEach(r => preview.push(`[TASK ${r.ageDays}d] ${r.t?.title || 'Untitled'} • ${r.e?.p?.name || ''}`));
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">SLA Action Rules Engine</div><div class="phase8-item__meta">Auto nudge / assign fallback / escalate stale tasks</div></div>
    <div class="phase13-note" style="margin-top:6px">Works on Phase 11 stale outputs and applies non-interactive actions (no prompts). Use auto-run carefully and set a fallback assignee if you want auto-assign enabled.</div>
    <div class="phase13-toolbar" style="margin-top:8px">
      <label class="phase13-check"><span>Enabled</span><input type="checkbox" id="phase13SlaEnabled" ${cfg.slaRulesEnabled ? 'checked' : ''}></label>
      <label class="phase13-check"><span>Auto-run</span><input type="checkbox" id="phase13SlaAuto" ${cfg.slaRulesAutoRun ? 'checked' : ''}></label>
      <label class="phase13-check"><span>All Projects</span><input type="checkbox" id="phase13SlaAll" ${cfg.slaRulesScopeAllProjects ? 'checked' : ''}></label>
      <label class="phase13-check"><span>Nudge</span><input type="checkbox" id="phase13SlaNudge" ${cfg.slaRulesAutoNudge ? 'checked' : ''}></label>
      <label class="phase13-check"><span>Assign unassigned</span><input type="checkbox" id="phase13SlaAssign" ${cfg.slaRulesAutoAssignUnassigned ? 'checked' : ''}></label>
      <label class="phase13-check"><span>Escalate</span><input type="checkbox" id="phase13SlaEscalate" ${cfg.slaRulesAutoEscalate ? 'checked' : ''}></label>
      <label class="phase13-check"><span>Fallback owner</span><input class="input" id="phase13SlaFallback" value="${escapeHtml(String(cfg.slaRulesFallbackAssignee||''))}" placeholder="e.g. PM Lead"></label>
      <label class="phase13-check"><span>Esc +days</span><input class="input phase13-inlineNum" type="number" min="0" max="60" id="phase13SlaEscDays" value="${Number(cfg.slaRulesEscalateExtraDays||3)}"></label>
      <label class="phase13-check"><span>Cooldown min</span><input class="input phase13-inlineNum" type="number" min="1" max="1440" id="phase13SlaCooldown" value="${Number(cfg.slaRulesCooldownMin||60)}"></label>
      <button class="btn btn--ghost" type="button" id="phase13BtnRunSlaRules">Run Now</button>
    </div>
    <div class="phase13-kv">
      <div><b>Stale blockers</b><span>${(sla.staleBlockers||[]).length}</span></div>
      <div><b>Stale tasks</b><span>${(sla.staleTasks||[]).length}</span></div>
      <div><b>Last engine run</b><span>${phase13LoadMarks_().engine.slaLastRunTs ? new Date(Number(phase13LoadMarks_().engine.slaLastRunTs)).toLocaleString() : '—'}</span></div>
      <div><b>Fallback owner</b><span>${escapeHtml(String(cfg.slaRulesFallbackAssignee || '—'))}</span></div>
    </div>
    <div class="phase13-pre">${escapeHtml(preview.length ? preview.join('\n') : 'No stale rows in current scope.')}</div>
  `;
  const saveCfg = () => {
    cfg.slaRulesEnabled = !!box.querySelector('#phase13SlaEnabled')?.checked;
    cfg.slaRulesAutoRun = !!box.querySelector('#phase13SlaAuto')?.checked;
    cfg.slaRulesScopeAllProjects = !!box.querySelector('#phase13SlaAll')?.checked;
    cfg.slaRulesAutoNudge = !!box.querySelector('#phase13SlaNudge')?.checked;
    cfg.slaRulesAutoAssignUnassigned = !!box.querySelector('#phase13SlaAssign')?.checked;
    cfg.slaRulesAutoEscalate = !!box.querySelector('#phase13SlaEscalate')?.checked;
    cfg.slaRulesFallbackAssignee = String(box.querySelector('#phase13SlaFallback')?.value || '').trim();
    cfg.slaRulesEscalateExtraDays = Math.max(0, Math.min(60, Number(box.querySelector('#phase13SlaEscDays')?.value || cfg.slaRulesEscalateExtraDays)));
    cfg.slaRulesCooldownMin = Math.max(1, Math.min(1440, Number(box.querySelector('#phase13SlaCooldown')?.value || cfg.slaRulesCooldownMin)));
    phase13SaveCfg_();
  };
  ['#phase13SlaEnabled','#phase13SlaAuto','#phase13SlaAll','#phase13SlaNudge','#phase13SlaAssign','#phase13SlaEscalate','#phase13SlaFallback','#phase13SlaEscDays','#phase13SlaCooldown'].forEach(sel=>{
    box.querySelector(sel)?.addEventListener('change', ()=>{ saveCfg(); phase13RenderSlaRulesPanel_(); });
  });
  box.querySelector('#phase13BtnRunSlaRules')?.addEventListener('click', () => {
    saveCfg();
    const res = phase13RunSlaRulesEngine_();
    alert(`SLA rules run complete.\nActions: ${res.touched}\n- Nudge: ${res.nudge}\n- Assign: ${res.assign}\n- Escalate: ${res.escalate}\nRows scanned: ${res.rows}`);
    phase13RenderSlaRulesPanel_();
  });
}

function phase13RunDigestPreset_(preset){
  const p = phase13NormalizeDigestPreset_(preset);
  if(p.kind === 'risk'){
    if(typeof phase12BuildRiskDigestData_ !== 'function' || typeof phase12BuildRiskDigestText_ !== 'function'){
      alert('Phase 12 risk digest functions not found.');
      return;
    }
    const data = phase12BuildRiskDigestData_({ allProjects: !!p.allProjects });
    const txt = phase12BuildRiskDigestText_(p.fmt, data);
    const fn = `digest_preset_${String(p.kind)}_${p.allProjects?'all':'active'}_${new Date().toISOString().slice(0,10)}.${p.fmt === 'MD' ? 'md' : 'txt'}`;
    downloadText(fn, txt, p.fmt === 'MD' ? 'text/markdown' : 'text/plain');
    addActivity(`Phase13 ran digest preset: ${p.name} (${p.kind}/${p.fmt})`);
    try{ saveState({ skipHistory:true }); }catch{}
    return;
  }
  if(p.kind === 'status'){
    if(typeof phase10BuildStatusReport_ !== 'function'){
      alert('Phase 10 status export functions not found.');
      return;
    }
    const text = phase10BuildStatusReport_(String(p.fmt || 'MD').toLowerCase() === 'TXT'.toLowerCase() ? 'txt' : 'md');
    if(!text){ alert('Select an active project to run a status preset.'); return; }
    const active = getActiveProject ? getActiveProject() : null;
    const safe = String(active?.name || 'project').replace(/[^a-z0-9\-_]+/ig,'_').slice(0,50) || 'project';
    const fn = `${safe}_status_preset_${new Date().toISOString().slice(0,10)}.${p.fmt === 'MD' ? 'md' : 'txt'}`;
    downloadText(fn, text, p.fmt === 'MD' ? 'text/markdown' : 'text/plain');
    addActivity(`Phase13 ran digest preset: ${p.name} (${p.kind}/${p.fmt})`);
    try{ saveState({ skipHistory:true }); }catch{}
    return;
  }
}

function phase13EnsureDigestPresetImportInput_(){
  if(document.querySelector('#phase13DigestPresetInput')) return;
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.id = 'phase13DigestPresetInput';
  inp.accept = '.json,application/json';
  inp.style.display = 'none';
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0];
    if(!f) return;
    try{
      const text = await f.text();
      const parsed = JSON.parse(text);
      let arr = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.presets) ? parsed.presets : []);
      arr = arr.filter(Boolean).map(phase13NormalizeDigestPreset_);
      if(!arr.length){ alert('No valid presets found in file.'); return; }
      const modeReplace = await pmConfirmDialog_(`Import ${arr.length} preset(s)?\nOK = replace existing presets\nCancel = merge`, { title:'Import Digest Presets', okText:'Replace' });
      let next = [];
      if(modeReplace) next = arr;
      else {
        const cur = phase13LoadDigestPresets_().slice();
        const byKey = Object.create(null);
        for(const x of cur){ byKey[String(x.name).trim().toLowerCase() + '|' + x.kind] = x; }
        for(const x of arr){
          const k = String(x.name).trim().toLowerCase() + '|' + x.kind;
          if(byKey[k]) Object.assign(byKey[k], x, { updatedAt: Date.now(), id: byKey[k].id || x.id });
          else cur.unshift(x);
        }
        next = cur;
      }
      phase13State_.digestPresets = next.slice(0,50);
      phase13SaveDigestPresets_();
      addActivity(`Phase13 imported digest presets (${arr.length})`);
      phase13RenderDigestPresetsPanel_();
    }catch(err){
      alert('Failed to import presets JSON.');
      console.warn('Phase13 preset import failed', err);
    }finally{
      inp.value = '';
    }
  });
  document.body.appendChild(inp);
}

function phase13RenderDigestPresetsPanel_(){
  const box = document.querySelector('#phase13DigestPresetsPanel');
  if(!box) return;
  const presets = phase13LoadDigestPresets_().slice().sort((a,b)=> Number(b.updatedAt||0) - Number(a.updatedAt||0));
  const p12cfg = (typeof phase12LoadCfg_ === 'function') ? phase12LoadCfg_() : { riskDigestAllProjects:true };
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Digest Scheduler Presets</div><div class="phase8-item__meta">Reusable export presets for risk/status digests</div></div>
    <div class="phase13-note" style="margin-top:6px">These are run-on-demand presets (portable JSON), so your daily/weekly reporting steps stay consistent across browsers/devices.</div>
    <div class="phase13-toolbar" style="margin-top:8px">
      <input class="input" id="phase13PresetName" placeholder="Preset name (e.g. Morning Ops Risk MD)" />
      <select class="select" id="phase13PresetKind"><option value="risk">Risk Digest (Phase12)</option><option value="status">Project Status (Phase10)</option></select>
      <select class="select" id="phase13PresetFmt"><option value="MD">MD</option><option value="TXT">TXT</option></select>
      <label class="phase13-check"><span>All Projects (risk only)</span><input type="checkbox" id="phase13PresetAll" ${p12cfg.riskDigestAllProjects ? 'checked' : ''}></label>
      <button class="btn btn--ghost" type="button" id="phase13BtnSavePreset">Save Preset</button>
      <button class="btn btn--ghost" type="button" id="phase13BtnExportPresets">Export JSON</button>
      <button class="btn btn--ghost" type="button" id="phase13BtnImportPresets">Import JSON</button>
    </div>
    <div class="phase13-kv">
      <div><b>Saved presets</b><span>${presets.length}</span></div>
      <div><b>Active project</b><span>${escapeHtml(String((getActiveProject && getActiveProject()?.name) || '—'))}</span></div>
      <div><b>Risk scope default</b><span>${p12cfg.riskDigestAllProjects ? 'all projects' : 'active project'}</span></div>
      <div><b>Status</b><span>ready</span></div>
    </div>
    <div class="phase13-list" id="phase13DigestPresetList"></div>
  `;
  const list = box.querySelector('#phase13DigestPresetList');
  if(!presets.length){
    list.innerHTML = `<div class="phase8-empty">No digest presets yet. Save your common risk/status exports here.</div>`;
  } else {
    presets.slice(0,20).forEach(p => {
      const row = document.createElement('div');
      row.className = 'phase13-row';
      row.innerHTML = `
        <div>
          <div class="phase13-row__name">${escapeHtml(p.name)}</div>
          <div class="phase13-row__meta">${p.kind === 'risk' ? 'Risk Digest' : 'Project Status'} • ${p.fmt} ${p.kind === 'risk' ? `• ${p.allProjects ? 'all projects' : 'active project'}` : '• active project'} • ${new Date(Number(p.updatedAt||Date.now())).toLocaleString()}</div>
          ${p.note ? `<div class="phase13-note">${escapeHtml(p.note)}</div>` : ''}
        </div>
        <div class="phase13-toolbar">
          <button class="btn btn--ghost" type="button" data-act="run">Run</button>
          <button class="btn btn--ghost" type="button" data-act="dup">Duplicate</button>
          <button class="btn btn--ghost" type="button" data-act="del">Delete</button>
        </div>
      `;
      row.querySelector('[data-act="run"]')?.addEventListener('click', ()=>phase13RunDigestPreset_(p));
      row.querySelector('[data-act="dup"]')?.addEventListener('click', ()=>{
        const copy = phase13NormalizeDigestPreset_({ ...p, id: uid(), name: `${p.name} Copy`, createdAt:Date.now(), updatedAt:Date.now() });
        phase13LoadDigestPresets_().unshift(copy); phase13SaveDigestPresets_(); addActivity(`Phase13 duplicated digest preset: ${p.name}`); phase13RenderDigestPresetsPanel_();
      });
      row.querySelector('[data-act="del"]')?.addEventListener('click', async ()=>{
        const okDelete = await pmConfirmDialog_(`Delete digest preset "${p.name}"?`, { title:'Delete Digest Preset', okText:'Delete', danger:true });
        if(!okDelete) return;
        phase13State_.digestPresets = phase13LoadDigestPresets_().filter(x => String(x.id) !== String(p.id));
        phase13SaveDigestPresets_(); addActivity(`Phase13 deleted digest preset: ${p.name}`); phase13RenderDigestPresetsPanel_();
      });
      list.appendChild(row);
    });
  }
  box.querySelector('#phase13BtnSavePreset')?.addEventListener('click', () => {
    const name = String(box.querySelector('#phase13PresetName')?.value || '').trim();
    if(!name){ alert('Enter a preset name.'); return; }
    const kind = String(box.querySelector('#phase13PresetKind')?.value || 'risk') === 'status' ? 'status' : 'risk';
    const fmt = String(box.querySelector('#phase13PresetFmt')?.value || 'MD').toUpperCase() === 'TXT' ? 'TXT' : 'MD';
    const allProjects = !!box.querySelector('#phase13PresetAll')?.checked;
    const arr = phase13LoadDigestPresets_();
    const key = name.toLowerCase() + '|' + kind;
    const found = arr.find(x => (String(x.name||'').trim().toLowerCase() + '|' + x.kind) === key);
    if(found){
      found.kind = kind; found.fmt = fmt; found.allProjects = allProjects; found.updatedAt = Date.now();
    } else {
      arr.unshift(phase13NormalizeDigestPreset_({ id:uid(), name, kind, fmt, allProjects, createdAt:Date.now(), updatedAt:Date.now() }));
    }
    phase13SaveDigestPresets_();
    addActivity(`Phase13 saved digest preset: ${name}`);
    phase13RenderDigestPresetsPanel_();
  });
  box.querySelector('#phase13BtnExportPresets')?.addEventListener('click', () => {
    const payload = { version:1, exportedAt:Date.now(), presets: phase13LoadDigestPresets_().map(phase13NormalizeDigestPreset_) };
    downloadText(`phase13_digest_presets_${new Date().toISOString().slice(0,10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
    addActivity(`Phase13 exported digest presets (${payload.presets.length})`);
  });
  box.querySelector('#phase13BtnImportPresets')?.addEventListener('click', () => document.querySelector('#phase13DigestPresetInput')?.click());
}

function phase13MentionRows_(){
  if(typeof phase10LoadMentions_ !== 'function') return [];
  let rows = [];
  try{ rows = phase10LoadMentions_() || []; }catch{ rows = []; }
  const ui = phase13LoadFollowupUi_();
  const q = String(ui.query || '').trim().toLowerCase();
  return rows.filter(Boolean).filter(x => {
    const st = String(x.status || 'open');
    if(ui.filter !== 'all' && st !== ui.filter) return false;
    if(!q) return true;
    const hay = [x.name, x.taskTitle, x.projectName, x.milestoneTitle, x.text].map(v => String(v||'').toLowerCase()).join('\n');
    return hay.includes(q);
  }).sort((a,b)=> Number(b.ts||0)-Number(a.ts||0));
}

function phase13SetMentionStatus_(id, status){
  if(typeof phase10LoadMentions_ !== 'function') return false;
  const arr = phase10LoadMentions_();
  const item = arr.find(x => String(x.id) === String(id));
  if(!item) return false;
  item.status = String(status || 'open');
  item.statusTs = Date.now();
  if(typeof phase10SaveMentions_ === 'function') try{ phase10SaveMentions_(); }catch{}
  addActivity(`Phase13 mention follow-up ${item.status}: @${item.name} • ${item.taskTitle}`);
  try{ if(typeof phase10RenderMentionsPanel_ === 'function') phase10RenderMentionsPanel_(); }catch{}
  try{ if(typeof phase8RenderNotificationsPanel_ === 'function') phase8RenderNotificationsPanel_(); }catch{}
  phase13RenderFollowupStatesPanel_();
  return true;
}
function phase13NudgeMentionFollowup_(id){
  if(typeof phase10LoadMentions_ !== 'function') return false;
  const arr = phase10LoadMentions_();
  const fu = arr.find(x => String(x.id) === String(id));
  if(!fu) return false;
  const entry = (typeof phase10FindTaskEntryByIds_ === 'function')
    ? phase10FindTaskEntryByIds_(fu.projectId, fu.milestoneId, fu.taskId)
    : null;
  if(entry && entry.t){
    phase13EnsureTaskComments_(entry.t).push({ id: uid(), ts: Date.now(), author:'SYSTEM', text:`Phase13 mention follow-up nudge for @${fu.name}.` });
  }
  fu.status = 'nudged';
  fu.statusTs = Date.now();
  if(typeof phase10SaveMentions_ === 'function') try{ phase10SaveMentions_(); }catch{}
  addActivity(`Phase13 nudged mention follow-up: @${fu.name} • ${fu.taskTitle}`);
  try{ saveState({ skipHistory:true }); }catch{}
  try{ if(typeof phase10RenderMentionsPanel_ === 'function') phase10RenderMentionsPanel_(); }catch{}
  try{ if(typeof phase8RenderNotificationsPanel_ === 'function') phase8RenderNotificationsPanel_(); }catch{}
  phase13RenderFollowupStatesPanel_();
  return true;
}

function phase13RenderFollowupStatesPanel_(){
  const box = document.querySelector('#phase13FollowupStatesPanel');
  if(!box) return;
  const ui = phase13LoadFollowupUi_();
  const allRows = (typeof phase10LoadMentions_ === 'function') ? (phase10LoadMentions_() || []) : [];
  const rows = phase13MentionRows_();
  const counts = { open:0, nudged:0, ack:0, done:0 };
  allRows.forEach(x => { const s = String(x.status || 'open'); counts[s] = (counts[s]||0)+1; });
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Assignee Follow-up States</div><div class="phase8-item__meta">Phase 10 mention follow-ups with nudged/ack lifecycle</div></div>
    <div class="phase13-note" style="margin-top:6px">Adds lightweight tracking states on top of Phase 10 mentions: <b>open → nudged → ack → done</b> (with reopen when needed).</div>
    <div class="phase13-toolbar" style="margin-top:8px">
      <select class="select" id="phase13FuFilter">
        <option value="all" ${ui.filter==='all'?'selected':''}>All</option>
        <option value="open" ${ui.filter==='open'?'selected':''}>Open</option>
        <option value="nudged" ${ui.filter==='nudged'?'selected':''}>Nudged</option>
        <option value="ack" ${ui.filter==='ack'?'selected':''}>Ack</option>
        <option value="done" ${ui.filter==='done'?'selected':''}>Done</option>
      </select>
      <input class="input" id="phase13FuQuery" placeholder="Search assignee / task / milestone" value="${escapeHtml(String(ui.query||''))}">
      <button class="btn btn--ghost" type="button" id="phase13BtnFuRefresh">Refresh</button>
    </div>
    <div class="phase13-kv">
      <div><b>Open</b><span>${counts.open||0}</span></div>
      <div><b>Nudged</b><span>${counts.nudged||0}</span></div>
      <div><b>Ack</b><span>${counts.ack||0}</span></div>
      <div><b>Done</b><span>${counts.done||0}</span></div>
    </div>
    <div class="phase13-list" id="phase13FollowupList"></div>
  `;
  const list = box.querySelector('#phase13FollowupList');
  if(typeof phase10LoadMentions_ !== 'function'){
    list.innerHTML = `<div class="phase8-empty">Phase 10 mention tracking is not available in this build.</div>`;
  } else if(!rows.length){
    list.innerHTML = `<div class="phase8-empty">No follow-ups match the current filter.</div>`;
  } else {
    rows.slice(0,15).forEach(fu => {
      const status = String(fu.status || 'open');
      const row = document.createElement('div');
      row.className = 'phase13-row';
      row.innerHTML = `
        <div>
          <div class="phase13-row__name">@${escapeHtml(String(fu.name||''))} • ${escapeHtml(String(fu.taskTitle || 'Task'))}</div>
          <div class="phase13-row__meta">${escapeHtml(String(fu.projectName || 'Project'))} • ${escapeHtml(String(fu.milestoneTitle || 'Milestone'))} • ${new Date(Number(fu.ts||Date.now())).toLocaleString()}</div>
          <div class="phase13-note">${escapeHtml(String(fu.text || '').slice(0,160))}${String(fu.text||'').length>160?'…':''}</div>
        </div>
        <div class="phase13-toolbar">
          <span class="phase13-tag ${status==='nudged'?'warn':(status==='ack'?'':'')}">${escapeHtml(status)}</span>
          <button class="btn btn--ghost" type="button" data-act="openTask">Open</button>
          <button class="btn btn--ghost" type="button" data-act="nudge">Nudge</button>
          <button class="btn btn--ghost" type="button" data-act="ack">Ack</button>
          <button class="btn btn--ghost" type="button" data-act="reopen">Reopen</button>
          <button class="btn btn--ghost" type="button" data-act="done">Done</button>
        </div>
      `;
      row.querySelector('[data-act="openTask"]')?.addEventListener('click', ()=>{ try{ if(typeof phase10OpenMentionFollowup_ === 'function') phase10OpenMentionFollowup_(fu.id); }catch{} });
      row.querySelector('[data-act="nudge"]')?.addEventListener('click', ()=>phase13NudgeMentionFollowup_(fu.id));
      row.querySelector('[data-act="ack"]')?.addEventListener('click', ()=>phase13SetMentionStatus_(fu.id, 'ack'));
      row.querySelector('[data-act="reopen"]')?.addEventListener('click', ()=>phase13SetMentionStatus_(fu.id, 'open'));
      row.querySelector('[data-act="done"]')?.addEventListener('click', ()=>phase13SetMentionStatus_(fu.id, 'done'));
      list.appendChild(row);
    });
  }

  box.querySelector('#phase13FuFilter')?.addEventListener('change', (e)=>{ ui.filter = String(e.target.value || 'open'); phase13SaveFollowupUi_(); phase13RenderFollowupStatesPanel_(); });
  box.querySelector('#phase13FuQuery')?.addEventListener('change', (e)=>{ ui.query = String(e.target.value || ''); phase13SaveFollowupUi_(); phase13RenderFollowupStatesPanel_(); });
  box.querySelector('#phase13BtnFuRefresh')?.addEventListener('click', ()=>phase13RenderFollowupStatesPanel_());
}

function phase13BulkTargets_(opts){
  opts = opts || {};
  const ctx = phase13ActiveMilestoneCtx_();
  const m = ctx.m;
  if(!m || !Array.isArray(m.tasks)) return { ...ctx, tasks:[] };
  let tasks = m.tasks.filter(Boolean);
  if(opts.openOnly) tasks = tasks.filter(t => !t.done);
  return { ...ctx, tasks };
}
function phase13ShiftTaskDue_(t, days){
  const n = Number(days || 0);
  if(!Number.isFinite(n) || n === 0) return false;
  const DAY = 86400000;
  let due = Number(t?.dueAt || 0);
  if(!(due > 0)){
    const d = new Date();
    d.setHours(17,0,0,0);
    due = d.getTime();
  }
  t.dueAt = due + Math.round(n) * DAY;
  return true;
}
function phase13RenderBulkMaintenancePanel_(){
  const box = document.querySelector('#phase13BulkMaintenanceBox');
  if(!box) return;
  const cfg = phase13LoadCfg_();
  const ctx = phase13BulkTargets_({ openOnly: !!cfg.bulkOpenOnly });
  const p = ctx.p, m = ctx.m;
  const tasks = ctx.tasks || [];
  const counts = {
    open: (m?.tasks || []).filter(t => !t.done).length,
    selected: tasks.length,
    noDue: tasks.filter(t => !(Number(t?.dueAt || 0) > 0)).length,
    unassigned: tasks.filter(t => !String(t?.assignee || '').trim()).length,
  };
  box.innerHTML = `
    <div class="phase8-item__top"><div class="phase8-item__title">Phase 13 Bulk Milestone Maintenance</div><div class="phase8-item__meta">${p ? escapeHtml(String(p.name||'')) : 'No project'} • ${m ? escapeHtml(String(m.title||'')) : 'No milestone'}</div></div>
    <div class="phase13-note" style="margin-top:6px">Applies bulk changes to the <b>active milestone</b>. Use carefully. Actions update task metadata in-place and log activity.</div>
    <div class="phase13-toolbar" style="margin-top:8px">
      <label class="phase13-check"><span>Open tasks only</span><input type="checkbox" id="phase13BulkOpenOnly" ${cfg.bulkOpenOnly ? 'checked' : ''}></label>
      <label class="phase13-check"><span>Shift due days</span><input class="input phase13-inlineNum" type="number" min="-365" max="365" id="phase13BulkShiftDays" value="${Number(cfg.bulkShiftDays||1)}"></label>
      <button class="btn btn--ghost" type="button" id="phase13BtnBulkShift" ${m ? '' : 'disabled'}>Apply Due Shift</button>
      <input class="input" id="phase13BulkAssignee" value="${escapeHtml(String(cfg.bulkAssignee||''))}" placeholder="Fallback / bulk assignee" />
      <button class="btn btn--ghost" type="button" id="phase13BtnBulkAssign" ${m ? '' : 'disabled'}>Set Assignee</button>
      <select class="select" id="phase13BulkSeverity">
        <option value="normal" ${cfg.bulkSeverity==='normal'?'selected':''}>Normal</option>
        <option value="high" ${cfg.bulkSeverity==='high'?'selected':''}>High</option>
        <option value="blocker" ${cfg.bulkSeverity==='blocker'?'selected':''}>Blocker</option>
      </select>
      <button class="btn btn--ghost" type="button" id="phase13BtnBulkSeverity" ${m ? '' : 'disabled'}>Set Severity</button>
      <button class="btn btn--ghost" type="button" id="phase13BtnBulkRefresh">Refresh</button>
    </div>
    <div class="phase13-kv">
      <div><b>Open in milestone</b><span>${counts.open}</span></div>
      <div><b>Current target set</b><span>${counts.selected}</span></div>
      <div><b>No due date</b><span>${counts.noDue}</span></div>
      <div><b>Unassigned</b><span>${counts.unassigned}</span></div>
    </div>
    <div class="phase13-pre">${escapeHtml(tasks.slice(0,8).map(t => `${t.done?'✅':'⬚'} ${t.title} • ${(t.severity||'normal').toUpperCase()}${t.assignee ? ' • ' + t.assignee : ''}${Number(t.dueAt||0) > 0 ? ' • ' + new Date(Number(t.dueAt)).toLocaleDateString() : ' • no due'}`).join('\n') || 'No tasks in target set.')}</div>
  `;
  const saveCfg = () => {
    cfg.bulkOpenOnly = !!box.querySelector('#phase13BulkOpenOnly')?.checked;
    cfg.bulkShiftDays = Number(box.querySelector('#phase13BulkShiftDays')?.value || cfg.bulkShiftDays || 0);
    cfg.bulkAssignee = String(box.querySelector('#phase13BulkAssignee')?.value || '').trim();
    cfg.bulkSeverity = String(box.querySelector('#phase13BulkSeverity')?.value || 'high');
    phase13SaveCfg_();
  };
  ['#phase13BulkOpenOnly','#phase13BulkShiftDays','#phase13BulkAssignee','#phase13BulkSeverity'].forEach(sel => {
    box.querySelector(sel)?.addEventListener('change', ()=>{ saveCfg(); phase13RenderBulkMaintenancePanel_(); });
  });
  box.querySelector('#phase13BtnBulkRefresh')?.addEventListener('click', ()=>phase13RenderBulkMaintenancePanel_());

  box.querySelector('#phase13BtnBulkShift')?.addEventListener('click', () => {
    saveCfg();
    const c = phase13BulkTargets_({ openOnly: !!cfg.bulkOpenOnly });
    if(!c.m){ alert('Select an active milestone first.'); return; }
    const days = Number(cfg.bulkShiftDays || 0);
    if(!Number.isFinite(days) || days === 0){ alert('Enter a non-zero shift day value.'); return; }
    let changed = 0;
    for(const t of (c.tasks || [])){ if(phase13ShiftTaskDue_(t, days)) changed++; }
    if(changed){
      addActivity(`Phase13 bulk due shift (${days}d): ${changed} task(s) • ${c.m.title}`);
      saveState(); renderAll();
    } else {
      alert('No tasks were updated.');
    }
  });
  box.querySelector('#phase13BtnBulkAssign')?.addEventListener('click', () => {
    saveCfg();
    const c = phase13BulkTargets_({ openOnly: !!cfg.bulkOpenOnly });
    if(!c.m){ alert('Select an active milestone first.'); return; }
    const who = String(cfg.bulkAssignee || '').trim();
    if(!who){ alert('Enter an assignee name first.'); return; }
    let changed = 0;
    for(const t of (c.tasks || [])){
      if(String(t.assignee || '') === who) continue;
      t.assignee = who;
      changed++;
    }
    if(changed){
      addActivity(`Phase13 bulk assignee set: ${who} • ${changed} task(s) • ${c.m.title}`);
      saveState(); renderAll();
    } else {
      alert('No tasks changed.');
    }
  });
  box.querySelector('#phase13BtnBulkSeverity')?.addEventListener('click', () => {
    saveCfg();
    const c = phase13BulkTargets_({ openOnly: !!cfg.bulkOpenOnly });
    if(!c.m){ alert('Select an active milestone first.'); return; }
    const sev = (cfg.bulkSeverity === 'blocker' || cfg.bulkSeverity === 'high' || cfg.bulkSeverity === 'normal') ? cfg.bulkSeverity : 'high';
    let changed = 0;
    for(const t of (c.tasks || [])){
      if(String(t.severity || 'normal') === sev) continue;
      t.severity = sev;
      changed++;
    }
    if(changed){
      addActivity(`Phase13 bulk severity set: ${sev.toUpperCase()} • ${changed} task(s) • ${c.m.title}`);
      saveState(); renderAll();
    } else {
      alert('No tasks changed.');
    }
  });
}

try{ initPhase13_(); }catch(err){ console.warn('Phase13 init failed', err); }



/* ---------------------------
   Phase 14 Approval Workflow + Export Center Cleanup (Additive Patch)
   - Task / milestone approval states + change locks
   - Review queue panels (dashboard / checklist / milestones)
   - Approval audit trail (with rollback notes)
   - Topbar export cleanup: single Export button + Export tab
---------------------------- */
var PHASE14_APPROVAL_AUDIT_KEY = 'stark_pm_phase14_approval_audit_v1';
var PHASE14_EXPORT_UI_KEY = 'stark_pm_phase14_export_ui_v1';
var phase14State_ = {
  inited:false,
  audit:null,
  exportUi:null,
};

function initPhase14_(){
  if(phase14State_.inited) return;
  phase14State_.inited = true;
  try{ phase14EnsureStyles_(); }catch(err){ console.warn('Phase14 styles failed', err); }
  try{ phase14PatchSanitizers_(); }catch(err){ console.warn('Phase14 sanitizer patch failed', err); }
  try{ phase14WrapCore_(); }catch(err){ console.warn('Phase14 core wrap failed', err); }
  try{ phase14InjectExportTab_(); }catch(err){ console.warn('Phase14 export tab inject failed', err); }
  try{ phase14EnhanceTopbarExport_(); }catch(err){ console.warn('Phase14 topbar cleanup failed', err); }
  try{ phase14BindGuardrails_(); }catch(err){ console.warn('Phase14 guardrails bind failed', err); }
  try{ phase14PostRenderDashboard_(); }catch{}
  try{ phase14PostRenderMilestones_(); }catch{}
  try{ phase14PostRenderChecklist_(); }catch{}
  try{ phase14RenderExportCenter_(); }catch{}
}

function phase14EnsureStyles_(){
  if(document.querySelector('#phase14Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase14Styles';
  st.textContent = `
    .phase14-box{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    .phase14-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9;margin-bottom:8px}
    .phase14-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:10px}
    .phase14-card{border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px;background:rgba(255,255,255,.012)}
    .phase14-toolbar{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .phase14-toolbar .btn{padding:6px 10px}
    .phase14-note{font-size:11px;opacity:.78;line-height:1.35}
    .phase14-kv{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:8px}
    .phase14-kv>div{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase14-kv b{display:block;font-size:10px;letter-spacing:.05em;text-transform:uppercase;opacity:.72;margin-bottom:4px}
    .phase14-kv span{font-size:14px;font-weight:800}
    .phase14-list{display:grid;gap:8px;margin-top:8px}
    .phase14-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase14-row__name{font-size:12px;font-weight:700;line-height:1.25;word-break:break-word}
    .phase14-row__meta{font-size:11px;opacity:.76;line-height:1.3;margin-top:2px}
    .phase14-tags{display:flex;flex-wrap:wrap;gap:4px;justify-content:flex-end}
    .phase14-tag{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:2px 7px;font-size:10px;letter-spacing:.05em;text-transform:uppercase}
    .phase14-tag.review{border-color:rgba(255,191,92,.28);color:#ffd8a6}
    .phase14-tag.approved{border-color:rgba(79,209,197,.28);color:#b8fff6}
    .phase14-tag.locked{border-color:rgba(255,110,110,.32);color:#ffd0d0}
    .phase14-tag.draft{border-color:rgba(255,255,255,.12);opacity:.9}
    .phase14-inline{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
    .phase14-pre{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;line-height:1.35;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.14);margin-top:8px;max-height:260px;overflow:auto}
    .phase14-taskLocked{outline:1px solid rgba(255,110,110,.2);box-shadow:inset 0 0 0 1px rgba(255,110,110,.06)}
    .phase14-taskLocked .task__title{opacity:.95}
    .phase14-badge{display:inline-flex;align-items:center;gap:4px;border-radius:999px;padding:2px 6px;font-size:10px;letter-spacing:.05em;text-transform:uppercase;border:1px solid rgba(255,255,255,.1)}
    .phase14-badge.review{border-color:rgba(255,191,92,.28);color:#ffd8a6}
    .phase14-badge.approved{border-color:rgba(79,209,197,.28);color:#b8fff6}
    .phase14-badge.locked{border-color:rgba(255,110,110,.32);color:#ffd0d0}
    .phase14-exportLayout{display:grid;grid-template-columns:1.05fr .95fr;gap:10px}
    .phase14-exportCard{border:1px solid rgba(255,255,255,.07);border-radius:14px;background:rgba(255,255,255,.015);padding:12px}
    .phase14-exportCard h4{margin:0 0 8px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;opacity:.88}
    .phase14-fields{display:grid;gap:8px}
    .phase14-fields .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .phase14-helpList{display:grid;gap:6px}
    .phase14-helpItem{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase14-helpItem b{display:block;font-size:11px;margin-bottom:2px}
    .phase14-helpItem span{font-size:11px;opacity:.76;line-height:1.3}
    .phase14-hidden{display:none !important}
    .phase14-lockHint{font-size:11px;color:#ffd0d0;opacity:.9;margin-top:6px}
    .phase14-topbar-export{font-weight:700}
    @media (max-width: 980px){ .phase14-grid,.phase14-exportLayout{grid-template-columns:1fr} .phase14-kv{grid-template-columns:1fr 1fr} .phase14-fields .row{grid-template-columns:1fr} }
    @media (max-width: 640px){ .phase14-kv{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase14PatchSanitizers_(){
  if(typeof sanitizeTask === 'function' && !sanitizeTask._phase14WrappedApproval){
    const _orig = sanitizeTask;
    sanitizeTask = function(t){
      const out = _orig(t);
      out.approval = phase14NormalizeApproval_(t && t.approval, 'task');
      return out;
    };
    sanitizeTask._phase14WrappedApproval = true;
  }
  if(typeof sanitizeMilestone === 'function' && !sanitizeMilestone._phase14WrappedApproval){
    const _orig = sanitizeMilestone;
    sanitizeMilestone = function(m){
      const out = _orig(m);
      out.approval = phase14NormalizeApproval_(m && m.approval, 'milestone');
      return out;
    };
    sanitizeMilestone._phase14WrappedApproval = true;
  }
  if(typeof mkTask === 'function' && !mkTask._phase14WrappedApproval){
    const _orig = mkTask;
    mkTask = function(){
      const t = _orig.apply(this, arguments);
      t.approval = phase14NormalizeApproval_(t.approval, 'task');
      return t;
    };
    mkTask._phase14WrappedApproval = true;
  }
  if(typeof mkMilestone === 'function' && !mkMilestone._phase14WrappedApproval){
    const _orig = mkMilestone;
    mkMilestone = function(){
      const m = _orig.apply(this, arguments);
      m.approval = phase14NormalizeApproval_(m.approval, 'milestone');
      return m;
    };
    mkMilestone._phase14WrappedApproval = true;
  }
}

function phase14WrapCore_(){
  if(typeof renderDashboard === 'function' && !renderDashboard._phase14Wrapped){
    const _orig = renderDashboard;
    renderDashboard = function(){
      const r = _orig.apply(this, arguments);
      try{ phase14PostRenderDashboard_(); }catch(err){ console.warn('Phase14 dashboard render failed', err); }
      return r;
    };
    renderDashboard._phase14Wrapped = true;
  }
  if(typeof renderMilestones === 'function' && !renderMilestones._phase14Wrapped){
    const _orig = renderMilestones;
    renderMilestones = function(){
      const r = _orig.apply(this, arguments);
      try{ phase14PostRenderMilestones_(); }catch(err){ console.warn('Phase14 milestones render failed', err); }
      return r;
    };
    renderMilestones._phase14Wrapped = true;
  }
  if(typeof renderChecklist === 'function' && !renderChecklist._phase14Wrapped){
    const _orig = renderChecklist;
    renderChecklist = function(){
      const r = _orig.apply(this, arguments);
      try{ phase14PostRenderChecklist_(); }catch(err){ console.warn('Phase14 checklist render failed', err); }
      return r;
    };
    renderChecklist._phase14Wrapped = true;
  }
  if(typeof renderAll === 'function' && !renderAll._phase14Wrapped){
    const _orig = renderAll;
    renderAll = function(){
      const r = _orig.apply(this, arguments);
      try{ phase14RenderExportCenter_(); }catch{}
      return r;
    };
    renderAll._phase14Wrapped = true;
  }
}

function phase14NormalizeApproval_(v, kind){
  const s = String(v && v.state || 'draft').toLowerCase();
  return {
    kind: kind || 'item',
    state: (s === 'review' || s === 'approved') ? s : 'draft',
    locked: !!(v && v.locked),
    requestedAt: Number(v && v.requestedAt || 0),
    approvedAt: Number(v && v.approvedAt || 0),
    updatedAt: Number(v && v.updatedAt || 0),
    reviewer: String(v && v.reviewer || ''),
    note: String(v && v.note || '').slice(0, 280),
  };
}
function phase14TaskApproval_(t){
  if(!t || typeof t !== 'object') return phase14NormalizeApproval_(null, 'task');
  t.approval = phase14NormalizeApproval_(t.approval, 'task');
  return t.approval;
}
function phase14MilestoneApproval_(m){
  if(!m || typeof m !== 'object') return phase14NormalizeApproval_(null, 'milestone');
  m.approval = phase14NormalizeApproval_(m.approval, 'milestone');
  return m.approval;
}
function phase14ApprovalLabel_(a){
  const s = String(a && a.state || 'draft');
  if(s === 'review') return 'IN REVIEW';
  if(s === 'approved') return 'APPROVED';
  return 'DRAFT';
}
function phase14ApprovalClass_(a){
  const s = String(a && a.state || 'draft');
  return (s === 'review' || s === 'approved') ? s : 'draft';
}
function phase14IsMilestoneLocked_(m){
  return !!phase14MilestoneApproval_(m).locked;
}
function phase14IsTaskLocked_(t){
  return !!phase14TaskApproval_(t).locked;
}
function phase14ActiveMilestoneLocked_(){
  const p = getActiveProject && getActiveProject();
  const m = p ? getActiveMilestone(p) : null;
  return !!(m && phase14IsMilestoneLocked_(m));
}

function phase14LoadAudit_(){
  if(Array.isArray(phase14State_.audit)) return phase14State_.audit;
  let arr = [];
  try{ arr = JSON.parse(localStorage.getItem(PHASE14_APPROVAL_AUDIT_KEY) || '[]') || []; }catch{ arr = []; }
  phase14State_.audit = Array.isArray(arr) ? arr.filter(Boolean).map(x => ({
    id: String(x && x.id || uid()),
    ts: Number(x && x.ts || Date.now()),
    scope: String(x && x.scope || 'item'),
    action: String(x && x.action || 'update'),
    targetType: String(x && x.targetType || 'item'),
    targetId: String(x && x.targetId || ''),
    projectId: String(x && x.projectId || ''),
    moduleId: String(x && x.moduleId || ''),
    milestoneId: String(x && x.milestoneId || ''),
    taskId: String(x && x.taskId || ''),
    title: String(x && x.title || ''),
    state: String(x && x.state || ''),
    locked: !!(x && x.locked),
    note: String(x && x.note || '').slice(0, 280),
  })) : [];
  return phase14State_.audit;
}
function phase14SaveAudit_(){ try{ localStorage.setItem(PHASE14_APPROVAL_AUDIT_KEY, JSON.stringify((phase14LoadAudit_()||[]).slice(0,1500))); }catch{} }
function phase14PushAudit_(payload){
  const rows = phase14LoadAudit_();
  rows.unshift({ id: uid(), ts: Date.now(), ...payload });
  if(rows.length > 1500) rows.length = 1500;
  phase14SaveAudit_();
}
function phase14AuditMessage_(payload){
  const bits = ['Phase14'];
  bits.push(payload.targetType === 'task' ? 'task' : 'milestone');
  bits.push(payload.action);
  if(payload.title) bits.push(`: ${payload.title}`);
  if(payload.state) bits.push(`[${String(payload.state).toUpperCase()}]`);
  if(payload.locked) bits.push('[LOCKED]');
  if(payload.note) bits.push(`(${payload.note})`);
  return bits.join(' ');
}
function phase14LogApprovalAction_(ctx, payload){
  const row = {
    scope:'approval',
    targetType: payload.targetType,
    action: payload.action,
    targetId: String(payload.targetId || ''),
    projectId: String(ctx && ctx.p && ctx.p.id || ''),
    moduleId: String(ctx && ctx.mod && ctx.mod.id || ''),
    milestoneId: String(ctx && ctx.ms && ctx.ms.id || ''),
    taskId: String(ctx && ctx.t && ctx.t.id || ''),
    title: String(payload.title || ''),
    state: String(payload.state || ''),
    locked: !!payload.locked,
    note: String(payload.note || ''),
  };
  phase14PushAudit_(row);
  try{ addActivity(phase14AuditMessage_(row)); }catch{}
}

function phase14TaskCtxInActive_(taskId){
  const p = getActiveProject && getActiveProject();
  const mod = p ? getActiveModule(p) : null;
  const ms = p ? getActiveMilestone(p) : null;
  if(!ms || !taskId) return null;
  const t = (ms.tasks || []).find(x => x && String(x.id) === String(taskId));
  if(!t) return null;
  return { p, mod, ms, t };
}
function phase14CurrentMilestoneCtx_(){
  const p = getActiveProject && getActiveProject();
  const mod = p ? getActiveModule(p) : null;
  const ms = p ? getActiveMilestone(p) : null;
  if(!ms) return null;
  return { p, mod, ms };
}

async function phase14SetTaskApprovalState_(taskId, nextState){
  const ctx = phase14TaskCtxInActive_(taskId);
  if(!ctx) return;
  const { p, mod, ms, t } = ctx;
  if(phase14IsMilestoneLocked_(ms) && nextState !== 'draft' && nextState !== 'review' && nextState !== 'approved') return;
  const a = phase14TaskApproval_(t);
  const prevState = a.state;
  const targetState = (nextState === 'approved' || nextState === 'review') ? nextState : 'draft';
  let rollbackNote = '';
  if(prevState === 'approved' && targetState !== 'approved'){
    const raw = await pmPromptDialog_(`Rollback note for task "${t.title}" (optional, recommended):`, a.note || '', { title:'Rollback Task Approval', placeholder:'Optional rollback note' });
    if(raw == null) return;
    rollbackNote = String(raw || '').trim().slice(0, 280);
  }
  if(prevState === targetState && !rollbackNote) return;
  a.state = targetState;
  if(targetState === 'review' && !a.requestedAt) a.requestedAt = Date.now();
  if(targetState === 'approved'){
    a.approvedAt = Date.now();
    a.reviewer = 'ME';
  }
  a.updatedAt = Date.now();
  if(rollbackNote) a.note = rollbackNote;
  phase14LogApprovalAction_({ p, mod, ms, t }, {
    targetType:'task',
    action: (targetState === 'review' ? 'request_review' : targetState === 'approved' ? 'approve' : 'rework'),
    targetId: t.id,
    title: t.title,
    state: targetState,
    locked: !!a.locked,
    note: rollbackNote || a.note || ''
  });
  saveState();
  renderAll();
}
function phase14ToggleTaskLock_(taskId){
  const ctx = phase14TaskCtxInActive_(taskId);
  if(!ctx) return;
  const { p, mod, ms, t } = ctx;
  const a = phase14TaskApproval_(t);
  a.locked = !a.locked;
  a.updatedAt = Date.now();
  if(a.locked && a.state === 'draft') a.state = 'review';
  phase14LogApprovalAction_({ p, mod, ms, t }, {
    targetType:'task', action: a.locked ? 'lock' : 'unlock', targetId:t.id, title:t.title, state:a.state, locked:a.locked
  });
  saveState();
  renderAll();
}
async function phase14SetMilestoneApprovalState_(nextState){
  const ctx = phase14CurrentMilestoneCtx_();
  if(!ctx) return;
  const { p, mod, ms } = ctx;
  const a = phase14MilestoneApproval_(ms);
  const prevState = a.state;
  const targetState = (nextState === 'approved' || nextState === 'review') ? nextState : 'draft';
  let rollbackNote = '';
  if(prevState === 'approved' && targetState !== 'approved'){
    const raw = await pmPromptDialog_(`Rollback note for milestone "${ms.title}" (optional, recommended):`, a.note || '', { title:'Rollback Milestone Approval', placeholder:'Optional rollback note' });
    if(raw == null) return;
    rollbackNote = String(raw || '').trim().slice(0, 280);
  }
  if(prevState === targetState && !rollbackNote) return;
  a.state = targetState;
  if(targetState === 'review' && !a.requestedAt) a.requestedAt = Date.now();
  if(targetState === 'approved'){
    a.approvedAt = Date.now();
    a.reviewer = 'ME';
  }
  a.updatedAt = Date.now();
  if(rollbackNote) a.note = rollbackNote;
  phase14LogApprovalAction_({ p, mod, ms }, {
    targetType:'milestone',
    action:(targetState === 'review' ? 'request_review' : targetState === 'approved' ? 'approve' : 'rework'),
    targetId: ms.id,
    title: ms.title,
    state: targetState,
    locked: !!a.locked,
    note: rollbackNote || a.note || ''
  });
  saveState();
  renderAll();
}
function phase14ToggleMilestoneLock_(){
  const ctx = phase14CurrentMilestoneCtx_();
  if(!ctx) return;
  const { p, mod, ms } = ctx;
  const a = phase14MilestoneApproval_(ms);
  a.locked = !a.locked;
  a.updatedAt = Date.now();
  if(a.locked && a.state === 'draft') a.state = 'review';
  phase14LogApprovalAction_({ p, mod, ms }, {
    targetType:'milestone', action:a.locked ? 'lock' : 'unlock', targetId:ms.id, title:ms.title, state:a.state, locked:a.locked
  });
  saveState();
  renderAll();
}

function phase14CollectApprovalQueue_(opts){
  opts = opts || {};
  const onlyActive = !!opts.onlyActiveProject;
  const active = getActiveProject && getActiveProject();
  const out = { taskDraft:0, taskReview:0, taskApproved:0, taskLocked:0, milestoneDraft:0, milestoneReview:0, milestoneApproved:0, milestoneLocked:0, taskRows:[], milestoneRows:[] };
  for(const p of (state.projects || [])){
    if(onlyActive && active && String(p.id) !== String(active.id)) continue;
    for(const mod of (p.modules || [])){
      for(const ms of (mod.milestones || [])){
        const ma = phase14MilestoneApproval_(ms);
        if(ma.state === 'review') out.milestoneReview++; else if(ma.state === 'approved') out.milestoneApproved++; else out.milestoneDraft++;
        if(ma.locked) out.milestoneLocked++;
        if(ma.state === 'review' || ma.locked){
          out.milestoneRows.push({ p, mod, ms, a:ma });
        }
        for(const t of (ms.tasks || [])){
          const ta = phase14TaskApproval_(t);
          if(ta.state === 'review') out.taskReview++; else if(ta.state === 'approved') out.taskApproved++; else out.taskDraft++;
          if(ta.locked) out.taskLocked++;
          if(ta.state === 'review' || ta.locked){
            out.taskRows.push({ p, mod, ms, t, a:ta });
          }
        }
      }
    }
  }
  out.taskRows.sort((a,b) => (Number(b.a.updatedAt||0)-Number(a.a.updatedAt||0)) || String(a.t.title||'').localeCompare(String(b.t.title||'')));
  out.milestoneRows.sort((a,b) => (Number(b.a.updatedAt||0)-Number(a.a.updatedAt||0)) || String(a.ms.title||'').localeCompare(String(b.ms.title||'')));
  return out;
}

function phase14PostRenderDashboard_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return;
  let box = document.querySelector('#phase14ApprovalQueuePanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase14ApprovalQueuePanel';
    box.className = 'phase14-box';
    const host = document.querySelector('#phase13DashboardHost') || document.querySelector('#phase12DashboardHost') || document.querySelector('#phase11DashboardHost') || document.querySelector('#phase10DashboardHost') || document.querySelector('#phase8DashboardHost');
    if(host && host.parentElement) host.parentElement.insertBefore(box, host);
    else tab.appendChild(box);
  }
  const q = phase14CollectApprovalQueue_({ onlyActiveProject:false });
  const active = getActiveProject && getActiveProject();
  const recentAudit = phase14LoadAudit_().slice(0, 6);
  box.innerHTML = `
    <div class="phase14-title">Phase 14 Approval Workflow & Review Queue</div>
    <div class="phase14-grid">
      <div class="phase14-card">
        <div class="phase14-toolbar">
          <button class="btn btn--ghost" type="button" id="phase14BtnOpenChecklistReview">Open Checklist Review</button>
          <button class="btn btn--ghost" type="button" id="phase14BtnOpenMilestoneApproval">Open Milestone Approval</button>
          <button class="btn btn--ghost" type="button" id="phase14BtnOpenExportApprovalAudit">Export Approval Audit</button>
        </div>
        <div class="phase14-kv">
          <div><b>Task Review</b><span>${q.taskReview}</span></div>
          <div><b>Task Locked</b><span>${q.taskLocked}</span></div>
          <div><b>MS Review</b><span>${q.milestoneReview}</span></div>
          <div><b>MS Locked</b><span>${q.milestoneLocked}</span></div>
        </div>
        <div class="phase14-note" style="margin-top:8px">Use task/milestone approvals to control when execution items can be changed. Locked items are protected by manual checklist/milestone guardrails. ${active ? `Active project: <b>${escapeHtml(String(active.name||''))}</b>.` : 'Select a project to review approvals.'}</div>
        <div class="phase14-list" id="phase14DashQueueList"></div>
      </div>
      <div class="phase14-card">
        <div class="phase14-title" style="margin-bottom:6px">Approval Audit (Recent)</div>
        <div class="phase14-pre" id="phase14DashAuditPreview"></div>
      </div>
    </div>
  `;
  const qList = box.querySelector('#phase14DashQueueList');
  const rows = q.taskRows.slice(0, 6).concat(q.milestoneRows.slice(0, 4));
  if(!rows.length){
    qList.innerHTML = `<div class="phase14-helpItem"><b>No pending review items</b><span>Queue fills when tasks/milestones are set to In Review or locked.</span></div>`;
  } else {
    for(const row of rows){
      const isTask = !!row.t;
      const title = isTask ? String(row.t.title||'') : String(row.ms.title||'');
      const meta = isTask
        ? `${row.p?.name || '—'} • ${row.mod?.name || '—'} • ${row.ms?.title || '—'}`
        : `${row.p?.name || '—'} • ${row.mod?.name || '—'}`;
      const a = row.a;
      const wrap = document.createElement('div');
      wrap.className = 'phase14-row';
      wrap.innerHTML = `
        <div>
          <div class="phase14-row__name">${isTask ? 'Task' : 'Milestone'} • ${escapeHtml(title)}</div>
          <div class="phase14-row__meta">${escapeHtml(meta)}</div>
        </div>
        <div class="phase14-tags">
          <span class="phase14-tag ${phase14ApprovalClass_(a)}">${escapeHtml(phase14ApprovalLabel_(a))}</span>
          ${a.locked ? '<span class="phase14-tag locked">LOCKED</span>' : ''}
          <button class="btn btn--ghost" type="button" data-act="open">Open</button>
        </div>
      `;
      wrap.querySelector('[data-act="open"]')?.addEventListener('click', () => {
        try{
          setActiveProject(row.p.id);
          setActiveModule(row.mod.id);
          setActiveMilestone(row.ms.id);
          if(isTask){
            switchTab('checklist');
            setTimeout(() => {
              const el = document.querySelector(`#taskList .task[data-task-id="${CSS.escape(String(row.t.id))}"]`);
              el?.scrollIntoView({ behavior:'smooth', block:'center' });
              el?.classList.add('is-selected'); setTimeout(()=>el?.classList.remove('is-selected'), 900);
            }, 60);
          } else {
            switchTab('milestones');
          }
        }catch{}
      });
      qList.appendChild(wrap);
    }
  }
  box.querySelector('#phase14BtnOpenChecklistReview')?.addEventListener('click', () => { switchTab('checklist'); setTimeout(()=>document.querySelector('#phase14ChecklistApprovalPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
  box.querySelector('#phase14BtnOpenMilestoneApproval')?.addEventListener('click', () => { switchTab('milestones'); setTimeout(()=>document.querySelector('#phase14MilestoneApprovalPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
  box.querySelector('#phase14BtnOpenExportApprovalAudit')?.addEventListener('click', () => { phase14OpenExportTab_({ type:'approval_audit', fmt:'JSON' }); });
  const previewLines = recentAudit.length ? recentAudit.map(a => {
    const when = new Date(Number(a.ts||Date.now())).toLocaleString();
    const bits = [`[${when}]`, a.targetType || 'item', a.action || 'update'];
    if(a.title) bits.push(a.title);
    if(a.state) bits.push(`(${String(a.state).toUpperCase()})`);
    if(a.locked) bits.push('[LOCKED]');
    if(a.note) bits.push(`- ${a.note}`);
    return bits.join(' ');
  }) : ['No approval audit entries yet.'];
  box.querySelector('#phase14DashAuditPreview').textContent = previewLines.join('\n');
}

function phase14PostRenderMilestones_(){
  const tab = document.querySelector('#tab-milestones');
  if(!tab) return;
  phase14DecorateMilestoneList_();

  const cards = Array.from(tab.querySelectorAll('.card'));
  const detailCard = cards[1] || cards[cards.length-1];
  if(!detailCard) return;
  let box = document.querySelector('#phase14MilestoneApprovalPanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase14MilestoneApprovalPanel';
    box.className = 'phase14-box';
    detailCard.appendChild(box);
  }
  const ctx = phase14CurrentMilestoneCtx_();
  if(!ctx){
    box.innerHTML = `
      <div class="phase14-title">Milestone Approval</div>
      <div class="phase14-note">Select a milestone to manage approval state and change lock.</div>
    `;
    return;
  }
  const { p, mod, ms } = ctx;
  const a = phase14MilestoneApproval_(ms);
  const taskTotal = Array.isArray(ms.tasks) ? ms.tasks.length : 0;
  const tReview = (ms.tasks||[]).filter(t => phase14TaskApproval_(t).state === 'review').length;
  const tApproved = (ms.tasks||[]).filter(t => phase14TaskApproval_(t).state === 'approved').length;
  const tLocked = (ms.tasks||[]).filter(t => phase14TaskApproval_(t).locked).length;
  const canApprove = taskTotal === 0 || (tReview + tApproved) > 0;

  box.innerHTML = `
    <div class="phase14-title">Milestone Approval</div>
    <div class="phase14-toolbar">
      <span class="phase14-tag ${phase14ApprovalClass_(a)}">${escapeHtml(phase14ApprovalLabel_(a))}</span>
      ${a.locked ? '<span class="phase14-tag locked">LOCKED</span>' : ''}
      <button class="btn btn--ghost" type="button" id="phase14BtnMsReview">Request Review</button>
      <button class="btn btn--ghost" type="button" id="phase14BtnMsApprove" ${canApprove ? '' : 'disabled'}>Approve</button>
      <button class="btn btn--ghost" type="button" id="phase14BtnMsRework">Back to Draft</button>
      <button class="btn btn--ghost" type="button" id="phase14BtnMsLockToggle">${a.locked ? 'Unlock Changes' : 'Lock Changes'}</button>
    </div>
    <div class="phase14-kv">
      <div><b>Tasks</b><span>${taskTotal}</span></div>
      <div><b>Task Review</b><span>${tReview}</span></div>
      <div><b>Task Approved</b><span>${tApproved}</span></div>
      <div><b>Task Locked</b><span>${tLocked}</span></div>
    </div>
    <div class="phase14-note" style="margin-top:8px">${escapeHtml(String(p?.name||''))} • ${escapeHtml(String(mod?.name||''))} • ${escapeHtml(String(ms?.title||''))}</div>
    <div class="phase14-note">When the milestone is locked, manual edits on the milestone form and checklist mutation buttons are blocked until unlocked.</div>
    ${phase14IsMilestoneLocked_(ms) ? '<div class="phase14-lockHint">Milestone lock is active. Save/Delete milestone and checklist mutate actions are guarded.</div>' : ''}
  `;
  box.querySelector('#phase14BtnMsReview')?.addEventListener('click', ()=>phase14SetMilestoneApprovalState_('review'));
  box.querySelector('#phase14BtnMsApprove')?.addEventListener('click', ()=>phase14SetMilestoneApprovalState_('approved'));
  box.querySelector('#phase14BtnMsRework')?.addEventListener('click', ()=>phase14SetMilestoneApprovalState_('draft'));
  box.querySelector('#phase14BtnMsLockToggle')?.addEventListener('click', phase14ToggleMilestoneLock_);

  try{
    const saveBtn = document.querySelector('#btnSaveMilestone');
    const delBtn = document.querySelector('#btnDeleteMilestone');
    if(saveBtn){ saveBtn.disabled = !!a.locked; saveBtn.title = a.locked ? 'Milestone changes are locked (Phase 14)' : ''; }
    if(delBtn){ delBtn.disabled = !!a.locked; delBtn.title = a.locked ? 'Milestone changes are locked (Phase 14)' : ''; }
  }catch{}
}

function phase14DecorateMilestoneList_(){
  const p = getActiveProject && getActiveProject();
  const mod = p ? getActiveModule(p) : null;
  const items = Array.from(document.querySelectorAll('#milestoneList .item'));
  const rows = Array.isArray(mod && mod.milestones) ? mod.milestones : [];
  items.forEach((el, idx) => {
    const ms = rows[idx];
    if(!ms) return;
    const a = phase14MilestoneApproval_(ms);
    let sub = el.querySelector('.item__sub');
    if(!sub) return;
    let badge = sub.querySelector('.phase14-msBadgeState');
    if(!badge){ badge = document.createElement('span'); badge.className = `badge phase14-msBadgeState`; sub.appendChild(badge); }
    badge.textContent = phase14ApprovalLabel_(a);
    badge.className = `badge phase14-msBadgeState phase14-badge ${phase14ApprovalClass_(a)}`;
    let lockBadge = sub.querySelector('.phase14-msBadgeLock');
    if(a.locked){
      if(!lockBadge){ lockBadge = document.createElement('span'); lockBadge.className = 'badge phase14-msBadgeLock'; sub.appendChild(lockBadge); }
      lockBadge.textContent = 'LOCKED';
      lockBadge.className = 'badge phase14-msBadgeLock phase14-badge locked';
      el.classList.add('phase14-taskLocked');
    } else {
      if(lockBadge) lockBadge.remove();
      el.classList.remove('phase14-taskLocked');
    }
  });
}

function phase14PostRenderChecklist_(){
  const tab = document.querySelector('#tab-checklist');
  if(!tab) return;
  phase14DecorateTaskCards_();

  const cards = Array.from(tab.querySelectorAll('.card'));
  const tasksCard = cards[1] || cards[cards.length-1];
  if(!tasksCard) return;
  let box = document.querySelector('#phase14ChecklistApprovalPanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase14ChecklistApprovalPanel';
    box.className = 'phase14-box';
    tasksCard.appendChild(box);
  }
  const p = getActiveProject && getActiveProject();
  const mod = p ? getActiveModule(p) : null;
  const ms = p ? getActiveMilestone(p) : null;
  if(!ms){
    box.innerHTML = `<div class="phase14-title">Task Review Queue</div><div class="phase14-note">Select a milestone to review tasks and apply approval / lock states.</div>`;
    return;
  }
  const ma = phase14MilestoneApproval_(ms);
  const tasks = Array.isArray(ms.tasks) ? ms.tasks : [];
  const counts = { draft:0, review:0, approved:0, locked:0 };
  for(const t of tasks){ const a = phase14TaskApproval_(t); counts[a.state] = (counts[a.state]||0)+1; if(a.locked) counts.locked++; }

  box.innerHTML = `
    <div class="phase14-title">Task Review Queue</div>
    <div class="phase14-toolbar">
      <span class="phase14-tag ${phase14ApprovalClass_(ma)}">Milestone ${escapeHtml(phase14ApprovalLabel_(ma))}</span>
      ${ma.locked ? '<span class="phase14-tag locked">MILESTONE LOCKED</span>' : ''}
      <button class="btn btn--ghost" type="button" id="phase14BtnTaskQueuePending">Pending Only</button>
      <button class="btn btn--ghost" type="button" id="phase14BtnTaskQueueAll">All Tasks</button>
      <button class="btn btn--ghost" type="button" id="phase14BtnTaskQueueApproveReview">Approve In Review</button>
    </div>
    <div class="phase14-kv">
      <div><b>Draft</b><span>${counts.draft||0}</span></div>
      <div><b>Review</b><span>${counts.review||0}</span></div>
      <div><b>Approved</b><span>${counts.approved||0}</span></div>
      <div><b>Locked</b><span>${counts.locked||0}</span></div>
    </div>
    <div class="phase14-note" style="margin-top:8px">${escapeHtml(String(p?.name||''))} • ${escapeHtml(String(mod?.name||''))} • ${escapeHtml(String(ms?.title||''))}</div>
    <div class="phase14-list" id="phase14ChecklistTaskQueueList"></div>
  `;
  const list = box.querySelector('#phase14ChecklistTaskQueueList');
  let mode = box.dataset.mode || 'pending';
  const renderRows = () => {
    box.dataset.mode = mode;
    list.innerHTML = '';
    let rows = tasks.slice();
    if(mode === 'pending') rows = rows.filter(t => { const a = phase14TaskApproval_(t); return a.state === 'review' || a.locked; });
    rows.sort((a,b) => {
      const aa = phase14TaskApproval_(a), bb = phase14TaskApproval_(b);
      const rank = x => x.state === 'review' ? 0 : x.locked ? 1 : x.state === 'approved' ? 2 : 3;
      return rank(aa) - rank(bb) || String(a.title||'').localeCompare(String(b.title||''));
    });
    if(!rows.length){
      list.innerHTML = `<div class="phase14-helpItem"><b>No ${mode === 'pending' ? 'pending review/locked' : ''} tasks</b><span>Use the buttons below each task row to move it into review or approve it.</span></div>`;
      return;
    }
    rows.slice(0, 80).forEach(t => {
      const a = phase14TaskApproval_(t);
      const row = document.createElement('div');
      row.className = 'phase14-row';
      row.innerHTML = `
        <div>
          <div class="phase14-row__name">${escapeHtml(String(t.title||''))}</div>
          <div class="phase14-row__meta">${t.done ? 'Done' : 'Open'} • ${escapeHtml(String(t.severity||'normal').toUpperCase())}${t.assignee ? ' • ' + escapeHtml(String(t.assignee)) : ''}${a.note ? ' • note: ' + escapeHtml(String(a.note)).slice(0,80) : ''}</div>
        </div>
        <div class="phase14-tags">
          <span class="phase14-tag ${phase14ApprovalClass_(a)}">${escapeHtml(phase14ApprovalLabel_(a))}</span>
          ${a.locked ? '<span class="phase14-tag locked">LOCKED</span>' : ''}
          <button class="btn btn--ghost" type="button" data-act="focus">Focus</button>
          <button class="btn btn--ghost" type="button" data-act="review">Review</button>
          <button class="btn btn--ghost" type="button" data-act="approve">Approve</button>
          <button class="btn btn--ghost" type="button" data-act="rework">Draft</button>
          <button class="btn btn--ghost" type="button" data-act="lock">${a.locked ? 'Unlock' : 'Lock'}</button>
        </div>
      `;
      row.querySelector('[data-act="focus"]')?.addEventListener('click', () => {
        const el = document.querySelector(`#taskList .task[data-task-id="${CSS.escape(String(t.id))}"]`);
        el?.scrollIntoView({ behavior:'smooth', block:'center' });
        el?.classList.add('is-selected'); setTimeout(()=>el?.classList.remove('is-selected'), 900);
      });
      row.querySelector('[data-act="review"]')?.addEventListener('click', ()=>phase14SetTaskApprovalState_(t.id, 'review'));
      row.querySelector('[data-act="approve"]')?.addEventListener('click', ()=>phase14SetTaskApprovalState_(t.id, 'approved'));
      row.querySelector('[data-act="rework"]')?.addEventListener('click', ()=>phase14SetTaskApprovalState_(t.id, 'draft'));
      row.querySelector('[data-act="lock"]')?.addEventListener('click', ()=>phase14ToggleTaskLock_(t.id));
      list.appendChild(row);
    });
  };
  renderRows();
  box.querySelector('#phase14BtnTaskQueuePending')?.addEventListener('click', ()=>{ mode='pending'; renderRows(); });
  box.querySelector('#phase14BtnTaskQueueAll')?.addEventListener('click', ()=>{ mode='all'; renderRows(); });
  box.querySelector('#phase14BtnTaskQueueApproveReview')?.addEventListener('click', async () => {
    if(phase14IsMilestoneLocked_(ms)) { alert('Milestone is locked. Unlock it first if you need to change approvals.'); return; }
    const ids = tasks.filter(t => phase14TaskApproval_(t).state === 'review').map(t => t.id);
    if(!ids.length){ alert('No tasks currently in review.'); return; }
    const okApprove = await pmConfirmDialog_(`Approve ${ids.length} task(s) currently in review?`, { title:'Approve Review Queue', okText:'Approve' });
    if(!okApprove) return;
    for(const id of ids){
      const tt = (ms.tasks || []).find(x => x && x.id === id); if(!tt) continue;
      const a = phase14TaskApproval_(tt);
      a.state = 'approved'; a.approvedAt = Date.now(); a.reviewer = 'ME'; a.updatedAt = Date.now();
      phase14LogApprovalAction_({ p, mod, ms, t:tt }, { targetType:'task', action:'approve', targetId:tt.id, title:tt.title, state:a.state, locked:a.locked });
    }
    saveState();
    renderAll();
  });

  // disable common checklist mutation buttons when milestone is locked
  const locked = phase14IsMilestoneLocked_(ms);
  ['btnAddTask','btnSortTasks','btnClearDone'].forEach(id => {
    const btn = document.getElementById(id);
    if(!btn) return;
    btn.disabled = locked;
    btn.title = locked ? 'Milestone changes are locked (Phase 14)' : '';
  });
}

function phase14DecorateTaskCards_(){
  const p = getActiveProject && getActiveProject();
  const ms = p ? getActiveMilestone(p) : null;
  const cards = Array.from(document.querySelectorAll('#taskList .task'));
  if(!ms){ cards.forEach(c => c.classList.remove('phase14-taskLocked')); return; }
  for(const card of cards){
    const tid = String(card.dataset.taskId || '');
    const t = (ms.tasks || []).find(x => x && String(x.id) === tid);
    if(!t) continue;
    const a = phase14TaskApproval_(t);
    const meta = card.querySelector('.task__meta');
    if(meta){
      let stateBadge = meta.querySelector('.phase14-taskBadgeState');
      if(!stateBadge){ stateBadge = document.createElement('span'); stateBadge.className = 'badge phase14-taskBadgeState'; meta.appendChild(stateBadge); }
      stateBadge.textContent = phase14ApprovalLabel_(a);
      stateBadge.className = `badge phase14-taskBadgeState phase14-badge ${phase14ApprovalClass_(a)}`;
      let lockBadge = meta.querySelector('.phase14-taskBadgeLock');
      if(a.locked){
        if(!lockBadge){ lockBadge = document.createElement('span'); lockBadge.className = 'badge phase14-taskBadgeLock'; meta.appendChild(lockBadge); }
        lockBadge.textContent = 'LOCKED';
        lockBadge.className = 'badge phase14-taskBadgeLock phase14-badge locked';
      } else if(lockBadge){ lockBadge.remove(); }
    }
    card.classList.toggle('phase14-taskLocked', !!a.locked);
  }
}

function phase14BindGuardrails_(){
  if(document._phase14GuardrailsBound) return;
  document._phase14GuardrailsBound = true;

  const block = (e, msg) => {
    try{ e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation && e.stopImmediatePropagation(); }catch{}
    alert(msg || 'This item is locked by Phase 14 approval controls. Unlock it first.');
  };

  document.addEventListener('click', function(e){
    const t = e.target;
    if(!t || !(t instanceof Element)) return;

    // topbar export cleanup shortcut
    const exportBtn = t.closest('#phase14BtnExportCenter');
    if(exportBtn){
      e.preventDefault();
      phase14OpenExportTab_();
      return;
    }

    // Milestone-level guards
    const saveMs = t.closest('#btnSaveMilestone');
    const delMs = t.closest('#btnDeleteMilestone');
    if((saveMs || delMs) && phase14ActiveMilestoneLocked_()){
      return block(e, 'Milestone changes are locked. Use Phase 14 Milestone Approval panel to unlock first.');
    }
    const mutBtn = t.closest('#btnAddTask, #btnSortTasks, #btnClearDone, #phase9BtnAssignSet, #phase9BtnAssignClear, #phase9BtnAssignRebalance');
    if(mutBtn && phase14ActiveMilestoneLocked_()){
      return block(e, 'Checklist changes are locked because the active milestone is locked (Phase 14).');
    }

    // Task-level guard on task card interactive controls (allow comments thread button)
    const taskCard = t.closest('#taskList .task');
    if(taskCard){
      const tid = String(taskCard.dataset.taskId || '');
      const ctx = phase14TaskCtxInActive_(tid);
      if(!ctx) return;
      if(phase14IsMilestoneLocked_(ctx.ms)){
        const interactive = t.closest('button,input,select,textarea,label,.iconbtn');
        const allowComment = !!t.closest('[data-act="phase9Comment"]');
        if(interactive && !allowComment){
          return block(e, 'This milestone is locked. Unlock milestone changes from the Phase 14 Milestone Approval panel.');
        }
      }
      const ta = phase14TaskApproval_(ctx.t);
      if(ta.locked){
        const interactive = t.closest('button,input,select,textarea,label,.iconbtn');
        const allowComment = !!t.closest('[data-act="phase9Comment"]');
        if(interactive && !allowComment){
          return block(e, 'This task is locked by approval controls. Unlock the task in the Phase 14 Task Review Queue first.');
        }
      }
    }
  }, true);

  document.addEventListener('change', function(e){
    const t = e.target;
    if(!t || !(t instanceof Element)) return;
    const taskCard = t.closest('#taskList .task');
    if(!taskCard) return;
    const tid = String(taskCard.dataset.taskId || '');
    const ctx = phase14TaskCtxInActive_(tid);
    if(!ctx) return;
    if(phase14IsMilestoneLocked_(ctx.ms)){
      return block(e, 'This milestone is locked. Unlock milestone changes to edit tasks.');
    }
    if(phase14IsTaskLocked_(ctx.t)){
      return block(e, 'This task is locked by approval controls.');
    }
  }, true);
}

function phase14InjectExportTab_(){
  const sidebarNav = document.querySelector('.nav');
  const importTab = document.querySelector('#tab-import');
  if(!sidebarNav || !importTab) return;

  let navBtn = sidebarNav.querySelector('.nav__item[data-tab="export"]');
  if(!navBtn){
    const importBtn = sidebarNav.querySelector('.nav__item[data-tab="import"]');
    navBtn = document.createElement('button');
    navBtn.className = 'nav__item';
    navBtn.type = 'button';
    navBtn.dataset.tab = 'export';
    navBtn.textContent = 'Export';
    if(importBtn && importBtn.parentElement) importBtn.parentElement.insertBefore(navBtn, importBtn);
    else sidebarNav.appendChild(navBtn);
  }

  let panel = document.querySelector('#tab-export');
  if(!panel){
    panel = document.createElement('section');
    panel.className = 'tab';
    panel.id = 'tab-export';
    panel.dataset.tab = 'export';
    panel.innerHTML = `
      <div class="tab__header">
        <div class="tab__title">Export Center</div>
        <div class="tab__subtitle">Choose what to export, format, and scope from one place (replaces scattered export buttons in the top bar).</div>
      </div>
      <div id="phase14ExportCenterRoot"></div>
    `;
    importTab.parentElement.insertBefore(panel, importTab);
  }

  if(ui && Array.isArray(ui.tabs) && !ui.tabs.some(x => x && x.dataset && x.dataset.tab === 'export')) ui.tabs.push(navBtn);
  if(ui && Array.isArray(ui.tabPanels) && !ui.tabPanels.some(x => x && x.dataset && x.dataset.tab === 'export')) ui.tabPanels.push(panel);

  if(!navBtn._phase14Bound){
    navBtn.addEventListener('click', () => {
      switchTab('export');
      setTimeout(() => phase14RenderExportCenter_(), 20);
    });
    navBtn._phase14Bound = true;
  }
}

function phase14EnhanceTopbarExport_(){
  const topbarRight = document.querySelector('#topbarRight') || document.querySelector('.topbar__right') || document.querySelector('.topbar-right');
  if(!topbarRight) return;

  // Hide scattered export-related buttons and route users to Export Center.
  ['#btnExportJson','#btnExportMd','#btnExportTxt','#phase7BtnExportV2','#phase9BtnAuditExport','#phase10BtnStatusReport','#phase12BtnRiskDigest']
    .forEach(sel => { const el = document.querySelector(sel); if(el){ el.style.display = 'none'; el.dataset.phase14HiddenExport = '1'; } });

  let btn = document.querySelector('#phase14BtnExportCenter');
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'phase14BtnExportCenter';
    btn.className = 'btn phase14-topbar-export';
    btn.type = 'button';
    btn.textContent = 'Export';
    btn.title = 'Open Export Center';
    const before = document.querySelector('#phase7BtnImportV2') || topbarRight.firstElementChild || null;
    topbarRight.insertBefore(btn, before);
  }
}

function phase14LoadExportUi_(){
  if(phase14State_.exportUi) return phase14State_.exportUi;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE14_EXPORT_UI_KEY) || 'null'); }catch{}
  const x = (raw && typeof raw === 'object') ? raw : {};
  phase14State_.exportUi = {
    type: ['state_json','project_doc','portable_v2','status_report','risk_digest','audit_activity','approval_audit','dashboard_views','digest_presets'].includes(String(x.type||'')) ? String(x.type) : 'project_doc',
    fmt: ['JSON','MD','TXT'].includes(String(x.fmt||'').toUpperCase()) ? String(x.fmt).toUpperCase() : 'MD',
    allProjects: !!x.allProjects,
    includeApprovalAudit: x.includeApprovalAudit !== false,
  };
  return phase14State_.exportUi;
}
function phase14SaveExportUi_(){ try{ localStorage.setItem(PHASE14_EXPORT_UI_KEY, JSON.stringify(phase14LoadExportUi_())); }catch{} }

function phase14OpenExportTab_(opts){
  const uiCfg = phase14LoadExportUi_();
  if(opts && opts.type) uiCfg.type = opts.type;
  if(opts && opts.fmt) uiCfg.fmt = String(opts.fmt).toUpperCase();
  phase14SaveExportUi_();
  switchTab('export');
  setTimeout(() => {
    phase14RenderExportCenter_();
    const typeSel = document.querySelector('#phase14ExportType');
    const fmtSel = document.querySelector('#phase14ExportFmt');
    if(typeSel && opts && opts.type){ typeSel.value = uiCfg.type; typeSel.dispatchEvent(new Event('change')); }
    if(fmtSel && opts && opts.fmt){ fmtSel.value = uiCfg.fmt; fmtSel.dispatchEvent(new Event('change')); }
    document.querySelector('#phase14BtnRunExport')?.focus();
  }, 30);
}

function phase14RenderExportCenter_(){
  const root = document.querySelector('#phase14ExportCenterRoot');
  if(!root) return;
  const cfg = phase14LoadExportUi_();
  const p = getActiveProject && getActiveProject();
  const approvalAuditCount = (phase14LoadAudit_() || []).length;
  const dashViewsCount = (typeof phase11LoadDashViews_ === 'function') ? (phase11LoadDashViews_() || []).length : 0;
  const digestPresetCount = (typeof phase13LoadDigestPresets_ === 'function') ? (phase13LoadDigestPresets_() || []).length : 0;

  root.innerHTML = `
    <div class="phase14-exportLayout">
      <div class="phase14-exportCard">
        <h4>Export Request</h4>
        <div class="phase14-fields">
          <label class="field">
            <span class="field__label">What do you want to export?</span>
            <select class="select" id="phase14ExportType">
              <option value="project_doc">Active Project Document (.md / .txt)</option>
              <option value="state_json">Full App State JSON</option>
              <option value="portable_v2">Portable V2 Bundle JSON (Phase 7)</option>
              <option value="status_report">Status Report (Phase 10)</option>
              <option value="risk_digest">Risk Digest (Phase 12)</option>
              <option value="audit_activity">Activity Audit Trail (Phase 9)</option>
              <option value="approval_audit">Approval Audit Trail (Phase 14)</option>
              <option value="dashboard_views">Dashboard Views JSON (Phase 11/12)</option>
              <option value="digest_presets">Digest Presets JSON (Phase 13)</option>
            </select>
          </label>
          <div class="row">
            <label class="field">
              <span class="field__label">Format</span>
              <select class="select" id="phase14ExportFmt">
                <option value="MD">MD</option>
                <option value="TXT">TXT</option>
                <option value="JSON">JSON</option>
              </select>
            </label>
            <label class="field" id="phase14ExportScopeWrap">
              <span class="field__label">Scope</span>
              <select class="select" id="phase14ExportScope">
                <option value="active">Active Project</option>
                <option value="all">All Projects</option>
              </select>
            </label>
          </div>
          <label class="field" id="phase14ExportApprovalAuditToggleWrap">
            <span class="field__label">Include extra approval audit file (JSON/TXT only on supportable types)</span>
            <select class="select" id="phase14ExportApprovalAuditToggle">
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </label>
          <div class="phase14-helpItem" id="phase14ExportPreviewCard">
            <b>Export details</b>
            <span id="phase14ExportDetailsText">Choose an export type.</span>
          </div>
          <div class="phase14-toolbar">
            <button class="btn" type="button" id="phase14BtnRunExport">Run Export</button>
            <button class="btn btn--ghost" type="button" id="phase14BtnOpenImportTab">Open Import Tab</button>
            <button class="btn btn--ghost" type="button" id="phase14BtnExportRefresh">Refresh Summary</button>
          </div>
        </div>
      </div>
      <div class="phase14-exportCard">
        <h4>Available Sources</h4>
        <div class="phase14-helpList">
          <div class="phase14-helpItem"><b>Active Project</b><span>${p ? escapeHtml(String(p.name||'')) : 'No active project selected.'}</span></div>
          <div class="phase14-helpItem"><b>Approval Audit Entries</b><span>${approvalAuditCount} entries (Phase 14 local approval audit trail)</span></div>
          <div class="phase14-helpItem"><b>Dashboard Views</b><span>${dashViewsCount} saved views (Phase 11 / portable export supported)</span></div>
          <div class="phase14-helpItem"><b>Digest Presets</b><span>${digestPresetCount} saved digest presets (Phase 13)</span></div>
          <div class="phase14-helpItem"><b>Topbar Cleanup</b><span>Legacy export buttons are hidden and routed through this tab. Import buttons remain available.</span></div>
        </div>
        <div class="phase14-pre" id="phase14ExportExamplePreview"></div>
      </div>
    </div>
  `;

  const typeSel = root.querySelector('#phase14ExportType');
  const fmtSel = root.querySelector('#phase14ExportFmt');
  const scopeSel = root.querySelector('#phase14ExportScope');
  const scopeWrap = root.querySelector('#phase14ExportScopeWrap');
  const auditSel = root.querySelector('#phase14ExportApprovalAuditToggle');
  const auditWrap = root.querySelector('#phase14ExportApprovalAuditToggleWrap');
  const detailsText = root.querySelector('#phase14ExportDetailsText');
  const exPreview = root.querySelector('#phase14ExportExamplePreview');

  typeSel.value = cfg.type;
  fmtSel.value = cfg.fmt;
  scopeSel.value = cfg.allProjects ? 'all' : 'active';
  auditSel.value = cfg.includeApprovalAudit ? 'yes' : 'no';

  const applyTypeRules = () => {
    const type = typeSel.value;
    let fmts = ['JSON'];
    let allowAllScope = false;
    let desc = '';
    if(type === 'project_doc'){
      fmts = ['MD','TXT'];
      allowAllScope = false;
      desc = 'Exports the active project in your PM template-friendly document format. Best for sharing plans or archiving milestone/task structure.';
    } else if(type === 'state_json'){
      fmts = ['JSON'];
      allowAllScope = true;
      desc = 'Full app database snapshot (all projects + UI state). Use for backups or full restore preview.';
    } else if(type === 'portable_v2'){
      fmts = ['JSON'];
      allowAllScope = true;
      desc = 'Phase 7 portable V2 export bundle with metadata and compatibility helpers.';
    } else if(type === 'status_report'){
      fmts = ['MD','TXT'];
      allowAllScope = false;
      desc = 'Phase 10 active-project status report with risk summary + top priority tasks.';
    } else if(type === 'risk_digest'){
      fmts = ['MD','TXT'];
      allowAllScope = true;
      desc = 'Phase 12 risk digest generated from project health, SLA aging, and notification signals.';
    } else if(type === 'audit_activity'){
      fmts = ['TXT','JSON'];
      allowAllScope = true;
      desc = 'Phase 9 activity audit trail export (filtered state is used if Phase 8 audit search is active).';
    } else if(type === 'approval_audit'){
      fmts = ['JSON','TXT'];
      allowAllScope = true;
      desc = 'Phase 14 approval audit trail (task/milestone approval actions, locks, rollback notes).';
    } else if(type === 'dashboard_views'){
      fmts = ['JSON'];
      allowAllScope = true;
      desc = 'Portable backup of saved dashboard views (Phase 11 / Phase 12 import-export compatibility).';
    } else if(type === 'digest_presets'){
      fmts = ['JSON'];
      allowAllScope = true;
      desc = 'Phase 13 digest presets backup (status/risk export presets).';
    }

    // rebuild format options safely
    const oldFmt = fmtSel.value;
    fmtSel.innerHTML = fmts.map(x => `<option value="${x}">${x}</option>`).join('');
    fmtSel.value = fmts.includes(oldFmt) ? oldFmt : fmts[0];
    scopeWrap.classList.toggle('phase14-hidden', !allowAllScope && type !== 'risk_digest' && type !== 'state_json' && type !== 'portable_v2' && type !== 'audit_activity' && type !== 'approval_audit' && type !== 'dashboard_views' && type !== 'digest_presets');
    if(!allowAllScope) scopeSel.value = 'active';
    const allowExtraApproval = ['project_doc','status_report','risk_digest','audit_activity'].includes(type);
    auditWrap.classList.toggle('phase14-hidden', !allowExtraApproval);
    if(!allowExtraApproval) auditSel.value = 'no';

    const scopeLabel = (scopeSel.value === 'all') ? 'All Projects' : 'Active Project';
    detailsText.textContent = `${desc} Selected format: ${fmtSel.value}. Scope: ${scopeLabel}.`;

    const previewLines = [];
    previewLines.push(`Type: ${type}`);
    previewLines.push(`Format: ${fmtSel.value}`);
    previewLines.push(`Scope: ${scopeSel.value}`);
    if(p) previewLines.push(`Active Project: ${p.name}`);
    if(type === 'approval_audit') previewLines.push(`Approval Audit Entries: ${approvalAuditCount}`);
    if(type === 'dashboard_views') previewLines.push(`Dashboard Views: ${dashViewsCount}`);
    if(type === 'digest_presets') previewLines.push(`Digest Presets: ${digestPresetCount}`);
    if(auditSel.value === 'yes') previewLines.push(`Extra approval audit sidecar: YES`);
    previewLines.push('');
    previewLines.push('Tip: Use the topbar Export button to jump back here anytime.');
    exPreview.textContent = previewLines.join('\n');

    cfg.type = type;
    cfg.fmt = fmtSel.value;
    cfg.allProjects = (scopeSel.value === 'all');
    cfg.includeApprovalAudit = (auditSel.value === 'yes');
    phase14SaveExportUi_();
  };

  typeSel.addEventListener('change', applyTypeRules);
  fmtSel.addEventListener('change', applyTypeRules);
  scopeSel.addEventListener('change', applyTypeRules);
  auditSel.addEventListener('change', applyTypeRules);
  applyTypeRules();

  root.querySelector('#phase14BtnOpenImportTab')?.addEventListener('click', () => switchTab('import'));
  root.querySelector('#phase14BtnExportRefresh')?.addEventListener('click', () => phase14RenderExportCenter_());
  root.querySelector('#phase14BtnRunExport')?.addEventListener('click', () => phase14RunExportCenterRequest_());
}

function phase14SafeFile_(name){
  return String(name || 'export').replace(/[^a-z0-9\-_]+/ig,'_').replace(/^_+|_+$/g,'').slice(0,80) || 'export';
}
function phase14DateStamp_(){
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const da = String(d.getDate()).padStart(2,'0');
  const h = String(d.getHours()).padStart(2,'0');
  const mi = String(d.getMinutes()).padStart(2,'0');
  return `${y}${m}${da}_${h}${mi}`;
}
function phase14ApprovalAuditText_(){
  const rows = phase14LoadAudit_();
  const L = [
    'PHASE 14 APPROVAL AUDIT EXPORT',
    `Exported: ${new Date().toLocaleString()}`,
    `Rows: ${rows.length}`,
    ''
  ];
  rows.forEach((r, i) => {
    const when = new Date(Number(r.ts||Date.now())).toLocaleString();
    const parts = [`${i+1}. [${when}]`, `${r.targetType||'item'}`, `${r.action||'update'}`];
    if(r.title) parts.push(r.title);
    if(r.state) parts.push(`[${String(r.state).toUpperCase()}]`);
    if(r.locked) parts.push('[LOCKED]');
    if(r.note) parts.push(`note=${r.note}`);
    L.push(parts.join(' '));
  });
  return L.join('\n');
}
function phase14ExportApprovalAudit_(fmt){
  const kind = String(fmt || 'JSON').toUpperCase() === 'TXT' ? 'TXT' : 'JSON';
  const stamp = phase14DateStamp_();
  const rows = phase14LoadAudit_();
  if(kind === 'JSON'){
    const payload = { version:1, exportedAt:Date.now(), type:'phase14_approval_audit', rows };
    downloadText(`phase14_approval_audit_${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
  } else {
    downloadText(`phase14_approval_audit_${stamp}.txt`, phase14ApprovalAuditText_(), 'text/plain');
  }
  try{ addActivity(`Phase14 exported approval audit (${kind})`); }catch{}
  try{ saveState({ skipHistory:true }); }catch{}
}

function phase14RunExportCenterRequest_(){
  const root = document.querySelector('#phase14ExportCenterRoot');
  if(!root) return;
  const type = String(root.querySelector('#phase14ExportType')?.value || 'project_doc');
  const fmt = String(root.querySelector('#phase14ExportFmt')?.value || 'MD').toUpperCase();
  const allProjects = String(root.querySelector('#phase14ExportScope')?.value || 'active') === 'all';
  const includeApprovalAudit = String(root.querySelector('#phase14ExportApprovalAuditToggle')?.value || 'no') === 'yes';
  const cfg = phase14LoadExportUi_();
  cfg.type = type; cfg.fmt = fmt; cfg.allProjects = allProjects; cfg.includeApprovalAudit = includeApprovalAudit; phase14SaveExportUi_();

  try{
    if(type === 'project_doc'){
      const p = getActiveProject && getActiveProject();
      if(!p){ alert('Select an active project first.'); return; }
      const safe = phase14SafeFile_(p.name || 'project');
      if(fmt === 'TXT'){
        if(typeof serializeProjectToText_ !== 'function') throw new Error('Project TXT export helper not found');
        downloadText(`${safe}.txt`, serializeProjectToText_(p), 'text/plain');
      } else {
        if(typeof serializeProjectToMarkdown_ !== 'function') throw new Error('Project MD export helper not found');
        downloadText(`${safe}.md`, serializeProjectToMarkdown_(p), 'text/markdown');
      }
      addActivity(`Phase14 export center exported project doc (${fmt}): ${p.name}`);
      if(includeApprovalAudit) phase14ExportApprovalAudit_(fmt === 'TXT' ? 'TXT' : 'JSON');
      return;
    }

    if(type === 'state_json'){
      const payload = (typeof sanitizeState === 'function') ? sanitizeState(state) : state;
      downloadText(`stark_pm_export_${phase14DateStamp_()}.json`, JSON.stringify(payload, null, 2), 'application/json');
      addActivity('Phase14 export center exported full state JSON');
      return;
    }

    if(type === 'portable_v2'){
      if(typeof phase7ExportV2Bundle_ === 'function'){
        phase7ExportV2Bundle_();
        addActivity('Phase14 export center triggered portable V2 export');
      } else {
        alert('Phase 7 portable V2 export is not available in this build.');
      }
      return;
    }

    if(type === 'status_report'){
      const p = getActiveProject && getActiveProject();
      if(!p){ alert('Select an active project first.'); return; }
      if(typeof phase10BuildStatusReport_ !== 'function'){ alert('Phase 10 status report generator is not available.'); return; }
      const kind = (fmt === 'TXT') ? 'txt' : 'md';
      const txt = phase10BuildStatusReport_(kind);
      if(!txt){ alert('Could not build status report.'); return; }
      const safe = phase14SafeFile_(String(p.name||'project'));
      downloadText(`${safe}_status_report_${phase14DateStamp()}.${kind === 'md' ? 'md' : 'txt'}`, txt, kind === 'md' ? 'text/markdown' : 'text/plain');
      addActivity(`Phase14 export center exported status report (${fmt}): ${p.name}`);
      if(includeApprovalAudit) phase14ExportApprovalAudit_(fmt === 'TXT' ? 'TXT' : 'JSON');
      return;
    }

    if(type === 'risk_digest'){
      if(typeof phase12BuildRiskDigestData_ !== 'function' || typeof phase12BuildRiskDigestText_ !== 'function'){
        alert('Phase 12 risk digest helpers are not available.'); return;
      }
      const d = phase12BuildRiskDigestData_({ allProjects });
      const kind = (fmt === 'TXT') ? 'TXT' : 'MD';
      const txt = phase12BuildRiskDigestText_(kind, d);
      const scope = allProjects ? 'all' : 'active';
      downloadText(`risk_digest_${scope}_${phase14DateStamp()}.${kind === 'MD' ? 'md' : 'txt'}`, txt, kind === 'MD' ? 'text/markdown' : 'text/plain');
      addActivity(`Phase14 export center exported risk digest (${kind}) [${scope}]`);
      if(includeApprovalAudit) phase14ExportApprovalAudit_(kind === 'TXT' ? 'TXT' : 'JSON');
      return;
    }

    if(type === 'audit_activity'){
      if(typeof phase9ExportAuditTrail_ === 'function'){
        phase9ExportAuditTrail_(fmt === 'JSON' ? 'json' : 'txt');
      } else {
        const rows = Array.isArray(state?.activity) ? state.activity : [];
        if(fmt === 'JSON') downloadText(`audit_trail_${phase14DateStamp()}.json`, JSON.stringify({ rows }, null, 2), 'application/json');
        else downloadText(`audit_trail_${phase14DateStamp()}.txt`, rows.map(a => `[${new Date(Number(a.ts||Date.now())).toLocaleString()}] ${String(a.msg||'')}`).join('\n'), 'text/plain');
        addActivity(`Phase14 export center exported audit trail fallback (${fmt})`);
      }
      if(includeApprovalAudit) phase14ExportApprovalAudit_(fmt === 'TXT' ? 'TXT' : 'JSON');
      return;
    }

    if(type === 'approval_audit'){
      phase14ExportApprovalAudit_(fmt);
      return;
    }

    if(type === 'dashboard_views'){
      let views = [];
      try{ views = (typeof phase11LoadDashViews_ === 'function') ? (phase11LoadDashViews_() || []) : []; }catch{ views = []; }
      const payload = { version:1, exportedAt:Date.now(), type:'phase11_dashboard_views', views };
      downloadText(`dashboard_views_${phase14DateStamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
      addActivity(`Phase14 export center exported dashboard views (${views.length})`);
      return;
    }

    if(type === 'digest_presets'){
      let presets = [];
      try{ presets = (typeof phase13LoadDigestPresets_ === 'function') ? (phase13LoadDigestPresets_() || []) : []; }catch{ presets = []; }
      const payload = { version:1, exportedAt:Date.now(), presets };
      downloadText(`phase13_digest_presets_${phase14DateStamp()}.json`, JSON.stringify(payload, null, 2), 'application/json');
      addActivity(`Phase14 export center exported digest presets (${presets.length})`);
      return;
    }
  } catch(err){
    console.warn('Phase14 export center failed', err);
    alert(`Export failed: ${err && err.message ? err.message : err}`);
    return;
  } finally {
    try{ saveState({ skipHistory:true }); }catch{}
    try{ phase14RenderExportCenter_(); }catch{}
  }
}

// alias typo-safe helper (used by export builder)
function phase14DateStamp(){ return phase14DateStamp_(); }

try{ initPhase14_(); }catch(err){ console.warn('Phase14 init failed', err); }



/* ---------------------------
   Phase 15 RBAC-lite Approval Profiles (Additive Patch)
   - Role profiles: Owner / Reviewer / Executor
   - Approval permissions for task/milestone approval + lock actions
   - Per-milestone approval policy (require review before approve, role gates)
   - Lock override reason (required on unlock)
---------------------------- */
var PHASE15_RBAC_CFG_KEY = 'stark_pm_phase15_rbac_cfg_v1';
var PHASE15_SESSION_KEY = 'stark_pm_phase15_session_v1';
var phase15State_ = { inited:false, cfg:null, session:null };

function initPhase15_(){
  if(phase15State_.inited) return;
  phase15State_.inited = true;
  try{ phase15EnsureStyles_(); }catch(err){ console.warn('Phase15 styles failed', err); }
  try{ phase15PatchSanitizers_(); }catch(err){ console.warn('Phase15 sanitizer patch failed', err); }
  try{ phase15WrapCore_(); }catch(err){ console.warn('Phase15 core wrap failed', err); }
  try{ phase15WrapApprovalActions_(); }catch(err){ console.warn('Phase15 approval wrap failed', err); }
  try{ phase15EnsureTopbarButton_(); }catch(err){ console.warn('Phase15 topbar failed', err); }
  try{ phase15PostRenderDashboard_(); }catch{}
  try{ phase15PostRenderMilestones_(); }catch{}
  try{ phase15PostRenderChecklist_(); }catch{}
}

function phase15EnsureStyles_(){
  if(document.querySelector('#phase15Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase15Styles';
  st.textContent = `
    .phase15-box{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    .phase15-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9;margin-bottom:8px}
    .phase15-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:10px}
    .phase15-card{border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px;background:rgba(255,255,255,.012)}
    .phase15-toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .phase15-note{font-size:11px;opacity:.8;line-height:1.35}
    .phase15-kv{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin-top:8px}
    .phase15-kv>div{padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase15-kv b{display:block;font-size:10px;opacity:.72;letter-spacing:.05em;text-transform:uppercase;margin-bottom:4px}
    .phase15-kv span{font-size:13px;font-weight:800}
    .phase15-fields{display:grid;gap:8px}
    .phase15-fields .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .phase15-list{display:grid;gap:8px;margin-top:8px}
    .phase15-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase15-row__name{font-size:12px;font-weight:700}
    .phase15-row__meta{font-size:11px;opacity:.78;line-height:1.3}
    .phase15-tags{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .phase15-tag{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:2px 7px;font-size:10px;letter-spacing:.05em;text-transform:uppercase}
    .phase15-tag.owner{border-color:rgba(105,255,200,.28);color:#bbfff0}
    .phase15-tag.reviewer{border-color:rgba(255,191,92,.28);color:#ffe0ac}
    .phase15-tag.executor{border-color:rgba(160,190,255,.22);color:#d7e2ff}
    .phase15-tag.warn{border-color:rgba(255,120,120,.28);color:#ffd0d0}
    .phase15-pre{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;line-height:1.35;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.14);margin-top:8px;max-height:220px;overflow:auto}
    .phase15-table{width:100%;border-collapse:collapse;margin-top:8px;font-size:11px}
    .phase15-table th,.phase15-table td{padding:6px 7px;border-bottom:1px solid rgba(255,255,255,.06);text-align:left;vertical-align:top}
    .phase15-inlineHelp{font-size:11px;opacity:.76}
    .phase15-compact select,.phase15-compact input{max-width:100%}
    @media (max-width:980px){ .phase15-grid{grid-template-columns:1fr} .phase15-kv{grid-template-columns:1fr 1fr} .phase15-fields .row{grid-template-columns:1fr} }
    @media (max-width:640px){ .phase15-kv{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase15DefaultCfg_(){
  return {
    defaultPolicy: {
      requireReviewBeforeApprove: true,
      taskApproverRole: 'owner_reviewer',    // owner | owner_reviewer
      milestoneApproverRole: 'owner_reviewer',
      taskLockRole: 'owner_reviewer',         // owner | owner_reviewer
      milestoneLockRole: 'owner',             // owner | owner_reviewer
      autoLockTaskOnApprove: false,
      autoLockMilestoneOnApprove: false,
      requireUnlockReason: true,
    }
  };
}
function phase15DefaultSession_(){
  return { role:'owner', name:'ME' };
}
function phase15LoadCfg_(){
  if(phase15State_.cfg) return phase15State_.cfg;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE15_RBAC_CFG_KEY) || 'null'); }catch{}
  const d = phase15DefaultCfg_();
  const cfg = {
    defaultPolicy: phase15NormalizePolicy_(raw && raw.defaultPolicy, d.defaultPolicy)
  };
  phase15State_.cfg = cfg;
  return cfg;
}
function phase15SaveCfg_(){ try{ localStorage.setItem(PHASE15_RBAC_CFG_KEY, JSON.stringify(phase15LoadCfg_())); }catch{} }
function phase15LoadSession_(){
  if(phase15State_.session) return phase15State_.session;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE15_SESSION_KEY) || 'null'); }catch{}
  const d = phase15DefaultSession_();
  phase15State_.session = {
    role: phase15NormRole_(raw && raw.role || d.role),
    name: String(raw && raw.name || d.name || 'ME').trim().slice(0,48) || 'ME'
  };
  return phase15State_.session;
}
function phase15SaveSession_(){ try{ localStorage.setItem(PHASE15_SESSION_KEY, JSON.stringify(phase15LoadSession_())); }catch{} }

function phase15NormRole_(r){
  const s = String(r||'owner').toLowerCase();
  return (s==='reviewer' || s==='executor') ? s : 'owner';
}
function phase15NormalizePolicy_(p, fallback){
  const fb = fallback || (phase15DefaultCfg_().defaultPolicy);
  p = p || {};
  const pick = (v, allowed, def) => allowed.includes(String(v||'')) ? String(v) : def;
  return {
    requireReviewBeforeApprove: p.requireReviewBeforeApprove !== undefined ? !!p.requireReviewBeforeApprove : !!fb.requireReviewBeforeApprove,
    taskApproverRole: pick(p.taskApproverRole, ['owner','owner_reviewer'], fb.taskApproverRole),
    milestoneApproverRole: pick(p.milestoneApproverRole, ['owner','owner_reviewer'], fb.milestoneApproverRole),
    taskLockRole: pick(p.taskLockRole, ['owner','owner_reviewer'], fb.taskLockRole),
    milestoneLockRole: pick(p.milestoneLockRole, ['owner','owner_reviewer'], fb.milestoneLockRole),
    autoLockTaskOnApprove: p.autoLockTaskOnApprove !== undefined ? !!p.autoLockTaskOnApprove : !!fb.autoLockTaskOnApprove,
    autoLockMilestoneOnApprove: p.autoLockMilestoneOnApprove !== undefined ? !!p.autoLockMilestoneOnApprove : !!fb.autoLockMilestoneOnApprove,
    requireUnlockReason: p.requireUnlockReason !== undefined ? !!p.requireUnlockReason : !!fb.requireUnlockReason,
  };
}
function phase15PatchSanitizers_(){
  if(typeof sanitizeMilestone === 'function' && !sanitizeMilestone._phase15WrappedPolicy){
    const _orig = sanitizeMilestone;
    sanitizeMilestone = function(m){
      const out = _orig(m);
      const dpol = phase15LoadCfg_().defaultPolicy;
      out.approvalPolicy = phase15NormalizePolicy_(m && m.approvalPolicy, dpol);
      return out;
    };
    sanitizeMilestone._phase15WrappedPolicy = true;
  }
  if(typeof mkMilestone === 'function' && !mkMilestone._phase15WrappedPolicy){
    const _orig = mkMilestone;
    mkMilestone = function(){
      const m = _orig.apply(this, arguments);
      try{ m.approvalPolicy = phase15NormalizePolicy_(m.approvalPolicy, phase15LoadCfg_().defaultPolicy); }catch{}
      return m;
    };
    mkMilestone._phase15WrappedPolicy = true;
  }
}
function phase15GetMilestonePolicy_(ms){
  const dpol = phase15LoadCfg_().defaultPolicy;
  if(!ms || typeof ms !== 'object') return phase15NormalizePolicy_(null, dpol);
  ms.approvalPolicy = phase15NormalizePolicy_(ms.approvalPolicy, dpol);
  return ms.approvalPolicy;
}

function phase15PolicyRoleAllows_(rule, role){
  role = phase15NormRole_(role);
  rule = String(rule || 'owner');
  if(rule === 'owner_reviewer') return role === 'owner' || role === 'reviewer';
  return role === 'owner';
}
function phase15CanAction_(action, ctx){
  const role = phase15LoadSession_().role;
  const ms = ctx && ctx.ms;
  const pol = phase15GetMilestonePolicy_(ms);
  if(action === 'task_request_review') return role === 'owner' || role === 'reviewer' || role === 'executor';
  if(action === 'task_approve' || action === 'task_rework') return phase15PolicyRoleAllows_(pol.taskApproverRole, role);
  if(action === 'task_lock_toggle') return phase15PolicyRoleAllows_(pol.taskLockRole, role) || role === 'owner'; // owner override
  if(action === 'ms_request_review') return role === 'owner' || role === 'reviewer';
  if(action === 'ms_approve' || action === 'ms_rework') return phase15PolicyRoleAllows_(pol.milestoneApproverRole, role);
  if(action === 'ms_lock_toggle') return phase15PolicyRoleAllows_(pol.milestoneLockRole, role) || role === 'owner';
  if(action === 'policy_edit' || action === 'defaults_edit') return role === 'owner';
  return false;
}
function phase15Deny_(msg, extra){
  try{ addActivity(`Phase15 permission denied${extra ? ' • ' + extra : ''}`); }catch{}
  alert(msg || 'Phase 15 permission denied for current role.');
}
function phase15StampOverride_(ctx, payload){
  const who = phase15LoadSession_().name || 'ME';
  const note = String(payload && payload.note || '').trim();
  try{
    if(typeof phase14LogApprovalAction_ === 'function'){
      phase14LogApprovalAction_(ctx || {}, {
        targetType: payload.targetType || (ctx && ctx.t ? 'task' : 'milestone'),
        action: payload.action || 'override',
        targetId: payload.targetId || (ctx && (ctx.t?.id || ctx.ms?.id)) || '',
        title: payload.title || (ctx && (ctx.t?.title || ctx.ms?.title)) || '',
        state: payload.state || '',
        locked: !!payload.locked,
        note: `${who}${note ? ' • ' + note : ''}`.slice(0,280)
      });
      return;
    }
  }catch{}
  try{ addActivity(`Phase15 override by ${who}${note ? ' • ' + note : ''}`); }catch{}
}
function phase15SetReviewerNames_(){
  const session = phase15LoadSession_();
  if(!session.name) return;
  const p = getActiveProject && getActiveProject();
  const ms = p ? getActiveMilestone(p) : null;
  if(!ms) return;
  let changed = false;
  for(const t of (ms.tasks || [])){
    const a = (typeof phase14TaskApproval_ === 'function') ? phase14TaskApproval_(t) : (t && t.approval);
    if(a && a.state === 'approved' && a.approvedAt && (!a.reviewer || a.reviewer === 'ME')){ a.reviewer = session.name; changed = true; }
  }
  try{
    const ma = (typeof phase14MilestoneApproval_ === 'function') ? phase14MilestoneApproval_(ms) : (ms && ms.approval);
    if(ma && ma.state === 'approved' && ma.approvedAt && (!ma.reviewer || ma.reviewer === 'ME')){ ma.reviewer = session.name; changed = true; }
  }catch{}
  if(changed){ try{ saveState({ skipHistory:true }); }catch{} }
}

function phase15WrapApprovalActions_(){
  if(typeof phase14SetTaskApprovalState_ === 'function' && !phase14SetTaskApprovalState_._phase15Wrapped){
    const _orig = phase14SetTaskApprovalState_;
    phase14SetTaskApprovalState_ = async function(taskId, nextState){
      const ctx = (typeof phase14TaskCtxInActive_ === 'function') ? phase14TaskCtxInActive_(taskId) : null;
      if(!ctx) return _orig.apply(this, arguments);
      const t = ctx.t;
      const a = (typeof phase14TaskApproval_ === 'function') ? phase14TaskApproval_(t) : (t.approval||{});
      const target = (nextState === 'approved' || nextState === 'review') ? nextState : 'draft';
      const pol = phase15GetMilestonePolicy_(ctx.ms);
      const action = target === 'review' ? 'task_request_review' : target === 'approved' ? 'task_approve' : 'task_rework';
      if(!phase15CanAction_(action, ctx)) return phase15Deny_(`Current role (${phase15LoadSession_().role}) cannot ${target === 'approved' ? 'approve' : target === 'review' ? 'request review for' : 'rework'} tasks in this milestone policy.`);
      if(target === 'approved' && pol.requireReviewBeforeApprove && a.state !== 'review' && a.state !== 'approved'){
        return phase15Deny_('Policy requires task review before approval. Move the task to In Review first.');
      }
      const prevLocked = !!a.locked;
      const prevState = String(a.state || 'draft');
      const r = await _orig.apply(this, arguments);
      try{ phase15SetReviewerNames_(); }catch{}
      try{
        const afterCtx = (typeof phase14TaskCtxInActive_ === 'function') ? phase14TaskCtxInActive_(taskId) : ctx;
        const aa = afterCtx && afterCtx.t ? phase14TaskApproval_(afterCtx.t) : null;
        if(aa && target === 'approved' && pol.autoLockTaskOnApprove && !aa.locked){
          aa.locked = true; aa.updatedAt = Date.now();
          phase15StampOverride_(afterCtx, { action:'auto_lock_on_approve', targetType:'task', targetId: afterCtx.t.id, title: afterCtx.t.title, state: aa.state, locked:true, note:'policy auto-lock task on approve' });
          saveState({ skipHistory:true });
          renderAll();
        } else if(aa && (prevState !== aa.state || prevLocked !== aa.locked)) {
          try{ saveState({ skipHistory:true }); }catch{}
        }
      }catch(err){ console.warn('Phase15 task post-approve patch failed', err); }
      return r;
    };
    phase14SetTaskApprovalState_._phase15Wrapped = true;
  }

  if(typeof phase14ToggleTaskLock_ === 'function' && !phase14ToggleTaskLock_._phase15Wrapped){
    const _orig = phase14ToggleTaskLock_;
    phase14ToggleTaskLock_ = async function(taskId){
      const ctx = (typeof phase14TaskCtxInActive_ === 'function') ? phase14TaskCtxInActive_(taskId) : null;
      if(!ctx) return _orig.apply(this, arguments);
      const a = phase14TaskApproval_(ctx.t);
      const pol = phase15GetMilestonePolicy_(ctx.ms);
      if(!phase15CanAction_('task_lock_toggle', ctx)) return phase15Deny_(`Current role (${phase15LoadSession_().role}) cannot change task lock state for this milestone policy.`);
      let unlockReason = '';
      if(a.locked && pol.requireUnlockReason){
        const raw = await pmPromptDialog_(`Unlock override reason required for task "${ctx.t.title}".`, '', { title:'Unlock Task Override Reason', placeholder:'Reason required' });
        if(raw == null) return;
        unlockReason = String(raw || '').trim().slice(0,280);
        if(!unlockReason) return alert('Unlock override reason is required by Phase 15 policy.');
      }
      const r = _orig.apply(this, arguments);
      if(unlockReason){
        try{ phase15StampOverride_(ctx, { action:'unlock_override_reason', targetType:'task', targetId:ctx.t.id, title:ctx.t.title, state:phase14TaskApproval_(ctx.t).state, locked:phase14TaskApproval_(ctx.t).locked, note:unlockReason }); }catch{}
      }
      return r;
    };
    phase14ToggleTaskLock_._phase15Wrapped = true;
  }

  if(typeof phase14SetMilestoneApprovalState_ === 'function' && !phase14SetMilestoneApprovalState_._phase15Wrapped){
    const _orig = phase14SetMilestoneApprovalState_;
    phase14SetMilestoneApprovalState_ = async function(nextState){
      const ctx = (typeof phase14CurrentMilestoneCtx_ === 'function') ? phase14CurrentMilestoneCtx_() : null;
      if(!ctx) return _orig.apply(this, arguments);
      const a = phase14MilestoneApproval_(ctx.ms);
      const target = (nextState === 'approved' || nextState === 'review') ? nextState : 'draft';
      const pol = phase15GetMilestonePolicy_(ctx.ms);
      const action = target === 'review' ? 'ms_request_review' : target === 'approved' ? 'ms_approve' : 'ms_rework';
      if(!phase15CanAction_(action, ctx)) return phase15Deny_(`Current role (${phase15LoadSession_().role}) cannot ${target === 'approved' ? 'approve' : target === 'review' ? 'request review for' : 'rework'} milestones in this policy.`);
      if(target === 'approved' && pol.requireReviewBeforeApprove && a.state !== 'review' && a.state !== 'approved'){
        return phase15Deny_('Policy requires milestone review before approval. Move the milestone to In Review first.');
      }
      const prevLocked = !!a.locked; const prevState = String(a.state || 'draft');
      const r = await _orig.apply(this, arguments);
      try{ phase15SetReviewerNames_(); }catch{}
      try{
        const afterCtx = (typeof phase14CurrentMilestoneCtx_ === 'function') ? phase14CurrentMilestoneCtx_() : ctx;
        const aa = afterCtx && afterCtx.ms ? phase14MilestoneApproval_(afterCtx.ms) : null;
        if(aa && target === 'approved' && pol.autoLockMilestoneOnApprove && !aa.locked){
          aa.locked = true; aa.updatedAt = Date.now();
          phase15StampOverride_(afterCtx, { action:'auto_lock_on_approve', targetType:'milestone', targetId:afterCtx.ms.id, title:afterCtx.ms.title, state:aa.state, locked:true, note:'policy auto-lock milestone on approve' });
          saveState({ skipHistory:true });
          renderAll();
        } else if(aa && (prevState !== aa.state || prevLocked !== aa.locked)) {
          try{ saveState({ skipHistory:true }); }catch{}
        }
      }catch(err){ console.warn('Phase15 milestone post-approve patch failed', err); }
      return r;
    };
    phase14SetMilestoneApprovalState_._phase15Wrapped = true;
  }

  if(typeof phase14ToggleMilestoneLock_ === 'function' && !phase14ToggleMilestoneLock_._phase15Wrapped){
    const _orig = phase14ToggleMilestoneLock_;
    phase14ToggleMilestoneLock_ = async function(){
      const ctx = (typeof phase14CurrentMilestoneCtx_ === 'function') ? phase14CurrentMilestoneCtx_() : null;
      if(!ctx) return _orig.apply(this, arguments);
      const a = phase14MilestoneApproval_(ctx.ms);
      const pol = phase15GetMilestonePolicy_(ctx.ms);
      if(!phase15CanAction_('ms_lock_toggle', ctx)) return phase15Deny_(`Current role (${phase15LoadSession_().role}) cannot change milestone lock state for this policy.`);
      let unlockReason = '';
      if(a.locked && pol.requireUnlockReason){
        const raw = await pmPromptDialog_(`Unlock override reason required for milestone "${ctx.ms.title}".`, '', { title:'Unlock Milestone Override Reason', placeholder:'Reason required' });
        if(raw == null) return;
        unlockReason = String(raw || '').trim().slice(0,280);
        if(!unlockReason) return alert('Unlock override reason is required by Phase 15 policy.');
      }
      const r = _orig.apply(this, arguments);
      if(unlockReason){
        try{ phase15StampOverride_(ctx, { action:'unlock_override_reason', targetType:'milestone', targetId:ctx.ms.id, title:ctx.ms.title, state:phase14MilestoneApproval_(ctx.ms).state, locked:phase14MilestoneApproval_(ctx.ms).locked, note:unlockReason }); }catch{}
      }
      return r;
    };
    phase14ToggleMilestoneLock_._phase15Wrapped = true;
  }
}

function phase15WrapCore_(){
  if(typeof renderDashboard === 'function' && !renderDashboard._phase15Wrapped){
    const _orig = renderDashboard;
    renderDashboard = function(){ const r = _orig.apply(this, arguments); try{ phase15PostRenderDashboard_(); }catch(err){ console.warn('Phase15 dashboard render failed', err); } return r; };
    renderDashboard._phase15Wrapped = true;
  }
  if(typeof renderMilestones === 'function' && !renderMilestones._phase15Wrapped){
    const _orig = renderMilestones;
    renderMilestones = function(){ const r = _orig.apply(this, arguments); try{ phase15PostRenderMilestones_(); }catch(err){ console.warn('Phase15 milestones render failed', err); } return r; };
    renderMilestones._phase15Wrapped = true;
  }
  if(typeof renderChecklist === 'function' && !renderChecklist._phase15Wrapped){
    const _orig = renderChecklist;
    renderChecklist = function(){ const r = _orig.apply(this, arguments); try{ phase15PostRenderChecklist_(); }catch(err){ console.warn('Phase15 checklist render failed', err); } return r; };
    renderChecklist._phase15Wrapped = true;
  }
}

function phase15EnsureTopbarButton_(){
  const topbarRight = document.querySelector('#topbarRight') || document.querySelector('.topbar__right') || document.querySelector('.topbar-right');
  if(!topbarRight) return;
  let btn = document.querySelector('#phase15BtnRoles');
  if(!btn){
    btn = document.createElement('button');
    btn.id = 'phase15BtnRoles';
    btn.type = 'button';
    btn.className = 'btn btn--ghost';
    btn.textContent = 'Roles';
    topbarRight.appendChild(btn);
  }
  const sess = phase15LoadSession_();
  btn.title = `Phase 15 approval role: ${sess.role}${sess.name ? ' ('+sess.name+')' : ''}`;
  btn.onclick = function(){
    openPanelInOwningTab_('#phase15RbacPanel', 'dashboard', 20);
  };
}

function phase15RoleLabel_(r){ r = phase15NormRole_(r); return r === 'reviewer' ? 'Reviewer' : r === 'executor' ? 'Executor' : 'Owner'; }
function phase15PolicyRuleLabel_(v){ return String(v||'owner') === 'owner_reviewer' ? 'Owner or Reviewer' : 'Owner only'; }
function phase15CurrentCtx_(){
  const p = getActiveProject && getActiveProject();
  const mod = p ? getActiveModule(p) : null;
  const ms = p ? getActiveMilestone(p) : null;
  return { p, mod, ms };
}

function phase15PostRenderDashboard_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return;
  let box = document.querySelector('#phase15RbacPanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase15RbacPanel';
    box.className = 'phase15-box';
    const host = document.querySelector('#phase14ApprovalQueuePanel') || document.querySelector('#phase13DashboardHost') || document.querySelector('#phase12DashboardHost') || document.querySelector('#phase10DashboardHost') || document.querySelector('#phase8DashboardHost');
    if(host && host.parentElement) host.parentElement.insertBefore(box, host);
    else tab.appendChild(box);
  }
  const sess = phase15LoadSession_();
  const cfg = phase15LoadCfg_();
  const ctx = phase15CurrentCtx_();
  const pol = phase15GetMilestonePolicy_(ctx.ms);
  const q = (typeof phase14CollectApprovalQueue_ === 'function') ? phase14CollectApprovalQueue_({ onlyActiveProject:false }) : {taskReview:0, taskLocked:0, milestoneReview:0, milestoneLocked:0};
  box.innerHTML = `
    <div class="phase15-title">Phase 15 RBAC-lite Approval Profiles</div>
    <div class="phase15-grid">
      <div class="phase15-card phase15-compact">
        <div class="phase15-toolbar">
          <span class="phase15-tag ${escapeHtml(sess.role)}">${escapeHtml(phase15RoleLabel_(sess.role))}</span>
          <button class="btn btn--ghost" type="button" id="phase15BtnOpenMsPolicy">Open Milestone Policy</button>
          <button class="btn btn--ghost" type="button" id="phase15BtnOpenTaskReview">Open Task Review Queue</button>
        </div>
        <div class="phase15-fields" style="margin-top:8px">
          <div class="row">
            <label>Current role
              <select id="phase15RoleSelect">
                <option value="owner" ${sess.role==='owner'?'selected':''}>Owner</option>
                <option value="reviewer" ${sess.role==='reviewer'?'selected':''}>Reviewer</option>
                <option value="executor" ${sess.role==='executor'?'selected':''}>Executor</option>
              </select>
            </label>
            <label>Display name
              <input id="phase15RoleName" type="text" maxlength="48" value="${escapeHtml(sess.name||'ME')}">
            </label>
          </div>
          <div class="row">
            <label><input type="checkbox" id="phase15DefRequireReview" ${cfg.defaultPolicy.requireReviewBeforeApprove?'checked':''}> Default: require review before approve</label>
            <label><input type="checkbox" id="phase15DefRequireUnlockReason" ${cfg.defaultPolicy.requireUnlockReason?'checked':''}> Default: require unlock reason</label>
          </div>
          <div class="row">
            <label>Default task approver
              <select id="phase15DefTaskApproverRole"><option value="owner" ${cfg.defaultPolicy.taskApproverRole==='owner'?'selected':''}>Owner only</option><option value="owner_reviewer" ${cfg.defaultPolicy.taskApproverRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option></select>
            </label>
            <label>Default milestone approver
              <select id="phase15DefMsApproverRole"><option value="owner" ${cfg.defaultPolicy.milestoneApproverRole==='owner'?'selected':''}>Owner only</option><option value="owner_reviewer" ${cfg.defaultPolicy.milestoneApproverRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option></select>
            </label>
          </div>
          <div class="row">
            <label>Default task lock control
              <select id="phase15DefTaskLockRole"><option value="owner" ${cfg.defaultPolicy.taskLockRole==='owner'?'selected':''}>Owner only</option><option value="owner_reviewer" ${cfg.defaultPolicy.taskLockRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option></select>
            </label>
            <label>Default milestone lock control
              <select id="phase15DefMsLockRole"><option value="owner" ${cfg.defaultPolicy.milestoneLockRole==='owner'?'selected':''}>Owner only</option><option value="owner_reviewer" ${cfg.defaultPolicy.milestoneLockRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option></select>
            </label>
          </div>
          <div class="row">
            <label><input type="checkbox" id="phase15DefAutoLockTask" ${cfg.defaultPolicy.autoLockTaskOnApprove?'checked':''}> Default auto-lock task on approve</label>
            <label><input type="checkbox" id="phase15DefAutoLockMs" ${cfg.defaultPolicy.autoLockMilestoneOnApprove?'checked':''}> Default auto-lock milestone on approve</label>
          </div>
          <div class="phase15-toolbar">
            <button class="btn btn--ghost" type="button" id="phase15BtnSaveRoleDefaults">Save Role & Defaults</button>
            <button class="btn btn--ghost" type="button" id="phase15BtnResetRoleDefaults">Reset Defaults</button>
          </div>
        </div>
        <div class="phase15-note" style="margin-top:8px">RBAC-lite controls approval/lock actions from Phase 14 queues. Editing tasks remains governed by existing milestone/task lock guardrails.</div>
      </div>
      <div class="phase15-card">
        <div class="phase15-title" style="margin-bottom:6px">Permission Matrix</div>
        <table class="phase15-table">
          <thead><tr><th>Action</th><th>Owner</th><th>Reviewer</th><th>Executor</th></tr></thead>
          <tbody>
            <tr><td>Task: Request review</td><td>✓</td><td>✓</td><td>✓</td></tr>
            <tr><td>Task: Approve / Rework</td><td>✓</td><td>Policy</td><td>—</td></tr>
            <tr><td>Task: Lock / Unlock</td><td>✓ (override)</td><td>Policy</td><td>—</td></tr>
            <tr><td>Milestone: Request review</td><td>✓</td><td>✓</td><td>—</td></tr>
            <tr><td>Milestone: Approve / Rework</td><td>✓</td><td>Policy</td><td>—</td></tr>
            <tr><td>Milestone: Lock / Unlock</td><td>✓ (override)</td><td>Policy</td><td>—</td></tr>
            <tr><td>Edit policy / defaults</td><td>✓</td><td>—</td><td>—</td></tr>
          </tbody>
        </table>
        <div class="phase15-kv">
          <div><b>Task review queue</b><span>${Number(q.taskReview||0)}</span></div>
          <div><b>Task locked</b><span>${Number(q.taskLocked||0)}</span></div>
          <div><b>Milestone review</b><span>${Number(q.milestoneReview||0)}</span></div>
          <div><b>Milestone locked</b><span>${Number(q.milestoneLocked||0)}</span></div>
        </div>
        <div class="phase15-pre">Active milestone policy (${ctx.ms ? escapeHtml(String(ctx.ms.title||'')) : 'none selected'})
require review before approve: ${pol.requireReviewBeforeApprove ? 'yes' : 'no'}
require unlock reason: ${pol.requireUnlockReason ? 'yes' : 'no'}
task approver: ${phase15PolicyRuleLabel_(pol.taskApproverRole)}
milestone approver: ${phase15PolicyRuleLabel_(pol.milestoneApproverRole)}
task lock control: ${phase15PolicyRuleLabel_(pol.taskLockRole)}
milestone lock control: ${phase15PolicyRuleLabel_(pol.milestoneLockRole)}
auto-lock task on approve: ${pol.autoLockTaskOnApprove ? 'yes' : 'no'}
auto-lock milestone on approve: ${pol.autoLockMilestoneOnApprove ? 'yes' : 'no'}</div>
      </div>
    </div>
  `;
  box.querySelector('#phase15BtnOpenMsPolicy')?.addEventListener('click', ()=>{ switchTab('milestones'); setTimeout(()=>document.querySelector('#phase15MilestonePolicyPanel, #phase14MilestoneApprovalPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
  box.querySelector('#phase15BtnOpenTaskReview')?.addEventListener('click', ()=>{ switchTab('checklist'); setTimeout(()=>document.querySelector('#phase14ChecklistApprovalPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
  box.querySelector('#phase15BtnSaveRoleDefaults')?.addEventListener('click', ()=>{
    const sess2 = phase15LoadSession_();
    const cfg2 = phase15LoadCfg_();
    const role = phase15NormRole_(box.querySelector('#phase15RoleSelect')?.value);
    const name = String(box.querySelector('#phase15RoleName')?.value || '').trim().slice(0,48) || 'ME';
    sess2.role = role; sess2.name = name; phase15SaveSession_();
    if(!phase15CanAction_('defaults_edit', { ms: ctx.ms })){
      phase15EnsureTopbarButton_();
      phase15PostRenderChecklist_();
      phase15PostRenderMilestones_();
      return phase15Deny_('Only Owner role can modify Phase 15 default approval profile settings. Role switch saved, defaults unchanged.');
    }
    cfg2.defaultPolicy = phase15NormalizePolicy_({
      requireReviewBeforeApprove: !!box.querySelector('#phase15DefRequireReview')?.checked,
      requireUnlockReason: !!box.querySelector('#phase15DefRequireUnlockReason')?.checked,
      taskApproverRole: box.querySelector('#phase15DefTaskApproverRole')?.value,
      milestoneApproverRole: box.querySelector('#phase15DefMsApproverRole')?.value,
      taskLockRole: box.querySelector('#phase15DefTaskLockRole')?.value,
      milestoneLockRole: box.querySelector('#phase15DefMsLockRole')?.value,
      autoLockTaskOnApprove: !!box.querySelector('#phase15DefAutoLockTask')?.checked,
      autoLockMilestoneOnApprove: !!box.querySelector('#phase15DefAutoLockMs')?.checked,
    }, cfg2.defaultPolicy);
    phase15SaveCfg_();
    try{ addActivity(`Phase15 saved role/defaults • ${phase15RoleLabel_(role)} (${name})`); }catch{}
    try{ saveState({ skipHistory:true }); }catch{}
    phase15EnsureTopbarButton_();
    renderAll();
  });
  box.querySelector('#phase15BtnResetRoleDefaults')?.addEventListener('click', async ()=>{
    const okReset = await pmConfirmDialog_('Reset Phase 15 default approval profile settings? Current role/name will be kept.', { title:'Reset Approval Profile Defaults', okText:'Reset', danger:true });
    if(!okReset) return;
    const d = phase15DefaultCfg_();
    phase15LoadCfg_().defaultPolicy = phase15NormalizePolicy_(d.defaultPolicy, d.defaultPolicy);
    phase15SaveCfg_();
    try{ addActivity('Phase15 reset default approval profile settings'); }catch{}
    renderAll();
  });
  phase15EnsureTopbarButton_();
}

function phase15PostRenderMilestones_(){
  const tab = document.querySelector('#tab-milestones');
  if(!tab) return;
  const cards = Array.from(tab.querySelectorAll('.card'));
  const detailCard = cards[1] || cards[cards.length-1];
  if(!detailCard) return;
  let box = document.querySelector('#phase15MilestonePolicyPanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase15MilestonePolicyPanel';
    box.className = 'phase15-box';
    const anchor = document.querySelector('#phase14MilestoneApprovalPanel');
    if(anchor && anchor.parentElement === detailCard) anchor.insertAdjacentElement('afterend', box);
    else detailCard.appendChild(box);
  }
  const ctx = phase15CurrentCtx_();
  if(!ctx.ms){
    box.innerHTML = `<div class="phase15-title">Phase 15 Milestone Approval Policy</div><div class="phase15-note">Select a milestone to set its approval policy and role permissions.</div>`;
    return;
  }
  const sess = phase15LoadSession_();
  const pol = phase15GetMilestonePolicy_(ctx.ms);
  const dpol = phase15LoadCfg_().defaultPolicy;
  const roleCanEdit = phase15CanAction_('policy_edit', ctx);
  box.innerHTML = `
    <div class="phase15-title">Phase 15 Milestone Approval Policy</div>
    <div class="phase15-toolbar">
      <span class="phase15-tag ${escapeHtml(sess.role)}">Role: ${escapeHtml(phase15RoleLabel_(sess.role))}</span>
      <button class="btn btn--ghost" type="button" id="phase15BtnPolicyApplyDefaults" ${roleCanEdit ? '' : 'disabled'}>Apply Defaults</button>
      <button class="btn btn--ghost" type="button" id="phase15BtnPolicySave" ${roleCanEdit ? '' : 'disabled'}>Save Policy</button>
    </div>
    <div class="phase15-fields phase15-compact" style="margin-top:8px">
      <div class="row">
        <label><input type="checkbox" id="phase15MsRequireReview" ${pol.requireReviewBeforeApprove?'checked':''} ${roleCanEdit?'':'disabled'}> Require review before approve</label>
        <label><input type="checkbox" id="phase15MsRequireUnlockReason" ${pol.requireUnlockReason?'checked':''} ${roleCanEdit?'':'disabled'}> Require unlock override reason</label>
      </div>
      <div class="row">
        <label>Task approver role
          <select id="phase15MsTaskApproverRole" ${roleCanEdit?'':'disabled'}>
            <option value="owner" ${pol.taskApproverRole==='owner'?'selected':''}>Owner only</option>
            <option value="owner_reviewer" ${pol.taskApproverRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option>
          </select>
        </label>
        <label>Milestone approver role
          <select id="phase15MsApproverRole" ${roleCanEdit?'':'disabled'}>
            <option value="owner" ${pol.milestoneApproverRole==='owner'?'selected':''}>Owner only</option>
            <option value="owner_reviewer" ${pol.milestoneApproverRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option>
          </select>
        </label>
      </div>
      <div class="row">
        <label>Task lock control role
          <select id="phase15MsTaskLockRole" ${roleCanEdit?'':'disabled'}>
            <option value="owner" ${pol.taskLockRole==='owner'?'selected':''}>Owner only</option>
            <option value="owner_reviewer" ${pol.taskLockRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option>
          </select>
        </label>
        <label>Milestone lock control role
          <select id="phase15MsLockRole" ${roleCanEdit?'':'disabled'}>
            <option value="owner" ${pol.milestoneLockRole==='owner'?'selected':''}>Owner only</option>
            <option value="owner_reviewer" ${pol.milestoneLockRole==='owner_reviewer'?'selected':''}>Owner or Reviewer</option>
          </select>
        </label>
      </div>
      <div class="row">
        <label><input type="checkbox" id="phase15MsAutoLockTask" ${pol.autoLockTaskOnApprove?'checked':''} ${roleCanEdit?'':'disabled'}> Auto-lock task on approve</label>
        <label><input type="checkbox" id="phase15MsAutoLockMs" ${pol.autoLockMilestoneOnApprove?'checked':''} ${roleCanEdit?'':'disabled'}> Auto-lock milestone on approve</label>
      </div>
    </div>
    <div class="phase15-note" style="margin-top:8px">Milestone: <b>${escapeHtml(String(ctx.ms.title||''))}</b> • Project: <b>${escapeHtml(String(ctx.p?.name||''))}</b></div>
    <div class="phase15-inlineHelp">Defaults are used for new milestones and as fallback. Per-milestone policy overrides Phase 14 approval actions and Phase 15 unlock reason prompts.</div>
    ${roleCanEdit ? '' : '<div class="phase15-note" style="color:#ffd0d0;margin-top:6px">Only Owner role can modify milestone approval policy.</div>'}
    <div class="phase15-pre">Current vs defaults
Task approver: ${phase15PolicyRuleLabel_(pol.taskApproverRole)} (default: ${phase15PolicyRuleLabel_(dpol.taskApproverRole)})
Milestone approver: ${phase15PolicyRuleLabel_(pol.milestoneApproverRole)} (default: ${phase15PolicyRuleLabel_(dpol.milestoneApproverRole)})
Task lock control: ${phase15PolicyRuleLabel_(pol.taskLockRole)} (default: ${phase15PolicyRuleLabel_(dpol.taskLockRole)})
Milestone lock control: ${phase15PolicyRuleLabel_(pol.milestoneLockRole)} (default: ${phase15PolicyRuleLabel_(dpol.milestoneLockRole)})</div>
  `;
  const readUiPolicy = () => phase15NormalizePolicy_({
    requireReviewBeforeApprove: !!box.querySelector('#phase15MsRequireReview')?.checked,
    requireUnlockReason: !!box.querySelector('#phase15MsRequireUnlockReason')?.checked,
    taskApproverRole: box.querySelector('#phase15MsTaskApproverRole')?.value,
    milestoneApproverRole: box.querySelector('#phase15MsApproverRole')?.value,
    taskLockRole: box.querySelector('#phase15MsTaskLockRole')?.value,
    milestoneLockRole: box.querySelector('#phase15MsLockRole')?.value,
    autoLockTaskOnApprove: !!box.querySelector('#phase15MsAutoLockTask')?.checked,
    autoLockMilestoneOnApprove: !!box.querySelector('#phase15MsAutoLockMs')?.checked,
  }, dpol);
  box.querySelector('#phase15BtnPolicyApplyDefaults')?.addEventListener('click', async ()=>{
    if(!phase15CanAction_('policy_edit', ctx)) return phase15Deny_('Only Owner role can apply milestone approval policy defaults.');
    const okApplyDefaults = await pmConfirmDialog_('Apply current Phase 15 default approval profile to this milestone?', { title:'Apply Milestone Policy Defaults', okText:'Apply' });
    if(!okApplyDefaults) return;
    ctx.ms.approvalPolicy = phase15NormalizePolicy_(dpol, dpol);
    try{ addActivity(`Phase15 applied default approval policy to milestone: ${ctx.ms.title}`); }catch{}
    saveState(); renderAll();
  });
  box.querySelector('#phase15BtnPolicySave')?.addEventListener('click', ()=>{
    if(!phase15CanAction_('policy_edit', ctx)) return phase15Deny_('Only Owner role can save milestone approval policy.');
    ctx.ms.approvalPolicy = readUiPolicy();
    try{ addActivity(`Phase15 saved milestone approval policy: ${ctx.ms.title}`); }catch{}
    saveState(); renderAll();
  });
}

function phase15PostRenderChecklist_(){
  const tab = document.querySelector('#tab-checklist');
  if(!tab) return;
  const cards = Array.from(tab.querySelectorAll('.card'));
  const tasksCard = cards[1] || cards[cards.length-1];
  if(!tasksCard) return;
  let box = document.querySelector('#phase15ChecklistRolePanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase15ChecklistRolePanel';
    box.className = 'phase15-box';
    const anchor = document.querySelector('#phase14ChecklistApprovalPanel');
    if(anchor && anchor.parentElement === tasksCard) anchor.insertAdjacentElement('beforebegin', box);
    else tasksCard.appendChild(box);
  }
  const ctx = phase15CurrentCtx_();
  const sess = phase15LoadSession_();
  const pol = phase15GetMilestonePolicy_(ctx.ms);
  box.innerHTML = `
    <div class="phase15-title">Phase 15 Approval Role Context</div>
    <div class="phase15-toolbar">
      <span class="phase15-tag ${escapeHtml(sess.role)}">${escapeHtml(phase15RoleLabel_(sess.role))}</span>
      <button class="btn btn--ghost" type="button" id="phase15BtnChecklistOpenRoles">Open Roles Panel</button>
      <button class="btn btn--ghost" type="button" id="phase15BtnChecklistOpenMsPolicy">Open Milestone Policy</button>
    </div>
    <div class="phase15-kv">
      <div><b>Task approve</b><span>${phase15CanAction_('task_approve', ctx) ? 'allowed' : 'blocked'}</span></div>
      <div><b>Task lock toggle</b><span>${phase15CanAction_('task_lock_toggle', ctx) ? 'allowed' : 'blocked'}</span></div>
      <div><b>Require review</b><span>${pol.requireReviewBeforeApprove ? 'yes' : 'no'}</span></div>
      <div><b>Unlock reason</b><span>${pol.requireUnlockReason ? 'required' : 'optional'}</span></div>
    </div>
    <div class="phase15-note" style="margin-top:8px">If a task/milestone is locked and you unlock it, Phase 15 may require an override reason depending on the milestone policy. Owner role always has lock-control override, but a reason can still be required.</div>
  `;
  box.querySelector('#phase15BtnChecklistOpenRoles')?.addEventListener('click', ()=>{ switchTab('dashboard'); setTimeout(()=>document.querySelector('#phase15RbacPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
  box.querySelector('#phase15BtnChecklistOpenMsPolicy')?.addEventListener('click', ()=>{ switchTab('milestones'); setTimeout(()=>document.querySelector('#phase15MilestonePolicyPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
}

try{ initPhase15_(); }catch(err){ console.warn('Phase15 init failed', err); }


/* ---------------------------
   Phase 16 Team Identity & Saved Approver Profiles (Additive Patch)
   - Saved team member profiles (name + role) with quick switching
   - Sync active profile with Phase 15 session (role/name)
   - Approval attribution consistency (actor stamped in approval audit note)
   - Dashboard + Checklist profile panels + topbar Team button
---------------------------- */
var PHASE16_TEAM_KEY = 'stark_pm_phase16_team_profiles_v1';
var phase16State_ = { inited:false, store:null, syncing:false };

function initPhase16_(){
  if(phase16State_.inited) return;
  phase16State_.inited = true;
  try{ phase16EnsureStyles_(); }catch(err){ console.warn('Phase16 styles failed', err); }
  try{ phase16EnsureStore_(); }catch(err){ console.warn('Phase16 store init failed', err); }
  try{ phase16WrapPhase15Session_(); }catch(err){ console.warn('Phase16 session wrap failed', err); }
  try{ phase16WrapApprovalAuditAttribution_(); }catch(err){ console.warn('Phase16 attribution wrap failed', err); }
  try{ phase16EnsureTopbarButton_(); }catch(err){ console.warn('Phase16 topbar failed', err); }
  try{ phase16WrapRenderHooks_(); }catch(err){ console.warn('Phase16 render wrap failed', err); }
  try{ phase16SyncSessionFromActiveProfile_(true); }catch{}
  try{ renderAll(); }catch{}
}

function phase16EnsureStyles_(){
  if(document.querySelector('#phase16Styles')) return;
  const st = document.createElement('style');
  st.id = 'phase16Styles';
  st.textContent = `
    .phase16-box{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    .phase16-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9;margin-bottom:8px}
    .phase16-grid{display:grid;grid-template-columns:1.15fr .85fr;gap:10px}
    .phase16-card{border:1px solid rgba(255,255,255,.06);border-radius:12px;padding:10px;background:rgba(255,255,255,.012)}
    .phase16-toolbar{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
    .phase16-list{display:grid;gap:8px;max-height:300px;overflow:auto}
    .phase16-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(255,255,255,.01)}
    .phase16-row.is-active{border-color:rgba(0,255,255,.22);box-shadow:0 0 0 1px rgba(0,255,255,.08) inset}
    .phase16-row__name{font-size:12px;font-weight:800;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
    .phase16-row__meta{font-size:11px;opacity:.78;line-height:1.35;margin-top:2px}
    .phase16-tag{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.1);border-radius:999px;padding:2px 7px;font-size:10px;letter-spacing:.05em;text-transform:uppercase}
    .phase16-tag.owner{border-color:rgba(105,255,200,.28);color:#bbfff0}
    .phase16-tag.reviewer{border-color:rgba(255,191,92,.28);color:#ffe0ac}
    .phase16-tag.executor{border-color:rgba(160,190,255,.22);color:#d7e2ff}
    .phase16-tag.active{border-color:rgba(0,255,255,.28);color:#cfffff}
    .phase16-fields{display:grid;gap:8px}
    .phase16-fields .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .phase16-note{font-size:11px;opacity:.8;line-height:1.35}
    .phase16-pre{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:11px;line-height:1.35;padding:8px;border-radius:10px;border:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.14);margin-top:8px;max-height:180px;overflow:auto}
    .phase16-mini{margin-top:8px;padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.012)}
    .phase16-mini .row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}
    .phase16-mini .sub{font-size:11px;opacity:.78}
    @media (max-width:980px){ .phase16-grid{grid-template-columns:1fr} .phase16-fields .row{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase16DefaultStore_(){
  let sess = null;
  try{ sess = (typeof phase15LoadSession_ === 'function') ? phase15LoadSession_() : null; }catch{}
  const role = (typeof phase15NormRole_ === 'function') ? phase15NormRole_(sess && sess.role) : ((String(sess&&sess.role||'owner').toLowerCase()==='reviewer'||String(sess&&sess.role||'').toLowerCase()==='executor')?String(sess.role).toLowerCase():'owner');
  const name = String(sess && sess.name || 'ME').trim().slice(0,48) || 'ME';
  const id = 'p16_' + (typeof uid === 'function' ? uid() : String(Date.now()));
  const now = Date.now();
  return { version:1, activeProfileId:id, profiles:[{ id, name, role, isDefault:true, createdAt:now, updatedAt:now }] };
}
function phase16NormalizeProfile_(p){
  if(!p || typeof p !== 'object') p = {};
  const role = (typeof phase15NormRole_ === 'function') ? phase15NormRole_(p.role) : 'owner';
  const name = String(p.name || 'Member').trim().slice(0,48) || 'Member';
  return {
    id: String(p.id || ('p16_' + (typeof uid === 'function' ? uid() : String(Date.now())))),
    name,
    role,
    isDefault: !!p.isDefault,
    createdAt: Number(p.createdAt || Date.now()),
    updatedAt: Number(p.updatedAt || Date.now()),
  };
}
function phase16LoadStore_(){
  if(phase16State_.store) return phase16State_.store;
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE16_TEAM_KEY) || 'null'); }catch{}
  let store = raw && typeof raw === 'object' ? raw : phase16DefaultStore_();
  let arr = Array.isArray(store.profiles) ? store.profiles.map(phase16NormalizeProfile_) : [];
  const seen = new Set();
  arr = arr.filter(p => { if(!p.id || seen.has(p.id)) return false; seen.add(p.id); return true; });
  if(!arr.length){
    store = phase16DefaultStore_();
    arr = store.profiles.map(phase16NormalizeProfile_);
  }
  let activeId = String(store.activeProfileId || arr[0].id || '');
  if(!arr.some(p => p.id === activeId)) activeId = arr[0].id;
  // only one default marker
  let foundDef = false;
  for(const p of arr){
    if(p.id === activeId && !foundDef && (p.isDefault || !arr.some(x=>x.isDefault))){ p.isDefault = true; foundDef = true; }
    else if(p.isDefault && foundDef){ p.isDefault = false; }
  }
  if(!arr.some(x=>x.isDefault) && arr[0]) arr[0].isDefault = true;
  phase16State_.store = { version:1, activeProfileId: activeId, profiles: arr };
  return phase16State_.store;
}
function phase16SaveStore_(){
  try{ localStorage.setItem(PHASE16_TEAM_KEY, JSON.stringify(phase16LoadStore_())); }catch(err){ console.warn('Phase16 save profiles failed', err); }
}
function phase16EnsureStore_(){
  const s = phase16LoadStore_();
  // if phase15 session diverged before phase16 existed, mirror current session into active profile once
  try{
    const sess = (typeof phase15LoadSession_ === 'function') ? phase15LoadSession_() : null;
    const p = phase16GetActiveProfile_();
    if(sess && p && ((p.name !== String(sess.name||'').trim()) || (p.role !== String(sess.role||'')))){
      p.name = String(sess.name || p.name || 'ME').trim().slice(0,48) || p.name;
      p.role = (typeof phase15NormRole_ === 'function') ? phase15NormRole_(sess.role) : p.role;
      p.updatedAt = Date.now();
      phase16SaveStore_();
    }
  }catch{}
  return s;
}
function phase16Profiles_(){ return phase16LoadStore_().profiles || []; }
function phase16GetActiveProfile_(){
  const s = phase16LoadStore_();
  return (s.profiles || []).find(p => p.id === s.activeProfileId) || (s.profiles || [])[0] || null;
}
function phase16SetActiveProfile_(profileId, opts){
  const s = phase16LoadStore_();
  const p = (s.profiles || []).find(x => x.id === String(profileId||''));
  if(!p) return false;
  s.activeProfileId = p.id;
  s.profiles.forEach(x => { x.isDefault = (x.id === p.id); if(x.isDefault) x.updatedAt = Date.now(); });
  phase16SaveStore_();
  phase16SyncSessionFromActiveProfile_(!!(opts && opts.silent));
  try{ if(!(opts && opts.silent)) addActivity(`Phase16 switched profile • ${p.name} (${(typeof phase15RoleLabel_==='function'?phase15RoleLabel_(p.role):p.role)})`); }catch{}
  try{ renderAll(); }catch{}
  return true;
}
function phase16SyncSessionFromActiveProfile_(silent){
  if(phase16State_.syncing) return;
  phase16State_.syncing = true;
  try{
    const p = phase16GetActiveProfile_();
    if(!p || typeof phase15LoadSession_ !== 'function') return;
    const sess = phase15LoadSession_();
    const nextRole = (typeof phase15NormRole_ === 'function') ? phase15NormRole_(p.role) : p.role;
    const nextName = String(p.name || 'ME').trim().slice(0,48) || 'ME';
    const changed = (sess.role !== nextRole) || (String(sess.name||'') !== nextName);
    sess.role = nextRole; sess.name = nextName;
    if(typeof phase15SaveSession_ === 'function') phase15SaveSession_();
    if(changed && !silent){ try{ addActivity(`Phase16 synced session from profile • ${nextName}`); }catch{} }
  }finally{
    phase16State_.syncing = false;
  }
}
function phase16SyncActiveProfileFromSession_(silent){
  if(phase16State_.syncing) return;
  phase16State_.syncing = true;
  try{
    const p = phase16GetActiveProfile_();
    if(!p || typeof phase15LoadSession_ !== 'function') return;
    const sess = phase15LoadSession_();
    const nextRole = (typeof phase15NormRole_ === 'function') ? phase15NormRole_(sess.role) : String(sess.role||'owner');
    const nextName = String(sess.name || 'ME').trim().slice(0,48) || 'ME';
    const changed = (p.role !== nextRole) || (p.name !== nextName);
    p.role = nextRole; p.name = nextName; p.updatedAt = Date.now();
    phase16SaveStore_();
    if(changed && !silent){ try{ addActivity(`Phase16 updated active profile from Phase15 session • ${nextName}`); }catch{} }
  }finally{
    phase16State_.syncing = false;
  }
}

function phase16WrapPhase15Session_(){
  if(typeof phase15LoadSession_ === 'function' && !phase15LoadSession_._phase16Wrapped){
    const _origLoad = phase15LoadSession_;
    phase15LoadSession_ = function(){
      const sess = _origLoad.apply(this, arguments);
      if(phase16State_.syncing) return sess;
      try{
        const p = phase16GetActiveProfile_();
        if(p){
          const role = (typeof phase15NormRole_ === 'function') ? phase15NormRole_(p.role) : p.role;
          const name = String(p.name || 'ME').trim().slice(0,48) || 'ME';
          if(sess.role !== role || String(sess.name||'') !== name){ sess.role = role; sess.name = name; }
        }
      }catch(err){ console.warn('Phase16 sync-on-load failed', err); }
      return sess;
    };
    phase15LoadSession_._phase16Wrapped = true;
  }
  if(typeof phase15SaveSession_ === 'function' && !phase15SaveSession_._phase16Wrapped){
    const _origSave = phase15SaveSession_;
    phase15SaveSession_ = function(){
      const r = _origSave.apply(this, arguments);
      try{ phase16SyncActiveProfileFromSession_(true); }catch{}
      return r;
    };
    phase15SaveSession_._phase16Wrapped = true;
  }
}

function phase16WrapApprovalAuditAttribution_(){
  if(typeof phase14LogApprovalAction_ === 'function' && !phase14LogApprovalAction_._phase16Wrapped){
    const _orig = phase14LogApprovalAction_;
    phase14LogApprovalAction_ = function(ctx, payload){
      payload = payload || {};
      try{
        const sess = (typeof phase15LoadSession_ === 'function') ? phase15LoadSession_() : null;
        const p = phase16GetActiveProfile_();
        const who = String(sess && sess.name || p && p.name || 'ME').trim() || 'ME';
        const role = String(sess && sess.role || p && p.role || 'owner');
        const pid = String(p && p.id || '');
        const stamp = `actor:${who} [${role}]${pid ? ' {' + pid + '}' : ''}`;
        const note = String(payload.note || '');
        if(!note.includes('actor:')) payload.note = note ? `${note} • ${stamp}` : stamp;
      }catch{}
      return _orig.call(this, ctx, payload);
    };
    phase14LogApprovalAction_._phase16Wrapped = true;
  }
}

function phase16EnsureTopbarButton_(){
  const top = document.querySelector('.topbar__right');
  if(!top) return;
  if(document.querySelector('#phase16BtnTeamProfiles')) return;
  const btn = document.createElement('button');
  btn.id = 'phase16BtnTeamProfiles';
  btn.type = 'button';
  btn.className = 'btn btn--ghost';
  btn.textContent = 'Team';
  btn.title = 'Open Phase 16 team profiles';
  btn.addEventListener('click', ()=>{
    openPanelInOwningTab_('#phase16TeamPanel', 'advanced-panels', 30);
  });
  const anchor = document.querySelector('#phase15BtnRoles') || document.querySelector('#phase14BtnExportCenter') || top.firstElementChild;
  top.insertBefore(btn, anchor || null);
}

function phase16WrapRenderHooks_(){
  if(typeof phase15PostRenderDashboard_ === 'function' && !phase15PostRenderDashboard_._phase16Wrapped){
    const _orig = phase15PostRenderDashboard_;
    phase15PostRenderDashboard_ = function(){ const r = _orig.apply(this, arguments); try{ phase16RenderDashboardPanel_(); }catch(err){ console.warn('Phase16 dashboard panel failed', err); } try{ phase16EnsureTopbarButton_(); }catch{} return r; };
    phase15PostRenderDashboard_._phase16Wrapped = true;
  }
  if(typeof phase15PostRenderChecklist_ === 'function' && !phase15PostRenderChecklist_._phase16Wrapped){
    const _orig = phase15PostRenderChecklist_;
    phase15PostRenderChecklist_ = function(){ const r = _orig.apply(this, arguments); try{ phase16RenderChecklistMini_(); }catch(err){ console.warn('Phase16 checklist mini failed', err); } return r; };
    phase15PostRenderChecklist_._phase16Wrapped = true;
  }
  if(typeof phase15PostRenderMilestones_ === 'function' && !phase15PostRenderMilestones_._phase16Wrapped){
    const _orig = phase15PostRenderMilestones_;
    phase15PostRenderMilestones_ = function(){ const r = _orig.apply(this, arguments); try{ phase16RenderMilestonesMini_(); }catch(err){ console.warn('Phase16 milestones mini failed', err); } return r; };
    phase15PostRenderMilestones_._phase16Wrapped = true;
  }
}

function phase16RenderDashboardPanel_(){
  const tab = document.querySelector('#tab-dashboard');
  if(!tab) return;
  const cards = Array.from(tab.querySelectorAll('.card'));
  const host = cards[0] || tab;
  let box = document.querySelector('#phase16TeamPanel');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase16TeamPanel';
    box.className = 'phase16-box';
    const anchor = document.querySelector('#phase15RbacPanel');
    if(anchor && anchor.parentElement === host) anchor.insertAdjacentElement('afterend', box);
    else host.appendChild(box);
  }
  const store = phase16LoadStore_();
  const sess = (typeof phase15LoadSession_ === 'function') ? phase15LoadSession_() : { role:'owner', name:'ME' };
  const active = phase16GetActiveProfile_();
  const rowsHtml = (store.profiles || []).map(p => {
    const isActive = active && p.id === active.id;
    return `
      <div class="phase16-row ${isActive ? 'is-active' : ''}" data-pid="${escapeHtml(p.id)}">
        <div>
          <div class="phase16-row__name">
            ${escapeHtml(p.name)}
            <span class="phase16-tag ${escapeHtml(p.role)}">${escapeHtml(typeof phase15RoleLabel_==='function' ? phase15RoleLabel_(p.role) : p.role)}</span>
            ${isActive ? '<span class="phase16-tag active">ACTIVE</span>' : ''}
          </div>
          <div class="phase16-row__meta">id: ${escapeHtml(p.id)} • updated: ${escapeHtml(new Date(Number(p.updatedAt||0)).toLocaleString())}</div>
        </div>
        <div class="phase16-toolbar">
          <button class="btn btn--ghost" type="button" data-act="use">Use</button>
          <button class="btn btn--ghost" type="button" data-act="edit">Edit</button>
          <button class="btn btn--ghost" type="button" data-act="clone">Clone</button>
          <button class="btn btn--ghost" type="button" data-act="del">Delete</button>
        </div>
      </div>`;
  }).join('') || `<div class="phase16-note">No profiles yet.</div>`;

  const auditTail = (typeof phase14LoadAudit_ === 'function') ? (phase14LoadAudit_().slice(0,5) || []) : [];
  const attributionPreview = auditTail.length
    ? auditTail.map(a => `• ${new Date(a.ts||Date.now()).toLocaleString()} — ${a.action} — ${String(a.note||'').slice(0,140)}`).join('\n')
    : 'No approval audit entries yet.';

  box.innerHTML = `
    <div class="phase16-title">Phase 16 Team Identity & Saved Approver Profiles</div>
    <div class="phase16-grid">
      <div class="phase16-card">
        <div class="phase16-toolbar">
          <span class="phase16-tag active">Active session</span>
          <span class="phase16-tag ${escapeHtml(sess.role)}">${escapeHtml(typeof phase15RoleLabel_==='function' ? phase15RoleLabel_(sess.role) : sess.role)}</span>
          <b>${escapeHtml(sess.name||'ME')}</b>
          <button class="btn btn--ghost" type="button" id="phase16BtnOpenPhase15Roles">Open Phase 15 Roles</button>
          <button class="btn btn--ghost" type="button" id="phase16BtnSyncFromSession">Sync Active Profile ← Session</button>
        </div>
        <div class="phase16-note" style="margin-top:8px">Profiles are a saved list of approvers. Switching a profile updates the active Phase 15 role + display name so approval actions and lock overrides stay attributed consistently.</div>
        <div class="phase16-list" id="phase16ProfileList" style="margin-top:8px">${rowsHtml}</div>
      </div>
      <div class="phase16-card">
        <div class="phase16-title" style="margin-bottom:6px">Profile Manager</div>
        <div class="phase16-fields">
          <input type="hidden" id="phase16EditProfileId" value="">
          <div class="row">
            <label>Name
              <input id="phase16ProfileName" type="text" maxlength="48" placeholder="e.g. Alex" value="${escapeHtml(active?.name || '')}">
            </label>
            <label>Role
              <select id="phase16ProfileRole">
                <option value="owner" ${(active?.role||'owner')==='owner'?'selected':''}>Owner</option>
                <option value="reviewer" ${(active?.role||'')==='reviewer'?'selected':''}>Reviewer</option>
                <option value="executor" ${(active?.role||'')==='executor'?'selected':''}>Executor</option>
              </select>
            </label>
          </div>
          <div class="phase16-toolbar">
            <button class="btn btn--ghost" type="button" id="phase16BtnSaveProfile">Save Profile</button>
            <button class="btn btn--ghost" type="button" id="phase16BtnNewProfile">New</button>
            <button class="btn btn--ghost" type="button" id="phase16BtnExportProfiles">Export JSON</button>
            <button class="btn btn--ghost" type="button" id="phase16BtnImportProfiles">Import JSON</button>
          </div>
          <div class="phase16-note">Import supports merge or replace. Active profile is preserved when possible; otherwise first profile becomes active.</div>
        </div>
        <div class="phase16-pre">Approval attribution preview (recent Phase 14 audit notes)
${escapeHtml(attributionPreview)}</div>
      </div>
    </div>
  `;

  box.querySelector('#phase16BtnOpenPhase15Roles')?.addEventListener('click', ()=>{ switchTab('dashboard'); setTimeout(()=>document.querySelector('#phase15RbacPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
  box.querySelector('#phase16BtnSyncFromSession')?.addEventListener('click', ()=>{ phase16SyncActiveProfileFromSession_(false); renderAll(); });

  box.querySelectorAll('#phase16ProfileList .phase16-row').forEach(row => {
    const pid = row.getAttribute('data-pid');
    row.querySelector('[data-act="use"]')?.addEventListener('click', ()=> phase16SetActiveProfile_(pid));
    row.querySelector('[data-act="edit"]')?.addEventListener('click', ()=> phase16LoadProfileIntoForm_(pid));
    row.querySelector('[data-act="clone"]')?.addEventListener('click', ()=> phase16CloneProfile_(pid));
    row.querySelector('[data-act="del"]')?.addEventListener('click', ()=> phase16DeleteProfile_(pid));
  });

  box.querySelector('#phase16BtnNewProfile')?.addEventListener('click', ()=> phase16LoadProfileIntoForm_(null));
  box.querySelector('#phase16BtnSaveProfile')?.addEventListener('click', phase16SaveProfileFromForm_);
  box.querySelector('#phase16BtnExportProfiles')?.addEventListener('click', phase16ExportProfiles_);
  box.querySelector('#phase16BtnImportProfiles')?.addEventListener('click', phase16ImportProfiles_);
}

function phase16LoadProfileIntoForm_(profileId){
  const box = document.querySelector('#phase16TeamPanel');
  if(!box) return;
  let p = null;
  if(profileId) p = (phase16Profiles_() || []).find(x => x.id === String(profileId));
  if(!p){
    const active = phase16GetActiveProfile_();
    p = { id:'', name:'', role: active ? active.role : 'owner' };
  }
  const idInput = box.querySelector('#phase16EditProfileId');
  const nameInput = box.querySelector('#phase16ProfileName');
  const roleSel = box.querySelector('#phase16ProfileRole');
  if(idInput) idInput.value = p.id || '';
  if(nameInput){ nameInput.value = p.name || ''; nameInput.focus(); nameInput.select?.(); }
  if(roleSel) roleSel.value = (typeof phase15NormRole_ === 'function') ? phase15NormRole_(p.role) : String(p.role||'owner');
}
function phase16SaveProfileFromForm_(){
  const box = document.querySelector('#phase16TeamPanel');
  if(!box) return;
  const store = phase16LoadStore_();
  const id = String(box.querySelector('#phase16EditProfileId')?.value || '').trim();
  const name = String(box.querySelector('#phase16ProfileName')?.value || '').trim().slice(0,48);
  const role = (typeof phase15NormRole_ === 'function') ? phase15NormRole_(box.querySelector('#phase16ProfileRole')?.value) : 'owner';
  if(!name) return alert('Profile name is required.');
  let p = id ? (store.profiles || []).find(x => x.id === id) : null;
  if(p){
    p.name = name; p.role = role; p.updatedAt = Date.now();
    addActivity(`Phase16 updated profile • ${name} (${typeof phase15RoleLabel_==='function'?phase15RoleLabel_(role):role})`);
  } else {
    p = phase16NormalizeProfile_({ id:'p16_' + (typeof uid === 'function' ? uid() : String(Date.now())), name, role, createdAt:Date.now(), updatedAt:Date.now() });
    store.profiles.push(p);
    addActivity(`Phase16 created profile • ${name} (${typeof phase15RoleLabel_==='function'?phase15RoleLabel_(role):role})`);
  }
  phase16SaveStore_();
  // if editing active profile, keep session in sync immediately
  if(store.activeProfileId === p.id){ phase16SyncSessionFromActiveProfile_(true); }
  renderAll();
}
async function phase16CloneProfile_(profileId){
  const src = (phase16Profiles_() || []).find(x => x.id === String(profileId));
  if(!src) return;
  const name = await pmPromptDialog_('Clone profile name:', `${src.name} Copy`, { title:'Clone Team Profile', placeholder:'Profile name' });
  if(name == null) return;
  const trimmed = String(name || '').trim().slice(0,48);
  if(!trimmed) return;
  phase16LoadStore_().profiles.push(phase16NormalizeProfile_({ name: trimmed, role: src.role, createdAt:Date.now(), updatedAt:Date.now() }));
  phase16SaveStore_();
  addActivity(`Phase16 cloned profile • ${src.name} → ${trimmed}`);
  renderAll();
}
async function phase16DeleteProfile_(profileId){
  const s = phase16LoadStore_();
  const arr = s.profiles || [];
  const idx = arr.findIndex(x => x.id === String(profileId));
  if(idx < 0) return;
  const p = arr[idx];
  if(arr.length <= 1) return alert('Keep at least one profile.');
  const okDelete = await pmConfirmDialog_(`Delete profile "${p.name}"?`, { title:'Delete Team Profile', okText:'Delete', danger:true });
  if(!okDelete) return;
  arr.splice(idx, 1);
  if(s.activeProfileId === p.id) s.activeProfileId = (arr[0] && arr[0].id) || '';
  if(!arr.some(x => x.isDefault) && arr[0]) arr[0].isDefault = true;
  phase16SaveStore_();
  phase16SyncSessionFromActiveProfile_(true);
  addActivity(`Phase16 deleted profile • ${p.name}`);
  renderAll();
}
function phase16ExportProfiles_(){
  const payload = { version:1, exportedAt:Date.now(), phase:'phase16', teamProfiles: phase16LoadStore_() };
  const stamp = (typeof phase14DateStamp_ === 'function') ? phase14DateStamp_() : new Date().toISOString().slice(0,10);
  downloadText(`phase16_team_profiles_${stamp}.json`, JSON.stringify(payload, null, 2), 'application/json');
  addActivity(`Phase16 exported team profiles (${phase16Profiles_().length})`);
}
async function phase16ImportProfiles_(){
  if(typeof pickFileText !== 'function') return alert('Import helper is not available in this build.');
  pickFileText(async (txt) => {
    try{
      const parsed = JSON.parse(txt || '{}');
      const incoming = (parsed && parsed.teamProfiles && Array.isArray(parsed.teamProfiles.profiles)) ? parsed.teamProfiles : (parsed && Array.isArray(parsed.profiles) ? parsed : null);
      if(!incoming) return alert('Invalid Phase 16 team profiles JSON.');
      const mode = await pmPromptDialog_('Import team profiles mode? Type MERGE or REPLACE', 'MERGE', { title:'Import Team Profiles', placeholder:'MERGE or REPLACE' });
      if(mode == null) return;
      const replace = String(mode||'MERGE').trim().toUpperCase() === 'REPLACE';
      const curr = phase16LoadStore_();
      const incProfiles = (incoming.profiles || []).map(phase16NormalizeProfile_);
      if(!incProfiles.length) return alert('No profiles found in import.');
      let nextProfiles = [];
      let nextActive = String(incoming.activeProfileId || '');
      if(replace){
        nextProfiles = incProfiles;
      } else {
        const map = new Map((curr.profiles || []).map(p => [p.id, phase16NormalizeProfile_(p)]));
        // merge by id if same, else by name+role fallback (keeps local ids stable)
        for(const ip of incProfiles){
          let target = null;
          if(map.has(ip.id)) target = map.get(ip.id);
          if(!target){
            target = Array.from(map.values()).find(x => x.name === ip.name && x.role === ip.role);
            if(target) ip.id = target.id;
          }
          map.set(ip.id, phase16NormalizeProfile_(ip));
        }
        nextProfiles = Array.from(map.values());
        nextActive = curr.activeProfileId || nextActive;
      }
      if(!nextProfiles.length) return alert('Import would leave no profiles.');
      curr.profiles = nextProfiles;
      if(!curr.profiles.some(x => x.id === nextActive)) nextActive = curr.profiles[0].id;
      curr.activeProfileId = nextActive;
      curr.profiles.forEach(x => x.isDefault = (x.id === curr.activeProfileId));
      phase16SaveStore_();
      phase16SyncSessionFromActiveProfile_(true);
      addActivity(`Phase16 imported team profiles • ${replace ? 'replace' : 'merge'} (${curr.profiles.length} total)`);
      renderAll();
    }catch(err){
      console.warn('Phase16 import profiles failed', err);
      alert(`Import failed: ${err && err.message ? err.message : err}`);
    }
  });
}

function phase16RenderChecklistMini_(){
  const host = document.querySelector('#phase15ChecklistRolePanel');
  if(!host) return;
  let box = host.querySelector('#phase16ChecklistMini');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase16ChecklistMini';
    box.className = 'phase16-mini';
    host.appendChild(box);
  }
  const active = phase16GetActiveProfile_();
  const profiles = phase16Profiles_();
  box.innerHTML = `
    <div class="phase16-title" style="margin-bottom:6px">Phase 16 Team Profile</div>
    <div class="row">
      <div>
        <div><b>${escapeHtml(active?.name || 'ME')}</b> <span class="phase16-tag ${escapeHtml(active?.role || 'owner')}">${escapeHtml(typeof phase15RoleLabel_==='function' ? phase15RoleLabel_(active?.role || 'owner') : (active?.role || 'owner'))}</span></div>
        <div class="sub">Switching profile updates Phase 15 role/session for approval actions and audit attribution.</div>
      </div>
      <div class="phase16-toolbar">
        <select id="phase16ChecklistProfileSelect">${profiles.map(p => `<option value="${escapeHtml(p.id)}" ${active&&p.id===active.id?'selected':''}>${escapeHtml(p.name)} (${escapeHtml(typeof phase15RoleLabel_==='function'?phase15RoleLabel_(p.role):p.role)})</option>`).join('')}</select>
        <button class="btn btn--ghost" type="button" id="phase16ChecklistBtnUse">Use</button>
      </div>
    </div>`;
  box.querySelector('#phase16ChecklistBtnUse')?.addEventListener('click', ()=>{
    const id = box.querySelector('#phase16ChecklistProfileSelect')?.value;
    phase16SetActiveProfile_(id);
  });
}

function phase16RenderMilestonesMini_(){
  const host = document.querySelector('#phase15MilestonePolicyPanel');
  if(!host) return;
  let box = host.querySelector('#phase16MilestonesMini');
  if(!box){
    box = document.createElement('div');
    box.id = 'phase16MilestonesMini';
    box.className = 'phase16-mini';
    host.appendChild(box);
  }
  const p = phase16GetActiveProfile_();
  const canPolicy = (typeof phase15CanAction_ === 'function') ? phase15CanAction_('policy_edit', (typeof phase15CurrentCtx_==='function'?phase15CurrentCtx_():{})) : false;
  box.innerHTML = `
    <div class="phase16-title" style="margin-bottom:6px">Phase 16 Approval Attribution</div>
    <div class="row">
      <div>
        <div><b>${escapeHtml(p?.name || 'ME')}</b> <span class="phase16-tag ${escapeHtml(p?.role || 'owner')}">${escapeHtml(typeof phase15RoleLabel_==='function' ? phase15RoleLabel_(p?.role || 'owner') : (p?.role || 'owner'))}</span></div>
        <div class="sub">Current actor used for approval and lock audit notes${canPolicy ? '. You can edit milestone policy below.' : ' (policy edit blocked for current role).'}</div>
      </div>
      <div class="phase16-toolbar"><button class="btn btn--ghost" type="button" id="phase16MilestonesBtnTeam">Open Team Profiles</button></div>
    </div>`;
  box.querySelector('#phase16MilestonesBtnTeam')?.addEventListener('click', ()=>{ switchTab('advanced-panels'); setTimeout(()=>document.querySelector('#phase16TeamPanel')?.scrollIntoView({behavior:'smooth', block:'start'}), 30); });
}

try{ initPhase16_(); }catch(err){ console.warn('Phase16 init failed', err); }

/* ---------------------------
   Phase 16 UI Cleanup + Panel Grouping + Performance Trim (Polish Patch)
   - Groups dashboard phase panels into collapsible sections
   - Reparents Phase 16 Team panel out of base Completion card
   - Adds content-visibility / containment hints for heavy phase panels
   - Schedules cleanup in rAF to avoid repeated layout thrash
---------------------------- */
var PHASE16_POLISH_KEY = 'stark_pm_phase16_ui_polish_v1';
var phase16PolishState_ = { inited:false, raf:0, bound:false };

function initPhase16Polish_(){
  if(phase16PolishState_.inited) return;
  phase16PolishState_.inited = true;
  try{ phase16PolishEnsureStyles_(); }catch(err){ console.warn('Phase16 polish styles failed', err); }
  try{ phase16PolishEnsureWorkspaceTab_(); }catch(err){ console.warn('Phase16 polish workspace tab failed', err); }
  try{ phase16PolishWrapRenderDashboard_(); }catch(err){ console.warn('Phase16 polish wrap render failed', err); }
  try{ phase16PolishWrapSwitchTab_(); }catch(err){ console.warn('Phase16 polish wrap tab failed', err); }
  try{ phase16PolishSchedule_(); }catch{}
}

function phase16PolishEnsureWorkspaceTab_(){
  const sidebarNav = document.querySelector('.nav');
  const dashNavBtn = sidebarNav && sidebarNav.querySelector('.nav__item[data-tab="dashboard"]');
  const dashboardTab = document.querySelector('#tab-dashboard');
  if(!sidebarNav || !dashboardTab || !dashboardTab.parentElement) return;

  let navBtn = sidebarNav.querySelector('.nav__item[data-tab="advanced-panels"]');
  if(!navBtn){
    navBtn = document.createElement('button');
    navBtn.className = 'nav__item';
    navBtn.type = 'button';
    navBtn.dataset.tab = 'advanced-panels';
    navBtn.innerHTML = '<span class="nav__icon">▦</span><span class="nav__text">Advanced Panels</span>';
    if(dashNavBtn && dashNavBtn.parentElement) dashNavBtn.insertAdjacentElement('afterend', navBtn);
    else sidebarNav.appendChild(navBtn);
  }

  let panel = document.querySelector('#tab-advanced-panels');
  if(!panel){
    panel = document.createElement('section');
    panel.className = 'tab';
    panel.id = 'tab-advanced-panels';
    panel.dataset.tab = 'advanced-panels';
    panel.innerHTML = `
      <div class="tab__header">
        <div class="tab__title">Advanced Panels</div>
        <div class="tab__subtitle">Dedicated workspace for grouped phase panels moved out of Dashboard for cleaner navigation.</div>
      </div>
    `;
    dashboardTab.insertAdjacentElement('afterend', panel);
  }

  if(ui && Array.isArray(ui.tabs) && !ui.tabs.some(x => x && x.dataset && x.dataset.tab === 'advanced-panels')) ui.tabs.splice(1, 0, navBtn);
  if(ui && Array.isArray(ui.tabPanels) && !ui.tabPanels.some(x => x && x.dataset && x.dataset.tab === 'advanced-panels')) ui.tabPanels.splice(1, 0, panel);

  if(!navBtn._phase16PolishBound){
    navBtn.addEventListener('click', () => {
      switchTab('advanced-panels');
      setTimeout(()=>{ try{ phase16PolishSchedule_(); }catch{} }, 20);
    });
    navBtn._phase16PolishBound = true;
  }

  try{ phase16PolishEnsureSidebarNavDropdown_(navBtn); }catch(err){ console.warn('Phase16 polish sidebar dropdown failed', err); }
  try{ phase16PolishRenderSidebarNavDropdown_(); }catch{}
}

function phase16PolishEnsureStyles_(){
  if(document.querySelector('#phase16PolishStyles')) return;
  const st = document.createElement('style');
  st.id = 'phase16PolishStyles';
  st.textContent = `
    #phase16PolishDashRoot{margin-top:10px;padding:10px;border:1px solid rgba(255,255,255,.08);border-radius:14px;background:rgba(255,255,255,.02)}
    #phase16PolishDashRoot .phase16polish-head{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
    #phase16PolishDashRoot .phase16polish-title{font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.9}
    #phase16PolishDashRoot .phase16polish-sub{font-size:11px;opacity:.78}
    #phase16PolishDashRoot .phase16polish-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
    #phase16PolishDashRoot details.phase16polish-group{border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(255,255,255,.012);overflow:hidden}
    #phase16PolishDashRoot details.phase16polish-group > summary{cursor:pointer;list-style:none;padding:10px 12px;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;background:rgba(255,255,255,.01)}
    #phase16PolishDashRoot details.phase16polish-group > summary::-webkit-details-marker{display:none}
    #phase16PolishDashRoot .phase16polish-badge{display:inline-flex;align-items:center;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:1px 7px;font-size:10px;opacity:.9}
    #phase16PolishDashRoot .phase16polish-body{padding:10px;display:grid;gap:10px}
    #phase16PolishDashRoot .phase16polish-body > *{margin-top:0 !important}
    #phase16PolishDashRoot .phase16polish-body > .card{background:rgba(255,255,255,.01)}
    #phase16PolishDashRoot .phase16polish-body > .phase10-box,
    #phase16PolishDashRoot .phase16polish-body > .phase11-box,
    #phase16PolishDashRoot .phase16polish-body > .phase12-box,
    #phase16PolishDashRoot .phase16polish-body > .phase13-box,
    #phase16PolishDashRoot .phase16polish-body > .phase14-box,
    #phase16PolishDashRoot .phase16polish-body > .phase15-box,
    #phase16PolishDashRoot .phase16polish-body > .phase16-box,
    #phase16PolishDashRoot .phase16polish-body > .phase8-box,
    #phase16PolishDashRoot .phase16polish-body > .phase9-box,
    #phase16PolishDashRoot .phase16polish-body > .card{
      content-visibility:auto;
      contain:layout style paint;
      contain-intrinsic-size: 380px;
    }
    #phase16PolishDashRoot .phase16polish-body .phase10-grid,
    #phase16PolishDashRoot .phase16polish-body .phase11-grid,
    #phase16PolishDashRoot .phase16polish-body .phase12-grid,
    #phase16PolishDashRoot .phase16polish-body .phase13-grid{grid-template-columns:1fr}
    #phase16PolishDashRoot .phase16polish-body .phase16-grid{grid-template-columns:1fr}
    #phase16PolishDashRoot .phase16polish-actions{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
    #phase16PolishDashRoot .phase16polish-catalog{margin:0 0 10px;padding:10px;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(255,255,255,.012)}
    #phase16PolishDashRoot .phase16polish-catalogHead{display:flex;justify-content:space-between;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
    #phase16PolishDashRoot .phase16polish-catalogTitle{font-size:12px;font-weight:700}
    #phase16PolishDashRoot .phase16polish-catalogSub{font-size:11px;opacity:.75}
    #phase16PolishDashRoot .phase16polish-catalogTools{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:8px}
    #phase16PolishDashRoot .phase16polish-catalogSelect,
    #phase16PolishDashRoot .phase16polish-catalogJump{min-width:180px;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit}
    #phase16PolishDashRoot .phase16polish-catalogSearch{min-width:260px;max-width:420px;width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit}
    #phase16PolishDashRoot .phase16polish-catalogJumpWrap{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px}
    #phase16PolishDashRoot .phase16polish-catalogJump{min-width:300px;max-width:100%;flex:1 1 320px}
    #phase16PolishDashRoot .phase16polish-catalogHint{font-size:10px;opacity:.72;margin:0 0 8px}
    #phase16DashboardFocusCard{margin-top:10px}
    #phase16DashboardFocusCard .phase16polish-focusWrap{display:grid;gap:10px}
    #phase16DashboardFocusCard .phase16polish-focusTop{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;flex-wrap:wrap}
    #phase16DashboardFocusCard .phase16polish-focusTitle{font-weight:700;font-size:13px}
    #phase16DashboardFocusCard .phase16polish-focusMeta{font-size:11px;opacity:.75;line-height:1.45}
    #phase16DashboardFocusCard .phase16polish-focusActions{display:flex;gap:6px;flex-wrap:wrap}
    #phase16DashboardFocusCard .phase16polish-focusStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}
    #phase16DashboardFocusCard .phase16polish-focusStat{padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.012)}
    #phase16DashboardFocusCard .phase16polish-focusStat b{display:block;font-size:14px;line-height:1.1}
    #phase16DashboardFocusCard .phase16polish-focusStat span{display:block;margin-top:3px;font-size:10px;opacity:.72;text-transform:uppercase;letter-spacing:.05em}
    #phase16DashboardFocusCard .phase16polish-focusHint{font-size:11px;opacity:.78}
    #phase16DashboardFocusCard .phase16polish-hidden{display:none !important}
    @media (max-width:1100px){ #phase16DashboardFocusCard .phase16polish-focusStats{grid-template-columns:repeat(2,minmax(0,1fr));} }
    /* Milestone 3: visual rhythm + typography normalization (Dashboard/Advanced/Portfolio) */
    #tab-dashboard .card, #tab-advanced-panels .card, #tab-portfolio .card{padding:14px;border-radius:14px}
    #tab-dashboard .card__top, #tab-advanced-panels .card__top, #tab-portfolio .card__top{gap:8px;margin-bottom:8px}
    #tab-dashboard .card__label, #tab-advanced-panels .card__label, #tab-portfolio .card__label{font-size:11px;line-height:1.2;letter-spacing:.12em;margin-bottom:8px}
    #tab-dashboard .card__title, #tab-advanced-panels .card__title, #tab-portfolio .card__title{font-size:13px;line-height:1.25;margin:4px 0 8px}
    #tab-dashboard .card__hint, #tab-advanced-panels .card__hint, #tab-portfolio .card__hint{font-size:11px;line-height:1.35}
    #tab-dashboard .card__meta, #tab-advanced-panels .card__meta, #tab-portfolio .card__meta{font-size:11px;line-height:1.45}
    #tab-dashboard .card__actions, #tab-advanced-panels .card__actions, #tab-portfolio .card__actions{gap:8px;margin-top:10px;flex-wrap:wrap}
    #tab-dashboard .grid, #tab-advanced-panels .grid{gap:12px}
    #tab-dashboard .list, #tab-advanced-panels .list{gap:8px}
    #phase16PolishDashRoot .phase16polish-head{gap:10px;margin-bottom:10px}
    #phase16PolishDashRoot .phase16polish-sub{line-height:1.4}
    #phase16PolishDashRoot details.phase16polish-group > summary{padding:12px;font-size:12px;line-height:1.2}
    #phase16PolishDashRoot .phase16polish-body{padding:12px;gap:12px}
    #phase16PolishDashRoot .phase16polish-catalog{padding:12px}
    #phase16PolishDashRoot .phase16polish-catalogHead{margin-bottom:10px}
    /* Sidebar nav dropdown (requested) */
    .nav .phase16polish-navDropdown{display:grid;gap:6px;padding:8px 10px;margin:-2px 0 4px 0;border-radius:12px;border:1px solid rgba(56,246,255,.10);background:rgba(10,18,28,.16)}
    .nav .phase16polish-navDropdown.is-hidden{display:none}
    .nav .phase16polish-navDropdownLabel{font-size:10px;letter-spacing:.08em;text-transform:uppercase;opacity:.75}
    .nav .phase16polish-navDropdownSelect{width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(56,246,255,.12);background:rgba(10,18,28,.35);color:inherit;font-family:var(--mono);font-size:11px}
    .nav .phase16polish-navDropdown .btn{width:100%}
    .nav .phase16polish-navDropdownHint{font-size:10px;opacity:.7;line-height:1.35}
    /* Revert tab-level dropdown controls (moved to sidebar nav) */
    #phase16PolishDashRoot #phase16PolishCatalogCategory,
    #phase16PolishDashRoot .phase16polish-catalogJumpWrap,
    #phase16PolishDashRoot #phase16PolishCatalogJumpHint{display:none !important}
    #phase16PolishDashRoot .phase16polish-favs{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}
    #phase16PolishDashRoot .phase16polish-favs:empty{display:none}
    #phase16PolishDashRoot .phase16polish-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 8px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.02);font-size:11px}
    #phase16PolishDashRoot .phase16polish-catalogList{display:grid;gap:6px;max-height:280px;overflow:auto;padding-right:2px}
    #phase16PolishDashRoot .phase16polish-catalogRow{display:grid;grid-template-columns:auto minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:8px;border:1px solid rgba(255,255,255,.05);border-radius:10px;background:rgba(255,255,255,.01)}
    #phase16PolishDashRoot .phase16polish-catalogStar{width:28px;height:28px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.02);color:inherit;cursor:pointer}
    #phase16PolishDashRoot .phase16polish-catalogStar.is-on{border-color:rgba(255,214,64,.45)}
    #phase16PolishDashRoot .phase16polish-catalogMain{min-width:0}
    #phase16PolishDashRoot .phase16polish-catalogName{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #phase16PolishDashRoot .phase16polish-catalogMeta{font-size:10px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #phase16PolishDashRoot .phase16polish-catalogEmpty{font-size:11px;opacity:.72;padding:6px 2px}
    #phase16PolishDashRoot .phase16polish-targetflash{animation:phase16PolishFlash 1200ms ease}
    @keyframes phase16PolishFlash{0%{box-shadow:0 0 0 0 rgba(102,178,255,.0)}25%{box-shadow:0 0 0 2px rgba(102,178,255,.45)}100%{box-shadow:0 0 0 0 rgba(102,178,255,.0)}}
    @media (max-width:1100px){ #phase16PolishDashRoot .phase16polish-grid{grid-template-columns:1fr} }
  `;
  document.head.appendChild(st);
}

function phase16PolishWrapRenderDashboard_(){
  if(typeof renderDashboard !== 'function' || renderDashboard._phase16PolishWrapped) return;
  const _orig = renderDashboard;
  renderDashboard = function(){
    const r = _orig.apply(this, arguments);
    try{ phase16PolishSchedule_(); }catch{}
    return r;
  };
  renderDashboard._phase16PolishWrapped = true;
}

function phase16PolishWrapSwitchTab_(){
  if(typeof switchTab !== 'function' || switchTab._phase16PolishWrapped) return;
  const _orig = switchTab;
  switchTab = function(tabId){
    const r = _orig.apply(this, arguments);
    if(['dashboard','advanced-panels'].includes(String(tabId||''))) setTimeout(()=>{ try{ phase16PolishSchedule_(); }catch{} }, 20);
    return r;
  };
  switchTab._phase16PolishWrapped = true;
}

function phase16PolishSchedule_(){
  if(typeof requestAnimationFrame !== 'function') return phase16PolishApplyDashboardCleanup_();
  if(phase16PolishState_.raf){ try{ cancelAnimationFrame(phase16PolishState_.raf); }catch{} }
  phase16PolishState_.raf = requestAnimationFrame(()=>{
    phase16PolishState_.raf = 0;
    try{ phase16PolishApplyDashboardCleanup_(); }catch(err){ console.warn('Phase16 polish cleanup failed', err); }
  });
}

function phase16PolishLoadPrefs_(){
  let raw = null;
  try{ raw = JSON.parse(localStorage.getItem(PHASE16_POLISH_KEY) || '{}') || {}; }catch{ raw = {}; }
  if(!raw || typeof raw !== 'object') raw = {};
  if(!raw.catalogFavorites || typeof raw.catalogFavorites !== 'object') raw.catalogFavorites = {};
  return raw;
}
function phase16PolishSavePrefs_(prefs){
  try{ localStorage.setItem(PHASE16_POLISH_KEY, JSON.stringify(prefs || {})); }catch{}
}
function phase16PolishPersistDetails_(root){
  if(!root || root._phase16PolishBound) return;
  root._phase16PolishBound = true;
  root.addEventListener('toggle', (e)=>{
    const d = e.target;
    if(!(d && d.matches && d.matches('details.phase16polish-group[data-key]'))) return;
    const prefs = phase16PolishLoadPrefs_();
    prefs[d.dataset.key] = !!d.open;
    phase16PolishSavePrefs_(prefs);
    const badge = d.querySelector('.phase16polish-badge');
    const body = d.querySelector('.phase16polish-body');
    if(badge && body) badge.textContent = String(body.children.length || 0);
  }, true);
}


function phase16PolishGetCatalogItems_(root){
  if(!root) return [];
  const out = [];
  root.querySelectorAll('details.phase16polish-group').forEach(group => {
    const body = group.querySelector('.phase16polish-body');
    if(!body) return;
    const groupLabel = (group.querySelector('summary > span')?.textContent || group.dataset.key || 'Group').trim();
    Array.from(body.children || []).forEach((el, idx) => {
      if(!el || !el.id) return;
      const rawTitle = (
        el.getAttribute('data-panel-title') ||
        el.querySelector('.card__title, .phase16-title, .phase15-title, .phase14-title, .phase13-title, .phase12-title, .phase11-title, .phase10-title, .phase9-title, .phase8-title, h2, h3, h4, .item__title')?.textContent ||
        el.getAttribute('aria-label') ||
        el.id
      );
      const title = String(rawTitle || el.id).replace(/\s+/g,' ').trim();
      out.push({ id: el.id, title, groupKey: String(group.dataset.key || ''), groupLabel, index: idx, el });
    });
  });
  return out;
}


function phase16PolishEnsureSidebarNavDropdown_(navBtn){
  if(!navBtn || !navBtn.parentElement) return null;
  let wrap = navBtn.parentElement.querySelector('#phase16PolishSidebarNavDropdown');
  if(!wrap){
    wrap = document.createElement('div');
    wrap.id = 'phase16PolishSidebarNavDropdown';
    wrap.className = 'phase16polish-navDropdown is-hidden';
    wrap.innerHTML = `
      <div class="phase16polish-navDropdownLabel">Advanced Panel Dropdown</div>
      <select id="phase16PolishSidebarNavSelect" class="phase16polish-navDropdownSelect" title="Advanced panel navigation">
        <option value="">Loading advanced panels…</option>
      </select>
      <button class="btn btn--ghost" type="button" id="phase16PolishSidebarNavOpen">Open Selected Panel</button>
      <div class="phase16polish-navDropdownHint" id="phase16PolishSidebarNavHint">Categorized dropdown from the Advanced Panels workspace.</div>
    `;
    navBtn.insertAdjacentElement('afterend', wrap);
  }
  if(!wrap._phase16PolishSidebarBound){
    const sel = wrap.querySelector('#phase16PolishSidebarNavSelect');
    const btn = wrap.querySelector('#phase16PolishSidebarNavOpen');
    const openSelected = ()=>{
      const panelId = String(sel?.value || '');
      if(!panelId) return;
      const root = document.querySelector('#phase16PolishDashRoot');
      if(root){
        try{ phase16PolishOpenCatalogItem_(root, panelId); }catch{}
      }else{
        try{ switchTab('advanced-panels'); }catch{}
        setTimeout(()=>{ try{ phase16PolishSchedule_(); }catch{} }, 30);
      }
    };
    sel?.addEventListener('change', openSelected);
    btn?.addEventListener('click', openSelected);
    wrap._phase16PolishSidebarBound = true;
  }
  return wrap;
}

function phase16PolishRenderSidebarNavDropdown_(){
  const wrap = document.querySelector('#phase16PolishSidebarNavDropdown');
  if(wrap) wrap.remove();
}

function phase16PolishBindCatalog_(root){
  if(!root || root._phase16PolishCatalogBound) return;
  root._phase16PolishCatalogBound = true;
  const searchEl = root.querySelector('#phase16PolishCatalogSearch');
  const clearBtn = root.querySelector('#phase16PolishCatalogClear');
  const categoryEl = root.querySelector('#phase16PolishCatalogCategory');
  const jumpEl = root.querySelector('#phase16PolishCatalogJump');
  const openSelectedBtn = root.querySelector('#phase16PolishCatalogOpenSelected');
  if(searchEl){
    searchEl.addEventListener('input', ()=>{ try{ phase16PolishRenderCatalog_(root); }catch{} });
    searchEl.addEventListener('keydown', (e)=>{
      if(e.key === 'Escape'){
        searchEl.value = '';
        try{ phase16PolishRenderCatalog_(root); }catch{}
      }
    });
  }
  clearBtn?.addEventListener('click', ()=>{
    if(searchEl) searchEl.value = '';
    try{ phase16PolishRenderCatalog_(root); }catch{}
  });
  categoryEl?.addEventListener('change', ()=>{ try{ phase16PolishRenderCatalog_(root); }catch{} });
  openSelectedBtn?.addEventListener('click', ()=>{
    const panelId = String(jumpEl?.value || '');
    if(panelId) try{ phase16PolishOpenCatalogItem_(root, panelId); }catch{}
  });
  jumpEl?.addEventListener('change', ()=>{
    const panelId = String(jumpEl.value || '');
    if(panelId) try{ phase16PolishOpenCatalogItem_(root, panelId); }catch{}
  });
  root.addEventListener('click', (e)=>{
    const favBtn = e.target && e.target.closest ? e.target.closest('[data-phase16-fav]') : null;
    if(favBtn){
      const panelId = String(favBtn.getAttribute('data-phase16-fav') || '');
      if(!panelId) return;
      const prefs = phase16PolishLoadPrefs_();
      prefs.catalogFavorites = prefs.catalogFavorites || {};
      if(prefs.catalogFavorites[panelId]) delete prefs.catalogFavorites[panelId];
      else prefs.catalogFavorites[panelId] = 1;
      phase16PolishSavePrefs_(prefs);
      try{ phase16PolishRenderCatalog_(root); }catch{}
      return;
    }
    const openBtn = e.target && e.target.closest ? e.target.closest('[data-phase16-open]') : null;
    if(openBtn){
      const panelId = String(openBtn.getAttribute('data-phase16-open') || '');
      if(panelId) try{ phase16PolishOpenCatalogItem_(root, panelId); }catch{}
      return;
    }
    const chipBtn = e.target && e.target.closest ? e.target.closest('[data-phase16-openchip]') : null;
    if(chipBtn){
      const panelId = String(chipBtn.getAttribute('data-phase16-openchip') || '');
      if(panelId) try{ phase16PolishOpenCatalogItem_(root, panelId); }catch{}
    }
  });
}

function phase16PolishOpenCatalogItem_(root, panelId){
  const target = document.querySelector('#'+panelId);
  if(!target) return;
  const group = target.closest('details.phase16polish-group');
  if(group) group.open = true;
  try{ switchTab('advanced-panels'); }catch{}
  setTimeout(()=>{
    try{ target.classList.add('phase16polish-targetflash'); }catch{}
    try{ target.scrollIntoView({ behavior:'smooth', block:'start' }); }catch{}
    setTimeout(()=>{ try{ target.classList.remove('phase16polish-targetflash'); }catch{} }, 1300);
  }, 30);
}


function phase16PolishApplyCategoryFilter_(root, categoryKey){
  if(!root) return;
  const selected = String(categoryKey || 'all');
  root.querySelectorAll('details.phase16polish-group').forEach(d => {
    const body = d.querySelector('.phase16polish-body');
    const count = body ? body.children.length : 0;
    const matches = (selected === 'all') || (String(d.dataset.key || '') === selected);
    d.style.display = (count && matches) ? '' : 'none';
  });
}

function phase16PolishRenderCatalog_(root){
  if(!root) return;
  const listEl = root.querySelector('#phase16PolishCatalogList');
  const favsEl = root.querySelector('#phase16PolishCatalogFavs');
  const searchEl = root.querySelector('#phase16PolishCatalogSearch');
  const categoryEl = root.querySelector('#phase16PolishCatalogCategory');
  const jumpEl = root.querySelector('#phase16PolishCatalogJump');
  const jumpHintEl = root.querySelector('#phase16PolishCatalogJumpHint');
  if(!listEl || !favsEl) return;

  const q = String(searchEl?.value || '').trim().toLowerCase();
  const selectedCategory = String(categoryEl?.value || 'all');
  const prefs = phase16PolishLoadPrefs_();
  const favMap = (prefs && prefs.catalogFavorites && typeof prefs.catalogFavorites === 'object') ? prefs.catalogFavorites : {};
  const items = phase16PolishGetCatalogItems_(root)
    .sort((a,b)=>{
      const af = favMap[a.id] ? 1 : 0;
      const bf = favMap[b.id] ? 1 : 0;
      if(af !== bf) return bf - af;
      if(a.groupLabel !== b.groupLabel) return a.groupLabel.localeCompare(b.groupLabel);
      return a.index - b.index;
    });

  const categoryFiltered = selectedCategory === 'all' ? items : items.filter(it => String(it.groupKey || '') === selectedCategory);
  const filtered = q ? categoryFiltered.filter(it => (`${it.title} ${it.groupLabel} ${it.id}`).toLowerCase().includes(q)) : categoryFiltered;
  const favoriteItems = items.filter(it => !!favMap[it.id]);

  favsEl.innerHTML = favoriteItems.map(it => `
    <button type="button" class="phase16polish-chip" data-phase16-openchip="${escapeHtml(it.id)}" title="Open ${escapeHtml(it.title)}">
      <span>★</span><span>${escapeHtml(it.title)}</span>
    </button>
  `).join('');

  if(jumpEl){
    const jumpSource = filtered.length ? filtered : categoryFiltered;
    const prevJump = String(jumpEl.value || '');
    const grouped = new Map();
    jumpSource.forEach(it => {
      const k = String(it.groupLabel || 'Other');
      if(!grouped.has(k)) grouped.set(k, []);
      grouped.get(k).push(it);
    });
    let optionsHtml = '<option value="">Select a panel from dropdown…</option>';
    Array.from(grouped.entries()).forEach(([groupLabel, arr]) => {
      optionsHtml += `<optgroup label="${escapeHtml(groupLabel)}">` + arr.map(it => `<option value="${escapeHtml(it.id)}">${escapeHtml(it.title)} (#${escapeHtml(it.id)})</option>`).join('') + `</optgroup>`;
    });
    jumpEl.innerHTML = optionsHtml;
    if(prevJump && Array.from(jumpEl.options || []).some(opt => String(opt.value || '') === prevJump)) jumpEl.value = prevJump;
    if(jumpHintEl){
      const total = jumpSource.length;
      const catLabel = selectedCategory === 'all' ? 'all categories' : selectedCategory;
      jumpHintEl.textContent = total ? `Dropdown shows ${total} panel${total===1?'':'s'} (${catLabel}${q ? ', search filtered' : ''}).` : `No panels available for ${catLabel}${q ? ' with current search' : ''}.`;
    }
  }
  try{ phase16PolishApplyCategoryFilter_(root, selectedCategory); }catch{}

  if(!filtered.length){
    listEl.innerHTML = '<div class="phase16polish-catalogEmpty">No panels match the current category / search filter.</div>';
    return;
  }

  listEl.innerHTML = filtered.map(it => {
    const isFav = !!favMap[it.id];
    return `
      <div class="phase16polish-catalogRow" data-panel-id="${escapeHtml(it.id)}">
        <button type="button" class="phase16polish-catalogStar ${isFav ? 'is-on' : ''}" data-phase16-fav="${escapeHtml(it.id)}" title="${isFav ? 'Remove favorite' : 'Add favorite'}">${isFav ? '★' : '☆'}</button>
        <div class="phase16polish-catalogMain">
          <div class="phase16polish-catalogName">${escapeHtml(it.title)}</div>
          <div class="phase16polish-catalogMeta">${escapeHtml(it.groupLabel)} • #${escapeHtml(it.id)}</div>
        </div>
        <span class="badge">${escapeHtml(it.groupKey.toUpperCase() || 'GROUP')}</span>
        <button type="button" class="btn btn--ghost" data-phase16-open="${escapeHtml(it.id)}">Open</button>
      </div>
    `;
  }).join('');
}

function phase16PolishEnsureDashboardRoot_(tab){
  const mountTab = document.querySelector('#tab-advanced-panels') || tab;
  let root = mountTab.querySelector('#phase16PolishDashRoot');
  if(!root){
    root = document.createElement('div');
    root.id = 'phase16PolishDashRoot';
    root.innerHTML = `
      <div class="phase16polish-head">
        <div>
          <div class="phase16polish-title">Advanced Panels Workspace</div>
          <div class="phase16polish-sub">Grouped phase panels for cleaner navigation. Completion / Active Project / Hotlist cards stay compact above.</div>
        </div>
        <div class="phase16polish-actions">
          <button class="btn btn--ghost" type="button" id="phase16PolishBtnExpandAll">Expand All</button>
          <button class="btn btn--ghost" type="button" id="phase16PolishBtnCollapseAll">Collapse All</button>
        </div>
      </div>
      <div class="phase16polish-catalog">
        <div class="phase16polish-catalogHead">
          <div>
            <div class="phase16polish-catalogTitle">Workspace Catalog & Favorites</div>
            <div class="phase16polish-catalogSub">Search advanced panels, open them quickly, and pin favorites for one-click access.</div>
          </div>
        </div>
        <div class="phase16polish-catalogTools">
          <select class="phase16polish-catalogSelect" id="phase16PolishCatalogCategory" title="Filter by category">
            <option value="all">All Categories</option>
            <option value="ops">Ops & Alerts</option>
            <option value="automation">Automation & Review</option>
            <option value="approval">Approvals & Team</option>
            <option value="reports">Reports & Export Tools</option>
          </select>
          <input class="phase16polish-catalogSearch" type="search" id="phase16PolishCatalogSearch" placeholder="Search panel name, group, or panel id..." />
          <button class="btn btn--ghost" type="button" id="phase16PolishCatalogClear">Clear</button>
        </div>
        <div class="phase16polish-catalogJumpWrap">
          <select class="phase16polish-catalogJump" id="phase16PolishCatalogJump" title="Open panel from dropdown">
            <option value="">Select a panel from dropdown…</option>
          </select>
          <button class="btn btn--ghost" type="button" id="phase16PolishCatalogOpenSelected">Open Selected</button>
        </div>
        <div class="phase16polish-catalogHint" id="phase16PolishCatalogJumpHint">Choose a category or search to narrow panels.</div>
        <div class="phase16polish-favs" id="phase16PolishCatalogFavs"></div>
        <div class="phase16polish-catalogList" id="phase16PolishCatalogList"></div>
      </div>
      <div class="phase16polish-grid">
        <details class="phase16polish-group" data-key="ops" open>
          <summary><span>Ops & Alerts</span><span class="phase16polish-badge">0</span></summary>
          <div class="phase16polish-body" id="phase16PolishGroupOps"></div>
        </details>
        <details class="phase16polish-group" data-key="automation" open>
          <summary><span>Automation & Review</span><span class="phase16polish-badge">0</span></summary>
          <div class="phase16polish-body" id="phase16PolishGroupAutomation"></div>
        </details>
        <details class="phase16polish-group" data-key="approval" open>
          <summary><span>Approvals & Team</span><span class="phase16polish-badge">0</span></summary>
          <div class="phase16polish-body" id="phase16PolishGroupApproval"></div>
        </details>
        <details class="phase16polish-group" data-key="reports">
          <summary><span>Reports & Export Tools</span><span class="phase16polish-badge">0</span></summary>
          <div class="phase16polish-body" id="phase16PolishGroupReports"></div>
        </details>
      </div>
    `;
    const directKids = Array.from(mountTab.children || []);
    const firstPhaseHost = directKids.find(el => el && el.id && /^phase(8|9|10|11|12|13|14|15|16)/.test(el.id));
    if(firstPhaseHost) mountTab.insertBefore(root, firstPhaseHost);
    else mountTab.appendChild(root);
    root.querySelector('#phase16PolishBtnExpandAll')?.addEventListener('click', ()=>{
      root.querySelectorAll('details.phase16polish-group').forEach(d => d.open = true);
    });
    root.querySelector('#phase16PolishBtnCollapseAll')?.addEventListener('click', ()=>{
      root.querySelectorAll('details.phase16polish-group').forEach(d => d.open = false);
    });
  }
  const prefs = phase16PolishLoadPrefs_();
  root.querySelectorAll('details.phase16polish-group[data-key]').forEach(d => {
    if(Object.prototype.hasOwnProperty.call(prefs, d.dataset.key)) d.open = !!prefs[d.dataset.key];
  });
  phase16PolishPersistDetails_(root);
  phase16PolishBindCatalog_(root);
  return root;
}

function phase16PolishAppendIfNeeded_(el, target){
  if(!el || !target) return;
  if(el === target || target.contains(el)) return;
  target.appendChild(el);
}

function phase16PolishEnsureDashboardFocusCard_(dashboardTab, root){
  if(!dashboardTab) return;
  const hostGrid = dashboardTab.querySelector('.grid.grid--2');
  if(!hostGrid) return;
  let card = dashboardTab.querySelector('#phase16DashboardFocusCard');
  if(!card){
    card = document.createElement('div');
    card.className = 'card';
    card.id = 'phase16DashboardFocusCard';
    hostGrid.insertBefore(card, hostGrid.firstElementChild || null);
  }

  const countIn = (sel) => {
    const body = root ? root.querySelector(sel) : null;
    return body ? Array.from(body.children || []).filter(x => x && x.id).length : 0;
  };
  const opsCount = countIn('#phase16PolishGroupOps');
  const autoCount = countIn('#phase16PolishGroupAutomation');
  const approvalCount = countIn('#phase16PolishGroupApproval');
  const reportCount = countIn('#phase16PolishGroupReports');
  const total = opsCount + autoCount + approvalCount + reportCount;
  const hasPortfolio = !!document.querySelector('.nav .nav__item[data-tab="portfolio"]');

  card.innerHTML = `
    <div class="card__top">
      <div>
        <div class="card__label">Dashboard Focus Mode</div>
        <div class="phase16polish-focusTitle">Core signal stays here, advanced tools are grouped separately.</div>
        <div class="phase16polish-focusMeta">Completion, Active Project, Hotlist, Milestones, and Recent Activity remain on Dashboard. Workload, capacity, automation, approvals, and export/report panels are routed to Advanced Panels.</div>
      </div>
      <div class="phase16polish-focusActions">
        <button class="btn btn--ghost" type="button" id="phase16DashboardFocusOpenAdvanced">Open Advanced Panels</button>
        <button class="btn btn--ghost ${hasPortfolio ? '' : 'phase16polish-hidden'}" type="button" id="phase16DashboardFocusOpenPortfolio">Open Portfolio</button>
      </div>
    </div>
    <div class="phase16polish-focusWrap">
      <div class="phase16polish-focusStats">
        <div class="phase16polish-focusStat"><b>${total}</b><span>Advanced Panels</span></div>
        <div class="phase16polish-focusStat"><b>${opsCount}</b><span>Ops & Alerts</span></div>
        <div class="phase16polish-focusStat"><b>${autoCount + approvalCount}</b><span>Automation + Team</span></div>
        <div class="phase16polish-focusStat"><b>${reportCount}</b><span>Reports / Export</span></div>
      </div>
      <div class="phase16polish-focusHint">Tip: use the Tools menu (topbar) for quick actions, and Advanced Panels for heavier workflows.</div>
    </div>
  `;

  const btnAdv = card.querySelector('#phase16DashboardFocusOpenAdvanced');
  const btnPortfolio = card.querySelector('#phase16DashboardFocusOpenPortfolio');
  if(btnAdv && !btnAdv._phase16FocusBound){
    btnAdv.addEventListener('click', ()=>{
      try{ switchTab('advanced-panels'); }catch{}
      setTimeout(()=>{ try{ phase16PolishSchedule_(); }catch{} }, 30);
    });
    btnAdv._phase16FocusBound = true;
  }
  if(btnPortfolio && !btnPortfolio._phase16FocusBound){
    btnPortfolio.addEventListener('click', ()=>{ try{ switchTab('portfolio'); }catch{} });
    btnPortfolio._phase16FocusBound = true;
  }
}

function phase16PolishApplyDashboardCleanup_(){
  const dashboardTab = document.querySelector('#tab-dashboard');
  const advancedTab = document.querySelector('#tab-advanced-panels');
  const hostTab = advancedTab || dashboardTab;
  if(!hostTab) return;
  const root = phase16PolishEnsureDashboardRoot_(hostTab);
  const gOps = root.querySelector('#phase16PolishGroupOps');
  const gAuto = root.querySelector('#phase16PolishGroupAutomation');
  const gApproval = root.querySelector('#phase16PolishGroupApproval');
  const gReports = root.querySelector('#phase16PolishGroupReports');
  if(!gOps || !gAuto || !gApproval || !gReports) return;

  // Move known dashboard phase hosts into grouped workspace.
  const groups = {
    ops: ['phase6DashWorkload','phase7CapacityPanel','phase8DashboardHost','phase9DashboardHost','phase11DashboardHost','phase12DashboardHost'],
    automation: ['phase10DashboardHost','phase13DashboardHost'],
    approval: ['phase14ApprovalQueuePanel','phase15RbacPanel','phase16TeamPanel'],
    reports: []
  };
  groups.ops.forEach(id => phase16PolishAppendIfNeeded_(document.querySelector('#'+id), gOps));
  groups.automation.forEach(id => phase16PolishAppendIfNeeded_(document.querySelector('#'+id), gAuto));
  groups.approval.forEach(id => phase16PolishAppendIfNeeded_(document.querySelector('#'+id), gApproval));

  // If team panel was incorrectly mounted inside base Completion card, force it into Approvals & Team group.
  const teamPanel = document.querySelector('#phase16TeamPanel');
  if(teamPanel) phase16PolishAppendIfNeeded_(teamPanel, gApproval);

  const sourceTabs = [dashboardTab, advancedTab].filter(Boolean);

  // Move any remaining direct-child phase hosts into reports/misc group so workspace stays tidy.
  sourceTabs.forEach(tab => {
    Array.from(tab.children || []).forEach(el => {
      if(!el || el === root) return;
      const id = String(el.id || '');
      if(!/^phase(6|7|8|9|10|11|12|13|14|15|16)/.test(id)) return;
      if(root.contains(el)) return;
      phase16PolishAppendIfNeeded_(el, gReports);
    });
  });

  // Also catch phase panels nested inside base cards (common additive patch placement issue).
  sourceTabs.forEach(tab => {
    Array.from(tab.querySelectorAll('.card > [id^="phase"]')).forEach(el => {
      if(root.contains(el)) return;
      const id = String(el.id || '');
      if(id === 'phase16TeamPanel' || id === 'phase15RbacPanel' || id === 'phase14ApprovalQueuePanel') phase16PolishAppendIfNeeded_(el, gApproval);
      else if(id === 'phase10DashboardHost' || id === 'phase13DashboardHost') phase16PolishAppendIfNeeded_(el, gAuto);
      else if(/^phase(6|7)/.test(id)) phase16PolishAppendIfNeeded_(el, gOps);
      else phase16PolishAppendIfNeeded_(el, gOps);
    });
  });

  // Keep badge counts current and hide empty groups.
  root.querySelectorAll('details.phase16polish-group').forEach(d => {
    const body = d.querySelector('.phase16polish-body');
    const badge = d.querySelector('.phase16polish-badge');
    const count = body ? body.children.length : 0;
    if(badge) badge.textContent = String(count);
    d.style.display = count ? '' : 'none';
  });
  try{ phase16PolishEnsureDashboardFocusCard_(dashboardTab, root); }catch(err){ console.warn('Phase16 dashboard focus card failed', err); }
  try{ phase16PolishRenderCatalog_(root); }catch{}
  try{ phase16PolishRenderSidebarNavDropdown_(); }catch{}
}

try{ initPhase16Polish_(); }catch(err){ console.warn('Phase16 polish init failed', err); }


/* ---------------------------
   Phase 17 — Portfolio / Multi-Project Command View
---------------------------- */
const PHASE17_PORTFOLIO_KEY = "stark_pm_phase17_portfolio_v1";
const phase17PortfolioState_ = {
  inited: false,
  renderWrapped: false,
  switchWrapped: false,
  bound: false,
  query: "",
  status: "all",
  sort: "risk",
};

function initPhase17Portfolio_(){
  if(phase17PortfolioState_.inited) return;
  phase17PortfolioState_.inited = true;
  try{ phase17PortfolioLoadUiState_(); }catch{}
  try{ phase17PortfolioEnsureStyles_(); }catch(err){ console.warn('Phase17 portfolio styles failed', err); }
  try{ phase17PortfolioEnsureTab_(); }catch(err){ console.warn('Phase17 portfolio tab failed', err); }
  try{ phase17PortfolioWrapRenderAll_(); }catch(err){ console.warn('Phase17 portfolio render wrap failed', err); }
  try{ phase17PortfolioWrapSwitchTab_(); }catch(err){ console.warn('Phase17 portfolio tab wrap failed', err); }
  try{ phase17PortfolioScheduleRender_(); }catch{}
}

function phase17PortfolioLoadUiState_(){
  let raw = {};
  try{ raw = JSON.parse(localStorage.getItem(PHASE17_PORTFOLIO_KEY) || '{}') || {}; }catch{ raw = {}; }
  if(!raw || typeof raw !== 'object') raw = {};
  phase17PortfolioState_.query = String(raw.query || '');
  phase17PortfolioState_.status = String(raw.status || 'all');
  phase17PortfolioState_.sort = String(raw.sort || 'risk');
}

function phase17PortfolioSaveUiState_(){
  try{
    localStorage.setItem(PHASE17_PORTFOLIO_KEY, JSON.stringify({
      query: String(phase17PortfolioState_.query || ''),
      status: String(phase17PortfolioState_.status || 'all'),
      sort: String(phase17PortfolioState_.sort || 'risk'),
    }));
  }catch{}
}

function phase17PortfolioEnsureStyles_(){
  if(document.querySelector('#phase17PortfolioStyles')) return;
  const style = document.createElement('style');
  style.id = 'phase17PortfolioStyles';
  style.textContent = `
    #tab-portfolio .phase17-portfolio-wrap{display:grid;gap:12px}
    #tab-portfolio .phase17-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px}
    #tab-portfolio .phase17-kpi{padding:10px;border:1px solid rgba(255,255,255,.07);border-radius:12px;background:rgba(255,255,255,.015)}
    #tab-portfolio .phase17-kpi__label{font-size:11px;opacity:.72;letter-spacing:.06em;text-transform:uppercase}
    #tab-portfolio .phase17-kpi__value{margin-top:4px;font-size:20px;font-weight:700;line-height:1.1}
    #tab-portfolio .phase17-kpi__sub{margin-top:4px;font-size:11px;opacity:.72}
    #tab-portfolio .phase17-controls{display:grid;grid-template-columns:minmax(220px,1fr) auto auto auto;gap:8px;align-items:end}
    #tab-portfolio .phase17-controls .field{margin:0}
    #tab-portfolio .phase17-input,#tab-portfolio .phase17-select{width:100%;padding:8px 10px;border-radius:10px;border:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.18);color:inherit}
    #tab-portfolio .phase17-grid{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(280px,.9fr);gap:12px;align-items:start}
    #tab-portfolio .phase17-list{display:grid;gap:8px;max-height:65vh;overflow:auto;padding-right:2px}
    #tab-portfolio .phase17-row{display:grid;grid-template-columns:minmax(170px,1.25fr) auto auto auto auto auto auto;gap:8px;align-items:center;padding:10px;border:1px solid rgba(255,255,255,.06);border-radius:12px;background:rgba(255,255,255,.012)}
    #tab-portfolio .phase17-row.is-active{border-color:rgba(102,178,255,.28);box-shadow:0 0 0 1px rgba(102,178,255,.16) inset}
    #tab-portfolio .phase17-rowHead{display:flex;flex-direction:column;min-width:0}
    #tab-portfolio .phase17-rowTitle{font-weight:700;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #tab-portfolio .phase17-rowMeta{font-size:11px;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #tab-portfolio .phase17-rowStat{display:flex;flex-direction:column;align-items:flex-end;min-width:72px}
    #tab-portfolio .phase17-rowStat b{font-size:13px;line-height:1.1}
    #tab-portfolio .phase17-rowStat span{font-size:10px;opacity:.72;text-transform:uppercase;letter-spacing:.05em}
    #tab-portfolio .phase17-risk{font-weight:700}
    #tab-portfolio .phase17-risk.is-good{color:var(--ok)}
    #tab-portfolio .phase17-risk.is-mid{color:var(--warn)}
    #tab-portfolio .phase17-risk.is-bad{color:var(--danger)}
    #tab-portfolio .phase17-pillset{display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end}
    #tab-portfolio .phase17-pill{font-size:10px;padding:3px 6px;border-radius:999px;border:1px solid rgba(255,255,255,.10);background:rgba(255,255,255,.02)}
    #tab-portfolio .phase17-bar{width:100%;height:6px;border-radius:999px;background:rgba(255,255,255,.06);overflow:hidden;margin-top:6px}
    #tab-portfolio .phase17-bar > i{display:block;height:100%;background:linear-gradient(90deg, rgba(102,178,255,.55), rgba(102,178,255,.95));width:0%}
    #tab-portfolio .phase17-sideCard{display:grid;gap:8px}
    #tab-portfolio .phase17-sideList{display:grid;gap:8px}
    #tab-portfolio .phase17-sideItem{padding:8px;border:1px solid rgba(255,255,255,.06);border-radius:10px;background:rgba(255,255,255,.01)}
    #tab-portfolio .phase17-sideItemTitle{font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    #tab-portfolio .phase17-sideItemMeta{font-size:10px;opacity:.72;margin-top:3px}
    #tab-portfolio .phase17-sideItemRow{display:flex;justify-content:space-between;gap:8px;align-items:center;margin-top:6px}
    #tab-portfolio .phase17-empty{padding:12px;border:1px dashed rgba(255,255,255,.12);border-radius:12px;font-size:12px;opacity:.8}
    #tab-portfolio .phase17-rowActions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
    #tab-portfolio .phase17-btn{padding:6px 8px;border-radius:8px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.02);color:inherit;cursor:pointer;font-size:11px}
    #tab-portfolio .phase17-btn:hover{background:rgba(255,255,255,.05)}
    /* Milestone 3: portfolio rhythm alignment */
    #tab-portfolio .phase17-portfolio-wrap{gap:14px}
    #tab-portfolio .phase17-summary{gap:12px}
    #tab-portfolio .phase17-kpi{padding:12px;border-radius:14px}
    #tab-portfolio .phase17-kpi__label{font-size:10px;line-height:1.2}
    #tab-portfolio .phase17-kpi__value{margin-top:6px;font-size:18px;line-height:1.15}
    #tab-portfolio .phase17-kpi__sub{font-size:11px;line-height:1.35}
    #tab-portfolio .phase17-controls{gap:10px}
    #tab-portfolio .phase17-grid{gap:14px}
    #tab-portfolio .phase17-list{gap:10px}
    #tab-portfolio .phase17-row{gap:10px;padding:12px;border-radius:14px}
    #tab-portfolio .phase17-rowTitle{font-size:13px;line-height:1.25}
    #tab-portfolio .phase17-rowMeta{font-size:11px;line-height:1.35}
    #tab-portfolio .phase17-rowStat b{font-size:12px}
    #tab-portfolio .phase17-sideCard, #tab-portfolio .phase17-sideList{gap:10px}
    #tab-portfolio .phase17-sideItem{padding:10px;border-radius:12px}
    #tab-portfolio .phase17-sideItemMeta{font-size:11px;line-height:1.35}
    #tab-portfolio .phase17-btn{padding:6px 10px;border-radius:9px}
    @media (max-width:1300px){ #tab-portfolio .phase17-row{grid-template-columns:minmax(170px,1.2fr) auto auto auto auto auto; } #tab-portfolio .phase17-rowActions{grid-column:1/-1;justify-content:flex-start;} }
    @media (max-width:1100px){ #tab-portfolio .phase17-summary{grid-template-columns:repeat(2,minmax(0,1fr));} #tab-portfolio .phase17-controls{grid-template-columns:1fr 1fr;align-items:end} #tab-portfolio .phase17-grid{grid-template-columns:1fr} #tab-portfolio .phase17-row{grid-template-columns:1fr 1fr;align-items:start} #tab-portfolio .phase17-rowStat{align-items:flex-start} #tab-portfolio .phase17-pillset{justify-content:flex-start} }
  `;
  document.head.appendChild(style);
}

function phase17PortfolioEnsureTab_(){
  const sidebarNav = document.querySelector('.nav');
  const dashBtn = sidebarNav && sidebarNav.querySelector('.nav__item[data-tab="dashboard"]');
  const advBtn = sidebarNav && sidebarNav.querySelector('.nav__item[data-tab="advanced-panels"]');
  const dashboardTab = document.querySelector('#tab-dashboard');
  if(!sidebarNav || !dashboardTab || !dashboardTab.parentElement) return;

  let navBtn = sidebarNav.querySelector('.nav__item[data-tab="portfolio"]');
  if(!navBtn){
    navBtn = document.createElement('button');
    navBtn.type = 'button';
    navBtn.className = 'nav__item';
    navBtn.dataset.tab = 'portfolio';
    navBtn.innerHTML = '<span class="nav__icon">▤</span><span class="nav__text">Portfolio</span>';
    if(advBtn && advBtn.parentElement) advBtn.insertAdjacentElement('beforebegin', navBtn);
    else if(dashBtn && dashBtn.parentElement) dashBtn.insertAdjacentElement('afterend', navBtn);
    else sidebarNav.appendChild(navBtn);
  }

  let panel = document.querySelector('#tab-portfolio');
  if(!panel){
    panel = document.createElement('section');
    panel.className = 'tab';
    panel.id = 'tab-portfolio';
    panel.dataset.tab = 'portfolio';
    panel.innerHTML = `
      <div class="tab__header">
        <div class="tab__title">Portfolio</div>
        <div class="tab__subtitle">Multi-project command view: health, risk, workload, and quick navigation across projects.</div>
      </div>
      <div id="phase17PortfolioRoot"></div>
    `;
    const advPanel = document.querySelector('#tab-advanced-panels');
    if(advPanel && advPanel.parentElement) advPanel.insertAdjacentElement('beforebegin', panel);
    else dashboardTab.insertAdjacentElement('afterend', panel);
  }

  if(ui && Array.isArray(ui.tabs) && !ui.tabs.some(x => x && x.dataset && x.dataset.tab === 'portfolio')){
    let insertIndex = ui.tabs.findIndex(x => x && x.dataset && x.dataset.tab === 'advanced-panels');
    if(insertIndex < 0) insertIndex = 1;
    ui.tabs.splice(insertIndex, 0, navBtn);
  }
  if(ui && Array.isArray(ui.tabPanels) && !ui.tabPanels.some(x => x && x.dataset && x.dataset.tab === 'portfolio')){
    let insertIndex = ui.tabPanels.findIndex(x => x && x.dataset && x.dataset.tab === 'advanced-panels');
    if(insertIndex < 0) insertIndex = 1;
    ui.tabPanels.splice(insertIndex, 0, panel);
  }

  if(!navBtn._phase17PortfolioBound){
    navBtn.addEventListener('click', ()=> switchTab('portfolio'));
    navBtn._phase17PortfolioBound = true;
  }

  if(!phase17PortfolioState_.bound){
    panel.addEventListener('input', (e)=> phase17PortfolioHandleUiInput_(e));
    panel.addEventListener('change', (e)=> phase17PortfolioHandleUiInput_(e));
    panel.addEventListener('click', (e)=> phase17PortfolioHandleClick_(e));
    phase17PortfolioState_.bound = true;
  }
}

function phase17PortfolioHandleUiInput_(e){
  const t = e && e.target;
  if(!t || !t.id) return;
  if(t.id === 'phase17PortfolioSearch') phase17PortfolioState_.query = String(t.value || '');
  if(t.id === 'phase17PortfolioStatus') phase17PortfolioState_.status = String(t.value || 'all');
  if(t.id === 'phase17PortfolioSort') phase17PortfolioState_.sort = String(t.value || 'risk');
  phase17PortfolioSaveUiState_();
  phase17PortfolioRender_();
}

function phase17PortfolioHandleClick_(e){
  const btn = e && e.target && e.target.closest ? e.target.closest('[data-phase17-action]') : null;
  if(!btn) return;
  const action = String(btn.getAttribute('data-phase17-action') || '');
  const projectId = String(btn.getAttribute('data-project-id') || '');
  if(!projectId) return;
  if(action === 'focus'){
    try{ setActiveProject(projectId); }catch{}
    try{ switchTab('dashboard'); }catch{}
    return;
  }
  if(action === 'open-project'){
    try{ setActiveProject(projectId); }catch{}
    try{ switchTab('projects'); }catch{}
    return;
  }
  if(action === 'open-checklist'){
    try{ setActiveProject(projectId); }catch{}
    try{ switchTab('checklist'); }catch{}
    return;
  }
}

function phase17PortfolioWrapRenderAll_(){
  if(phase17PortfolioState_.renderWrapped) return;
  if(typeof renderAll !== 'function') return;
  const _orig = renderAll;
  renderAll = function(){
    const r = _orig.apply(this, arguments);
    try{ phase17PortfolioRender_(); }catch{}
    return r;
  };
  phase17PortfolioState_.renderWrapped = true;
}

function phase17PortfolioWrapSwitchTab_(){
  if(phase17PortfolioState_.switchWrapped) return;
  if(typeof switchTab !== 'function') return;
  const _orig = switchTab;
  switchTab = function(tabId){
    const r = _orig.apply(this, arguments);
    if(String(tabId||'') === 'portfolio') setTimeout(()=>{ try{ phase17PortfolioRender_(); }catch{} }, 25);
    return r;
  };
  phase17PortfolioState_.switchWrapped = true;
}

function phase17PortfolioScheduleRender_(){
  setTimeout(()=>{ try{ phase17PortfolioEnsureTab_(); phase17PortfolioRender_(); }catch{} }, 40);
}

function phase17PortfolioFmtDate_(ts){
  const n = Number(ts || 0);
  if(!Number.isFinite(n) || n <= 0) return '—';
  try{ return new Date(n).toLocaleDateString([], { year:'numeric', month:'short', day:'2-digit' }); }catch{ return '—'; }
}

function phase17PortfolioRiskClass_(score){
  if(score >= 75) return 'is-good';
  if(score >= 45) return 'is-mid';
  return 'is-bad';
}

function phase17PortfolioRiskLabel_(score){
  if(score >= 75) return 'Healthy';
  if(score >= 45) return 'Watch';
  return 'At Risk';
}

function phase17PortfolioCollectRows_(){
  const now = Date.now();
  const rows = [];
  const upcomingTasks = [];
  for(const p of (Array.isArray(state?.projects) ? state.projects : [])){
    const mods = Array.isArray(p?.modules) ? p.modules : [];
    let modules = mods.length;
    let milestones = 0;
    let tasks = 0;
    let done = 0;
    let blockerOpen = 0;
    let highOpen = 0;
    let overdue = 0;
    let nextDueTs = 0;
    let nextDueTaskTitle = '';
    let nextMilestoneTitle = '';
    let assignees = new Set();

    for(const mod of mods){
      const msList = Array.isArray(mod?.milestones) ? mod.milestones : [];
      milestones += msList.length;
      for(const m of msList){
        const tsList = Array.isArray(m?.tasks) ? m.tasks : [];
        for(const t of tsList){
          if(!t) continue;
          tasks++;
          if(t.done) done++;
          const sev = String(t.severity || 'normal');
          if(!t.done && sev === 'blocker') blockerOpen++;
          if(!t.done && sev === 'high') highOpen++;
          if(String(t.assignee || '').trim()) assignees.add(String(t.assignee).trim().toLowerCase());
          const dueAt = Number(t.dueAt || 0);
          if(!t.done && Number.isFinite(dueAt) && dueAt > 0){
            if(dueAt < now) overdue++;
            if(!nextDueTs || dueAt < nextDueTs){
              nextDueTs = dueAt;
              nextDueTaskTitle = String(t.title || 'Untitled Task');
              nextMilestoneTitle = String(m.title || 'Milestone');
            }
            upcomingTasks.push({ p, m, t, dueAt });
          }
        }
      }
    }

    // fallback legacy model support
    if(!mods.length && Array.isArray(p?.milestones)){
      milestones = p.milestones.length;
      for(const m of p.milestones){
        const tsList = Array.isArray(m?.tasks) ? m.tasks : [];
        for(const t of tsList){
          if(!t) continue;
          tasks++;
          if(t.done) done++;
          const sev = String(t.severity || 'normal');
          if(!t.done && sev === 'blocker') blockerOpen++;
          if(!t.done && sev === 'high') highOpen++;
          if(String(t.assignee || '').trim()) assignees.add(String(t.assignee).trim().toLowerCase());
          const dueAt = Number(t.dueAt || 0);
          if(!t.done && Number.isFinite(dueAt) && dueAt > 0){
            if(dueAt < now) overdue++;
            if(!nextDueTs || dueAt < nextDueTs){
              nextDueTs = dueAt;
              nextDueTaskTitle = String(t.title || 'Untitled Task');
              nextMilestoneTitle = String(m.title || 'Milestone');
            }
            upcomingTasks.push({ p, m, t, dueAt });
          }
        }
      }
    }

    const pct = tasks ? (done / tasks) * 100 : 0;
    const status = String(p?.status || 'active');
    const archived = !!p?.archived;
    let risk = 100;
    risk -= Math.max(0, blockerOpen) * 22;
    risk -= Math.max(0, highOpen) * 8;
    risk -= Math.max(0, overdue) * 14;
    risk -= Math.round((100 - pct) * 0.35);
    if(status === 'paused') risk -= 8;
    if(status === 'done' && pct >= 99) risk = 98;
    risk = Math.max(0, Math.min(100, risk));

    rows.push({
      id: String(p.id || ''),
      name: String(p.name || 'Untitled Project'),
      tag: String(p.tag || ''),
      status,
      archived,
      modules,
      milestones,
      tasks,
      done,
      pct,
      blockerOpen,
      highOpen,
      overdue,
      risk,
      assigneeCount: assignees.size,
      nextDueTs,
      nextDueTaskTitle,
      nextMilestoneTitle,
      project: p,
    });
  }

  upcomingTasks.sort((a,b)=> a.dueAt - b.dueAt);
  return { rows, upcomingTasks };
}

function phase17PortfolioRender_(){
  const panel = document.querySelector('#tab-portfolio');
  const root = panel && panel.querySelector('#phase17PortfolioRoot');
  if(!panel || !root) return;

  const data = phase17PortfolioCollectRows_();
  let rows = data.rows.slice();
  const q = String(phase17PortfolioState_.query || '').trim().toLowerCase();
  const statusFilter = String(phase17PortfolioState_.status || 'all');
  const sortBy = String(phase17PortfolioState_.sort || 'risk');

  if(statusFilter !== 'all') rows = rows.filter(r => String(r.status) === statusFilter);
  if(q){
    rows = rows.filter(r => (`${r.name} ${r.tag} ${r.status}`).toLowerCase().includes(q));
  }

  rows.sort((a,b)=>{
    if(sortBy === 'name') return a.name.localeCompare(b.name);
    if(sortBy === 'progress') return (b.pct - a.pct) || a.name.localeCompare(b.name);
    if(sortBy === 'due'){
      const ax = a.nextDueTs || Number.MAX_SAFE_INTEGER;
      const bx = b.nextDueTs || Number.MAX_SAFE_INTEGER;
      return (ax - bx) || a.name.localeCompare(b.name);
    }
    if(sortBy === 'tasks') return (b.tasks - a.tasks) || a.name.localeCompare(b.name);
    // default risk: most risky first
    return (a.risk - b.risk) || (b.overdue - a.overdue) || a.name.localeCompare(b.name);
  });

  const total = data.rows.length;
  const activeCount = data.rows.filter(r => r.status === 'active' && !r.archived).length;
  const pausedCount = data.rows.filter(r => r.status === 'paused').length;
  const doneCount = data.rows.filter(r => r.status === 'done').length;
  const atRiskCount = data.rows.filter(r => r.risk < 45 && r.status !== 'done').length;
  const totalTasks = data.rows.reduce((n,r)=> n + r.tasks, 0);
  const totalDone = data.rows.reduce((n,r)=> n + r.done, 0);
  const totalOverdue = data.rows.reduce((n,r)=> n + r.overdue, 0);
  const totalBlockers = data.rows.reduce((n,r)=> n + r.blockerOpen, 0);
  const avgRisk = total ? Math.round(data.rows.reduce((n,r)=> n + r.risk, 0) / total) : 0;
  const avgProgress = totalTasks ? ((totalDone / totalTasks) * 100) : 0;
  const activeId = String(state?.activeProjectId || '');

  const riskQueue = data.rows
    .filter(r => r.status !== 'done')
    .slice()
    .sort((a,b)=> (a.risk - b.risk) || (b.overdue - a.overdue) || (b.blockerOpen - a.blockerOpen))
    .slice(0, 8);

  const dueQueue = data.upcomingTasks
    .filter(x => !x.t.done)
    .slice(0, 10);

  root.innerHTML = `
    <div class="phase17-portfolio-wrap">
      <div class="card">
        <div class="card__label">Portfolio Summary</div>
        <div class="phase17-summary">
          <div class="phase17-kpi">
            <div class="phase17-kpi__label">Projects</div>
            <div class="phase17-kpi__value">${escapeHtml(String(total))}</div>
            <div class="phase17-kpi__sub">${escapeHtml(String(activeCount))} active • ${escapeHtml(String(pausedCount))} paused • ${escapeHtml(String(doneCount))} done</div>
          </div>
          <div class="phase17-kpi">
            <div class="phase17-kpi__label">Portfolio Progress</div>
            <div class="phase17-kpi__value">${escapeHtml(fmtPct(avgProgress))}</div>
            <div class="phase17-kpi__sub">${escapeHtml(String(totalDone))} / ${escapeHtml(String(totalTasks))} tasks complete</div>
          </div>
          <div class="phase17-kpi">
            <div class="phase17-kpi__label">At Risk</div>
            <div class="phase17-kpi__value">${escapeHtml(String(atRiskCount))}</div>
            <div class="phase17-kpi__sub">${escapeHtml(String(totalBlockers))} blocker task(s) open</div>
          </div>
          <div class="phase17-kpi">
            <div class="phase17-kpi__label">Overdue Tasks</div>
            <div class="phase17-kpi__value">${escapeHtml(String(totalOverdue))}</div>
            <div class="phase17-kpi__sub">Across all visible projects</div>
          </div>
          <div class="phase17-kpi">
            <div class="phase17-kpi__label">Avg Health</div>
            <div class="phase17-kpi__value phase17-risk ${phase17PortfolioRiskClass_(avgRisk)}">${escapeHtml(String(avgRisk))}</div>
            <div class="phase17-kpi__sub">${escapeHtml(phase17PortfolioRiskLabel_(avgRisk))} portfolio signal</div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__top">
          <div>
            <div class="card__label">Command Filters</div>
            <div class="card__hint">Search and sort the portfolio table, then jump into a project workflow.</div>
          </div>
        </div>
        <div class="phase17-controls">
          <label class="field">
            <span class="field__label">Search</span>
            <input id="phase17PortfolioSearch" class="phase17-input" type="search" placeholder="Search project, tag, status..." value="${escapeHtml(String(phase17PortfolioState_.query || ''))}" />
          </label>
          <label class="field">
            <span class="field__label">Status</span>
            <select id="phase17PortfolioStatus" class="phase17-select">
              <option value="all" ${statusFilter==='all'?'selected':''}>All</option>
              <option value="active" ${statusFilter==='active'?'selected':''}>Active</option>
              <option value="paused" ${statusFilter==='paused'?'selected':''}>Paused</option>
              <option value="done" ${statusFilter==='done'?'selected':''}>Done</option>
            </select>
          </label>
          <label class="field">
            <span class="field__label">Sort</span>
            <select id="phase17PortfolioSort" class="phase17-select">
              <option value="risk" ${sortBy==='risk'?'selected':''}>Risk (worst first)</option>
              <option value="due" ${sortBy==='due'?'selected':''}>Next due date</option>
              <option value="progress" ${sortBy==='progress'?'selected':''}>Progress %</option>
              <option value="tasks" ${sortBy==='tasks'?'selected':''}>Task count</option>
              <option value="name" ${sortBy==='name'?'selected':''}>Project name</option>
            </select>
          </label>
          <div class="row row--actions" style="justify-content:flex-end;gap:6px">
            <button type="button" class="btn btn--ghost" id="phase17PortfolioClearFilters">Clear Filters</button>
          </div>
        </div>
      </div>

      <div class="phase17-grid">
        <div class="card">
          <div class="card__top">
            <div>
              <div class="card__label">Project Command Grid</div>
              <div class="card__hint">Health, progress, overdue load, and quick actions per project.</div>
            </div>
            <div class="badge">${escapeHtml(String(rows.length))} visible</div>
          </div>
          <div class="phase17-list">
            ${rows.length ? rows.map(r => {
              const pct = Math.max(0, Math.min(100, r.pct || 0));
              const riskClass = phase17PortfolioRiskClass_(r.risk);
              const riskLabel = phase17PortfolioRiskLabel_(r.risk);
              const statusBadge = String(r.status || 'active').toUpperCase();
              return `
                <div class="phase17-row ${activeId === r.id ? 'is-active' : ''}" data-project-id="${escapeHtml(r.id)}">
                  <div class="phase17-rowHead">
                    <div class="phase17-rowTitle">${escapeHtml(r.name)}</div>
                    <div class="phase17-rowMeta">${r.tag ? escapeHtml(r.tag) + ' • ' : ''}${escapeHtml(statusBadge)}${r.archived ? ' • ARCHIVED' : ''}</div>
                    <div class="phase17-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>
                  </div>
                  <div class="phase17-rowStat"><b>${escapeHtml(fmtPct(pct))}</b><span>Progress</span></div>
                  <div class="phase17-rowStat"><b>${escapeHtml(String(r.done))}/${escapeHtml(String(r.tasks))}</b><span>Tasks</span></div>
                  <div class="phase17-rowStat"><b>${escapeHtml(String(r.modules))}/${escapeHtml(String(r.milestones))}</b><span>Mod/MS</span></div>
                  <div class="phase17-rowStat"><b>${escapeHtml(String(r.overdue))}</b><span>Overdue</span></div>
                  <div class="phase17-rowStat"><b class="phase17-risk ${riskClass}">${escapeHtml(String(r.risk))}</b><span>${escapeHtml(riskLabel)}</span></div>
                  <div>
                    <div class="phase17-pillset">
                      <span class="phase17-pill">Blocker ${escapeHtml(String(r.blockerOpen))}</span>
                      <span class="phase17-pill">High ${escapeHtml(String(r.highOpen))}</span>
                      <span class="phase17-pill">Team ${escapeHtml(String(r.assigneeCount))}</span>
                      <span class="phase17-pill">Next Due ${escapeHtml(phase17PortfolioFmtDate_(r.nextDueTs))}</span>
                    </div>
                    <div class="phase17-rowActions" style="margin-top:6px">
                      <button type="button" class="phase17-btn" data-phase17-action="focus" data-project-id="${escapeHtml(r.id)}">Focus Dashboard</button>
                      <button type="button" class="phase17-btn" data-phase17-action="open-project" data-project-id="${escapeHtml(r.id)}">Open Project</button>
                      <button type="button" class="phase17-btn" data-phase17-action="open-checklist" data-project-id="${escapeHtml(r.id)}">Open Checklist</button>
                    </div>
                  </div>
                </div>
              `;
            }).join('') : `<div class="phase17-empty">No projects match your current filters. Try clearing filters or create/import a project.</div>`}
          </div>
        </div>

        <div class="phase17-sideCard">
          <div class="card">
            <div class="card__label">Risk Queue</div>
            <div class="phase17-sideList">
              ${riskQueue.length ? riskQueue.map(r => `
                <div class="phase17-sideItem">
                  <div class="phase17-sideItemTitle">${escapeHtml(r.name)}</div>
                  <div class="phase17-sideItemMeta">${escapeHtml(String(r.status || 'active').toUpperCase())} • ${escapeHtml(fmtPct(r.pct || 0))} complete</div>
                  <div class="phase17-sideItemRow">
                    <div class="phase17-pillset" style="justify-content:flex-start">
                      <span class="phase17-pill">Overdue ${escapeHtml(String(r.overdue))}</span>
                      <span class="phase17-pill">Blocker ${escapeHtml(String(r.blockerOpen))}</span>
                    </div>
                    <button type="button" class="phase17-btn" data-phase17-action="open-project" data-project-id="${escapeHtml(r.id)}">Open</button>
                  </div>
                </div>
              `).join('') : `<div class="phase17-empty">Risk queue is clear. Add more projects/tasks or due dates to surface risk signals.</div>`}
            </div>
          </div>

          <div class="card">
            <div class="card__label">Upcoming Due Tasks</div>
            <div class="phase17-sideList">
              ${dueQueue.length ? dueQueue.map(x => `
                <div class="phase17-sideItem">
                  <div class="phase17-sideItemTitle">${escapeHtml(String(x.t?.title || 'Untitled Task'))}</div>
                  <div class="phase17-sideItemMeta">${escapeHtml(String(x.p?.name || 'Project'))} • ${escapeHtml(String(x.m?.title || 'Milestone'))}</div>
                  <div class="phase17-sideItemRow">
                    <span class="badge">${escapeHtml(phase17PortfolioFmtDate_(x.dueAt))}</span>
                    <button type="button" class="phase17-btn" data-phase17-action="open-checklist" data-project-id="${escapeHtml(String(x.p?.id || ''))}">Open</button>
                  </div>
                </div>
              `).join('') : `<div class="phase17-empty">No due dates detected yet. Use task due dates to enable timeline visibility here.</div>`}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  const clearBtn = root.querySelector('#phase17PortfolioClearFilters');
  if(clearBtn && !clearBtn._phase17Bound){
    clearBtn.addEventListener('click', ()=>{
      phase17PortfolioState_.query = '';
      phase17PortfolioState_.status = 'all';
      phase17PortfolioState_.sort = 'risk';
      phase17PortfolioSaveUiState_();
      phase17PortfolioRender_();
    });
    clearBtn._phase17Bound = true;
  }
}

try{ initPhase17Portfolio_(); }catch(err){ console.warn('Phase17 portfolio init failed', err); }

/* ---------------------------
   Phase 18 — Basic / Advanced Mode Toggle (Milestone 4)
   - Default mode is Basic on first load
   - Advanced mode reveals Portfolio + Advanced Panels tabs
   - Mode toggle is kept visible in topbar and mirrored on Dashboard Focus card
---------------------------- */
const PHASE18_UI_MODE_KEY = "stark_pm_ui_mode_v1";
const phase18UiModeState_ = {
  inited: false,
  mode: "basic",
  renderWrapped: false,
  switchWrapped: false,
  timer: 0,
};

function initPhase18UiMode_(){
  if(phase18UiModeState_.inited) return;
  phase18UiModeState_.inited = true;
  try{ phase18UiModeLoad_(); }catch{}
  try{ phase18UiModeEnsureStyles_(); }catch(err){ console.warn('Phase18 UI mode styles failed', err); }
  try{ phase18UiModeWrapSwitchTab_(); }catch(err){ console.warn('Phase18 UI mode switch wrap failed', err); }
  try{ phase18UiModeWrapRenderAll_(); }catch(err){ console.warn('Phase18 UI mode render wrap failed', err); }
  try{ phase18UiModeApply_({ force:true }); }catch(err){ console.warn('Phase18 UI mode apply failed', err); }
  setTimeout(()=>{ try{ phase18UiModeApply_({ force:true }); }catch{} }, 80);
}

function phase18UiModeLoad_(){
  let raw = '';
  try{ raw = String(localStorage.getItem(PHASE18_UI_MODE_KEY) || ''); }catch{ raw = ''; }
  phase18UiModeState_.mode = (raw === 'advanced') ? 'advanced' : 'basic';
}

function phase18UiModeSave_(){
  try{ localStorage.setItem(PHASE18_UI_MODE_KEY, phase18UiModeState_.mode === 'advanced' ? 'advanced' : 'basic'); }catch{}
}

function phase18UiModeIsAdvanced_(){
  return phase18UiModeState_.mode === 'advanced';
}

function phase18UiModeEnsureStyles_(){
  if(document.querySelector('#phase18UiModeStyles')) return;
  const st = document.createElement('style');
  st.id = 'phase18UiModeStyles';
  st.textContent = `
    .phase18uimode-hidden{display:none !important}
    #btnUiMode{min-width:126px;justify-content:center}
    #phase18DashboardModeNote{font-size:11px;opacity:.82;line-height:1.35}
  `;
  document.head.appendChild(st);
}

function phase18UiModeRenderTopbarButton_(){
  const btn = document.getElementById('btnUiMode');
  if(!btn) return;
  const isAdv = phase18UiModeIsAdvanced_();
  btn.textContent = isAdv ? 'Mode: Advanced' : 'Mode: Basic';
  btn.title = isAdv
    ? 'Advanced mode is ON (Portfolio + Advanced Panels visible). Click to switch to Basic mode.'
    : 'Basic mode is ON (core PM workflow only). Click to enable Advanced mode.';
  btn.setAttribute('aria-pressed', isAdv ? 'true' : 'false');
}

function phase18UiModeEnsureTopbarButton_(){
  const topbarRight = document.querySelector('.topbar__right');
  if(!topbarRight) return;

  let btn = document.getElementById('btnUiMode');
  if(!btn){
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn--ghost';
    btn.id = 'btnUiMode';
    const anchor = document.getElementById('btnUndo') || topbarRight.querySelector('.topbar-menu') || null;
    if(anchor && anchor.parentElement === topbarRight) topbarRight.insertBefore(btn, anchor);
    else topbarRight.appendChild(btn);
  }

  if(!btn._phase18UiModeBound){
    btn.addEventListener('click', ()=> phase18UiModeToggle_());
    btn._phase18UiModeBound = true;
  }

  phase18UiModeRenderTopbarButton_();

  try{ initTopbarDeclutter_(); }catch{}
  try{
    if(topbarRight._topbarDeclutterSync) topbarRight._topbarDeclutterSync();
  }catch{}
}

function phase18UiModeSetTabVisibility_(tabId, visible){
  const navBtn = document.querySelector(`.nav .nav__item[data-tab="${tabId}"]`);
  const panel = document.querySelector(`.tab[data-tab="${tabId}"]`);
  [navBtn, panel].forEach(el => {
    if(!el) return;
    el.classList.toggle('phase18uimode-hidden', !visible);
    if(visible){
      el.style.display = '';
      if(el === navBtn) el.removeAttribute('aria-hidden');
    }else{
      el.style.display = 'none';
      el.setAttribute('aria-hidden', 'true');
    }
  });
}

function phase18UiModeDecorateDashboardFocusCard_(){
  const card = document.querySelector('#phase16DashboardFocusCard');
  if(!card) return;

  const actions = card.querySelector('.phase16polish-focusActions');
  if(actions){
    let toggleBtn = card.querySelector('#phase18DashboardModeToggle');
    if(!toggleBtn){
      toggleBtn = document.createElement('button');
      toggleBtn.type = 'button';
      toggleBtn.className = 'btn btn--ghost';
      toggleBtn.id = 'phase18DashboardModeToggle';
      actions.insertBefore(toggleBtn, actions.firstChild || null);
    }
    if(!toggleBtn._phase18UiModeBound){
      toggleBtn.addEventListener('click', ()=> phase18UiModeToggle_());
      toggleBtn._phase18UiModeBound = true;
    }
    toggleBtn.textContent = phase18UiModeIsAdvanced_() ? 'Switch to Basic Mode' : 'Enable Advanced Mode';

    const advBtn = card.querySelector('#phase16DashboardFocusOpenAdvanced');
    const portBtn = card.querySelector('#phase16DashboardFocusOpenPortfolio');
    [advBtn, portBtn].forEach(el => {
      if(!el) return;
      el.classList.toggle('phase16polish-hidden', !phase18UiModeIsAdvanced_());
      el.disabled = !phase18UiModeIsAdvanced_();
    });
  }

  const wrap = card.querySelector('.phase16polish-focusWrap') || card;
  let note = card.querySelector('#phase18DashboardModeNote');
  if(!note){
    note = document.createElement('div');
    note.id = 'phase18DashboardModeNote';
    wrap.appendChild(note);
  }
  note.textContent = phase18UiModeIsAdvanced_()
    ? 'Advanced mode is enabled. Portfolio and Advanced Panels are visible in the sidebar.'
    : 'Basic mode is enabled. Portfolio and Advanced Panels are hidden to keep the workflow focused.';
}

function phase18UiModeScheduleApply_(){
  if(phase18UiModeState_.timer){
    try{ clearTimeout(phase18UiModeState_.timer); }catch{}
  }
  phase18UiModeState_.timer = setTimeout(() => {
    phase18UiModeState_.timer = 0;
    try{ phase18UiModeApply_(); }catch(err){ console.warn('Phase18 UI mode scheduled apply failed', err); }
  }, 45);
}

function phase18UiModeApply_(opts){
  const force = !!(opts && opts.force);
  const isAdv = phase18UiModeIsAdvanced_();

  try{ phase18UiModeEnsureTopbarButton_(); }catch{}
  phase18UiModeSetTabVisibility_('advanced-panels', isAdv);
  phase18UiModeSetTabVisibility_('portfolio', isAdv);
  try{ phase18UiModeDecorateDashboardFocusCard_(); }catch{}

  const activeTab = document.querySelector('.tab.is-active')?.dataset?.tab || '';
  if(!isAdv && (activeTab === 'advanced-panels' || activeTab === 'portfolio')){
    try{ switchTab('dashboard'); }catch{}
    return;
  }

  if(force){
    const hiddenNavActive = document.querySelector('.nav .nav__item.is-active.phase18uimode-hidden');
    if(hiddenNavActive){
      try{ switchTab('dashboard'); }catch{}
    }
  }
}

function phase18UiModeSetMode_(nextMode){
  const normalized = (String(nextMode || '').toLowerCase() === 'advanced') ? 'advanced' : 'basic';
  if(phase18UiModeState_.mode === normalized){
    try{ phase18UiModeApply_(); }catch{}
    return;
  }
  phase18UiModeState_.mode = normalized;
  phase18UiModeSave_();
  try{ phase18UiModeApply_({ force:true }); }catch{}
  try{
    if(typeof addActivity === 'function'){
      addActivity(`UI mode: ${normalized === 'advanced' ? 'Advanced' : 'Basic'}`);
    }
  }catch{}
}

function phase18UiModeToggle_(){
  phase18UiModeSetMode_(phase18UiModeIsAdvanced_() ? 'basic' : 'advanced');
}

function phase18UiModeWrapSwitchTab_(){
  if(phase18UiModeState_.switchWrapped) return;
  if(typeof switchTab !== 'function') return;
  const _orig = switchTab;
  switchTab = function(tabId){
    const nextTab = String(tabId || '');
    if(!phase18UiModeIsAdvanced_() && (nextTab === 'advanced-panels' || nextTab === 'portfolio')){
      phase18UiModeScheduleApply_();
      return _orig.call(this, 'dashboard');
    }
    const r = _orig.apply(this, arguments);
    phase18UiModeScheduleApply_();
    return r;
  };
  phase18UiModeState_.switchWrapped = true;
}

function phase18UiModeWrapRenderAll_(){
  if(phase18UiModeState_.renderWrapped) return;
  if(typeof renderAll !== 'function') return;
  const _orig = renderAll;
  renderAll = function(){
    const r = _orig.apply(this, arguments);
    phase18UiModeScheduleApply_();
    return r;
  };
  phase18UiModeState_.renderWrapped = true;
}

try{ initPhase18UiMode_(); }catch(err){ console.warn('Phase18 UI mode init failed', err); }

/* ---------------------------
   Phase 19 — Render Hook Registry Stabilizer (Milestone 5)
   - Central post-render hook registry for Dashboard + Checklist
   - Keeps future UI cleanup hooks out of render wrapper chains
   - Registers late UI cleanup schedulers via the registry
---------------------------- */
const phase19RenderHookState_ = {
  inited: false,
  wrapped: { dashboard:false, checklist:false },
  surfaces: { dashboard: new Map(), checklist: new Map() },
  baseFns: { dashboard: null, checklist: null }
};

function initPhase19RenderHookStabilizer_(){
  if(phase19RenderHookState_.inited) return;
  phase19RenderHookState_.inited = true;

  try{ phase19RenderHookExposeApi_(); }catch(err){ console.warn('Phase19 render hook API failed', err); }
  try{ phase19RenderHookWrapSurface_('dashboard'); }catch(err){ console.warn('Phase19 dashboard wrap failed', err); }
  try{ phase19RenderHookWrapSurface_('checklist'); }catch(err){ console.warn('Phase19 checklist wrap failed', err); }

  // Register known late-phase UI cleanup tasks so they run through one registry.
  try{
    if(typeof phase16PolishSchedule_ === 'function'){
      phase19PostRenderRegister_('dashboard', 'phase16-polish-cleanup', ()=>{ try{ phase16PolishSchedule_(); }catch{} }, { order: 60 });
    }
  }catch(err){ console.warn('Phase19 register phase16 hook failed', err); }

  try{
    if(typeof phase18UiModeScheduleApply_ === 'function'){
      const applyMode = ()=>{ try{ phase18UiModeScheduleApply_(); }catch{} };
      phase19PostRenderRegister_('dashboard', 'phase18-ui-mode', applyMode, { order: 80 });
      phase19PostRenderRegister_('checklist', 'phase18-ui-mode', applyMode, { order: 80 });
    }
  }catch(err){ console.warn('Phase19 register phase18 hook failed', err); }
}

function phase19RenderHookSurfaceFnName_(surface){
  return surface === 'dashboard' ? 'renderDashboard' : (surface === 'checklist' ? 'renderChecklist' : '');
}

function phase19RenderHookExposeApi_(){
  const api = window.StarkPMPostRenderHooks || {};
  api.version = 'phase19';
  api.register = phase19PostRenderRegister_;
  api.unregister = phase19PostRenderUnregister_;
  api.list = phase19PostRenderList_;
  api.run = phase19PostRenderRun_;
  window.StarkPMPostRenderHooks = api;
}

function phase19PostRenderRegister_(surface, key, fn, opts){
  const surf = String(surface || '').toLowerCase();
  if(!(surf in phase19RenderHookState_.surfaces)) return false;
  if(typeof fn !== 'function') return false;
  const id = String(key || `hook_${Date.now()}_${Math.random().toString(36).slice(2,7)}`);
  const order = Number((opts && opts.order) ?? 100);
  phase19RenderHookState_.surfaces[surf].set(id, {
    key: id,
    fn,
    order: Number.isFinite(order) ? order : 100,
    enabled: (opts && opts.enabled === false) ? false : true
  });
  return true;
}

function phase19PostRenderUnregister_(surface, key){
  const surf = String(surface || '').toLowerCase();
  const id = String(key || '');
  const map = phase19RenderHookState_.surfaces[surf];
  if(!map) return false;
  return map.delete(id);
}

function phase19PostRenderList_(surface){
  const surf = String(surface || '').toLowerCase();
  const map = phase19RenderHookState_.surfaces[surf];
  if(!map) return [];
  return Array.from(map.values())
    .map(h => ({ key:h.key, order:h.order, enabled:!!h.enabled }))
    .sort((a,b)=> (a.order - b.order) || String(a.key).localeCompare(String(b.key)));
}

function phase19PostRenderRun_(surface, ctx){
  const surf = String(surface || '').toLowerCase();
  const map = phase19RenderHookState_.surfaces[surf];
  if(!map || !map.size) return;
  const list = Array.from(map.values())
    .filter(h => h && h.enabled !== false && typeof h.fn === 'function')
    .sort((a,b)=> (a.order - b.order) || String(a.key).localeCompare(String(b.key)));
  for(const hook of list){
    try{ hook.fn(ctx || {}); }
    catch(err){ console.warn(`Phase19 post-render hook failed (${surf}:${hook.key})`, err); }
  }
}

function phase19RenderHookWrapSurface_(surface){
  const surf = String(surface || '').toLowerCase();
  if(!(surf in phase19RenderHookState_.wrapped)) return;
  if(phase19RenderHookState_.wrapped[surf]) return;

  const fnName = phase19RenderHookSurfaceFnName_(surf);
  if(!fnName || typeof window[fnName] !== 'function') return;

  const currentFn = window[fnName];
  if(currentFn && currentFn._phase19PostRenderWrapper){
    phase19RenderHookState_.wrapped[surf] = true;
    return;
  }

  phase19RenderHookState_.baseFns[surf] = currentFn;

  const wrappedFn = function(){
    const result = currentFn.apply(this, arguments);
    try{
      phase19PostRenderRun_(surf, {
        surface: surf,
        args: Array.from(arguments || []),
        result,
        activeTab: document.querySelector('.tab.is-active')?.dataset?.tab || ''
      });
    }catch(err){
      console.warn(`Phase19 post-render runner failed (${surf})`, err);
    }
    return result;
  };
  wrappedFn._phase19PostRenderWrapper = true;
  wrappedFn._phase19PostRenderSurface = surf;
  wrappedFn._phase19PostRenderBase = currentFn;

  window[fnName] = wrappedFn;
  phase19RenderHookState_.wrapped[surf] = true;
}

try{ initPhase19RenderHookStabilizer_(); }catch(err){ console.warn('Phase19 render hook stabilizer init failed', err); }



/* ---------------------------
   Phase 20 — Advanced Panels Category Tabs Split (Milestone 6)
   - Keep only Workspace Catalog & Favorites in "Advanced Panels"
   - Move category groups into dedicated sidebar tabs
---------------------------- */
const phase20AdvSplitState_ = {
  inited:false,
  timer:0,
  wrappedSwitch:false,
  wrappedPhase18Apply:false,
  wrappedPhase16Apply:false,
  navCollapsed:true,
  tabDefs: [
    { key:'ops', tabId:'advanced-ops-alerts', panelId:'tab-advanced-ops-alerts', hostId:'phase20AdvSplitHostOps', icon:'⚙', navText:'Ops & Alerts', title:'Ops & Alerts', subtitle:'Operational monitoring, workload, capacity, and alert-related advanced panels.' },
    { key:'automation', tabId:'advanced-automation-review', panelId:'tab-advanced-automation-review', hostId:'phase20AdvSplitHostAutomation', icon:'⟳', navText:'Automation & Review', title:'Automation & Review', subtitle:'Automation, review workflows, and follow-up orchestration panels.' },
    { key:'approval', tabId:'advanced-approvals-team', panelId:'tab-advanced-approvals-team', hostId:'phase20AdvSplitHostApproval', icon:'👥', navText:'Approvals & Team', title:'Approvals & Team', subtitle:'Approval queues, RBAC controls, and team management panels.' },
    { key:'reports', tabId:'advanced-reports-export', panelId:'tab-advanced-reports-export', hostId:'phase20AdvSplitHostReports', icon:'⇪', navText:'Reports & Export', title:'Reports & Export Tools', subtitle:'Reporting, exports, and any overflow tools routed out of Dashboard.' }
  ]
};

function initPhase20AdvancedSplitTabs_(){
  if(phase20AdvSplitState_.inited) return;
  phase20AdvSplitState_.inited = true;
  try{ phase20AdvSplitEnsureStyles_(); }catch(err){ console.warn('Phase20 split styles failed', err); }
  try{ phase20AdvSplitEnsureTabs_(); }catch(err){ console.warn('Phase20 split tabs ensure failed', err); }
  try{ phase20AdvSplitPatchCatalogFns_(); }catch(err){ console.warn('Phase20 split catalog patch failed', err); }
  try{ phase20AdvSplitPatchPhase16Cleanup_(); }catch(err){ console.warn('Phase20 split phase16 patch failed', err); }
  try{ phase20AdvSplitPatchUiMode_(); }catch(err){ console.warn('Phase20 split phase18 patch failed', err); }
  try{ phase20AdvSplitWrapSwitchTab_(); }catch(err){ console.warn('Phase20 split switchTab wrap failed', err); }
  try{ phase20AdvSplitRegisterHooks_(); }catch(err){ console.warn('Phase20 split hook register failed', err); }
  try{ phase20AdvSplitSchedule_(); }catch{}
  setTimeout(()=>{ try{ phase20AdvSplitSchedule_(); }catch{} }, 120);
}

function phase20AdvSplitDefs_(){
  return Array.isArray(phase20AdvSplitState_.tabDefs) ? phase20AdvSplitState_.tabDefs : [];
}

function phase20AdvSplitKeyToTabId_(key){
  const def = phase20AdvSplitDefs_().find(d => d.key === String(key||''));
  return def ? def.tabId : 'advanced-panels';
}

function phase20AdvSplitEnsureStyles_(){
  if(document.querySelector('#phase20AdvSplitStyles')) return;
  const st = document.createElement('style');
  st.id = 'phase20AdvSplitStyles';
  st.textContent = `
    #phase16PolishDashRoot.phase20advsplit-catalogonly .phase16polish-actions{display:none !important}
    #phase16PolishDashRoot.phase20advsplit-catalogonly .phase16polish-grid{display:none !important}
    #phase16PolishDashRoot.phase20advsplit-catalogonly .phase16polish-sub{max-width:780px}
    .phase20advsplit-wrap{display:grid;gap:12px}
    .phase20advsplit-host > details.phase16polish-group{margin:0}
    .phase20advsplit-host > details.phase16polish-group:only-child{display:block !important}
    .phase20advsplit-host .phase16polish-body{padding:12px}
    .phase20advsplit-empty{font-size:11px;opacity:.72;padding:6px 0}

    /* Sidebar visual grouping: nest advanced category tabs under Advanced Panels */
    .phase20advsplit-navgroup{display:grid;gap:8px}
    .phase20advsplit-navgroup > .nav__item[data-tab="advanced-panels"]{position:relative;padding-right:30px}
    .phase20advsplit-navgroup > .nav__item[data-tab="advanced-panels"]::before{
      content:"▾";
      position:absolute;
      right:10px;
      top:50%;
      transform:translateY(-50%);
      font-size:11px;
      line-height:1;
      opacity:.72;
      transition:transform .18s ease, opacity .18s ease;
      pointer-events:none;
      background:none;
    }
    .phase20advsplit-navgroup.is-collapsed > .nav__item[data-tab="advanced-panels"]::before{
      transform:translateY(-50%) rotate(-90deg);
      opacity:.9;
    }
    .phase20advsplit-navsub{
      display:grid;
      gap:8px;
      margin-top:-2px;
      margin-left:10px;
      padding:10px 10px 10px 12px;
      border-radius:12px;
      background:linear-gradient(180deg, rgba(10,18,28,0.18), rgba(10,18,28,0.08));
      border:1px solid rgba(56,246,255,0.07);
      border-left-color: rgba(56,246,255,0.16);
      box-shadow: inset 0 0 0 1px rgba(155,92,255,0.03);
      position:relative;
    }
    .phase20advsplit-navgroup.is-collapsed .phase20advsplit-navsub{display:none !important}
    .phase20advsplit-navsub::before{
      content:"";
      position:absolute;
      left:8px;
      top:10px;
      bottom:10px;
      width:1px;
      background:linear-gradient(180deg, rgba(56,246,255,0.16), rgba(155,92,255,0.08));
      opacity:.9;
      pointer-events:none;
    }
    .phase20advsplit-navchild{
      margin-left:0;
      padding:10px 11px;
      border-radius:10px;
      background:rgba(10,18,28,0.18);
      border-color:rgba(56,246,255,0.08);
    }
    .phase20advsplit-navchild .nav__text{font-size:11px; letter-spacing:0.07em}
    .phase20advsplit-navchild .nav__icon{opacity:.75; font-size:12px}
    .phase20advsplit-navgroup.is-child-active > .nav__item[data-tab="advanced-panels"]{
      border-color: rgba(56,246,255,0.24);
      box-shadow: 0 0 0 1px rgba(155,92,255,0.07) inset, 0 0 14px rgba(56,246,255,0.08);
      background: rgba(10,18,28,0.32);
    }
  `;
  document.head.appendChild(st);
}

function phase20AdvSplitEnsureNavGroup_(sidebarNav, advancedBtn){
  if(!sidebarNav || !advancedBtn) return null;
  let group = sidebarNav.querySelector('#phase20AdvSplitNavGroup');
  let sub = sidebarNav.querySelector('#phase20AdvSplitNavSub');

  if(!group){
    group = document.createElement('div');
    group.id = 'phase20AdvSplitNavGroup';
    group.className = 'phase20advsplit-navgroup';
  }
  if(!sub){
    sub = document.createElement('div');
    sub.id = 'phase20AdvSplitNavSub';
    sub.className = 'phase20advsplit-navsub';
  }

  if(advancedBtn.parentElement !== group){
    if(group.parentElement !== sidebarNav){
      if(advancedBtn.parentElement === sidebarNav) advancedBtn.insertAdjacentElement('beforebegin', group);
      else sidebarNav.appendChild(group);
    }
    group.insertAdjacentElement('afterbegin', advancedBtn);
  }
  if(sub.parentElement !== group) group.appendChild(sub);

  if(!advancedBtn._phase20AdvSplitCollapseBound){
    advancedBtn.addEventListener('click', () => {
      try{ phase20AdvSplitToggleNavGroup_(); }catch{}
    });
    advancedBtn._phase20AdvSplitCollapseBound = true;
  }

  if(!sub.id) sub.id = 'phase20AdvSplitNavSub';
  advancedBtn.setAttribute('aria-controls', sub.id);
  advancedBtn.setAttribute('aria-haspopup', 'true');

  return { group, sub };
}

function phase20AdvSplitToggleNavGroup_(nextCollapsed){
  if(typeof nextCollapsed === 'boolean') phase20AdvSplitState_.navCollapsed = nextCollapsed;
  else phase20AdvSplitState_.navCollapsed = !phase20AdvSplitState_.navCollapsed;
  try{ phase20AdvSplitSyncNavGroupState_(); }catch{}
}

function phase20AdvSplitSyncNavGroupState_(){
  const group = document.querySelector('#phase20AdvSplitNavGroup');
  const sub = document.querySelector('#phase20AdvSplitNavSub');
  const advancedBtn = document.querySelector('.nav #phase20AdvSplitNavGroup > .nav__item[data-tab="advanced-panels"]');
  if(!group) return;
  const active = document.querySelector('.nav .nav__item.is-active')?.dataset?.tab || '';
  const childDefs = phase20AdvSplitDefs_();
  const isChildActive = childDefs.some(def => def.tabId === active);
  group.classList.toggle('is-child-active', !!isChildActive);
  const collapsed = !!phase20AdvSplitState_.navCollapsed && !isChildActive;
  group.classList.toggle('is-collapsed', collapsed);
  if(sub){
    const visibleChildren = Array.from(sub.querySelectorAll('.nav__item')).filter(btn => btn.style.display !== 'none');
    sub.style.display = (visibleChildren.length && !collapsed) ? '' : 'none';
    sub.setAttribute('aria-hidden', (visibleChildren.length && !collapsed) ? 'false' : 'true');
  }
  if(advancedBtn){
    advancedBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }
}

function phase20AdvSplitEnsureTabs_(){
  const sidebarNav = document.querySelector('.nav');
  const advancedBtn = sidebarNav && sidebarNav.querySelector('.nav__item[data-tab="advanced-panels"]');
  const advancedPanel = document.querySelector('#tab-advanced-panels');
  const dashboardTab = document.querySelector('#tab-dashboard');
  if(!sidebarNav || !advancedBtn || !advancedPanel || !dashboardTab || !dashboardTab.parentElement) return;

  const portfolioBtn = sidebarNav.querySelector('.nav__item[data-tab="portfolio"]');
  const portfolioPanel = document.querySelector('#tab-portfolio');
  const navGroupRefs = phase20AdvSplitEnsureNavGroup_(sidebarNav, advancedBtn);
  const navSub = navGroupRefs && navGroupRefs.sub;

  let navInsertAfter = null;
  let panelInsertAfter = advancedPanel;

  phase20AdvSplitDefs_().forEach((def) => {
    let navBtn = sidebarNav.querySelector(`.nav__item[data-tab="${def.tabId}"]`);
    if(!navBtn){
      navBtn = document.createElement('button');
      navBtn.type = 'button';
      navBtn.className = 'nav__item';
      navBtn.dataset.tab = def.tabId;
      navBtn.innerHTML = `<span class="nav__icon">${def.icon}</span><span class="nav__text">${def.navText}</span>`;
      if(navInsertAfter && navInsertAfter.parentElement === navSub) navInsertAfter.insertAdjacentElement('afterend', navBtn);
      else if(navSub) navSub.appendChild(navBtn);
      else if(portfolioBtn && portfolioBtn.parentElement === sidebarNav) portfolioBtn.insertAdjacentElement('beforebegin', navBtn);
      else sidebarNav.appendChild(navBtn);
    }
    if(navSub && navBtn.parentElement !== navSub) navSub.appendChild(navBtn);
    navBtn.classList.add('phase20advsplit-navchild');
    navBtn.dataset.parentTab = 'advanced-panels';
    navInsertAfter = navBtn;

    let panel = document.querySelector('#'+def.panelId);
    if(!panel){
      panel = document.createElement('section');
      panel.className = 'tab';
      panel.id = def.panelId;
      panel.dataset.tab = def.tabId;
      panel.innerHTML = `
        <div class="tab__header">
          <div class="tab__title">${def.title}</div>
          <div class="tab__subtitle">${def.subtitle}</div>
        </div>
        <div class="phase20advsplit-wrap">
          <div class="card">
            <div class="card__top">
              <div>
                <div class="card__label">Advanced Panel Category</div>
                <div class="card__title">${def.title}</div>
                <div class="card__meta" id="phase20AdvSplitMeta-${def.key}">Panels grouped under ${def.navText}.</div>
              </div>
            </div>
            <div class="phase20advsplit-host" id="${def.hostId}">
              <div class="phase20advsplit-empty">Loading category panels…</div>
            </div>
          </div>
        </div>
      `;
      if(panelInsertAfter && panelInsertAfter.parentElement) panelInsertAfter.insertAdjacentElement('afterend', panel);
      else if(portfolioPanel && portfolioPanel.parentElement) portfolioPanel.insertAdjacentElement('beforebegin', panel);
      else advancedPanel.insertAdjacentElement('afterend', panel);
    }
    panelInsertAfter = panel;

    if(ui && Array.isArray(ui.tabs) && !ui.tabs.some(x => x && x.dataset && x.dataset.tab === def.tabId)){
      let idx = ui.tabs.findIndex(x => x && x.dataset && x.dataset.tab === 'portfolio');
      if(idx < 0) idx = ui.tabs.length;
      ui.tabs.splice(idx, 0, navBtn);
    }
    if(ui && Array.isArray(ui.tabPanels) && !ui.tabPanels.some(x => x && x.dataset && x.dataset.tab === def.tabId)){
      let idx = ui.tabPanels.findIndex(x => x && x.dataset && x.dataset.tab === 'portfolio');
      if(idx < 0) idx = ui.tabPanels.length;
      ui.tabPanels.splice(idx, 0, panel);
    }

    if(!navBtn._phase20AdvSplitBound){
      navBtn.addEventListener('click', ()=>{ try{ switchTab(def.tabId); }catch{} });
      navBtn._phase20AdvSplitBound = true;
    }
  });

  try{ phase20AdvSplitSyncNavGroupState_(); }catch{}
}

function phase20AdvSplitSchedule_(){
  if(phase20AdvSplitState_.timer){ try{ clearTimeout(phase20AdvSplitState_.timer); }catch{} }
  phase20AdvSplitState_.timer = setTimeout(()=>{
    phase20AdvSplitState_.timer = 0;
    try{ phase20AdvSplitApply_(); }catch(err){ console.warn('Phase20 split apply failed', err); }
  }, 35);
}

function phase20AdvSplitApply_(){
  try{ phase20AdvSplitEnsureTabs_(); }catch{}
  const root = document.querySelector('#phase16PolishDashRoot');
  if(!root) return;

  root.classList.add('phase20advsplit-catalogonly');
  const headTitle = root.querySelector('.phase16polish-title');
  const headSub = root.querySelector('.phase16polish-sub');
  if(headTitle) headTitle.textContent = 'Advanced Panels Catalog';
  if(headSub) headSub.textContent = 'Workspace Catalog & Favorites stays here. Open dedicated category tabs for Ops, Automation, Approvals, and Reports tools.';

  phase20AdvSplitDefs_().forEach((def)=>{
    const host = document.getElementById(def.hostId);
    const group = document.querySelector(`details.phase16polish-group[data-key="${def.key}"]`);
    if(host && group && group.parentElement !== host) host.appendChild(group);
    if(group) group.open = true;
    const meta = document.getElementById(`phase20AdvSplitMeta-${def.key}`);
    const count = group ? (group.querySelector('.phase16polish-body')?.children.length || 0) : 0;
    if(meta) meta.textContent = `${count} panel${count===1?'':'s'} in ${def.navText}.`;
  });

  try{ phase20AdvSplitRefreshDashboardFocusCard_(); }catch{}
  try{ phase20AdvSplitApplyUiModeExtras_(); }catch{}
}

function phase20AdvSplitRefreshDashboardFocusCard_(){
  const card = document.querySelector('#phase16DashboardFocusCard');
  if(!card) return;
  const countFor = (id)=> {
    const body = document.querySelector('#'+id);
    return body ? Array.from(body.children || []).filter(x => x && x.id).length : 0;
  };
  const ops = countFor('phase16PolishGroupOps');
  const auto = countFor('phase16PolishGroupAutomation');
  const approval = countFor('phase16PolishGroupApproval');
  const reports = countFor('phase16PolishGroupReports');
  const stats = Array.from(card.querySelectorAll('.phase16polish-focusStat b'));
  if(stats[0]) stats[0].textContent = String(ops + auto + approval + reports);
  if(stats[1]) stats[1].textContent = String(ops);
  if(stats[2]) stats[2].textContent = String(auto + approval);
  if(stats[3]) stats[3].textContent = String(reports);
}

function phase20AdvSplitPatchCatalogFns_(){
  if(typeof phase16PolishGetCatalogItems_ === 'function' && !phase16PolishGetCatalogItems_._phase20AdvSplitPatched){
    const patched = function(root){
      const out = [];
      document.querySelectorAll('details.phase16polish-group[data-key]').forEach(group => {
        const body = group.querySelector('.phase16polish-body');
        if(!body) return;
        const groupLabel = (group.querySelector('summary > span')?.textContent || group.dataset.key || 'Group').trim();
        Array.from(body.children || []).forEach((el, idx) => {
          if(!el || !el.id) return;
          const rawTitle = (
            el.getAttribute('data-panel-title') ||
            el.querySelector('.card__title, .phase16-title, .phase15-title, .phase14-title, .phase13-title, .phase12-title, .phase11-title, .phase10-title, .phase9-title, .phase8-title, h2, h3, h4, .item__title')?.textContent ||
            el.getAttribute('aria-label') ||
            el.id
          );
          const title = String(rawTitle || el.id).replace(/\s+/g,' ').trim();
          out.push({ id: el.id, title, groupKey: String(group.dataset.key || ''), groupLabel, index: idx, el });
        });
      });
      return out;
    };
    patched._phase20AdvSplitPatched = true;
    phase16PolishGetCatalogItems_ = patched;
  }

  if(typeof phase16PolishOpenCatalogItem_ === 'function' && !phase16PolishOpenCatalogItem_._phase20AdvSplitPatched){
    const patchedOpen = function(root, panelId){
      const target = document.querySelector('#'+panelId);
      if(!target) return;
      const group = target.closest('details.phase16polish-group');
      if(group) group.open = true;
      const groupKey = String(group?.dataset?.key || '');
      const tabId = phase20AdvSplitKeyToTabId_(groupKey);
      try{ switchTab(tabId || 'advanced-panels'); }catch{}
      setTimeout(()=>{
        try{ target.classList.add('phase16polish-targetflash'); }catch{}
        try{ target.scrollIntoView({ behavior:'smooth', block:'start' }); }catch{}
        setTimeout(()=>{ try{ target.classList.remove('phase16polish-targetflash'); }catch{} }, 1300);
      }, 30);
    };
    patchedOpen._phase20AdvSplitPatched = true;
    phase16PolishOpenCatalogItem_ = patchedOpen;
  }
}

function phase20AdvSplitPatchPhase16Cleanup_(){
  if(typeof phase16PolishApplyDashboardCleanup_ !== 'function' || phase20AdvSplitState_.wrappedPhase16Apply) return;
  phase16PolishApplyDashboardCleanup_ = function(){
    const dashboardTab = document.querySelector('#tab-dashboard');
    const advancedTab = document.querySelector('#tab-advanced-panels');
    const hostTab = advancedTab || dashboardTab;
    if(!hostTab) return;

    try{ phase20AdvSplitEnsureTabs_(); }catch{}
    const root = phase16PolishEnsureDashboardRoot_(hostTab);
    const gOps = document.querySelector('#phase16PolishGroupOps');
    const gAuto = document.querySelector('#phase16PolishGroupAutomation');
    const gApproval = document.querySelector('#phase16PolishGroupApproval');
    const gReports = document.querySelector('#phase16PolishGroupReports');
    if(!root || !gOps || !gAuto || !gApproval || !gReports) return;

    const groups = {
      ops: ['phase6DashWorkload','phase7CapacityPanel','phase8DashboardHost','phase9DashboardHost','phase11DashboardHost','phase12DashboardHost'],
      automation: ['phase10DashboardHost','phase13DashboardHost'],
      approval: ['phase14ApprovalQueuePanel','phase15RbacPanel','phase16TeamPanel'],
      reports: []
    };
    groups.ops.forEach(id => phase16PolishAppendIfNeeded_(document.querySelector('#'+id), gOps));
    groups.automation.forEach(id => phase16PolishAppendIfNeeded_(document.querySelector('#'+id), gAuto));
    groups.approval.forEach(id => phase16PolishAppendIfNeeded_(document.querySelector('#'+id), gApproval));

    const teamPanel = document.querySelector('#phase16TeamPanel');
    if(teamPanel) phase16PolishAppendIfNeeded_(teamPanel, gApproval);

    const sourceTabs = [dashboardTab, advancedTab].filter(Boolean);
    sourceTabs.forEach(tab => {
      Array.from(tab.children || []).forEach(el => {
        if(!el || el === root) return;
        const id = String(el.id || '');
        if(!/^phase(6|7|8|9|10|11|12|13|14|15|16)/.test(id)) return;
        if(root.contains(el)) return;
        phase16PolishAppendIfNeeded_(el, gReports);
      });
    });

    sourceTabs.forEach(tab => {
      Array.from(tab.querySelectorAll('.card > [id^="phase"]')).forEach(el => {
        const id = String(el.id || '');
        if(id === 'phase16TeamPanel' || id === 'phase15RbacPanel' || id === 'phase14ApprovalQueuePanel') phase16PolishAppendIfNeeded_(el, gApproval);
        else if(id === 'phase10DashboardHost' || id === 'phase13DashboardHost') phase16PolishAppendIfNeeded_(el, gAuto);
        else if(/^phase(6|7)/.test(id)) phase16PolishAppendIfNeeded_(el, gOps);
        else phase16PolishAppendIfNeeded_(el, gOps);
      });
    });

    document.querySelectorAll('details.phase16polish-group').forEach(d => {
      const body = d.querySelector('.phase16polish-body');
      const badge = d.querySelector('.phase16polish-badge');
      const count = body ? body.children.length : 0;
      if(badge) badge.textContent = String(count);
      d.style.display = count ? '' : 'none';
    });

    try{ phase16PolishEnsureDashboardFocusCard_(dashboardTab, root); }catch(err){ console.warn('Phase16 dashboard focus card failed', err); }
    try{ phase16PolishRenderCatalog_(root); }catch{}
    try{ phase16PolishRenderSidebarNavDropdown_(); }catch{}
    try{ phase20AdvSplitApply_(); }catch{}
  };
  phase20AdvSplitState_.wrappedPhase16Apply = true;
}

function phase20AdvSplitPatchUiMode_(){
  if(typeof phase18UiModeApply_ === 'function' && !phase20AdvSplitState_.wrappedPhase18Apply){
    const _orig = phase18UiModeApply_;
    phase18UiModeApply_ = function(){
      const r = _orig.apply(this, arguments);
      try{ phase20AdvSplitApplyUiModeExtras_(); }catch{}
      return r;
    };
    phase20AdvSplitState_.wrappedPhase18Apply = true;
  }
}

function phase20AdvSplitApplyUiModeExtras_(){
  const isAdv = (typeof phase18UiModeIsAdvanced_ === 'function') ? !!phase18UiModeIsAdvanced_() : true;
  const extraTabIds = phase20AdvSplitDefs_().map(d => d.tabId);
  extraTabIds.forEach(tabId => {
    if(typeof phase18UiModeSetTabVisibility_ === 'function'){
      try{ phase18UiModeSetTabVisibility_(tabId, isAdv); }catch{}
      return;
    }
    const navBtn = document.querySelector(`.nav .nav__item[data-tab="${tabId}"]`);
    const panel = document.querySelector(`.tab[data-tab="${tabId}"]`);
    [navBtn, panel].forEach(el => {
      if(!el) return;
      el.style.display = isAdv ? '' : 'none';
      el.setAttribute('aria-hidden', isAdv ? 'false' : 'true');
    });
  });

  const activeTab = document.querySelector('.tab.is-active')?.dataset?.tab || '';
  if(!isAdv && extraTabIds.includes(activeTab)){
    try{ switchTab('dashboard'); }catch{}
  }

  try{ phase20AdvSplitSyncNavGroupState_(); }catch{}
}

function phase20AdvSplitWrapSwitchTab_(){
  if(phase20AdvSplitState_.wrappedSwitch || typeof switchTab !== 'function') return;
  const _orig = switchTab;
  switchTab = function(tabId){
    const nextTab = String(tabId || '');
    const extraTabIds = phase20AdvSplitDefs_().map(d => d.tabId);
    const isAdv = (typeof phase18UiModeIsAdvanced_ === 'function') ? !!phase18UiModeIsAdvanced_() : true;
    if(!isAdv && extraTabIds.includes(nextTab)){
      const r = _orig.call(this, 'dashboard');
      try{ phase20AdvSplitSyncNavGroupState_(); }catch{}
      try{ phase20AdvSplitSchedule_(); }catch{}
      return r;
    }
    const r = _orig.apply(this, arguments);
    try{ phase20AdvSplitSyncNavGroupState_(); }catch{}
    try{ phase20AdvSplitSchedule_(); }catch{}
    return r;
  };
  phase20AdvSplitState_.wrappedSwitch = true;
}

function phase20AdvSplitRegisterHooks_(){
  if(window.StarkPMPostRenderHooks && typeof window.StarkPMPostRenderHooks.register === 'function'){
    try{ window.StarkPMPostRenderHooks.register('dashboard', 'phase20-adv-split', ()=> phase20AdvSplitSchedule_(), { order: 90 }); }catch{}
    try{ window.StarkPMPostRenderHooks.register('checklist', 'phase20-adv-split', ()=> phase20AdvSplitSchedule_(), { order: 90 }); }catch{}
  }
}

try{ initPhase20AdvancedSplitTabs_(); }catch(err){ console.warn('Phase20 advanced split tabs init failed', err); }
