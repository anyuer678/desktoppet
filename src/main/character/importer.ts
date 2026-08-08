import AdmZip from 'adm-zip'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { dirname, join, resolve, sep } from 'path'
import { tmpdir } from 'os'
import type { ImportResult } from '../../shared/ipc'
import { isWithinRoot, parseCharacterConfig } from './configReader'

/** 解压资源上限：防 zip bomb（条目数 / 单条目 / 解压总字节） */
export const ARCHIVE_LIMITS = {
  maxEntries: 5000,
  maxEntryBytes: 200 * 1024 * 1024,
  maxTotalBytes: 1024 * 1024 * 1024
} as const

/** Windows 保留设备名（大小写不敏感，含扩展名形式）与 NTFS 数据流 `:` */
const WIN_RESERVED_RE = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

/** 压缩包内条目名规范化：仅允许相对路径，拒绝 ../、绝对路径、空段、Windows 保留名、NTFS ADS */
export function safeEntryName(name: string): string | null {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '')
  if (!normalized) return null
  if (/^[A-Za-z]:/.test(normalized)) return null
  const parts = normalized.split('/')
  if (parts.some((p) => p === '..' || p === '' || WIN_RESERVED_RE.test(p) || p.includes(':'))) {
    return null
  }
  return normalized
}

export function isConfigAtRoot(name: string): boolean {
  return safeEntryName(name) === 'config.json'
}

export function validatePackId(id: string): string | null {
  return /^[a-z0-9_-]+$/.test(id) ? null : '角色 id 只允许小写字母/数字/下划线/短横线'
}

/**
 * 导入角色包（.pet/.zip）：安全解压到临时目录 → 校验 config.json → 移入角色仓库。
 * - overwrite=true 时：若目标角色已存在，先备份旧目录 → 导入新包 → 成功删备份 / 失败恢复旧版
 * - 任一环节失败返回 { ok:false, error }，不污染角色仓库（覆盖失败自动恢复旧版）
 */
export function importPetArchive(
  zipPath: string,
  root: string,
  options?: { overwrite?: boolean }
): ImportResult {
  let zip: AdmZip
  try {
    zip = new AdmZip(zipPath)
  } catch {
    return { ok: false, error: '无法读取压缩包（损坏或非 zip 格式）' }
  }

  const tmp = mkdtempSync(join(tmpdir(), 'dp-import-'))
  try {
    const entries = zip.getEntries()
    if (entries.length > ARCHIVE_LIMITS.maxEntries) {
      return { ok: false, error: `压缩包条目过多（>${ARCHIVE_LIMITS.maxEntries}），已拒绝导入` }
    }
    const hasConfig = entries.some((e) => isConfigAtRoot(e.entryName))
    if (!hasConfig) return { ok: false, error: '压缩包根目录缺少 config.json' }

    const tmpRoot = resolve(tmp)
    let totalBytes = 0
    for (const entry of entries) {
      if (entry.isDirectory) continue
      const rel = safeEntryName(entry.entryName)
      if (!rel) return { ok: false, error: `压缩包包含非法路径: ${entry.entryName}` }
      const target = resolve(tmpRoot, rel)
      if (!isWithinRoot(tmpRoot, target)) {
        return { ok: false, error: `压缩包路径越界: ${entry.entryName}` }
      }
      const size = entry.header.size
      if (size > ARCHIVE_LIMITS.maxEntryBytes || totalBytes + size > ARCHIVE_LIMITS.maxTotalBytes) {
        return { ok: false, error: '压缩包解压体积超限，已拒绝导入（疑似 zip bomb）' }
      }
      totalBytes += size
      mkdirSync(dirname(target), { recursive: true })
      writeFileSync(target, entry.getData())
    }

    const parsed = parseCharacterConfig(join(tmp, 'config.json'))
    if (!parsed) return { ok: false, error: 'config.json 解析失败或缺少 id/name' }
    const idError = validatePackId(parsed.id)
    if (idError) return { ok: false, error: idError }

    const targetDir = resolve(root, parsed.id)
    if (!isWithinRoot(resolve(root), targetDir)) return { ok: false, error: '非法角色目录' }
    if (existsSync(targetDir)) {
      if (!options?.overwrite) {
        return { ok: false, error: `角色「${parsed.id}」已存在，请先删除再导入` }
      }
      // 覆盖模式：备份旧目录 → 导入新包 → 成功删备份 / 失败恢复
      const backupDir = resolve(root, `.${parsed.id}.bak-${Date.now()}`)
      try {
        renameSync(targetDir, backupDir)
      } catch {
        return { ok: false, error: `覆盖导入失败：无法备份旧版角色「${parsed.id}」` }
      }
      try {
        try {
          renameSync(tmp, targetDir)
        } catch {
          copyTree(tmp, targetDir)
        }
        rmSync(backupDir, { recursive: true, force: true })
        return { ok: true, id: parsed.id, name: parsed.name, overwritten: true }
      } catch (importErr) {
        // 导入失败，恢复旧版
        try {
          if (existsSync(targetDir)) rmSync(targetDir, { recursive: true, force: true })
          renameSync(backupDir, targetDir)
        } catch {
          // 恢复也失败（极端情况），保留备份目录供手动恢复
        }
        return { ok: false, error: `覆盖导入失败（已恢复旧版）: ${importErr instanceof Error ? importErr.message : String(importErr)}` }
      }
    }
    mkdirSync(root, { recursive: true })
    try {
      renameSync(tmp, targetDir)
    } catch {
      copyTree(tmp, targetDir)
    }
    return { ok: true, id: parsed.id, name: parsed.name }
  } catch (err) {
    return { ok: false, error: `导入失败: ${err instanceof Error ? err.message : String(err)}` }
  } finally {
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true })
  }
}

