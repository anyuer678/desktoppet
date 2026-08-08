import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { buildWorkbook, buildWorkbookRows } from './spreadsheet'
import type { DailyStats } from '../../shared/ipc'

const d = (sec: number): DailyStats => ({
  date: '2026-08-06',
  secondsByState: { idle: sec },
  hours: new Array(24).fill(0),
  events: { cpu_high: 1 },
  interactions: { click: 1, drag: 0, speak: 0 },
  updatedAt: 1
})

const days = [
  { date: '2026-08-05', present: true, stats: d(3600) },
  { date: '2026-08-06', present: true, stats: d(7200) }
]

describe('buildWorkbookRows', () => {
  it('daily 行含日期与总秒；summary 含总秒/活跃天/日均', () => {
    const { daily, summary } = buildWorkbookRows(days)
    expect(daily).toHaveLength(2)
    expect(daily[0]).toMatchObject({ 日期: '2026-08-05', 陪伴秒: 3600 })
    expect(summary[0]).toMatchObject({ 总陪伴秒: 10800, 活跃天数: 2, 日均秒: 5400 })
  })
})

describe('buildWorkbook', () => {
  it('产出可被 exceljs 读回的两 Sheet xlsx', async () => {
    const buf = await buildWorkbook(days as never)
    expect(buf.length).toBeGreaterThan(0)
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(buf as unknown as never)
    expect(wb.worksheets.map((w) => w.name)).toEqual(['每日明细', '汇总'])
    const ws = wb.getWorksheet('每日明细')
    if (!ws) throw new Error('每日明细 sheet 不存在')
    expect(ws.getRow(2).getCell(1).value).toBe('2026-08-05')
    expect(ws.getRow(2).getCell(2).value).toBe(3600)
  })
})