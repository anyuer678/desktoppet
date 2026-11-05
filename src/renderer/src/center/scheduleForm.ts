import type { ScheduleInput } from '../../../shared/ipc'

export const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
export const ONCE_RE = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/

/** 切换类型时把 trigger 规范为目标类型：ISO ↔ HH:mm，避免把非法格式提交给主进程 */
export function triggerForType(
  trigger: string,
  type: ScheduleInput['type'],
  now: Date = new Date()
): string {
  const time = HHMM_RE.test(trigger)
    ? trigger
    : ONCE_RE.test(trigger)
      ? trigger.slice(11, 16)
      : '09:00'
  if (type !== 'once') return time
  if (ONCE_RE.test(trigger)) return trigger
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, Number(time.slice(0, 2)), Number(time.slice(3, 5)), 0, 0)
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return `${ymd}T${time}`
}

export function isTriggerValid(trigger: string, type: ScheduleInput['type']): boolean {
  return type === 'once' ? ONCE_RE.test(trigger) : HHMM_RE.test(trigger)
}
