import { assertEquals, assertThrows, assertExists } from "https://deno.land/std@0.203.0/testing/asserts.ts";
import { SkipList } from "../skipList.js";
import { SnapshotStore } from "../snapshotStore.js";
import { buildRegistry } from "../transactionOps.js";

// ============================================================================
// SkipList Tests
// ============================================================================

Deno.test("SkipList: insert and find", () => {
  const list = new SkipList((a, b) => a < b ? -1 : a > b ? 1 : 0);

  list.insert(5, "five");
  list.insert(3, "three");
  list.insert(7, "seven");

  assertEquals(list.find(5), "five");
  assertEquals(list.find(3), "three");
  assertEquals(list.find(7), "seven");
  assertEquals(list.find(99), null);
});

Deno.test("SkipList: insert replaces existing key", () => {
  const list = new SkipList((a, b) => a < b ? -1 : a > b ? 1 : 0);

  list.insert(5, "five");
  list.insert(5, "FIVE");

  assertEquals(list.find(5), "FIVE");
  assertEquals(list.size(), 1);
});

Deno.test("SkipList: findGE finds >= target", () => {
  const list = new SkipList((a, b) => a < b ? -1 : a > b ? 1 : 0);

  list.insert(10, "ten");
  list.insert(20, "twenty");
  list.insert(30, "thirty");

  const result = list.findGE(15);
  assertEquals(result.key, 20);
  assertEquals(result.value, "twenty");

  const exact = list.findGE(20);
  assertEquals(exact.key, 20);

  const none = list.findGE(40);
  assertEquals(none, null);
});

Deno.test("SkipList: delete", () => {
  const list = new SkipList((a, b) => a < b ? -1 : a > b ? 1 : 0);

  list.insert(5, "five");
  list.insert(3, "three");
  list.insert(7, "seven");

  const deleted = list.delete(3);
  assertEquals(deleted, true);
  assertEquals(list.find(3), null);
  assertEquals(list.size(), 2);

  const notFound = list.delete(99);
  assertEquals(notFound, false);
});

Deno.test("SkipList: iteration in order", () => {
  const list = new SkipList((a, b) => a < b ? -1 : a > b ? 1 : 0);

  list.insert(5, "five");
  list.insert(1, "one");
  list.insert(3, "three");
  list.insert(7, "seven");

  const pairs = Array.from(list);
  assertEquals(pairs.length, 4);
  assertEquals(pairs[0], [1, "one"]);
  assertEquals(pairs[1], [3, "three"]);
  assertEquals(pairs[2], [5, "five"]);
  assertEquals(pairs[3], [7, "seven"]);
});

Deno.test("SkipList: size and isEmpty", () => {
  const list = new SkipList((a, b) => a < b ? -1 : a > b ? 1 : 0);

  assertEquals(list.size(), 0);
  assertEquals(list.isEmpty(), true);

  list.insert(1, "one");
  assertEquals(list.size(), 1);
  assertEquals(list.isEmpty(), false);

  list.delete(1);
  assertEquals(list.size(), 0);
  assertEquals(list.isEmpty(), true);
});

// ============================================================================
// SnapshotStore Tests
// ============================================================================

Deno.test("SnapshotStore: record and get", () => {
  const store = new SnapshotStore({ maxSnapshots: 10 });

  const snap1 = { v: 1, meta: { step: 1 }, comps: {} };
  store.record(1, snap1);

  const retrieved = store.get(1);
  assertEquals(retrieved.step, 1);
  assertEquals(retrieved.snapshot, snap1);
});

Deno.test("SnapshotStore: get throws on not found", () => {
  const store = new SnapshotStore({ maxSnapshots: 10 });

  assertThrows(() => {
    store.get(99);
  }, Error, "No snapshot at step 99");
});

Deno.test("SnapshotStore: getNearestBefore", () => {
  const store = new SnapshotStore({ maxSnapshots: 10 });

  store.record(1, { data: "snap1" });
  store.record(5, { data: "snap5" });
  store.record(10, { data: "snap10" });

  const nearest = store.getNearestBefore(7);
  assertEquals(nearest.step, 5);
  assertEquals(nearest.snapshot.data, "snap5");

  const exact = store.getNearestBefore(5);
  assertEquals(exact.step, 5);

  assertThrows(() => {
    store.getNearestBefore(0);  // nothing before step 0
  }, Error);
});

