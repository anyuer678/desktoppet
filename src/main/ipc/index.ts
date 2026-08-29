import type { LogFn } from '../logging/logger'
import type { PluginManifest } from '../../shared/ipc'
import type { SettingsController } from '../settings/settingsController'
import type { WindowHub } from '../window/windows'
import type { ShortcutsHub } from '../window/shortcuts'
import type { EventRuntime } from '../event/eventRuntime'
import type { PassiveRuntime } from '../event/passiveRuntime'
import type { StatsRuntime } from '../stats/statsRuntime'
import type { AutoReportRuntime } from '../stats/autoReportRuntime'
import type { PushRuntime } from '../push/pushRuntime'
import type { ScheduleRuntime } from '../schedule/scheduleRuntime'
import type { PerfRuntime } from '../perf/perfRuntime'
import { registerSettingsIpc } from './settingsIpc'
import { registerCharacterIpc } from './characterIpc'
import { registerWindowIpc } from './windowIpc'
import { registerEventsIpc } from './eventsIpc'
import { registerStatsIpc } from './statsIpc'
import { registerAutoReportIpc } from './autoReportIpc'
import { registerPushIpc } from './pushIpc'
import { registerPassiveIpc } from './passiveIpc'
import { registerPerfIpc } from './perfIpc'
import { registerMarketIpc } from './marketIpc'
import { registerScheduleIpc } from './scheduleIpc'
import { registerMenuIpc } from './menuIpc'

/** registerAllIpc 的全部依赖：各运行时对象 + 组合根回调 */
export interface IpcDeps {
  settings: SettingsController
  windows: WindowHub
  shortcuts: Pick<ShortcutsHub, 'applyEnabled'>
  events: EventRuntime
  stats: StatsRuntime
  autoReports: AutoReportRuntime
  push: PushRuntime
  passive: PassiveRuntime
  perf: PerfRuntime
  schedule: ScheduleRuntime
  log: LogFn
  notifyPet(channel: string, payload?: unknown): void
  notifyCenter(channel: string, payload?: unknown): void
  openCenter(tab?: string): void
  selectCharacter(id: string): void
  /** 当前活跃角色 id（menu:popup 现读） */
  getActiveCharacterId(): string
  /** 插件清单（plugin:list 现读） */
  getPlugins(): PluginManifest[]
}

/**
 * 注册全部 IPC 通道（按域分文件）。
 * 调用时机红线：必须先于 windows.createPet()（handle 先于渲染层 invoke）。
 */
export function registerAllIpc(deps: IpcDeps): void {
  registerSettingsIpc(deps)
  registerCharacterIpc(deps)
  registerWindowIpc(deps)
  registerEventsIpc(deps)
  registerStatsIpc(deps)
  registerAutoReportIpc(deps)
  registerPushIpc(deps)
  registerPassiveIpc(deps)
  registerPerfIpc(deps)
  registerMarketIpc(deps)
  registerScheduleIpc(deps)
  registerMenuIpc(deps)
}
