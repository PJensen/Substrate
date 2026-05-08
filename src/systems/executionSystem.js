import { createFrom, attach, getParent, children } from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";
import {
  TaskState,
  DocumentState,
  Summary,
  Facts,
} from "../components.js";
import { MessageEntity, MemoryEntity } from "../archetypes.js";
import { Node } from "../components.js";
import { SessionState } from "../components.js";

function projectOf(world, id) {
  let cur = id;
  while (cur) {
    if (world.get(cur, Node)?.kind === "Project") return cur;
    cur = getParent(world, cur);
  }
  return 0;
}

export function ExecutionSystem(world, _dt) {
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

        const projectId = projectOf(world, taskId);
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
