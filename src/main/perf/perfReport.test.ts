import { describe, expect, it } from 'vitest'
import { summarizePerf } from './perfReport'

describe('summarizePerf', () => {
  it('空采样返回全零', () => {
    expect(summarizePerf([])).toEqual({
      samples: [],
      avgCpu: 0,
      maxCpu: 0,
      avgRssMB: 0,
      avgRendererMB: 0,
      avgFps: 0
    })
  })

  it('单样本等于自身', () => {
    const sample = { cpuPercent: 12.5, rssMB: 100, rendererMB: 60, fps: 60 }
    expect(summarizePerf([sample])).toEqual({
      samples: [sample],
      avgCpu: 12.5,
      maxCpu: 12.5,
      avgRssMB: 100,
      avgRendererMB: 60,
      avgFps: 60
    })
  })

  it('多样本求均值与峰值', () => {
    const samples: Parameters<typeof summarizePerf>[0] = [
      { cpuPercent: 10, rssMB: 100, rendererMB: 60, fps: 58 },
      { cpuPercent: 20, rssMB: 120, rendererMB: 64, fps: 60 },
      { cpuPercent: 30, rssMB: 110, rendererMB: 62, fps: 59 }
    ]
    const report = summarizePerf(samples)
    expect(report.avgCpu).toBeCloseTo(20)
    expect(report.maxCpu).toBe(30)
    expect(report.avgRssMB).toBeCloseTo(110)
    expect(report.avgRendererMB).toBeCloseTo(62)
    expect(report.avgFps).toBeCloseTo(59)
    expect(report.samples).toHaveLength(3)
  })
})
