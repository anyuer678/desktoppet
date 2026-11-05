/**
 * updater.ts — 自动更新（electron-updater + GitHub Releases）
 *
 * 完整链路：检查 → 发现新版本 → 用户确认下载 → 下载完成 → 用户确认重启安装。
 * - autoDownload=false：必须由用户显式触发下载
 * - 控制中心未打开时通过系统通知兜底，避免更新提示静默丢失
 * - 开发模式（app.isPackaged=false）返回 unsupported，不做无意义的网络检查
 */

import { app, Notification } from 'electron'
import { autoUpdater } from 'electron-updater'
import type { UpdaterStatus } from '../../shared/ipc'
import type { LogFn } from '../logging/logger'
import { applyUpdaterEvent, initialUpdaterStatus, type UpdaterEvent } from './updaterState'

export interface UpdaterDeps {
  notifyPet(channel: string, payload?: unknown): void
  notifyCenter(channel: string, payload?: unknown): void
  log: LogFn
}

export interface Updater {
  /** 启动延迟检查（30 秒后） */
  start(): void
  /** 立即检查 */
  checkNow(): void
  /** 下载已发现的更新 */
  download(): Promise<{ ok: boolean; error?: string }>
  /** 退出并安装已下载的更新 */
  install(): { ok: boolean; error?: string }
  /** 当前状态快照 */
  status(): UpdaterStatus
}

export function createUpdater(deps: UpdaterDeps): Updater {
  const { log, notifyPet, notifyCenter } = deps
  const supported = app.isPackaged
  let checking = false
  let status: UpdaterStatus = initialUpdaterStatus(supported)

  function broadcast(next: UpdaterStatus): void {
    status = next
    notifyCenter('updater:status', next)
    notifyPet('updater:status', next)
  }

  function transition(event: UpdaterEvent): void {
    broadcast(applyUpdaterEvent(status, event))
  }

  function notifyUser(title: string, body: string): void {
    try {
      if (Notification.isSupported()) new Notification({ title, body }).show()
    } catch (err) {
      log('warn', '[updater] notification failed:', err)
    }
  }

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.logger = {
    info: (msg: string) => log('info', `[updater] ${msg}`),
    warn: (msg: string) => log('warn', `[updater] ${msg}`),
    error: (msg: string) => log('error', `[updater] ${msg}`),
    debug: () => {}
  }

  autoUpdater.on('update-available', (info) => {
    log('info', `[updater] update available: v${info.version}`)
    transition({ type: 'available', version: info.version })
    // 兼容旧渲染层订阅（v1.2 既有通道）
    notifyCenter('updater:update-available', { version: info.version, releaseDate: info.releaseDate })
    notifyUser('DesktopPet 新版本可用', `v${info.version} 已可下载，打开控制中心完成更新`)
  })

  autoUpdater.on('update-not-available', () => {
    log('info', '[updater] already up to date')
    transition({ type: 'not-available' })
  })

  autoUpdater.on('download-progress', (progress) => {
    transition({ type: 'progress', percent: progress.percent })
  })

  autoUpdater.on('update-downloaded', (info) => {
    log('info', `[updater] update downloaded: v${info.version}`)
    transition({ type: 'downloaded', version: info.version })
    notifyCenter('updater:update-downloaded', { version: info.version })
    notifyUser('DesktopPet 更新已就绪', `v${info.version} 已下载，重启后安装`)
  })

  autoUpdater.on('error', (err) => {
    log('error', '[updater] error:', err.message)
    transition({ type: 'error', message: err.message })
    checking = false
  })

  function doCheck(): void {
    if (!supported) {
      log('info', '[updater] skipped: dev build')
      return
    }
    if (checking) return
    checking = true
    transition({ type: 'checking' })
    autoUpdater
      .checkForUpdates()
      .catch((err: Error) => {
        log('error', '[updater] check failed:', err.message)
        transition({ type: 'error', message: err.message })
      })
      .finally(() => {
        checking = false
      })
  }

  async function download(): Promise<{ ok: boolean; error?: string }> {
    if (!supported) return { ok: false, error: '开发模式不支持自动更新' }
    if (status.phase !== 'available') return { ok: false, error: '当前没有可下载的更新' }
    try {
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      transition({ type: 'error', message })
      return { ok: false, error: message }
    }
  }

  function install(): { ok: boolean; error?: string } {
    if (!supported) return { ok: false, error: '开发模式不支持自动更新' }
    if (status.phase !== 'downloaded') return { ok: false, error: '更新尚未下载完成' }
    // isSilent=false（显示安装界面），isForceRunAfter=true（安装后自动启动）
    autoUpdater.quitAndInstall(false, true)
    return { ok: true }
  }

  return {
    start: () => {
      if (!supported) {
        log('info', '[updater] unsupported in dev build')
        return
      }
      setTimeout(() => doCheck(), 30_000)
    },
    checkNow: doCheck,
    download,
    install,
    status: () => ({ ...status })
  }
}
