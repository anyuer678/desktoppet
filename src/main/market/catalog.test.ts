import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { readMarketCatalog, installMarketEntry, findMarketEntry } from './catalog'
import { exportPetArchive } from '../character/importer'

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

const GOOD_CONFIG = JSON.stringify({
  id: 'doggo',
  name: '狗狗',
  version: '1.0',
  animation: { default: 'idle', states: { idle: { type: 'template' } } }
})

function makePet(root: string, id: string, config: string): string {
  const dir = join(root, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'config.json'), config)
  writeFileSync(join(dir, 'avatar.png'), 'PNG')
  const out = join(root, `${id}.pet`)
  const result = exportPetArchive(root, id, out)
  if (!result.ok) throw new Error('makePet failed')
  return out
}

function writeManifest(dir: string, entries: unknown[]): void {
  writeFileSync(join(dir, 'market.json'), JSON.stringify(entries, null, 2))
}

describe('readMarketCatalog', () => {
  it('manifest 不存在返回空数组', () => {
    const dir = tempDir('dp-mkt-')
    expect(readMarketCatalog(dir)).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it('读取并校验合法条目', () => {
    const dir = tempDir('dp-mkt-')
    writeManifest(dir, [
      {
        id: 'rabbit',
        name: '兔兔',
        author: '官方',
        description: '示例',
        version: '1.2',
        preview: 'rabbit.png',
        source: 'rabbit.pet'
      }
    ])
    const catalog = readMarketCatalog(dir)
    expect(catalog).toHaveLength(1)
    expect(catalog[0].id).toBe('rabbit')
    expect(catalog[0].name).toBe('兔兔')
    rmSync(dir, { recursive: true, force: true })
  })

  it('跳过字段缺失的非法条目', () => {
    const dir = tempDir('dp-mkt-')
    writeManifest(dir, [
      { id: 'ok', name: 'OK', author: 'a', description: 'd', version: '1', preview: 'p', source: 'ok.pet' },
      { id: 'bad', name: 'Bad' },
      { name: 'NoId', author: 'a', description: 'd', version: '1', preview: 'p', source: 'x.pet' }
    ])
    expect(readMarketCatalog(dir)).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('跳过 source 越界的条目（路径穿越防护）', () => {
    const dir = tempDir('dp-mkt-')
    writeManifest(dir, [
      {
        id: 'evil',
        name: 'Evil',
        author: 'x',
        description: 'd',
        version: '1',
        preview: 'p',
        source: '../../../etc/passwd'
      }
    ])
    expect(readMarketCatalog(dir)).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it('manifest 不是数组返回空', () => {
    const dir = tempDir('dp-mkt-')
    writeFileSync(join(dir, 'market.json'), JSON.stringify({ not: 'array' }))
    expect(readMarketCatalog(dir)).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })

  it('manifest 损坏 JSON 返回空', () => {
    const dir = tempDir('dp-mkt-')
    writeFileSync(join(dir, 'market.json'), '{ broken')
    expect(readMarketCatalog(dir)).toEqual([])
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('findMarketEntry', () => {
  it('按 id 查找，不存在返回 null', () => {
    const dir = tempDir('dp-mkt-')
    writeManifest(dir, [
      { id: 'rabbit', name: '兔兔', author: 'a', description: 'd', version: '1', preview: 'p', source: 'r.pet' }
    ])
    expect(findMarketEntry(dir, 'rabbit')?.name).toBe('兔兔')
    expect(findMarketEntry(dir, 'ghost')).toBeNull()
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('installMarketEntry', () => {
  it('成功安装市场条目到角色仓库', () => {
    const marketDir = tempDir('dp-mkt-')
    const charsRoot = tempDir('dp-chars-')
    // 在 marketDir 内准备一个 .pet
    const petPath = makePet(marketDir, 'doggo', GOOD_CONFIG)
    writeManifest(marketDir, [
      {
        id: 'doggo',
        name: '狗狗',
        author: '官方',
        description: '测试',
        version: '1.0',
        preview: 'doggo.png',
        source: 'doggo.pet'
      }
    ])
    const result = installMarketEntry(marketDir, 'doggo', charsRoot)
    expect(result.ok).toBe(true)
    expect(result.id).toBe('doggo')
    expect(existsSync(join(charsRoot, 'doggo', 'config.json'))).toBe(true)
    rmSync(marketDir, { recursive: true, force: true })
    rmSync(charsRoot, { recursive: true, force: true })
  })

  it('条目不存在返回错误', () => {
    const marketDir = tempDir('dp-mkt-')
    const charsRoot = tempDir('dp-chars-')
    writeManifest(marketDir, [])
    const result = installMarketEntry(marketDir, 'ghost', charsRoot)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('不存在')
    rmSync(marketDir, { recursive: true, force: true })
    rmSync(charsRoot, { recursive: true, force: true })
  })

  it('source 文件不存在返回错误', () => {
    const marketDir = tempDir('dp-mkt-')
    const charsRoot = tempDir('dp-chars-')
    writeManifest(marketDir, [
      {
        id: 'doggo',
        name: '狗狗',
        author: 'a',
        description: 'd',
        version: '1',
        preview: 'p',
        source: 'missing.pet'
      }
    ])
    const result = installMarketEntry(marketDir, 'doggo', charsRoot)
    expect(result.ok).toBe(false)
    expect(result.error).toContain('不存在')
    rmSync(marketDir, { recursive: true, force: true })
    rmSync(charsRoot, { recursive: true, force: true })
  })

  it('重复安装触发覆盖升级（overwrite=true）', () => {
    const marketDir = tempDir('dp-mkt-')
    const charsRoot = tempDir('dp-chars-')
    makePet(marketDir, 'doggo', GOOD_CONFIG)
    writeManifest(marketDir, [
      {
        id: 'doggo',
        name: '狗狗',
        author: 'a',
        description: 'd',
        version: '1',
        preview: 'p',
        source: 'doggo.pet'
      }
    ])
    expect(installMarketEntry(marketDir, 'doggo', charsRoot).ok).toBe(true)
    const second = installMarketEntry(marketDir, 'doggo', charsRoot)
    expect(second.ok).toBe(true)
    expect(second.overwritten).toBe(true)
    rmSync(marketDir, { recursive: true, force: true })
    rmSync(charsRoot, { recursive: true, force: true })
  })
})
