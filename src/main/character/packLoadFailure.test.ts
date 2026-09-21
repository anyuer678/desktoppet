import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import AdmZip from 'adm-zip'
import { describe, expect, it } from 'vitest'
import { listCharacters, readCharacterDetail } from './configReader'
import { importPetArchive, validatePackId } from './importer'
import type { CharacterLoaded } from '../../shared/ipc'

/** 与 src/main/ipc/characterIpc.ts 的 character:get 失败分支同构（无 Electron） */
function loadCharacterOrFailure(root: string, id: string): CharacterLoaded | NonNullable<ReturnType<typeof readCharacterDetail>> {
  const idError = validatePackId(id)
  if (idError) return { id, ok: false, error: idError }
  const detail = readCharacterDetail(root, id)
  return detail ?? { id, ok: false, error: '角色包加载失败或不存在' }
}

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'dp-pack-fail-'))
}

function writePack(root: string, id: string, config: unknown): void {
  const dir = join(root, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'config.json'), typeof config === 'string' ? config : JSON.stringify(config))
}

function makeZipPath(entries: Record<string, string>): string {
  const zip = new AdmZip()
  for (const [name, data] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(data, 'utf-8'))
  }
  const path = join(mkdtempSync(join(tmpdir(), 'dp-zip-fail-')), 'pack.pet')
  zip.writeZip(path)
  return path
}

function isFailure(r: unknown): r is CharacterLoaded {
  return typeof r === 'object' && r !== null && (r as CharacterLoaded).ok === false
}

describe('角色包加载失败路径（headless smoke）', () => {
  it('不存在的角色 → CharacterLoaded {ok:false}，不抛异常', () => {
    const root = tempRoot()
    const r = loadCharacterOrFailure(root, 'ghost-pet')
    expect(isFailure(r)).toBe(true)
    if (isFailure(r)) {
      expect(r.id).toBe('ghost-pet')
      expect(r.error).toMatch(/加载失败|不存在/)
    }
    rmSync(root, { recursive: true, force: true })
  })

  it('非法 id（大写/路径穿越）→ 校验错误，不读盘', () => {
    const root = tempRoot()
    for (const bad of ['../evil', 'RABBIT', 'has space', 'x/../y']) {
      const r = loadCharacterOrFailure(root, bad)
      expect(isFailure(r)).toBe(true)
      if (isFailure(r)) expect(r.ok).toBe(false)
    }
    rmSync(root, { recursive: true, force: true })
  })

  it('config.json 损坏 / 缺 id/name → list 跳过且 get 失败', () => {
    const root = tempRoot()
    writePack(root, 'broken', '{not-json')
    writePack(root, 'noid', { name: '无 ID' })
    writePack(root, 'noname', { id: 'noname' })
    expect(listCharacters(root)).toHaveLength(0)
    for (const id of ['broken', 'noid', 'noname']) {
      const r = loadCharacterOrFailure(root, id)
      expect(isFailure(r)).toBe(true)
    }
    rmSync(root, { recursive: true, force: true })
  })

  it('合法包加载成功：返回 CharacterDetail 而非 failure', () => {
    const root = tempRoot()
    writePack(root, 'ok-pet', {
      id: 'ok-pet',
      name: '正常角色',
      animation: { default: 'idle', states: { idle: { type: 'template' } } }
    })
    const r = loadCharacterOrFailure(root, 'ok-pet')
    expect(isFailure(r)).toBe(false)
    expect(r).toMatchObject({ id: 'ok-pet', name: '正常角色' })
    rmSync(root, { recursive: true, force: true })
  })

  it('import 损坏 zip → ImportResult ok:false 且仓库无污染', () => {
    const root = tempRoot()
    const badPath = join(mkdtempSync(join(tmpdir(), 'dp-bad-zip-')), 'bad.pet')
    writeFileSync(badPath, 'not a zip at all')
    const res = importPetArchive(badPath, root)
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
    expect(listCharacters(root)).toHaveLength(0)
    rmSync(root, { recursive: true, force: true })
  })

  it('import 缺 config.json → 拒绝导入', () => {
    const root = tempRoot()
    const zipPath = makeZipPath({ 'readme.txt': 'hello' })
    const res = importPetArchive(zipPath, root)
    expect(res.ok).toBe(false)
    expect(res.error).toMatch(/config\.json/)
    rmSync(root, { recursive: true, force: true })
  })

  it('import config 解析失败 → 拒绝导入', () => {
    const root = tempRoot()
    const zipPath = makeZipPath({ 'config.json': '{bad' })
    const res = importPetArchive(zipPath, root)
    expect(res.ok).toBe(false)
    expect(listCharacters(root)).toHaveLength(0)
    rmSync(root, { recursive: true, force: true })
  })
})
