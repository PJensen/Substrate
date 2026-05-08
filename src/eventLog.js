export class EventLog {
  #events = [];
  #ordinal = 0;

  emit(step, type, payload) {
    this.#events.push({ t: type, s: step, o: this.#ordinal++, ...payload });
  }

  drain() {
    const events = this.#events;
    this.#events = [];
    this.#ordinal = 0;
    return events;
  }

  size() {
    return this.#events.length;
  }
}

export async function appendEventsToFile(events, filePath) {
  if (!events.length) return;
  const lines = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
  await Deno.writeTextFile(filePath, lines, { append: true });
}

export async function* streamEvents(filePath, fromStep = 0, toStep = Infinity) {
  const text = await Deno.readTextFile(filePath);
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const event = JSON.parse(line);
    if (event.s >= fromStep && event.s <= toStep) yield event;
  }
}
