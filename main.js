import {
  World,
  defineComponent,
  defineArchetype,
  createFrom,
  composeScheduler,
  createVirtualRegistry,
  attach,
  children,
  getParent,
  serializeWorld,
} from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";

/*
  ECS-JS AS A STATEFUL RUNTIME ENVIRONMENT

  Domain nouns become entities:
    Project
    Session
    Agent
    Tool
    Document
    Task
    Message
    Memory

  Components hold durable facts.
  Systems advance the world.
  Hierarchy expresses ownership / containment.
  Virtuals assemble context on demand.
*/

/* =========================
   Components
   ========================= */

const Node = defineComponent("Node", { kind: "" });
const Name = defineComponent("Name", { value: "" });

const Goal = defineComponent("Goal", { text: "", done: false });
const Constraint = defineComponent("Constraint", { text: "", hard: true });

const SessionState = defineComponent("SessionState", {
  turn: 0,
  status: "active",
  focus: "",
});

const AgentState = defineComponent("AgentState", {
  role: "",
  busy: false,
  budget: 1,
});

const Capability = defineComponent("Capability", {
  items: [],
});

const ToolState = defineComponent("ToolState", {
  name: "",
  online: true,
  latencyMs: 0,
  supports: [],
});

const DocumentState = defineComponent("DocumentState", {
  title: "",
  uri: "",
  trust: 0.5,
  needsIndex: true,
});

const Summary = defineComponent("Summary", {
  text: "",
});

const Facts = defineComponent("Facts", {
  items: [],
});

const MessageState = defineComponent("MessageState", {
  role: "user",
  text: "",
  turn: 0,
});

const MemoryNote = defineComponent("MemoryNote", {
  text: "",
  scope: "project",
  weight: 1,
});

const TaskState = defineComponent("TaskState", {
  kind: "",
  status: "new",       // new | planned | blocked | ready | running | done | failed
  priority: 0,
  assignedTo: 0,
  target: 0,           // entity id, often a document
  parentTask: 0,
  session: 0,
  input: "",
  output: "",
  error: "",
});

const Attention = defineComponent("Attention", {
  score: 0,
});

/* =========================
   Archetypes
   ========================= */

const ProjectEntity = defineArchetype(
  "ProjectEntity",
  [Node, { kind: "Project" }],
  [Name, (p) => ({ value: p.name ?? "Untitled Project" })]
);

const SessionEntity = defineArchetype(
  "SessionEntity",
  [Node, { kind: "Session" }],
  [Name, (p) => ({ value: p.name ?? "Session" })],
  [SessionState, (p) => ({ turn: p.turn ?? 0, status: "active", focus: "" })]
);

const AgentEntity = defineArchetype(
  "AgentEntity",
  [Node, { kind: "Agent" }],
  [Name, (p) => ({ value: p.name ?? "Agent" })],
  [AgentState, (p) => ({ role: p.role ?? "generalist", busy: false, budget: p.budget ?? 1 })],
  [Capability, (p) => ({ items: p.capabilities ?? [] })]
);

const ToolEntity = defineArchetype(
  "ToolEntity",
  [Node, { kind: "Tool" }],
  [Name, (p) => ({ value: p.name ?? "Tool" })],
  [ToolState, (p) => ({
    name: p.name ?? "Tool",
    online: p.online ?? true,
    latencyMs: p.latencyMs ?? 100,
    supports: p.supports ?? [],
  })]
);

const DocumentEntity = defineArchetype(
  "DocumentEntity",
  [Node, { kind: "Document" }],
  [Name, (p) => ({ value: p.title ?? "Document" })],
  [DocumentState, (p) => ({
    title: p.title ?? "Document",
    uri: p.uri ?? "",
    trust: p.trust ?? 0.5,
    needsIndex: p.needsIndex ?? true,
  })]
);

const TaskEntity = defineArchetype(
  "TaskEntity",
  [Node, { kind: "Task" }],
  [Name, (p) => ({ value: p.name ?? "Task" })],
  [TaskState, (p) => ({
    kind: p.kind ?? "generic",
    status: p.status ?? "new",
    priority: p.priority ?? 1,
    assignedTo: p.assignedTo ?? 0,
    target: p.target ?? 0,
    parentTask: p.parentTask ?? 0,
    session: p.session ?? 0,
    input: p.input ?? "",
    output: p.output ?? "",
    error: "",
  })],
  [Attention, { score: 0 }]
);

const MessageEntity = defineArchetype(
  "MessageEntity",
  [Node, { kind: "Message" }],
  [MessageState, (p) => ({
    role: p.role ?? "user",
    text: p.text ?? "",
    turn: p.turn ?? 0,
  })]
);

