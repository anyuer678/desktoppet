import { existsSync, readFileSync } from 'fs'
import { resolve } from 'path'
import type { ImportResult, MarketEntry } from '../../shared/ipc'
import { isWithinRoot } from '../character/configReader'
import { importPetArchive } from '../character/importer'

/** 校验 manifest 单项必填字段 */
function validateEntry(raw: unknown): MarketEntry | null {
  if (!raw || typeof raw !== 'object') return null
  const e = raw as Record<string, unknown>
  if (
    typeof e.id !== 'string' || e.id === '' ||
    typeof e.name !== 'string' ||
    typeof e.author !== 'string' ||
    typeof e.description !== 'string' ||
    typeof e.version !== 'string' ||
    typeof e.preview !== 'string' ||
    typeof e.source !== 'string' || e.source === ''
  ) {
    return null
  }
  return {
    id: e.id,
    name: e.name,
    author: e.author,
    description: e.description,
    version: e.version,
    preview: e.preview,
    source: e.source
  }
}

/**
 * 读取市场目录下的 market.json 并校验。
 * - market.json 不存在 → 空数组
 * - source 必须是相对路径且解析后落在 marketDir 内（防穿越）
 * - 单项字段不合法则跳过（不报错中断）
 */
export function readMarketCatalog(marketDir: string): MarketEntry[] {
  const manifestPath = resolve(marketDir, 'market.json')
  if (!existsSync(manifestPath)) return []
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    if (!Array.isArray(raw)) return []
    const out: MarketEntry[] = []
    for (const item of raw) {
      const entry = validateEntry(item)
      if (!entry) continue
      const sourcePath = resolve(marketDir, entry.source)
      if (!isWithinRoot(marketDir, sourcePath)) continue
      out.push(entry)
    }
    return out
  } catch {
    return []
  }
}

/** 在目录中按 id 查找条目 */
export function findMarketEntry(marketDir: string, entryId: string): MarketEntry | null {
  return readMarketCatalog(marketDir).find((e) => e.id === entryId) ?? null
}

/**
 * 安装市场条目：解析 source 路径 → 复用 importPetArchive 安全导入。
 * - 角色已存在时自动覆盖升级（备份旧版 → 导入新版 → 失败自动恢复）
 * - source 不存在 / 越界 / 导入失败均返回 { ok:false, error }
 */
export function installMarketEntry(
  marketDir: string,
  entryId: string,
  charactersRoot: string
): ImportResult {
  const entry = findMarketEntry(marketDir, entryId)
  if (!entry) return { ok: false, error: `市场条目「${entryId}」不存在` }
  const sourcePath = resolve(marketDir, entry.source)
  if (!isWithinRoot(marketDir, sourcePath)) {
    return { ok: false, error: '市场条目 source 路径越界' }
  }
  if (!existsSync(sourcePath)) {
    return { ok: false, error: `角色包文件不存在：${entry.source}` }
  }
  return importPetArchive(sourcePath, charactersRoot, { overwrite: true })
}
