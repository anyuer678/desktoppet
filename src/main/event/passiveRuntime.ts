import { clipboard } from 'electron'
import type { PassiveSourcesConfig, PluginManifest } from '../../shared/ipc'
import { passiveConfigPath } from '../app/paths'
import type { LogFn } from '../logging/logger'
import type { EventRuntime } from './eventRuntime'
import type { StatsRuntime } from '../stats/statsRuntime'
import { countEvent } from '../stats/dailyStats'
import { createSourceHub, type SourceContext, type SourceHub } from './sourceHub'
import { createSystemSource } from './sources/systemSource'
import { createPluginSource } from './sources/pluginSource'
import { createClipboardSource } from './sources/clipboardSource'
import { createFolderSource, defaultListFiles, folderShouldNotify } from './sources/folderSource'
import { createForegroundSource, foregroundMapping, getForegroundApp } from './sources/foregroundSource'
import { clipboardShouldNotify } from './clipboard'
import { classifyClipboard, extractDomain, isSensitive } from './sourceClassifier'
import {
  DEFAULT_PASSIVE_SOURCES_CONFIG,
  loadPassiveConfig,
  savePassiveConfig
} from './passiveStore'
import { createSampler } from '../monitor/systemMonitor'
import { createBatterySampler, type BatterySampler } from '../monitor/battery'

/** PowerShell 命令执行器（前台窗口检测用） */
export type PowerShellRunner = (cmd: string) => Promise<string>

export interface PassiveRuntimeDeps {
  events: Pick<EventRuntime, 'apply' | 'replaceBySource'>
  stats: Pick<StatsRuntime, 'record'>
  notifyPet(channel: string, payload?: unknown): void
  /** 插件清单（getter：插件重载后 hub 重建时须读到最新值） */
  getPlugins(): PluginManifest[]
  powershellRunner: PowerShellRunner
  log: LogFn
}

export interface PassiveTestResult {
  ok: boolean
  error?: string
}

export interface PassiveRuntime {
  /** 加载配置（whenReady 中、start 之前调用，保持原语句顺序） */
  loadConfig(): void
  /** 创建采样器/电池采样并构建 hub（rebuild 语义：先 stop 旧 hub） */
  start(): void
  /** 停止：电池采样先停、hub 后停（保持原 will-quit 顺序） */
  stop(): void
  /** 按 4s tick 轮询 poll 类源 */
  tick(now: number): void
  /** 重建 hub（passive:set 后调用） */
  rebuild(): void
  config(): PassiveSourcesConfig
  /** 更新配置并落盘（rebuild 由调用方决定，保持原 handler 行为） */
  setConfig(cfg: PassiveSourcesConfig): void
  /** passive:test 纯逻辑（原 handler 主体） */
  test(sourceId: unknown): Promise<PassiveTestResult> | PassiveTestResult
}

/**
 * 被动数据源运行时：配置/hub/系统与电池采样器均为闭包私有状态。
 * getPlugins() 经 getter 现读插件清单，重建 hub 时不会拿到启动时快照。
 */
