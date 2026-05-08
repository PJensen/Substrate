import {
  World,
  createFrom,
  composeScheduler,
  createVirtualRegistry,
  attach,
  children,
  getParent,
  serializeWorld,
} from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";

import {
  Node,
  Name,
  Goal,
  Constraint,
  SessionState,
  AgentState,
  Capability,
  ToolState,
  DocumentState,
  Summary,
  Facts,
  MessageState,
  MemoryNote,
  TaskState,
  Attention,
} from "./components.js";

import {
  ProjectEntity,
  SessionEntity,
  AgentEntity,
  ToolEntity,
  DocumentEntity,
  TaskEntity,
  MessageEntity,
  MemoryEntity,
  GoalEntity,
  ConstraintEntity,
} from "./archetypes.js";

import { registerVirtuals } from "./virtuals.js";
import {
  IndexDocumentsSystem,
  PlanningSystem,
  ToolRoutingSystem,
  ExecutionSystem,
  AttentionSystem,
  PersistenceSystem,
  } from "./systems/index.js";
import { getLastSnapshot } from "./systems/index.js";

/*
  ECS-JS AS A STATEFUL RUNTIME ENVIRONMENT

  Domain nouns become entities:
    Project
    Session
    Agent
    Tool
    Document
    Task
    Message
    Memory

  Components hold durable facts.
  Systems advance the world.
  Hierarchy expresses ownership / containment.
  Virtuals assemble context on demand.
*/

/* Components and archetypes are moved to separate modules:
   - src/components.js
   - src/archetypes.js
*/

/* =========================
   World + virtuals
   ========================= */

const world = new World({ seed: 1337 });

const virtuals = createVirtualRegistry(world);
const { SessionContext } = registerVirtuals(world, virtuals);

/* Systems are moved to `src/systems/*` and imported above. */

/* =========================
   Scheduler
   ========================= */

world.setScheduler(
  composeScheduler(
    IndexDocumentsSystem,
    PlanningSystem,
    ToolRoutingSystem,
    ExecutionSystem,
    AttentionSystem,
    PersistenceSystem
  )
);

/* =========================
   Seed runtime world
   ========================= */

const projectId = createFrom(world, ProjectEntity, {
  name: "Stateful Runtime Environment",
});

const sessionId = createFrom(world, SessionEntity, {
  name: "User Session",
  turn: 1,
});
attach(world, sessionId, projectId);

const goalId = createFrom(world, GoalEntity, {
  text: "Answer the user's question using durable project state.",
});
attach(world, goalId, projectId);

const constraintId = createFrom(world, ConstraintEntity, {
  text: "Prefer inspectable state transitions over opaque prompt stuffing.",
  hard: true,
});
attach(world, constraintId, projectId);

const plannerAgentId = createFrom(world, AgentEntity, {
  name: "Planner",
  role: "planner",
  capabilities: ["decompose", "prioritize"],
});
attach(world, plannerAgentId, projectId);

const retrieverToolId = createFrom(world, ToolEntity, {
  name: "Retriever",
  supports: ["analyze-document"],
  latencyMs: 40,
});
attach(world, retrieverToolId, projectId);

const writerToolId = createFrom(world, ToolEntity, {
  name: "Writer",
  supports: ["draft-answer"],
  latencyMs: 25,
});
attach(world, writerToolId, projectId);

const docId = createFrom(world, DocumentEntity, {
  title: "Product Spec",
  uri: "drive://specs/stateful-runtime-v1",
  trust: 0.92,
});
attach(world, docId, projectId);

const userMsgId = createFrom(world, MessageEntity, {
  role: "user",
  text: "Can you draft one of these for me using ecs-js?",
  turn: 1,
});
attach(world, userMsgId, sessionId);

const rootTaskId = createFrom(world, TaskEntity, {
  name: "Answer current user request",
  kind: "answer-user",
  status: "new",
  priority: 100,
  target: docId,
  session: sessionId,
  input: "User wants a runtime sketch implemented with ecs-js.",
});
attach(world, rootTaskId, projectId);

/* =========================
   Run a few steps
   ========================= */

for (let i = 0; i < 3; i++) {
  world.tick(1);

  console.log(`\n=== STEP ${world.step} ===`);
  console.log("SESSION CONTEXT");
  console.log(JSON.stringify(virtuals.get(sessionId, SessionContext), null, 2));
}

console.log("\n=== SNAPSHOT ===");
console.log(JSON.stringify(getLastSnapshot(), null, 2));
