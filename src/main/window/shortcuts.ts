import { globalShortcut } from 'electron'
import type { BrowserWindow } from 'electron'

export interface ShortcutsDeps {
  /** 当前桌宠窗口（getter：窗口可能被关闭置 null） */
  getPetWindow(): BrowserWindow | null
  /** 打开控制中心（可带 tab） */
  openCenter(tab?: string): void
  /** 快捷键开关（每次注册时现读 settings.shortcutsEnabled） */
  enabled(): boolean
}

export interface ShortcutsHub {
  register(): void
  unregister(): void
  applyEnabled(enabled: boolean): void
}

const SHORTCUTS: { accel: string; action: (deps: ShortcutsDeps) => void }[] = [
  { accel: 'Ctrl+Shift+P', action: (d) => togglePetVisible(d) },
  { accel: 'Ctrl+Shift+C', action: (d) => d.openCenter() }
]

function togglePetVisible(deps: ShortcutsDeps): void {
  const win = deps.getPetWindow()
  if (!win) return
  if (win.isVisible()) {
    win.hide()
  } else {
    win.show()
    win.focus()
  }
}

/** 全局快捷键：注册/注销与开关切换（Ctrl+Shift+P 显隐桌宠、Ctrl+Shift+C 控制中心） */
export function createShortcutsHub(deps: ShortcutsDeps): ShortcutsHub {
  function register(): void {
    if (!deps.enabled()) return
    for (const s of SHORTCUTS) {
      globalShortcut.register(s.accel, () => s.action(deps))
    }
  }

  function unregister(): void {
    for (const s of SHORTCUTS) {
      globalShortcut.unregister(s.accel)
    }
  }

  function applyEnabled(enabled: boolean): void {
    if (enabled) {
      if (!globalShortcut.isRegistered(SHORTCUTS[0].accel)) register()
    } else {
      unregister()
    }
  }

  return { register, unregister, applyEnabled }
}
