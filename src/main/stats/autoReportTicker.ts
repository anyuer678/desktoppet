import type { AutoReportConfig } from '../../shared/ipc'
import { shouldFireMonthly, shouldFireWeekly } from './autoReport'

export interface AutoReportTickerOptions {
  getConfig: () => AutoReportConfig
  now?: () => Date
  onWeeklyFire: () => void
  onMonthlyFire: () => void
}

/** 分钟级自动报告调度：tick 判定命中即回调（同一分钟内防重复，仿 scheduler） */
export function createAutoReportTicker(options: AutoReportTickerOptions): {
  tick(now?: Date): void
  start(): void
  stop(): void
} {
  const nowFn = options.now ?? (() => new Date())
  let lastFiredMinute = -1
  let timer: NodeJS.Timeout | null = null

  const tick = (now: Date = nowFn()): void => {
    const minuteKey = now.getTime() - (now.getTime() % 60_000)
    if (minuteKey === lastFiredMinute) return
    const cfg = options.getConfig()
    // 周/月可同时命中（如 15 日恰逢周五且时间相同），两个独立判定；lastFiredMinute 仍保证同分钟去重
    if (shouldFireWeekly(cfg, now)) {
      lastFiredMinute = minuteKey
      options.onWeeklyFire()
    }
    if (shouldFireMonthly(cfg, now)) {
      lastFiredMinute = minuteKey
      options.onMonthlyFire()
    }
  }

  return {
    tick,
    start: () => {
      if (timer) return
      timer = setInterval(() => tick(), 60_000)
    },
    stop: () => {
      if (timer) {
        clearInterval(timer)
        timer = null
      }
    }
  }
}
