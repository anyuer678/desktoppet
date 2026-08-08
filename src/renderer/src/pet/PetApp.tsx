import { useEffect, useMemo, useRef, useState } from 'react'
import type { CharacterDetail, CharacterSummary } from '../../../shared/ipc'
import { PetAnimator } from './PetAnimator'
import { activeOverlays, combineOverlays } from './overlay'
import { contentRectFrom, pointInRect, shouldIgnorePointer, type AlphaMap, type Rect } from './clickThrough'
import { DEFAULT_SPEECH, eventSpeech, greetingKey, greetingSpeech, pickText, reactionReply, welcomeSpeech, type Speech, type SpeechPools } from '../../../shared/speech'
import type { InteractionAction } from '../../../shared/ipc'

const CLICK_TIMEOUT = 260
const DRAG_THRESHOLD = 4
const HIT_MAP_SIZE = 64
const ALPHA_THRESHOLD = 32
const SPEECH_DURATION = 4000
const WELCOME_DELAY = 1200

export function PetApp(): React.JSX.Element {
  const [charId, setCharId] = useState('rabbit')
  const [size, setSize] = useState(256)
  const [opacity, setOpacity] = useState(1)
  const [detail, setDetail] = useState<CharacterDetail | null>(null)
  const [paused, setPaused] = useState(false)
  const [state, setState] = useState('idle')
  const [now, setNow] = useState(() => new Date())

  const overlayFactors = useMemo(
    () => combineOverlays(activeOverlays(detail?.overlays, now)),
    [detail, now]
  )

  const pointerRef = useRef({ down: false, moved: false, startX: 0, startY: 0, lastSX: 0, lastSY: 0 })
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const spriteRef = useRef<HTMLImageElement | null>(null)
  const ignoredRef = useRef(false)
  const hitRef = useRef<{ map: AlphaMap; content: Rect } | null>(null)
  const lastClientRef = useRef({ x: 0, y: 0 })
  const evaluateRef = useRef<() => void>(() => undefined)
  const [speech, setSpeech] = useState<Speech | null>(null)
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSpeechText = useRef<string | null>(null)
  const lastGreetingRef = useRef<ReturnType<typeof greetingKey> | null>(null)
  const welcomedRef = useRef(false)
  const poolsRef = useRef<SpeechPools>(DEFAULT_SPEECH)

  const showSpeech = (s: Speech): void => {
    lastSpeechText.current = s.text
    setSpeech(s)
    if (speechTimer.current) clearTimeout(speechTimer.current)
    speechTimer.current = setTimeout(() => setSpeech(null), SPEECH_DURATION)
  }

  /** 按角色 interaction 配置分派交互动作 */
  const dispatchAction = (action: InteractionAction): void => {
    switch (action) {
      case 'open_center':
        reportInteraction('click')
        void window.desktopPet.center.open()
        break
      case 'menu':
        reportInteraction('click')
        void window.desktopPet.menu.popup()
        break
      case 'speak': {
        reportInteraction('click')
        const msg = pickText(poolsRef.current.interact, lastSpeechText.current)
        if (msg) {
          reportInteraction('speak')
          showSpeech(msg)
        }
        break
      }
      case 'none':
        break
    }
  }

  const actionFor = (key: 'click' | 'doubleClick' | 'rightClick', fallback: InteractionAction): InteractionAction =>
    detail?.interaction?.[key] ?? fallback

  /** 互动上报（计入陪伴统计，仅用户主动交互；事件通知/欢迎/问候不计） */
  const reportInteraction = (kind: 'click' | 'drag' | 'speak'): void => {
    window.desktopPet.stats.reportInteraction(kind)
  }

  const setIgnore = (ignore: boolean): void => {
    if (ignore === ignoredRef.current) return
    ignoredRef.current = ignore
    void window.desktopPet.window.setIgnoreMouseEvents(ignore)
  }

  useEffect(() => {
    void window.desktopPet.settings.get().then((s) => {
      setCharId(s.activeCharacterId || 'rabbit')
      setSize(s.size)
      setOpacity(s.opacity)
      poolsRef.current = s.speech ?? DEFAULT_SPEECH
    })
  }, [])

  useEffect(() => {
    let alive = true
    void window.desktopPet.character.get(charId).then((res) => {
      if (!alive) return
      if ('animation' in res) {
        setDetail(res)
      } else {
        setDetail(null)
      }
    })
    return () => {
      alive = false
    }
  }, [charId])

  useEffect(() => {
    return window.desktopPet.events.onCharacterChanged((id) => setCharId(id))
  }, [])

  useEffect(() => {
    return window.desktopPet.events.onTogglePause(() => setPaused((p) => !p))
  }, [])

  useEffect(() => {
    return window.desktopPet.events.onPetState((s) => {
      setState(s)
    })
  }, [])

  useEffect(() => {
    // 事件通知：系统监控/插件事件出现时说话（台词来自自定义消息池）
    return window.desktopPet.events.onPetSpeech((eventType) => {
      const msg = eventSpeech(poolsRef.current, eventType, lastSpeechText.current)
      if (msg) showSpeech(msg)
    })
  }, [])

  useEffect(() => {
    return window.desktopPet.events.onScheduleFired((fired) => {
      // 日程触发：标题 + 备注（如有）拼成气泡文本；显示时长延长到 8 秒以突出提醒
      const text = fired.message
        ? `${fired.title}：${fired.message}`
        : `提醒：${fired.title}`
      lastSpeechText.current = text
      setSpeech({ key: 'schedule', text })
      if (speechTimer.current) clearTimeout(speechTimer.current)
      speechTimer.current = setTimeout(() => setSpeech(null), 8000)
    })
  }, [])

  useEffect(() => {
    return window.desktopPet.events.onAutoReportFired((fired) => {
      // 自动报告生成：气泡展示标题与文件路径，8 秒后消失
      const text = `${fired.title}：${fired.body}`
      lastSpeechText.current = text
      setSpeech({ key: 'autoReport', text })
      if (speechTimer.current) clearTimeout(speechTimer.current)
      speechTimer.current = setTimeout(() => setSpeech(null), 8000)
    })
  }, [])

  useEffect(() => {
    return window.desktopPet.events.onPushFired((fired) => {
      // 被动源/推送 → 台词池拟人反应；push 正文附第二行
      const msg = reactionReply(poolsRef.current, fired, lastSpeechText.current)
      if (msg) {
        lastSpeechText.current = msg.text
        setSpeech({ key: 'reaction', text: msg.text })
        if (speechTimer.current) clearTimeout(speechTimer.current)
        speechTimer.current = setTimeout(() => setSpeech(null), 8000)
      }
    })
  }, [])

  useEffect(() => {
    const greeting = greetingKey(now.getHours())
    if (lastGreetingRef.current === null) {
      lastGreetingRef.current = greeting
      return
    }
    if (lastGreetingRef.current !== greeting) {
      lastGreetingRef.current = greeting
      const msg = greetingSpeech(poolsRef.current, now.getHours(), lastSpeechText.current)
      if (msg) showSpeech(msg)
    }
  }, [now])

  useEffect(() => {
    const timer = setTimeout(() => {
      if (welcomedRef.current) return
      welcomedRef.current = true
      const msg = welcomeSpeech(poolsRef.current, null)
      if (msg) showSpeech(msg)
    }, WELCOME_DELAY)
    return () => clearTimeout(timer)
  }, [])

  useEffect(() => {
    return window.desktopPet.events.onSettingsChanged((patch) => {
      setSize(patch.size)
      setOpacity(patch.opacity)
    })
  }, [])

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!window.location.hash.includes('/pet')) return
    let frames = 0
    let last = performance.now()
    let raf = 0
    const loop = (): void => {
      frames++
      const t = performance.now()
      if (t - last >= 1000) {
        window.desktopPet.perf.report(Math.round((frames * 1000) / (t - last)))
        frames = 0
        last = t
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    const evaluate = (): void => {
      const p = pointerRef.current
      if (p.down && p.moved) {
        setIgnore(false)
        return
      }
      const hit = hitRef.current
      if (!hit || hit.content.width <= 0) return
      const { x, y } = lastClientRef.current
      if (hit.map.width <= 0) {
        setIgnore(!pointInRect(hit.content, x, y))
        return
      }
      setIgnore(
        shouldIgnorePointer({
          map: hit.map,
          content: hit.content,
          panels: [],
          x,
          y,
          threshold: ALPHA_THRESHOLD
        })
      )
    }
    evaluateRef.current = evaluate
    let rafScheduled = false
    const onMove = (e: MouseEvent): void => {
      lastClientRef.current = { x: e.clientX, y: e.clientY }
      // rAF 节流：mousemove 频率很高，合并到下一帧求值（setIgnore 本身也有状态去重）
      if (rafScheduled) return
      rafScheduled = true
      requestAnimationFrame(() => {
        rafScheduled = false
        evaluate()
      })
    }
    window.addEventListener('mousemove', onMove)
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  useEffect(() => {
    let raf = 0
    let drawnFor = ''
    const sync = (): void => {
      const img = spriteRef.current
      if (img && img.complete && img.naturalWidth > 0) {
        const src = img.currentSrc || img.src || ''
        if (src && src !== drawnFor) {
          drawnFor = src
          try {
            const ch = Math.max(1, Math.round((HIT_MAP_SIZE * img.naturalHeight) / img.naturalWidth))
            const canvas = document.createElement('canvas')
            canvas.width = HIT_MAP_SIZE
            canvas.height = ch
            const ctx = canvas.getContext('2d')
            if (ctx) {
              ctx.drawImage(img, 0, 0, HIT_MAP_SIZE, ch)
              const imgData = ctx.getImageData(0, 0, HIT_MAP_SIZE, ch)
              hitRef.current = {
                map: { width: HIT_MAP_SIZE, height: ch, data: imgData.data },
                content: { x: 0, y: 0, width: 0, height: 0 }
              }
            }
          } catch {
            drawnFor = ''
          }
        }
        const rect = img.getBoundingClientRect()
        hitRef.current = {
          ...(hitRef.current ?? { map: { width: 0, height: 0, data: new Uint8ClampedArray() } }),
          content: contentRectFrom(img.naturalWidth, img.naturalHeight, rect.width, rect.height)
        }
      }
      raf = requestAnimationFrame(sync)
    }
    raf = requestAnimationFrame(sync)
    return () => cancelAnimationFrame(raf)
  }, [])

  const onPointerDown = (e: React.PointerEvent): void => {
    pointerRef.current = {
      down: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      lastSX: e.screenX,
      lastSY: e.screenY
    }
    ;(e.target as Element).setPointerCapture(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent): void => {
    const p = pointerRef.current
    if (!p.down) return
    if (!p.moved) {
      const dist = Math.hypot(e.clientX - p.startX, e.clientY - p.startY)
      if (dist > DRAG_THRESHOLD) {
        p.moved = true
        reportInteraction('drag')
      } else {
        return
      }
    }
    const dx = e.screenX - p.lastSX
    const dy = e.screenY - p.lastSY
    p.lastSX = e.screenX
    p.lastSY = e.screenY
    void window.desktopPet.window.dragBy(dx, dy)
  }

  const onPointerUp = (e: React.PointerEvent): void => {
    const p = pointerRef.current
    if (!p.down) return
    p.down = false
    if (p.moved) {
      evaluateRef.current()
      return
    }
    if (clickTimer.current) clearTimeout(clickTimer.current)
    clickTimer.current = setTimeout(() => {
      dispatchAction(actionFor('click', 'speak'))
    }, CLICK_TIMEOUT)
  }

  const onDoubleClick = (): void => {
    if (clickTimer.current) clearTimeout(clickTimer.current)
    dispatchAction(actionFor('doubleClick', 'open_center'))
  }

  const onContextMenu = (e: React.MouseEvent): void => {
    e.preventDefault()
    dispatchAction(actionFor('rightClick', 'menu'))
  }

  return (
    <div
      className="relative"
      style={{ width: size, height: size, cursor: 'grab', opacity: opacity * overlayFactors.opacity }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={onDoubleClick}
      onContextMenu={onContextMenu}
    >
      <PetAnimator
        charId={charId}
        detail={detail}
        state={state}
        paused={paused}
        overlay={overlayFactors}
        spriteRef={spriteRef}
      />

      {speech && (
        <div className="dp-speech absolute left-1/2 top-1 z-20">
          <div className="whitespace-nowrap rounded-xl border border-emerald-100 bg-white/95 px-3 py-1.5 text-xs text-neutral-700 shadow-md">
            {speech.text}
          </div>
          <div className="mx-auto -mt-0.5 h-2 w-2 rotate-45 border-b border-r border-emerald-100 bg-white/95" />
        </div>
      )}
    </div>
  )
}