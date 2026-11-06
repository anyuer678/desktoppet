import { ipcMain } from 'electron'
import type { InteractionKind } from '../../shared/ipc'
import type { EventRuntime } from '../event/eventRuntime'
import type { StatsRuntime } from '../stats/statsRuntime'
import type { EmotionRuntime } from '../emotion/emotionRuntime'
import { countInteraction } from '../stats/dailyStats'

export interface EventsIpcDeps {
  events: Pick<EventRuntime, 'history'>
  stats: Pick<StatsRuntime, 'record'>
  emotion: Pick<EmotionRuntime, 'record'>
  notifyCenter(channel: string, payload?: unknown): void
}

/** events:history / events:historyClear / pet:interact */
export function registerEventsIpc(deps: EventsIpcDeps): void {
  ipcMain.handle('events:history', () => ({ ok: true, events: deps.events.history().list() }))
  ipcMain.handle('events:historyClear', () => {
    deps.events.history().clear()
    deps.notifyCenter('pet:events:history', { events: [] })
    return { ok: true }
  })
  ipcMain.on('pet:interact', (_e, kind: unknown) => {
    if (kind !== 'click' && kind !== 'drag' && kind !== 'speak') return
    deps.stats.record((s) => countInteraction(s, kind as InteractionKind))
    // 点击/说话让心情变好；拖动不计心情
    if (kind === 'click' || kind === 'speak') deps.emotion.record('interact')
  })
}
