import { Summary, Facts, DocumentState } from "../components.js";

export function IndexDocumentsSystem(world, _dt) {
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
