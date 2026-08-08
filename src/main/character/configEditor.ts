import { existsSync, readFileSync, renameSync, writeFileSync } from 'fs'
import type { CharacterPatch, InteractionAction, StateTemplatePatch } from '../../shared/ipc'
import { INTERACTION_ACTIONS } from '../../shared/ipc'

/** 数值钳制到 [min, max]，非法输入返回 fallback */
export function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

/** 将状态模板补丁合并进 template（缺失节点自动创建） */
function applyStateTemplate(
  template: Record<string, unknown>,
  patch: StateTemplatePatch
): Record<string, unknown> {
  const breathe =
    typeof template.breathe === 'object' && template.breathe !== null
      ? (template.breathe as Record<string, unknown>)
      : {}
  const float =
    typeof template.float === 'object' && template.float !== null
      ? (template.float as Record<string, unknown>)
      : {}

  if (patch.breatheScale !== undefined) breathe.scale = clampNumber(patch.breatheScale, 0, 0.5, 0.02)
  if (patch.breatheDuration !== undefined) breathe.duration = clampNumber(patch.breatheDuration, 500, 10000, 2400)
  if (patch.floatY !== undefined) float.y = clampNumber(patch.floatY, 0, 400, 6)
  if (patch.floatDuration !== undefined) float.duration = clampNumber(patch.floatDuration, 500, 10000, 3600)

  if (Object.keys(breathe).length > 0) template.breathe = breathe
  if (Object.keys(float).length > 0) template.float = float
  return template
}

/** 钳制小时到 0~23（先取模 24，再按模舍入） */
function clampHour(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return ((Math.round(value) % 24) + 24) % 24
}

/** 交互动作值域校验：非法值回退默认动作 */
function normalizeInteraction(value: unknown, fallback: InteractionAction): InteractionAction {
  return typeof value === 'string' && (INTERACTION_ACTIONS as readonly string[]).includes(value)
    ? (value as InteractionAction)
    : fallback
}

export interface ConfigEditResult {
  ok: boolean
  error?: string
}

/**
 * 读角色 config.json，合并 patch 后写回（保留未涉及字段，缩进 2）。
 * name/version 非空字符串；数值按范围钳制。
 */
export function updateCharacterConfig(configPath: string, patch: CharacterPatch): ConfigEditResult {
  if (!existsSync(configPath)) return { ok: false, error: 'config.json 不存在' }
  let config: Record<string, unknown>
  try {
    config = JSON.parse(readFileSync(configPath, 'utf-8')) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'config.json 解析失败，无法编辑' }
  }
  if (typeof config !== 'object' || config === null || Array.isArray(config)) {
    return { ok: false, error: 'config.json 顶层必须是对象' }
  }

  if (patch.name !== undefined) {
    if (typeof patch.name !== 'string' || patch.name.trim() === '') return { ok: false, error: '名称不能为空' }
    config.name = patch.name.trim()
  }
  if (patch.version !== undefined) {
    if (typeof patch.version !== 'string' || patch.version.trim() === '') return { ok: false, error: '版本不能为空' }
    config.version = patch.version.trim()
  }
  if (patch.defaultSize !== undefined) {
    config.settings = {
      ...(typeof config.settings === 'object' && config.settings !== null ? config.settings : {}),
      defaultSize: Math.round(clampNumber(patch.defaultSize, 96, 512, 256))
    }
  }
  if (patch.allowResize !== undefined) {
    config.settings = {
      ...(typeof config.settings === 'object' && config.settings !== null ? config.settings : {}),
      allowResize: Boolean(patch.allowResize)
    }
  }

  if (patch.interaction !== undefined) {
    const interaction =
      typeof config.interaction === 'object' && config.interaction !== null
        ? (config.interaction as Record<string, unknown>)
        : {}
    if (patch.interaction.click !== undefined) {
      interaction.click = normalizeInteraction(patch.interaction.click, 'speak')
    }
    if (patch.interaction.doubleClick !== undefined) {
      interaction.doubleClick = normalizeInteraction(patch.interaction.doubleClick, 'open_center')
    }
    if (patch.interaction.rightClick !== undefined) {
      interaction.rightClick = normalizeInteraction(patch.interaction.rightClick, 'menu')
    }
    config.interaction = interaction
  }

  const animation =
    typeof config.animation === 'object' && config.animation !== null
      ? (config.animation as Record<string, unknown>)
      : {}
  const states =
    typeof animation.states === 'object' && animation.states !== null
      ? (animation.states as Record<string, unknown>)
      : {}

  const applyPatch = (stateKey: string, statePatch: StateTemplatePatch): void => {
    const existing =
      typeof states[stateKey] === 'object' && states[stateKey] !== null
        ? (states[stateKey] as Record<string, unknown>)
        : {}
    const template =
      typeof existing.template === 'object' && existing.template !== null
        ? (existing.template as Record<string, unknown>)
        : {}
    existing.template = applyStateTemplate(template, statePatch)
    if (typeof existing.type !== 'string') existing.type = 'template'
    states[stateKey] = existing
  }

  if (patch.idle !== undefined) applyPatch('idle', patch.idle)
  if (patch.states !== undefined) {
    for (const [key, statePatch] of Object.entries(patch.states)) {
      if (statePatch) applyPatch(key, statePatch)
    }
  }
  if (patch.idle !== undefined || patch.states !== undefined) {
    animation.states = states
    config.animation = animation
  }

  if (patch.overlays?.night !== undefined) {
    const night = patch.overlays.night
    const overlays =
      typeof config.overlays === 'object' && config.overlays !== null
        ? (config.overlays as Record<string, unknown>)
        : {}
    const existingNight =
      typeof overlays.night === 'object' && overlays.night !== null
        ? (overlays.night as Record<string, unknown>)
        : {}
    const condition =
      typeof existingNight.condition === 'object' && existingNight.condition !== null
        ? (existingNight.condition as Record<string, unknown>)
        : {}
    if (night.start !== undefined || night.end !== undefined) {
      const time =
        typeof condition.time === 'object' && condition.time !== null
          ? (condition.time as Record<string, unknown>)
          : {}
      if (night.start !== undefined) time.start = clampHour(night.start, 22)
      if (night.end !== undefined) time.end = clampHour(night.end, 6)
      condition.time = time
    }
    existingNight.condition = condition
    const apply =
      typeof existingNight.apply === 'object' && existingNight.apply !== null
        ? (existingNight.apply as Record<string, unknown>)
        : {}
    if (night.opacity !== undefined) apply.opacity = clampNumber(night.opacity, 0.1, 1, 0.65)
    const template =
      typeof apply.template === 'object' && apply.template !== null
        ? (apply.template as Record<string, unknown>)
        : {}
    if (night.breatheScale !== undefined) template.breatheScale = clampNumber(night.breatheScale, 0, 1, 0.6)
    if (night.floatY !== undefined) template.floatY = clampNumber(night.floatY, 0, 1, 0.4)
    if (night.speed !== undefined) template.speed = clampNumber(night.speed, 0.2, 2, 0.9)
    if (Object.keys(template).length > 0) apply.template = template
    existingNight.apply = apply
    overlays.night = existingNight
    config.overlays = overlays
  }

  try {
    // 原子写：先写临时文件再 rename，避免写一半崩溃留下损坏 config.json
    const tempPath = `${configPath}.tmp`
    writeFileSync(tempPath, JSON.stringify(config, null, 2) + '\n', 'utf-8')
    renameSync(tempPath, configPath)
  } catch (err) {
    return { ok: false, error: `写入失败: ${err instanceof Error ? err.message : String(err)}` }
  }
  return { ok: true }
}