const MemoryEntity = defineArchetype(
  "MemoryEntity",
  [Node, { kind: "Memory" }],
  [MemoryNote, (p) => ({
    text: p.text ?? "",
    scope: p.scope ?? "project",
    weight: p.weight ?? 1,
  })]
);

const GoalEntity = defineArchetype(
  "GoalEntity",
  [Node, { kind: "Goal" }],
  [Goal, (p) => ({ text: p.text ?? "", done: !!p.done })]
);

const ConstraintEntity = defineArchetype(
  "ConstraintEntity",
  [Node, { kind: "Constraint" }],
  [Constraint, (p) => ({ text: p.text ?? "", hard: p.hard !== false })]
);

/* =========================
   World + virtuals
   ========================= */

const world = new World({ seed: 1337 });

const virtuals = createVirtualRegistry(world);

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

/* =========================
   Systems
   ========================= */

function IndexDocumentsSystem(world, _dt) {
  for (const [docId, doc] of world.query(DocumentState)) {
    if (!doc.needsIndex) continue;

    if (!world.has(docId, Summary)) {
      world.add(docId, Summary, {
        text:
          `Indexed ${doc.title}. ` +
          `This document appears relevant to the active project and can be used for retrieval/context assembly.`,
      });
    }

    if (!world.has(docId, Facts)) {
      world.add(docId, Facts, {
        items: [
          `source:${doc.uri}`,
          `trust:${doc.trust}`,
          `title:${doc.title}`,
        ],
      });
    }

    world.set(docId, DocumentState, { needsIndex: false });
  }
}

function PlanningSystem(world, _dt) {
  for (const [taskId, task, name] of world.query(TaskState, Name)) {
    if (task.kind !== "answer-user") continue;
    if (task.status !== "new") continue;

    const projectId = getParent(world, taskId);

    let hasAnalyze = false;
    let hasDraft = false;

    for (const childId of children(world, projectId)) {
      const t = world.get(childId, TaskState);
      if (!t || t.parentTask !== taskId) continue;
      if (t.kind === "analyze-document") hasAnalyze = true;
      if (t.kind === "draft-answer") hasDraft = true;
    }

    if (!hasAnalyze) {
      const analyzeId = createFrom(world, TaskEntity, {
        name: `Analyze evidence for: ${name.value}`,
        kind: "analyze-document",
        status: "ready",
        priority: task.priority + 2,
        target: task.target,
        parentTask: taskId,
        session: task.session,
        input: task.input,
      });
      attach(world, analyzeId, projectId);
    }

    if (!hasDraft) {
      const draftId = createFrom(world, TaskEntity, {
        name: `Draft final answer for: ${name.value}`,
        kind: "draft-answer",
        status: "blocked",
        priority: task.priority + 1,
        target: task.target,
        parentTask: taskId,
        session: task.session,
        input: "",
      });
      attach(world, draftId, projectId);
    }

    world.set(taskId, TaskState, { status: "planned" });
  }
}

function ToolRoutingSystem(world, _dt) {
  for (const [taskId, task] of world.query(TaskState)) {
    if (task.status !== "ready") continue;
    if (task.assignedTo) continue;

    for (const [toolId, tool] of world.query(ToolState)) {
      if (!tool.online) continue;
      if (!tool.supports.includes(task.kind)) continue;

      world.set(taskId, TaskState, { assignedTo: toolId });
      break;
    }
  }
}

function ExecutionSystem(world, _dt) {
  for (const [taskId, task] of world.query(TaskState)) {
    if (task.status !== "ready") continue;
    if (!task.assignedTo) continue;

    world.set(taskId, TaskState, { status: "running" });

    try {
      if (task.kind === "analyze-document") {
        const doc = world.get(task.target, DocumentState);
        const summary = world.get(task.target, Summary);
        const facts = world.get(task.target, Facts);

        const output =
          `Document analysis for "${doc?.title ?? "unknown"}": ` +
          `${summary?.text ?? "No summary."} ` +
          `Facts=${JSON.stringify(facts?.items ?? [])}`;

        world.set(taskId, TaskState, {
          status: "done",
          output,
        });

        const projectId = getParent(world, taskId);
        for (const childId of children(world, projectId)) {
          const sibling = world.get(childId, TaskState);
          if (!sibling) continue;
          if (sibling.parentTask !== task.parentTask) continue;
          if (sibling.kind !== "draft-answer") continue;
          if (sibling.status !== "blocked") continue;

          world.set(childId, TaskState, {
            status: "ready",
            input: output,
          });
        }
      }

      else if (task.kind === "draft-answer") {
        const output =
          `Final answer:\n` +
          `The runtime should treat prior work as durable world-state, not chat residue. ` +
          `Relevant evidence has been analyzed and folded into session context. ` +
          `This answer was produced by a task routed through the ECS world itself.\n\n` +
          `Source material:\n${task.input}`;

        world.set(taskId, TaskState, {
          status: "done",
          output,
        });

        const rootTask = world.get(task.parentTask, TaskState);
        if (rootTask) {
          world.set(task.parentTask, TaskState, {
            status: "done",
            output,
          });
        }

        const sessionId = task.session;
        const session = world.get(sessionId, SessionState);
        const assistantMsgId = createFrom(world, MessageEntity, {
          role: "assistant",
          text: output,
          turn: (session?.turn ?? 0) + 1,
        });
        attach(world, assistantMsgId, sessionId);

        const projectId = projectOf(taskId);
        const memoryId = createFrom(world, MemoryEntity, {
          text: "A user-facing answer was produced from indexed project material.",
          scope: "project",
          weight: 10,
        });
        attach(world, memoryId, projectId);
      }
    } catch (err) {
      world.set(taskId, TaskState, {
        status: "failed",
        error: err?.stack || String(err),
      });
    }
  }
}

