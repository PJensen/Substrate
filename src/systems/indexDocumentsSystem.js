import { Summary, Facts, ArtifactState } from "../components.js";

export function IndexDocumentsSystem(world, _dt, eventLog) {
  for (const [docId, doc] of world.query(ArtifactState)) {
    if (!doc.needsIndex) continue;

    if (!world.has(docId, Summary)) {
      const summaryText =
        `Indexed ${doc.title}. ` +
        `This document appears relevant to the active project and can be used for retrieval/context assembly.`;
      world.add(docId, Summary, {
        text: summaryText,
      });
      if (eventLog) {
        eventLog.emit(world.step, "cmp_add", {
          id: docId,
          cmp: "Summary",
          data: { text: summaryText },
        });
      }
    }

    if (!world.has(docId, Facts)) {
      const items = [
        `source:${doc.uri}`,
        `trust:${doc.trust}`,
        `title:${doc.title}`,
      ];
      world.add(docId, Facts, {
        items,
      });
      if (eventLog) {
        eventLog.emit(world.step, "cmp_add", {
          id: docId,
          cmp: "Facts",
          data: { items },
        });
      }
    }

    world.set(docId, ArtifactState, { needsIndex: false });
    if (eventLog) {
      eventLog.emit(world.step, "cmp_set", {
        id: docId,
        cmp: "ArtifactState",
        data: { needsIndex: false },
      });
    }
  }
}
