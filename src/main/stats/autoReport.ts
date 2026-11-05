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

/** 月报有效触发日：配置 31 号时，2 月等短月份回退到月末最后一天 */
export function effectiveMonthlyDay(dayOfMonth: number, now: Date): number {
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  return Math.min(dayOfMonth, lastDay)
}

export function shouldFireMonthly(cfg: AutoReportConfig, now: Date): boolean {
  const m = cfg.monthly
  if (!m.enabled) return false
  if (now.getDate() !== effectiveMonthlyDay(m.dayOfMonth, now)) return false
  return hhmmOf(now) === m.time
}

/** 周一=0..周日=6（与 JS getDay 的周日=0 不同，用于判断本周是否已过触发日） */
function mondayIndex(day: number): number {
  return (day + 6) % 7
}

/** 错过补发判定（周报）：本周期未生成 && 已到/已过本周触发日与时点（周期键=本周一） */
export function shouldCatchUpWeekly(
  cfg: AutoReportConfig,
  now: Date,
  reportExists: (key: string) => boolean
): boolean {
  const w = cfg.weekly
  if (!w.enabled) return false
  const todayIdx = mondayIndex(now.getDay())
  const targetIdx = mondayIndex(w.dayOfWeek)
  if (todayIdx < targetIdx) return false
  if (todayIdx === targetIdx && !isPastTriggerTime(w.time, now)) return false
  return !reportExists(weeklyReportKey(todayStr(now)))
}

/** 错过补发判定（月报）：本周期未生成 && 已到/已过本月触发日与时点（周期键=YYYY-MM） */
export function shouldCatchUpMonthly(
  cfg: AutoReportConfig,
  now: Date,
  reportExists: (key: string) => boolean
): boolean {
  const m = cfg.monthly
  if (!m.enabled) return false
  const triggerDay = effectiveMonthlyDay(m.dayOfMonth, now)
  if (now.getDate() < triggerDay) return false
  if (now.getDate() === triggerDay && !isPastTriggerTime(m.time, now)) return false
  return !reportExists(monthlyReportKey(todayStr(now)))
}
