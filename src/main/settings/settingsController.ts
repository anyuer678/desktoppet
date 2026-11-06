import { app } from 'electron'
import type { Settings } from '../../shared/ipc'
import { settingsPath } from '../app/paths'
import {
  loadSettings,
  normalizePluginIds,
  normalizeSpeechPools,
  saveSettings
} from '../storage/settingsStore'
import { validatePackId } from '../character/importer'

export const MIN_PET_SIZE = 96
export const MAX_PET_SIZE = 512

/** settings:set 允许的键白名单：白名单外的 patch 键一律丢弃（渲染进程不可写入任意字段） */
const SETTABLE_KEYS = new Set([
  'position',
  'size',
  'opacity',
  'autoLaunch',
  'activeCharacterId',
  'speech',
  'shortcutsEnabled',
  'disabledPlugins',
  'soundEnabled',
])

export interface SettingsControllerDeps {
  /** shortcutsEnabled 变化后增删全局快捷键 */
  applyShortcutsEnabled(enabled: boolean): void
  /** size 变化后应用窗口尺寸 */
  applyPetSize(size: number): void
  /** setOpacity 后通知渲染层（原 window:setOpacity 行为） */
  notifyPet(channel: string, payload?: unknown): void
}

export interface SettingsController {
  get(): Settings
  filePath(): string
  /** whenReady 中从磁盘加载（settings.json 不存在/损坏时回退默认值） */
  load(): void
  /** 配置导入后重新加载并即时应用尺寸/透明度/快捷键/自启/台词池 */
  reload(): void
  /** settings:set：合并 patch（size/opacity/activeCharacterId 校验）→ 立即落盘 → 联动尺寸/自启/快捷键 */
  set(patch: Partial<Settings>): Settings
  /** window:setSize：clamp → 合并 → 立即落盘 → 应用窗口尺寸；返回生效尺寸 */
  setSize(size: number): number
  /** window:setOpacity：clamp → 合并 → 立即落盘；返回生效不透明度 */
  setOpacity(opacity: number): number
  /** selectCharacter / character:delete fallback：更新并立即落盘 */
  setActiveCharacter(id: string): void
  /** 拖动窗口：合并 position + 防抖落盘（原 moved 行为） */
  onPetMoved(position: { x: number; y: number }): void
  /** 位置越界修正：合并 position + 立即落盘（原 ensurePetPosition 行为） */
  fixPosition(position: { x: number; y: number }): void
  /** 退出前冲刷防抖落盘（will-quit 首项） */
  flush(): void
}

