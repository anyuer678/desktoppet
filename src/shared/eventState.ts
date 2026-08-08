import type { PetEventInfo } from './ipc'

export const PET_STATES = ['idle', 'focus', 'sleep', 'happy', 'warning'] as const
export type PetState = (typeof PET_STATES)[number]

export const STATE_CATEGORIES: Record<Exclude<PetState, 'idle'>, readonly string[]> = {
  warning: ['cpu_high', 'memory_warning', 'battery_low', 'network_error', 'alarm', 'warning', 'error'],
  happy: ['complete', 'success', 'reward'],
  sleep: ['user_idle', 'sleep', 'away', 'lock_screen'],
  focus: ['working', 'focus', 'busy', 'notice']
}

export function stateOf(type: string): PetState {
  for (const state of PET_STATES) {
    if (state === 'idle') continue
    if (STATE_CATEGORIES[state].includes(type)) return state
  }
  return 'idle'
}

const GROUP_LABELS: Record<string, string> = {
  monitor: '系统监控',
  plugin: '插件',
  clipboard: '剪贴板',
  folder: '目录',
  foreground: '前台应用',
  push: '推送',
  schedule: '日程',
  autoReport: '自动报告'
}

export function groupLabel(source: string): string {
  const key = source.split(':')[0]
  return GROUP_LABELS[key] ?? source
}

export function isHighPriority(priority: number): boolean {
  return priority >= 8
}

export interface HistoryFilter {
  source: string
  state: string
  highOnly: boolean
}

export function filterHistory(events: PetEventInfo[], filter: HistoryFilter): PetEventInfo[] {
  return events.filter((e) => {
    if (filter.source !== '' && groupLabel(e.source) !== filter.source) return false
    if (filter.state !== '' && stateOf(e.type) !== filter.state) return false
    if (filter.highOnly && !isHighPriority(e.priority)) return false
    return true
  })
}
