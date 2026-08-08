import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { PassiveSourcesConfig } from '../../shared/ipc'

export const DEFAULT_PASSIVE_SOURCES_CONFIG: PassiveSourcesConfig = {
  clipboard: {
    enabled: true,
    pollMs: 3000,
    onlyPatterns: [],
    ignorePatterns: ['^\\d+$', '^\\s*$'],
    maxLen: 120
  },
  folder: {
    enabled: false,
    dir: '',
    patterns: ['*'],
    debounceMs: 500
  },
  foreground: {
    enabled: false,
    pollMs: 15000,
    mappings: []
  }
}

const DEFAULT_CLIPBOARD = DEFAULT_PASSIVE_SOURCES_CONFIG.clipboard
const DEFAULT_FOLDER = DEFAULT_PASSIVE_SOURCES_CONFIG.folder
const DEFAULT_FOREGROUND = DEFAULT_PASSIVE_SOURCES_CONFIG.foreground

function normalizeTextList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string')
  return []
}

/** 逐节 normalize 用：数组项过滤为 string（含空数组）；非数组/缺失 → 取 fallback 默认 */
function normalizeTextListWithDefault(raw: unknown, fallback: string[]): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string')
  return fallback
}

export function normalizePassiveTextList(raw: unknown): string[] {
  return normalizeTextList(raw)
}

/** 正整数钳制：仅接受有限正整数；非数字/NaN/<=0 → 回退默认；超上限 → 钳到上限 */
function clampPositiveInt(raw: unknown, fallback: number, max: number): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return fallback
  if (!Number.isInteger(raw) || raw <= 0) return fallback
  return Math.min(max, raw)
}

function normalizeClipboard(raw: unknown): PassiveSourcesConfig['clipboard'] {
  const c = (raw ?? {}) as Record<string, unknown>
  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : DEFAULT_CLIPBOARD.enabled,
    pollMs: clampPositiveInt(c.pollMs, DEFAULT_CLIPBOARD.pollMs, 60_000),
    onlyPatterns: normalizeTextListWithDefault(c.onlyPatterns, DEFAULT_CLIPBOARD.onlyPatterns),
    ignorePatterns: normalizeTextListWithDefault(c.ignorePatterns, DEFAULT_CLIPBOARD.ignorePatterns),
    maxLen: clampPositiveInt(c.maxLen, DEFAULT_CLIPBOARD.maxLen, 10_000)
  }
}

function normalizeFolder(raw: unknown): PassiveSourcesConfig['folder'] {
  const c = (raw ?? {}) as Record<string, unknown>
  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : DEFAULT_FOLDER.enabled,
    dir: typeof c.dir === 'string' ? c.dir : DEFAULT_FOLDER.dir,
    patterns: normalizeTextListWithDefault(c.patterns, DEFAULT_FOLDER.patterns),
    debounceMs: clampPositiveInt(c.debounceMs, DEFAULT_FOLDER.debounceMs, 60_000)
  }
}

function normalizeForeground(raw: unknown): PassiveSourcesConfig['foreground'] {
  const c = (raw ?? {}) as Record<string, unknown>
  return {
    enabled: typeof c.enabled === 'boolean' ? c.enabled : DEFAULT_FOREGROUND.enabled,
    pollMs: clampPositiveInt(c.pollMs, DEFAULT_FOREGROUND.pollMs, 300_000),
    mappings: normalizeMappings(c.mappings)
  }
}

function normalizeMappings(raw: unknown): PassiveSourcesConfig['foreground']['mappings'] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((m): m is Record<string, unknown> => !!m && typeof m === 'object')
    .filter(
      (m) =>
        typeof m.process === 'string' &&
        (m.state === 'focus' || m.state === 'ignore')
    )
    .map((m) => ({ process: m.process, state: m.state } as { process: string; state: 'focus' | 'ignore' }))
}

export function loadPassiveConfig(filePath: string): PassiveSourcesConfig {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>
    return {
      clipboard: normalizeClipboard(raw.clipboard),
      folder: normalizeFolder(raw.folder),
      foreground: normalizeForeground(raw.foreground)
    }
  } catch {
    return {
      clipboard: { ...DEFAULT_CLIPBOARD, onlyPatterns: [...DEFAULT_CLIPBOARD.onlyPatterns], ignorePatterns: [...DEFAULT_CLIPBOARD.ignorePatterns] },
      folder: { ...DEFAULT_FOLDER, patterns: [...DEFAULT_FOLDER.patterns] },
      foreground: { ...DEFAULT_FOREGROUND, mappings: [] }
    }
  }
}

export function savePassiveConfig(filePath: string, cfg: PassiveSourcesConfig): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    const temp = `${filePath}.tmp`
    writeFileSync(temp, JSON.stringify(cfg, null, 2), 'utf-8')
    renameSync(temp, filePath)
  } catch (err) {
    console.error('[passive] save failed:', err)
  }
}

export function validatePassiveConfig(cfg: unknown): string | null {
  if (!cfg || typeof cfg !== 'object') return '被动数据源配置为空'
  const c = cfg as Record<string, unknown>
  const clip = (c.clipboard ?? {}) as Record<string, unknown>
  const folder = (c.folder ?? {}) as Record<string, unknown>
  const fg = (c.foreground ?? {}) as Record<string, unknown>

  if (typeof clip.pollMs !== 'number' || !Number.isInteger(clip.pollMs) || clip.pollMs <= 0) {
    return 'clipboard.pollMs 必须为正整数'
  }
  if (typeof clip.maxLen !== 'number' || !Number.isInteger(clip.maxLen) || clip.maxLen <= 0) {
    return 'clipboard.maxLen 必须为正整数'
  }
  if (!isNonEmptyStringList(clip.onlyPatterns)) return 'clipboard.onlyPatterns 需为非空字符串数组'
  if (!isNonEmptyStringList(clip.ignorePatterns)) return 'clipboard.ignorePatterns 需为非空字符串数组'
  if (typeof folder.dir !== 'string') return 'folder.dir 必须为字符串'
  if (typeof folder.debounceMs !== 'number' || !Number.isInteger(folder.debounceMs) || folder.debounceMs <= 0) {
    return 'folder.debounceMs 必须为正整数'
  }
  if (!isNonEmptyStringList(folder.patterns)) return 'folder.patterns 需为非空字符串数组'
  if (typeof fg.pollMs !== 'number' || !Number.isInteger(fg.pollMs) || fg.pollMs <= 0) {
    return 'foreground.pollMs 必须为正整数'
  }
  if (!Array.isArray(fg.mappings)) return 'foreground.mappings 必须为数组'
  for (const m of fg.mappings) {
    if (!m || typeof m !== 'object') return 'foreground.mappings 的每项必须为对象'
    const mm = m as Record<string, unknown>
    if (typeof mm.process !== 'string' || mm.process.length === 0) {
      return 'foreground.mappings 的 process 必须为非空字符串'
    }
    if (mm.state !== 'focus' && mm.state !== 'ignore') {
      return 'foreground.mappings 的 state 必须为 focus 或 ignore'
    }
  }
  return null
}

function isNonEmptyStringList(raw: unknown): boolean {
  if (!Array.isArray(raw)) return false
  return raw.every((v) => typeof v === 'string' && v.length > 0)
}