import {
  World,
  createFrom,
  attach,
  children,
  serializeWorld,
  createVirtualRegistry,
  composeScheduler,
} from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";

import {
  ProjectEntity,
  SessionEntity,
  TaskEntity,
  MessageEntity,
  Artifact,
} from "./archetypes.js";

import { TaskState, MessageState, Name, Node } from "./components.js";
import { SnapshotStore } from "./snapshotStore.js";
import { EventLog, appendEventsToFile, streamEvents } from "./eventLog.js";
import { buildRegistry } from "./transactionOps.js";
import { registerVirtuals } from "./virtuals.js";

// Global state (persisted to disk)
const worldPath = ".substrate/world.json";
const storePath = ".substrate/store.json";
const eventLogPath = "substrate.events.jsonl";

let world = new World({ seed: 1337 });
let store = new SnapshotStore({ maxSnapshots: 100 });
let eventLog = new EventLog();
let virtuals = createVirtualRegistry(world);
let { SessionContext } = registerVirtuals(world, virtuals);

// Load world from disk if it exists
async function loadWorld() {
  try {
    const data = JSON.parse(await Deno.readTextFile(worldPath));
    const registry = buildRegistry();
    world = World.fromSnapshot(data.snapshot, registry);
    world.step = data.step;
    virtuals = createVirtualRegistry(world);
    const virts = registerVirtuals(world, virtuals);
    if (virts.SessionContext) {
      SessionContext = virts.SessionContext;
    }
    // Reinstall scheduler
    installScheduler();
  } catch (err) {
    // No saved world, use fresh one
    installScheduler();
  }
}

function installScheduler() {
  world.setScheduler(
    composeScheduler(
      (w, dt) => IndexDocumentsSystem(w, dt, eventLog),
      (w, dt) => PlanningSystem(w, dt, eventLog),
      (w, dt) => ToolRoutingSystem(w, dt, eventLog),
      (w, dt) => ExecutionSystem(w, dt, eventLog),
      (w, dt) => AttentionSystem(w, dt, eventLog),
      (w, dt) =>
        PersistenceSystem(w, dt, store, eventLog, eventLogPath, {
          checkpointInterval: 1,
        })
    )
  );
}

// Save world to disk
async function saveWorld() {
  const snapshot = serializeWorld(world);
  const data = { snapshot, step: world.step };

  await Deno.mkdir(".substrate", { recursive: true });
  await Deno.writeTextFile(worldPath, JSON.stringify(data, null, 2));
}

// Init systems
import {
  IndexDocumentsSystem,
  PlanningSystem,
  ToolRoutingSystem,
  ExecutionSystem,
  AttentionSystem,
  PersistenceSystem,
} from "./systems/index.js";

world.setScheduler(
  composeScheduler(
    (w, dt) => IndexDocumentsSystem(w, dt, eventLog),
    (w, dt) => PlanningSystem(w, dt, eventLog),
    (w, dt) => ToolRoutingSystem(w, dt, eventLog),
    (w, dt) => ExecutionSystem(w, dt, eventLog),
    (w, dt) => AttentionSystem(w, dt, eventLog),
    (w, dt) =>
      PersistenceSystem(w, dt, store, eventLog, eventsPath, {
        checkpointInterval: 1,
      })
  )
);

// Seed initial world
const projectId = createFrom(world, ProjectEntity, {
  name: "Substrate Project",
});

// Command routing
const cmd = Deno.args[0];
const args = Deno.args.slice(1);

