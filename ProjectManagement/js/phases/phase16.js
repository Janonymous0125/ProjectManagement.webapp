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

