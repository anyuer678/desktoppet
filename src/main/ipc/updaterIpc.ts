import { ipcMain } from 'electron'
import type { Updater } from '../app/updater'

export interface UpdaterIpcDeps {
  updater: Updater
}

/** updater:get/check/download/install：用户显式确认的更新链路 */
export function registerUpdaterIpc(deps: UpdaterIpcDeps): void {
  ipcMain.handle('updater:get', () => deps.updater.status())
  ipcMain.handle('updater:check', () => {
    deps.updater.checkNow()
    return { ok: true }
  })
  ipcMain.handle('updater:download', () => deps.updater.download())
  ipcMain.handle('updater:install', () => deps.updater.install())
}
