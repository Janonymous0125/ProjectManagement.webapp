'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const { BlackboardStore } = require('./store');

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.ico':'image/x-icon', '.wav':'audio/wav', '.png':'image/png',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml; charset=utf-8', '.md':'text/markdown; charset=utf-8',
};

function safeEqual(a, b){
  const aa = Buffer.from(String(a || ''), 'utf8');
  const bb = Buffer.from(String(b || ''), 'utf8');
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function json(res, status, data){
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Content-Length':Buffer.byteLength(body), 'Cache-Control':'no-store' });
  res.end(body);
}

function readBody(req, maxBytes = 1024 * 1024){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if(size > maxBytes){ reject(Object.assign(new Error('request body too large'), { statusCode:413 })); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if(!chunks.length) return resolve({});
      try{ resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch{ reject(Object.assign(new Error('invalid JSON body'), { statusCode:400 })); }
    });
    req.on('error', reject);
  });
}

function bearer(req){
  const v = String(req.headers.authorization || '');
  const m = v.match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : '';
}

function createBlackboardServer(options = {}){
  const rootDir = path.resolve(options.rootDir || path.join(__dirname, '..', 'ProjectManagement'));
  const dataFile = path.resolve(options.dataFile || process.env.BLACKBOARD_DATA_FILE || path.join(__dirname, 'data', 'blackboard.json'));
  const adminToken = String(options.adminToken || process.env.BLACKBOARD_ADMIN_TOKEN || crypto.randomBytes(24).toString('base64url'));
  const generatedAdminToken = !(options.adminToken || process.env.BLACKBOARD_ADMIN_TOKEN);
  const store = options.store || new BlackboardStore(dataFile);
  const streams = new Map(); // agentId -> Set<ServerResponse>

  function authenticate(req, { allowAdmin = true, requireAgent = false } = {}){
    const token = bearer(req);
    if(allowAdmin && safeEqual(token, adminToken) && !requireAgent) return { kind:'admin', id:'human', name:'Human/Admin' };
    const agentId = String(req.headers['x-agent-id'] || '').trim();
    const agent = store.authenticateAgent(agentId, token);
    if(agent) return { kind:'agent', id:agent.id, name:agent.name, capabilities:agent.capabilities };
    throw Object.assign(new Error('unauthorized'), { statusCode:401 });
  }

  function isOnline(agentId){ return Boolean(streams.get(agentId)?.size); }
  function agentsWithPresence(){ return store.listAgents().map(a => ({ ...a, online:isOnline(a.id) })); }

  function sendDelivery(agentId, item){
    const set = streams.get(agentId);
    if(!set?.size) return false;
    const payload = JSON.stringify({ delivery_id:item.delivery.id, event:item.event });
    let sent = false;
    for(const res of set){
      try{
        res.write(`id: ${item.delivery.id}\n`);
        res.write(`event: blackboard\n`);
        res.write(`data: ${payload}\n\n`);
        sent = true;
      }catch{}
    }
    if(sent) store.markDelivered(item.delivery.id);
    return sent;
  }

  function fanoutBundle(bundle){
    if(!bundle?.deliveries?.length) return;
    for(const d of bundle.deliveries){
      sendDelivery(d.agent_id, { delivery:d, event:bundle.event });
    }
  }

  function fanoutBundles(result){
    if(result?.eventBundle) fanoutBundle(result.eventBundle);
    for(const b of result?.eventBundles || []) fanoutBundle(b);
  }

  function writeCors(req, res){
    const origin = String(req.headers.origin || '*');
    res.setHeader('Access-Control-Allow-Origin', origin === 'null' ? '*' : origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Agent-Id');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  }

  async function handleApi(req, res, url){
    if(req.method === 'OPTIONS'){ res.writeHead(204); res.end(); return true; }

    if(req.method === 'GET' && url.pathname === '/api/health'){
      json(res, 200, { ok:true, service:'stark-blackboard', version:1, time:new Date().toISOString(), agents:store.listAgents().length, online_agents:agentsWithPresence().filter(a => a.online).length });
      return true;
    }

    if(req.method === 'GET' && url.pathname === '/api/config'){
      json(res, 200, { service:'stark-blackboard', version:1, auth:'bearer', generated_admin_token:generatedAdminToken });
      return true;
    }

    if(req.method === 'POST' && url.pathname === '/api/agents/register'){
      const actor = authenticate(req);
      if(actor.kind !== 'admin') throw Object.assign(new Error('admin token required'), { statusCode:403 });
      const body = await readBody(req);
      const result = store.registerAgent(body);
      json(res, 201, { ...result, warning:'Save this agent token now. Only its hash is stored.' });
      return true;
    }

    let m = url.pathname.match(/^\/api\/agents\/([^/]+)\/token$/);
    if(req.method === 'POST' && m){
      const actor = authenticate(req);
      if(actor.kind !== 'admin') throw Object.assign(new Error('admin token required'), { statusCode:403 });
      const result = store.rotateAgentToken(decodeURIComponent(m[1]));
      json(res, 200, { ...result, warning:'Old token is now invalid.' });
      return true;
    }

    m = url.pathname.match(/^\/api\/agents\/([^/]+)$/);
    if(req.method === 'PATCH' && m){
      const actor = authenticate(req);
      if(actor.kind !== 'admin') throw Object.assign(new Error('admin token required'), { statusCode:403 });
      const body = await readBody(req);
      json(res, 200, { agent:store.updateAgent(decodeURIComponent(m[1]), body) });
      return true;
    }

    if(req.method === 'GET' && url.pathname === '/api/snapshot'){
      const actor = authenticate(req);
      json(res, 200, {
        agents:agentsWithPresence(),
        messages:store.visibleMessages(actor, { limit:url.searchParams.get('message_limit') || 150 }),
        tasks:store.listTasks(actor, { limit:url.searchParams.get('task_limit') || 300 }),
      });
      return true;
    }

    if(req.method === 'GET' && url.pathname === '/api/messages'){
      const actor = authenticate(req);
      json(res, 200, { messages:store.visibleMessages(actor, {
        channel:url.searchParams.get('channel') || undefined,
        thread_id:url.searchParams.get('thread_id') || undefined,
        limit:url.searchParams.get('limit') || 100,
      }) });
      return true;
    }

    if(req.method === 'POST' && url.pathname === '/api/messages'){
      const actor = authenticate(req);
      const body = await readBody(req);
      const result = store.createMessage(body, actor);
      fanoutBundles(result);
      json(res, result.duplicate ? 200 : 201, { message:result.message, recipients:result.recipients, duplicate:result.duplicate });
      return true;
    }

    if(req.method === 'GET' && url.pathname === '/api/tasks'){
      const actor = authenticate(req);
      json(res, 200, { tasks:store.listTasks(actor, { status:url.searchParams.get('status') || undefined, limit:url.searchParams.get('limit') || 300 }) });
      return true;
    }

    if(req.method === 'POST' && url.pathname === '/api/tasks'){
      const actor = authenticate(req);
      const body = await readBody(req);
      const result = store.createTask(body, actor);
      fanoutBundles(result);
      json(res, result.duplicate ? 200 : 201, { task:result.task, recipients:result.recipients, duplicate:result.duplicate });
      return true;
    }

    m = url.pathname.match(/^\/api\/tasks\/([^/]+)\/claim$/);
    if(req.method === 'POST' && m){
      const actor = authenticate(req, { allowAdmin:false, requireAgent:true });
      const result = store.claimTask(decodeURIComponent(m[1]), actor);
      fanoutBundles(result);
      json(res, 200, { task:result.task, duplicate:result.duplicate });
      return true;
    }

    m = url.pathname.match(/^\/api\/tasks\/([^/]+)\/assign$/);
    if(req.method === 'POST' && m){
      const actor = authenticate(req);
      if(actor.kind !== 'admin') throw Object.assign(new Error('admin token required'), { statusCode:403 });
      const body = await readBody(req);
      const result = store.assignTask(decodeURIComponent(m[1]), String(body.agent_id || '').trim());
      fanoutBundles(result);
      json(res, 200, { task:result.task });
      return true;
    }

    m = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
    if(req.method === 'PATCH' && m){
      const actor = authenticate(req);
      const body = await readBody(req);
      const result = store.updateTask(decodeURIComponent(m[1]), body, actor);
      fanoutBundles(result);
      json(res, 200, { task:result.task });
      return true;
    }

    m = url.pathname.match(/^\/api\/agents\/([^/]+)\/inbox$/);
    if(req.method === 'GET' && m){
      const actor = authenticate(req);
      const target = decodeURIComponent(m[1]);
      if(actor.kind !== 'admin' && actor.id !== target) throw Object.assign(new Error('cannot read another agent inbox'), { statusCode:403 });
      json(res, 200, { items:store.pendingForAgent(target, url.searchParams.get('limit') || 100) });
      return true;
    }

    m = url.pathname.match(/^\/api\/deliveries\/([^/]+)\/ack$/);
    if(req.method === 'POST' && m){
      const actor = authenticate(req, { allowAdmin:false, requireAgent:true });
      json(res, 200, { delivery:store.ackDelivery(decodeURIComponent(m[1]), actor.id) });
      return true;
    }

    m = url.pathname.match(/^\/api\/deliveries\/([^/]+)\/fail$/);
    if(req.method === 'POST' && m){
      const actor = authenticate(req, { allowAdmin:false, requireAgent:true });
      const body = await readBody(req);
      json(res, 200, { delivery:store.failDelivery(decodeURIComponent(m[1]), actor.id, body.error || '') });
      return true;
    }

    m = url.pathname.match(/^\/api\/deliveries\/([^/]+)\/context$/);
    if(req.method === 'GET' && m){
      const actor = authenticate(req);
      json(res, 200, store.contextForDelivery(decodeURIComponent(m[1]), actor));
      return true;
    }

    if(req.method === 'GET' && url.pathname === '/api/events/stream'){
      const actor = authenticate(req, { allowAdmin:false, requireAgent:true });
      res.writeHead(200, {
        'Content-Type':'text/event-stream; charset=utf-8',
        'Cache-Control':'no-cache, no-transform',
        'Connection':'keep-alive',
        'X-Accel-Buffering':'no',
      });
      res.write(`event: ready\ndata: ${JSON.stringify({ agent_id:actor.id, time:new Date().toISOString() })}\n\n`);
      let set = streams.get(actor.id);
      if(!set){ set = new Set(); streams.set(actor.id, set); }
      set.add(res);
      store.touchAgent(actor.id);
      for(const item of store.pendingForAgent(actor.id, 100)) sendDelivery(actor.id, item);
      const keepalive = setInterval(() => { try{ res.write(`: keepalive ${Date.now()}\n\n`); }catch{} }, 20000);
      req.on('close', () => {
        clearInterval(keepalive);
        set.delete(res);
        if(!set.size) streams.delete(actor.id);
      });
      return true;
    }

    return false;
  }

  function serveStatic(req, res, url){
    if(req.method !== 'GET' && req.method !== 'HEAD') return false;
    let rel = decodeURIComponent(url.pathname);
    if(rel === '/') rel = '/index.html';
    const full = path.resolve(rootDir, `.${rel}`);
    if(!full.startsWith(rootDir + path.sep) && full !== rootDir){ json(res, 403, { error:'forbidden' }); return true; }
    if(!fs.existsSync(full) || !fs.statSync(full).isFile()) return false;
    const stat = fs.statSync(full);
    res.writeHead(200, { 'Content-Type':MIME[path.extname(full).toLowerCase()] || 'application/octet-stream', 'Content-Length':stat.size, 'Cache-Control':'no-cache' });
    if(req.method === 'HEAD'){ res.end(); return true; }
    fs.createReadStream(full).pipe(res);
    return true;
  }

  const server = http.createServer(async (req, res) => {
    writeCors(req, res);
    const url = new URL(req.url || '/', 'http://localhost');
    try{
      if(url.pathname.startsWith('/api/')){
        const handled = await handleApi(req, res, url);
        if(!handled) json(res, 404, { error:'not found' });
        return;
      }
      if(serveStatic(req, res, url)) return;
      json(res, 404, { error:'not found' });
    }catch(err){
      const status = Number(err.statusCode) || 500;
      if(status >= 500) console.error('[blackboard]', err);
      if(!res.headersSent) json(res, status, { error:err.message || 'server error' });
      else try{ res.end(); }catch{}
    }
  });

  return { server, store, adminToken, generatedAdminToken, rootDir, dataFile, agentsWithPresence };
}

if(require.main === module){
  const host = process.env.BLACKBOARD_HOST || '0.0.0.0';
  const port = Number(process.env.BLACKBOARD_PORT || 8787);
  const app = createBlackboardServer();
  app.server.listen(port, host, () => {
    console.log(`[blackboard] Stark Blackboard listening on http://${host}:${port}`);
    console.log(`[blackboard] Serving UI from ${app.rootDir}`);
    console.log(`[blackboard] Data file: ${app.dataFile}`);
    if(app.generatedAdminToken){
      console.log('[blackboard] BLACKBOARD_ADMIN_TOKEN was not set. Generated an ephemeral admin token for this run:');
      console.log(app.adminToken);
      console.log('[blackboard] Set BLACKBOARD_ADMIN_TOKEN to a stable secret before using this across a network.');
    }
  });
}

module.exports = { createBlackboardServer };
