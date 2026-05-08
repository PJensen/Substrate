# Event Sourcing Implementation

## Context

Built event sourcing as the intersection of three design-doc extensions:
- **EventLog** — per-tick mutation capture as typed events
- **Disk persistence** — append events to JSONL (one event per line)
- **Delta compression** — sparse checkpointing + events close the gap

Result: full audit trail of cognitive work, crash recovery via snapshot + replay, compact disk format.

---

## Architecture

### Event Emission Pattern

All systems accept `eventLog` as 3rd parameter and emit events after mutations:

```js
world.set(taskId, TaskState, { status: "done" });
if (eventLog) {
  eventLog.emit(world.step, "cmp_set", {
    id: taskId,
    cmp: "TaskState",
    data: { status: "done" },
  });
}
```

Systems modified: `IndexDocumentsSystem`, `PlanningSystem`, `ToolRoutingSystem`, `ExecutionSystem`, `AttentionSystem`.

### Event Schema (JSONL)

Compact keys for disk efficiency:
```jsonl
{"t":"cmp_set","s":1,"o":0,"id":5,"cmp":"TaskState","data":{"status":"done"}}
{"t":"cmp_add","s":1,"o":1,"id":3,"cmp":"Summary","data":{"text":"..."}}
{"t":"entity_create","s":1,"o":2,"id":11,"arch":"TaskEntity","data":{...}}
{"t":"entity_attach","s":1,"o":3,"child":11,"par":1}
```

Keys: `t`=type, `s`=step, `o`=ordinal, `id`=entityId, `cmp`=component, `arch`=archetype, `par`=parent.

Event types:
- `cmp_set` — component mutation
- `cmp_add` — component addition
- `entity_create` — entity creation (audit only; not replayed)
- `entity_attach` — hierarchy attachment (audit only; not replayed)

### Replay Semantics

Load snapshot at/before target step → apply only `cmp_set`/`cmp_add` events from checkpoint+1 to target.

Entity creation/attachment events are stored for audit trail but not replayed (entity IDs come from snapshot baseline). This works cleanly at `checkpointInterval=1` (current default) and scales to sparse checkpointing.

### Sparse Checkpointing (Delta Compression)

`PersistenceSystem` now takes `checkpointInterval` option (default: 1). Set to 10 → snapshot every 10 ticks, events fill gaps. Audit trail always complete; disk usage scales inversely with interval.

---

## Files

### New
- `src/eventLog.js` — `EventLog` class + `appendEventsToFile` + `streamEvents`
- `src/eventReplayer.js` — `replayFromCheckpoint` + `applyEvent`
- `src/tests/eventSourcing_test.js` — 7 tests covering EventLog, JSONL I/O, apply, replay

### Modified
- `src/systems/persistenceSystem.js` — event drain (fire-and-forget) + sparse checkpoint support
- `src/systems/*.js` (all 5 systems) — `eventLog` param + event emission
- `src/main.js` — EventLog creation, injection, replay demo
- `deno.json` — `--allow-write` added to start/test tasks

---

## Verification

```sh
deno task test                  # 24 tests pass (7 new + 17 existing)
deno task start                 # 3 ticks run, substrate.events.jsonl written, replay demo succeeds
cat substrate.events.jsonl | wc -l  # 64 events across 3 ticks
```

**Demo output:**
```
=== EVENT SOURCING REPLAY ===
Replayed world at step 2: step=2
Replayed session focus: Draft final answer for: Answer current user request
```

---

## Known Constraints & Future Extensions

### Entity Creation Replay Limitation
If checkpointing becomes sparse (e.g., every 10 ticks), entities created between checkpoints cannot be fully reconstructed via event replay alone. Workaround: either keep interval tight (≤5 ticks) or store entity creation details in events for replay.

### Storage Format
JSONL chosen for human readability + append efficiency. For production scale (millions of events), consider:
- Binary format (msgpack, protobuf) for 5-10x size reduction
- Segmented log files (rotate every N events) for memory efficiency
- Compression (gzip) for storage

### Event Log Queries
Current design: sequential scan of JSONL for step range. For large logs, consider:
- Index file mapping step → byte offset
- Bloom filter for existence checks
- Time-series DB (e.g., ClickHouse) for analytics

---

## Integration Notes

EventLog is decoupled from SnapshotStore. They work independently:
- Snapshots: in-memory, optional disk persistence (future)
- Events: always appended to JSONL

Both can be disabled per-system:
```js
// Snapshot-only (no events)
PersistenceSystem(world, dt, store, null, null, { checkpointInterval: 1 })

// Events-only (no snapshots)
PersistenceSystem(world, dt, null, eventLog, eventsPath, { checkpointInterval: Infinity })
```

The registry-based approach (events store component names + JSON data; `buildRegistry()` maps names → constructors during replay) allows events to be replayed on any version of the world that has the same component schema.
