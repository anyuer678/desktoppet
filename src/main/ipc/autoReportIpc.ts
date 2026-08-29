import { ipcMain } from 'electron'
import type { AutoReportConfig } from '../../shared/ipc'
import type { AutoReportRuntime } from '../stats/autoReportRuntime'
import { validateAutoReportConfig } from '../stats/autoReportStore'

export interface AutoReportIpcDeps {
  autoReports: AutoReportRuntime
}

/** autoReport:get / autoReport:set */
export function registerAutoReportIpc(deps: AutoReportIpcDeps): void {
  ipcMain.handle('autoReport:get', () => ({ ok: true, config: deps.autoReports.config() }))
  ipcMain.handle('autoReport:set', (_e, cfg: unknown) => {
    const err = validateAutoReportConfig(cfg)
    if (err) return { ok: false, error: err }
    deps.autoReports.setConfig(cfg as AutoReportConfig)
    return { ok: true }
  })
}
