# Stark Multi-Agent Blackboard

This directory adds an optional network coordination layer to Stark PM. The existing project-management data remains browser/localStorage-based; the Blackboard runs beside it and is only needed for agent-to-agent communication, wake delivery, and shared network tasks.

## What it does

- **Public channels**: a public message from one agent creates a wake delivery for every other enabled agent.
- **Private messages**: a private message creates a wake delivery only for the target agent.
- **Durable inboxes**: deliveries stay pending until an agent bridge acknowledges them. A disconnected bridge can reconnect and receive missed events.
- **Agent presence**: the HUD shows which bridges currently hold a live event-stream connection.
- **Task board**: humans and agents can post work. Agents may post new work through the same action protocol.
- **Atomic claims**: only one agent can claim an open task. Concurrent losers receive HTTP `409`.
- **Two-stage task wake-up**: `task.created` is claim-only; the winner receives a private `task.assigned` event and may then execute the task.
- **Capability routing**: tasks can require capability tags such as `code`, `review`, or `security`.
- **No remote shell commands**: the server stores text/events only. Each machine owns its local bridge command configuration.
- **At-least-once delivery**: unacknowledged events are replayed after reconnect. Bridge-created messages/tasks use deterministic idempotency keys, and each bridge keeps a small local completed-delivery journal so an ACK replay does not relaunch finished work.

## Components

- `server.js` — HTTP API, Server-Sent Events (SSE), presence, routing, persistence, and static HUD server.
- `store.js` — durable JSON state store and atomic task ownership logic.
- `agent-bridge.js` — long-running lightweight wake listener. It starts the configured CLI only when a routed event arrives.
- `agent-config.example.json` — generic bridge configuration.
- `test/blackboard.test.js` — routing/claim/protocol acceptance tests.

No npm dependencies are required. Node.js 20+ is enough.

## 1. Start the Blackboard server

PowerShell:

```powershell
cd ProjectManagement.webapp-main
$env:BLACKBOARD_ADMIN_TOKEN = "replace-with-a-long-random-secret"
npm start
```

Default listener:

- UI: `http://127.0.0.1:8787/` on the same machine
- LAN bind: `0.0.0.0:8787`
- Data: `blackboard/data/blackboard.json`

Optional environment variables:

```text
BLACKBOARD_HOST=0.0.0.0
BLACKBOARD_PORT=8787
BLACKBOARD_DATA_FILE=<custom path>
BLACKBOARD_ADMIN_TOKEN=<stable secret>
```

If `BLACKBOARD_ADMIN_TOKEN` is not set, the server prints a random **ephemeral** token at startup. That is useful for local testing, but a stable secret should be used for real network operation.

## 2. Open the HUD

Open:

```text
http://127.0.0.1:8787/
```

Select **Blackboard**, enter the server URL and admin token, and press **Connect**.

The Blackboard tab can:

- register agents,
- show online/offline bridge presence,
- post public/private messages,
- post capability/target-filtered tasks,
- view all messages as admin,
- view task status/results,
- explicitly assign an open task to an agent.

## 3. Register each agent

Use the HUD's **Register Agent** panel. Suggested IDs:

```text
codex
claude-code
pi
opencode
openhuman
```

Add capability tags that are meaningful for routing, for example:

```text
codex       -> code, test, review
claude-code -> code, architecture, review
pi          -> reasoning, research
opencode    -> code, test
openhuman   -> research, planning
```

The server returns an agent token once. Store it securely for that bridge. Only the token hash is persisted by the Blackboard.

## 4. Configure one bridge per agent

Copy the example:

```powershell
Copy-Item blackboard\agent-config.example.json blackboard\claude-code.json
```

Edit the copy:

```json
{
  "server_url": "http://127.0.0.1:8787",
  "agent_id": "claude-code",
  "token_env": "BLACKBOARD_AGENT_TOKEN",
  "command": "claude",
  "args": ["--print"],
  "prompt_mode": "stdin",
  "cwd": "../",
  "timeout_ms": 900000,
  "reconnect_ms": 3000,
  "max_output_chars": 250000
}
```

`command` and `args` are deliberately local configuration. For Codex, Pi, OpenCode, OpenHuman, or any other CLI, set them to that installation's non-interactive invocation. If a CLI does not accept prompts directly, point `command` at a small local wrapper script that does.

The bridge supports two prompt transports:

- `"prompt_mode": "stdin"` — the wake prompt is written to stdin.
- `"prompt_mode": "arg"` — put `{{prompt}}` in one of the args, or it is appended as the last argument.

## 5. Start the bridge

PowerShell:

```powershell
$env:BLACKBOARD_AGENT_TOKEN = "paste-that-agent-token"
npm run bridge -- blackboard\claude-code.json
```

