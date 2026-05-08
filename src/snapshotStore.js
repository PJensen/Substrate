import { SkipList } from "./skipList.js";

export class SnapshotStore {
  constructor(options = {}) {
    this.maxSnapshots = options.maxSnapshots ?? 50;
    this.onRetention = options.onRetention ?? (() => {});  // callback(step, action)

    // Skip-list keyed by step (number), value is {step, snapshot}
    // Comparator: numeric comparison
    this.list = new SkipList((a, b) => a < b ? -1 : a > b ? 1 : 0);
  }

  // Record a snapshot at a step
  record(step, snapshot) {
    const entry = { step, snapshot, timestamp: Date.now() };
    this.list.insert(step, entry);

    // Enforce retention: if over capacity, delete oldest
    if (this.list.size() > this.maxSnapshots) {
      // Find oldest (first) entry by iterating
      const iterator = this.list[Symbol.iterator]();
      const { value: [oldestStep] } = iterator.next();
      if (oldestStep !== undefined) {
        this.list.delete(oldestStep);
        this.onRetention(oldestStep, "deleted");
      }
    }

    return entry;
  }

  // Get exact snapshot at step. Throws if not found.
  get(step) {
    const entry = this.list.find(step);
    if (!entry) {
      const available = Array.from(this.list).map(([s]) => s).join(", ");
      throw new Error(`No snapshot at step ${step}. Available: ${available}`);
    }
    return entry;
  }

  // Get nearest snapshot at or before step. Throws if not found.
  getNearestBefore(step) {
    // Find >= step, then walk back if needed
    const current = this.list.head.forward[0];
    if (!current) return null;

    let result = null;
    for (const [s, entry] of this.list) {
      if (s <= step) {
        result = entry;
      } else {
        break;
      }
    }

    if (!result) {
      const available = Array.from(this.list).map(([s]) => s).join(", ");
      throw new Error(`No snapshot at or before step ${step}. Available: ${available}`);
    }

    return result;
  }

  // Delete snapshot at step
  delete(step) {
    return this.list.delete(step);
  }

  // Number of snapshots stored
  size() {
    return this.list.size();
  }

  // Iterate snapshots in order: yields [step, snapshot]
  *list_entries() {
    for (const [step, entry] of this.list) {
      yield [step, entry.snapshot];
    }
  }

  // List all entries: returns Array<{step, snapshot}>
  entries() {
    const result = [];
    for (const [step, entry] of this.list) {
      result.push({ step, snapshot: entry.snapshot });
    }
    return result;
  }

  // List steps only (snapshots are too large to return)
  listSteps() {
    const result = [];
    for (const [step] of this.list) {
      result.push(step);
    }
    return result;
  }
}
