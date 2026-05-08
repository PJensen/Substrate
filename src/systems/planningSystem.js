import { TaskState, Name } from "../components.js";
import { createFrom, attach, getParent, children } from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";
import { TaskEntity } from "../archetypes.js";

export function PlanningSystem(world, _dt, eventLog) {
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
      if (eventLog) {
        eventLog.emit(world.step, "entity_create", {
          id: analyzeId,
          arch: "TaskEntity",
          data: {
            name: `Analyze evidence for: ${name.value}`,
            kind: "analyze-document",
            status: "ready",
            priority: task.priority + 2,
            target: task.target,
            parentTask: taskId,
            session: task.session,
            input: task.input,
          },
        });
      }
      attach(world, analyzeId, projectId);
      if (eventLog) {
        eventLog.emit(world.step, "entity_attach", {
          child: analyzeId,
          par: projectId,
        });
      }
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
      if (eventLog) {
        eventLog.emit(world.step, "entity_create", {
          id: draftId,
          arch: "TaskEntity",
          data: {
            name: `Draft final answer for: ${name.value}`,
            kind: "draft-answer",
            status: "blocked",
            priority: task.priority + 1,
            target: task.target,
            parentTask: taskId,
            session: task.session,
            input: "",
          },
        });
      }
      attach(world, draftId, projectId);
      if (eventLog) {
        eventLog.emit(world.step, "entity_attach", {
          child: draftId,
          par: projectId,
        });
      }
    }

    world.set(taskId, TaskState, { status: "planned" });
    if (eventLog) {
      eventLog.emit(world.step, "cmp_set", {
        id: taskId,
        cmp: "TaskState",
        data: { status: "planned" },
      });
    }
  }
}