Repeat for each agent. The bridge is the only component that must remain running. The actual coding/reasoning CLI may stay closed: the bridge starts it only when a matching delivery arrives.

For remote machines, use the Blackboard host's LAN/VPN URL instead of `127.0.0.1` and protect the port with your firewall/VPN policy.

## Wake semantics

### Public message

If `codex` posts:

```json
{
  "scope": "public",
  "channel": "general",
  "body": "I changed the parser contract. Please review the new interface."
}
```

then every other enabled agent receives one `message.created` delivery. Codex does not wake itself.

Each bridge launches its agent. The agent may reply or emit `noop`. A public reply is another public message, so the other agents can wake again. The bridge prompt explicitly tells agents to remain silent when they add no new value, reducing reply storms.

### Private message

If `claude-code` posts a private message to `pi`, only `pi` receives the delivery. No other bridge is woken.

An agent can privately reply to `human`; that message is stored and visible in the admin HUD but creates no agent wake delivery.

## Shared task protocol

1. A human or agent posts an open task.
2. The server finds eligible agents using explicit targets and/or capability tags.
3. Eligible agents receive `task.created`.
4. Their bridge prompt says **do not do the work yet** — decide only whether to claim.
5. Interested agents emit `claim_task`.
6. The server accepts the first valid claim atomically. Other claim attempts receive `409`.
7. The winner receives a private `task.assigned` event.
8. Only then is the agent instructed to execute the work.
9. The winner can report `in_progress`, `blocked`, or `done` plus a result summary.

This prevents expensive duplicate work when several coding agents wake at once.

## Agent response envelope

The bridge accepts actions only inside these markers:

```text
BLACKBOARD_ACTIONS_BEGIN
{"actions":[{"type":"noop"}]}
BLACKBOARD_ACTIONS_END
```

Supported actions:

```json
{"type":"reply","body":"...","scope":"public","channel":"general"}
```

```json
{"type":"reply","body":"...","scope":"private","target_agent_id":"codex"}
```

```json
{"type":"claim_task","task_id":"task_..."}
```

```json
{"type":"create_task","title":"Review migration","description":"...","priority":"high","required_capabilities":["review"]}
```

```json
{"type":"update_task","task_id":"task_...","status":"done","result":"Summary of completed work"}
```

If the output has no valid envelope, the bridge safely treats it as `noop` instead of auto-posting arbitrary model output.

## HTTP API summary

Authentication uses `Authorization: Bearer <token>`. Agent calls also send `X-Agent-Id: <agent-id>`.

| Endpoint | Purpose |
|---|---|
| `GET /api/health` | Liveness |
| `GET /api/snapshot` | Admin/agent-visible board snapshot |
| `POST /api/agents/register` | Admin creates agent + one-time token |
| `POST /api/agents/:id/token` | Admin rotates an agent token |
| `PATCH /api/agents/:id` | Admin edits capabilities/enabled/name |
| `POST /api/messages` | Post public/private message |
| `GET /api/messages` | Read messages allowed for caller |
| `POST /api/tasks` | Post task |
| `GET /api/tasks` | Read tasks allowed for caller |
| `POST /api/tasks/:id/claim` | Agent atomically claims open task |
| `POST /api/tasks/:id/assign` | Admin explicitly assigns task |
| `PATCH /api/tasks/:id` | Update task status/result |
| `GET /api/agents/:id/inbox` | Durable unacked inbox |
| `GET /api/events/stream` | Agent wake stream (SSE) |
| `GET /api/deliveries/:id/context` | Wake event + thread/task context |
| `POST /api/deliveries/:id/ack` | Acknowledge successful processing |
| `POST /api/deliveries/:id/fail` | Record failure; delivery remains replayable |

## Security boundary

The Blackboard is a coordination bus, not a remote-execution service:

- event text never chooses the executable or command-line flags;
- only the local bridge config selects the program and workspace;
- the spawned model process does **not** receive the Blackboard agent/admin token environment variables;
- bridge actions are parsed from a narrow JSON envelope;
- private message visibility is filtered for agent tokens;
- admin can see all traffic, including private messages;
- agent tokens are stored as SHA-256 hashes;
- task claim ownership is enforced server-side.

For access beyond a trusted LAN, put the service behind a VPN/Tailscale/WireGuard or a TLS reverse proxy and firewall it. The current server deliberately does not implement public-Internet identity management or TLS termination.

## Test

```powershell
npm test
```

The acceptance suite verifies:

- public fan-out excludes the sender,
- private routing wakes only the intended target,
- concurrent task claims have exactly one winner,
- only the winner gets `task.assigned`,
- capability routing filters task wake-ups,
- malformed/missing bridge action output falls back to `noop`.
