import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { Settings } from '../../shared/ipc'
import { DEFAULT_SPEECH } from '../../shared/speech'

export const DEFAULT_SETTINGS: Settings = {
  position: { x: 400, y: 300 },
  size: 256,
  opacity: 1,
  autoLaunch: false,
  activeCharacterId: 'rabbit',
  speech: DEFAULT_SPEECH,
  shortcutsEnabled: true
}

export function loadSettings(filePath: string, defaults: Settings = DEFAULT_SETTINGS): Settings {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<Settings>
    return {
      ...defaults,
      ...raw,
      // 类型/范围钳制：损坏配置（字符串、NaN、越界）回退默认值
      size:
        typeof raw.size === 'number' && Number.isFinite(raw.size)
          ? Math.round(Math.min(512, Math.max(96, raw.size)))
          : defaults.size,
      opacity:
        typeof raw.opacity === 'number' && Number.isFinite(raw.opacity)
          ? Math.min(1, Math.max(0.3, raw.opacity))
          : defaults.opacity,
      position: {
        x: typeof raw.position?.x === 'number' && Number.isFinite(raw.position.x) ? raw.position.x : defaults.position.x,
        y: typeof raw.position?.y === 'number' && Number.isFinite(raw.position.y) ? raw.position.y : defaults.position.y
      },
      speech: { ...defaults.speech, ...(raw.speech ?? {}) },
      activeCharacterId:
        typeof raw.activeCharacterId === 'string' && /^[a-z0-9_-]*$/.test(raw.activeCharacterId)
          ? raw.activeCharacterId
          : defaults.activeCharacterId,
      autoLaunch: typeof raw.autoLaunch === 'boolean' ? raw.autoLaunch : defaults.autoLaunch,
      shortcutsEnabled: typeof raw.shortcutsEnabled === 'boolean' ? raw.shortcutsEnabled : defaults.shortcutsEnabled
    }
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(filePath: string, settings: Settings): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(settings, null, 2), 'utf-8')
  } catch (err) {
    console.error('[storage] save failed:', err)
  }
}
