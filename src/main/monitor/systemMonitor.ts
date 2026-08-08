import { cpus, freemem, totalmem } from 'os'
import { powerMonitor } from 'electron'
import type { PetEvent } from '../event/eventCenter'
import { isBatteryLow, type BatterySample } from './battery'

export interface CpuTimes {
  user: number
  nice: number
  sys: number
  idle: number
  irq: number
}

export interface SystemSample {
  cpuPercent: number
  freePercent: number
  idleSeconds: number
  /** 最近一次电池采样（无电池/未采样时为 null） */
  battery?: BatterySample | null
}

export interface MonitorConfig {
  cpuHighPercent: number
  memoryLowFreePercent: number
  idleThresholdSeconds: number
  batteryLowPercent: number
}

export const DEFAULT_MONITOR_CONFIG: MonitorConfig = {
  cpuHighPercent: 70,
  memoryLowFreePercent: 15,
  idleThresholdSeconds: 60,
  batteryLowPercent: 20
}

/** 两帧 CPU times 差值换算占用率（0-100），prev 为空时返回 0 */
export function cpuUsagePercent(prev: CpuTimes[] | null, cur: CpuTimes[]): number {
  if (!prev || prev.length !== cur.length) return 0
  let totalDelta = 0
  let idleDelta = 0
  for (let i = 0; i < cur.length; i++) {
    const p = prev[i]
    const c = cur[i]
    const tDelta =
      c.user - p.user + c.nice - p.nice + c.sys - p.sys + c.idle - p.idle + c.irq - p.irq
    const iDelta = c.idle - p.idle
    totalDelta += tDelta
    idleDelta += iDelta
  }
  if (totalDelta <= 0) return 0
  return Math.round(((totalDelta - idleDelta) / totalDelta) * 100)
}

export function memoryFreePercent(free: number, total: number): number {
  if (total <= 0) return 100
  return Math.round((free / total) * 100)
}

const MONITOR_SOURCES = new Set(['monitor:cpu', 'monitor:mem', 'monitor:user', 'monitor:battery'])

/** 每轮采样：清除旧的 monitor 事件，按当前指标重新生成 */
export function nextSystemEvents(
  current: PetEvent[],
  sample: SystemSample,
  now: number,
  cfg: MonitorConfig = DEFAULT_MONITOR_CONFIG
): PetEvent[] {
  const others = current.filter((e) => !MONITOR_SOURCES.has(e.source))
  const next: PetEvent[] = [...others]
  if (sample.cpuPercent >= cfg.cpuHighPercent) {
    next.push({ source: 'monitor:cpu', type: 'cpu_high', priority: 9, durationMs: 8000, occurredAt: now })
  }
  if (sample.freePercent <= cfg.memoryLowFreePercent) {
    next.push({ source: 'monitor:mem', type: 'memory_warning', priority: 9, durationMs: 8000, occurredAt: now })
  }
  if (sample.idleSeconds >= cfg.idleThresholdSeconds) {
    next.push({ source: 'monitor:user', type: 'user_idle', priority: 6, durationMs: 12_000, occurredAt: now })
  }
  if (isBatteryLow(sample.battery ?? null, cfg.batteryLowPercent)) {
    next.push({ source: 'monitor:battery', type: 'battery_low', priority: 9, durationMs: 8000, occurredAt: now })
  }
  return next
}

/** 创建采样器：持有上一帧 CPU times，每次调用输出当前指标 */
export function createSampler(config: MonitorConfig = DEFAULT_MONITOR_CONFIG): () => SystemSample {
  let prevCpu: CpuTimes[] | null = null
  return () => {
    const cur: CpuTimes[] = cpus().map((c) => c.times)
    const cpuPercent = cpuUsagePercent(prevCpu, cur)
    prevCpu = cur
    const freePercent = memoryFreePercent(freemem(), totalmem())
    const idleSeconds = powerMonitor.getSystemIdleTime()
    return { cpuPercent, freePercent, idleSeconds }
  }
}