export function createPassiveRuntime(deps: PassiveRuntimeDeps): PassiveRuntime {
  let passiveCfg: PassiveSourcesConfig = { ...DEFAULT_PASSIVE_SOURCES_CONFIG }
  let passiveHub: SourceHub | null = null
  let sampler: ReturnType<typeof createSampler> | null = null
  let batterySampler: BatterySampler | null = null

  function hasClipboardImage(): boolean {
    try {
      return clipboard.availableFormats().some((f) => f.startsWith('image/'))
    } catch {
      return false
    }
  }

  function buildContext(): SourceContext {
    return {
      inject: (ev) => deps.events.apply(ev),
      replaceBySource: (prefix, evs) => deps.events.replaceBySource(prefix, evs),
      notify: deps.notifyPet,
      count: (t) => deps.stats.record((s) => countEvent(s, t)),
      log: deps.log
    }
  }

  function buildHub(): void {
    if (!sampler) return
    passiveHub?.stop()
    passiveHub = createSourceHub(buildContext(), [
      createSystemSource(() => ({ ...sampler!(), battery: batterySampler?.get() ?? null })),
      createPluginSource(() => deps.getPlugins()),
      createClipboardSource(
        () => ({ text: clipboard.readText(), hasImage: hasClipboardImage() }),
        () => passiveCfg.clipboard
      ),
      createFolderSource(() => passiveCfg.folder, defaultListFiles),
      createForegroundSource(() => passiveCfg.foreground, deps.powershellRunner)
    ])
    passiveHub.start()
  }

  function loadConfig(): void {
    passiveCfg = loadPassiveConfig(passiveConfigPath())
  }

  function start(): void {
    sampler = createSampler()
    // 电池采样（异步轮询，60s 间隔），tick 只读缓存
    batterySampler = createBatterySampler()
    batterySampler.start()
    buildHub()
  }

  function stop(): void {
    batterySampler?.stop()
    passiveHub?.stop()
  }

  function tick(now: number): void {
    passiveHub?.tick(now)
  }

  function rebuild(): void {
    buildHub()
  }

  function setConfig(cfg: PassiveSourcesConfig): void {
    passiveCfg = cfg
    savePassiveConfig(passiveConfigPath(), passiveCfg)
  }

  function test(sourceId: unknown): Promise<PassiveTestResult> | PassiveTestResult {
    const id = sourceId === 'folder' || sourceId === 'foreground' ? sourceId : 'clipboard'
    if (id === 'clipboard') {
      const text = clipboard.readText()
      if (!text.trim()) return { ok: false, error: '剪贴板当前为空' }
      if (clipboardShouldNotify(text, passiveCfg.clipboard).ok !== true) {
        return { ok: false, error: '剪贴板内容不满足当前规则' }
      }
      const now = Date.now()
      deps.stats.record((s) => countEvent(s, 'clipboard'))
      deps.events.apply({ source: 'clipboard', type: 'clipboard', priority: 5, durationMs: 8000, occurredAt: now })
      const reaction = isSensitive(text)
        ? 'clipSensitive'
        : classifyClipboard(text)
      const placeholder = reaction === 'clipLink' ? extractDomain(text) ?? '' : ''
      deps.notifyPet('push:fired', { kind: 'passive', reaction, placeholder })
      return { ok: true }
    }
    if (id === 'folder') {
      const dir = passiveCfg.folder.dir
      if (!dir) return { ok: false, error: '未配置监听目录' }
      const files = defaultListFiles(dir).filter((f) => folderShouldNotify(f, passiveCfg.folder.patterns))
      const hit = files[0]
      if (!hit) return { ok: false, error: '目录中无匹配当前规则的文件' }
      const now = Date.now()
      deps.stats.record((s) => countEvent(s, 'folder'))
      deps.events.apply({ source: 'folder', type: 'folder', priority: 5, durationMs: 8000, occurredAt: now })
      deps.notifyPet('push:fired', { kind: 'passive', reaction: 'folderChange', placeholder: hit })
      return { ok: true }
    }
    // foreground
    const m = getForegroundApp(deps.powershellRunner)
    return m.then((app) => {
      if (!app) return { ok: false, error: '获取前台窗口失败' }
      const mapping = foregroundMapping(app, passiveCfg.foreground.mappings)
      deps.stats.record((s) => countEvent(s, 'foreground'))
      if (!mapping || mapping.state !== 'focus') return { ok: false, error: '前台进程未命中 focus 映射' }
      const now = Date.now()
      deps.events.apply({ source: 'foreground', type: 'working', priority: 4, durationMs: passiveCfg.foreground.pollMs * 2, occurredAt: now })
      deps.notifyPet('push:fired', { kind: 'passive', reaction: 'foreground', placeholder: app.process })
      return { ok: true }
    }).catch(() => ({ ok: false, error: 'PowerShell 执行失败' }))
  }

  return { loadConfig, start, stop, tick, rebuild, config: () => passiveCfg, setConfig, test }
}
