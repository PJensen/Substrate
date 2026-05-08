# Agents: Architecture & Semantics

## Context

Substrate's agent layer is thin but intentional. Agents are ECS entities with capability declarations and budget constraints. They don't execute directly; instead, they declare *what they can do* and the world routes work to them.

---

## AgentEntity & AgentState

### Components

**AgentEntity** archetype:
```js
Node { kind: "Agent" }
Name { value: "Planner" }
AgentState { role: "planner", busy: false, budget: 1 }
Capability { items: ["decompose", "prioritize"] }
```

**AgentState fields:**
- `role` — semantic label (e.g., "planner", "retriever", "writer")
- `busy` — currently executing (future: block concurrent assignments)
- `budget` — execution budget per session (future: tracking)

**Capability:**
- `items: []` — list of capability strings (e.g., `["decompose", "prioritize"]`)

### In main.js

```js
const plannerAgentId = createFrom(world, AgentEntity, {
  name: "Planner",
  role: "planner",
  capabilities: ["decompose", "prioritize"],
});
```

---

## Agent Responsibilities (Today)

No dedicated agent system. Agent work is distributed across task systems:

1. **PlanningSystem** — agent-independent; decomposes tasks into subtasks
2. **ToolRoutingSystem** — matches tasks to tools, not agents
3. **ExecutionSystem** — runs tasks against matched tools

Agents are *declared* (entity + capability) but not *scheduled*. Future: agent selection + constraint propagation.

---

## Capability Declarations

Capabilities are semantic tags. No validation against actual system abilities.

**Intended use:**
- Agent declares capabilities (e.g., `["decompose", "prioritize"]`)
- Planner checks agent.capabilities before assigning decomposition tasks
- Execution respects agent.budget before starting work

**Current gap:** Capabilities unused in systems. Task assignment is tool-based, not agent-based.

---

## Budget & Concurrency (Future)

**Budget:** per-session execution units. Example:
```js
const agent = world.get(agentId, AgentState);
if (agent.budget > 0) {
  // execute task
  world.set(agentId, AgentState, { budget: agent.budget - 1 });
}
```

**Busy flag:** prevent concurrent execution.
```js
if (agent.busy) continue; // skip task
world.set(agentId, AgentState, { busy: true });
// ... execute
world.set(agentId, AgentState, { busy: false });
```

Not yet implemented. Systems don't check or decrement.

---

## Semantic Distinction: Agent vs Tool

**Tool:** bound to concrete capability (e.g., `ToolState { supports: ["analyze-document"] }`). Execution is deterministic.

**Agent:** bound to *semantic role* (e.g., `AgentState { role: "planner" }`). Execution is contextual (what to decompose, when, how).

**Artifact:** knowledge resource with retrieval metadata.

**Task:** unit of work routed through the world. Can be assigned to agents or tools.

---

## Future: Agent-Driven Planning

### Current (tool-driven)
1. Task created with target artifact
2. ToolRoutingSystem finds online tool supporting task.kind
3. ExecutionSystem runs tool

### Proposed (agent + tool)
1. Task created; marks required capabilities (e.g., "decompose", "prioritize")
2. **AgentRoutingSystem** finds agent with matching capabilities + budget
3. Agent *decides* how to decompose/prioritize (calls planner logic)
4. Planner routes subtasks to tools
5. ExecutionSystem runs tools under agent direction
6. Budget decremented; agent marked done

**Benefit:** agents act as *decision makers*, not executors. Tools remain stateless workers.

---

## Integration Notes

### Registry
AgentEntity is in archetypes.js but not yet part of buildRegistry() — agents are never serialized in snapshots (only declared at init). If future snapshots should preserve agent state (budget, busy), add to registry.

### Event Sourcing
AgentState mutations (budget decrement, busy toggle) are emitted as `cmp_set` events. Budget history is fully auditable.

### Virtuals
SessionContext assembles artifacts and tasks, but no agent view. Future: `AgentContext` virtual showing assigned tasks + budget spent.

---

## Known Gaps

- Capabilities declared but never checked
- Budget never enforced or decremented
- No agent selection logic (task assignment is tool-only)
- Busy flag not consulted
- No agent lifecycle (creation, retirement, performance metrics)

All addressable in next phase without refactoring core ECS.
