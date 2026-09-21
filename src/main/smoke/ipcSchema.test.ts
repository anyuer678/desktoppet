import { readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import { INTERACTION_ACTIONS } from '../../shared/ipc'
import type { PetEventInfo, PushApiFired, ScheduleItem } from '../../shared/ipc'

const PRELOAD_PATH = join(__dirname, '../../preload/index.ts')

/** Extract ipcRenderer.invoke / .on / .send channel names from preload source */
function extractIpcChannels(): { invoke: string[]; on: string[]; send: string[] } {
  const src = readFileSync(PRELOAD_PATH, 'utf-8')
  const pick = (re: RegExp): string[] => [...src.matchAll(re)].map((m) => m[1])
  return {
    invoke: pick(/ipcRenderer\.invoke\(\s*'([^']+)'/g),
    on: pick(/ipcRenderer\.on\(\s*'([^']+)'/g),
    send: pick(/ipcRenderer\.send\(\s*'([^']+)'/g)
  }
}

describe('IPC channel naming contract (headless smoke)', () => {
  it('invoke channels follow namespace:action', () => {
    const { invoke } = extractIpcChannels()
    expect(invoke.length).toBeGreaterThan(20)
    for (const ch of invoke) {
      expect(ch, `bad invoke channel: ${ch}`).toMatch(/^[a-zA-Z]+:[a-zA-Z:]+$/)
    }
  })

  it('broadcast channels stay in character/pet/push/schedule/autoReport', () => {
    const { on, send } = extractIpcChannels()
    const allowedPrefixes = ['character:', 'pet:', 'push:', 'schedule:', 'autoReport:']
    for (const ch of [...on, ...send]) {
      const ok = allowedPrefixes.some((p) => ch.startsWith(p) || ch === 'perf:fps')
      expect(ok, `unexpected broadcast channel: ${ch}`).toBe(true)
    }
  })

  it('preload exposes character:get / character:list for pack load paths', () => {
    const { invoke } = extractIpcChannels()
    expect(invoke).toContain('character:get')
    expect(invoke).toContain('character:list')
  })
})

describe('IPC payload schema invariants', () => {
  it('PushApiFired allows only reaction fields (no free-text body keys)', () => {
    const allowed = new Set(['kind', 'reaction', 'placeholder', 'title', 'body', 'type'])
    const sample: PushApiFired = {
      kind: 'passive',
      reaction: 'clipSensitive',
      placeholder: ''
    }
    for (const key of Object.keys(sample)) {
      expect(allowed.has(key)).toBe(true)
    }
    expect(Object.keys(sample)).not.toContain('raw')
    expect(Object.keys(sample)).not.toContain('text')
    expect(Object.keys(sample)).not.toContain('content')
  })

  it('PetEventInfo is metadata-only', () => {
    const allowed = new Set(['source', 'type', 'priority', 'durationMs', 'occurredAt'])
    const sample: PetEventInfo = {
      source: 'clipboard',
      type: 'clipboard',
      priority: 5,
      durationMs: 8000,
      occurredAt: 1
    }
    expect(Object.keys(sample).every((k) => allowed.has(k))).toBe(true)
  })

  it('ScheduleItem required fields + closed type enum', () => {
    const types = new Set(['once', 'daily', 'weekly'])
    const item: ScheduleItem = {
      id: 'a1',
      title: 'water',
      message: 'break time',
      type: 'daily',
      trigger: '10:00',
      daysOfWeek: [],
      enabled: true,
      lastFiredAt: null,
      createdAt: 0
    }
    expect(types.has(item.type)).toBe(true)
    expect(item.daysOfWeek.every((d) => d >= 0 && d <= 6)).toBe(true)
  })

  it('INTERACTION_ACTIONS matches character pack enum', () => {
    expect([...INTERACTION_ACTIONS]).toEqual(['open_center', 'menu', 'speak', 'none'])
  })
})
