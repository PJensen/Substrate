import { serializeWorld } from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";

let lastSnapshot = null;
export function PersistenceSystem(world, _dt) {
  lastSnapshot = serializeWorld(world, {
    note: `checkpoint at step ${world.step}`,
  });
}

export function getLastSnapshot() {
  return lastSnapshot;
}
