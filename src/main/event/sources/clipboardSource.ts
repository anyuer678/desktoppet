import { clipboardShouldNotify } from '../clipboard'
import { classifyClipboard, extractDomain, isSensitive } from '../sourceClassifier'
import type { PassiveClipboardConfig } from '../../../shared/ipc'
import type { EventSource, SourceContext } from '../sourceHub'

const DEDUP_WINDOW_MS = 8000

export function createClipboardSource(
  read: () => { text: string; hasImage: boolean },
  cfg: () => PassiveClipboardConfig
): EventSource {
  let ctx: SourceContext | null = null
  let lastText = ''
  let lastPollAt = 0
  const seen: Map<string, number> = new Map()

  function notif(reaction: string, placeholder = ''): void {
    if (ctx == null) return
    ctx.notify('push:fired', { kind: 'passive', reaction, placeholder })
  }

  function poll(now: number): void {
    if (ctx == null) return
    if (now - lastPollAt < cfg().pollMs) return
    lastPollAt = now
    const { text, hasImage } = read()
    if (text === '' && !hasImage) return
    if (text !== '' && text === lastText && !hasImage) return
    if (text !== '' && clipboardShouldNotify(text, cfg()).ok !== true) {
      lastText = text
      return
    }
    const nowRef = Date.now()
    const fingerprint = text === '' ? 'img' : text
    // 短时窗口内同一内容不重复
    const lastSeen = seen.get(fingerprint) ?? 0
    if (nowRef - lastSeen < DEDUP_WINDOW_MS) {
      lastText = text
      return
    }
    seen.set(fingerprint, nowRef)
    if (seen.size > 64) {
      const first = seen.keys().next().value
      if (first !== undefined) seen.delete(first)
    }
    ctx.count('clipboard')
    ctx.inject({ source: 'clipboard', type: 'clipboard', priority: 5, durationMs: 8000, occurredAt: Date.now() })
    if (hasImage) {
      notif('clipImage')
      lastText = text
      return
    }
    if (isSensitive(text)) {
      notif('clipSensitive')
      lastText = text
      return
    }
    const feature = classifyClipboard(text)
    const placeholder = feature === 'clipLink' ? extractDomain(text) ?? '' : ''
    notif(feature, placeholder)
    lastText = text
  }

  return {
    id: 'clipboard',
    kind: 'poll',
    enabled: () => cfg().enabled,
    start: (c: SourceContext) => { ctx = c },
    stop: () => {},
    poll
  }
}