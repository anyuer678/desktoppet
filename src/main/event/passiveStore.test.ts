import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PASSIVE_SOURCES_CONFIG,
  loadPassiveConfig,
  savePassiveConfig,
  validatePassiveConfig
} from './passiveStore'

describe('passiveStore', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'passive-'))
    file = join(dir, 'passiveSources.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('默认值：结构完整（三节、字段齐全、值正确）', () => {
    expect(DEFAULT_PASSIVE_SOURCES_CONFIG).toEqual({
      clipboard: {
        enabled: false,
        pollMs: 3000,
        onlyPatterns: [],
        ignorePatterns: ['^\\d+$', '^\\s*$'],
        maxLen: 120
      },
      folder: { enabled: false, dir: '', patterns: ['*'], debounceMs: 500 },
      foreground: { enabled: false, pollMs: 15000, mappings: [] }
    })
  })

  it('文件不存在 → 返回默认值', () => {
    expect(loadPassiveConfig(join(dir, 'missing.json'))).toEqual(DEFAULT_PASSIVE_SOURCES_CONFIG)
  })

  it('缺字段逐项补默认', () => {
    writeFileSync(file, JSON.stringify({ clipboard: { enabled: false } }), 'utf-8')
    const cfg = loadPassiveConfig(file)
    expect(cfg.clipboard.enabled).toBe(false)
    expect(cfg.clipboard.pollMs).toBe(3000)
    expect(cfg.clipboard.onlyPatterns).toEqual([])
    expect(cfg.clipboard.ignorePatterns).toEqual(['^\\d+$', '^\\s*$'])
    expect(cfg.clipboard.maxLen).toBe(120)
    expect(cfg.folder).toEqual(DEFAULT_PASSIVE_SOURCES_CONFIG.folder)
    expect(cfg.foreground).toEqual(DEFAULT_PASSIVE_SOURCES_CONFIG.foreground)
  })

  it('损坏 JSON → 返回默认值', () => {
    writeFileSync(file, '{broken', 'utf-8')
    expect(loadPassiveConfig(file)).toEqual(DEFAULT_PASSIVE_SOURCES_CONFIG)
  })

  it('字段类型不符 → 归默认', () => {
    writeFileSync(
      file,
      JSON.stringify({ folder: { dir: 123 }, foreground: { pollMs: 'x' } }),
      'utf-8'
    )
    const cfg = loadPassiveConfig(file)
    expect(cfg.folder.dir).toBe('')
    expect(cfg.foreground.pollMs).toBe(15000)
  })

  it('validate：合法配置 → null', () => {
    expect(validatePassiveConfig(DEFAULT_PASSIVE_SOURCES_CONFIG)).toBeNull()
  })

  it('validate：clipboard.pollMs=0 / 负数 → 报错', () => {
    expect(
      validatePassiveConfig({
        ...DEFAULT_PASSIVE_SOURCES_CONFIG,
        clipboard: { ...DEFAULT_PASSIVE_SOURCES_CONFIG.clipboard, pollMs: 0 }
      })
    ).toContain('clipboard.pollMs')
    expect(
      validatePassiveConfig({
        ...DEFAULT_PASSIVE_SOURCES_CONFIG,
        clipboard: { ...DEFAULT_PASSIVE_SOURCES_CONFIG.clipboard, pollMs: -5 }
      })
    ).toContain('clipboard.pollMs')
  })

  it('validate：folder.patterns=[\'\']（空串）→ 报错', () => {
    expect(
      validatePassiveConfig({
        ...DEFAULT_PASSIVE_SOURCES_CONFIG,
        folder: { ...DEFAULT_PASSIVE_SOURCES_CONFIG.folder, patterns: [''] }
      })
    ).toContain('folder.patterns')
  })

  it('validate：foreground.mappings state=bad → 报错', () => {
    expect(
      validatePassiveConfig({
        ...DEFAULT_PASSIVE_SOURCES_CONFIG,
        foreground: {
          ...DEFAULT_PASSIVE_SOURCES_CONFIG.foreground,
          mappings: [{ process: 'x', state: 'bad' }]
        }
      })
    ).toContain('focus')
  })

  it('validate：folder.dir=123 → 报错', () => {
    expect(
      validatePassiveConfig({
        ...DEFAULT_PASSIVE_SOURCES_CONFIG,
        folder: { ...DEFAULT_PASSIVE_SOURCES_CONFIG.folder, dir: 123 }
      })
    ).toContain('folder.dir')
  })

  it('round-trip：save 后 load 与保存值一致', () => {
    const cfg: typeof DEFAULT_PASSIVE_SOURCES_CONFIG = {
      clipboard: {
        enabled: false,
        pollMs: 1000,
        onlyPatterns: ['^\\d{6}$'],
        ignorePatterns: [],
        maxLen: 200
      },
      folder: { enabled: true, dir: 'C:\\data', patterns: ['*.txt', '*.md'], debounceMs: 300 },
      foreground: {
        enabled: true,
        pollMs: 5000,
        mappings: [{ process: 'notepad.exe', state: 'focus' }]
      }
    }
    savePassiveConfig(file, cfg)
    expect(loadPassiveConfig(file)).toEqual(cfg)
  })
})