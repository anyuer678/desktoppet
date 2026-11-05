import type { AutoReportConfig } from '../../shared/ipc'
import { shouldFireMonthly, shouldFireWeekly } from './autoReport'

export interface AutoReportTickerOptions {
  getConfig: () => AutoReportConfig
  now?: () => Date
  onWeeklyFire: () => void
  onMonthlyFire: () => void
  /** 每分钟（去重后）回调：用于休眠唤醒/错过时刻的周期补发判定 */
  onTick?: (now: Date) => void
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
    // 补发检查放在精确命中之后：刚生成的本周期报告会被 reportExists 立即看到
    options.onTick?.(now)
    lastFiredMinute = minuteKey
  }

  return {
    tick,
    start: () => {
      if (timer) return
      // 立即评估一次：休眠/挂起唤醒后 setInterval 可能跨过目标分钟
      tick()
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
