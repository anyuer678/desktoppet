import type { PassiveForegroundConfig } from '../../../shared/ipc'
import type { EventSource, SourceContext } from '../sourceHub'

export interface ForegroundApp {
  process: string
  title: string
}

export const FOREGROUND_PS_SCRIPT =
  "Add-Type @'using System;using System.Runtime.InteropServices;public class Fg { [DllImport(\"user32.dll\")] public static extern IntPtr GetForegroundWindow(); [DllImport(\"user32.dll\")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid); }'@; $h=[Fg]::GetForegroundWindow(); [uint32]$p=0; [Fg]::GetWindowThreadProcessId($h,[ref]$p)|Out-Null; $proc=Get-Process -Id $p -ErrorAction SilentlyContinue; if($proc){$proc.ProcessName + \"|\" + $proc.MainWindowTitle}else{\"|\"}"

export async function getForegroundApp(
  runner: (cmd: string) => Promise<string>
): Promise<ForegroundApp | null> {
  let out: string
  try {
    out = (await runner(FOREGROUND_PS_SCRIPT)).trim()
  } catch {
    return null
  }
  if (out === '') return null
  const parts = out.split('|')
  return {
    process: (parts[0] ?? '').trim(),
    // 标题本身可能含 |，用 join 保留完整内容
    title: parts.slice(1).join('|').trim()
  }
}

export function foregroundMapping(
  app: ForegroundApp,
  mappings: { process: string; state: 'focus' | 'ignore' }[]
): { process: string; state: 'focus' | 'ignore' } | null {
  return (
    mappings.find((m) => m.process.toLowerCase() === app.process.toLowerCase()) ??
    null
  )
}

export function createForegroundSource(
  getCfg: () => PassiveForegroundConfig,
  runner: (cmd: string) => Promise<string>
): EventSource {
  let ctx: SourceContext | null = null
  let lastPollAt = 0
  let lastProcess = ''
  let inflight = false

  function poll(now: number): void {
    if (ctx == null) return
    if (now - lastPollAt < getCfg().pollMs) return
    lastPollAt = now
    if (inflight) return
    inflight = true
    const c = ctx
    void getForegroundApp(runner)
      .then((app) => {
        if (app && app.process !== lastProcess) {
          lastProcess = app.process
          c.count('foreground')
          const m = foregroundMapping(app, getCfg().mappings)
          if (m && m.state === 'focus') {
            c.inject({
              source: 'foreground',
              type: 'working',
              priority: 4,
              durationMs: getCfg().pollMs * 2,
              occurredAt: Date.now()
            })
            c.notify('push:fired', { kind: 'passive', reaction: 'foreground', placeholder: app.process })
          }
        }
      })
      .catch((err) => c.log('warn', '[foreground] 获取前台应用失败', err))
      .finally(() => {
        inflight = false
      })
  }

  return {
    id: 'foreground',
    kind: 'poll',
    enabled: () => getCfg().enabled,
    start: (c: SourceContext) => {
      ctx = c
    },
    stop: () => {},
    poll
  }
}
