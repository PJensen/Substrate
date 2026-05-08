# MCP Integration

Substrate integrates with Claude and Codex via Model Context Protocol over stdio.

## Native MCP Server For Claude

Claude Code starts `src/substrate-server.ts` as a long-running MCP server.

### Configuration (`.mcp.json`)

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

Claude Code loads this project-scoped config from `.mcp.json` at the repository root. After adding or changing MCP config, restart Claude Code and approve the project MCP server if prompted.

## Native MCP Server For Codex

Codex uses TOML config under `[mcp_servers]`. This repository includes `.codex/config.toml`:

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

Codex reads MCP server config at startup. Restart Codex from the repository root, then check `/mcp` if available in the client.

### Tool Definitions

Claude automatically exposes these as tools:

```
query_session
create_task
create_artifact
tick
status
```

### Usage in Claude Code

```js
// Claude's tool_use calls the MCP server
{
  "type": "tool_use",
  "name": "create_task",
  "input": {
    "kind": "analyze-document",
    "input": "Analyze the spec",
    "target_id": 2
  }
}
```

The server loads `.substrate/world.json` on startup, keeps the world in memory while Claude is connected, and saves after mutating tool calls.

## Token Efficiency

**Hypothesis:** Substrate reduces token usage by centralizing state assembly. Instead of Claude serializing the world each turn, Substrate queries a persistent pre-assembled state.

### Design vs. Naive Approach

**Naive (stateless Claude loop):**

Each turn, Claude must build context:
- Full artifact text (docs, code snippets)
- Full task descriptions + prior outputs
- Full message history
- All constraints/goals

This context grows with conversation length. After 10 turns with 3 artifacts, context ballooms.

**Substrate (persistent state):**

Claude queries `SessionContext`:
```js
{
  artifacts: [{ title, summary, facts, trust }],  // summary computed once
  openTasks: [...],                                // live query, minimal
  memories: [...],                                 // pre-sorted by weight
  focus: "...",                                    // computed by attention sys
  recentMessages: [...]                            // query on demand
}
```

Artifact summaries are indexed once (src/systems/indexDocumentsSystem.js), never re-processed.
Task descriptions live in ECS state, not serialized.
SessionContext is a view, not a full context dump.

### Architectural Advantage

| Phase | Naive | Substrate |
|-------|-------|-----------|
| **Context Building** | Claude serializes everything | ECS pre-assembles SessionContext |
| **Artifact Processing** | Each turn: full text read | Once: Summary + Facts stored |
| **Tool Results** | Full analysis output in prompt | Minimal JSON; state is queryable |
| **Reasoning Scope** | "Understand everything" | "Decide next action" |

**Key insight:** Summaries and facts are computed once by IndexDocumentsSystem, stored, reused forever. Claude never re-reads or re-analyzes artifacts.

### Measured Claims

We have **proven working**:
- MCP server over stdio (tested with JSON-RPC)
- Multi-turn workflow execution (create artifact → create task → tick → status)
- SessionContext assembly (ECS query returns JSON)
- Persistent state across calls (world.json loads/saves)

**We have NOT measured:**
- Actual token count reductions (would require running full Claude loop)
- Real-world savings on long conversations (requires integration)
- Cost comparison per-turn (hypothetical only)

### Next Steps to Measure Savings

To claim actual token efficiency, we would need to:
1. Wire Claude Code to call `substrate query_session` and `substrate create_task`
2. Run a real multi-turn workflow (e.g., "analyze doc, then design, then implement")
3. Measure tokens used
4. Compare against naive context rebuild approach

That measurement does not exist yet. The design is sound; the proof is pending.

### Why It Should Work (Theoretical)

1. **SessionContext is sparse** — not full artifact text, just summaries
2. **State is persistent** — no rebuild per turn, just query
3. **Indexing is one-time** — summaries extracted once, never repeated
4. **Tool results are minimal** — state is queried separately, not returned

These are architectural properties, not claims. The efficiency depends on Claude's actual usage pattern, which requires real integration to measure.

## Architecture

```
Claude Code
    ↓ (tool_use)
    ↓ "create-task analyze-document"
    ↓
MCP Layer (stdio transport)
    ↓
Substrate MCP server
    ↓ updates in-memory world
    ↓ saves state
    ↓ returns JSON
    ↓
MCP Layer
    ↓ (tool_result)
Claude Code
```

## Example: Multi-Turn Workflow

```
Turn 1: User "Analyze the spec"
  Claude: create-task "analyze-document" target:spec-artifact
  Substrate: task:5 created
  Claude: tick 3
  Substrate: systems execute, task complete
  Claude: query-session
  Substrate: { focus: "analyze doc", tasks: [completed], messages: [] }
  Claude: "Analysis shows..."

Turn 2: User "Compare to version 2?"
  Claude: create-artifact "Spec v2" uri://...
  Claude: create-task "compare-documents" target:v2-artifact
  Claude: tick 3
  Substrate: systems decompose, execute
  Claude: query-session  Substrate: { focus: "compare docs", tasks: [analyze-v1, analyze-v2], messages: [prior analysis...] }
  Claude: "Differences: ..."

Turn 3: User "Actually, explore approach B instead"
  Claude: snapshot "before-b"
  Claude: create-task "explore-approach-b"
  Claude: tick 5
  Substrate: systems execute approach B
  Claude: query-session
  Claude: "Results are [...]"
  Claude: "Compared to approach A: ..." (remembers prior)
```

Full world state persists. No context rebuild. All reasoning auditable in event log.

## Debugging

View events:
```sh
cat substrate.events.jsonl | jq '.[] | {step: .s, type: .t, entity: .id}'
```

Rollback:
```sh
substrate list-snapshots
substrate rollback 3  # back to step 3
substrate tick 5      # resume from there
```

Fork to explore:
```sh
substrate snapshot before-branch
# (make decisions, tick)
# (unsatisfied?)
substrate rollback <snapshot-step>
```

## CLI Fallback

The local CLI is still useful for debugging:

```sh
deno run --allow-read --allow-write src/cli.js status
deno run --allow-read --allow-write src/cli.js query session:1
```
