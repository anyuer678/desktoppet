import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import {
  addStateTime,
  aggregateWeek,
  buildStatsCsv,
  clearStatsDir,
  computeStreak,
  countEvent,
  countInteraction,
  dailyStatsPath,
  deleteDailyStatsFile,
  emptyStats,
  iterateDates,
  loadDailyRange,
  loadDailyRangeFullYear,
  loadDailyStats,
  saveDailyStats,
  summarizeYear,
  todayStr,
  totalSeconds,
  validateRange
} from './dailyStats'

import { migrateStatsLayout, sanitizeRoleId } from './dailyStats'

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

describe('emptyStats', () => {
  it('创建空统计', () => {
    const s = emptyStats('2026-08-05')
    expect(s.date).toBe('2026-08-05')
    expect(s.secondsByState).toEqual({})
    expect(s.events).toEqual({})
    expect(s.interactions).toEqual({ click: 0, drag: 0, speak: 0 })
  })
})

describe('todayStr', () => {
  it('本地日期格式化 YYYY-MM-DD', () => {
    expect(todayStr(new Date(2026, 7, 5, 10, 0))).toBe('2026-08-05')
    expect(todayStr(new Date(2026, 0, 1))).toBe('2026-01-01')
  })
})

describe('addStateTime / countEvent / countInteraction', () => {
  it('累加状态时长与计数', () => {
    let s = emptyStats('d')
    s = addStateTime(s, 'idle', 4)
    s = addStateTime(s, 'idle', 4)
    s = addStateTime(s, 'warning', 8)
    s = countEvent(s, 'cpu_high')
    s = countEvent(s, 'cpu_high')
    s = countInteraction(s, 'click')
    expect(s.secondsByState).toEqual({ idle: 8, warning: 8 })
    expect(s.events.cpu_high).toBe(2)
    expect(s.interactions.click).toBe(1)
  })

  it('非正时长忽略', () => {
    let s = emptyStats('d')
    s = addStateTime(s, 'idle', 0)
    expect(s.secondsByState).toEqual({})
  })
})

describe('totalSeconds', () => {
  it('状态时长总和', () => {
    const s = { ...emptyStats('d'), secondsByState: { idle: 10, warning: 5 } }
    expect(totalSeconds(s)).toBe(15)
  })
})

