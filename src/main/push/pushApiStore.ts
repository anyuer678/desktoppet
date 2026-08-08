import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import { dirname } from 'path'
import type { PushApiConfig } from '../../shared/ipc'

export const DEFAULT_PUSH_API_CONFIG: PushApiConfig = {
  enabled: true,
  token: ''
}

export function loadPushApiConfig(filePath: string): PushApiConfig {
  try {
    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<PushApiConfig>
    return {
      enabled: typeof raw.enabled === 'boolean' ? raw.enabled : DEFAULT_PUSH_API_CONFIG.enabled,
      token: typeof raw.token === 'string' ? raw.token : DEFAULT_PUSH_API_CONFIG.token
    }
  } catch {
    return { ...DEFAULT_PUSH_API_CONFIG }
  }
}

export function savePushApiConfig(filePath: string, cfg: PushApiConfig): void {
  try {
    mkdirSync(dirname(filePath), { recursive: true })
    const temp = `${filePath}.tmp`
    writeFileSync(temp, JSON.stringify(cfg, null, 2), 'utf-8')
    renameSync(temp, filePath)
  } catch (err) {
    console.error('[pushApi] save failed:', err)
  }
}

export function validatePushApiConfig(cfg: unknown): string | null {
  if (!cfg || typeof cfg !== 'object') return '推送配置为空'
  const c = cfg as Record<string, unknown>
  if (typeof c.enabled !== 'boolean') return 'enabled 必须为布尔'
  if (typeof c.token !== 'string' || !/^[0-9a-f]{32}$/.test(c.token)) {
    return 'token 必须为 32 位十六进制字符串'
  }
  return null
}