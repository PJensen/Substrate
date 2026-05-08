import {
  World,
  makeRegistry,
} from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";

import {
  Parent,
  Sibling,
} from "https://raw.githubusercontent.com/pjensen/ecs-js/main/hierarchy.js";

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

import { SnapshotStore } from "./snapshotStore.js";

// Build component registry needed for World.fromSnapshot()
export function buildRegistry() {
  return makeRegistry(
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
    Parent,
    Sibling
  );
}

// Fork: create independent World from snapshot at step
// Source world and store are unchanged
export function fork(store, step) {
  const entry = store.get(step);
  const registry = buildRegistry();
  const forkedWorld = World.fromSnapshot(entry.snapshot, registry);

  // CRITICAL: world.load() and World.fromSnapshot() do NOT restore world.step
  forkedWorld.step = step;
  forkedWorld.time = entry.snapshot.meta.time ?? 0;

  return forkedWorld;
}

// Rollback: restore world in-place to a prior step
// Mutates world, but does NOT truncate history (can rollback again)
export function rollback(store, world, step) {
  const entry = store.get(step);

  world.load(entry.snapshot);
  // CRITICAL: world.load() does NOT restore world.step
  world.step = step;
  world.time = entry.snapshot.meta.time ?? 0;

  return step;
}

// Branch: create new timeline (fork world + duplicate store)
// Returns {store: SnapshotStore, world: World}
export function branch(store, world, name) {
  // Find current step
  const currentStep = world.step;

  // Fork world at current step
  const branchedWorld = fork(store, currentStep);

  // Duplicate store (new independent history)
  const branchedStore = new SnapshotStore(store.maxSnapshots);

  // Copy snapshots up to current step into new store
  for (const { step, snapshot } of store.entries()) {
    if (step <= currentStep) {
      branchedStore.record(step, snapshot);
    }
  }

  return { store: branchedStore, world: branchedWorld };
}
