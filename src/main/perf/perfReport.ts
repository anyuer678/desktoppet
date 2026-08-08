import type { PerfReport, PerfSample } from '../../shared/ipc'

export function summarizePerf(samples: PerfSample[]): PerfReport {
  const n = samples.length
  if (n === 0) {
    return { samples: [], avgCpu: 0, maxCpu: 0, avgRssMB: 0, avgRendererMB: 0, avgFps: 0 }
  }
  const sum = (pick: (s: PerfSample) => number): number =>
    samples.reduce((acc, s) => acc + pick(s), 0)
  return {
    samples,
    avgCpu: sum((s) => s.cpuPercent) / n,
    maxCpu: Math.max(...samples.map((s) => s.cpuPercent)),
    avgRssMB: sum((s) => s.rssMB) / n,
    avgRendererMB: sum((s) => s.rendererMB) / n,
    avgFps: sum((s) => s.fps) / n
  }
}