# Transactional History & Branching: Design

## Problem Statement

Enable Substrate to:
1. **Snapshot** — capture durable checkpoint of world state at any step
2. **Rollback** — restore world to prior step
3. **Fork** — create independent World copy from snapshot

Current: `PersistenceSystem` writes one snapshot per tick, overwriting the previous. No history.

Use cases: debugging (rollback to reproduce issue), exploration (branch multiple strategies), undo, crash recovery.

---

## Why V1 Design Didn't Work

V1 proposed a monolithic `TransactionLayer` class:

```js
class TransactionLayer {
  constructor() { this.store = new SnapshotStore(...); }
  checkpoint(world) { this.store.record(...); }
  rollback(world, step) { /* restore + truncate */ }
  fork(step) { /* clone world */ }
}
```

Problems:

1. **Mixed responsibilities**: owns storage (SnapshotStore), lookup (SkipList), world reconstruction, history management, retention policy. Too many reasons to change.

2. **Fork/rollback logic is world-specific, not transactional**: `fork()` must build registry, know about `world.step` restoration gotcha, know what NOT to restore (`world.onTick`, scheduler). This belongs in a utility, not a transaction layer.

3. **Awkward injection**: `setPersistenceLayer(transactionLayer)` is module-level state. Breaks testing (can't have two independent worlds). Not explicit.

4. **Implicit checkpoint behavior**: `transactionLayer.checkpoint(world)` silently serializes, stores, and manages retention. No visibility into what actually happened.

5. **Inconsistent semantics**: `rollback()` truncates forward history, but `fork()` doesn't. User must understand two different behaviors.

6. **Misleading name**: Not implementing ACID transactions. We're implementing version control (snapshots, branching, rewind).

---

## Design Principles for V2

**1. Single Responsibility**

Each component has one job:
- `SkipList<K, V>`: O(log n) sorted map
- `SnapshotStore`: store/retrieve snapshots by step, manage retention
- `PersistenceSystem`: call store at tick-end
- `fork()`, `rollback()`: utilities, not a class

**2. Systems Stay Dumb**

PersistenceSystem must call ONE simple method and not know about internals:
```js
function PersistenceSystem(world, dt, store) {
  const snapshot = serializeWorld(world, { note: `step ${world.step}` });
  store.record(world.step, snapshot);  // that's it
}
```

**3. Explicit Over Implicit**

No hidden work in `checkpoint()`. Caller (PersistenceSystem) explicitly serializes and records. Retention policy is obvious.

**4. Fork/Rollback Are Utilities**

Small, testable, composable functions — not class methods:
```js
function fork(store, step) { /* ... */ }
function rollback(store, world, step) { /* ... */ }
```

**5. Dependency Injection Is Explicit**

Pass store as parameter to PersistenceSystem. No module-level state:
```js
world.setScheduler(
  composeScheduler(
    ...,
    (world, dt) => PersistenceSystem(world, dt, store)
  )
);
```

**6. Naming Reflects Reality**

- Not "TransactionLayer" (we're not ACID)
- Use: SnapshotStore, fork(), rollback()
- Internals: SkipList (fast lookup), not exposed

**7. Test-Friendly**

Each component testable in isolation. No global state, singletons, or hidden dependencies.

---

## Architecture V2

```
SnapshotStore (with SkipList inside)
  ├─ record(step, snapshot)
  ├─ get(step)                    // O(log n) exact
  ├─ getNearestBefore(step)       // O(log n) find >= 
  ├─ delete(step)
  ├─ size()
  └─ list()

PersistenceSystem (remains a system)
  └─ receives store as parameter
  └─ calls store.record(step, serializeWorld(world))

Utilities (in transactionOps.js)
  ├─ fork(store, step) -> World
  ├─ rollback(store, world, step) -> void
  ├─ branch(store, world, name?) -> {store, world}
  └─ buildRegistry() -> Map
```

### Data Flow

**Checkpoint (every tick):**
```
world.tick(1)
  └─ PersistenceSystem(world, dt, store)
      └─ store.record(world.step, serializeWorld(world))
          └─ SkipList.insert(step, snapshot)
             └─ O(log n), auto-retention
```

**Rollback (user request):**
```
rollback(store, world, 1)
  ├─ entry = store.get(1)
  ├─ world.load(entry.snapshot)
  ├─ world.step = 1
  └─ history: unchanged (can rollback again)
```

**Fork (user request):**
```
forkedWorld = fork(store, 2)
  ├─ entry = store.get(2)
  ├─ registry = buildRegistry()
  ├─ forkedWorld = World.fromSnapshot(entry.snapshot, registry)
  ├─ forkedWorld.step = 2
  └─ source world and store: unchanged
```

---

## Implementation Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/skipList.js` | ~120 | Generic O(log n) sorted map |
| `src/snapshotStore.js` | ~80 | Snapshot storage + retention |
| `src/transactionOps.js` | ~60 | fork(), rollback(), buildRegistry() |
| `src/systems/persistenceSystem.js` | ~15 | Modified: take store as param |
| `src/main.js` | +30 | Create store, pass to system, demo |

**Modified files:**
- `src/systems/persistenceSystem.js` — function signature changes to `(world, dt, store)`
- `src/main.js` — create SnapshotStore, inject into scheduler

**Deleted:**
- Nothing (PersistenceSystem remains as a system)

---

## Key Implementation Details

### SnapshotStore Retention

Config option at construction:
```js
const store = new SnapshotStore({
  maxSnapshots: 50,
  onRetention: (step, action) => console.log(`${action} step ${step}`)
});
```

When `size() > maxSnapshots`, SnapshotStore deletes oldest entry automatically. Callback fires for observability.

### world.step Restoration Gotcha

`world.load(snapshot)` and `World.fromSnapshot(snapshot, registry)` do NOT restore `world.step` (only in snapshot is `meta.frame`, not `step`).

Must manually restore after both:
```js
world.load(snapshot);
world.step = targetStep;
```

Handled in both `rollback()` and `fork()` utilities.

### buildRegistry()

Must list all components from `src/components.js`:
```js
function buildRegistry() {
  return makeRegistry(
    Node, Name, Goal, Constraint, SessionState, AgentState,
    Capability, ToolState, DocumentState, Summary, Facts,
    MessageState, MemoryNote, TaskState, Attention
  );
}
```

Used in `fork()` to reconstruct World from snapshot. If components change, update this list.

---

## API Surface

### SnapshotStore

```js
const store = new SnapshotStore({ maxSnapshots: 50, onRetention });

store.record(step, snapshot)         // add snapshot
store.get(step)                      // exact O(log n); throws if not found
store.getNearestBefore(step)         // find >= O(log n); throws if not found
store.delete(step)                   // remove
store.size()                         // number of snapshots
store.list()                         // iterate [{ step, snapshot }]
```

### Utilities (transactionOps.js)

```js
const forkedWorld = fork(store, step);
rollback(store, world, step);
const { store: store2, world: world2 } = branch(store, world, name);
const registry = buildRegistry();
```

### PersistenceSystem

```js
function PersistenceSystem(world, dt, store) {
  const snapshot = serializeWorld(world, { note: `step ${world.step}` });
  store.record(world.step, snapshot);
}
```

---

## Verification

After implementation:

```sh
deno task start
```

Expected output:
- 3 ticks with session context (existing)
- Snapshot history printed (steps 1, 2, 3)
- Rollback to step 1 succeeds
- Fork from step 2 succeeds

---

## Future Extensions

This architecture scales without refactoring:

- **EventLog**: Track what changed per tick (separate from SnapshotStore)
- **Disk persistence**: Implement `SnapshotStore` with `Deno.writeTextFile`
- **Delta compression**: Store only changed entities (new store backend)
- **Branching UI**: Manage multiple timelines (use `branch()` utility)
- **Sparse checkpointing**: Skip N ticks between snapshots (PersistenceSystem decides when to call `store.record()`)

Each extension is independent. No monolithic refactoring needed.
