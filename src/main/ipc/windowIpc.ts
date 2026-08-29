import { app, ipcMain } from 'electron'
import type { LogFn } from '../logging/logger'
import type { SettingsController } from '../settings/settingsController'
import type { WindowHub } from '../window/windows'

export interface WindowIpcDeps {
  windows: WindowHub
  settings: Pick<SettingsController, 'setSize' | 'setOpacity'>
  log: LogFn
}

/** window:hide/quit/dragBy/setSize/setOpacity/setIgnoreMouseEvents + center:open + app:version */
export function registerWindowIpc(deps: WindowIpcDeps): void {
  ipcMain.handle('window:hide', () => deps.windows.hidePet())
  ipcMain.handle('window:quit', () => app.quit())
  ipcMain.handle('window:dragBy', (_e, dx: number, dy: number) => {
    const win = deps.windows.pet()
    if (!win) return
    if (typeof dx !== 'number' || !Number.isFinite(dx) || typeof dy !== 'number' || !Number.isFinite(dy)) return
    const [x, y] = win.getPosition()
    win.setPosition(x + Math.round(dx), y + Math.round(dy))
  })
  ipcMain.handle('window:setSize', (_e, size: number) => deps.settings.setSize(size))
  ipcMain.handle('window:setOpacity', (_e, opacity: number) => deps.settings.setOpacity(opacity))
  ipcMain.handle('window:setIgnoreMouseEvents', (_e, ignore: boolean) => {
    deps.windows.pet()?.setIgnoreMouseEvents(ignore, { forward: true })
    deps.log('info', '[pet-hit] ignore =', ignore)
  })
  ipcMain.handle('center:open', (_e, tab?: string) => deps.windows.openCenter(tab))
  ipcMain.handle('app:version', () => app.getVersion())
}