async function main() {
  try {
    // Load existing world first (except for init)
    if (cmd !== "init") {
      await loadWorld();
    }

    switch (cmd) {
      // Query commands
      case "query":
        await handleQuery(args);
        break;

      case "status":
        await handleStatus();
        break;

      case "changed":
        await handleChanged(args);
        break;

      case "events":
        await handleEvents(args);
        break;

      // Mutate commands
      case "create-task":
        await handleCreateTask(args);
        break;

      case "create-artifact":
        await handleCreateArtifact(args);
        break;

      case "create-message":
        await handleCreateMessage(args);
        break;

      // Execute
      case "tick":
        await handleTick(args);
        break;

      case "tick-until-done":
        await handleTickUntilDone(args);
        break;

      // Explore
      case "snapshot":
        await handleSnapshot(args);
        break;

      case "rollback":
        await handleRollback(args);
        break;

      case "fork":
        await handleFork(args);
        break;

      case "list-snapshots":
        await handleListSnapshots();
        break;

      // Admin
      case "init":
        await handleInit(args);
        break;

      default:
        console.error(`Unknown command: ${cmd}`);
        showHelp();
        Deno.exit(1);
    }
  } catch (err) {
    console.error(`Error: ${err.message}`);
    Deno.exit(1);
  }
}

// Command handlers

async function handleQuery(args) {
  const query = args[0];
  const [type, id] = query.split(":");

  switch (type) {
    case "session":
      const ctx = virtuals.get(parseInt(id), SessionContext);
      console.log(JSON.stringify(ctx, null, 2));
      break;

    case "task":
      const task = world.get(parseInt(id), TaskState);
      const name = world.get(parseInt(id), Name);
      console.log(JSON.stringify({ id, name: name?.value, ...task }, null, 2));
      break;

    case "artifact":
      // TODO: implement artifact query
      console.log('{ "status": "artifact query not yet implemented" }');
      break;

    default:
      console.error(`Unknown query type: ${type}`);
      Deno.exit(1);
  }
}

async function handleStatus() {
  console.log(
    JSON.stringify(
      {
        step: world.step,
        projectId,
        store_size: store.size(),
        event_log_size: eventLog.size(),
      },
      null,
      2
    )
  );
}

async function handleChanged(args) {
  const since = parseInt(args[0]) || 0;
  // TODO: implement diff tracking
  console.log(JSON.stringify({ status: "diff not yet implemented" }, null, 2));
}

async function handleEvents(args) {
  try {
    const events = [];
    for await (const event of streamEvents(eventsPath)) {
      events.push(event);
    }
    console.log(JSON.stringify(events, null, 2));
  } catch (err) {
    console.log(JSON.stringify([], null, 2)); // empty if no file
  }
}

async function handleCreateTask(args) {
  const kind = args[0];
  const input = args[1] || "";
  const targetId = args[2] ? parseInt(args[2]) : projectId;

  // Find or create session
  let sessionId = 0;
  for (const [id, node] of world.query(Node)) {
    if (node.kind === "Session") {
      sessionId = id;
      break;
    }
  }

  if (!sessionId) {
    sessionId = createFrom(world, SessionEntity, { name: "CLI Session" });
    attach(world, sessionId, projectId);
  }

  const taskId = createFrom(world, TaskEntity, {
    name: `${kind} task`,
    kind,
    status: "new",
    input,
    target: targetId,
    session: sessionId,
    priority: 50,
  });
  attach(world, taskId, projectId);

  await saveWorld();
  console.log(JSON.stringify({ taskId, kind, status: "created" }, null, 2));
}

async function handleCreateArtifact(args) {
  const title = args[0];
  const uri = args[1] || "";
  const trust = args[2] ? parseFloat(args[2]) : 0.5;

  const artifactId = createFrom(world, Artifact, {
    title,
    uri,
    trust,
  });
  attach(world, artifactId, projectId);

  await saveWorld();
  console.log(
    JSON.stringify({ artifactId, title, uri, trust }, null, 2)
  );
}

async function handleCreateMessage(args) {
  const role = args[0];
  const text = args.slice(1).join(" ");

  let sessionId = 0;
  for (const [id, node] of world.query(Node)) {
    if (node.kind === "Session") {
      sessionId = id;
      break;
    }
  }

  if (!sessionId) {
    sessionId = createFrom(world, SessionEntity, { name: "CLI Session" });
    attach(world, sessionId, projectId);
  }

  const msgId = createFrom(world, MessageEntity, {
    role,
    text,
    turn: 1,
  });
  attach(world, msgId, sessionId);

  await saveWorld();
  console.log(JSON.stringify({ msgId, role, text }, null, 2));
}

