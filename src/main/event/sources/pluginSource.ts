import { pluginEventsToPetEvents } from '../../plugin/pluginHost'
import type { PluginManifest } from '../../../shared/ipc'
import type { EventSource, SourceContext } from '../sourceHub'

export function createPluginSource(getPlugins: () => PluginManifest[]): EventSource {
  let ctx: SourceContext | null = null
  return {
    id: 'plugin',
    kind: 'poll',
    enabled: () => true,
    start: (c) => { ctx = c },
    stop: () => {},
    poll(now: number) {
      if (!ctx) return
      ctx.replaceBySource('plugin:', pluginEventsToPetEvents(getPlugins(), now))
    }
  }
}