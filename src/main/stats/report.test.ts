import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { comparePeriods, buildReportMarkdown, generateReportFile, weeklyReportKey, monthlyReportKey } from './report'
import { emptyStats, saveDailyStats } from './dailyStats'

function mk(): string {
  return mkdtempSync(join(tmpdir(), 'rp-'))
}

const writeDay = (dir: string, date: string, sec: number): void =>
  saveDailyStats(dir, { ...emptyStats(date), secondsByState: { idle: sec }, updatedAt: 1 })

describe('comparePeriods', () => {
  it('两期均有时：changeTotalPercent=(cur-prev)/prev', () => {
    const dir = mk()
    writeDay(dir, '2026-08-04', 3600) // prev: 2026-07-29..08-04
    writeDay(dir, '2026-08-06', 7200) // cur: 08-05..08-06
    const r = comparePeriods(dir, 'rabbit', '2026-08-05', '2026-08-06', '2026-07-29', '2026-08-04')
    expect(r.current.totalSeconds).toBe(7200)
    expect(r.previous.totalSeconds).toBe(3600)
    expect(r.changeTotalPercent).toBeCloseTo(100)
  })
  it('上期为零 → changeTotalPercent null', () => {
    const dir = mk()
    writeDay(dir, '2026-08-06', 3600)
    const r = comparePeriods(dir, 'rabbit', '2026-08-05', '2026-08-06', '2026-07-29', '2026-08-04')
    expect(r.changeTotalPercent).toBeNull()
  })
  it('无任何记录 → 双方零', () => {
    const dir = mk()
    const r = comparePeriods(dir, 'rabbit', '2026-08-01', '2026-08-07', '2026-07-01', '2026-07-07')
    expect(r.previous.totalSeconds).toBe(0)
    expect(r.current.totalSeconds).toBe(0)
  })
})

describe('buildReportMarkdown', () => {
  it('包含标题与比较行', () => {
    const md = buildReportMarkdown({
      title: '陪伴周报',
      generatedAt: '2026-08-06 09:00',
      range: '2026-08-06..2026-08-12',
      previousRange: '2026-07-30..2026-08-05',
      compare: {
        current: { totalSeconds: 7200, activeDays: 2, events: 3, interactions: 4 },
        previous: { totalSeconds: 3600, activeDays: 1, events: 1, interactions: 2 },
        changeTotalPercent: 100
      },
      topEvents: [['cpu_high', 3]]
    })
    expect(md).toContain('# 陪伴周报')
    expect(md).toContain('100%')
    expect(md).toContain('2 小时')
  })
})

describe('weeklyReportKey / monthlyReportKey', () => {
  it('周三 → 本周一', () => {
    expect(weeklyReportKey('2026-08-06')).toBe('2026-08-03')
  })
  it('周日 → 本周一（上周一）', () => {
    expect(weeklyReportKey('2026-08-09')).toBe('2026-08-03')
  })
  it('月键为 YYYY-MM', () => {
    expect(monthlyReportKey('2026-08-06')).toBe('2026-08')
  })
})

describe('generateReportFile', () => {
  const mk = (): { data: string; out: string } => ({
    data: mkdtempSync(join(tmpdir(), 'rp-data-')),
    out: mkdtempSync(join(tmpdir(), 'rp-out-'))
  })

  it('周报：文件名含本周一周期键与今天，内容含标题与区间', () => {
    const { data, out } = mk()
    try {
      writeDay(data, '2026-08-06', 7200)
      const r = generateReportFile({ dir: data, outputDir: out, mode: 'week', today: '2026-08-06' })
      expect(r.path).toBe(join(out, '陪伴周报-2026-08-03-2026-08-06.md'))
      const md = readFileSync(r.path, 'utf-8')
      expect(md).toContain('# 陪伴周报')
      expect(md).toContain('2026-08-03 至 2026-08-06')
    } finally {
      rmSync(data, { recursive: true, force: true })
      rmSync(out, { recursive: true, force: true })
    }
  })

  it('月报：文件名含 YYYY-MM 周期键', () => {
    const { data, out } = mk()
    try {
      writeDay(data, '2026-08-06', 7200)
      const r = generateReportFile({ dir: data, outputDir: out, mode: 'month', today: '2026-08-06' })
      expect(r.path).toBe(join(out, '陪伴月报-2026-08-2026-08-06.md'))
      const md = readFileSync(r.path, 'utf-8')
      expect(md).toContain('# 陪伴月报')
      expect(md).toContain('2026-08-01 至 2026-08-06')
      expect(md).toContain('上期：2026-07-01 至 2026-07-31')
    } finally {
      rmSync(data, { recursive: true, force: true })
      rmSync(out, { recursive: true, force: true })
    }
  })

  it('月报：月末（31 日）上期为上一自然月，不与本期重叠', () => {
    const { data, out } = mk()
    try {
      // 本期 2026-07-01..07-31；上期必须为 2026-06-01..06-30，而非 30 天前的 07-01
      writeDay(data, '2026-07-01', 3600)
      writeDay(data, '2026-07-31', 3600)
      const r = generateReportFile({ dir: data, outputDir: out, mode: 'month', today: '2026-07-31' })
      const md = readFileSync(r.path, 'utf-8')
      expect(md).toContain('本期：2026-07-01 至 2026-07-31')
      expect(md).toContain('上期：2026-06-01 至 2026-06-30')
    } finally {
      rmSync(data, { recursive: true, force: true })
      rmSync(out, { recursive: true, force: true })
    }
  })

  it('月报：跨年 1 月 31 日上期为上年 12 月', () => {
    const { data, out } = mk()
    try {
      const r = generateReportFile({ dir: data, outputDir: out, mode: 'month', today: '2026-01-31' })
      const md = readFileSync(r.path, 'utf-8')
      expect(md).toContain('上期：2025-12-01 至 2025-12-31')
    } finally {
      rmSync(data, { recursive: true, force: true })
      rmSync(out, { recursive: true, force: true })
    }
  })

  it('默认 today 为当天（无参数）', () => {
    const { data, out } = mk()
    try {
      const r = generateReportFile({ dir: data, outputDir: out, mode: 'week' })
      expect(r.path.endsWith('.md')).toBe(true)
      expect(r.path).toContain('陪伴周报-')
    } finally {
      rmSync(data, { recursive: true, force: true })
      rmSync(out, { recursive: true, force: true })
    }
  })
})