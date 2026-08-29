import { ipcMain } from 'electron'
import type { PerfRuntime } from '../perf/perfRuntime'

export interface PerfIpcDeps {
  perf: PerfRuntime
}

/** perf:fps / perf:start */
export function registerPerfIpc(deps: PerfIpcDeps): void {
  ipcMain.on('perf:fps', (_e, fps: unknown) => {
    deps.perf.onFps(fps)
  })
  ipcMain.handle('perf:start', () => deps.perf.sample())
}