Deno.test("SnapshotStore: auto-retention evicts oldest", () => {
  const store = new SnapshotStore({ maxSnapshots: 3 });

  store.record(1, { data: "snap1" });
  store.record(2, { data: "snap2" });
  store.record(3, { data: "snap3" });
  assertEquals(store.size(), 3);

  // Adding 4th should evict 1
  store.record(4, { data: "snap4" });
  assertEquals(store.size(), 3);

  // Step 1 should be gone
  assertThrows(() => {
    store.get(1);
  }, Error);

  // Steps 2, 3, 4 should exist
  assertEquals(store.get(2).step, 2);
  assertEquals(store.get(3).step, 3);
  assertEquals(store.get(4).step, 4);
});

Deno.test("SnapshotStore: delete", () => {
  const store = new SnapshotStore({ maxSnapshots: 10 });

  store.record(1, { data: "snap1" });
  store.record(2, { data: "snap2" });

  const deleted = store.delete(1);
  assertEquals(deleted, true);
  assertEquals(store.size(), 1);

  assertThrows(() => {
    store.get(1);
  }, Error);
});

Deno.test("SnapshotStore: listSteps", () => {
  const store = new SnapshotStore({ maxSnapshots: 10 });

  store.record(5, { data: "snap5" });
  store.record(2, { data: "snap2" });
  store.record(10, { data: "snap10" });

  const steps = store.listSteps();
  assertEquals(steps.length, 3);
  assertEquals(steps[0], 2);   // sorted
  assertEquals(steps[1], 5);
  assertEquals(steps[2], 10);
});

Deno.test("SnapshotStore: entries", () => {
  const store = new SnapshotStore({ maxSnapshots: 10 });

  const snap1 = { data: "snap1" };
  const snap2 = { data: "snap2" };

  store.record(1, snap1);
  store.record(2, snap2);

  const entries = store.entries();
  assertEquals(entries.length, 2);
  assertEquals(entries[0].step, 1);
  assertEquals(entries[0].snapshot, snap1);
  assertEquals(entries[1].step, 2);
  assertEquals(entries[1].snapshot, snap2);
});

Deno.test("SnapshotStore: onRetention callback fires on eviction", () => {
  let evicted = null;

  const store = new SnapshotStore({
    maxSnapshots: 2,
    onRetention: (step, action) => {
      if (action === "deleted") evicted = step;
    }
  });

  store.record(1, { data: "snap1" });
  store.record(2, { data: "snap2" });
  store.record(3, { data: "snap3" });  // should evict 1

  assertEquals(evicted, 1);
});

// ============================================================================
// transactionOps Tests (minimal without full World setup)
// ============================================================================

Deno.test("transactionOps: buildRegistry returns map", () => {
  const registry = buildRegistry();
  assertExists(registry);
  // Should have all component names
  assertEquals(registry.has("Node"), true);
  assertEquals(registry.has("Name"), true);
  assertEquals(registry.has("TaskState"), true);
  assertEquals(registry.has("Parent"), true);
  assertEquals(registry.has("Sibling"), true);
});

// ============================================================================
// Integration: SnapshotStore as history log
// ============================================================================

Deno.test("SnapshotStore integration: simulated tick loop", () => {
  const store = new SnapshotStore({ maxSnapshots: 50 });

  // Simulate 5 ticks
  for (let step = 1; step <= 5; step++) {
    const snapshot = {
      v: 1,
      meta: { step, time: step * 1000 },
      comps: { TaskState: [[1, { status: "done" }]] }
    };
    store.record(step, snapshot);
  }

  assertEquals(store.size(), 5);
  assertEquals(store.listSteps(), [1, 2, 3, 4, 5]);

  // Rollback semantics: get step 2
  const at2 = store.get(2);
  assertEquals(at2.step, 2);

  // Nearest before step 3.5
  const nearest = store.getNearestBefore(3);
  assertEquals(nearest.step, 3);
});
