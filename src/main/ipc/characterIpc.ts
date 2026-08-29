import { BrowserWindow, dialog, ipcMain } from 'electron'
import { join } from 'path'
import type { CharacterPatch, CharacterSummary } from '../../shared/ipc'
import { charactersRoot } from '../app/paths'
import { listCharacters, readCharacterDetail } from '../character/configReader'
import {
  deletePetArchive,
  exportPetArchive,
  importPetArchive,
  suggestPackFileName,
  validatePackId
} from '../character/importer'
import { updateCharacterConfig } from '../character/configEditor'
import type { SettingsController } from '../settings/settingsController'
import type { StatsRuntime } from '../stats/statsRuntime'
import type { WindowHub } from '../window/windows'

export interface CharacterIpcDeps {
  settings: Pick<SettingsController, 'get' | 'setActiveCharacter'>
  windows: Pick<WindowHub, 'notifyPet'>
  stats: Pick<StatsRuntime, 'switchRole'>
}

/** character:list/get/select/pick/import/delete/update/export */
export function registerCharacterIpc(deps: CharacterIpcDeps): void {
  /** 切换角色：更新 settings → 落盘 → 通知渲染层 → 统计切目录（原 index.selectCharacter 语义） */
  function selectCharacter(id: string): void {
    deps.settings.setActiveCharacter(id)
    deps.windows.notifyPet('character:changed', id)
    deps.stats.switchRole()
  }

  ipcMain.handle('character:list', () => {
    return listCharacters(charactersRoot()).map<CharacterSummary>((c) => ({
      id: c.id,
      name: c.name,
      version: c.version,
      preview: c.avatarPreview ? `pet://${c.id}/${c.avatarPreview}` : '',
      supportedStates: c.supportedStates
    }))
  })
  ipcMain.handle('character:get', (_e, id: string) => {
    const idError = validatePackId(id)
    if (idError) return { id, ok: false, error: idError }
    const detail = readCharacterDetail(charactersRoot(), id)
    return detail ?? { id, ok: false, error: '角色包加载失败或不存在' }
  })
  ipcMain.handle('character:select', (_e, id: string) => {
    if (id !== '' && validatePackId(id) !== null) {
      return { id, ok: false, error: '角色 id 不合法' }
    }
    selectCharacter(id)
    return { id, ok: true }
  })
  ipcMain.handle('character:pick', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: '选择角色包',
      properties: ['openFile'],
      filters: [{ name: '角色包', extensions: ['pet', 'zip'] }]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
  ipcMain.handle('character:import', (_e, zipPath: string, overwrite?: boolean) => {
    return importPetArchive(zipPath, charactersRoot(), overwrite ? { overwrite: true } : undefined)
  })
  ipcMain.handle('character:delete', (_e, id: string) => {
    const result = deletePetArchive(charactersRoot(), id)
    if (result.ok && deps.settings.get().activeCharacterId === id) {
      const fallback = listCharacters(charactersRoot())[0]?.id ?? ''
      deps.settings.setActiveCharacter(fallback)
      deps.windows.notifyPet('character:changed', fallback)
      deps.stats.switchRole()
    }
    return result
  })
  ipcMain.handle('character:update', (_e, id: string, patch: CharacterPatch) => {
    const idError = validatePackId(id)
    if (idError) return { ok: false, id, error: idError }
    const result = updateCharacterConfig(join(charactersRoot(), id, 'config.json'), patch)
    if (result.ok) deps.windows.notifyPet('character:changed', id)
    return { ok: result.ok, id, error: result.error }
  })
  ipcMain.handle('character:export', async (event, id: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.SaveDialogOptions = {
      title: '导出角色包',
      defaultPath: suggestPackFileName(charactersRoot(), id),
      filters: [{ name: '角色包', extensions: ['pet'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { ok: false, error: '已取消导出' }
    return exportPetArchive(charactersRoot(), id, result.filePath)
  })
}
