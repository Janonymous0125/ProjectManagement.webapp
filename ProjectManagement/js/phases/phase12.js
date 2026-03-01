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



