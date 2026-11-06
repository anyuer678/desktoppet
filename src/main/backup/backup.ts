import AdmZip from 'adm-zip'
import { existsSync, readFileSync } from 'fs'
import { isValidScheduleItem } from '../schedule/store'
import { validateAutoReportConfig } from '../stats/autoReportStore'
import { validatePassiveConfig } from '../event/passiveStore'

export const BACKUP_FORMAT = 'desktoppet-config'
export const BACKUP_VERSION = 1
export const BACKUP_ENTRIES = [
  'settings.json',
  'schedules.json',
  'autoReports.json',
  'passiveSources.json'
] as const

export type BackupEntryName = (typeof BACKUP_ENTRIES)[number]

/** 单份配置备份上限：仅为 JSON 配置，远低于此值 */
const MAX_ENTRIES = 20
const MAX_TOTAL_BYTES = 5 * 1024 * 1024

export interface BackupManifest {
  format: string
  version: number
  appVersion: string
  createdAt: string
}

export interface BackupSourcePaths {
  settings: string
  schedules: string
  autoReports: string
  passive: string
}

export interface BackupReadResult {
  ok: boolean
  error?: string
  manifest?: BackupManifest
  files?: Partial<Record<BackupEntryName, string>>
}

function sourcePathOf(paths: BackupSourcePaths, name: BackupEntryName): string {
  switch (name) {
    case 'settings.json':
      return paths.settings
    case 'schedules.json':
      return paths.schedules
    case 'autoReports.json':
      return paths.autoReports
    case 'passiveSources.json':
      return paths.passive
  }
}

function parseJson(text: string): unknown {
  return JSON.parse(text)
}

/** 校验备份内各配置的结构；损坏/类型不符的备份整体拒绝 */
function validateEntry(name: BackupEntryName, text: string): string | null {
  let raw: unknown
  try {
    raw = parseJson(text)
  } catch {
    return `${name} 不是合法 JSON`
  }
  if (name === 'settings.json') {
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? null : 'settings.json 顶层必须是对象'
  }
  if (name === 'schedules.json') {
    if (!Array.isArray(raw)) return 'schedules.json 顶层必须是数组'
    if (!raw.every(isValidScheduleItem)) return 'schedules.json 含非法日程条目'
    return null
  }
  if (name === 'autoReports.json') {
    return validateAutoReportConfig(raw)
  }
  return validatePassiveConfig(raw)
}

/** 导出配置备份（zip；不含统计、角色素材、推送 Token、日志） */
export function createBackupArchive(
  outPath: string,
  sources: BackupSourcePaths,
  appVersion: string,
  now = Date.now()
): { entries: BackupEntryName[] } {
  const zip = new AdmZip()
  const manifest: BackupManifest = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion,
    createdAt: new Date(now).toISOString()
  }
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest, null, 2), 'utf-8'))

  const entries: BackupEntryName[] = []
  for (const name of BACKUP_ENTRIES) {
    const file = sourcePathOf(sources, name)
    if (!existsSync(file)) continue
    zip.addFile(name, readFileSync(file))
    entries.push(name)
  }
  zip.writeZip(outPath)
  return { entries }
}

/** 读取并校验配置备份；条目名/体积/JSON 结构任一非法即整体拒绝 */
export function readBackupArchive(zipPath: string): BackupReadResult {
  let zip: AdmZip
  try {
    zip = new AdmZip(zipPath)
  } catch {
    return { ok: false, error: '无法读取备份文件（损坏或非 zip）' }
  }

  let entries: AdmZip.IZipEntry[]
  try {
    entries = zip.getEntries()
  } catch {
    return { ok: false, error: '无法读取备份条目' }
  }
  if (entries.length > MAX_ENTRIES) return { ok: false, error: '备份条目过多，已拒绝' }
  let total = 0
  for (const entry of entries) {
    if (entry.isDirectory) continue
    if (!['manifest.json', ...BACKUP_ENTRIES].includes(entry.entryName)) {
      return { ok: false, error: `备份包含未知条目：${entry.entryName}` }
    }
    total += entry.header.size
    if (total > MAX_TOTAL_BYTES) return { ok: false, error: '备份体积超限，已拒绝' }
  }

  const manifestEntry = entries.find((e) => e.entryName === 'manifest.json')
  if (!manifestEntry) return { ok: false, error: '备份缺少 manifest.json' }
  let manifest: BackupManifest
  try {
    manifest = JSON.parse(manifestEntry.getData().toString('utf-8')) as BackupManifest
  } catch {
    return { ok: false, error: 'manifest.json 不是合法 JSON' }
  }
  if (manifest.format !== BACKUP_FORMAT) return { ok: false, error: '备份格式不匹配' }
  if (manifest.version !== BACKUP_VERSION) {
    return { ok: false, error: `不支持的备份版本：${String(manifest.version)}` }
  }

  const files: Partial<Record<BackupEntryName, string>> = {}
  for (const name of BACKUP_ENTRIES) {
    const entry = entries.find((e) => e.entryName === name)
    if (!entry) continue
    const text = entry.getData().toString('utf-8')
    const error = validateEntry(name, text)
    if (error) return { ok: false, error }
    files[name] = text
  }
  if (Object.keys(files).length === 0) return { ok: false, error: '备份中没有可导入的配置' }
  return { ok: true, manifest, files }
}
