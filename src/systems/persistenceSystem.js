import { serializeWorld } from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";
import { appendEventsToFile } from "../eventLog.js";

// PersistenceSystem: capture snapshot and drain events each tick
// Receives SnapshotStore, EventLog, eventsPath, and options
export function PersistenceSystem(
  world,
  _dt,
  store,
  eventLog,
  eventsPath,
  options = {}
) {
  const { checkpointInterval = 1 } = options;

  // Only snapshot at checkpoint interval
  if (store && world.step % checkpointInterval === 0) {
    const snapshot = serializeWorld(world, {
      note: `checkpoint at step ${world.step}`,
    });
    store.record(world.step, snapshot);
  }

  // Drain and persist events (non-blocking fire-and-forget)
  if (eventLog && eventsPath) {
    const events = eventLog.drain();
    appendEventsToFile(events, eventsPath).catch((err) => {
      console.error("Failed to append events to file:", err);
    });
  }
}

// Helper: get last snapshot from store
export function getLastSnapshot(store) {
  if (!store || store.size() === 0) return null;
  const steps = store.listSteps();
  const lastStep = steps[steps.length - 1];
  return store.get(lastStep).snapshot;
}
