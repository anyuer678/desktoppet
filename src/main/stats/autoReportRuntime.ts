import { app, Notification } from 'electron'
import { readdirSync } from 'fs'
import { join } from 'path'
import { reportOutputDir } from '../app/paths'
import type { LogFn } from '../logging/logger'
import type { AutoReportConfig, AutoReportFired } from '../../shared/ipc'
import { generateReportFile } from './report'
import { shouldCatchUpMonthly, shouldCatchUpWeekly } from './autoReport'
import { createAutoReportTicker } from './autoReportTicker'
import { DEFAULT_AUTO_REPORT_CONFIG, loadAutoReports, saveAutoReports } from './autoReportStore'

export interface AutoReportRuntimeDeps {
  /** 当前角色统计目录（getter：随角色切换变化，报告聚合目录必须现读） */
  getStatsDir(): string
  notifyPet(channel: string, payload?: unknown): void
  notifyCenter(channel: string, payload?: unknown): void
  log: LogFn
}

export interface AutoReportRuntime {
  /** 加载配置 → 启动时静默补发 → 开启分钟级 ticker */
  start(): void
  config(): AutoReportConfig
  setConfig(cfg: AutoReportConfig): void
}

/**
 * 自动报告运行时：配置/配置文件路径/ticker 均为闭包私有状态。
 * 生成报告时经 getStatsDir() 现读统计目录，保证角色切换后写入正确目录。
 */
export function createAutoReportRuntime(deps: AutoReportRuntimeDeps): AutoReportRuntime {
  let autoReportCfg: AutoReportConfig = { ...DEFAULT_AUTO_REPORT_CONFIG }
  let autoReportFile = ''
  let autoReportTicker: ReturnType<typeof createAutoReportTicker> | null = null

  /** 生成自动报告：silent=true 仅落盘；否则气泡 + 系统通知 */
  function generateAutoReport(mode: 'week' | 'month', silent: boolean): void {
    try {
      const { path } = generateReportFile({
        dir: deps.getStatsDir(),
        outputDir: reportOutputDir(),
        mode
      })
      deps.log('info', `[autoReport:${mode}] saved`, path)
      if (silent) return
      const title = mode === 'week' ? '陪伴周报已生成' : '陪伴月报已生成'
      const fired: AutoReportFired = { type: mode, title, body: path }
      deps.notifyPet('autoReport:fired', fired)
      deps.notifyCenter('autoReport:fired', fired)
      try {
        new Notification({ title, body: path }).show()
      } catch (err) {
        deps.log('error', '[autoReport] notification failed', err)
      }
    } catch (err) {
      deps.log('error', `[autoReport:${mode}]`, err)
    }
  }

  function start(): void {
    autoReportFile = join(app.getPath('userData'), 'autoReports.json')
    autoReportCfg = loadAutoReports(autoReportFile)
    const outDir = reportOutputDir()
    const reportExists = (key: string, prefix: string): boolean => {
      try {
        return readdirSync(outDir).some((f) => f.startsWith(prefix) && f.includes(key))
      } catch {
        return false
      }
    }
    const now = new Date()
    if (shouldCatchUpWeekly(autoReportCfg, now, (k) => reportExists(k, '陪伴周报-'))) {
      generateAutoReport('week', true)
    }
    if (shouldCatchUpMonthly(autoReportCfg, now, (k) => reportExists(k, '陪伴月报-'))) {
      generateAutoReport('month', true)
    }
    autoReportTicker = createAutoReportTicker({
      getConfig: () => autoReportCfg,
      onWeeklyFire: () => generateAutoReport('week', false),
      onMonthlyFire: () => generateAutoReport('month', false)
    })
    autoReportTicker.start()
    deps.log('info', '[autoReport] started', JSON.stringify(autoReportCfg))
  }

  function setConfig(cfg: AutoReportConfig): void {
    autoReportCfg = cfg
    saveAutoReports(autoReportFile, autoReportCfg)
  }

  return { start, config: () => autoReportCfg, setConfig }
}
