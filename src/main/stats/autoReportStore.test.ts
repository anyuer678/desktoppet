import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AutoReportConfig } from '../../shared/ipc'
import {
  DEFAULT_AUTO_REPORT_CONFIG,
  loadAutoReports,
  saveAutoReports,
  validateAutoReportConfig
} from './autoReportStore'

describe('autoReportStore', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'auto-report-'))
    file = join(dir, 'autoReports.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('默认值：全部 disabled，周报周日 21:00，月报每月 1 号 21:00', () => {
    expect(DEFAULT_AUTO_REPORT_CONFIG).toEqual({
      weekly: { enabled: false, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' },
      monthly: { enabled: false, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' }
    })
  })

  it('文件不存在 → 返回默认值', () => {
    expect(loadAutoReports(join(dir, 'missing.json'))).toEqual(DEFAULT_AUTO_REPORT_CONFIG)
  })

  it('非法 JSON → 返回默认值', () => {
    writeFileSync(file, '{broken', 'utf-8')
    expect(loadAutoReports(file)).toEqual(DEFAULT_AUTO_REPORT_CONFIG)
  })

  it('字段缺失 → 逐项补默认', () => {
    writeFileSync(file, JSON.stringify({ weekly: { enabled: true } }), 'utf-8')
    const cfg = loadAutoReports(file)
    expect(cfg.weekly.enabled).toBe(true)
    expect(cfg.weekly.dayOfWeek).toBe(0)
    expect(cfg.monthly).toEqual(DEFAULT_AUTO_REPORT_CONFIG.monthly)
  })

  it('save → load round-trip', () => {
    const cfg: AutoReportConfig = {
      weekly: { enabled: true, dayOfWeek: 6, time: '08:30', dayOfMonth: 1 },
      monthly: { enabled: true, dayOfWeek: 0, dayOfMonth: 15, time: '09:00' }
    }
    saveAutoReports(file, cfg)
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual(cfg)
    expect(loadAutoReports(file)).toEqual(cfg)
  })

  describe('validateAutoReportConfig', () => {
    it('合法配置 → null', () => {
      expect(validateAutoReportConfig(DEFAULT_AUTO_REPORT_CONFIG)).toBeNull()
    })
    it('dayOfWeek 越界拒绝', () => {
      expect(
        validateAutoReportConfig({
          weekly: { enabled: true, dayOfWeek: 7, dayOfMonth: 1, time: '21:00' },
          monthly: DEFAULT_AUTO_REPORT_CONFIG.monthly
        })
      ).toBe('dayOfWeek 取值范围 0-6（周日=0）')
    })
    it('dayOfMonth 越界拒绝', () => {
      expect(
        validateAutoReportConfig({
          weekly: DEFAULT_AUTO_REPORT_CONFIG.weekly,
          monthly: { enabled: true, dayOfWeek: 0, dayOfMonth: 32, time: '21:00' }
        })
      ).toBe('dayOfMonth 取值范围 1-31')
    })
    it('time 非 HH:mm 拒绝', () => {
      expect(
        validateAutoReportConfig({
          weekly: DEFAULT_AUTO_REPORT_CONFIG.weekly,
          monthly: { enabled: true, dayOfWeek: 0, dayOfMonth: 1, time: '9:00' }
        })
      ).toBe('时间格式需为 HH:mm（24 小时制，含前导 0）')
    })
    it('enabled 非布尔拒绝', () => {
      expect(
        validateAutoReportConfig({
          weekly: { ...DEFAULT_AUTO_REPORT_CONFIG.weekly, enabled: 1 as unknown as boolean },
          monthly: DEFAULT_AUTO_REPORT_CONFIG.monthly
        })
      ).toBe('enabled 必须为布尔')
    })
  })
})
