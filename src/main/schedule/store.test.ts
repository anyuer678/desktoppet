import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import type { ScheduleInput, ScheduleItem } from '../../shared/ipc'
import {
  applyUpdate,
  buildSchedule,
  isValidHHmm,
  isValidLocalISO,
  isValidScheduleItem,
  loadSchedules,
  saveSchedules,
  validateScheduleInput
} from './store'

function tempFile(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix))
  return join(dir, 'schedules.json')
}

const VALID_ONCE: ScheduleInput = {
  title: '会议',
  message: '产品周会',
  type: 'once',
  trigger: '2026-08-04T10:00',
  daysOfWeek: [],
  enabled: true
}

const VALID_DAILY: ScheduleInput = {
  title: '喝水',
  message: '该喝水啦',
  type: 'daily',
  trigger: '10:30',
  daysOfWeek: [],
  enabled: true
}

const VALID_WEEKLY: ScheduleInput = {
  title: '周报',
  message: '提交周报',
  type: 'weekly',
  trigger: '18:00',
  daysOfWeek: [5],
  enabled: true
}

describe('validateScheduleInput', () => {
  it('合法 once 输入通过', () => {
    expect(validateScheduleInput(VALID_ONCE)).toBeNull()
  })
  it('合法 daily 输入通过', () => {
    expect(validateScheduleInput(VALID_DAILY)).toBeNull()
  })
  it('合法 weekly 输入通过', () => {
    expect(validateScheduleInput(VALID_WEEKLY)).toBeNull()
  })
  it('标题为空拒绝', () => {
    expect(validateScheduleInput({ ...VALID_DAILY, title: '   ' })).not.toBeNull()
  })
  it('标题超长拒绝', () => {
    expect(validateScheduleInput({ ...VALID_DAILY, title: 'a'.repeat(61) })).not.toBeNull()
  })
  it('daily 类型 trigger 非法拒绝', () => {
    expect(validateScheduleInput({ ...VALID_DAILY, trigger: '25:00' })).not.toBeNull()
    expect(validateScheduleInput({ ...VALID_DAILY, trigger: '9:30' })).not.toBeNull()
  })
  it('once 类型 trigger 非法拒绝', () => {
    expect(validateScheduleInput({ ...VALID_ONCE, trigger: '2026-08-04 10:00' })).not.toBeNull()
  })
  it('weekly 类型未选星期拒绝', () => {
    expect(validateScheduleInput({ ...VALID_WEEKLY, daysOfWeek: [] })).not.toBeNull()
  })
  it('weekly 类型星期越界拒绝', () => {
    expect(validateScheduleInput({ ...VALID_WEEKLY, daysOfWeek: [7] })).not.toBeNull()
  })
})

describe('isValidHHmm / isValidLocalISO', () => {
  it('HH:mm 校验', () => {
    expect(isValidHHmm('00:00')).toBe(true)
    expect(isValidHHmm('23:59')).toBe(true)
    expect(isValidHHmm('09:05')).toBe(true)
    expect(isValidHHmm('24:00')).toBe(false)
    expect(isValidHHmm('9:05')).toBe(false)
    expect(isValidHHmm('10:60')).toBe(false)
  })
  it('本地 ISO 校验', () => {
    expect(isValidLocalISO('2026-08-04T10:00')).toBe(true)
    expect(isValidLocalISO('2026-08-04T10:00:30')).toBe(true)
    expect(isValidLocalISO('2026-8-4T10:00')).toBe(false)
    expect(isValidLocalISO('2026-08-04 10:00')).toBe(false)
  })
})

describe('buildSchedule / applyUpdate', () => {
  it('buildSchedule 分配 id/createdAt，weekly 去重排序', () => {
    const now = 1700000000000
    const item = buildSchedule({ ...VALID_WEEKLY, daysOfWeek: [5, 1, 5, 3] }, now)
    expect(item.id).toBeTruthy()
    expect(item.createdAt).toBe(now)
    expect(item.lastFiredAt).toBeNull()
    expect(item.daysOfWeek).toEqual([1, 3, 5])
  })
  it('applyUpdate 保留 id/createdAt/lastFiredAt', () => {
    const original: ScheduleItem = {
      id: 'abc',
      title: '旧标题',
      message: '',
      type: 'daily',
      trigger: '09:00',
      daysOfWeek: [],
      enabled: true,
      lastFiredAt: 12345,
      createdAt: 67890
    }
    const updated = applyUpdate(original, { ...VALID_WEEKLY, title: '新标题' })
    expect(updated.id).toBe('abc')
    expect(updated.createdAt).toBe(67890)
    expect(updated.lastFiredAt).toBe(12345)
    expect(updated.title).toBe('新标题')
    expect(updated.type).toBe('weekly')
    expect(updated.daysOfWeek).toEqual([5])
  })
})

describe('isValidScheduleItem', () => {
  it('合法条目通过', () => {
    expect(isValidScheduleItem(buildSchedule(VALID_DAILY))).toBe(true)
  })
  it('缺字段拒绝', () => {
    expect(isValidScheduleItem({ id: 'x' })).toBe(false)
  })
  it('daysOfWeek 类型错拒绝', () => {
    const bad = buildSchedule(VALID_DAILY) as unknown as Record<string, unknown>
    bad.daysOfWeek = 'notarray'
    expect(isValidScheduleItem(bad)).toBe(false)
  })
})

describe('loadSchedules / saveSchedules', () => {
  it('文件不存在返回空数组', () => {
    expect(loadSchedules(join(tmpdir(), 'nonexistent-' + Date.now(), 's.json'))).toEqual([])
  })
  it('存取往返一致（过滤非法项）', () => {
    const file = tempFile('dp-sched-io-')
    const items = [buildSchedule(VALID_DAILY), buildSchedule(VALID_WEEKLY)]
    saveSchedules(file, items)
    const loaded = loadSchedules(file)
    expect(loaded).toHaveLength(2)
    expect(loaded[0].title).toBe('喝水')
    expect(loaded[1].title).toBe('周报')
    rmSync(join(file, '..'), { recursive: true, force: true })
  })
  it('过滤损坏项保留合法项', () => {
    const file = tempFile('dp-sched-filter-')
    const valid = buildSchedule(VALID_DAILY)
    const broken = { id: 'broken', title: 123 } as unknown
    saveSchedules(file, [valid, broken as ScheduleItem])
    const loaded = loadSchedules(file)
    expect(loaded).toHaveLength(1)
    expect(loaded[0].id).toBe(valid.id)
    rmSync(join(file, '..'), { recursive: true, force: true })
  })
})
