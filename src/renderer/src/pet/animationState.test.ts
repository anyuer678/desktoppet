import { describe, expect, it } from 'vitest'
import type { CharacterDetail } from '../../../shared/ipc'
import { clampFps, resolveAnimationState, sequenceFrameName } from './animationState'

const rabbit: CharacterDetail = {
  id: 'rabbit',
  name: '兔兔',
  version: '1.0',
  avatarMain: 'avatar.png',
  defaultState: 'idle',
  supportedStates: ['idle', 'happy'],
  animation: {
    idle: { type: 'template' },
    happy: { type: 'sequence', path: 'animations/happy', loop: false, fps: 12 }
  },
  interaction: { click: 'speak', doubleClick: 'open_center', rightClick: 'menu' },
  settings: { defaultSize: 256, allowResize: true }
}

describe('resolveAnimationState（状态回退链）', () => {
  it('合法状态优先命中', () => {
    const r = resolveAnimationState(rabbit, 'happy')
    expect(r?.key).toBe('happy')
    expect(r?.config.type).toBe('sequence')
  })

  it('请求状态缺失时回退到 default', () => {
    const r = resolveAnimationState(rabbit, 'sleep')
    expect(r?.key).toBe('idle')
  })

  it('default 也已缺失时回退到第一个合法状态', () => {
    const detail: CharacterDetail = {
      ...rabbit,
      defaultState: 'missing',
      animation: { wake: { type: 'template' } }
    }
    const r = resolveAnimationState(detail, 'sleep')
    expect(r?.key).toBe('wake')
  })

  it('无任何状态或角色不存在时返回 null（静态主图）', () => {
    expect(resolveAnimationState(null, 'idle')).toBeNull()
    const empty: CharacterDetail = { ...rabbit, animation: {}, defaultState: '' }
    expect(resolveAnimationState(empty, 'idle')).toBeNull()
  })
})

describe('sequenceFrameName / clampFps', () => {
  it('帧名按 3 位补零', () => {
    expect(sequenceFrameName('happy', { type: 'sequence', path: 'animations/happy' }, 0)).toBe(
      'animations/happy/000.png'
    )
    expect(sequenceFrameName('happy', { type: 'sequence', path: 'animations/happy' }, 12)).toBe(
      'animations/happy/012.png'
    )
  })

  it('fps 默认 8，并夹在 1..60 之间', () => {
    expect(clampFps(undefined)).toBe(8)
    expect(clampFps(120)).toBe(60)
    expect(clampFps(0)).toBe(1)
    expect(clampFps(12.6)).toBe(13)
  })
})