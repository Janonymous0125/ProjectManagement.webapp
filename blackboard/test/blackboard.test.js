'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { createBlackboardServer } = require('../server');
const { parseActions } = require('../agent-bridge');

async function startHarness(){
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stark-bb-'));
  const dataFile = path.join(dir, 'blackboard.json');
  const app = createBlackboardServer({ dataFile, adminToken:'test-admin-token', rootDir:path.join(__dirname, '..', '..', 'ProjectManagement') });
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const port = app.server.address().port;
  const base = `http://127.0.0.1:${port}`;
  async function req(method, route, { token='test-admin-token', agentId=null, body } = {}){
    const headers = { Authorization:`Bearer ${token}` };
    if(agentId) headers['X-Agent-Id'] = agentId;
    if(body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${base}${route}`, { method, headers, body:body === undefined ? undefined : JSON.stringify(body) });
    let data = {};
    try{ data = await res.json(); }catch{}
    return { res, data };
  }
  async function register(id, capabilities=[]){
    const { res, data } = await req('POST', '/api/agents/register', { body:{ id, name:id, capabilities } });
    assert.equal(res.status, 201);
    return { id, token:data.token };
  }
  return { app, base, req, register, close:async () => { app.server.close(); await once(app.server, 'close'); fs.rmSync(dir, { recursive:true, force:true }); } };
}

async function inbox(h, agent){
  const { res, data } = await h.req('GET', `/api/agents/${agent.id}/inbox`, { token:agent.token, agentId:agent.id });
  assert.equal(res.status, 200);
  return data.items;
}

test('public messages wake every other agent, never the sender', async t => {
  const h = await startHarness(); t.after(h.close);
  const codex = await h.register('codex', ['code']);
  const claude = await h.register('claude-code', ['code']);
  const pi = await h.register('pi', ['reasoning']);

  const posted = await h.req('POST', '/api/messages', { token:codex.token, agentId:codex.id, body:{ scope:'public', channel:'general', body:'Review the new plan.' } });
  assert.equal(posted.res.status, 201);
  assert.deepEqual(new Set(posted.data.recipients), new Set(['claude-code','pi']));
  assert.equal((await inbox(h, codex)).length, 0);
  assert.equal((await inbox(h, claude))[0].event.type, 'message.created');
  assert.equal((await inbox(h, pi))[0].event.payload.message.body, 'Review the new plan.');
});

test('private messages wake only the target agent', async t => {
  const h = await startHarness(); t.after(h.close);
  const codex = await h.register('codex');
  const claude = await h.register('claude-code');
  const pi = await h.register('pi');

  const posted = await h.req('POST', '/api/messages', { token:claude.token, agentId:claude.id, body:{ scope:'private', target_agent_id:'pi', body:'Can you inspect this edge case?' } });
  assert.equal(posted.res.status, 201);
  assert.deepEqual(posted.data.recipients, ['pi']);
  assert.equal((await inbox(h, codex)).length, 0);
  assert.equal((await inbox(h, claude)).length, 0);
  assert.equal((await inbox(h, pi)).length, 1);
});

test('task claiming is atomic and only the winner receives task.assigned', async t => {
  const h = await startHarness(); t.after(h.close);
  const codex = await h.register('codex', ['code']);
  const claude = await h.register('claude-code', ['code']);
  const pi = await h.register('pi', ['code']);

  const created = await h.req('POST', '/api/tasks', { token:codex.token, agentId:codex.id, body:{ title:'Implement parser', description:'Add a deterministic parser.', required_capabilities:['code'] } });
  assert.equal(created.res.status, 201);
  const taskId = created.data.task.id;

  const [a,b] = await Promise.all([
    h.req('POST', `/api/tasks/${taskId}/claim`, { token:claude.token, agentId:claude.id, body:{} }),
    h.req('POST', `/api/tasks/${taskId}/claim`, { token:pi.token, agentId:pi.id, body:{} }),
  ]);
  const statuses = [a.res.status, b.res.status].sort();
  assert.deepEqual(statuses, [200,409]);
  const winner = a.res.status === 200 ? claude : pi;
  const loser = a.res.status === 200 ? pi : claude;
  assert.equal(a.res.status === 200 ? a.data.task.claimed_by : b.data.task.claimed_by, winner.id);

  const winnerInbox = await inbox(h, winner);
  assert.ok(winnerInbox.some(x => x.event.type === 'task.assigned'));
  const loserInbox = await inbox(h, loser);
  assert.ok(!loserInbox.some(x => x.event.type === 'task.assigned'));
});

test('capability-targeted tasks only wake eligible agents', async t => {
  const h = await startHarness(); t.after(h.close);
  const codex = await h.register('codex', ['code','security']);
  const claude = await h.register('claude-code', ['code']);
  const pi = await h.register('pi', ['reasoning']);

  const created = await h.req('POST', '/api/tasks', { body:{ title:'Security review', required_capabilities:['security'] } });
  assert.equal(created.res.status, 201);
  assert.deepEqual(created.data.recipients, ['codex']);
  assert.equal((await inbox(h, codex)).length, 1);
  assert.equal((await inbox(h, claude)).length, 0);
  assert.equal((await inbox(h, pi)).length, 0);
});



test('live SSE stream emits a routed wake delivery', async t => {
  const h = await startHarness(); t.after(h.close);
  const codex = await h.register('codex');
  const claude = await h.register('claude-code');
  const controller = new AbortController();
  t.after(() => controller.abort());

  const streamRes = await fetch(`${h.base}/api/events/stream`, {
    headers:{ Authorization:`Bearer ${claude.token}`, 'X-Agent-Id':claude.id },
    signal:controller.signal,
  });
  assert.equal(streamRes.status, 200);
  const reader = streamRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  async function readWithTimeout(){
    return await Promise.race([
      reader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timed out waiting for SSE data')), 2000)),
    ]);
  }

  async function nextEvent(name){
    while(true){
      let idx = buffer.indexOf('\n\n');
      if(idx < 0){
        const { value, done } = await readWithTimeout();
        if(done) throw new Error('SSE ended unexpectedly');
        buffer += decoder.decode(value, { stream:true });
        continue;
      }
      const block = buffer.slice(0, idx); buffer = buffer.slice(idx + 2);
      const eventLine = block.split(/\r?\n/).find(x => x.startsWith('event:'));
      const eventName = eventLine ? eventLine.slice(6).trim() : 'message';
      if(eventName !== name) continue;
      const data = block.split(/\r?\n/).filter(x => x.startsWith('data:')).map(x => x.slice(5).trim()).join('\n');
      return data ? JSON.parse(data) : {};
    }
  }

  await nextEvent('ready');
  const posted = await h.req('POST', '/api/messages', { token:codex.token, agentId:codex.id, body:{ scope:'public', body:'Wake test' } });
  assert.equal(posted.res.status, 201);
  const wake = await nextEvent('blackboard');
  assert.equal(wake.event.type, 'message.created');
  assert.equal(wake.event.payload.message.body, 'Wake test');
  assert.ok(wake.delivery_id.startsWith('del_'));
  controller.abort();
});

test('bridge action envelopes are strict and noop safely when absent', () => {
  assert.deepEqual(parseActions('ordinary output').actions, [{ type:'noop' }]);
  const parsed = parseActions('x\nBLACKBOARD_ACTIONS_BEGIN\n{"actions":[{"type":"claim_task","task_id":"t1"}]}\nBLACKBOARD_ACTIONS_END\ny');
  assert.equal(parsed.actions[0].type, 'claim_task');
  assert.equal(parsed.actions[0].task_id, 't1');
});