async function handleTick(args) {
  const n = parseInt(args[0]) || 1;
  const changed = { before_step: world.step };

  for (let i = 0; i < n; i++) {
    world.tick(1);
  }

  changed.after_step = world.step;
  changed.ticked = n;

  await saveWorld();
  console.log(JSON.stringify(changed, null, 2));
}

async function handleTickUntilDone(args) {
  let ticked = 0;
  const maxTicks = parseInt(args[0]) || 1000;

  while (ticked < maxTicks) {
    const before = world.step;
    world.tick(1);
    ticked++;

    // Check if all tasks are done
    let allDone = true;
    for (const [_, task] of world.query(TaskState)) {
      if (task.status !== "done") {
        allDone = false;
        break;
      }
    }
    if (allDone) break;
  }

  console.log(
    JSON.stringify(
      { step: world.step, ticked, done: true },
      null,
      2
    )
  );
}

async function handleSnapshot(args) {
  const label = args[0] || `snapshot-${world.step}`;
  const snapshot = serializeWorld(world, { note: label });
  store.record(world.step, snapshot);

  console.log(
    JSON.stringify(
      { label, step: world.step, stored: true },
      null,
      2
    )
  );
}

async function handleRollback(args) {
  const step = parseInt(args[0]);
  const entry = store.get(step);
  const registry = buildRegistry();

  const newWorld = World.fromSnapshot(entry.snapshot, registry);
  newWorld.step = step;

  world = newWorld;
  virtuals = createVirtualRegistry(world);
  registerVirtuals(world, virtuals);

  await saveWorld();
  console.log(JSON.stringify({ step, rolled_back: true }, null, 2));
}

async function handleFork(args) {
  const fromStep = args[0] ? parseInt(args[0]) : world.step;
  const entry = store.get(fromStep);
  const registry = buildRegistry();

  const forkedWorld = World.fromSnapshot(entry.snapshot, registry);
  forkedWorld.step = fromStep;

  // For now, just report the fork
  console.log(
    JSON.stringify(
      { forked_from: fromStep, new_step: forkedWorld.step, status: "forked (not persisted)" },
      null,
      2
    )
  );
}

async function handleListSnapshots() {
  const steps = store.listSteps();
  console.log(JSON.stringify({ snapshots: steps, count: steps.length }, null, 2));
}

async function handleInit(args) {
  const seed = args[0] ? parseInt(args[0]) : 1337;
  world = new World({ seed });
  store = new SnapshotStore({ maxSnapshots: 100 });
  eventLog = new EventLog();
  virtuals = createVirtualRegistry(world);

  const projectId = createFrom(world, ProjectEntity, {
    name: "Substrate Project",
  });

  const virts = registerVirtuals(world, virtuals);
  if (virts.SessionContext) {
    SessionContext = virts.SessionContext;
  }

  installScheduler();
  await saveWorld();
  console.log(
    JSON.stringify(
      { seed, projectId, initialized: true },
      null,
      2
    )
  );
}

function showHelp() {
  console.log(`
Substrate CLI

Query:
  substrate query session:ID
  substrate query task:ID
  substrate status
  substrate events
  substrate changed --since STEP

Mutate:
  substrate create-task KIND INPUT [targetId]
  substrate create-artifact TITLE URI [TRUST]
  substrate create-message ROLE TEXT

Execute:
  substrate tick N
  substrate tick-until-done [maxTicks]

Explore:
  substrate snapshot [label]
  substrate rollback STEP
  substrate fork [fromStep]
  substrate list-snapshots

Admin:
  substrate init [seed]
  `);
}

await main();
