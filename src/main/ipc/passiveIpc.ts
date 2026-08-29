import { ipcMain } from 'electron'
import type { PassiveSourcesConfig } from '../../shared/ipc'
import type { LogFn } from '../logging/logger'
import type { PassiveRuntime } from '../event/passiveRuntime'
import { validatePassiveConfig } from '../event/passiveStore'

export interface PassiveIpcDeps {
  passive: PassiveRuntime
  log: LogFn
}

/** passive:get / passive:set / passive:test */
export function registerPassiveIpc(deps: PassiveIpcDeps): void {
  ipcMain.handle('passive:get', () => ({ ok: true, config: deps.passive.config() }))
  ipcMain.handle('passive:set', (_e, cfg: unknown) => {
    const err = validatePassiveConfig(cfg)
    if (err) return { ok: false, error: err }
    deps.passive.setConfig(cfg as PassiveSourcesConfig)
    deps.passive.rebuild()
    deps.log('info', '[passive] config updated')
    return { ok: true }
  })
  ipcMain.handle('passive:test', (_e, sourceId: unknown) => deps.passive.test(sourceId))
}
