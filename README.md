# Substrate

Stateful runtime environment for cognitive work. Durable world state + deterministic execution + event audit trail.

## What is Substrate?

Substrate is not a chat interface. It's a *living world* for AI agents.

When an agent needs to:
- Analyze documents without losing context
- Decompose complex tasks deterministically
- Remember prior work across sessions
- Rollback + explore alternatives
- Create an auditable record of reasoning

…it uses Substrate as its durable working memory.

**Core idea:** State persists. Decisions are recorded. Execution is deterministic. Agents (Claude, GPT, etc.) read the world, reason, and invoke actions—but the world itself carries the work.

## Use Cases

### Durable Agent Memory
LLM agent creates tasks in Substrate. Systems decompose work. Agent reads results, decides next step. Crash? Load snapshot + replay events. No lost context.

### Time-Travel Debugging
Hit a bug mid-workflow. Rollback to step 5. Fork a branch. Test hypothesis. Keep main timeline intact. Explore without consequences.

### Collaborative Reasoning
Multiple Claude instances share one world. SessionContext is the working memory. No chat residue; all state is queryable.

### Audit Trail for AI Work
Every mutation is an event. Event log is JSONL—append-only, immutable. What was analyzed? What was decided? Why? All in the log.

### Structured Task Planning
Task decomposition doesn't rely on LLM calls. ECS systems (Planner, Router, Executor) run deterministically. No hallucination in workflow structure.

### Knowledge Assembly
Index artifacts once. Reuse summaries and facts across turns. No re-processing. Tasks reference concrete entities, not hand-wavy context.

### Multi-Modal Cognitive Work
Entities: tasks, artifacts, messages, memories, agents, tools, constraints, goals. Not just chat. AI reasons over structured state.

### Explore Without Forgetting
Fork → try approach B → rollback if it fails. Original world untouched. Safe exploration.

## Getting Started

### Initialize a world

```sh
deno run --allow-read --allow-write src/cli.js init
```

### Create entities

```sh
# Artifact (document, code, link, etc.)
deno run --allow-read --allow-write src/cli.js create-artifact "My Doc" "https://..." "0.95"

# Task (work to do)
deno run --allow-read --allow-write src/cli.js create-task "analyze-document" "Analyze it" "2"

# Message (input to agent)
deno run --allow-read --allow-write src/cli.js create-message "user" "What's in the doc?"
```

### Execute

```sh
# Run 5 ticks (planning, routing, execution, attention)
deno run --allow-read --allow-write src/cli.js tick 5
```

### Query Results

```sh
# View session context (tasks, artifacts, messages, focus)
deno run --allow-read --allow-write src/cli.js query session:2
```

### Explore

```sh
# Save checkpoint
deno run --allow-read --allow-write src/cli.js snapshot "before-branch"

# Fork world
deno run --allow-read --allow-write src/cli.js fork

# Rewind
deno run --allow-read --allow-write src/cli.js rollback 3

# View history
deno run --allow-read --allow-write src/cli.js list-snapshots
deno run --allow-read --allow-write src/cli.js events
```

## Architecture

### ECS Core
Entity-Component-System model. Entities (tasks, agents, artifacts, etc.). Components (state, metadata). Systems (planning, execution, attention).

### Deterministic Systems
- **PlanningSystem** — decomposes answer-user tasks into analyze + draft subtasks
- **ToolRoutingSystem** — matches tasks to online tools
- **ExecutionSystem** — runs tasks, produces output, creates side effects
- **AttentionSystem** — scores tasks, updates session focus
- **IndexDocumentsSystem** — indexes artifacts, extracts summaries + facts

### Snapshots + Events
Every N ticks, snapshot full world state (configurable). Between snapshots, event log captures every mutation (JSONL format). Crash? Load snapshot + replay events.

### Virtuals
SessionContext: computed on-demand from entity hierarchy. No stale data. Artifacts, tasks, messages, memories, focus—all live views.

## Integration

### CLI (Local Development)
Direct subprocess calls. No HTTP overhead. Minimal serialization.

```sh
deno run --allow-read --allow-write src/cli.js query session:1
deno run --allow-read --allow-write src/cli.js create-task ...
```

### MCP (Claude Code)
Model Context Protocol server. Claude Code calls Substrate via tool_use. The project-scoped config lives in `.mcp.json` at the repo root:

```json
{
  "mcpServers": {
    "substrate": {
      "command": "deno",
      "args": [
        "run",
        "--allow-read",
        "--allow-write",
        "src/substrate-server.ts"
      ],
      "cwd": "/home/pjensen/Repos/Substrate"
    }
  }
}
```

### MCP (Codex)
Codex uses TOML config. The repo-local config lives in `.codex/config.toml`:

```toml
[mcp_servers.substrate]
command = "deno"
args = [
  "run",
  "--allow-read",
  "--allow-write",
  "src/substrate-server.ts",
]
enabled = true
startup_timeout_sec = 10
tool_timeout_sec = 60
```

### Direct SDK (Embedded)
Import as Deno module. Call `world.tick()` directly in agent code.

```js
import { World } from "./src/main.js";
const world = new World();
world.tick(1);
```

## Data Model

### Entities
- **ProjectEntity** — root container
- **SessionEntity** — conversation context
- **TaskEntity** — unit of work
- **Artifact** — knowledge resource (doc, code, link)
- **AgentEntity** — decision maker (declarative; not yet used in execution)
- **ToolEntity** — executor (analyze-document, draft-answer, etc.)
- **MessageEntity** — user/assistant exchange
- **MemoryEntity** — durable facts

### Components
State attached to entities:
- **TaskState** — kind, status, input, output, priority
- **ArtifactState** — title, uri, trust, needsIndex
- **SessionState** — turn, status, focus
- **AgentState** — role, busy, budget
- **ToolState** — name, online, supports[], latency
- **Summary**, **Facts** — indexed knowledge
- **Attention** — task scoring
- **MemoryNote** — semantic facts

### Systems Flow (Per Tick)
1. **Index** — mark artifacts needsIndex→false, add Summary + Facts
2. **Plan** — decompose new tasks into subtasks
3. **Route** — assign tasks to online tools
4. **Execute** — run assigned tasks, produce output
5. **Attend** — score tasks, update session focus
6. **Persist** — snapshot world, drain event log

## Features

- ✅ Durable snapshots + event log
- ✅ Rollback to any step
- ✅ Fork/branch exploration
- ✅ Event sourcing (JSONL audit trail)
- ✅ Sparse checkpointing (events close gaps between snapshots)
- ✅ Deterministic task decomposition
- ✅ CLI tool surface
- 🔜 MCP integration
- 🔜 Agent capability routing
- 🔜 Budget enforcement
- 🔜 Multi-branch merging

## Design Docs

- [Transactional History & Branching](docs/00-transactional-history.md) — snapshot, rollback, fork
- [Event Sourcing](docs/02-event-sourcing.md) — mutation capture, replay, delta compression
- [Agents](docs/03-agents.md) — agent semantics, future routing

## Tests

```sh
deno task test
```

24 tests covering event log, snapshots, transaction ops, and end-to-end workflows.

## Development

```sh
deno task start          # Run 3-tick demo with event logging
deno task test           # Run all tests
deno run --allow-read --allow-write src/cli.js --help  # CLI help
```

## License

MIT (for now; subject to change).
