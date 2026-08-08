import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import {
  listCharacters,
  parseCharacterConfig,
  readCharacterDetail,
  resolvePetPath,
  safeResolve
} from '../character/configReader'

function tempRoot(): string {
  return mkdtempSync(join(tmpdir(), 'dp-test-'))
}

function writePack(root: string, id: string, config: unknown): void {
  const dir = join(root, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'config.json'), JSON.stringify(config))
}

describe('configReader', () => {
  it('解析合法角色包', () => {
    const root = tempRoot()
    writePack(root, 'rabbit', {
      id: 'rabbit',
      name: '兔兔',
      version: '1.0',
      avatar: { main: 'avatar.png', preview: 'preview.jpg' },
      animation: {
        default: 'idle',
        states: { idle: { type: 'template' }, happy: { type: 'sequence' } }
      }
    })
    const chars = listCharacters(root)
    expect(chars).toHaveLength(1)
    expect(chars[0]).toMatchObject({
      id: 'rabbit',
      name: '兔兔',
      version: '1.0',
      defaultState: 'idle',
      supportedStates: ['idle', 'happy'],
      avatarMain: 'avatar.png',
      avatarPreview: 'preview.jpg'
    })
    rmSync(root, { recursive: true, force: true })
  })

  it('跳过损坏/非法的角色包', () => {
    const root = tempRoot()
    writePack(root, 'bad-json', '{invalid')
    writePack(root, 'no-name', { id: 'x' })
    writePack(root, 'no-id', { name: 'x' })
    const chars = listCharacters(root)
    expect(chars).toHaveLength(0)
    rmSync(root, { recursive: true, force: true })
  })

  it('跳过 config.id 与目录名不一致的损坏包（避免列表出现无法加载的角色）', () => {
    const root = tempRoot()
    writePack(root, 'mismatch-dir', { id: 'other-id', name: '不一致' })
    writePack(root, 'rabbit', { id: 'rabbit', name: '兔兔' })
    const chars = listCharacters(root)
    expect(chars).toHaveLength(1)
    expect(chars[0].id).toBe('rabbit')
    rmSync(root, { recursive: true, force: true })
  })

  it('resolvePetPath 拒绝非法 host（越角色包边界）', () => {
    const root = tempRoot()
    expect(resolvePetPath(root, '..', ['secret'])).toBeNull()
    expect(resolvePetPath(root, 'rabbit/..', ['x'])).toBeNull()
    expect(resolvePetPath(root, 'RABBIT', ['x'])).toBeNull()
    expect(resolvePetPath(root, 'rabbit', ['avatar.png'])).toBe(join(root, 'rabbit', 'avatar.png'))
    rmSync(root, { recursive: true, force: true })
  })

  it('default 状态缺失时回退到第一个状态', () => {
    const root = tempRoot()
    writePack(root, 'c', {
      id: 'c',
      name: 'C',
      animation: { default: 'missing', states: { sleep: {} } }
    })
    const chars = listCharacters(root)
    expect(chars[0].defaultState).toBe('sleep')
    rmSync(root, { recursive: true, force: true })
  })

  it('safeResolve 阻止越出角色根目录', () => {
    const root = tempRoot()
    expect(safeResolve(root, 'rabbit', 'avatar.png')).toBe(join(root, 'rabbit', 'avatar.png'))
    expect(safeResolve(root, 'rabbit', '..', '..', 'secret.txt')).toBeNull()
    expect(safeResolve(root, '../evil', 'a.png')).toBeNull()
    rmSync(root, { recursive: true, force: true })
  })

  it('resolvePetPath 将 host+path 映射到角色包内路径', () => {
    const root = tempRoot()
    expect(resolvePetPath(root, 'rabbit', ['avatar.png'])).toBe(join(root, 'rabbit', 'avatar.png'))
    expect(resolvePetPath(root, 'rabbit', ['animations', 'idle', '000.png'])).toBe(
      join(root, 'rabbit', 'animations', 'idle', '000.png')
    )
    expect(resolvePetPath(root, '', ['a.png'])).toBeNull()
    expect(resolvePetPath(root, 'rabbit', [])).toBeNull()
    expect(resolvePetPath(root, 'rabbit', ['..', 'escape.png'])).toBeNull()
    expect(resolvePetPath(root, 'rabbit', ['..', '..', 'secret.txt'])).toBeNull()
    expect(resolvePetPath(root, '..', ['evil.txt'])).toBeNull()
    expect(resolvePetPath(root, '..', ['..', 'secret.txt'])).toBeNull()
    rmSync(root, { recursive: true, force: true })
  })

  it('parseCharacterConfig 对不存在文件返回 null', () => {
    expect(parseCharacterConfig(join(tmpdir(), 'no-such-config.json'))).toBeNull()
  })

  it('readCharacterDetail 解析叠加层并过滤非法项', () => {
    const root = tempRoot()
    writePack(root, 'c', {
      id: 'c',
      name: 'C',
      animation: { default: 'idle', states: { idle: { type: 'template' } } },
      overlays: {
        night: {
          condition: { time: { start: 22, end: 6 } },
          apply: { opacity: 0.65, template: { breatheScale: 0.6, floatY: 0.4, speed: 0.9 } }
        },
        bad: { apply: {} },
        badTime: { condition: { time: { start: 'x', end: 6 } }, apply: { opacity: 0.5 } },
        clamp: {
          condition: { time: { start: 26, end: -2 } },
          apply: { opacity: 5, template: { speed: -1 } }
        }
      }
    })
    const detail = readCharacterDetail(root, 'c')
    expect(detail?.overlays).toEqual({
      night: {
        condition: { time: { start: 22, end: 6 } },
        apply: { opacity: 0.65, template: { breatheScale: 0.6, floatY: 0.4, speed: 0.9 } }
      },
      clamp: {
        condition: { time: { start: 2, end: 22 } },
        apply: { opacity: 1 }
      }
    })
    rmSync(root, { recursive: true, force: true })
  })

  it('readCharacterDetail 无叠加层时为 undefined', () => {
    const root = tempRoot()
    writePack(root, 'c', {
      id: 'c',
      name: 'C',
      animation: { default: 'idle', states: { idle: { type: 'template' } } }
    })
    const detail = readCharacterDetail(root, 'c')
    expect(detail?.overlays).toBeUndefined()
    rmSync(root, { recursive: true, force: true })
  })

  it('readCharacterDetail 交互动作非法值回退默认', () => {
    const root = tempRoot()
    writePack(root, 'c', {
      id: 'c',
      name: 'C',
      animation: { default: 'idle', states: { idle: { type: 'template' } } },
      interaction: { click: 'evil', doubleClick: 'open_center', rightClick: undefined }
    })
    const detail = readCharacterDetail(root, 'c')
    expect(detail?.interaction).toEqual({
      click: 'speak',
      doubleClick: 'open_center',
      rightClick: 'menu'
    })
    rmSync(root, { recursive: true, force: true })
  })

  it('readCharacterDetail 交互动作缺失时使用默认', () => {
    const root = tempRoot()
    writePack(root, 'c', {
      id: 'c',
      name: 'C',
      animation: { default: 'idle', states: { idle: { type: 'template' } } }
    })
    const detail = readCharacterDetail(root, 'c')
    expect(detail?.interaction).toEqual({
      click: 'speak',
      doubleClick: 'open_center',
      rightClick: 'menu'
    })
    rmSync(root, { recursive: true, force: true })
  })
})
