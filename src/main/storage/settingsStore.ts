import { readFileSync } from 'fs'
import type { Settings } from '../../shared/ipc'
import { writeFileAtomic } from './atomicWrite'
import { DEFAULT_SPEECH, type SpeechPoolKey, type SpeechPools } from '../../shared/speech'

const PLUGIN_ID_RE = /^[a-z0-9_-]+$/

/** 停用插件 id 规范化：仅接受合法插件 id，去重（损坏配置不会影响启动） */
export function normalizePluginIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return [...new Set(raw.filter((v): v is string => typeof v === 'string' && PLUGIN_ID_RE.test(v)))]
}

/**
 * 台词池规范化：每个池必须是字符串数组。
 * - 缺失/非数组 → 回退该池默认值（兼容旧版本自定义文件）
 * - 数组项过滤非字符串并 trim；允许空数组（表示该场景不说话）
 * 渲染层 pickText 直接对池调用数组方法，坏数据会崩掉桌宠窗口，因此读写两侧都必须过此函数。
 */
export function normalizeSpeechPools(raw: unknown): SpeechPools {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const out = {} as SpeechPools
  for (const key of Object.keys(DEFAULT_SPEECH) as SpeechPoolKey[]) {
    const value = source[key]
    out[key] = Array.isArray(value)
      ? value.filter((t): t is string => typeof t === 'string').map((t) => t.trim()).filter((t) => t !== '')
      : [...DEFAULT_SPEECH[key]]
  }
  return out
}

export const DEFAULT_SETTINGS: Settings = {
  position: { x: 400, y: 300 },
  size: 256,
  opacity: 1,
  autoLaunch: false,
  activeCharacterId: 'rabbit',
  speech: DEFAULT_SPEECH,
  shortcutsEnabled: true,
  disabledPlugins: [],
  soundEnabled: false
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
      speech: normalizeSpeechPools(raw.speech ?? defaults.speech),
      activeCharacterId:
        typeof raw.activeCharacterId === 'string' && /^[a-z0-9_-]*$/.test(raw.activeCharacterId)
          ? raw.activeCharacterId
          : defaults.activeCharacterId,
      autoLaunch: typeof raw.autoLaunch === 'boolean' ? raw.autoLaunch : defaults.autoLaunch,
      shortcutsEnabled:
        typeof raw.shortcutsEnabled === 'boolean' ? raw.shortcutsEnabled : defaults.shortcutsEnabled,
      disabledPlugins: normalizePluginIds(raw.disabledPlugins),
      soundEnabled: typeof raw.soundEnabled === 'boolean' ? raw.soundEnabled : defaults.soundEnabled
    }
  } catch {
    return { ...defaults }
  }
}

export function saveSettings(filePath: string, settings: Settings): void {
  try {
    writeFileAtomic(filePath, JSON.stringify(settings, null, 2))
  } catch (err) {
    console.error('[storage] save failed:', err)
  }
}