function copyTree(from: string, to: string): void {
  mkdirSync(to, { recursive: true })
  for (const name of readdirSync(from)) {
    const src = join(from, name)
    const dest = join(to, name)
    if (statSync(src).isDirectory()) {
      copyTree(src, dest)
    } else {
      copyFileSync(src, dest)
    }
  }
}

/** 删除角色目录；id 校验失败 / 角色不存在返回错误 */
export function deletePetArchive(root: string, id: string): ImportResult {
  const idError = validatePackId(id)
  if (idError) return { ok: false, error: idError }
  const targetDir = resolve(root, id)
  if (!isWithinRoot(resolve(root), targetDir)) return { ok: false, error: '非法角色目录' }
  if (!existsSync(targetDir)) return { ok: false, error: `角色「${id}」不存在` }
  rmSync(targetDir, { recursive: true, force: true })
  return { ok: true, id }
}

/** 角色目录 → .pet 压缩包（zip，config.json 位于根）。id/目录不存在返回错误。 */
export function exportPetArchive(root: string, id: string, outPath: string): ImportResult {
  const idError = validatePackId(id)
  if (idError) return { ok: false, error: idError }
  const packDir = resolve(root, id)
  if (!isWithinRoot(resolve(root), packDir)) return { ok: false, error: '非法角色目录' }
  if (!existsSync(packDir)) return { ok: false, error: `角色「${id}」不存在` }
  const configPath = join(packDir, 'config.json')
  if (!existsSync(configPath)) return { ok: false, error: `角色「${id}」缺少 config.json，无法打包` }
  try {
    const zip = new AdmZip()
    zip.addLocalFolder(packDir, '')
    zip.writeZip(outPath)
    return { ok: true, id, path: outPath }
  } catch (err) {
    return { ok: false, error: `导出失败: ${err instanceof Error ? err.message : String(err)}` }
  }
}

/** 由角色 id 生成建议包名：<id>-v<version>.pet（版本号做安全化处理） */
export function suggestPackFileName(root: string, id: string): string {
  let version = '1.0'
  const parsed = parseCharacterConfig(join(resolve(root, id), 'config.json'))
  if (parsed) version = parsed.version
  const safeVersion = version.replace(/[^A-Za-z0-9._-]/g, '_')
  return `${id}-v${safeVersion}.pet`
}