#!/usr/bin/env -S deno run --allow-read --allow-write

declare const Deno: any;

import {
  World,
  createFrom,
  attach,
  serializeWorld,
  createVirtualRegistry,
  composeScheduler,
} from "https://raw.githubusercontent.com/pjensen/ecs-js/main/index.js";

import {
  ProjectEntity,
  SessionEntity,
  TaskEntity,
  MessageEntity,
  Artifact,
} from "./archetypes.js";

import { TaskState, Node } from "./components.js";
import { SnapshotStore } from "./snapshotStore.js";
import { EventLog } from "./eventLog.js";
import { buildRegistry } from "./transactionOps.js";
import { registerVirtuals } from "./virtuals.js";

import {
  IndexDocumentsSystem,
  PlanningSystem,
  ToolRoutingSystem,
  ExecutionSystem,
  AttentionSystem,
  PersistenceSystem,
} from "./systems/index.js";

const worldPath = ".substrate/world.json";
let world = new World({ seed: 1337 });
let store = new SnapshotStore({ maxSnapshots: 100 });
let eventLog = new EventLog();
let virtuals = createVirtualRegistry(world);
let SessionContext: any;
let projectId = 0;

function installVirtuals() {
  virtuals = createVirtualRegistry(world);
  const virts = registerVirtuals(world, virtuals);
  if (virts.SessionContext) SessionContext = virts.SessionContext;
}

function errorMessage(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

async function loadWorld() {
  try {
    const data = JSON.parse(await Deno.readTextFile(worldPath));
    const registry = buildRegistry();
    world = World.fromSnapshot(data.snapshot, registry);
    world.step = data.step;
    installVirtuals();
    installScheduler();
  } catch {
    installVirtuals();
    installScheduler();
  }
}

function installScheduler() {
  world.setScheduler(
    composeScheduler(
      (w: any, dt: any) => IndexDocumentsSystem(w, dt, eventLog),
      (w: any, dt: any) => PlanningSystem(w, dt, eventLog),
      (w: any, dt: any) => ToolRoutingSystem(w, dt, eventLog),
      (w: any, dt: any) => ExecutionSystem(w, dt, eventLog),
      (w: any, dt: any) => AttentionSystem(w, dt, eventLog),
      (w: any, dt: any) =>
        PersistenceSystem(w, dt, store, eventLog, "substrate.events.jsonl", {
          checkpointInterval: 1,
        })
    )
  );
}

async function saveWorld() {
  const snapshot = serializeWorld(world);
  const data = { snapshot, step: world.step };
  await Deno.mkdir(".substrate", { recursive: true });
  await Deno.writeTextFile(worldPath, JSON.stringify(data, null, 2));
}

const handlers: any = {
  initialize: async (params: any) => {
    return {
      protocolVersion: params?.protocolVersion ?? "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "substrate",
        version: "1.0.0",
      },
    };
  },

  ping: async () => {
    return {};
  },

  "tools/list": async (_params: any) => {
    return {
      tools: [
        {
          name: "query_session",
          description: "Get session context",
          inputSchema: {
            type: "object",
            properties: {
              session_id: { type: "number" },
            },
            required: ["session_id"],
          },
        },
        {
          name: "create_task",
          description: "Create task",
          inputSchema: {
            type: "object",
            properties: {
              kind: { type: "string" },
              input: { type: "string" },
              target_id: { type: "number" },
            },
            required: ["kind", "input"],
          },
        },
        {
          name: "create_artifact",
          description: "Create artifact",
          inputSchema: {
            type: "object",
            properties: {
              title: { type: "string" },
              uri: { type: "string" },
              trust: { type: "number" },
            },
            required: ["title", "uri"],
          },
        },
        {
          name: "tick",
          description: "Run N ticks",
          inputSchema: {
            type: "object",
            properties: { n: { type: "number" } },
          },
        },
        {
          name: "status",
          description: "World status",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    };
  },

  "tools/call": async (params: any) => {
    const { name, arguments: args } = params;

    try {
      switch (name) {
        case "query_session": {
          const ctx = virtuals.get(args.session_id, SessionContext);
          return { content: [{ type: "text", text: JSON.stringify(ctx) }] };
        }

        case "create_task": {
          let sessionId = 0;
          for (const [id, node] of world.query(Node)) {
            if (node.kind === "Session") {
              sessionId = id;
              break;
            }
          }
          if (!sessionId) {
            sessionId = createFrom(world, SessionEntity, {
              name: "Session",
            });
            attach(world, sessionId, projectId);
          }

          const taskId = createFrom(world, TaskEntity, {
            name: `${args.kind} task`,
            kind: args.kind,
            status: "new",
            input: args.input,
            target: args.target_id || projectId,
            session: sessionId,
            priority: 50,
          });
          attach(world, taskId, projectId);

          await saveWorld();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ taskId, status: "created" }),
              },
            ],
          };
        }

        case "create_artifact": {
          const artifactId = createFrom(world, Artifact, {
            title: args.title,
            uri: args.uri,
            trust: args.trust || 0.5,
          });
          attach(world, artifactId, projectId);

          await saveWorld();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({ artifactId, title: args.title }),
              },
            ],
          };
        }

        case "tick": {
          const n = args.n || 1;
          const before = world.step;
          for (let i = 0; i < n; i++) world.tick(1);
          await saveWorld();
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  before_step: before,
                  after_step: world.step,
                  ticked: n,
                }),
              },
            ],
          };
        }

        case "status": {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  step: world.step,
                  projectId,
                  store_size: store.size(),
                }),
              },
            ],
          };
        }

        default:
          return {
            content: [
              { type: "text", text: JSON.stringify({ error: `Unknown: ${name}` }) },
            ],
            isError: true,
          };
      }
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({ error: errorMessage(err) }),
          },
        ],
        isError: true,
      };
    }
  },
};

async function handleRequest(line: string) {
  try {
    const request = JSON.parse(line);
    const { id, method, params } = request;

    if (id === undefined || id === null) {
      if (method === "notifications/initialized") return;
      return;
    }

    const handler = handlers[method];
    if (!handler) {
      console.log(
        JSON.stringify({
          jsonrpc: "2.0",
          id,
          error: { code: -32601, message: "Method not found" },
        })
      );
      return;
    }

    const result = await handler(params || {});
    console.log(JSON.stringify({ jsonrpc: "2.0", id, result }));
  } catch (err: unknown) {
    console.log(
      JSON.stringify({
        jsonrpc: "2.0",
        id: null,
        error: { code: -32700, message: "Parse error" },
      })
    );
  }
}

async function main() {
  await loadWorld();

  for (const [id, node] of world.query(Node)) {
    if (node.kind === "Project") {
      projectId = id;
      break;
    }
  }
  if (!projectId) {
    projectId = createFrom(world, ProjectEntity, { name: "Project" });
  }

  const reader = Deno.stdin.readable.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value);
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.trim()) {
          await handleRequest(line);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

await main();
