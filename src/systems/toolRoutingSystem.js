import { TaskState } from "../components.js";
import { ToolState } from "../components.js";

export function ToolRoutingSystem(world, _dt, eventLog) {
  for (const [taskId, task] of world.query(TaskState)) {
    if (task.status !== "ready") continue;
    if (task.assignedTo) continue;

    for (const [toolId, tool] of world.query(ToolState)) {
      if (!tool.online) continue;
      if (!tool.supports.includes(task.kind)) continue;

      world.set(taskId, TaskState, { assignedTo: toolId });
      if (eventLog) {
        eventLog.emit(world.step, "cmp_set", {
          id: taskId,
          cmp: "TaskState",
          data: { assignedTo: toolId },
        });
      }
      break;
    }
  }
}
