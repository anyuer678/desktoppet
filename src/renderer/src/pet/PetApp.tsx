import { useEffect, useMemo, useRef, useState } from 'react'
import type { CharacterDetail, CharacterSummary } from '../../../shared/ipc'
import { PetAnimator } from './PetAnimator'
import { activeOverlays, combineOverlays } from './overlay'
import { contentRectFrom, pointInRect, shouldIgnorePointer, type AlphaMap, type Rect } from './clickThrough'
import { DEFAULT_SPEECH, eventSpeech, greetingKey, greetingSpeech, pickText, reactionReply, welcomeSpeech, type Speech, type SpeechPools } from '../../../shared/speech'
import type { EmotionStatus, InteractionAction, SoundClipKey } from '../../../shared/ipc'
import { resolveSoundClip } from './sound'
import { emotionFilter } from '../../../shared/emotion'

const CLICK_TIMEOUT = 300
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
  const [soundEnabled, setSoundEnabled] = useState(false)
  const [emotion, setEmotion] = useState<EmotionStatus | null>(null)
  const [now, setNow] = useState(() => new Date())

  const overlayFactors = useMemo(
    () => combineOverlays(activeOverlays(detail?.overlays, now)),
    [detail, now]
  )

  const pointerRef = useRef({ down: false, moved: false, startX: 0, startY: 0, lastSX: 0, lastSY: 0 })
  const dragSamplesRef = useRef<{ t: number; x: number; y: number }[]>([])
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
  const audioCacheRef = useRef(new Map<string, HTMLAudioElement>())
  const lastSoundStateRef = useRef<string | null>(null)

  const playSound = (key: SoundClipKey): void => {
    const clip = resolveSoundClip(detail?.sound, charId, key, soundEnabled)
    if (!clip) return
    let audio = audioCacheRef.current.get(clip.src)
    if (!audio) {
      audio = new Audio(clip.src)
      audio.preload = 'auto'
      audioCacheRef.current.set(clip.src, audio)
    }
    audio.volume = clip.volume
    try {
      audio.currentTime = 0
    } catch {
      // 尚未加载完成时重置失败可忽略，play 会从头播放
    }
    void audio.play().catch(() => {
      // 自动播放策略/素材缺失：静默降级，不打断动画
    })
  }

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
      setSoundEnabled(s.soundEnabled ?? false)
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
    void window.desktopPet.emotion.get().then(setEmotion).catch(() => {})
    return window.desktopPet.events.onCharacterChanged((id) => {
      setCharId(id)
      void window.desktopPet.emotion.get().then(setEmotion).catch(() => {})
    })
  }, [])

  useEffect(() => {
    return window.desktopPet.events.onEmotionChanged(setEmotion)
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
    // 首次进入不播放，仅状态切换时播放对应片段
    if (lastSoundStateRef.current === null) {
      lastSoundStateRef.current = state
      return
    }
    if (lastSoundStateRef.current === state) return
    lastSoundStateRef.current = state
    playSound(state as SoundClipKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state])

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
      if (patch.speech) poolsRef.current = patch.speech
      if (patch.soundEnabled !== undefined) setSoundEnabled(patch.soundEnabled)
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
    // 只有左键参与点击/拖拽；右键交给 contextmenu，中键不产生动作
    if (e.button !== 0) return
    pointerRef.current = {
      down: true,
      moved: false,
      startX: e.clientX,
      startY: e.clientY,
      lastSX: e.screenX,
      lastSY: e.screenY
    }
    dragSamplesRef.current = [{ t: performance.now(), x: e.screenX, y: e.screenY }]
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
    const samples = dragSamplesRef.current
    samples.push({ t: performance.now(), x: e.screenX, y: e.screenY })
    if (samples.length > 8) samples.shift()
    void window.desktopPet.window.dragBy(dx, dy)
  }

  const onPointerUp = (e: React.PointerEvent): void => {
    if (e.button !== 0) return
    const p = pointerRef.current
    if (!p.down) return
    p.down = false
    if (p.moved) {
      const samples = dragSamplesRef.current
      const physics = detail?.physics
      if (physics?.enabled && samples.length >= 2) {
        const first = samples[0]
        const last = samples[samples.length - 1]
        const dt = (last.t - first.t) / 1000
        if (dt >= 0.01) {
          const vx = (last.x - first.x) / dt
          const vy = (last.y - first.y) / dt
          if (Math.hypot(vx, vy) > 150) {
            void window.desktopPet.window.fling(vx, vy, physics)
          }
        }
      }
      dragSamplesRef.current = []
      evaluateRef.current()
      return
    }
    playSound('click')
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
    // 右键不应在 300ms 后补触发一次左键动作
    if (clickTimer.current) {
      clearTimeout(clickTimer.current)
      clickTimer.current = null
    }
    dispatchAction(actionFor('rightClick', 'menu'))
  }

  return (
    <div
      className="relative"
      style={{
        width: size,
        height: size,
        cursor: 'grab',
        opacity: opacity * overlayFactors.opacity,
        filter: emotion?.enabled ? emotionFilter(emotion.score) : undefined
      }}
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
        <div className="dp-speech absolute left-1/2 top-1 z-20 -translate-x-1/2">
          <div className="max-w-[calc(100vw-16px)] whitespace-pre-line break-words rounded-xl border border-emerald-100 bg-white/95 px-3 py-1.5 text-center text-xs text-neutral-700 shadow-md">
            {speech.text}
          </div>
          <div className="mx-auto -mt-0.5 h-2 w-2 rotate-45 border-b border-r border-emerald-100 bg-white/95" />
        </div>
      )}
    </div>
  )
}