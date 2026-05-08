import { TaskState, Attention, SessionState, Name, Node } from "../components.js";
import { children, getParent } from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";

export function AttentionSystem(world, _dt) {
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

    const projectId = (function findProject(id) {
      let cur = id;
      while (cur) {
        if (world.get(cur, Node)?.kind === "Project") return cur;
        cur = getParent(world, cur);
      }
      return 0;
    })(sessionId);

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
