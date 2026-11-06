import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { autoReportsPath, passiveConfigPath, schedulesPath, settingsPath } from '../app/paths'
import {
  createBackupArchive,
  readBackupArchive,
  type BackupEntryName,
  type BackupSourcePaths
} from '../backup/backup'
import { writeFileAtomic } from '../storage/atomicWrite'
import { loadPassiveConfig } from '../event/passiveStore'
import { loadAutoReports } from '../stats/autoReportStore'
import type { SettingsController } from '../settings/settingsController'
import type { PassiveRuntime } from '../event/passiveRuntime'
import type { AutoReportRuntime } from '../stats/autoReportRuntime'
import type { LogFn } from '../logging/logger'

export interface BackupIpcDeps {
  settings: Pick<SettingsController, 'reload'>
  /** 只依赖 reload，避免测试需要构造完整 ScheduleRepository */
  schedule: { repo(): { reload(): void } | null }
  passive: Pick<PassiveRuntime, 'setConfig' | 'rebuild'>
  autoReports: Pick<AutoReportRuntime, 'setConfig'>
  notifyCenter(channel: string, payload?: unknown): void
  log: LogFn
}

function targetPaths(): Record<BackupEntryName, string> {
  return {
    'settings.json': settingsPath(),
    'schedules.json': schedulesPath(),
    'autoReports.json': autoReportsPath(),
    'passiveSources.json': passiveConfigPath()
  }
}

function sourcePaths(): BackupSourcePaths {
  const targets = targetPaths()
  return {
    settings: targets['settings.json'],
    schedules: targets['schedules.json'],
    autoReports: targets['autoReports.json'],
    passive: targets['passiveSources.json']
  }
}

function reloadRuntimes(deps: BackupIpcDeps): void {
  deps.settings.reload()
  deps.schedule.repo()?.reload()
  deps.passive.setConfig(loadPassiveConfig(passiveConfigPath()))
  deps.passive.rebuild()
  deps.autoReports.setConfig(loadAutoReports(autoReportsPath()))
}

/** backup:export / backup:import（仅配置，不含统计/角色素材/推送 Token） */
export function registerBackupIpc(deps: BackupIpcDeps): void {
  ipcMain.handle('backup:export', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const date = new Date()
    const ymd = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const options: Electron.SaveDialogOptions = {
      title: '导出配置备份',
      defaultPath: join(app.getPath('documents'), `DesktopPet-配置备份-${ymd}.dpbackup`),
      filters: [{ name: 'DesktopPet 配置备份', extensions: ['dpbackup'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { ok: false, canceled: true }
    try {
      const { entries } = createBackupArchive(result.filePath, sourcePaths(), app.getVersion())
      deps.log('info', '[backup] exported', result.filePath, entries.join(','))
      return { ok: true, path: result.filePath, entries }
    } catch (err) {
      deps.log('error', '[backup] export failed', err)
      return { ok: false, error: '导出失败，请检查目标目录权限' }
    }
  })

  ipcMain.handle('backup:import', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: '导入配置备份',
      properties: ['openFile'],
      filters: [{ name: 'DesktopPet 配置备份', extensions: ['dpbackup', 'zip'] }]
    }
    const picked = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (picked.canceled || picked.filePaths.length === 0) return { ok: false, canceled: true }

    const read = readBackupArchive(picked.filePaths[0])
    if (!read.ok || !read.files) return { ok: false, error: read.error ?? '备份无效' }

    const message: Electron.MessageBoxOptions = {
      type: 'warning',
      title: '导入配置备份',
      message: '导入会覆盖当前设置、消息池、日程、自动报告与被动源配置。',
      detail: '统计数据和角色素材不受影响。导入前会自动备份当前配置。',
      buttons: ['取消', '覆盖并导入'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    }
    const confirm = win
      ? await dialog.showMessageBox(win, message)
      : await dialog.showMessageBox(message)
    if (confirm.response !== 1) return { ok: false, canceled: true }

    const targets = targetPaths()
    const backupDir = join(
      app.getPath('userData'),
      `config-backup-${new Date().toISOString().replace(/[:.]/g, '-')}`
    )
    mkdirSync(backupDir, { recursive: true })
    const existedBefore = new Set<BackupEntryName>()
    const written: BackupEntryName[] = []

    try {
      for (const [rawName, text] of Object.entries(read.files)) {
        const name = rawName as BackupEntryName
        if (text === undefined) continue
        const target = targets[name]
        if (existsSync(target)) {
          copyFileSync(target, join(backupDir, name))
          existedBefore.add(name)
        }
        writeFileAtomic(target, text)
        written.push(name)
      }
      reloadRuntimes(deps)
      deps.notifyCenter('backup:imported', { files: written })
      deps.log('info', '[backup] imported', written.join(','), 'pre-import backup:', backupDir)
      return { ok: true, imported: written, backupDir }
    } catch (err) {
      // 回滚：已有文件从备份恢复，新增文件删除
      for (const name of written) {
        const target = targets[name]
        try {
          if (existedBefore.has(name)) copyFileSync(join(backupDir, name), target)
          else rmSync(target, { force: true })
        } catch {
          // 单个回滚失败不中断其余文件
        }
      }
      try {
        reloadRuntimes(deps)
      } catch {
        // 回滚后的 reload 失败只记录
      }
      deps.log('error', '[backup] import failed', err, 'pre-import backup:', backupDir)
      return { ok: false, error: '导入失败，已尝试回滚当前配置', backupDir }
    }
  })
}