function AttentionSystem(world, _dt) {
  for (const [taskId, task] of world.query(TaskState)) {
    let score = task.priority;

    if (task.status === "running") score += 100;
    else if (task.status === "ready") score += 50;
    else if (task.status === "blocked") score += 10;
    else if (task.status === "planned") score += 5;
    else if (task.status === "done") score = 0;

    world.set(taskId, Attention, { score });
  }

  for (const [sessionId, session] of world.query(SessionState)) {
    let bestTaskId = 0;
    let bestScore = -1;

    const projectId = projectOf(sessionId);
    for (const childId of children(world, projectId)) {
      const t = world.get(childId, TaskState);
      if (!t || t.session !== sessionId || t.status === "done") continue;

      const score = world.get(childId, Attention)?.score ?? 0;
      if (score > bestScore) {
        bestScore = score;
        bestTaskId = childId;
      }
    }

    const focus = bestTaskId
      ? (world.get(bestTaskId, Name)?.value ?? "")
      : "";

    world.set(sessionId, SessionState, {
      ...session,
      focus,
    });
  }
}

let lastSnapshot = null;
function PersistenceSystem(world, _dt) {
  lastSnapshot = serializeWorld(world, {
    note: `checkpoint at step ${world.step}`,
  });
}

/* =========================
   Scheduler
   ========================= */

world.setScheduler(
  composeScheduler(
    IndexDocumentsSystem,
    PlanningSystem,
    ToolRoutingSystem,
    ExecutionSystem,
    AttentionSystem,
    PersistenceSystem
  )
);

/* =========================
   Seed runtime world
   ========================= */

const projectId = createFrom(world, ProjectEntity, {
  name: "Stateful Runtime Environment",
});

const sessionId = createFrom(world, SessionEntity, {
  name: "User Session",
  turn: 1,
});
attach(world, sessionId, projectId);

const goalId = createFrom(world, GoalEntity, {
  text: "Answer the user's question using durable project state.",
});
attach(world, goalId, projectId);

const constraintId = createFrom(world, ConstraintEntity, {
  text: "Prefer inspectable state transitions over opaque prompt stuffing.",
  hard: true,
});
attach(world, constraintId, projectId);

const plannerAgentId = createFrom(world, AgentEntity, {
  name: "Planner",
  role: "planner",
  capabilities: ["decompose", "prioritize"],
});
attach(world, plannerAgentId, projectId);

const retrieverToolId = createFrom(world, ToolEntity, {
  name: "Retriever",
  supports: ["analyze-document"],
  latencyMs: 40,
});
attach(world, retrieverToolId, projectId);

const writerToolId = createFrom(world, ToolEntity, {
  name: "Writer",
  supports: ["draft-answer"],
  latencyMs: 25,
});
attach(world, writerToolId, projectId);

const docId = createFrom(world, DocumentEntity, {
  title: "Product Spec",
  uri: "drive://specs/stateful-runtime-v1",
  trust: 0.92,
});
attach(world, docId, projectId);

const userMsgId = createFrom(world, MessageEntity, {
  role: "user",
  text: "Can you draft one of these for me using ecs-js?",
  turn: 1,
});
attach(world, userMsgId, sessionId);

const rootTaskId = createFrom(world, TaskEntity, {
  name: "Answer current user request",
  kind: "answer-user",
  status: "new",
  priority: 100,
  target: docId,
  session: sessionId,
  input: "User wants a runtime sketch implemented with ecs-js.",
});
attach(world, rootTaskId, projectId);

/* =========================
   Run a few steps
   ========================= */

for (let i = 0; i < 3; i++) {
  world.tick(1);

  console.log(`\n=== STEP ${world.step} ===`);
  console.log("SESSION CONTEXT");
  console.log(JSON.stringify(virtuals.get(sessionId, SessionContext), null, 2));
}

console.log("\n=== SNAPSHOT ===");
console.log(JSON.stringify(lastSnapshot, null, 2));