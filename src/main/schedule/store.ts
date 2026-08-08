import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { ScheduleInput, ScheduleItem } from '../../shared/ipc'

/** 生成稳定唯一 id（毫秒时间戳 + 随机后缀，base36） */
export function genScheduleId(now: number = Date.now()): string {
  return now.toString(36) + '-' + Math.floor(Math.random() * 0x1000000).toString(36).padStart(5, '0')
}

/** 校验 HH:mm 24 小时制（前导 0 必填） */
export function isValidHHmm(s: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(s)
}

/** 校验本地 ISO 字符串 YYYY-MM-DDTHH:mm[:ss] */
export function isValidLocalISO(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(s)
}

/** 校验日程输入；返回 null 表示通过，否则返回错误消息 */
export function validateScheduleInput(input: ScheduleInput): string | null {
  if (!input || typeof input !== 'object') return '日程数据为空'
  if (typeof input.title !== 'string' || input.title.trim() === '') return '标题不能为空'
  if (input.title.length > 60) return '标题过长（≤60 字符）'
  if (typeof input.message !== 'string' || input.message.length > 200) return '备注过长（≤200 字符）'
  if (input.type !== 'once' && input.type !== 'daily' && input.type !== 'weekly') {
    return '类型必须为 once / daily / weekly'
  }
  if (input.type === 'once') {
    if (!isValidLocalISO(input.trigger)) return '单次日程触发时间需为 YYYY-MM-DDTHH:mm'
  } else {
    if (!isValidHHmm(input.trigger)) return '时间格式需为 HH:mm（24 小时制，含前导 0）'
  }
  if (input.type === 'weekly') {
    if (!Array.isArray(input.daysOfWeek)) return 'weekly 类型需指定 daysOfWeek'
    if (input.daysOfWeek.length === 0) return 'weekly 类型至少选择一个星期'
    if (!input.daysOfWeek.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
      return 'daysOfWeek 取值范围 0-6（周日=0）'
    }
  }
  if (typeof input.enabled !== 'boolean') return 'enabled 必须为布尔'
  return null
}

/** 默认空列表 */
export const DEFAULT_SCHEDULES: ScheduleItem[] = []

/** 从文件加载日程列表；文件不存在或非法时返回空列表 */
export function loadSchedules(filePath: string): ScheduleItem[] {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8'))
    if (!Array.isArray(raw)) return []
    return raw.filter(isValidScheduleItem)
  } catch {
    return []
  }
}

/** 持久化日程列表（同步写入，量小足够；目录不存在自动创建） */
export function saveSchedules(filePath: string, items: ScheduleItem[]): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(items, null, 2), 'utf-8')
  } catch (err) {
    console.error('[schedule] save failed:', err)
  }
}

/** 运行时校验单条日程完整性（字段类型/取值范围） */
export function isValidScheduleItem(raw: unknown): raw is ScheduleItem {
  if (!raw || typeof raw !== 'object') return false
  const s = raw as Record<string, unknown>
  if (typeof s.id !== 'string' || s.id === '') return false
  if (typeof s.title !== 'string' || s.title === '') return false
  if (typeof s.message !== 'string') return false
  if (s.type !== 'once' && s.type !== 'daily' && s.type !== 'weekly') return false
  if (typeof s.trigger !== 'string') return false
  if (!Array.isArray(s.daysOfWeek) || !s.daysOfWeek.every((d) => typeof d === 'number' && d >= 0 && d <= 6)) {
    return false
  }
  if (typeof s.enabled !== 'boolean') return false
  if (s.lastFiredAt !== null && typeof s.lastFiredAt !== 'number') return false
  if (typeof s.createdAt !== 'number') return false
  return true
}

/** 由输入构建新日程（id/createdAt 由主进程分配） */
export function buildSchedule(input: ScheduleInput, now: number = Date.now()): ScheduleItem {
  return {
    id: genScheduleId(now),
    title: input.title.trim(),
    message: input.message.trim(),
    type: input.type,
    trigger: input.trigger,
    daysOfWeek: input.type === 'weekly' ? dedupDays(input.daysOfWeek) : [],
    enabled: input.enabled,
    lastFiredAt: null,
    createdAt: now
  }
}

/** 应用更新（保留 id/createdAt/lastFiredAt） */
export function applyUpdate(item: ScheduleItem, input: ScheduleInput): ScheduleItem {
  return {
    ...item,
    title: input.title.trim(),
    message: input.message.trim(),
    type: input.type,
    trigger: input.trigger,
    daysOfWeek: input.type === 'weekly' ? dedupDays(input.daysOfWeek) : [],
    enabled: input.enabled
  }
}

/** daysOfWeek 去重排序 */
function dedupDays(days: number[]): number[] {
  return Array.from(new Set(days)).sort((a, b) => a - b)
}