describe('文件持久化', () => {
  it('保存后可完整回读（除 updatedAt 动态重置外全部一致）', () => {
    const dir = tempDir('dp-stats-')
    const stats = { ...emptyStats('2026-08-05'), secondsByState: { idle: 8 }, events: { cpu_high: 1 } }
    saveDailyStats(dir, stats)
    const loaded = loadDailyStats(dir, '2026-08-05')
    expect(loaded.date).toBe(stats.date)
    expect(loaded.secondsByState).toEqual(stats.secondsByState)
    expect(loaded.events).toEqual(stats.events)
    expect(loaded.interactions).toEqual(stats.interactions)
    rmSync(dir, { recursive: true, force: true })
  })

  it('缺失/损坏文件回退空统计', () => {
    const dir = tempDir('dp-stats-')
    expect(loadDailyStats(dir, '2026-08-05')).toEqual(emptyStats('2026-08-05'))
    writeFileSync(dailyStatsPath(dir, '2026-08-04'), '{broken')
    expect(loadDailyStats(dir, '2026-08-04').secondsByState).toEqual({})
    rmSync(dir, { recursive: true, force: true })
  })

  it('字段缺失时归一化（interact 逐字段）', () => {
    const dir = tempDir('dp-stats-')
    writeFileSync(dailyStatsPath(dir, 'd'), JSON.stringify({ date: 'd', interactions: { click: 3 } }))
    const s = loadDailyStats(dir, 'd')
    expect(s.interactions).toEqual({ click: 3, drag: 0, speak: 0 })
    expect(s.secondsByState).toEqual({})
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('aggregateWeek', () => {
  it('聚合最近 7 天，无记录日不计入', () => {
    const dir = tempDir('dp-stats-')
    saveDailyStats(dir, { ...emptyStats('2026-08-05'), secondsByState: { idle: 3600 }, events: { cpu_high: 2 } })
    saveDailyStats(dir, { ...emptyStats('2026-08-04'), secondsByState: { warning: 600 }, interactions: { click: 5, drag: 0, speak: 1 } })
    const week = aggregateWeek(dir, '2026-08-05')
    expect(week.days).toBe(2)
    expect(week.totalSeconds).toBe(4200)
    expect(week.events.cpu_high).toBe(2)
    expect(week.interactions).toEqual({ click: 5, drag: 0, speak: 1 })
    rmSync(dir, { recursive: true, force: true })
  })

  it('窗口外的日期不计入', () => {
    const dir = tempDir('dp-stats-')
    saveDailyStats(dir, emptyStats('2026-07-10'))
    const week = aggregateWeek(dir, '2026-08-05')
    expect(week.days).toBe(0)
    rmSync(dir, { recursive: true, force: true })
  })

  it('自然周边界：上周日不计入本周', () => {
    const dir = tempDir('dp-stats-')
    saveDailyStats(dir, { ...emptyStats('2026-08-02'), secondsByState: { idle: 500 } }) // 2026-08-02 是周日
    saveDailyStats(dir, { ...emptyStats('2026-08-03'), secondsByState: { idle: 3600 } }) // 周一
    const week = aggregateWeek(dir, '2026-08-05')
    expect(week.days).toBe(1)
    expect(week.totalSeconds).toBe(3600)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('iterateDates', () => {
  it('升序生成区间内全部日期（含跨月）', () => {
    expect(iterateDates('2026-07-30', '2026-08-02')).toEqual([
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02'
    ])
  })

  it('单日区间', () => {
    expect(iterateDates('2026-08-05', '2026-08-05')).toEqual(['2026-08-05'])
  })

  it('非法日期或倒序返回空数组', () => {
    expect(iterateDates('abc', '2026-08-05')).toEqual([])
    expect(iterateDates('2026-08-05', 'bad')).toEqual([])
    expect(iterateDates('2026-08-10', '2026-08-05')).toEqual([])
    expect(iterateDates('2026-02-31', '2026-08-05')).toEqual([])
    expect(iterateDates('2026-08-05', '2026-02-31')).toEqual([])
  })
})

describe('loadDailyRange', () => {
  it('区间逐日读取，缺文件标记 present=false', () => {
    const dir = tempDir('dp-stats-')
    saveDailyStats(dir, { ...emptyStats('2026-08-04'), secondsByState: { idle: 600 } })
    saveDailyStats(dir, { ...emptyStats('2026-08-06'), secondsByState: { focus: 1200 } })
    const days = loadDailyRange(dir, '2026-08-04', '2026-08-06')
    expect(days.map((d) => d.date)).toEqual(['2026-08-04', '2026-08-05', '2026-08-06'])
    expect(days.map((d) => d.present)).toEqual([true, false, true])
    expect(days[0].stats.secondsByState).toEqual({ idle: 600 })
    expect(days[1].stats.secondsByState).toEqual({})
    rmSync(dir, { recursive: true, force: true })
  })

  it('倒序区间返回空数组', () => {
    const dir = tempDir('dp-stats-')
    expect(loadDailyRange(dir, '2026-08-05', '2026-08-03')).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('hours 时段字段', () => {
  it('emptyStats 生成 24 长度零数组', () => {
    const s = emptyStats('2026-08-05')
    expect(s.hours).toHaveLength(24)
    expect(s.hours.every((v) => v === 0)).toBe(true)
  })

  it('addStateTime 按 now 的小时位累加', () => {
    let s = emptyStats('2026-08-05')
    // 2026-08-05 15:30（本地时间）→ hours[15]
    s = addStateTime(s, 'focus', 4, new Date(2026, 7, 5, 15, 30).getTime())
    s = addStateTime(s, 'idle', 2, new Date(2026, 7, 5, 15, 30).getTime())
    s = addStateTime(s, 'focus', 3, new Date(2026, 7, 5, 23, 0).getTime())
    expect(s.hours[15]).toBe(6)
    expect(s.hours[23]).toBe(3)
    expect(s.secondsByState).toEqual({ focus: 7, idle: 2 })
  })

  it('旧文件缺 hours 字段加载后补零', () => {
    const dir = tempDir('dp-stats-')
    writeFileSync(
      join(dir, '2026-08-01.json'),
      JSON.stringify({
        date: '2026-08-01',
        secondsByState: { focus: 60 },
        events: {},
        interactions: { click: 1, drag: 0, speak: 0 },
        updatedAt: 1
      })
    )
    const s = loadDailyStats(dir, '2026-08-01')
    expect(s.hours).toHaveLength(24)
    expect(s.hours.every((v) => v === 0)).toBe(true)
    expect(s.secondsByState.focus).toBe(60)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('computeStreak', () => {
  function write(dir: string, date: string, seconds: number): void {
    saveDailyStats(dir, { ...emptyStats(date), secondsByState: seconds > 0 ? { focus: seconds } : {} })
  }
  it('无任何记录为 0', () => {
    const dir = tempDir('dp-streak-')
    expect(computeStreak(dir, '2026-08-05')).toBe(0)
    rmSync(dir, { recursive: true, force: true })
  })
  it('今天有记录连续 3 天', () => {
    const dir = tempDir('dp-streak-')
    write(dir, '2026-08-05', 100)
    write(dir, '2026-08-04', 50)
    write(dir, '2026-08-03', 30)
    expect(computeStreak(dir, '2026-08-05')).toBe(3)
    rmSync(dir, { recursive: true, force: true })
  })
  it('今天无记录则从昨天起算', () => {
    const dir = tempDir('dp-streak-')
    write(dir, '2026-08-04', 50)
    write(dir, '2026-08-03', 30)
    expect(computeStreak(dir, '2026-08-05')).toBe(2)
    rmSync(dir, { recursive: true, force: true })
  })
  it('断档中断', () => {
    const dir = tempDir('dp-streak-')
    write(dir, '2026-08-05', 100)
    write(dir, '2026-08-04', 50)
    // 08-03 缺失 → 断
    expect(computeStreak(dir, '2026-08-05')).toBe(2)
    rmSync(dir, { recursive: true, force: true })
  })
  it('跨月连续', () => {
    const dir = tempDir('dp-streak-')
    write(dir, '2026-08-01', 10)
    write(dir, '2026-07-31', 20)
    write(dir, '2026-07-30', 30)
    expect(computeStreak(dir, '2026-08-01')).toBe(3)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('summarizeYear', () => {
  it('空年返回 null', () => {
    const dir = tempDir('dp-year-')
    expect(summarizeYear(dir, 2026)).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
  it('汇总全年（总秒/活跃天数/日均/最活跃日）', () => {
    const dir = tempDir('dp-year-')
    saveDailyStats(dir, { ...emptyStats('2026-01-01'), secondsByState: { focus: 3600 } })
    saveDailyStats(dir, { ...emptyStats('2026-02-03'), secondsByState: { idle: 7200 } })
    saveDailyStats(dir, { ...emptyStats('2026-12-31'), secondsByState: { sleep: 1800 } })
    const s = summarizeYear(dir, 2026)
    expect(s).toEqual({
      year: 2026,
      totalSeconds: 12600,
      activeDays: 3,
      avgSecondsPerActiveDay: 4200,
      bestDay: { date: '2026-02-03', seconds: 7200 }
    })
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('buildStatsCsv', () => {
  it('表头与数据行', () => {
    const s = buildStatsCsv([
      {
        date: '2026-08-05',
        stats: {
          ...emptyStats('2026-08-05'),
          secondsByState: { focus: 64.4 },
          events: { working: 2 },
          interactions: { click: 4, drag: 0, speak: 0 }
        }
      }
    ])
    const lines = s.split('\n')
    expect(lines[0]).toBe('日期,陪伴秒数,待机秒,专注秒,睡眠秒,开心秒,告警秒,事件总数,点击,拖动,说话')
    expect(lines[1]).toBe('2026-08-05,64,0,64,0,0,0,2,4,0,0')
  })
  it('空区间只有表头', () => {
    expect(buildStatsCsv([]).split('\n')).toEqual(['日期,陪伴秒数,待机秒,专注秒,睡眠秒,开心秒,告警秒,事件总数,点击,拖动,说话'])
  })
})

describe('deleteDailyStatsFile / clearStatsDir', () => {
  it('删除单日：存在返回 true，不存在返回 false', () => {
    const dir = tempDir('dp-del-')
    saveDailyStats(dir, emptyStats('2026-08-05'))
    expect(deleteDailyStatsFile(dir, '2026-08-05')).toBe(true)
    expect(deleteDailyStatsFile(dir, '2026-08-05')).toBe(false)
    rmSync(dir, { recursive: true, force: true })
  })
  it('清空目录返回删除数，非 json 文件保留', () => {
    const dir = tempDir('dp-clear-')
    saveDailyStats(dir, emptyStats('2026-08-05'))
    saveDailyStats(dir, emptyStats('2026-08-04'))
    writeFileSync(join(dir, 'readme.txt'), 'x')
    expect(clearStatsDir(dir)).toBe(2)
    expect(clearStatsDir(dir)).toBe(0)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('validateRange', () => {
  it('格式/倒序/超 90 天/未来日期依次拒绝', () => {
    expect(validateRange('2026-8-5', '2026-08-05').ok).toBe(false)
    expect(validateRange('2026-08-06', '2026-08-05').ok).toBe(false)
    expect(validateRange('2026-01-01', '2026-04-01').ok).toBe(false)
    expect(validateRange('2099-01-01', '2099-01-02').ok).toBe(false)
  })
  it('合法区间返回日期列表', () => {
    const v = validateRange('2026-08-01', '2026-08-03')
    expect(v.ok).toBe(true)
    expect(v.dates).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
  })
})

describe('sanitizeRoleId', () => {
  it('dailyStatsPath 拒绝穿越字符（损坏配置防御）', () => {
    const dir = tempDir('dp-path-')
    expect(dailyStatsPath(dir, '..')).toBe(join(dir, '__invalid__'))
    expect(dailyStatsPath(dir, '../../etc')).toBe(join(dir, '__invalid__'))
    expect(dailyStatsPath(dir, 'a\\b')).toBe(join(dir, '__invalid__'))
    expect(dailyStatsPath(dir, 'C:/evil')).toBe(join(dir, '__invalid__'))
    expect(dailyStatsPath(dir, '2026-08-04')).toBe(join(dir, '2026-08-04.json'))
    rmSync(dir, { recursive: true, force: true })
  })

  it('保留合法字符', () => {
    expect(sanitizeRoleId('rabbit-2')).toBe('rabbit-2')
    expect(sanitizeRoleId('cat')).toBe('cat')
  })
  it('非法字符替换为下划线', () => {
    expect(sanitizeRoleId('../evil')).toBe('___evil')
    expect(sanitizeRoleId('..')).toBe('__')
  })
  it('. 被替换，无法形成 .. 穿越段', () => {
    expect(sanitizeRoleId('..')).toBe('__')
    expect(sanitizeRoleId('a.b')).toBe('a_b')
  })
  it('空串兜底 role', () => {
    expect(sanitizeRoleId('')).toBe('role')
  })
})

describe('loadDailyRangeFullYear', () => {
  it('返回整年逐日（含首尾）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'yr-'))
    saveDailyStats(dir, { ...emptyStats('2026-08-05'), updatedAt: 1 })
    const days = loadDailyRangeFullYear(dir, 2026)
    expect(days.length).toBe(365)
    expect(days[0].date).toBe('2026-01-01')
    expect(days[364].date).toBe('2026-12-31')
    expect(days.find((d) => d.date === '2026-08-05')?.present).toBe(true)
  })
  it('闰年 366 天', () => {
    const dir = mkdtempSync(join(tmpdir(), 'yr-'))
    expect(loadDailyRangeFullYear(dir, 2024).length).toBe(366)
  })
})

describe('migrateStatsLayout', () => {
  it('平铺文件移入默认角色子目录', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'))
    saveDailyStats(dir, { ...emptyStats('2026-08-01'), updatedAt: 1 })
    saveDailyStats(dir, { ...emptyStats('2026-08-02'), updatedAt: 2 })
    const moved = migrateStatsLayout(dir, 'rabbit')
    expect(moved).toBe(2)
    expect(existsSync(join(dir, 'rabbit', '2026-08-01.json'))).toBe(true)
    expect(existsSync(join(dir, '2026-08-01.json'))).toBe(false)
  })
  it('目标已存在时保留更新者', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'))
    mkdirSync(join(dir, 'rabbit'), { recursive: true })
    // 目标更新：old
    saveDailyStats(join(dir, 'rabbit'), { ...emptyStats('2026-08-01'), updatedAt: 500 })
    // 源更新：new
    saveDailyStats(dir, { ...emptyStats('2026-08-01'), updatedAt: 1000 })
    migrateStatsLayout(dir, 'rabbit')
    const kept = JSON.parse(readFileSync(join(dir, 'rabbit', '2026-08-01.json'), 'utf-8'))
    expect(kept.updatedAt).toBe(1000)
  })
  it('幂等：二次调用返回 0', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mig-'))
    saveDailyStats(dir, { ...emptyStats('2026-08-01'), updatedAt: 1 })
    migrateStatsLayout(dir, 'rabbit')
    expect(migrateStatsLayout(dir, 'rabbit')).toBe(0)
  })
})