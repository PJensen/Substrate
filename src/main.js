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
import { EventLog } from "./eventLog.js";
import { replayFromCheckpoint } from "./eventReplayer.js";

import {
  Node,
  Name,
  Goal,
  Constraint,
  SessionState,
  AgentState,
  Capability,
  ToolState,
  ArtifactState,
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
  Artifact,
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
import { getLastSnapshot } from "./systems/persistenceSystem.js";

import { SnapshotStore } from "./snapshotStore.js";
import { fork, rollback, branch } from "./transactionOps.js";

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
   Snapshot Store & Event Log
   ========================= */

const store = new SnapshotStore({ maxSnapshots: 50 });
const eventLog = new EventLog();
const eventsPath = "substrate.events.jsonl";

/* =========================
   Scheduler
   ========================= */

world.setScheduler(
  composeScheduler(
    (world, dt) => IndexDocumentsSystem(world, dt, eventLog),
    (world, dt) => PlanningSystem(world, dt, eventLog),
    (world, dt) => ToolRoutingSystem(world, dt, eventLog),
    (world, dt) => ExecutionSystem(world, dt, eventLog),
    (world, dt) => AttentionSystem(world, dt, eventLog),
    (world, dt) => PersistenceSystem(world, dt, store, eventLog, eventsPath, { checkpointInterval: 1 })
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

const docId = createFrom(world, Artifact, {
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

/* =========================
   Transactional History Demo
   ========================= */

console.log("\n=== SNAPSHOT HISTORY ===");
console.log("Steps:", store.listSteps().join(", "));

console.log("\n=== ROLLBACK to step 1 ===");
rollback(store, world, 1);
console.log(`World is now at step ${world.step}`);

console.log("\n=== FORK from step 2 ===");
const forkedWorld = fork(store, 2);
console.log(`Forked world step: ${forkedWorld.step}`);

console.log("\n=== BRANCH from current state ===");
const { store: branchedStore, world: branchedWorld } = branch(store, world);
console.log(`Branched store has ${branchedStore.size()} snapshots`);
console.log(`Branched world step: ${branchedWorld.step}`);

console.log("\n=== FINAL SNAPSHOT (after rollback) ===");
const lastSnap = getLastSnapshot(store);
if (lastSnap) {
  console.log(JSON.stringify(lastSnap, null, 2));
}

/* =========================
   Event Sourcing Demo
   ========================= */

console.log("\n=== EVENT SOURCING REPLAY ===");
try {
  const replayedWorld = await replayFromCheckpoint(store, eventsPath, 2);
  console.log(`Replayed world at step 2: step=${replayedWorld.step}`);

  // Verify a component state from replayed world
  const replayedSessionContext = virtuals.get(sessionId, SessionContext);
  console.log(`Replayed session focus: ${replayedSessionContext.focus}`);
} catch (err) {
  console.log(`Replay demo skipped (events file may not exist yet): ${err.message}`);
}
