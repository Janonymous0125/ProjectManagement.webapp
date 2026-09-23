'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const STORE_VERSION = 1;
const MAX_MESSAGES = 5000;
const MAX_EVENTS = 10000;
const MAX_DELIVERIES = 25000;

function nowIso(){ return new Date().toISOString(); }
function id(prefix){ return `${prefix}_${crypto.randomUUID()}`; }
function hashToken(token){ return crypto.createHash('sha256').update(String(token)).digest('hex'); }
function cleanString(value, max = 4000){ return String(value == null ? '' : value).trim().slice(0, max); }
function uniqStrings(values, maxItems = 64, maxLen = 120){
  if(!Array.isArray(values)) return [];
  return [...new Set(values.map(v => cleanString(v, maxLen)).filter(Boolean))].slice(0, maxItems);
}
function cleanChannel(value){
  const raw = cleanString(value || 'general', 64).toLowerCase();
  const safe = raw.replace(/[^a-z0-9_.-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || 'general';
}
function clone(value){ return JSON.parse(JSON.stringify(value)); }

function emptyState(){
  return {
    version: STORE_VERSION,
    created_at: nowIso(),
    updated_at: nowIso(),
    agents: [],
    messages: [],
    tasks: [],
    events: [],
    deliveries: [],
  };
}

class BlackboardStore {
  constructor(filePath){
    this.filePath = path.resolve(filePath);
    this.state = emptyState();
    this.load();
  }

  load(){
    try{
      if(!fs.existsSync(this.filePath)) return;
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      if(!parsed || typeof parsed !== 'object') return;
      this.state = Object.assign(emptyState(), parsed, {
        agents: Array.isArray(parsed.agents) ? parsed.agents : [],
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
        tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
        events: Array.isArray(parsed.events) ? parsed.events : [],
        deliveries: Array.isArray(parsed.deliveries) ? parsed.deliveries : [],
      });
    }catch(err){
      const backup = `${this.filePath}.corrupt-${Date.now()}`;
      try{ fs.copyFileSync(this.filePath, backup); }catch{}
      console.error('[blackboard] Store load failed; starting empty:', err.message);
      this.state = emptyState();
    }
  }

  persist(){
    this.state.version = STORE_VERSION;
    this.state.updated_at = nowIso();
    fs.mkdirSync(path.dirname(this.filePath), { recursive:true });
    const tmp = `${this.filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
  }

  publicAgent(agent){
    if(!agent) return null;
    const out = clone(agent);
    delete out.token_hash;
    return out;
  }

  listAgents(){ return this.state.agents.map(a => this.publicAgent(a)); }
  getAgent(agentId){ return this.state.agents.find(a => a.id === agentId) || null; }

  registerAgent(input){
    const agentId = cleanString(input.id, 80).toLowerCase().replace(/[^a-z0-9_.-]+/g, '-');
    if(!agentId) throw Object.assign(new Error('agent id is required'), { statusCode:400 });
    if(agentId === 'human') throw Object.assign(new Error('agent id "human" is reserved'), { statusCode:400 });
    if(this.getAgent(agentId)) throw Object.assign(new Error(`agent already exists: ${agentId}`), { statusCode:409 });
    const token = crypto.randomBytes(32).toString('base64url');
    const ts = nowIso();
    const agent = {
      id: agentId,
      name: cleanString(input.name || agentId, 120),
      capabilities: uniqStrings(input.capabilities, 64, 80),
      enabled: input.enabled !== false,
      created_at: ts,
      updated_at: ts,
      last_seen_at: null,
      token_hash: hashToken(token),
    };
    this.state.agents.push(agent);
    this.persist();
    return { agent:this.publicAgent(agent), token };
  }

  updateAgent(agentId, patch){
    const agent = this.getAgent(agentId);
    if(!agent) throw Object.assign(new Error('agent not found'), { statusCode:404 });
    if(Object.prototype.hasOwnProperty.call(patch, 'name')) agent.name = cleanString(patch.name || agent.id, 120);
    if(Object.prototype.hasOwnProperty.call(patch, 'capabilities')) agent.capabilities = uniqStrings(patch.capabilities, 64, 80);
    if(Object.prototype.hasOwnProperty.call(patch, 'enabled')) agent.enabled = Boolean(patch.enabled);
    agent.updated_at = nowIso();
    this.persist();
    return this.publicAgent(agent);
  }

  rotateAgentToken(agentId){
    const agent = this.getAgent(agentId);
    if(!agent) throw Object.assign(new Error('agent not found'), { statusCode:404 });
    const token = crypto.randomBytes(32).toString('base64url');
    agent.token_hash = hashToken(token);
    agent.updated_at = nowIso();
    this.persist();
    return { agent:this.publicAgent(agent), token };
  }

  authenticateAgent(agentId, token){
    const agent = this.getAgent(agentId);
    if(!agent || !agent.enabled || !token) return null;
    const got = Buffer.from(hashToken(token), 'utf8');
    const want = Buffer.from(String(agent.token_hash || ''), 'utf8');
    if(got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null;
    agent.last_seen_at = nowIso();
    return this.publicAgent(agent);
  }

  touchAgent(agentId){
    const agent = this.getAgent(agentId);
    if(!agent) return;
    agent.last_seen_at = nowIso();
  }

  createEvent(type, payload, recipients){
    const event = {
      id: id('evt'),
      type: cleanString(type, 80),
      created_at: nowIso(),
      payload: clone(payload),
    };
    this.state.events.push(event);
    const deliveryRows = [];
    for(const agentId of uniqStrings(recipients, 500, 80)){
      const agent = this.getAgent(agentId);
      if(!agent || !agent.enabled) continue;
      const row = {
        id: id('del'),
        event_id: event.id,
        agent_id: agentId,
        status: 'pending',
        attempts: 0,
        created_at: event.created_at,
        delivered_at: null,
        acked_at: null,
        last_error: null,
      };
      this.state.deliveries.push(row);
      deliveryRows.push(row);
    }
    this.trim_();
    this.persist();
    return { event:clone(event), deliveries:clone(deliveryRows) };
  }

  candidateAgentsForTask(task, excludeAgentId){
    return this.state.agents.filter(agent => {
      if(!agent.enabled) return false;
      if(excludeAgentId && agent.id === excludeAgentId) return false;
      if(task.target_agent_ids.length && !task.target_agent_ids.includes(agent.id)) return false;
      if(task.required_capabilities.length){
        const caps = new Set(agent.capabilities || []);
        if(!task.required_capabilities.every(cap => caps.has(cap))) return false;
      }
      return true;
    }).map(a => a.id);
  }

  createMessage(input, actor){
    const scope = input.scope === 'private' ? 'private' : 'public';
    const body = cleanString(input.body, 24000);
    if(!body) throw Object.assign(new Error('message body is required'), { statusCode:400 });
    const idempotencyKey = cleanString(input.idempotency_key, 180);
    if(idempotencyKey){
      const previous = this.state.messages.find(m => m.idempotency_key === idempotencyKey && m.author_id === actor.id);
      if(previous) return { message:clone(previous), duplicate:true, recipients:[], eventBundle:null };
    }
    let targetAgentId = null;
    if(scope === 'private'){
      targetAgentId = cleanString(input.target_agent_id, 80);
      if(!targetAgentId) throw Object.assign(new Error('target_agent_id is required for private messages'), { statusCode:400 });
      if(targetAgentId !== 'human' && !this.getAgent(targetAgentId)) throw Object.assign(new Error('target agent not found'), { statusCode:404 });
    }
    const replyTo = cleanString(input.reply_to_id, 120) || null;
    const parent = replyTo ? this.state.messages.find(m => m.id === replyTo) : null;
    const message = {
      id: id('msg'),
      channel: cleanChannel(input.channel),
      scope,
      author_id: actor.id,
      author_kind: actor.kind,
      target_agent_id: targetAgentId,
      body,
      reply_to_id: parent ? parent.id : null,
      thread_id: cleanString(input.thread_id, 120) || (parent ? parent.thread_id : null) || null,
      created_at: nowIso(),
      metadata: (input.metadata && typeof input.metadata === 'object') ? clone(input.metadata) : {},
      idempotency_key: idempotencyKey || null,
    };
    if(!message.thread_id) message.thread_id = message.id;
    this.state.messages.push(message);

    let recipients = [];
    if(scope === 'public'){
      recipients = this.state.agents.filter(a => a.enabled && a.id !== actor.id).map(a => a.id);
    }else if(targetAgentId && targetAgentId !== 'human' && targetAgentId !== actor.id){
      recipients = [targetAgentId];
    }
    const eventBundle = this.createEvent('message.created', { message }, recipients);
    return { message:clone(message), duplicate:false, recipients, eventBundle };
  }

  visibleMessages(actor, filters = {}){
    let rows = this.state.messages.filter(m => {
      if(actor.kind === 'admin') return true;
      return m.scope === 'public' || m.author_id === actor.id || m.target_agent_id === actor.id;
    });
    if(filters.channel) rows = rows.filter(m => m.channel === cleanChannel(filters.channel));
    if(filters.thread_id) rows = rows.filter(m => m.thread_id === filters.thread_id);
    const limit = Math.max(1, Math.min(500, Number(filters.limit) || 100));
    return clone(rows.slice(-limit));
  }

  createTask(input, actor){
    const title = cleanString(input.title, 300);
    if(!title) throw Object.assign(new Error('task title is required'), { statusCode:400 });
    const idempotencyKey = cleanString(input.idempotency_key, 180);
    if(idempotencyKey){
      const previous = this.state.tasks.find(t => t.idempotency_key === idempotencyKey && t.created_by === actor.id);
      if(previous) return { task:clone(previous), duplicate:true, recipients:[], eventBundle:null };
    }
    const targetAgentIds = uniqStrings(input.target_agent_ids, 64, 80);
    for(const target of targetAgentIds){
      if(!this.getAgent(target)) throw Object.assign(new Error(`target agent not found: ${target}`), { statusCode:404 });
    }
    const ts = nowIso();
    const task = {
      id: id('task'),
      title,
      description: cleanString(input.description, 24000),
      priority: ['low','normal','high','critical'].includes(input.priority) ? input.priority : 'normal',
      status: 'open',
      channel: cleanChannel(input.channel || 'tasks'),
      created_by: actor.id,
      created_by_kind: actor.kind,
      claimed_by: null,
      target_agent_ids: targetAgentIds,
      required_capabilities: uniqStrings(input.required_capabilities, 64, 80),
      tags: uniqStrings(input.tags, 64, 80),
      created_at: ts,
      updated_at: ts,
      claimed_at: null,
      completed_at: null,
      result: '',
      version: 1,
      idempotency_key: idempotencyKey || null,
    };
    this.state.tasks.push(task);
    const recipients = this.candidateAgentsForTask(task, actor.kind === 'agent' ? actor.id : null);
    const eventBundle = this.createEvent('task.created', { task }, recipients);
    return { task:clone(task), duplicate:false, recipients, eventBundle };
  }

  listTasks(actor, filters = {}){
    let rows = this.state.tasks;
    if(actor.kind === 'agent'){
      rows = rows.filter(t => !t.target_agent_ids.length || t.target_agent_ids.includes(actor.id) || t.created_by === actor.id || t.claimed_by === actor.id);
    }
    if(filters.status) rows = rows.filter(t => t.status === filters.status);
    const limit = Math.max(1, Math.min(1000, Number(filters.limit) || 300));
    return clone(rows.slice(-limit));
  }

  claimTask(taskId, actor){
    if(actor.kind !== 'agent') throw Object.assign(new Error('only an agent can claim a task'), { statusCode:403 });
    const task = this.state.tasks.find(t => t.id === taskId);
    if(!task) throw Object.assign(new Error('task not found'), { statusCode:404 });
    if(task.claimed_by === actor.id && ['claimed','in_progress','blocked','done'].includes(task.status)){
      return { task:clone(task), duplicate:true, eventBundles:[] };
    }
    if(task.status !== 'open') throw Object.assign(new Error(`task is no longer open (status=${task.status})`), { statusCode:409 });
    if(task.target_agent_ids.length && !task.target_agent_ids.includes(actor.id)) throw Object.assign(new Error('agent is not a target for this task'), { statusCode:403 });
    const agent = this.getAgent(actor.id);
    const caps = new Set(agent?.capabilities || []);
    if(task.required_capabilities.some(cap => !caps.has(cap))) throw Object.assign(new Error('agent lacks required task capabilities'), { statusCode:403 });

    task.status = 'claimed';
    task.claimed_by = actor.id;
    task.claimed_at = nowIso();
    task.updated_at = task.claimed_at;
    task.version += 1;

    // Any not-yet-acked availability delivery can no longer lead to useful work.
    const createdEventIds = new Set(this.state.events
      .filter(e => e.type === 'task.created' && e.payload?.task?.id === task.id)
      .map(e => e.id));
    for(const d of this.state.deliveries){
      if(createdEventIds.has(d.event_id) && d.agent_id !== actor.id && d.status !== 'acked'){
        d.status = 'superseded';
        d.acked_at = nowIso();
      }
    }

    const bundles = [];
    // Winner gets a second, private wake-up that authorizes actual execution.
    bundles.push(this.createEvent('task.assigned', { task }, [actor.id]));
    if(task.created_by_kind === 'agent' && task.created_by !== actor.id && this.getAgent(task.created_by)){
      bundles.push(this.createEvent('task.claimed', { task }, [task.created_by]));
    }
    this.persist();
    return { task:clone(task), duplicate:false, eventBundles:bundles };
  }

  assignTask(taskId, agentId){
    const task = this.state.tasks.find(t => t.id === taskId);
    if(!task) throw Object.assign(new Error('task not found'), { statusCode:404 });
    const agent = this.getAgent(agentId);
    if(!agent || !agent.enabled) throw Object.assign(new Error('target agent not found or disabled'), { statusCode:404 });
    if(!['open','claimed'].includes(task.status)) throw Object.assign(new Error(`cannot assign task in status ${task.status}`), { statusCode:409 });
    task.status = 'claimed';
    task.claimed_by = agentId;
    task.claimed_at = nowIso();
    task.updated_at = task.claimed_at;
    task.version += 1;
    const bundle = this.createEvent('task.assigned', { task }, [agentId]);
    this.persist();
    return { task:clone(task), eventBundle:bundle };
  }

  updateTask(taskId, patch, actor){
    const task = this.state.tasks.find(t => t.id === taskId);
    if(!task) throw Object.assign(new Error('task not found'), { statusCode:404 });
    if(actor.kind === 'agent' && actor.id !== task.claimed_by && actor.id !== task.created_by){
      throw Object.assign(new Error('agent may only update tasks it created or claimed'), { statusCode:403 });
    }
    const allowed = ['claimed','in_progress','blocked','done','cancelled'];
    if(patch.status && allowed.includes(patch.status)) task.status = patch.status;
    if(Object.prototype.hasOwnProperty.call(patch, 'result')) task.result = cleanString(patch.result, 24000);
    task.updated_at = nowIso();
    if(task.status === 'done') task.completed_at = task.updated_at;
    task.version += 1;

    const recipients = [];
    if(task.created_by_kind === 'agent' && task.created_by !== actor.id && this.getAgent(task.created_by)) recipients.push(task.created_by);
    if(task.claimed_by && task.claimed_by !== actor.id && this.getAgent(task.claimed_by)) recipients.push(task.claimed_by);
    const bundle = this.createEvent('task.updated', { task }, recipients);
    this.persist();
    return { task:clone(task), eventBundle:bundle };
  }

  pendingForAgent(agentId, limit = 100){
    const rows = this.state.deliveries
      .filter(d => d.agent_id === agentId && (d.status === 'pending' || d.status === 'delivered'))
      .slice(0, Math.max(1, Math.min(500, Number(limit) || 100)));
    return rows.map(d => ({ delivery:clone(d), event:clone(this.state.events.find(e => e.id === d.event_id)) })).filter(x => x.event);
  }

  getDelivery(deliveryId){ return this.state.deliveries.find(d => d.id === deliveryId) || null; }
  getEvent(eventId){ return this.state.events.find(e => e.id === eventId) || null; }

  markDelivered(deliveryId){
    const d = this.getDelivery(deliveryId);
    if(!d || d.status === 'acked' || d.status === 'superseded') return null;
    d.status = 'delivered';
    d.attempts = Number(d.attempts || 0) + 1;
    d.delivered_at = nowIso();
    this.touchAgent(d.agent_id);
    this.persist();
    return clone(d);
  }

  ackDelivery(deliveryId, agentId){
    const d = this.getDelivery(deliveryId);
    if(!d) throw Object.assign(new Error('delivery not found'), { statusCode:404 });
    if(d.agent_id !== agentId) throw Object.assign(new Error('delivery belongs to a different agent'), { statusCode:403 });
    d.status = 'acked';
    d.acked_at = nowIso();
    d.last_error = null;
    this.touchAgent(agentId);
    this.persist();
    return clone(d);
  }

  failDelivery(deliveryId, agentId, errorText){
    const d = this.getDelivery(deliveryId);
    if(!d) throw Object.assign(new Error('delivery not found'), { statusCode:404 });
    if(d.agent_id !== agentId) throw Object.assign(new Error('delivery belongs to a different agent'), { statusCode:403 });
    d.status = 'delivered'; // retry on reconnect until acked
    d.last_error = cleanString(errorText, 2000);
    this.touchAgent(agentId);
    this.persist();
    return clone(d);
  }

  contextForDelivery(deliveryId, actor){
    const d = this.getDelivery(deliveryId);
    if(!d) throw Object.assign(new Error('delivery not found'), { statusCode:404 });
    if(actor.kind !== 'admin' && d.agent_id !== actor.id) throw Object.assign(new Error('delivery belongs to another agent'), { statusCode:403 });
    const event = this.getEvent(d.event_id);
    if(!event) throw Object.assign(new Error('event not found'), { statusCode:404 });
    let thread = [];
    const message = event.payload?.message;
    if(message?.thread_id){
      thread = this.visibleMessages(actor, { thread_id:message.thread_id, limit:30 });
    }
    const taskId = event.payload?.task?.id;
    const task = taskId ? clone(this.state.tasks.find(t => t.id === taskId) || null) : null;
    return {
      delivery:clone(d),
      event:clone(event),
      thread,
      task,
      agents:this.listAgents(),
    };
  }

  trim_(){
    if(this.state.messages.length > MAX_MESSAGES) this.state.messages.splice(0, this.state.messages.length - MAX_MESSAGES);
    if(this.state.events.length > MAX_EVENTS){
      const removed = this.state.events.splice(0, this.state.events.length - MAX_EVENTS);
      const ids = new Set(removed.map(e => e.id));
      this.state.deliveries = this.state.deliveries.filter(d => !ids.has(d.event_id));
    }
    if(this.state.deliveries.length > MAX_DELIVERIES){
      const removable = this.state.deliveries.filter(d => d.status === 'acked' || d.status === 'superseded');
      const removeCount = Math.min(removable.length, this.state.deliveries.length - MAX_DELIVERIES);
      const ids = new Set(removable.slice(0, removeCount).map(d => d.id));
      this.state.deliveries = this.state.deliveries.filter(d => !ids.has(d.id));
    }
  }
}

module.exports = { BlackboardStore, hashToken, cleanChannel };
