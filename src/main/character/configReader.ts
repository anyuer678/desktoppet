import { existsSync, readFileSync, readdirSync } from 'fs'
import { join, resolve, sep } from 'path'
import type {
  AnimationStateConfig,
  CharacterDetail,
  InteractionAction,
  OverlayApplyConfig,
  OverlayConfig,
  OverlayTimeCondition
} from '../../shared/ipc'
import { INTERACTION_ACTIONS } from '../../shared/ipc'

export interface ParsedCharacter {
  id: string
  name: string
  version: string
  defaultState: string
  supportedStates: string[]
  avatarMain: string
  avatarPreview?: string
}

export function isWithinRoot(root: string, candidatePath: string): boolean {
  const rootResolved = resolve(root)
  const candidate = resolve(candidatePath)
  return candidate === rootResolved || candidate.startsWith(rootResolved + sep)
}

export function safeResolve(root: string, id: string, ...rest: string[]): string | null {
  const resolved = resolve(root, id, ...rest)
  return isWithinRoot(root, resolved) ? resolved : null
}

/** pet:// 协议 host 必须是合法角色 id（与 importer.validatePackId 同规则，避免循环依赖） */
const PET_HOST_RE = /^[a-z0-9_-]+$/

/** 将 pet://<id>/<path...> 的 host + pathname 解析为角色包内绝对路径，越界返回 null */
export function resolvePetPath(root: string, host: string, pathParts: string[]): string | null {
  if (!host || !PET_HOST_RE.test(host) || pathParts.length === 0) return null
  const packDir = resolve(root, host)
  if (!isWithinRoot(root, packDir)) return null
  const resolved = resolve(packDir, ...pathParts)
  return isWithinRoot(packDir, resolved) ? resolved : null
}

/** 交互动作值域校验：非法值回退默认动作 */
function normalizeInteraction(value: unknown, fallback: InteractionAction): InteractionAction {
  return typeof value === 'string' && (INTERACTION_ACTIONS as readonly string[]).includes(value)
    ? (value as InteractionAction)
    : fallback
}

export function parseCharacterConfig(configPath: string): ParsedCharacter | null {
  if (!existsSync(configPath)) return null
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      id?: unknown
      name?: unknown
      version?: unknown
      avatar?: { main?: unknown; preview?: unknown }
      animation?: { default?: unknown; states?: unknown }
    }
    if (typeof raw.id !== 'string' || typeof raw.name !== 'string') return null

    const states =
      raw.animation?.states && typeof raw.animation.states === 'object'
        ? Object.keys(raw.animation.states as Record<string, unknown>)
        : []
    const defaultState =
      typeof raw.animation?.default === 'string' && states.includes(raw.animation.default)
        ? raw.animation.default
        : states[0] ?? ''

    return {
      id: raw.id,
      name: raw.name,
      version: typeof raw.version === 'string' ? raw.version : '1.0',
      defaultState,
      supportedStates: states,
      avatarMain: typeof raw.avatar?.main === 'string' ? raw.avatar.main : 'avatar.png',
      avatarPreview: typeof raw.avatar?.preview === 'string' ? raw.avatar.preview : undefined
    }
  } catch {
    return null
  }
}

export function listCharacters(root: string): ParsedCharacter[] {
  if (!existsSync(root)) return []
  const out: ParsedCharacter[] = []
  for (const id of readdirSync(root)) {
    const parsed = parseCharacterConfig(join(root, id, 'config.json'))
    // 目录名与 config.id 不一致的损坏包跳过，避免列表出现无法按 id 加载的角色
    if (parsed && parsed.id === id) out.push(parsed)
  }
  return out
}

