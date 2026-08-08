import type { AutoReportConfig } from '../../shared/ipc'
import { todayStr } from './dailyStats'
import { monthlyReportKey, weeklyReportKey } from './report'

/** 取 HH:mm（补前导 0） */
export function hhmmOf(now: Date): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

/** now 的时分是否 >= time（字符串比较，HH:mm 定宽） */
export function isPastTriggerTime(time: string, now: Date): boolean {
  return hhmmOf(now) >= time
}

export function shouldFireWeekly(cfg: AutoReportConfig, now: Date): boolean {
  const w = cfg.weekly
  if (!w.enabled) return false
  if (now.getDay() !== w.dayOfWeek) return false
  return hhmmOf(now) === w.time
}

export function shouldFireMonthly(cfg: AutoReportConfig, now: Date): boolean {
  const m = cfg.monthly
  if (!m.enabled) return false
  if (now.getDate() !== m.dayOfMonth) return false
  return hhmmOf(now) === m.time
}

/** 错过补发判定（周报）：本周期未生成 && 今日已过触发时间（周期键=本周一） */
export function shouldCatchUpWeekly(
  cfg: AutoReportConfig,
  now: Date,
  reportExists: (key: string) => boolean
): boolean {
  const w = cfg.weekly
  if (!w.enabled) return false
  if (!isPastTriggerTime(w.time, now)) return false
  return !reportExists(weeklyReportKey(todayStr(now)))
}

/** 错过补发判定（月报）：本周期未生成 && 今日已过触发时间（周期键=YYYY-MM） */
export function shouldCatchUpMonthly(
  cfg: AutoReportConfig,
  now: Date,
  reportExists: (key: string) => boolean
): boolean {
  const m = cfg.monthly
  if (!m.enabled) return false
  if (!isPastTriggerTime(m.time, now)) return false
  return !reportExists(monthlyReportKey(todayStr(now)))
}
