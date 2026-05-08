import { children, getParent } from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";
import {
  Node,
  SessionState,
  MessageState,
  Goal,
  Constraint,
  DocumentState,
  Summary,
  TaskState,
  Name,
  Attention,
  MemoryNote,
} from "./components.js";

export function registerVirtuals(world, virtuals) {
  function kindOf(id) {
    return world.get(id, Node)?.kind ?? "";
  }

  function projectOf(id) {
    let cur = id;
    while (cur) {
      if (kindOf(cur) === "Project") return cur;
      cur = getParent(world, cur);
    }
    return 0;
  }

  const SessionContext = virtuals.define("SessionContext", (_world, sessionId) => {
    const projectId = projectOf(sessionId);
    const s = world.get(sessionId, SessionState);

    const recentMessages = [];
    for (const childId of children(world, sessionId)) {
      const m = world.get(childId, MessageState);
      if (m) recentMessages.push({ role: m.role, text: m.text, turn: m.turn });
    }

    const goals = [];
    const constraints = [];
    const docs = [];
    const openTasks = [];
    const memories = [];

    for (const childId of children(world, projectId)) {
      const g = world.get(childId, Goal);
      if (g) goals.push(g.text);

      const c = world.get(childId, Constraint);
      if (c) constraints.push(c.text);

      const d = world.get(childId, DocumentState);
      if (d) {
        docs.push({
          title: d.title,
          trust: d.trust,
          summary: world.get(childId, Summary)?.text ?? "",
        });
      }

      const t = world.get(childId, TaskState);
      if (t && t.session === sessionId && t.status !== "done") {
        openTasks.push({
          id: childId,
          name: world.get(childId, Name)?.value ?? "Task",
          kind: t.kind,
          status: t.status,
          attention: world.get(childId, Attention)?.score ?? 0,
        });
      }

      const mem = world.get(childId, MemoryNote);
      if (mem) memories.push({ text: mem.text, weight: mem.weight });
    }

    openTasks.sort((a, b) => b.attention - a.attention);
    memories.sort((a, b) => b.weight - a.weight);

    return {
      projectId,
      sessionId,
      turn: s?.turn ?? 0,
      focus: s?.focus ?? "",
      goals,
      constraints,
      recentMessages: recentMessages.slice(-6),
      docs: docs.slice(0, 4),
      openTasks: openTasks.slice(0, 6),
      memories: memories.slice(0, 6),
    };
  });

  return { SessionContext };
}
