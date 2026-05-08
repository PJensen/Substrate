import { assertEquals, assertExists } from "https://deno.land/std@0.203.0/testing/asserts.ts";
import { EventLog, appendEventsToFile, streamEvents } from "../eventLog.js";
import { SnapshotStore } from "../snapshotStore.js";
import { buildRegistry, fork } from "../transactionOps.js";
import { applyEvent, replayFromCheckpoint } from "../eventReplayer.js";
import {
  World,
  createFrom,
  composeScheduler,
  serializeWorld,
} from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";
import {
  SessionEntity,
  TaskEntity,
} from "../archetypes.js";
import { TaskState, Attention } from "../components.js";

// === EventLog: in-memory collection ===

Deno.test("EventLog: emit and drain", () => {
  const log = new EventLog();
  assertEquals(log.size(), 0);

  log.emit(1, "cmp_set", { id: 5, cmp: "TaskState", data: { status: "done" } });
  assertEquals(log.size(), 1);

  const events = log.drain();
  assertEquals(events.length, 1);
  assertEquals(events[0].t, "cmp_set");
  assertEquals(events[0].s, 1);
  assertEquals(events[0].o, 0);
  assertEquals(log.size(), 0);
});

Deno.test("EventLog: ordinal increments across emits", () => {
  const log = new EventLog();
  log.emit(1, "cmp_set", { id: 5, cmp: "TaskState", data: {} });
  log.emit(1, "entity_attach", { child: 5, par: 1 });
  log.emit(1, "cmp_add", { id: 3, cmp: "Facts", data: {} });

  const events = log.drain();
  assertEquals(events[0].o, 0);
  assertEquals(events[1].o, 1);
  assertEquals(events[2].o, 2);
});

Deno.test("EventLog: drain resets ordinal", () => {
  const log = new EventLog();
  log.emit(1, "cmp_set", { id: 5, cmp: "TaskState", data: {} });
  log.drain();

  log.emit(2, "cmp_set", { id: 5, cmp: "TaskState", data: {} });
  const events = log.drain();
  assertEquals(events[0].o, 0);
});

// === JSONL I/O ===

Deno.test("appendEventsToFile and streamEvents", async () => {
  const filePath = ".test-events.jsonl";

  // Clean up any prior test file
  try {
    await Deno.remove(filePath);
  } catch {
    // file doesn't exist, ok
  }

  const events = [
    { t: "cmp_set", s: 1, o: 0, id: 5, cmp: "TaskState", data: { status: "done" } },
    { t: "entity_attach", s: 1, o: 1, child: 5, par: 1 },
    { t: "cmp_set", s: 2, o: 0, id: 5, cmp: "Attention", data: { score: 100 } },
  ];

  await appendEventsToFile(events, filePath);

  // Stream all events
  const allEvents = [];
  for await (const event of streamEvents(filePath)) {
    allEvents.push(event);
  }
  assertEquals(allEvents.length, 3);
  assertEquals(allEvents[0].t, "cmp_set");

  // Stream filtered by step range
  const step2Events = [];
  for await (const event of streamEvents(filePath, 2, 2)) {
    step2Events.push(event);
  }
  assertEquals(step2Events.length, 1);
  assertEquals(step2Events[0].s, 2);

  // Clean up
  await Deno.remove(filePath);
});

// === applyEvent ===

Deno.test("applyEvent: cmp_set mutates world", () => {
  const world = new World({ seed: 42 });
  const registry = buildRegistry();

  // Create an entity
  const taskId = createFrom(world, TaskEntity, {
    name: "Test task",
    kind: "analyze-document",
    status: "ready",
    priority: 10,
  });

  // Apply a cmp_set event
  const event = {
    t: "cmp_set",
    id: taskId,
    cmp: "TaskState",
    data: { status: "done", output: "result" },
  };

  applyEvent(world, event, registry);

  const task = world.get(taskId, TaskState);
  assertEquals(task.status, "done");
  assertEquals(task.output, "result");
});

Deno.test("applyEvent: cmp_add adds component to entity", () => {
  const world = new World({ seed: 42 });
  const registry = buildRegistry();

  const sessionId = createFrom(world, SessionEntity, {
    name: "Test session",
    turn: 1,
  });

  // Apply a cmp_add event
  const event = {
    t: "cmp_add",
    id: sessionId,
    cmp: "Attention",
    data: { score: 25 },
  };

  applyEvent(world, event, registry);

  const attn = world.get(sessionId, Attention);
  assertExists(attn);
  assertEquals(attn.score, 25);
});

// === replayFromCheckpoint ===

Deno.test("replayFromCheckpoint: simulated tick + replay", async () => {
  const filePath = ".test-replay.jsonl";
  const store = new SnapshotStore({ maxSnapshots: 10 });

  // Clean up
  try {
    await Deno.remove(filePath);
  } catch {}

  // Create world and checkpoint at step 1
  const world = new World({ seed: 42 });
  world.setScheduler(
    composeScheduler((w) => {
      if (w.step === 1) {
        // Simulate some mutations at step 1
        for (const [id, task] of w.query(TaskState)) {
          w.set(id, TaskState, { status: "running" });
        }
      }
    })
  );

  const taskId = createFrom(world, TaskEntity, {
    name: "Test",
    kind: "analyze-document",
    status: "ready",
    priority: 5,
  });

  // Step 1: snapshot baseline
  world.tick(1);
  const snapshot1 = serializeWorld(world, { note: "checkpoint at step 1" });
  store.record(1, snapshot1);

  // Step 2: mutate via event (would normally be in event log)
  const events = [
    {
      t: "cmp_set",
      s: 2,
      o: 0,
      id: taskId,
      cmp: "TaskState",
      data: { status: "done", output: "done" },
    },
  ];
  await appendEventsToFile(events, filePath);

  // Replay from checkpoint 1 to step 2
  const replayedWorld = await replayFromCheckpoint(store, filePath, 2);

  // Verify: replayed world should have the mutated state
  assertEquals(replayedWorld.step, 1); // from checkpoint
  const replayedTask = replayedWorld.get(taskId, TaskState);
  assertEquals(replayedTask.status, "done");
  assertEquals(replayedTask.output, "done");

  // Clean up
  await Deno.remove(filePath);
});
