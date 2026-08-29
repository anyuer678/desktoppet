import { app } from 'electron'
import type { Settings } from '../../shared/ipc'
import { settingsPath } from '../app/paths'
import { loadSettings, saveSettings } from '../storage/settingsStore'
import { validatePackId } from '../character/importer'

export const MIN_PET_SIZE = 96
export const MAX_PET_SIZE = 512

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
}

/** settings 状态持有者：原模块级唯一可变 settings 收敛于此闭包 */
export function createSettingsController(deps: SettingsControllerDeps): SettingsController {
  let settings: Settings
  let saveTimer: NodeJS.Timeout | null = null

  /** 原 debouncedSaveSettings：300ms 防抖（窗口拖动高频触发） */
  function debouncedSave(): void {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => saveSettings(settingsPath(), settings), 300)
  }

  return {
    get: () => settings,
    filePath: () => settingsPath(),
    load: () => {
      settings = loadSettings(settingsPath())
    },
    set: (patch) => {
      const next: Partial<Settings> = { ...patch }
      if (typeof next.size === 'number') {
        next.size = Math.round(Math.min(MAX_PET_SIZE, Math.max(MIN_PET_SIZE, next.size)))
      }
      if (typeof next.opacity === 'number') {
        next.opacity = Math.min(1, Math.max(0.3, next.opacity))
      }
      // activeCharacterId 仅接受合法角色 id 或空串（删除全部角色后的兜底）；非法值忽略
      if ('activeCharacterId' in next) {
        const id = next.activeCharacterId
        if (typeof id !== 'string' || (id !== '' && validatePackId(id) !== null)) {
          delete next.activeCharacterId
        }
      }
      settings = { ...settings, ...next }
      saveSettings(settingsPath(), settings)
      // 保持原行为：无论 patch 是否含 size，都按当前尺寸应用一次窗口尺寸
      deps.applyPetSize(settings.size)
      if (typeof patch.autoLaunch === 'boolean') {
        app.setLoginItemSettings({ openAtLogin: patch.autoLaunch })
      }
      if (typeof patch.shortcutsEnabled === 'boolean') {
        deps.applyShortcutsEnabled(patch.shortcutsEnabled)
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
    }
  }
}
