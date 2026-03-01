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

