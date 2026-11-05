import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../storage/settingsStore'
import { DEFAULT_SPEECH } from '../../shared/speech'

describe('settingsStore', () => {
  it('文件缺失时返回默认设置', () => {
    const settings = loadSettings(join(tmpdir(), 'no-such-settings.json'))
    expect(settings).toEqual(DEFAULT_SETTINGS)
  })

  it('损坏 JSON 时回退默认设置', () => {
    const root = mkdtempSync(join(tmpdir(), 'dp-settings-'))
    const file = join(root, 'settings.json')
    writeFileSync(file, '{broken')
    expect(loadSettings(file)).toEqual(DEFAULT_SETTINGS)
    rmSync(root, { recursive: true, force: true })
  })

  it('保存后能完整回读（roundtrip）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dp-settings-'))
    const file = join(root, 'settings.json')
    const custom = {
      ...DEFAULT_SETTINGS,
      size: 320,
      opacity: 0.8,
      position: { x: 10, y: 20 },
      activeCharacterId: 'cat'
    }
    saveSettings(file, custom)
    expect(loadSettings(file)).toEqual(custom)
    rmSync(root, { recursive: true, force: true })
  })

  it('局部持久化时与默认值深合并（position 逐字段）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dp-settings-'))
    const file = join(root, 'settings.json')
    writeFileSync(file, JSON.stringify({ position: { y: 500 }, size: 200 }))
    const settings = loadSettings(file)
    expect(settings.position).toEqual({ x: 400, y: 500 })
    expect(settings.size).toBe(200)
    rmSync(root, { recursive: true, force: true })
  })

  it('默认设置开启全局快捷键', () => {
    expect(DEFAULT_SETTINGS.shortcutsEnabled).toBe(true)
  })

  it('shortcutsEnabled 缺失时回退默认 true', () => {
    const root = mkdtempSync(join(tmpdir(), 'dp-settings-'))
    const file = join(root, 'settings.json')
    writeFileSync(file, JSON.stringify({ size: 200 }))
    const settings = loadSettings(file)
    expect(settings.shortcutsEnabled).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })

  it('speech 缺失时使用全部默认池（含新增 interact）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dp-settings-'))
    const file = join(root, 'settings.json')
    writeFileSync(file, JSON.stringify({ size: 200 }))
    const settings = loadSettings(file)
    expect(settings.speech).toEqual(DEFAULT_SPEECH)
    expect(settings.speech.interact.length).toBeGreaterThan(0)
    rmSync(root, { recursive: true, force: true })
  })

  it('speech 部分池缺失时补默认（向后兼容旧自定义文件）', () => {
    const root = mkdtempSync(join(tmpdir(), 'dp-settings-'))
    const file = join(root, 'settings.json')
    const oldSpeech = { ...DEFAULT_SPEECH }
    delete (oldSpeech as Partial<typeof oldSpeech>).interact
    writeFileSync(file, JSON.stringify({ speech: oldSpeech }))
    const settings = loadSettings(file)
    expect(settings.speech.morning).toEqual(DEFAULT_SPEECH.morning)
    expect(settings.speech.interact).toEqual(DEFAULT_SPEECH.interact)
    rmSync(root, { recursive: true, force: true })
  })

  it('speech 损坏结构：非数组池回退默认、非法项过滤、空池保留', () => {
    const root = mkdtempSync(join(tmpdir(), 'dp-settings-'))
    const file = join(root, 'settings.json')
    writeFileSync(
      file,
      JSON.stringify({
        speech: {
          welcome: 'not-an-array',
          morning: ['ok', 3, null, '  ', ' hi '],
          interact: []
        }
      })
    )
    const settings = loadSettings(file)
    // 非数组 → 默认池；数组内非字符串/空白项被过滤并 trim；空数组表示该场景不说话
    expect(settings.speech.welcome).toEqual(DEFAULT_SPEECH.welcome)
    expect(settings.speech.morning).toEqual(['ok', 'hi'])
    expect(settings.speech.interact).toEqual([])
    // 每个池都必须是数组，渲染层 pickText 才能安全调用数组方法
    expect(Object.values(settings.speech).every((p) => Array.isArray(p))).toBe(true)
    rmSync(root, { recursive: true, force: true })
  })
})
