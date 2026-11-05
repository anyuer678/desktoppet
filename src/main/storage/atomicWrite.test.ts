import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { writeFileAtomic } from './atomicWrite'

describe('writeFileAtomic', () => {
  it('写入内容并自动创建父目录，不残留临时文件', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dp-atomic-'))
    const file = join(dir, 'nested', 'data.json')
    writeFileAtomic(file, '{"ok":true}')
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({ ok: true })
    expect(readdirSync(join(dir, 'nested'))).toEqual(['data.json'])
    rmSync(dir, { recursive: true, force: true })
  })

  it('覆盖已有文件时内容完整替换', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dp-atomic-'))
    const file = join(dir, 'data.txt')
    writeFileAtomic(file, 'first')
    writeFileAtomic(file, 'second')
    expect(readFileSync(file, 'utf-8')).toBe('second')
    expect(readdirSync(dir)).toEqual(['data.txt'])
    rmSync(dir, { recursive: true, force: true })
  })

  it('父路径是文件时抛错且不留下半成品', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dp-atomic-'))
    const blocker = join(dir, 'blocker')
    writeFileAtomic(blocker, 'x')
    expect(() => writeFileAtomic(join(blocker, 'child.json'), 'y')).toThrow()
    expect(existsSync(blocker)).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})
