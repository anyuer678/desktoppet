import AdmZip from 'adm-zip'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import {
  deletePetArchive,
  exportPetArchive,
  importPetArchive,
  isConfigAtRoot,
  safeEntryName,
  suggestPackFileName,
  validatePackId
} from './importer'

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function makeZip(entries: Record<string, Buffer | string>): string {
  const zip = new AdmZip()
  for (const [name, data] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(data))
  }
  const path = join(tempDir('dp-zip-'), 'pack.pet')
  zip.writeZip(path)
  return path
}

function crc32(buf: Buffer): number {
  const table: number[] = []
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

/** 手工构造 ZIP（store 无压缩），可写入 adm-zip 会净化的穿越条目名 */
function buildZipRaw(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = []
  const centralParts: Buffer[] = []
  let offset = 0
  for (const [name, data] of Object.entries(entries)) {
    const nameBuf = Buffer.from(name, 'utf-8')
    const dataBuf = Buffer.from(data)
    const crc = crc32(dataBuf)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(0, 8)
    local.writeUInt32LE(crc, 14)
    local.writeUInt32LE(dataBuf.length, 18)
    local.writeUInt32LE(dataBuf.length, 22)
    local.writeUInt16LE(nameBuf.length, 26)
    localParts.push(local, nameBuf, dataBuf)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    central.writeUInt16LE(20, 6)
    central.writeUInt32LE(crc, 16)
    central.writeUInt32LE(dataBuf.length, 20)
    central.writeUInt32LE(dataBuf.length, 24)
    central.writeUInt16LE(nameBuf.length, 28)
    central.writeUInt32LE(offset, 42)
    centralParts.push(central, nameBuf)
    offset += 30 + nameBuf.length + dataBuf.length
  }
  const centralSize = centralParts.reduce((a, p) => a + p.length, 0)
  const centralStart = offset
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(Object.keys(entries).length, 8)
  eocd.writeUInt16LE(Object.keys(entries).length, 10)
  eocd.writeUInt32LE(centralSize, 12)
  eocd.writeUInt32LE(centralStart, 16)
  return Buffer.concat([...localParts, ...centralParts, eocd])
}

const GOOD_CONFIG = JSON.stringify({
  id: 'doggo',
  name: '狗狗',
  version: '1.0',
  animation: { default: 'idle', states: { idle: { type: 'template' } } }
})

describe('safeEntryName', () => {
  it('相对路径保留', () => {
    expect(safeEntryName('config.json')).toBe('config.json')
    expect(safeEntryName('animations/idle/000.png')).toBe('animations/idle/000.png')
    expect(safeEntryName('a\\b.png')).toBe('a/b.png')
    expect(safeEntryName('/leading/slash.png')).toBe('leading/slash.png')
  })

  it('拒绝路径穿越与绝对路径', () => {
    expect(safeEntryName('../evil.png')).toBeNull()
    expect(safeEntryName('a/../../evil.png')).toBeNull()
    expect(safeEntryName('C:/evil.png')).toBeNull()
    expect(safeEntryName('a//b.png')).toBeNull()
    expect(safeEntryName('')).toBeNull()
  })
  it('拒绝 Windows 保留设备名与 NTFS ADS', () => {
    expect(safeEntryName('CON')).toBeNull()
    expect(safeEntryName('con.txt')).toBeNull()
    expect(safeEntryName('NUL')).toBeNull()
    expect(safeEntryName('aux.log')).toBeNull()
    expect(safeEntryName('com1')).toBeNull()
    expect(safeEntryName('lpt3.bin')).toBeNull()
    expect(safeEntryName('pic.png:evil')).toBeNull()
  })
})

describe('isConfigAtRoot', () => {
  it('仅根目录 config.json 命中', () => {
    expect(isConfigAtRoot('config.json')).toBe(true)
    expect(isConfigAtRoot('sub/config.json')).toBe(false)
    expect(isConfigAtRoot('config.json.bak')).toBe(false)
  })
})

describe('validatePackId', () => {
  it('合法 id 通过，非法拒绝', () => {
    expect(validatePackId('rabbit')).toBeNull()
    expect(validatePackId('a-b_c1')).toBeNull()
    expect(validatePackId('Bad ID')).not.toBeNull()
    expect(validatePackId('../evil')).not.toBeNull()
  })
})

describe('importPetArchive', () => {
  it('导入合法角色包并解压资源', () => {
    const root = tempDir('dp-root-')
    const zip = makeZip({
      'config.json': GOOD_CONFIG,
      'avatar.png': 'PNG',
      'animations/idle/000.png': 'FRAME'
    })
    const result = importPetArchive(zip, root)
    expect(result).toEqual({ ok: true, id: 'doggo', name: '狗狗' })
    expect(readFileSync(join(root, 'doggo', 'config.json'), 'utf-8')).toBe(GOOD_CONFIG)
    expect(readFileSync(join(root, 'doggo', 'avatar.png'), 'utf-8')).toBe('PNG')
    expect(readFileSync(join(root, 'doggo', 'animations', 'idle', '000.png'), 'utf-8')).toBe('FRAME')
    rmSync(root, { recursive: true, force: true })
  })

  it('缺少 config.json 拒绝导入', () => {
    const root = tempDir('dp-root-')
    const zip = makeZip({ 'avatar.png': 'PNG' })
    const result = importPetArchive(zip, root)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('config.json')
    expect(existsSync(join(root, 'doggo'))).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })

  it('拒绝 zip-slip 条目', () => {
    const root = tempDir('dp-root-')
    const zipPath = join(tempDir('dp-zip-'), 'slip.pet')
    writeFileSync(zipPath, buildZipRaw({ 'config.json': GOOD_CONFIG, '../evil.txt': 'PWN' }))
    const result = importPetArchive(zipPath, root)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('非法路径')
    expect(existsSync(join(root, 'doggo'))).toBe(false)
    expect(existsSync(join(root, '..', 'evil.txt'))).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })

  it('重复导入同一角色被拒绝', () => {
    const root = tempDir('dp-root-')
    const zip = makeZip({ 'config.json': GOOD_CONFIG })
    expect(importPetArchive(zip, root).ok).toBe(true)
    const second = importPetArchive(zip, root)
    expect(second.ok).toBe(false)
    expect(second.error).toContain('已存在')
    rmSync(root, { recursive: true, force: true })
  })

  it('overwrite=true 覆盖升级已存在角色', () => {
    const root = tempDir('dp-root-')
    const zip = makeZip({ 'config.json': GOOD_CONFIG })
    expect(importPetArchive(zip, root).ok).toBe(true)
    // 修改 config 版本号后重新打包，模拟升级
    const upgradedConfig = JSON.stringify({ ...JSON.parse(GOOD_CONFIG), version: '2.0' })
    const zip2 = makeZip({ 'config.json': upgradedConfig })
    const result = importPetArchive(zip2, root, { overwrite: true })
    expect(result.ok).toBe(true)
    expect(result.overwritten).toBe(true)
    // 验证新版本已写入
    const config = JSON.parse(readFileSync(join(root, 'doggo', 'config.json'), 'utf-8'))
    expect(config.version).toBe('2.0')
    // 验证备份目录已被清理
    const dirs = readdirSync(root).filter((d) => d.startsWith('.doggo.bak-'))
    expect(dirs).toHaveLength(0)
    rmSync(root, { recursive: true, force: true })
  })

  it('overwrite=false 等同于默认拒绝', () => {
    const root = tempDir('dp-root-')
    const zip = makeZip({ 'config.json': GOOD_CONFIG })
    expect(importPetArchive(zip, root).ok).toBe(true)
    const second = importPetArchive(zip, root, { overwrite: false })
    expect(second.ok).toBe(false)
    expect(second.error).toContain('已存在')
    rmSync(root, { recursive: true, force: true })
  })

  it('非法 id 拒绝导入', () => {
    const root = tempDir('dp-root-')
    const zip = makeZip({
      'config.json': JSON.stringify({
        id: 'Bad ID!',
        name: '坏包',
        animation: { default: 'idle', states: { idle: { type: 'template' } } }
      })
    })
    const result = importPetArchive(zip, root)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('id')
    rmSync(root, { recursive: true, force: true })
  })

  it('损坏的压缩包返回错误', () => {
    const root = tempDir('dp-root-')
    const bad = join(tempDir('dp-zip-'), 'bad.pet')
    mkdirSync(join(root, 'x'))
    writeFileSync(bad, 'not a zip at all')
    const result = importPetArchive(bad, root)
    expect(result.ok).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })
})

describe('deletePetArchive', () => {
  it('删除已导入角色', () => {
    const root = tempDir('dp-root-')
    const zip = makeZip({ 'config.json': GOOD_CONFIG })
    expect(importPetArchive(zip, root).ok).toBe(true)
    expect(existsSync(join(root, 'doggo'))).toBe(true)
    const result = deletePetArchive(root, 'doggo')
    expect(result).toEqual({ ok: true, id: 'doggo' })
    expect(existsSync(join(root, 'doggo'))).toBe(false)
    rmSync(root, { recursive: true, force: true })
  })

  it('删除不存在的角色返回错误', () => {
    const root = tempDir('dp-root-')
    const result = deletePetArchive(root, 'ghost')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('不存在')
    rmSync(root, { recursive: true, force: true })
  })

  it('非法 id 拒绝删除', () => {
    const root = tempDir('dp-root-')
    const result = deletePetArchive(root, '../evil')
    expect(result.ok).toBe(false)
    expect(result.error).toContain('id')
    rmSync(root, { recursive: true, force: true })
  })

  it('删除不影响其他角色', () => {
    const root = tempDir('dp-root-')
    const zip = makeZip({ 'config.json': GOOD_CONFIG })
    expect(importPetArchive(zip, root).ok).toBe(true)
    expect(importPetArchive(makeZip({ 'config.json': GOOD_CONFIG.replace('doggo', 'cat') }), root).ok).toBe(true)
    deletePetArchive(root, 'doggo')
    expect(existsSync(join(root, 'doggo'))).toBe(false)
    expect(existsSync(join(root, 'cat'))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })
})

describe('exportPetArchive', () => {
  it('打包角色目录为 .pet（config.json 位于根，资源齐全）', () => {
    const root = tempDir('dp-root-')
    const zip = makeZip({
      'config.json': GOOD_CONFIG,
      'avatar.png': 'PNG',
      'animations/idle/000.png': 'FRAME'
    })
    expect(importPetArchive(zip, root).ok).toBe(true)
    const out = join(tempDir('dp-out-'), 'doggo.pet')
    const result = exportPetArchive(root, 'doggo', out)
    expect(result.ok).toBe(true)
    expect(result.path).toBe(out)
    const read = new AdmZip(out)
    const names = read.getEntries().map((e) => e.entryName)
    expect(names).toContain('config.json')
    expect(names).toContain('avatar.png')
    expect(names).toContain('animations/idle/000.png')
    expect(read.getEntry('config.json')?.getData().toString('utf-8')).toBe(GOOD_CONFIG)
    rmSync(root, { recursive: true, force: true })
  })

  it('非法 id 拒绝打包', () => {
    const root = tempDir('dp-root-')
    const result = exportPetArchive(root, '../evil', join(tempDir('dp-out-'), 'x.pet'))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('id')
    rmSync(root, { recursive: true, force: true })
  })

  it('角色不存在拒绝打包', () => {
    const root = tempDir('dp-root-')
    const result = exportPetArchive(root, 'ghost', join(tempDir('dp-out-'), 'x.pet'))
    expect(result.ok).toBe(false)
    expect(result.error).toContain('不存在')
    rmSync(root, { recursive: true, force: true })
  })

  it('导出包可被重新导入（往返一致）', () => {
    const root = tempDir('dp-root-')
    const zip = makeZip({ 'config.json': GOOD_CONFIG, 'avatar.png': 'PNG' })
    expect(importPetArchive(zip, root).ok).toBe(true)
    const out = join(tempDir('dp-out-'), 'doggo.pet')
    expect(exportPetArchive(root, 'doggo', out).ok).toBe(true)
    deletePetArchive(root, 'doggo')
    const reimport = importPetArchive(out, root)
    expect(reimport).toEqual({ ok: true, id: 'doggo', name: '狗狗' })
    expect(readFileSync(join(root, 'doggo', 'avatar.png'), 'utf-8')).toBe('PNG')
    rmSync(root, { recursive: true, force: true })
  })
})

describe('suggestPackFileName', () => {
  it('用 config 版本生成包名', () => {
    const root = tempDir('dp-root-')
    const zip = makeZip({ 'config.json': GOOD_CONFIG })
    expect(importPetArchive(zip, root).ok).toBe(true)
    expect(suggestPackFileName(root, 'doggo')).toBe('doggo-v1.0.pet')
    rmSync(root, { recursive: true, force: true })
  })

  it('版本号非法字符安全化', () => {
    const root = tempDir('dp-root-')
    const zip = makeZip({
      'config.json': GOOD_CONFIG.replace('"version":"1.0"', '"version":"1.0-beta 2!"')
    })
    expect(importPetArchive(zip, root).ok).toBe(true)
    expect(suggestPackFileName(root, 'doggo')).toBe('doggo-v1.0-beta_2_.pet')
    rmSync(root, { recursive: true, force: true })
  })

  it('config 缺失时回退 1.0', () => {
    const root = tempDir('dp-root-')
    mkdirSync(join(root, 'bare'), { recursive: true })
    expect(suggestPackFileName(root, 'bare')).toBe('bare-v1.0.pet')
    rmSync(root, { recursive: true, force: true })
  })
})
