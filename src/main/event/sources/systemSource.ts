import { DEFAULT_MONITOR_CONFIG, nextSystemEvents, type MonitorConfig, type SystemSample } from '../../monitor/systemMonitor'
import type { EventSource, SourceContext } from '../sourceHub'
import type { PetEvent } from '../eventCenter'

export function createSystemSource(
  sampleFn: () => SystemSample,
  cfg: MonitorConfig = DEFAULT_MONITOR_CONFIG
): EventSource {
  let ctx: SourceContext | null = null
  return {
    id: 'system',
    kind: 'poll',
    enabled: () => true,
    start: (c) => { ctx = c },
    stop: () => {},
    poll(now: number) {
      if (!ctx) return
      ctx.replaceBySource('monitor:', nextSystemEvents([], sampleFn(), now, cfg))
    }
  }
}