export function readCharacterDetail(root: string, id: string): CharacterDetail | null {
  const configPath = join(root, id, 'config.json')
  if (!existsSync(configPath)) return null
  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as {
      id?: unknown
      name?: unknown
      version?: unknown
      avatar?: { main?: unknown; preview?: unknown }
      animation?: { default?: unknown; states?: Record<string, unknown> }
      interaction?: { click?: unknown; doubleClick?: unknown; rightClick?: unknown }
      settings?: { defaultSize?: unknown; allowResize?: unknown }
      overlays?: unknown
    }
    if (typeof raw.id !== 'string' || raw.id !== id || typeof raw.name !== 'string') return null

    const animation: Record<string, AnimationStateConfig> = {}
    if (raw.animation?.states && typeof raw.animation.states === 'object') {
      for (const [key, value] of Object.entries(raw.animation.states)) {
        const cfg = value as AnimationStateConfig
        animation[key] = {
          type: cfg.type === 'sequence' ? 'sequence' : 'template',
          path: typeof cfg.path === 'string' ? cfg.path : undefined,
          loop: typeof cfg.loop === 'boolean' ? cfg.loop : true,
          fps: cfg.fps,
          template: cfg.template
        }
      }
    }

    const stateKeys = Object.keys(animation)
    const defaultKey =
      typeof raw.animation?.default === 'string' && stateKeys.includes(raw.animation.default)
        ? raw.animation.default
        : stateKeys[0] ?? ''

    const overlays = parseOverlays(raw.overlays)

    return {
      id: raw.id,
      name: raw.name,
      version: typeof raw.version === 'string' ? raw.version : '1.0',
      avatarMain: typeof raw.avatar?.main === 'string' ? raw.avatar.main : 'avatar.png',
      avatarPreview: typeof raw.avatar?.preview === 'string' ? raw.avatar.preview : undefined,
      defaultState: defaultKey,
      supportedStates: stateKeys,
      animation,
      overlays: overlays && Object.keys(overlays).length > 0 ? overlays : undefined,
      interaction: {
        click: normalizeInteraction(raw.interaction?.click, 'speak'),
        doubleClick: normalizeInteraction(raw.interaction?.doubleClick, 'open_center'),
        rightClick: normalizeInteraction(raw.interaction?.rightClick, 'menu')
      },
      settings: {
        defaultSize:
          typeof raw.settings?.defaultSize === 'number' ? raw.settings.defaultSize : 256,
        allowResize: typeof raw.settings?.allowResize === 'boolean' ? raw.settings.allowResize : true
      }
    }
  } catch {
    return null
  }
}

function parseTimeCondition(value: unknown): OverlayTimeCondition | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { start?: unknown; end?: unknown }
  if (typeof v.start !== 'number' || typeof v.end !== 'number') return null
  if (!Number.isFinite(v.start) || !Number.isFinite(v.end)) return null
  return { start: ((v.start % 24) + 24) % 24, end: ((v.end % 24) + 24) % 24 }
}

function parseOverlayConfig(value: unknown): OverlayConfig | null {
  if (!value || typeof value !== 'object') return null
  const v = value as { condition?: unknown; apply?: unknown }

  let condition: { time: OverlayTimeCondition } | undefined
  if (v.condition !== undefined && v.condition !== null) {
    if (typeof v.condition !== 'object') return null
    const time = parseTimeCondition((v.condition as { time?: unknown }).time)
    if (!time) return null
    condition = { time }
  }

  const apply = v.apply && typeof v.apply === 'object' ? parseOverlayApply(v.apply) : null
  if (!apply) return null

  return { condition, apply }
}

function parseOverlays(raw: unknown): Record<string, OverlayConfig> | null {
  if (!raw || typeof raw !== 'object') return null
  const out: Record<string, OverlayConfig> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = parseOverlayConfig(value)
    if (parsed) out[key] = parsed
  }
  return Object.keys(out).length > 0 ? out : null
}

function parseOverlayApply(raw: unknown): OverlayApplyConfig | null {
  const v = raw as { opacity?: unknown; template?: unknown }
  const apply: OverlayApplyConfig = {}
  if (typeof v.opacity === 'number' && Number.isFinite(v.opacity)) {
    apply.opacity = Math.min(1, Math.max(0, v.opacity))
  }
  if (v.template && typeof v.template === 'object') {
    const t = v.template as { breatheScale?: unknown; floatY?: unknown; speed?: unknown }
    const template: NonNullable<OverlayApplyConfig['template']> = {}
    if (typeof t.breatheScale === 'number' && Number.isFinite(t.breatheScale)) {
      template.breatheScale = Math.min(2, Math.max(0, t.breatheScale))
    }
    if (typeof t.floatY === 'number' && Number.isFinite(t.floatY)) {
      template.floatY = Math.min(2, Math.max(0, t.floatY))
    }
    if (typeof t.speed === 'number' && Number.isFinite(t.speed) && t.speed > 0) {
      template.speed = Math.min(4, Math.max(0.1, t.speed))
    }
    if (Object.keys(template).length > 0) apply.template = template
  }
  return Object.keys(apply).length > 0 ? apply : null
}
