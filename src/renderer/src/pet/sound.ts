import type { CharacterSoundConfig, SoundClipKey } from '../../../shared/ipc'

export interface SoundClip {
  src: string
  volume: number
}

/** 解析某状态/点击应播放的音效；全局开关、角色开关、片段缺失任一条件不满足则返回 null */
export function resolveSoundClip(
  sound: CharacterSoundConfig | undefined,
  charId: string,
  key: SoundClipKey,
  globalEnabled: boolean
): SoundClip | null {
  if (!globalEnabled || !sound || !sound.enabled) return null
  const path = sound.clips[key]
  if (!path) return null
  const volume = Number.isFinite(sound.volume) ? Math.min(1, Math.max(0, sound.volume)) : 0.6
  return { src: `pet://${charId}/${path}`, volume }
}
