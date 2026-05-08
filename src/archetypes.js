import { defineArchetype } from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";
import {
  Node,
  Name,
  SessionState,
  AgentState,
  Capability,
  ToolState,
  DocumentState,
  TaskState,
  Attention,
  MessageState,
  MemoryNote,
  Goal,
  Constraint,
  Summary,
  Facts,
} from "./components.js";

export const ProjectEntity = defineArchetype(
  "ProjectEntity",
  [Node, { kind: "Project" }],
  [Name, (p) => ({ value: p.name ?? "Untitled Project" })]
);

export const SessionEntity = defineArchetype(
  "SessionEntity",
  [Node, { kind: "Session" }],
  [Name, (p) => ({ value: p.name ?? "Session" })],
  [SessionState, (p) => ({ turn: p.turn ?? 0, status: "active", focus: "" })]
);

export const AgentEntity = defineArchetype(
  "AgentEntity",
  [Node, { kind: "Agent" }],
  [Name, (p) => ({ value: p.name ?? "Agent" })],
  [AgentState, (p) => ({ role: p.role ?? "generalist", busy: false, budget: p.budget ?? 1 })],
  [Capability, (p) => ({ items: p.capabilities ?? [] })]
);


export const ToolEntity = defineArchetype(
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

export const DocumentEntity = defineArchetype(
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

export const TaskEntity = defineArchetype(
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

export const MessageEntity = defineArchetype(
  "MessageEntity",
  [Node, { kind: "Message" }],
  [MessageState, (p) => ({
    role: p.role ?? "user",
    text: p.text ?? "",
    turn: p.turn ?? 0,
  })]
);

export const MemoryEntity = defineArchetype(
  "MemoryEntity",
  [Node, { kind: "Memory" }],
  [MemoryNote, (p) => ({
    text: p.text ?? "",
    scope: p.scope ?? "project",
    weight: p.weight ?? 1,
  })]
);

export const GoalEntity = defineArchetype(
  "GoalEntity",
  [Node, { kind: "Goal" }],
  [Goal, (p) => ({ text: p.text ?? "", done: !!p.done })]
);

export const ConstraintEntity = defineArchetype(
  "ConstraintEntity",
  [Node, { kind: "Constraint" }],
  [Constraint, (p) => ({ text: p.text ?? "", hard: p.hard !== false })]
);
