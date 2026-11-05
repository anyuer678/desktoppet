import type { UpdaterStatus } from '../../shared/ipc'

/** electron-updater 事件 → 纯状态迁移（便于单测；副作用由 updater.ts 承担） */
export type UpdaterEvent =
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'not-available' }
  | { type: 'progress'; percent: number }
  | { type: 'downloaded'; version: string }
  | { type: 'error'; message: string }

export function initialUpdaterStatus(supported: boolean): UpdaterStatus {
  return supported ? { phase: 'idle' } : { phase: 'unsupported' }
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, Math.round(value)))
}

/**
 * 状态迁移规则：
 * - unsupported 不因事件改变（开发模式不会真正下载/安装）
 * - 下载进度只在 available/downloading/downloaded 阶段有意义
 * - 出错保留已发现版本，便于界面提示「vX 更新失败，重试」
 */
export function applyUpdaterEvent(current: UpdaterStatus, event: UpdaterEvent): UpdaterStatus {
  if (current.phase === 'unsupported') return current

  switch (event.type) {
    case 'checking':
      return { phase: 'checking' }
    case 'available':
      return { phase: 'available', version: event.version }
    case 'not-available':
      return { phase: 'idle' }
    case 'progress':
      if (current.phase !== 'available' && current.phase !== 'downloading') return current
      return { phase: 'downloading', version: current.version, percent: clampPercent(event.percent) }
    case 'downloaded':
      return { phase: 'downloaded', version: event.version }
    case 'error':
      return { phase: 'error', version: current.version, message: event.message }
    default:
      return current
  }
}
