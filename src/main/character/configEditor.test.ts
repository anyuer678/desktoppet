import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { clampNumber, updateCharacterConfig } from './configEditor'

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

const BASE = JSON.stringify(
  {
    configVersion: 1,
    id: 'doggo',
    name: '狗狗',
    version: '1.0',
    avatar: { main: 'avatar.png' },
    animation: {
      default: 'idle',
      states: {
        idle: {
          type: 'template',
          template: {
            breathe: { scale: 0.02, duration: 2400 },
            float: { y: 6, duration: 3600 }
          }
        }
      }
    },
    interaction: { click: 'speak', doubleClick: 'open', rightClick: 'menu' },
    settings: { defaultSize: 256, allowResize: true },
    extra: { keep: true }
  },
  null,
  2
)

describe('clampNumber', () => {
  it('钳制到范围', () => {
    expect(clampNumber(5, 0, 10, 1)).toBe(5)
    expect(clampNumber(-5, 0, 10, 1)).toBe(0)
    expect(clampNumber(99, 0, 10, 1)).toBe(10)
  })

  it('非法输入回退 fallback', () => {
    expect(clampNumber('x', 0, 10, 1)).toBe(1)
    expect(clampNumber(Number.NaN, 0, 10, 1)).toBe(1)
    expect(clampNumber(undefined, 0, 10, 1)).toBe(1)
  })
})

