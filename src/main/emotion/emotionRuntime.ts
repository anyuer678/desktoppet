import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import type { EmotionStatus } from '../../shared/ipc'
import {
  applyEmotionDecay,
  clampEmotion,
  emotionLevel,
  emotionWeight,
  type EmotionConfig,
  type EmotionWeights
} from '../../shared/emotion'
import { sanitizeRoleId } from '../stats/dailyStats'
import { writeFileAtomic } from '../storage/atomicWrite'
import type { LogFn } from '../logging/logger'

export interface EmotionRuntimeDeps {
  /** 当前角色 id（getter：settings 为唯一真相源） */
  getRoleId(): string
  /** 当前角色 emotion 配置（getter：角色切换/配置变化后现读） */
  getConfig(): EmotionConfig
  /** 心情存储目录（userData/emotion） */
  dir(): string
  notifyPet(channel: string, payload?: unknown): void
  notifyCenter(channel: string, payload?: unknown): void
  log: LogFn
}

export interface EmotionRuntime {
  init(): void
  /** 角色切换后调用：载入新角色心情 */
  switchRole(): void
  /** 当前心情快照（含按时间衰减的投影值） */
  status(now?: number): EmotionStatus
  /** 记录一次互动/开心/告警，更新并落盘 */
  record(kind: keyof EmotionWeights, now?: number): EmotionStatus
}

interface EmotionFile {
  score: number
  updatedAt: number
}

export function createEmotionRuntime(deps: EmotionRuntimeDeps): EmotionRuntime {
  let roleId = 'rabbit'
  let score = 0
  let updatedAt = Date.now()

  function filePath(role: string): string {
    return join(deps.dir(), `${sanitizeRoleId(role)}.json`)
  }

  function load(role: string): void {
    roleId = role
    score = 0
    updatedAt = Date.now()
    const file = filePath(role)
    if (!existsSync(file)) return
    try {
      const raw = JSON.parse(readFileSync(file, 'utf-8')) as Partial<EmotionFile>
      if (typeof raw.score === 'number' && Number.isFinite(raw.score)) score = clampEmotion(raw.score)
      if (typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt)) updatedAt = raw.updatedAt
    } catch (err) {
      deps.log('warn', '[emotion] load failed, reset to neutral:', err)
    }
  }

  function projected(now: number): number {
    const cfg = deps.getConfig()
    return cfg.enabled ? applyEmotionDecay(score, now - updatedAt, cfg.decayPerHour) : clampEmotion(score)
  }

  function snapshot(now: number): EmotionStatus {
    const cfg = deps.getConfig()
    const value = projected(now)
    return {
      score: Math.round(value * 10) / 10,
      label: emotionLevel(cfg, value).label,
      enabled: cfg.enabled
    }
  }

  function record(kind: keyof EmotionWeights, now = Date.now()): EmotionStatus {
    const cfg = deps.getConfig()
    if (!cfg.enabled) return snapshot(now)
    const delta = emotionWeight(cfg, kind)
    const next = clampEmotion(projected(now) + delta)
    score = next
    updatedAt = now
    try {
      writeFileAtomic(filePath(roleId), JSON.stringify({ score, updatedAt }, null, 2))
    } catch (err) {
      deps.log('warn', '[emotion] save failed:', err)
    }
    const status = snapshot(now)
    deps.notifyPet('emotion:changed', status)
    deps.notifyCenter('emotion:changed', status)
    return status
  }

  return {
    init: () => load(deps.getRoleId()),
    switchRole: () => load(deps.getRoleId()),
    status: (now = Date.now()) => snapshot(now),
    record
  }
}
