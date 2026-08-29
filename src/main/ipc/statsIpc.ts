import { app, dialog, ipcMain, shell } from 'electron'
import { join } from 'path'
import { writeFileSync } from 'fs'
import { reportOutputDir } from '../app/paths'
import type { LogFn } from '../logging/logger'
import type { StatsRuntime } from '../stats/statsRuntime'
import {
  aggregateWeek,
  buildStatsCsv,
  computeStreak,
  emptyStats,
  loadDailyRange,
  loadDailyRangeFullYear,
  loadDailyStats,
  summarizeYear,
  todayStr,
  validateRange
} from '../stats/dailyStats'
import { computeAchievements } from '../stats/achievements'
import { comparePeriods, generateReportFile } from '../stats/report'
import { buildWorkbook } from '../stats/spreadsheet'

export interface StatsIpcDeps {
  stats: StatsRuntime
  log: LogFn
}

/** stats:report/range/year/heatmap/achievements/trend/report:generate/openReportDir/exportExcel/exportCsv/deleteDay/clearAll */
export function registerStatsIpc(deps: StatsIpcDeps): void {
  const { stats, log } = deps
  ipcMain.handle('stats:report', () => {
    // 先做跨日/切角色检查，再将今日内存统计落盘，保证「本周」聚合与磁盘一致（含进行中的时长）
    stats.ensureDate(Date.now())
    stats.flush()
    return {
      today: stats.today() ?? emptyStats(''),
      week: aggregateWeek(stats.dir(), stats.date()),
      streak: computeStreak(stats.dir(), stats.date())
    }
  })
  ipcMain.handle('stats:range', (_e, start: unknown, end: unknown) => {
    if (typeof start !== 'string' || typeof end !== 'string') {
      return { ok: false, error: '日期格式应为 YYYY-MM-DD' }
    }
    const v = validateRange(start, end)
    if (!v.ok) return v
    return { ok: true, days: loadDailyRange(stats.dir(), start, end) }
  })
  ipcMain.handle('stats:year', (_e, year: unknown) => {
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return { ok: false, error: '年份应在 2000~2100 之间' }
    }
    return { ok: true, summary: summarizeYear(stats.dir(), year) }
  })
  ipcMain.handle('stats:heatmap', (_e, year: unknown) => {
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return { ok: false, error: '年份应在 2000~2100 之间' }
    }
    return { ok: true, days: loadDailyRangeFullYear(stats.dir(), year) }
  })
  ipcMain.handle('stats:achievements', () => ({
    ok: true,
    achievements: computeAchievements(stats.dir(), stats.roleId(), todayStr())
  }))
  ipcMain.handle('stats:trend', (_e, cStart: unknown, cEnd: unknown, pStart: unknown, pEnd: unknown) => {
    const four = [cStart, cEnd, pStart, pEnd]
    if (!four.every((x) => typeof x === 'string')) return { ok: false, error: '日期格式应为 YYYY-MM-DD' }
    const [cs, ce, ps, pe] = four as string[]
    const v1 = validateRange(cs, ce)
    const v2 = validateRange(ps, pe)
    if (!v1.ok) return v1
    if (!v2.ok) return v2
    const compare = comparePeriods(stats.dir(), stats.roleId(), cs, ce, ps, pe)
    return { ok: true, compare }
  })
  ipcMain.handle('stats:report:generate', async (_e, mode: unknown) => {
    const m = mode === 'month' ? 'month' : mode === 'week' ? 'week' : null
    if (!m) return { ok: false, error: 'mode 应为 week 或 month' }
    try {
      const { path } = generateReportFile({
        dir: stats.dir(),
        outputDir: join(app.getPath('documents'), 'DesktopPet', '报告'),
        mode: m
      })
      log('info', '[stats:report:generate] saved', path)
      return { ok: true, path }
    } catch (err) {
      log('error', '[stats:report:generate]', err)
      return { ok: false, error: '报告写入失败' }
    }
  })
  ipcMain.handle('stats:openReportDir', async () => {
    const dir = reportOutputDir()
    try {
      const err = await shell.openPath(dir)
      if (err) return { ok: false, error: `打开失败：${err}` }
      return { ok: true }
    } catch (err) {
      log('error', '[stats:openReportDir]', err)
      return { ok: false, error: '打开失败' }
    }
  })
  ipcMain.handle('stats:exportExcel', async (_e, year: unknown) => {
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return { ok: false, error: '年份应在 2000~2100 之间' }
    }
    const days = loadDailyRangeFullYear(stats.dir(), year)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出 Excel 统计',
      defaultPath: join(app.getPath('documents'), `陪伴统计-${stats.roleId()}-${year}.xlsx`),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      const buf = await buildWorkbook(days)
      writeFileSync(filePath, buf)
      log('info', '[stats:exportExcel] saved', filePath)
      return { ok: true, path: filePath }
    } catch (err) {
      log('error', '[stats:exportExcel]', err)
      return { ok: false, error: '导出 Excel 失败' }
    }
  })
  ipcMain.handle('stats:exportCsv', async (_e, start: unknown, end: unknown) => {
    if (typeof start !== 'string' || typeof end !== 'string') {
      return { ok: false, error: '日期格式应为 YYYY-MM-DD' }
    }
    const v = validateRange(start, end)
    if (!v.ok || !v.dates) return v
    const rows = v.dates.map((d) => ({ date: d, stats: loadDailyStats(stats.dir(), d) }))
    const csv = buildStatsCsv(rows)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出陪伴统计',
      defaultPath: join(app.getPath('documents'), `陪伴统计-${start}-至-${end}.csv`),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      writeFileSync(filePath, '\ufeff' + csv, 'utf-8')
      log('info', '[stats:exportCsv] saved', filePath)
      return { ok: true, path: filePath }
    } catch (err) {
      log('error', '[stats:exportCsv] write failed:', err)
      return { ok: false, error: '导出文件写入失败' }
    }
  })
  ipcMain.handle('stats:deleteDay', (_e, date: unknown) => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, error: '日期格式应为 YYYY-MM-DD' }
    }
    stats.deleteDay(date)
    return { ok: true }
  })
  ipcMain.handle('stats:clearAll', () => {
    const deleted = stats.clearAll()
    log('info', '[stats:clearAll] deleted', deleted, 'files')
    return { ok: true, deleted }
  })
}
