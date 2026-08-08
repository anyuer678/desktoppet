import { mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { loadDailyRange, todayStr, totalSeconds } from './dailyStats'
import type { PeriodCompareResult, PeriodMetric } from '../../shared/ipc'

function metricOf(dir: string, start: string, end: string): PeriodMetric {
  let sec = 0
  let activeDays = 0
  let events = 0
  let interactions = 0
  for (const d of loadDailyRange(dir, start, end)) {
    if (!d.present) continue
    sec += totalSeconds(d.stats)
    activeDays += 1
    events += Object.values(d.stats.events).reduce((a, b) => a + b, 0)
    interactions += d.stats.interactions.click + d.stats.interactions.drag + d.stats.interactions.speak
  }
  return { totalSeconds: sec, activeDays, events, interactions }
}

export function comparePeriods(
  dir: string,
  _roleId: string,
  cStart: string,
  cEnd: string,
  pStart: string,
  pEnd: string
): PeriodCompareResult {
  const current = metricOf(dir, cStart, cEnd)
  const previous = metricOf(dir, pStart, pEnd)
  const changeTotalPercent =
    previous.totalSeconds > 0
      ? Math.round(((current.totalSeconds - previous.totalSeconds) / previous.totalSeconds) * 100)
      : null
  return { current, previous, changeTotalPercent }
}

export function buildReportMarkdown(input: {
  title: string
  generatedAt: string
  range: string
  previousRange: string
  compare: PeriodCompareResult
  topEvents: [string, number][]
}): string {
  const fmt = (s: number): string => {
    const h = Math.floor(s / 3600)
    const m = Math.round((s % 3600) / 60)
    return h > 0 ? `${h} 小时 ${m} 分` : `${m} 分钟`
  }
  const change = input.compare.changeTotalPercent
  const changeText = change === null ? '—' : `${change >= 0 ? '+' : ''}${change}%`
  const lines = [
    `# ${input.title}`,
    '',
    `生成时间：${input.generatedAt}`,
    '',
    '## 统计范围',
    `- 本期：${input.range}`,
    `- 上期：${input.previousRange}`,
    '',
    '## 对比',
    '| 指标 | 本期 | 上期 | 变化 |',
    '| --- | --- | --- | --- |',
    `| 陪伴时长 | ${fmt(input.compare.current.totalSeconds)} | ${fmt(input.compare.previous.totalSeconds)} | ${changeText} |`,
    `| 活跃天数 | ${input.compare.current.activeDays} | ${input.compare.previous.activeDays} | |`,
    `| 事件总数 | ${input.compare.current.events} | ${input.compare.previous.events} | |`,
    `| 互动次数 | ${input.compare.current.interactions} | ${input.compare.previous.interactions} | |`,
    '',
    '## 事件 Top'
  ]
  lines.push(
    ...(input.topEvents.length > 0
      ? input.topEvents.map(
          // 事件 type 可能来自推送/插件输入，转义换行与表格字符避免破坏 Markdown 结构
          ([k, v]) => `- ${k.replace(/[\r\n|]/g, ' ')}：${v} 次`
        )
      : ['- 无'])
  )
  return lines.join('\n')
}

function weekStartOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const dow = d.getDay()
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (dow === 0 ? 6 : dow - 1))
  return todayStr(monday)
}

function monthStartOf(dateStr: string): string {
  return dateStr.slice(0, 8) + '01'
}

/** 周报周期键：本周一（YYYY-MM-DD） */
export function weeklyReportKey(today: string): string {
  return weekStartOf(today)
}

/** 月报周期键：YYYY-MM */
export function monthlyReportKey(today: string): string {
  return today.slice(0, 7)
}

/** 上一自然月范围：[上月初, 上月末]，避免 30 天推算在月末与本期重叠 */
function prevMonthRange(today: string): { ps: string; pe: string } {
  const d = new Date(today + 'T00:00:00')
  const prevStart = new Date(d.getFullYear(), d.getMonth() - 1, 1)
  const prevEnd = new Date(d.getFullYear(), d.getMonth(), 0)
  return { ps: todayStr(prevStart), pe: todayStr(prevEnd) }
}

/** 生成周报/月报并落盘；返回文件路径（dir=统计数据目录，outputDir=报告落盘目录） */
export function generateReportFile(input: {
  dir: string
  outputDir: string
  mode: 'week' | 'month'
  today?: string
}): { path: string } {
  const today = input.today ?? todayStr()
  const cS = input.mode === 'week' ? weekStartOf(today) : monthStartOf(today)
  const weekAgo = new Date(new Date(today + 'T00:00:00').getTime() - 7 * 86400000)
  const weekAgoStr = todayStr(weekAgo)
  const ps = input.mode === 'week' ? weekStartOf(weekAgoStr) : prevMonthRange(today).ps
  const pe =
    input.mode === 'week'
      ? todayStr(new Date(new Date(weekStartOf(today) + 'T00:00:00').getTime() - 86400000))
      : prevMonthRange(today).pe
  const cmp = comparePeriods(input.dir, '', cS, today, ps, pe)
  const topEvents = (() => {
    const ev: Record<string, number> = {}
    for (const d of loadDailyRange(input.dir, cS, today)) {
      if (!d.present) continue
      for (const [k, v] of Object.entries(d.stats.events)) ev[k] = (ev[k] ?? 0) + v
    }
    return Object.entries(ev).sort((a, b) => b[1] - a[1]).slice(0, 5) as [string, number][]
  })()
  const md = buildReportMarkdown({
    title: input.mode === 'week' ? '陪伴周报' : '陪伴月报',
    generatedAt: new Date().toLocaleString('zh-CN'),
    range: `${cS} 至 ${today}`,
    previousRange: `${ps} 至 ${pe}`,
    compare: cmp,
    topEvents
  })
  const key = input.mode === 'week' ? weeklyReportKey(today) : monthlyReportKey(today)
  const file = join(input.outputDir, `陪伴${input.mode === 'week' ? '周报' : '月报'}-${key}-${today}.md`)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, md, 'utf-8')
  return { path: file }
}