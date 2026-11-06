import { describe, expect, it } from 'vitest'
import { resolveSoundClip } from './sound'

const sound = {
  enabled: true,
  volume: 0.5,
  clips: { click: 'sounds/click.wav', happy: 'sounds/happy.mp3' }
}

describe('resolveSoundClip', () => {
  it('全局/角色开关开启且片段存在时返回 pet:// 地址与音量', () => {
    expect(resolveSoundClip(sound, 'rabbit', 'click', true)).toEqual({
      src: 'pet://rabbit/sounds/click.wav',
      volume: 0.5
    })
  })

  it('全局关闭 / 角色关闭 / 片段缺失 → null', () => {
    expect(resolveSoundClip(sound, 'rabbit', 'click', false)).toBeNull()
    expect(resolveSoundClip({ ...sound, enabled: false }, 'rabbit', 'click', true)).toBeNull()
    expect(resolveSoundClip(sound, 'rabbit', 'warning', true)).toBeNull()
    expect(resolveSoundClip(undefined, 'rabbit', 'click', true)).toBeNull()
  })

  it('音量夹取到 0~1，非法值回退 0.6', () => {
    expect(resolveSoundClip({ ...sound, volume: 2 }, 'x', 'click', true)?.volume).toBe(1)
    expect(resolveSoundClip({ ...sound, volume: -1 }, 'x', 'click', true)?.volume).toBe(0)
    expect(resolveSoundClip({ ...sound, volume: Number.NaN }, 'x', 'click', true)?.volume).toBe(0.6)
  })
})
