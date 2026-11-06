export const EMOTION_MIN = -100
export const EMOTION_MAX = 100

export interface EmotionLevel {
  min: number
  label: string
}

export interface EmotionWeights {
  interact: number
  happy: number
  warning: number
}

/** 角色包 emotion 配置（缺省使用默认值） */
export interface EmotionConfig {
  enabled: boolean
  /** 每小时向 0 衰减的点数 */
  decayPerHour: number
  weights: EmotionWeights
  /** 按 min 降序；score 命中第一个 score >= min 的等级 */
  levels: EmotionLevel[]
}

export const DEFAULT_EMOTION_CONFIG: EmotionConfig = {
  enabled: true,
  decayPerHour: 2,
  weights: { interact: 2, happy: 4, warning: -4 },
  levels: [
    { min: 60, label: '开心' },
    { min: 20, label: '愉快' },
    { min: -20, label: '平静' },
    { min: -60, label: '低落' },
    { min: -100, label: '沮丧' }
  ]
}

const HAPPY_EVENTS = new Set(['complete', 'success', 'reward'])
const WARNING_EVENTS = new Set([
  'warning',
  'error',
  'cpu_high',
  'memory_warning',
  'battery_low',
  'network_error',
  'alarm'
])

export function clampEmotion(score: number): number {
  if (!Number.isFinite(score)) return 0
  return Math.min(EMOTION_MAX, Math.max(EMOTION_MIN, score))
}

function finiteInRange(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** 规范化角色包 emotion 配置；非法字段逐项回退默认 */
export function normalizeEmotionConfig(raw: unknown): EmotionConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_EMOTION_CONFIG, weights: { ...DEFAULT_EMOTION_CONFIG.weights }, levels: [...DEFAULT_EMOTION_CONFIG.levels] }
  const v = raw as { enabled?: unknown; decayPerHour?: unknown; weights?: unknown; levels?: unknown }
  const weightsRaw = (v.weights ?? {}) as Record<string, unknown>
  const levelsRaw = Array.isArray(v.levels) ? v.levels : []
  const levels: EmotionLevel[] = []
  for (const item of levelsRaw) {
    if (!item || typeof item !== 'object') continue
    const l = item as { min?: unknown; label?: unknown }
    if (typeof l.min !== 'number' || !Number.isFinite(l.min)) continue
    if (typeof l.label !== 'string' || l.label.trim() === '') continue
    levels.push({ min: clampEmotion(l.min), label: l.label.trim().slice(0, 20) })
  }
  levels.sort((a, b) => b.min - a.min)
  return {
    enabled: typeof v.enabled === 'boolean' ? v.enabled : DEFAULT_EMOTION_CONFIG.enabled,
    decayPerHour: finiteInRange(v.decayPerHour, 0, 100, DEFAULT_EMOTION_CONFIG.decayPerHour),
    weights: {
      interact: finiteInRange(weightsRaw.interact, -100, 100, DEFAULT_EMOTION_CONFIG.weights.interact),
      happy: finiteInRange(weightsRaw.happy, -100, 100, DEFAULT_EMOTION_CONFIG.weights.happy),
      warning: finiteInRange(weightsRaw.warning, -100, 100, DEFAULT_EMOTION_CONFIG.weights.warning)
    },
    levels: levels.length > 0 ? levels : [...DEFAULT_EMOTION_CONFIG.levels]
  }
}

/** 向 0 线性衰减；越过 0 即归零 */
export function applyEmotionDecay(score: number, elapsedMs: number, decayPerHour: number): number {
  const current = clampEmotion(score)
  if (current === 0 || !(elapsedMs > 0) || !(decayPerHour > 0)) return current
  const delta = (elapsedMs / 3_600_000) * decayPerHour
  if (delta >= Math.abs(current)) return 0
  return clampEmotion(current > 0 ? current - delta : current + delta)
}

export function emotionLevel(config: EmotionConfig, score: number): EmotionLevel {
  const s = clampEmotion(score)
  const hit = config.levels.find((l) => s >= l.min)
  return hit ?? config.levels[config.levels.length - 1]
}

export function emotionWeight(config: EmotionConfig, kind: keyof EmotionWeights): number {
  return config.weights[kind]
}

/** 事件类型 → 心情权重类别（focus/idle 类不改变心情） */
export function classifyEmotionEvent(type: string): keyof EmotionWeights | null {
  if (HAPPY_EVENTS.has(type)) return 'happy'
  if (WARNING_EVENTS.has(type)) return 'warning'
  return null
}

/** 心情分数 → 桌宠 CSS 滤镜（高心情略亮/饱和，低心情略暗/去饱和） */
export function emotionFilter(score: number): string {
  const s = clampEmotion(score)
  if (s >= 60) return 'brightness(1.04) saturate(1.08)'
  if (s >= 20) return 'saturate(1.03)'
  if (s >= -20) return 'none'
  if (s >= -60) return 'saturate(0.85)'
  return 'saturate(0.65) brightness(0.96)'
}
