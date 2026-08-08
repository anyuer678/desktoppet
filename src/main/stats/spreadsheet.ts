import ExcelJS from 'exceljs'
import type { DailyStats, RangeDay } from '../../shared/ipc'
import { totalSeconds } from './dailyStats'

export function buildWorkbookRows(days: { date: string; present: boolean; stats: DailyStats }[]) {
  const daily = days.map((d) => ({
    日期: d.date,
    陪伴秒: Math.round(totalSeconds(d.stats)),
    待机秒: d.stats.secondsByState.idle ?? 0,
    专注秒: d.stats.secondsByState.focus ?? 0,
    睡眠秒: d.stats.secondsByState.sleep ?? 0,
    开心秒: d.stats.secondsByState.happy ?? 0,
    告警秒: d.stats.secondsByState.warning ?? 0,
    事件数: Object.values(d.stats.events).reduce((a, b) => a + b, 0),
    点击: d.stats.interactions.click,
    拖动: d.stats.interactions.drag,
    说话: d.stats.interactions.speak
  }))
  const total = days.reduce((a, d) => a + totalSeconds(d.stats), 0)
  const active = days.filter((d) => d.present).length
  const summary = [{ 总陪伴秒: Math.round(total), 活跃天数: active, 日均秒: active > 0 ? Math.round(total / active) : 0 }]
  return { daily, summary }
}

export async function buildWorkbook(days: RangeDay[]): Promise<Buffer> {
  const { daily, summary } = buildWorkbookRows(days)
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('每日明细')
  ws.columns = Object.keys(daily[0] ?? {}).map((k) => ({ header: k, key: k, width: 14 }))
  const header = ws.getRow(1)
  header.font = { bold: true }
  for (const row of daily) ws.addRow(row)

  const s = wb.addWorksheet('汇总')
  s.columns = Object.keys(summary[0] ?? {}).map((k) => ({ header: k, key: k, width: 18 }))
  const sHeader = s.getRow(1)
  sHeader.font = { bold: true }
  for (const row of summary) s.addRow(row)

  return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>
}