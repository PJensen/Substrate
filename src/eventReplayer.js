import {
  World,
  attach,
} from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";
import { buildRegistry } from "./transactionOps.js";
import { streamEvents } from "./eventLog.js";

export async function replayFromCheckpoint(store, eventsPath, targetStep) {
  const checkpoint = store.getNearestBefore(targetStep);
  const registry = buildRegistry();
  const world = World.fromSnapshot(checkpoint.snapshot, registry);
  world.step = checkpoint.step;

  for await (const event of streamEvents(
    eventsPath,
    checkpoint.step + 1,
    targetStep
  )) {
    applyEvent(world, event, registry);
  }
  return world;
}

export function applyEvent(world, event, registry) {
  switch (event.t) {
    case "cmp_set":
      world.set(event.id, registry.get(event.cmp), event.data);
      break;
    case "cmp_add":
      world.add(event.id, registry.get(event.cmp), event.data);
      break;
    case "entity_attach":
      attach(world, event.child, event.par);
      break;
    // entity_create: audit only — entities come from snapshot
  }
}
