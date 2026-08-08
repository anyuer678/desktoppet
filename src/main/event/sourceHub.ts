import type { PetEvent } from './eventCenter'

export interface SourceContext {
  /** 注入单个事件到事件中心（驱动状态 + diff 触发气泡/统计） */
  inject(ev: PetEvent): void
  /** 按前缀整批替换：从事件数组移除 source.startsWith(prefix) 的旧事件并追加新事件 */
  replaceBySource(prefix: string, events: PetEvent[]): void
  /** 直接广播气泡通道（如 push:fired 模式） */
  notify(channel: string, payload?: unknown): void
  /** 计入当日统计（countEvent） */
  count(type: string): void
  log(level: 'info' | 'warn' | 'error', msg: string, ...args: unknown[]): void
}

export interface EventSource {
  id: string
  /** poll=由 hub 定时轮询拉取（源实现 poll()）；watch=源自主监听（start 里注册回调） */
  kind: 'poll' | 'watch'
  enabled(): boolean
  start(ctx: SourceContext): void
  stop(): void
  /** kind='poll' 时 hub 每个 tick 调用 */
  poll?(now: number): void
}

export interface SourceHub {
  tick(now: number): void
  start(): void
  stop(): void
}

export function createSourceHub(ctx: SourceContext, sources: EventSource[]): SourceHub {
  const started = new Set<EventSource>()

  function start(): void {
    for (const source of sources) {
      if (started.has(source)) continue
      if (!source.enabled()) continue
      source.start(ctx)
      started.add(source)
    }
  }

  function stop(): void {
    for (const source of sources) {
      if (!started.has(source)) continue
      source.stop()
      started.delete(source)
    }
  }

  function tick(now: number): void {
    for (const source of sources) {
      if (source.kind !== 'poll') continue
      if (!source.enabled()) continue
      try {
        source.poll?.(now)
      } catch (err) {
        ctx.log('error', `source ${source.id} poll failed`, err)
      }
    }
  }

  return { tick, start, stop }
}