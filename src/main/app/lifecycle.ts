import { app } from 'electron'

/**
 * 单实例锁：取得锁时注册 second-instance 监听并返回 true；
 * 未取得（已有实例运行）返回 false，调用方应立即 app.quit()。
 */
export function acquireSingleInstanceLock(onSecondInstance: () => void): boolean {
  const gotLock = app.requestSingleInstanceLock()
  if (gotLock) {
    app.on('second-instance', () => {
      onSecondInstance()
    })
  }
  return gotLock
}

/**
 * 退出清理：will-quit 时按注册顺序执行。
 * 红线：注册顺序即原 will-quit 顺序——globalShortcut → 调度器 → 被动源（电池先停、hub 后停）
 * → 推送服务 → 统计 dispose（防抖定时器清除 + 同步落盘）必须最后。
 */
export function registerQuitCleanup(cleanups: Array<() => unknown>): void {
  app.on('will-quit', () => {
    for (const cleanup of cleanups) {
      void cleanup()
    }
  })
}
