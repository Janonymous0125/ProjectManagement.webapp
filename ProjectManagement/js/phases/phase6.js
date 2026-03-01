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