/** settings 状态持有者：原模块级唯一可变 settings 收敛于此闭包 */
export function createSettingsController(deps: SettingsControllerDeps): SettingsController {
  let settings: Settings
  let saveTimer: NodeJS.Timeout | null = null

  /** 原 debouncedSaveSettings：300ms 防抖（窗口拖动高频触发） */
  function debouncedSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      saveSettings(settingsPath(), settings)
    }, 300)
  }

  return {
    get: () => settings,
    filePath: () => settingsPath(),
    load: () => {
      settings = loadSettings(settingsPath())
    },
    reload: () => {
      settings = loadSettings(settingsPath())
      deps.applyPetSize(settings.size)
      deps.applyShortcutsEnabled(settings.shortcutsEnabled)
      app.setLoginItemSettings({ openAtLogin: settings.autoLaunch })
      deps.notifyPet('pet:settings-changed', {
        size: settings.size,
        opacity: settings.opacity,
        speech: settings.speech,
        soundEnabled: settings.soundEnabled
      })
    },
    set: (patch) => {
      const safePatch: Partial<Settings> = patch ?? {}
      // 白名单过滤：__proto__/constructor 或任意未知键直接丢弃
      const filtered = Object.fromEntries(
        Object.entries(safePatch).filter(([k]) => SETTABLE_KEYS.has(k))
      ) as Partial<Settings>
      const next: Partial<Settings> = { ...filtered }
      if ('size' in next) {
        if (typeof next.size !== 'number' || !Number.isFinite(next.size)) delete next.size
        else next.size = Math.round(Math.min(MAX_PET_SIZE, Math.max(MIN_PET_SIZE, next.size)))
      }
      if ('opacity' in next) {
        if (typeof next.opacity !== 'number' || !Number.isFinite(next.opacity)) delete next.opacity
        else next.opacity = Math.min(1, Math.max(0.3, next.opacity))
      }
      if ('position' in next) {
        const raw = next.position as unknown as { x?: unknown; y?: unknown } | null
        if (
          !raw ||
          typeof raw !== 'object' ||
          typeof raw.x !== 'number' ||
          typeof raw.y !== 'number' ||
          !Number.isFinite(raw.x) ||
          !Number.isFinite(raw.y)
        ) {
          delete next.position
        } else {
          next.position = { x: Math.round(raw.x), y: Math.round(raw.y) }
        }
      }
      if ('autoLaunch' in next && typeof next.autoLaunch !== 'boolean') delete next.autoLaunch
      if ('shortcutsEnabled' in next && typeof next.shortcutsEnabled !== 'boolean') {
        delete next.shortcutsEnabled
      }
      // activeCharacterId 仅接受合法角色 id 或空串（删除全部角色后的兜底）；非法值忽略
      if ('activeCharacterId' in next) {
        const id = next.activeCharacterId
        if (typeof id !== 'string' || (id !== '' && validatePackId(id) !== null)) {
          delete next.activeCharacterId
        }
      }
      // 台词池来自渲染层，必须规范化后再落盘，避免坏结构在下次启动时崩掉桌宠
      if ('speech' in next) {
        next.speech = normalizeSpeechPools(next.speech)
      }
      if ('disabledPlugins' in next) {
        next.disabledPlugins = normalizePluginIds(next.disabledPlugins)
      }
      if ('soundEnabled' in next && typeof next.soundEnabled !== 'boolean') {
        delete next.soundEnabled
      }
      settings = { ...settings, ...next }
      saveSettings(settingsPath(), settings)
      // 保持原行为：无论 patch 是否含 size，都按当前尺寸应用一次窗口尺寸
      deps.applyPetSize(settings.size)
      if (next.speech || 'soundEnabled' in next) {
        // 台词池/音效开关即时同步到已运行的桌宠窗口（否则要重启才生效）
        deps.notifyPet('pet:settings-changed', {
          size: settings.size,
          opacity: settings.opacity,
          speech: settings.speech,
          soundEnabled: settings.soundEnabled
        })
      }
      if (typeof safePatch.autoLaunch === 'boolean') {
        app.setLoginItemSettings({ openAtLogin: safePatch.autoLaunch })
      }
      if (typeof safePatch.shortcutsEnabled === 'boolean') {
        deps.applyShortcutsEnabled(safePatch.shortcutsEnabled)
      }
      return settings
    },
    setSize: (size) => {
      settings = { ...settings, size: Math.round(Math.min(MAX_PET_SIZE, Math.max(MIN_PET_SIZE, size))) }
      saveSettings(settingsPath(), settings)
      deps.applyPetSize(settings.size)
      return settings.size
    },
    setOpacity: (opacity) => {
      const clamped = Math.min(1, Math.max(0.3, opacity))
      settings = { ...settings, opacity: clamped }
      saveSettings(settingsPath(), settings)
      deps.notifyPet('pet:settings-changed', { size: settings.size, opacity: clamped })
      return settings.opacity
    },
    setActiveCharacter: (id) => {
      settings = { ...settings, activeCharacterId: id }
      saveSettings(settingsPath(), settings)
    },
    onPetMoved: (position) => {
      settings = { ...settings, position }
      debouncedSave()
    },
    fixPosition: (position) => {
      settings = { ...settings, position }
      saveSettings(settingsPath(), settings)
    },
    flush: () => {
      if (saveTimer) {
        clearTimeout(saveTimer)
        saveTimer = null
      }
      saveSettings(settingsPath(), settings)
    }
  }
}
