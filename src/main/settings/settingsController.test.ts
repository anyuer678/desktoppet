import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({
  app: { setLoginItemSettings: vi.fn() },
}))

import { app } from 'electron'
import { createSettingsController, MAX_PET_SIZE, MIN_PET_SIZE } from './settingsController'
import { DEFAULT_SETTINGS } from '../storage/settingsStore'
import { DEFAULT_SPEECH } from '../../shared/speech'

const root = mkdtempSync(join(tmpdir(), 'dp-controller-'))
const file = join(root, 'settings.json')

vi.mock('../app/paths', () => ({
  settingsPath: () => file,
}))

vi.mock('../character/importer', () => ({
  // 真实语义：合法返回 null，非法返回错误信息
  validatePackId: (id: string) => (/^[a-z0-9_-]+$/.test(id) ? null : 'invalid'),
}))

function makeController() {
  return createSettingsController({
    applyShortcutsEnabled: vi.fn(),
    applyPetSize: vi.fn(),
    notifyPet: vi.fn(),
  })
}

beforeEach(() => {
  rmSync(file, { force: true })
  vi.mocked(app.setLoginItemSettings).mockClear()
})

describe('settingsController.set 白名单', () => {
  it('白名单内的键正常合并落盘', () => {
    const c = makeController()
    c.load()
    const next = c.set({ size: 300, shortcutsEnabled: false })
    expect(next.size).toBe(300)
    expect(next.shortcutsEnabled).toBe(false)
    expect(JSON.parse(readFileSync(file, 'utf8')).size).toBe(300)
  })

  it('白名单外的未知键被丢弃', () => {
    const c = makeController()
    c.load()
    const next = c.set({ rogueKey: 'x' } as never)
    expect((next as unknown as Record<string, unknown>)['rogueKey']).toBeUndefined()
    expect(JSON.parse(readFileSync(file, 'utf8')).rogueKey).toBeUndefined()
  })

  it('__proto__ / constructor 等危险键不进入设置对象', () => {
    const c = makeController()
    c.load()
    c.set({ __proto__: { polluted: true }, constructor: 'x' } as never)
    const raw = JSON.parse(readFileSync(file, 'utf8')) as unknown as Record<string, unknown>
    expect(raw.polluted).toBeUndefined()
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
  })

  it('size/opacity 仍按边界 clamp', () => {
    const c = makeController()
    c.load()
    expect(c.set({ size: 10_000 }).size).toBe(MAX_PET_SIZE)
    expect(c.set({ size: 1 }).size).toBe(MIN_PET_SIZE)
    expect(c.set({ opacity: 5 }).opacity).toBe(1)
    expect(c.set({ opacity: -1 }).opacity).toBe(0.3)
  })

  it('autoLaunch 布尔联动 setLoginItemSettings', () => {
    const c = makeController()
    c.load()
    c.set({ autoLaunch: true })
    expect(app.setLoginItemSettings).toHaveBeenCalledWith({ openAtLogin: true })
  })

  it('activeCharacterId 只接受合法 id 或空串', () => {
    const c = makeController()
    c.load()
    expect(c.set({ activeCharacterId: 'valid-pack' }).activeCharacterId).toBe('valid-pack')
    expect(c.set({ activeCharacterId: 'bad pack!' }).activeCharacterId).toBe('valid-pack')
    expect(c.set({ activeCharacterId: '' }).activeCharacterId).toBe('')
  })

  it('默认设置不被破坏（空 patch 等价 no-op）', () => {
    const c = makeController()
    c.load()
    const next = c.set({})
    expect(next).toEqual(DEFAULT_SETTINGS)
  })

  it('非法 size/opacity/position/布尔值被丢弃，不污染内存与磁盘', () => {
    const c = makeController()
    c.load()
    c.set({
      size: '300',
      opacity: Number.NaN,
      position: { x: 'a', y: 1 },
      autoLaunch: 'yes',
      shortcutsEnabled: 1
    } as never)
    const next = c.get()
    expect(next.size).toBe(DEFAULT_SETTINGS.size)
    expect(next.opacity).toBe(DEFAULT_SETTINGS.opacity)
    expect(next.position).toEqual(DEFAULT_SETTINGS.position)
    expect(next.autoLaunch).toBe(DEFAULT_SETTINGS.autoLaunch)
    expect(next.shortcutsEnabled).toBe(DEFAULT_SETTINGS.shortcutsEnabled)
    const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>
    expect(raw.size).toBe(DEFAULT_SETTINGS.size)
    expect(raw.position).toEqual(DEFAULT_SETTINGS.position)
  })

  it('position 合法值取整后保存', () => {
    const c = makeController()
    c.load()
    const next = c.set({ position: { x: 10.6, y: -3.2 } })
    expect(next.position).toEqual({ x: 11, y: -3 })
  })

  it('flush 立即写出防抖中的位置更新', () => {
    const c = makeController()
    c.load()
    c.onPetMoved({ x: 777, y: 888 })
    c.flush()
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { position: { x: number; y: number } }
    expect(raw.position).toEqual({ x: 777, y: 888 })
  })

  it('disabledPlugins 写入前过滤非法 id 并去重', () => {
    const c = makeController()
    c.load()
    const next = c.set({ disabledPlugins: ['bad plugin', 'ok', 'ok', 1] } as never)
    expect(next.disabledPlugins).toEqual(['ok'])
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { disabledPlugins: string[] }
    expect(raw.disabledPlugins).toEqual(['ok'])
  })

  it('speech 损坏结构在写入前被规范化（防止崩桌宠）', () => {
    const c = makeController()
    c.load()
    const next = c.set({
      speech: { welcome: 'oops', morning: [1, ' ok '], interact: [] } as never
    })
    expect(next.speech.welcome).toEqual(DEFAULT_SPEECH.welcome)
    expect(next.speech.morning).toEqual(['ok'])
    expect(next.speech.interact).toEqual([])
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { speech: Record<string, unknown> }
    expect(Object.values(raw.speech).every((p) => Array.isArray(p))).toBe(true)
  })
})
