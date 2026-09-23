/* ---------------------------
   Network Blackboard
   Optional: connects the browser-only Stark PM HUD to blackboard/server.js.
---------------------------- */
(function(){
  const $bb = (sel) => document.querySelector(sel);
  const state_ = {
    connected:false,
    endpoint:'',
    adminToken:'',
    snapshot:{ agents:[], messages:[], tasks:[] },
    pollTimer:null,
    busy:false,
  };

  function defaultEndpoint_(){
    try{
      if(/^https?:$/i.test(location.protocol) && location.port === '8787') return location.origin;
      if(/^https?:$/i.test(location.protocol) && !location.port) return location.origin;
    }catch{}
    return 'http://127.0.0.1:8787';
  }

  function esc_(value){
    return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[ch]));
  }

  function fmtTime_(iso){
    if(!iso) return '—';
    try{ return new Date(iso).toLocaleString(); }catch{ return String(iso); }
  }

  function setStatus_(kind, text){
    const el = $bb('#bbConnectionStatus');
    const dot = $bb('#bbConnectionDot');
    if(el) el.textContent = text;
    if(dot){ dot.classList.remove('is-ok','is-warn','is-error'); dot.classList.add(kind === 'ok' ? 'is-ok' : kind === 'error' ? 'is-error' : 'is-warn'); }
  }

  async function request_(method, route, body){
    const endpoint = String(state_.endpoint || '').replace(/\/$/, '');
    if(!endpoint) throw new Error('Blackboard server URL is empty.');
    const headers = { Authorization:`Bearer ${state_.adminToken}` };
    if(body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${endpoint}${route}`, { method, headers, body:body === undefined ? undefined : JSON.stringify(body) });
    let data = {};
    try{ data = await res.json(); }catch{}
    if(!res.ok) throw new Error(data?.error || `${method} ${route} failed (${res.status})`);
    return data;
  }

  async function refresh_(silent){
    if(state_.busy || !state_.endpoint || !state_.adminToken) return;
    state_.busy = true;
    try{
      const data = await request_('GET', '/api/snapshot?message_limit=200&task_limit=400');
      state_.snapshot = data || { agents:[], messages:[], tasks:[] };
      state_.connected = true;
      setStatus_('ok', 'CONNECTED');
      render_();
    }catch(err){
      state_.connected = false;
      setStatus_('error', 'OFFLINE');
      if(!silent) showNotice_(err.message, true);
    }finally{
      state_.busy = false;
    }
  }

  function showNotice_(text, error){
    const el = $bb('#bbNotice');
    if(!el) return;
    el.textContent = String(text || '');
    el.classList.toggle('is-error', !!error);
    el.classList.toggle('is-ok', !error && !!text);
  }

  function agentOptions_(includeHuman){
    const rows = (state_.snapshot.agents || []).map(a => `<option value="${esc_(a.id)}">${esc_(a.name || a.id)} (${esc_(a.id)})</option>`);
    if(includeHuman) rows.unshift('<option value="human">Human/Admin</option>');
    return rows.join('');
  }

  function renderAgents_(){
    const host = $bb('#bbAgentList');
    if(!host) return;
    const agents = state_.snapshot.agents || [];
    if(!agents.length){ host.innerHTML = '<div class="bb-empty">No agents registered yet.</div>'; return; }
    host.innerHTML = agents.map(a => `
      <div class="bb-agent ${a.online ? 'is-online' : ''}">
        <div class="bb-agent__head">
          <div><b>${esc_(a.name || a.id)}</b><span class="bb-agent__id">${esc_(a.id)}</span></div>
          <span class="bb-presence ${a.online ? 'is-online' : ''}">${a.online ? 'ONLINE' : 'OFFLINE'}</span>
        </div>
        <div class="bb-agent__caps">${(a.capabilities || []).length ? (a.capabilities || []).map(c => `<span class="bb-mini-chip">${esc_(c)}</span>`).join('') : '<span class="bb-muted">No capability tags</span>'}</div>
        <div class="bb-agent__meta">Last seen: ${esc_(fmtTime_(a.last_seen_at))}</div>
      </div>`).join('');

    const target = $bb('#bbMessageTarget');
    if(target){
      const prev = target.value;
      target.innerHTML = '<option value="">Select target…</option>' + agentOptions_(false);
      if([...target.options].some(o => o.value === prev)) target.value = prev;
    }
    const assignSelects = document.querySelectorAll('.bb-task-assign-select');
    assignSelects.forEach(sel => {
      const prev = sel.value;
      sel.innerHTML = '<option value="">Assign agent…</option>' + agentOptions_(false);
      if([...sel.options].some(o => o.value === prev)) sel.value = prev;
    });
  }

  function renderMessages_(){
    const host = $bb('#bbMessageFeed');
    if(!host) return;
    const messages = [...(state_.snapshot.messages || [])].reverse();
    if(!messages.length){ host.innerHTML = '<div class="bb-empty">No blackboard messages yet.</div>'; return; }
    host.innerHTML = messages.map(m => `
      <article class="bb-message ${m.scope === 'private' ? 'is-private' : 'is-public'}">
        <div class="bb-message__meta">
          <span class="bb-scope">${m.scope === 'private' ? 'PRIVATE' : 'PUBLIC'}</span>
          <span>#${esc_(m.channel || 'general')}</span>
          <span>${esc_(m.author_id)}</span>
          ${m.target_agent_id ? `<span>→ ${esc_(m.target_agent_id)}</span>` : ''}
          <span>${esc_(fmtTime_(m.created_at))}</span>
        </div>
        <div class="bb-message__body">${esc_(m.body).replace(/\n/g,'<br>')}</div>
        <div class="bb-message__id">${esc_(m.id)}</div>
      </article>`).join('');
  }

  function renderTasks_(){
    const host = $bb('#bbTaskList');
    if(!host) return;
    const tasks = [...(state_.snapshot.tasks || [])].reverse();
    if(!tasks.length){ host.innerHTML = '<div class="bb-empty">No network tasks yet.</div>'; return; }
    host.innerHTML = tasks.map(t => {
      const canAssign = t.status === 'open';
      return `<article class="bb-task" data-task-id="${esc_(t.id)}">
        <div class="bb-task__top">
          <div>
            <div class="bb-task__title">${esc_(t.title)}</div>
            <div class="bb-task__meta">${esc_(t.priority || 'normal').toUpperCase()} · ${esc_(t.status || 'open').toUpperCase()} · v${Number(t.version || 1)}</div>
          </div>
          <span class="bb-task__state is-${esc_(t.status || 'open')}">${esc_(t.status || 'open')}</span>
        </div>
        ${t.description ? `<div class="bb-task__desc">${esc_(t.description).replace(/\n/g,'<br>')}</div>` : ''}
        <div class="bb-task__chips">
          ${(t.required_capabilities || []).map(c => `<span class="bb-mini-chip">cap:${esc_(c)}</span>`).join('')}
          ${(t.target_agent_ids || []).map(a => `<span class="bb-mini-chip">target:${esc_(a)}</span>`).join('')}
          ${t.claimed_by ? `<span class="bb-mini-chip">claimed:${esc_(t.claimed_by)}</span>` : ''}
        </div>
        ${t.result ? `<div class="bb-task__result"><b>Result:</b> ${esc_(t.result).replace(/\n/g,'<br>')}</div>` : ''}
        <div class="bb-task__footer">
          <span>${esc_(t.id)}</span>
          ${canAssign ? `<div class="bb-task__assign"><select class="select bb-task-assign-select"><option value="">Assign agent…</option>${agentOptions_(false)}</select><button class="btn btn--ghost btn--compact bb-task-assign-btn" type="button">Assign</button></div>` : ''}
        </div>
      </article>`;
    }).join('');

    host.querySelectorAll('.bb-task-assign-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const card = btn.closest('.bb-task');
        const taskId = card?.dataset?.taskId;
        const agentId = card?.querySelector('.bb-task-assign-select')?.value;
        if(!taskId || !agentId) return;
        try{
          btn.disabled = true;
          await request_('POST', `/api/tasks/${encodeURIComponent(taskId)}/assign`, { agent_id:agentId });
          showNotice_(`Assigned ${taskId} to ${agentId}.`, false);
          await refresh_(true);
        }catch(err){ showNotice_(err.message, true); }
        finally{ btn.disabled = false; }
      });
    });
  }

  function render_(){
    renderAgents_();
    renderMessages_();
    renderTasks_();
    const counts = {
      agents:(state_.snapshot.agents || []).length,
      online:(state_.snapshot.agents || []).filter(a => a.online).length,
      messages:(state_.snapshot.messages || []).length,
      openTasks:(state_.snapshot.tasks || []).filter(t => t.status === 'open').length,
    };
    const set = (id, value) => { const el = $bb(id); if(el) el.textContent = String(value); };
    set('#bbStatAgents', counts.agents); set('#bbStatOnline', counts.online); set('#bbStatMessages', counts.messages); set('#bbStatOpenTasks', counts.openTasks);
  }

  function syncPrivateTarget_(){
    const scope = $bb('#bbMessageScope')?.value || 'public';
    const wrap = $bb('#bbMessageTargetWrap');
    if(wrap) wrap.classList.toggle('is-hidden', scope !== 'private');
  }

  function parseCsv_(value){ return [...new Set(String(value || '').split(',').map(x => x.trim()).filter(Boolean))]; }

  function wire_(){
    const endpoint = $bb('#bbServerUrl');
    const token = $bb('#bbAdminToken');
    if(!endpoint || !token) return;
    state_.endpoint = localStorage.getItem('stark_pm_blackboard_url_v1') || defaultEndpoint_();
    state_.adminToken = sessionStorage.getItem('stark_pm_blackboard_admin_v1') || '';
    endpoint.value = state_.endpoint;
    token.value = state_.adminToken;

    $bb('#bbConnect')?.addEventListener('click', async () => {
      state_.endpoint = endpoint.value.trim().replace(/\/$/, '');
      state_.adminToken = token.value.trim();
      localStorage.setItem('stark_pm_blackboard_url_v1', state_.endpoint);
      sessionStorage.setItem('stark_pm_blackboard_admin_v1', state_.adminToken);
      setStatus_('warn', 'CONNECTING');
      await refresh_(false);
    });

    $bb('#bbRefresh')?.addEventListener('click', () => refresh_(false));
    $bb('#bbMessageScope')?.addEventListener('change', syncPrivateTarget_);

    $bb('#bbPostMessage')?.addEventListener('click', async () => {
      const body = $bb('#bbMessageBody')?.value.trim();
      const scope = $bb('#bbMessageScope')?.value || 'public';
      const target = $bb('#bbMessageTarget')?.value || '';
      if(!body) return showNotice_('Message body is required.', true);
      if(scope === 'private' && !target) return showNotice_('Choose the private target agent.', true);
      try{
        await request_('POST', '/api/messages', {
          scope,
          channel:$bb('#bbMessageChannel')?.value.trim() || 'general',
          target_agent_id:scope === 'private' ? target : undefined,
          body,
        });
        $bb('#bbMessageBody').value = '';
        showNotice_(scope === 'public' ? 'Public message posted; all other agents are eligible to wake.' : `Private message posted; only ${target} is eligible to wake.`, false);
        await refresh_(true);
      }catch(err){ showNotice_(err.message, true); }
    });

    $bb('#bbPostTask')?.addEventListener('click', async () => {
      const title = $bb('#bbTaskTitle')?.value.trim();
      if(!title) return showNotice_('Task title is required.', true);
      try{
        await request_('POST', '/api/tasks', {
          title,
          description:$bb('#bbTaskDescription')?.value.trim() || '',
          priority:$bb('#bbTaskPriority')?.value || 'normal',
          required_capabilities:parseCsv_($bb('#bbTaskCapabilities')?.value),
          target_agent_ids:parseCsv_($bb('#bbTaskTargets')?.value),
        });
        $bb('#bbTaskTitle').value = '';
        $bb('#bbTaskDescription').value = '';
        $bb('#bbTaskCapabilities').value = '';
        $bb('#bbTaskTargets').value = '';
        showNotice_('Task posted. Eligible agents receive a claim-only wake event first.', false);
        await refresh_(true);
      }catch(err){ showNotice_(err.message, true); }
    });

    $bb('#bbRegisterAgent')?.addEventListener('click', async () => {
      const id = $bb('#bbAgentId')?.value.trim();
      if(!id) return showNotice_('Agent ID is required.', true);
      try{
        const data = await request_('POST', '/api/agents/register', {
          id,
          name:$bb('#bbAgentName')?.value.trim() || id,
          capabilities:parseCsv_($bb('#bbAgentCapabilities')?.value),
        });
        const tokenOut = $bb('#bbNewAgentToken');
        if(tokenOut) tokenOut.value = data.token || '';
        const idOut = $bb('#bbNewAgentId');
        if(idOut) idOut.textContent = data.agent?.id || id;
        $bb('#bbAgentId').value = '';
        $bb('#bbAgentName').value = '';
        $bb('#bbAgentCapabilities').value = '';
        showNotice_(`Registered ${data.agent?.id || id}. Copy its token now; the server stores only a hash.`, false);
        await refresh_(true);
      }catch(err){ showNotice_(err.message, true); }
    });

    $bb('#bbCopyAgentToken')?.addEventListener('click', async () => {
      const value = $bb('#bbNewAgentToken')?.value || '';
      if(!value) return;
      try{ await navigator.clipboard.writeText(value); showNotice_('Agent token copied.', false); }
      catch{ showNotice_('Clipboard access failed; copy the token manually.', true); }
    });

    syncPrivateTarget_();
    if(state_.adminToken) refresh_(true);
    state_.pollTimer = setInterval(() => { if(state_.connected) refresh_(true); }, 3000);
  }

  // The script is loaded before bootstrap, after the static DOM exists.
  wire_();
})();
