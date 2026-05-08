// Generic skip-list: O(log n) insert, find, delete with range queries
// Probabilistic balanced search tree; no rotations needed

const MAX_LEVEL = 16;
const PROBABILITY = 0.5;

class Node {
  constructor(key, value, level) {
    this.key = key;
    this.value = value;
    this.forward = new Array(level + 1).fill(null);
    this.level = level;
  }
}

export class SkipList {
  constructor(compareFn = (a, b) => a < b ? -1 : a > b ? 1 : 0) {
    this.compareFn = compareFn;
    this.head = new Node(null, null, MAX_LEVEL);
    this.level = 0;
    this._size = 0;
  }

  // Generate random level for new node
  randomLevel() {
    let level = 0;
    while (Math.random() < PROBABILITY && level < MAX_LEVEL) {
      level++;
    }
    return level;
  }

  // Insert key-value pair. If key exists, replace value.
  insert(key, value) {
    const update = new Array(MAX_LEVEL + 1);
    const search = new Array(MAX_LEVEL + 1);
    let current = this.head;

    // Find position to insert; track nodes to update
    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] && this.compareFn(current.forward[i].key, key) < 0) {
        current = current.forward[i];
      }
      update[i] = current;
    }

    // Check if key already exists
    current = current.forward[0];
    if (current && this.compareFn(current.key, key) === 0) {
      current.value = value;  // replace
      return value;
    }

    // Create new node at random level
    const newLevel = this.randomLevel();
    if (newLevel > this.level) {
      for (let i = this.level + 1; i <= newLevel; i++) {
        update[i] = this.head;
      }
      this.level = newLevel;
    }

    const newNode = new Node(key, value, newLevel);
    for (let i = 0; i <= newLevel; i++) {
      newNode.forward[i] = update[i].forward[i];
      update[i].forward[i] = newNode;
    }

    this._size++;
    return value;
  }

  // Find exact key. Returns value or null.
  find(key) {
    let current = this.head;

    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] && this.compareFn(current.forward[i].key, key) < 0) {
        current = current.forward[i];
      }
    }

    current = current.forward[0];
    if (current && this.compareFn(current.key, key) === 0) {
      return current.value;
    }
    return null;
  }

  // Find node with key >= target. Returns {key, value} or null.
  findGE(key) {
    let current = this.head;

    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] && this.compareFn(current.forward[i].key, key) < 0) {
        current = current.forward[i];
      }
    }

    current = current.forward[0];
    if (current) {
      return { key: current.key, value: current.value };
    }
    return null;
  }

  // Delete key. Returns true if found and deleted, false otherwise.
  delete(key) {
    const update = new Array(MAX_LEVEL + 1);
    let current = this.head;

    for (let i = this.level; i >= 0; i--) {
      while (current.forward[i] && this.compareFn(current.forward[i].key, key) < 0) {
        current = current.forward[i];
      }
      update[i] = current;
    }

    current = current.forward[0];
    if (!current || this.compareFn(current.key, key) !== 0) {
      return false;  // not found
    }

    // Remove node from all levels
    for (let i = 0; i <= this.level; i++) {
      if (update[i].forward[i] === current) {
        update[i].forward[i] = current.forward[i];
      }
    }

    // Shrink level if needed
    while (this.level > 0 && !this.head.forward[this.level]) {
      this.level--;
    }

    this._size--;
    return true;
  }

  // Iterate in key order: for (const [key, value] of skipList)
  *[Symbol.iterator]() {
    let current = this.head.forward[0];
    while (current) {
      yield [current.key, current.value];
      current = current.forward[0];
    }
  }

  size() {
    return this._size;
  }

  isEmpty() {
    return this._size === 0;
  }

  // Debug: print structure (for testing)
  toString() {
    let result = [];
    for (const [key, value] of this) {
      result.push(`${key}: ${value}`);
    }
    return `[${result.join(', ')}]`;
  }
}
