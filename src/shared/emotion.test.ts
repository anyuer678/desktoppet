import { describe, expect, it } from 'vitest'
import {
  applyEmotionDecay,
  clampEmotion,
  classifyEmotionEvent,
  DEFAULT_EMOTION_CONFIG,
  emotionFilter,
  emotionLevel,
  normalizeEmotionConfig
} from './emotion'

describe('emotion helpers', () => {
  it('夹取 -100..100，非法值归零', () => {
    expect(clampEmotion(120)).toBe(100)
    expect(clampEmotion(-120)).toBe(-100)
    expect(clampEmotion(Number.NaN)).toBe(0)
  })

  it('衰减向 0 靠拢且不越过', () => {
    expect(applyEmotionDecay(10, 3_600_000, 2)).toBe(8)
    expect(applyEmotionDecay(-10, 3_600_000, 2)).toBe(-8)
    expect(applyEmotionDecay(1, 3_600_000, 2)).toBe(0)
    expect(applyEmotionDecay(0, 3_600_000, 2)).toBe(0)
    expect(applyEmotionDecay(5, 0, 2)).toBe(5)
  })

  it('等级按 min 降序命中', () => {
    expect(emotionLevel(DEFAULT_EMOTION_CONFIG, 80).label).toBe('开心')
    expect(emotionLevel(DEFAULT_EMOTION_CONFIG, 20).label).toBe('愉快')
    expect(emotionLevel(DEFAULT_EMOTION_CONFIG, 0).label).toBe('平静')
    expect(emotionLevel(DEFAULT_EMOTION_CONFIG, -100).label).toBe('沮丧')
  })

  it('事件分类：happy/warning，其余 null', () => {
    expect(classifyEmotionEvent('complete')).toBe('happy')
    expect(classifyEmotionEvent('cpu_high')).toBe('warning')
    expect(classifyEmotionEvent('notice')).toBeNull()
    expect(classifyEmotionEvent('working')).toBeNull()
  })

  it('角色包配置规范化与回退', () => {
    const cfg = normalizeEmotionConfig({
      enabled: false,
      decayPerHour: 999,
      weights: { interact: 5, happy: 'x', warning: -999 },
      levels: [{ min: 50, label: '超开心' }, { min: 'bad', label: 'x' }]
    })
    expect(cfg.enabled).toBe(false)
    expect(cfg.decayPerHour).toBe(100)
    expect(cfg.weights).toEqual({ interact: 5, happy: 4, warning: -100 })
    expect(cfg.levels).toEqual([{ min: 50, label: '超开心' }])
    expect(normalizeEmotionConfig(null).levels).toEqual(DEFAULT_EMOTION_CONFIG.levels)
  })

  it('滤镜按心情分档', () => {
    expect(emotionFilter(80)).toContain('brightness(1.04)')
    expect(emotionFilter(0)).toBe('none')
    expect(emotionFilter(-80)).toContain('saturate(0.65)')
  })
})
