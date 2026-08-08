import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, resolve } from 'path'
import type { PluginEventDecl, PluginManifest, PluginInfo } from '../../shared/ipc'
import type { PetEvent } from '../event/eventCenter'

/** 校验并规范化插件事件声明 */
function validateEventDecl(raw: unknown): PluginEventDecl | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (typeof e.type !== 'string' || e.type === '') return null
  if (typeof e.priority !== 'number' || e.priority < 0 || e.priority > 100) return null
  if (typeof e.durationMs !== 'number' || e.durationMs <= 0) return null
  return { type: e.type, priority: e.priority, durationMs: e.durationMs }
}

/** 校验插件 manifest（plugin.json） */
function validateManifest(raw: unknown): PluginManifest | null {
  if (!raw || typeof raw !== 'object') return null
  const m = raw as Record<string, unknown>
  if (typeof m.id !== 'string' || !/^[a-z0-9_-]+$/.test(m.id)) return null
  if (typeof m.name !== 'string' || m.name === '') return null
  if (typeof m.version !== 'string') return null
  if (typeof m.description !== 'string') return null
  if (!Array.isArray(m.events)) return null
  const events: PluginEventDecl[] = []
  for (const item of m.events) {
    const decl = validateEventDecl(item)
    if (!decl) continue // 跳过非法事件声明
    events.push(decl)
  }
  return { id: m.id, name: m.name, version: m.version, description: m.description, events }
}

/**
 * 从插件目录加载所有合法插件 manifest。
 * - pluginsDir 不存在 → 空数组
 * - 每个子目录需包含 plugin.json
 * - manifest 字段非法的插件被跳过（不中断其他插件）
 */
export function loadPlugins(pluginsDir: string): PluginManifest[] {
  if (!existsSync(pluginsDir)) return []
  const out: PluginManifest[] = []
  let entries: string[]
  try {
    entries = readdirSync(pluginsDir)
  } catch {
    return []
  }
  for (const name of entries) {
    const dir = join(pluginsDir, name)
    try {
      if (!statSync(dir).isDirectory()) continue
    } catch {
      continue
    }
    const manifestPath = join(dir, 'plugin.json')
    if (!existsSync(manifestPath)) continue
    try {
      const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
      const manifest = validateManifest(raw)
      if (manifest) out.push(manifest)
    } catch {
      // JSON 解析失败，跳过
    }
  }
  return out
}

/** 将插件 manifest 的事件声明转为 PetEvent 列表（source = plugin:<id>） */
export function pluginEventsToPetEvents(plugins: PluginManifest[], now: number): PetEvent[] {
  const out: PetEvent[] = []
  for (const plugin of plugins) {
    for (const decl of plugin.events) {
      out.push({
        source: `plugin:${plugin.id}`,
        type: decl.type,
        priority: decl.priority,
        durationMs: decl.durationMs,
        occurredAt: now
      })
    }
  }
  return out
}

/** 将 manifest 列表转为 IPC 返回的 PluginInfo 列表 */
export function toPluginInfo(plugins: PluginManifest[]): PluginInfo[] {
  return plugins.map((p) => ({
    id: p.id,
    name: p.name,
    version: p.version,
    description: p.description,
    eventCount: p.events.length,
    enabled: true
  }))
}
