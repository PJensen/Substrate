import { defineComponent } from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";

export const Node = defineComponent("Node", { kind: "" });
export const Name = defineComponent("Name", { value: "" });

export const Goal = defineComponent("Goal", { text: "", done: false });
export const Constraint = defineComponent("Constraint", { text: "", hard: true });

export const SessionState = defineComponent("SessionState", {
  turn: 0,
  status: "active",
  focus: "",
});

export const AgentState = defineComponent("AgentState", {
  role: "",
  busy: false,
  budget: 1,
});

export const Capability = defineComponent("Capability", {
  items: [],
});

export const ToolState = defineComponent("ToolState", {
  name: "",
  online: true,
  latencyMs: 0,
  supports: [],
});

export const ArtifactState = defineComponent("ArtifactState", {
  title: "",
  uri: "",
  trust: 0.5,
  needsIndex: true,
});

export const Summary = defineComponent("Summary", {
  text: "",
});

export const Facts = defineComponent("Facts", {
  items: [],
});

export const MessageState = defineComponent("MessageState", {
  role: "user",
  text: "",
  turn: 0,
});

export const MemoryNote = defineComponent("MemoryNote", {
  text: "",
  scope: "project",
  weight: 1,
});

export const TaskState = defineComponent("TaskState", {
  kind: "",
  status: "new",
  priority: 0,
  assignedTo: 0,
  target: 0,
  parentTask: 0,
  session: 0,
  input: "",
  output: "",
  error: "",
});

export const Attention = defineComponent("Attention", {
  score: 0,
});
