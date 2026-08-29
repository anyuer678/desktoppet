import { ipcMain } from 'electron'
import type { Settings } from '../../shared/ipc'
import type { SettingsController } from '../settings/settingsController'

export interface SettingsIpcDeps {
  settings: SettingsController
}

/** settings:get / settings:filePath / settings:set */
export function registerSettingsIpc(deps: SettingsIpcDeps): void {
  ipcMain.handle('settings:get', () => deps.settings.get())
  ipcMain.handle('settings:filePath', () => deps.settings.filePath())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => deps.settings.set(patch))
}
