import AdmZip from 'adm-zip'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  createBackupArchive,
  readBackupArchive,
  type BackupSourcePaths
} from './backup'

function mk(): string {
  return mkdtempSync(join(tmpdir(), 'dp-backup-'))
}

function sources(dir: string): BackupSourcePaths {
  return {
    settings: join(dir, 'settings.json'),
    schedules: join(dir, 'schedules.json'),
    autoReports: join(dir, 'autoReports.json'),
    passive: join(dir, 'passiveSources.json')
  }
}

const validSchedule = [
  {
    id: 'a1',
    title: '喝水',
    message: '',
    type: 'daily',
    trigger: '10:30',
    daysOfWeek: [],
    enabled: true,
    lastFiredAt: null,
    createdAt: 1
  }
]
const validAutoReport = {
  weekly: { enabled: false, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' },
  monthly: { enabled: false, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' }
}
const validPassive = {
  clipboard: { enabled: false, pollMs: 3000, onlyPatterns: [], ignorePatterns: [], maxLen: 120 },
  folder: { enabled: false, dir: '', patterns: ['*'], debounceMs: 500 },
  foreground: { enabled: false, pollMs: 15000, mappings: [] }
}

function writeValidSources(dir: string): void {
  writeFileSync(join(dir, 'settings.json'), JSON.stringify({ size: 300 }))
  writeFileSync(join(dir, 'schedules.json'), JSON.stringify(validSchedule))
  writeFileSync(join(dir, 'autoReports.json'), JSON.stringify(validAutoReport))
  writeFileSync(join(dir, 'passiveSources.json'), JSON.stringify(validPassive))
}

function makeZip(entries: Record<string, string>): string {
  const zip = new AdmZip()
  for (const [name, text] of Object.entries(entries)) zip.addFile(name, Buffer.from(text))
  const file = join(mk(), 'backup.dpbackup')
  zip.writeZip(file)
  return file
}

describe('config backup archive', () => {
  it('round-trip：四份配置完整导出与读取', () => {
    const dir = mk()
    writeValidSources(dir)
    const out = join(dir, 'out.dpbackup')
    const created = createBackupArchive(out, sources(dir), '1.3.0', 1_700_000_000_000)
    expect(created.entries).toEqual([
      'settings.json',
      'schedules.json',
      'autoReports.json',
      'passiveSources.json'
    ])

    const read = readBackupArchive(out)
    expect(read.ok).toBe(true)
    expect(read.manifest).toMatchObject({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      appVersion: '1.3.0'
    })
    expect(JSON.parse(read.files!['settings.json']!)).toEqual({ size: 300 })
    expect(JSON.parse(read.files!['schedules.json']!)).toEqual(validSchedule)
    rmSync(dir, { recursive: true, force: true })
  })

  it('缺少 manifest / 格式或版本不符 → 拒绝', () => {
    const noManifest = makeZip({ 'settings.json': '{}' })
    expect(readBackupArchive(noManifest).error).toContain('manifest')

    const badFormat = makeZip({
      'manifest.json': JSON.stringify({ format: 'other', version: 1, appVersion: 'x', createdAt: '' }),
      'settings.json': '{}'
    })
    expect(readBackupArchive(badFormat).error).toContain('格式')

    const badVersion = makeZip({
      'manifest.json': JSON.stringify({ format: BACKUP_FORMAT, version: 99, appVersion: 'x', createdAt: '' }),
      'settings.json': '{}'
    })
    expect(readBackupArchive(badVersion).error).toContain('版本')
  })

  it('未知条目 / 非法配置结构 → 整体拒绝', () => {
    const manifest = JSON.stringify({ format: BACKUP_FORMAT, version: 1, appVersion: 'x', createdAt: '' })
    const unknown = makeZip({ 'manifest.json': manifest, 'evil.json': '{}' })
    expect(readBackupArchive(unknown).error).toContain('未知条目')

    const badPassive = makeZip({
      'manifest.json': manifest,
      'passiveSources.json': JSON.stringify({ folder: { dir: 'relative' } })
    })
    expect(readBackupArchive(badPassive).ok).toBe(false)

    const badSchedules = makeZip({
      'manifest.json': manifest,
      'schedules.json': JSON.stringify([{ id: 'x' }])
    })
    expect(readBackupArchive(badSchedules).error).toContain('日程')
  })

  it('损坏 zip / 无可导入配置 → 拒绝', () => {
    const dir = mk()
    const broken = join(dir, 'broken.dpbackup')
    writeFileSync(broken, 'not a zip')
    expect(readBackupArchive(broken).ok).toBe(false)

    const manifestOnly = makeZip({
      'manifest.json': JSON.stringify({ format: BACKUP_FORMAT, version: 1, appVersion: 'x', createdAt: '' })
    })
    expect(readBackupArchive(manifestOnly).error).toContain('没有可导入')
    rmSync(dir, { recursive: true, force: true })
  })
})
