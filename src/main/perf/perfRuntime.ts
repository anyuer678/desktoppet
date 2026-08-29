import { app } from 'electron'
import type { PerfReport, PerfSample } from '../../shared/ipc'
import { summarizePerf } from './perfReport'
import type { WindowHub } from '../window/windows'

export interface PerfRuntimeDeps {
  /** 渲染进程内存采样需读桌宠窗口（getter：closed 后为 null） */
  windows: Pick<WindowHub, 'pet'>
}

export interface PerfRuntime {
  /** perf:fps：记录渲染层上报的最新帧率 */
  onFps(fps: unknown): void
  /** perf:start：5 秒采样 CPU/内存/渲染内存/fps 并汇总 */
  sample(): Promise<PerfReport>
}

/** 性能采样运行时：latestFps 为闭包私有状态 */
export function createPerfRuntime(deps: PerfRuntimeDeps): PerfRuntime {
  let latestFps = 0

  function onFps(fps: unknown): void {
    if (typeof fps === 'number' && Number.isFinite(fps)) latestFps = fps
  }

  async function sample(): Promise<PerfReport> {
    const samples: PerfSample[] = []
    let last = process.cpuUsage()
    for (let i = 0; i < 5; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const now = process.cpuUsage()
      const cpuPercent = (now.user - last.user + now.system - last.system) / 1e4
      last = now
      let rendererMB = 0
      try {
        const pid = deps.windows.pet()?.webContents.getOSProcessId()
        const metric = app.getAppMetrics().find((m) => m.pid === pid)
        rendererMB = (metric?.memory.workingSetSize ?? 0) / 1024
      } catch {
        rendererMB = 0
      }
      samples.push({
        cpuPercent: Math.round(cpuPercent * 10) / 10,
        rssMB: Math.round((process.memoryUsage().rss / 1024 / 1024) * 10) / 10,
        rendererMB: Math.round(rendererMB * 10) / 10,
        fps: latestFps
      })
    }
    return summarizePerf(samples)
  }

  return { onFps, sample }
}
