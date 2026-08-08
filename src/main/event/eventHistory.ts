import { hasActiveEvent, type PetEvent } from './eventCenter'

export interface EventHistory {
  add(ev: PetEvent): void
  list(): PetEvent[]
  clear(): void
  readonly size: number
}

export function createEventHistory(limit = 200): EventHistory {
  const items: PetEvent[] = []
  function add(ev: PetEvent): void {
    items.push(ev)
    while (items.length > limit) items.shift()
  }
  function list(): PetEvent[] {
    return items.map((e) => ({ ...e })).reverse()
  }
  function clear(): void {
    items.length = 0
  }
  return { add, list, clear, get size(): number { return items.length } }
}

export function recordNewEvents(active: PetEvent[], incoming: PetEvent[], history: EventHistory, now = Date.now()): number {
  let added = 0
  for (const ev of incoming) {
    if (!hasActiveEvent(active, ev.source, ev.type, now)) {
      history.add(ev)
      added++
    }
  }
  return added
}
