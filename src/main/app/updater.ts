/**
 * updater.ts — 自动更新检查（electron-updater + GitHub Releases）
 *
 * 设计约束：
 * - 遵循工厂模式：createUpdater() 返回 { start, checkNow }
 * - 启动后 30 秒延迟检查（避免阻塞启动关键路径）
 * - 有更新时通过托盘气泡通知，用户确认后下载安装
 * - 禁止自动静默安装（必须用户确认）
 */

import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { type Logger } from '../logging/logger'

export interface UpdaterDeps {
  getMainWindow: () => BrowserWindow | null
  log: Logger
}

export interface Updater {
  /** 启动延迟检查（30 秒后） */
  start: () => void
  /** 手动触发检查 */
  checkNow: () => void
}

export function createUpdater(deps: UpdaterDeps): Updater {
  const { getMainWindow, log } = deps
  let checking = false

  // 配置 electron-updater
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = {
    info: (msg: string) => log('info', `[updater] ${msg}`),
    warn: (msg: string) => log('warn', `[updater] ${msg}`),
    error: (msg: string) => log('error', `[updater] ${msg}`),
    debug: () => {},
  }

  // 有可用更新 → 通知用户
  autoUpdater.on('update-available', (info) => {
    log('info', `[updater] update available: v${info.version}`)
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
      })
    }
  })

  // 已是最新
  autoUpdater.on('update-not-available', () => {
    log('info', '[updater] already up to date')
  })

  // 下载进度
  autoUpdater.on('download-progress', (progress) => {
    log('info', `[updater] download progress: ${Math.round(progress.percent)}%`)
  })

  // 下载完成 → 提示重启安装
  autoUpdater.on('update-downloaded', (info) => {
    log('info', `[updater] update downloaded: v${info.version}`)
    const win = getMainWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:update-downloaded', {
        version: info.version,
      })
    }
  })

  // 错误处理
  autoUpdater.on('error', (err) => {
    log('error', '[updater] error:', err.message)
    checking = false
  })

  function doCheck(): void {
    if (checking) return
    checking = true
    log('info', '[updater] checking for updates...')
    autoUpdater.checkForUpdates().catch((err) => {
      log('error', '[updater] check failed:', err.message)
    }).finally(() => {
      checking = false
    })
  }

  return {
    start: () => {
      // 启动后 30 秒延迟检查
      setTimeout(() => {
        doCheck()
      }, 30_000)
    },
    checkNow: doCheck,
  }
}
