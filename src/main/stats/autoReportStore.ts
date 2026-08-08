import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { AutoReportConfig, AutoReportRule } from '../../shared/ipc'
import { isValidHHmm } from '../schedule/store'

export const DEFAULT_AUTO_REPORT_CONFIG: AutoReportConfig = {
  weekly: { enabled: false, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' },
  monthly: { enabled: false, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' }
}

function normalizeRule(raw: unknown, fallback: AutoReportRule): AutoReportRule {
  const r = raw as Partial<AutoReportRule> | null | undefined
  const dayOfWeek = typeof r?.dayOfWeek === 'number' ? Math.round(r.dayOfWeek) : fallback.dayOfWeek
  const dayOfMonth = typeof r?.dayOfMonth === 'number' ? Math.round(r.dayOfMonth) : fallback.dayOfMonth
  return {
    enabled: typeof r?.enabled === 'boolean' ? r.enabled : fallback.enabled,
    // 范围钳制：损坏配置（越界值）永不命中，改为安全默认
    dayOfWeek: dayOfWeek >= 0 && dayOfWeek <= 6 ? dayOfWeek : fallback.dayOfWeek,
    dayOfMonth: dayOfMonth >= 1 && dayOfMonth <= 31 ? dayOfMonth : fallback.dayOfMonth,
    time: typeof r?.time === 'string' && isValidHHmm(r.time) ? r.time : fallback.time
  }
}

export function loadAutoReports(filePath: string): AutoReportConfig {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<AutoReportConfig>
    return {
      weekly: normalizeRule(raw.weekly, DEFAULT_AUTO_REPORT_CONFIG.weekly),
      monthly: normalizeRule(raw.monthly, DEFAULT_AUTO_REPORT_CONFIG.monthly)
    }
  } catch {
    return { ...DEFAULT_AUTO_REPORT_CONFIG }
  }
}

export function saveAutoReports(filePath: string, cfg: AutoReportConfig): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(cfg, null, 2), 'utf-8')
  } catch (err) {
    console.error('[autoReport] save failed:', err)
  }
}

export function validateAutoReportConfig(cfg: unknown): string | null {
  if (!cfg || typeof cfg !== 'object') return '自动报告配置为空'
  const c = cfg as Record<string, unknown>
  for (const key of ['weekly', 'monthly']) {
    const rule = c[key] as Record<string, unknown> | null | undefined
    if (!rule || typeof rule !== 'object') return `${key} 配置缺失`
    if (typeof rule.enabled !== 'boolean') return 'enabled 必须为布尔'
    if (
      typeof rule.dayOfWeek !== 'number' ||
      !Number.isInteger(rule.dayOfWeek) ||
      rule.dayOfWeek < 0 ||
      rule.dayOfWeek > 6
    ) {
      return 'dayOfWeek 取值范围 0-6（周日=0）'
    }
    if (
      typeof rule.dayOfMonth !== 'number' ||
      !Number.isInteger(rule.dayOfMonth) ||
      rule.dayOfMonth < 1 ||
      rule.dayOfMonth > 31
    ) {
      return 'dayOfMonth 取值范围 1-31'
    }
    if (typeof rule.time !== 'string' || !isValidHHmm(rule.time)) {
      return '时间格式需为 HH:mm（24 小时制，含前导 0）'
    }
  }
  return null
}