describe('updateCharacterConfig', () => {
  it('更新名称/版本，未涉及字段保留', () => {
    const dir = tempDir('dp-cfg-')
    const cfg = join(dir, 'config.json')
    writeFileSync(cfg, BASE)
    const result = updateCharacterConfig(cfg, { name: '柴犬', version: '2.0' })
    expect(result).toEqual({ ok: true })
    const updated = JSON.parse(readFileSync(cfg, 'utf-8'))
    expect(updated.name).toBe('柴犬')
    expect(updated.version).toBe('2.0')
    expect(updated.id).toBe('doggo')
    expect(updated.extra).toEqual({ keep: true })
    expect(updated.animation.states.idle.template.breathe.scale).toBe(0.02)
    rmSync(dir, { recursive: true, force: true })
  })

  it('更新 idle 动画模板参数', () => {
    const dir = tempDir('dp-cfg-')
    const cfg = join(dir, 'config.json')
    writeFileSync(cfg, BASE)
    const result = updateCharacterConfig(cfg, {
      idle: { breatheScale: 0.05, breatheDuration: 3000, floatY: 12, floatDuration: 5000 }
    })
    expect(result.ok).toBe(true)
    const updated = JSON.parse(readFileSync(cfg, 'utf-8'))
    expect(updated.animation.states.idle.template.breathe).toEqual({ scale: 0.05, duration: 3000 })
    expect(updated.animation.states.idle.template.float).toEqual({ y: 12, duration: 5000 })
    rmSync(dir, { recursive: true, force: true })
  })

  it('数值越界被钳制', () => {
    const dir = tempDir('dp-cfg-')
    const cfg = join(dir, 'config.json')
    writeFileSync(cfg, BASE)
    expect(updateCharacterConfig(cfg, { defaultSize: 9999 }).ok).toBe(true)
    expect(updateCharacterConfig(cfg, { idle: { breatheScale: 3 } }).ok).toBe(true)
    const updated = JSON.parse(readFileSync(cfg, 'utf-8'))
    expect(updated.settings.defaultSize).toBe(512)
    expect(updated.animation.states.idle.template.breathe.scale).toBe(0.5)
    rmSync(dir, { recursive: true, force: true })
  })

  it('空名称/版本拒绝', () => {
    const dir = tempDir('dp-cfg-')
    const cfg = join(dir, 'config.json')
    writeFileSync(cfg, BASE)
    expect(updateCharacterConfig(cfg, { name: '  ' }).ok).toBe(false)
    expect(updateCharacterConfig(cfg, { version: '' }).ok).toBe(false)
    const unchanged = JSON.parse(readFileSync(cfg, 'utf-8'))
    expect(unchanged.name).toBe('狗狗')
    rmSync(dir, { recursive: true, force: true })
  })

  it('config 不存在/损坏返回错误', () => {
    const dir = tempDir('dp-cfg-')
    const missing = join(dir, 'nope.json')
    expect(updateCharacterConfig(missing, { name: 'x' }).error).toContain('不存在')
    const bad = join(dir, 'bad.json')
    writeFileSync(bad, '{broken')
    expect(updateCharacterConfig(bad, { name: 'x' }).error).toContain('解析失败')
    rmSync(dir, { recursive: true, force: true })
  })

  it('无 idle 动画结构时也能新建模板字段', () => {
    const dir = tempDir('dp-cfg-')
    const cfg = join(dir, 'config.json')
    writeFileSync(
      cfg,
      JSON.stringify({
        id: 'bare',
        name: '裸包',
        version: '1.0',
        animation: { default: 'idle', states: {} }
      })
    )
    const result = updateCharacterConfig(cfg, { idle: { breatheScale: 0.04 } })
    expect(result.ok).toBe(true)
    const updated = JSON.parse(readFileSync(cfg, 'utf-8'))
    expect(updated.animation.states.idle.template.breathe.scale).toBe(0.04)
    rmSync(dir, { recursive: true, force: true })
  })

  it('按状态名编辑多个状态模板', () => {
    const dir = tempDir('dp-cfg-')
    const cfg = join(dir, 'config.json')
    writeFileSync(cfg, BASE)
    const result = updateCharacterConfig(cfg, {
      states: {
        sleep: { breatheScale: 0.005, floatY: 0 },
        happy: { breatheScale: 0.06, breatheDuration: 1200 }
      }
    })
    expect(result.ok).toBe(true)
    const updated = JSON.parse(readFileSync(cfg, 'utf-8'))
    expect(updated.animation.states.sleep.template).toEqual({ breathe: { scale: 0.005 }, float: { y: 0 } })
    expect(updated.animation.states.happy.template.breathe).toEqual({ scale: 0.06, duration: 1200 })
    expect(updated.animation.states.idle.template.breathe.scale).toBe(0.02)
    rmSync(dir, { recursive: true, force: true })
  })

  it('不存在的状态自动创建模板节点', () => {
    const dir = tempDir('dp-cfg-')
    const cfg = join(dir, 'config.json')
    writeFileSync(cfg, BASE)
    expect(updateCharacterConfig(cfg, { states: { warning: { floatY: 3 } } }).ok).toBe(true)
    const updated = JSON.parse(readFileSync(cfg, 'utf-8'))
    expect(updated.animation.states.warning).toEqual({ type: 'template', template: { float: { y: 3 } } })
    rmSync(dir, { recursive: true, force: true })
  })

  it('编辑夜间叠加层时间与强度', () => {
    const dir = tempDir('dp-cfg-')
    const cfg = join(dir, 'config.json')
    writeFileSync(cfg, BASE)
    const result = updateCharacterConfig(cfg, {
      overlays: {
        night: { start: 21, end: 7, opacity: 0.5, breatheScale: 0.7, floatY: 0.3, speed: 0.8 }
      }
    })
    expect(result.ok).toBe(true)
    const updated = JSON.parse(readFileSync(cfg, 'utf-8'))
    expect(updated.overlays.night).toEqual({
      condition: { time: { start: 21, end: 7 } },
      apply: {
        opacity: 0.5,
        template: { breatheScale: 0.7, floatY: 0.3, speed: 0.8 }
      }
    })
    rmSync(dir, { recursive: true, force: true })
  })

  it('夜间时间与强度钳制', () => {
    const dir = tempDir('dp-cfg-')
    const cfg = join(dir, 'config.json')
    writeFileSync(cfg, BASE)
    expect(updateCharacterConfig(cfg, { overlays: { night: { start: 99, opacity: 5, speed: 9 } } }).ok).toBe(true)
    const updated = JSON.parse(readFileSync(cfg, 'utf-8'))
    expect(updated.overlays.night.condition.time.start).toBe(3)
    expect(updated.overlays.night.apply.opacity).toBe(1)
    expect(updated.overlays.night.apply.template.speed).toBe(2)
    rmSync(dir, { recursive: true, force: true })
  })

  it('无叠加层时自动创建 night 节点', () => {
    const dir = tempDir('dp-cfg-')
    const cfg = join(dir, 'config.json')
    writeFileSync(
      cfg,
      JSON.stringify({ id: 'bare', name: '裸包', version: '1.0', animation: { default: 'idle', states: {} } })
    )
    expect(updateCharacterConfig(cfg, { overlays: { night: { start: 22, end: 6 } } }).ok).toBe(true)
    const updated = JSON.parse(readFileSync(cfg, 'utf-8'))
    expect(updated.overlays.night.condition.time).toEqual({ start: 22, end: 6 })
    expect(updated.overlays.night.apply).toEqual({})
    rmSync(dir, { recursive: true, force: true })
  })

  it('编辑交互动作，未涉及的按键保留', () => {
    const dir = tempDir('dp-cfg-')
    const cfg = join(dir, 'config.json')
    writeFileSync(cfg, BASE)
    expect(
      updateCharacterConfig(cfg, { interaction: { click: 'speak', rightClick: 'none' } }).ok
    ).toBe(true)
    const updated = JSON.parse(readFileSync(cfg, 'utf-8'))
    expect(updated.interaction.click).toBe('speak')
    expect(updated.interaction.rightClick).toBe('none')
    expect(updated.interaction.doubleClick).toBe('open')
    rmSync(dir, { recursive: true, force: true })
  })

  it('交互动作非法值回退默认', () => {
    const dir = tempDir('dp-cfg-')
    const cfg = join(dir, 'config.json')
    writeFileSync(cfg, BASE)
    expect(
      updateCharacterConfig(cfg, { interaction: { click: 'hack' as never, doubleClick: 'boom' as never } }).ok
    ).toBe(true)
    const updated = JSON.parse(readFileSync(cfg, 'utf-8'))
    expect(updated.interaction.click).toBe('speak')
    expect(updated.interaction.doubleClick).toBe('open_center')
    expect(updated.interaction.rightClick).toBe('menu')
    rmSync(dir, { recursive: true, force: true })
  })

  it('无 interaction 结构时自动创建', () => {
    const dir = tempDir('dp-cfg-')
    const cfg = join(dir, 'config.json')
    writeFileSync(
      cfg,
      JSON.stringify({ id: 'bare', name: '裸包', version: '1.0', animation: { default: 'idle', states: {} } })
    )
    expect(updateCharacterConfig(cfg, { interaction: { click: 'speak' } }).ok).toBe(true)
    const updated = JSON.parse(readFileSync(cfg, 'utf-8'))
    expect(updated.interaction).toEqual({ click: 'speak' })
    rmSync(dir, { recursive: true, force: true })
  })
})
