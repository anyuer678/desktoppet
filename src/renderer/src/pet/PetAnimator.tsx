import { useEffect, useRef, useState } from 'react'
import type { AnimationStateConfig, CharacterDetail } from '../../../shared/ipc'
import { clampFps, resolveAnimationState, sequenceFrameName } from './animationState'
import { DEFAULT_OVERLAY_FACTORS, type OverlayFactors } from './overlay'

function TemplateLayer({
  config,
  paused,
  overlay,
  children
}: {
  config: AnimationStateConfig
  paused: boolean
  overlay: OverlayFactors
  children: React.ReactNode
}): React.JSX.Element {
  const t = config.template ?? {}
  const float = t.float ?? {}
  const breathe = t.breathe ?? {}
  const playState = paused ? 'paused' : 'running'
  return (
    <div
      className="dp-pet-float h-full w-full"
      style={{
        ['--float-y' as string]: `${(float.y ?? 6) * overlay.floatY}px`,
        animationDuration: `${(float.duration ?? 3600) / overlay.speed}ms`,
        animationPlayState: playState
      }}
    >
      <div
        className="dp-pet-breathe h-full w-full"
        style={{
          ['--breathe-scale' as string]: `${1 + (breathe.scale ?? 0.02) * overlay.breatheScale}`,
          animationDuration: `${(breathe.duration ?? 2400) / overlay.speed}ms`,
          animationPlayState: playState
        }}
      >
        {children}
      </div>
    </div>
  )
}

function SequenceLayer({
  charId,
  stateKey,
  config,
  paused,
  overlay,
  spriteRef
}: {
  charId: string
  stateKey: string
  config: AnimationStateConfig
  paused: boolean
  overlay: OverlayFactors
  spriteRef?: React.Ref<HTMLImageElement>
}): React.JSX.Element {
  const [index, setIndex] = useState(0)
  const [total, setTotal] = useState<number | null>(null)
  const [failed, setFailed] = useState(false)
  const totalRef = useRef<number | null>(null)
  const fps = clampFps(config.fps === undefined ? undefined : config.fps * overlay.speed)

  useEffect(() => {
    if (paused || failed) return
    const timer = setInterval(() => {
      setIndex((prev) => {
        const t = totalRef.current
        if (config.loop === false && t !== null && prev >= t - 1) return prev
        if (t !== null) return (prev + 1) % t
        return prev + 1
      })
    }, 1000 / fps)
    return () => clearInterval(timer)
  }, [fps, paused, failed, config.loop])

  const handleError = (): void => {
    if (totalRef.current !== null) return
    if (index === 0) {
      totalRef.current = 0
      setFailed(true)
      return
    }
    totalRef.current = index
    setTotal(index)
    setIndex(0)
  }

  if (failed) {
    return (
      <img
        ref={spriteRef}
        crossOrigin="anonymous"
        src={`pet://${charId}/${config.path ?? `animations/${stateKey}`}/000.png`}
        alt="pet"
        draggable={false}
        className="h-full w-full object-contain"
      />
    )
  }

  return (
    <img
      ref={spriteRef}
      crossOrigin="anonymous"
      src={`pet://${charId}/${sequenceFrameName(stateKey, config, index)}`}
      alt="pet"
      draggable={false}
      className="h-full w-full object-contain"
      onError={handleError}
    />
  )
}

export function PetAnimator({
  charId,
  detail,
  state,
  paused,
  overlay = DEFAULT_OVERLAY_FACTORS,
  spriteRef
}: {
  charId: string
  detail: CharacterDetail | null
  state: string
  paused: boolean
  overlay?: OverlayFactors
  spriteRef?: React.Ref<HTMLImageElement>
}): React.JSX.Element {
  const resolved = resolveAnimationState(detail, state)
  if (!resolved) {
    return (
      <img
        ref={spriteRef}
        crossOrigin="anonymous"
        src={`pet://${charId}/${detail?.avatarMain ?? 'avatar.png'}`}
        alt="pet"
        draggable={false}
        className="h-full w-full object-contain"
      />
    )
  }
  if (resolved.config.type === 'sequence') {
    return (
      <SequenceLayer
        charId={charId}
        stateKey={resolved.key}
        config={resolved.config}
        paused={paused}
        overlay={overlay}
        spriteRef={spriteRef}
      />
    )
  }
  return (
    <TemplateLayer config={resolved.config} paused={paused} overlay={overlay}>
      <img
        ref={spriteRef}
        crossOrigin="anonymous"
        src={`pet://${charId}/${detail?.avatarMain ?? 'avatar.png'}`}
        alt="pet"
        draggable={false}
        className="h-full w-full object-contain"
      />
    </TemplateLayer>
  )
}