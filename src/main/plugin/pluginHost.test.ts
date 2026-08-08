import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { loadPlugins, pluginEventsToPetEvents, toPluginInfo } from './pluginHost'

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function writePlugin(pluginsDir: string, id: string, manifest: unknown): void {
  const dir = join(pluginsDir, id)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'plugin.json'), JSON.stringify(manifest))
}

const GOOD_MANIFEST = {
  id: 'weather',
  name: '天气插件',
  version: '1.0',
  description: '根据天气产生事件',
  events: [
    { type: 'weather_rain', priority: 30, durationMs: 3600000 }
  ]
}

describe('loadPlugins', () => {
  it('插件目录不存在返回空数组', () => {
    expect(loadPlugins('/nonexistent/path')).toEqual([])
  })

  it('加载合法插件 manifest', () => {
    const dir = tempDir('dp-plug-')
    writePlugin(dir, 'weather', GOOD_MANIFEST)
    const plugins = loadPlugins(dir)
    expect(plugins).toHaveLength(1)
    expect(plugins[0].id).toBe('weather')
    expect(plugins[0].name).toBe('天气插件')
    expect(plugins[0].events).toHaveLength(1)
    expect(plugins[0].events[0].type).toBe('weather_rain')
    rmSync(dir, { recursive: true, force: true })
  })

  it('跳过无 plugin.json 的目录', () => {
    const dir = tempDir('dp-plug-')
    mkdirSync(join(dir, 'nojson'), { recursive: true })
    writePlugin(dir, 'ok', GOOD_MANIFEST)
    expect(loadPlugins(dir)).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('跳过 id 非法的插件', () => {
    const dir = tempDir('dp-plug-')
    writePlugin(dir, 'bad', { ...GOOD_MANIFEST, id: 'Bad ID!' })
    writePlugin(dir, 'ok', GOOD_MANIFEST)
    expect(loadPlugins(dir)).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('跳过 manifest JSON 损坏的插件', () => {
    const dir = tempDir('dp-plug-')
    mkdirSync(join(dir, 'broken'), { recursive: true })
    writeFileSync(join(dir, 'broken', 'plugin.json'), '{ broken')
    writePlugin(dir, 'ok', GOOD_MANIFEST)
    expect(loadPlugins(dir)).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })

  it('跳过事件声明非法的条目（不中断其他事件）', () => {
    const dir = tempDir('dp-plug-')
    writePlugin(dir, 'mixed', {
      ...GOOD_MANIFEST,
      events: [
        { type: 'good_event', priority: 50, durationMs: 60000 },
        { type: '', priority: 50, durationMs: 60000 },
        { type: 'bad_priority', priority: 200, durationMs: 60000 },
        { type: 'bad_duration', priority: 50, durationMs: 0 }
      ]
    })
    const plugins = loadPlugins(dir)
    expect(plugins[0].events).toHaveLength(1)
    expect(plugins[0].events[0].type).toBe('good_event')
    rmSync(dir, { recursive: true, force: true })
  })

  it('跳过文件（非目录）', () => {
    const dir = tempDir('dp-plug-')
    writeFileSync(join(dir, 'notadir.txt'), 'hello')
    writePlugin(dir, 'ok', GOOD_MANIFEST)
    expect(loadPlugins(dir)).toHaveLength(1)
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('pluginEventsToPetEvents', () => {
  it('将插件事件声明转为 PetEvent', () => {
    const now = 1000000
    const plugins = loadPlugins(tempDir('dp-plug-')) // 空
    const dir = tempDir('dp-plug-')
    writePlugin(dir, 'weather', GOOD_MANIFEST)
    const loaded = loadPlugins(dir)
    const events = pluginEventsToPetEvents(loaded, now)
    expect(events).toHaveLength(1)
    expect(events[0].source).toBe('plugin:weather')
    expect(events[0].type).toBe('weather_rain')
    expect(events[0].priority).toBe(30)
    expect(events[0].durationMs).toBe(3600000)
    expect(events[0].occurredAt).toBe(now)
    rmSync(dir, { recursive: true, force: true })
  })

  it('多个插件多个事件全部转换', () => {
    const dir = tempDir('dp-plug-')
    writePlugin(dir, 'a', { ...GOOD_MANIFEST, id: 'a', events: [
      { type: 'a1', priority: 10, durationMs: 60000 },
      { type: 'a2', priority: 20, durationMs: 60000 }
    ]})
    writePlugin(dir, 'b', { ...GOOD_MANIFEST, id: 'b', events: [
      { type: 'b1', priority: 30, durationMs: 60000 }
    ]})
    const loaded = loadPlugins(dir)
    const events = pluginEventsToPetEvents(loaded, 0)
    expect(events).toHaveLength(3)
    expect(events.map((e) => e.source)).toEqual(['plugin:a', 'plugin:a', 'plugin:b'])
    rmSync(dir, { recursive: true, force: true })
  })

  it('空插件列表返回空数组', () => {
    expect(pluginEventsToPetEvents([], 0)).toEqual([])
  })
})

describe('toPluginInfo', () => {
  it('转换 manifest 为 PluginInfo', () => {
    const dir = tempDir('dp-plug-')
    writePlugin(dir, 'weather', GOOD_MANIFEST)
    const plugins = loadPlugins(dir)
    const info = toPluginInfo(plugins)
    expect(info).toHaveLength(1)
    expect(info[0].id).toBe('weather')
    expect(info[0].name).toBe('天气插件')
    expect(info[0].eventCount).toBe(1)
    expect(info[0].enabled).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })
})
