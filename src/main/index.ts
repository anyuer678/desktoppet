import { app, BrowserWindow, globalShortcut, protocol, screen } from 'electron'
import { join } from 'path'
import { promisify } from 'util'
import { execFile } from 'child_process'
import type { PluginManifest } from '../shared/ipc'
import { pluginsDir } from './app/paths'
import { seedDefaultCharacters, seedDefaultPlugins } from './app/seed'
import { acquireSingleInstanceLock, registerQuitCleanup } from './app/lifecycle'
import { createWindowHub } from './window/windows'
import { createShortcutsHub } from './window/shortcuts'
import { createTray } from './window/tray'
import { PET_SCHEME_PRIVILEGES, registerPetProtocol } from './protocol/petProtocol'
import { createSettingsController } from './settings/settingsController'
import { createEventRuntime } from './event/eventRuntime'
import { createPassiveRuntime } from './event/passiveRuntime'
import { createLogger, type Logger } from './logging/logger'
import { loadPlugins } from './plugin/pluginHost'
import { createStatsRuntime } from './stats/statsRuntime'
import { createAutoReportRuntime } from './stats/autoReportRuntime'
import { createPushRuntime } from './push/pushRuntime'
import { createScheduleRuntime } from './schedule/scheduleRuntime'
import { createPerfRuntime } from './perf/perfRuntime'
import { createTickLoop } from './runtime/tick'
import { createUpdater } from './app/updater'
import { registerAllIpc } from './ipc'

// ---------------------------------------------------------------------------
// 组合根：只负责创建各运行时、按依赖注入接线、驱动生命周期。无业务逻辑。
// ---------------------------------------------------------------------------

// 文件日志器（whenReady 中初始化，落盘到 %APPDATA%/DesktopPet/logs/）
let logger: Logger | null = null

// 插件系统（whenReady 中加载；getter 现读，杜绝启动时快照）
let loadedPlugins: PluginManifest[] = []

function log(level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
  logger?.[level](message, ...args)
}

// 窗口运行时（pet/center 引用注册表；moved/位置修正经 settingsCtl 回写）
const windows = createWindowHub({
  getSettings: () => settingsCtl.get(),
  onPetMoved: (position) => settingsCtl.onPetMoved(position),
  fixPetPosition: (position) => settingsCtl.fixPosition(position)
})

// settings 状态持有者（唯一可变 settings 收敛于此闭包）
const settingsCtl = createSettingsController({
  applyShortcutsEnabled: (enabled) => shortcuts.applyEnabled(enabled),
  applyPetSize: (size) => windows.applyPetSize(size),
  notifyPet: (channel, payload) => windows.notifyPet(channel, payload)
})

// 全局快捷键（依赖均为惰性 getter，创建时机无关）
const shortcuts = createShortcutsHub({
  getPetWindow: () => windows.pet(),
  openCenter: (tab) => windows.openCenter(tab),
  enabled: () => settingsCtl.get().shortcutsEnabled
})

// 窗口广播快捷别名（惰性取当前窗口，不捕获快照）
const notifyPet = (channel: string, payload?: unknown): void => windows.notifyPet(channel, payload)
const notifyCenter = (channel: string, payload?: unknown): void => windows.notifyCenter(channel, payload)

// 事件中心运行时（活跃事件/历史/上次状态为其闭包私有状态）
const eventRuntime = createEventRuntime({ notifyPet, notifyCenter })

// 陪伴统计运行时（目录/内存/防抖落盘/跨日与切角色为其私有状态；init 于 whenReady 调用）
const stats = createStatsRuntime({
  getActiveCharacterId: () => settingsCtl.get().activeCharacterId,
  log
})

// 自动报告运行时（statsDir 经 getter 现读，角色切换后报告写入新目录）
const autoReports = createAutoReportRuntime({
  getStatsDir: () => stats.dir(),
  notifyPet,
  notifyCenter,
  log
})

// 推送 API 运行时（配置/token/服务句柄/事件计数器为其私有状态）
const push = createPushRuntime({
  events: eventRuntime,
  stats,
  notifyPet,
  notifyCenter,
  log
})

// 日程运行时（仓库/调度器停止句柄为其私有状态）
const schedule = createScheduleRuntime({
  events: eventRuntime,
  stats,
  notifyPet,
  notifyCenter,
  log
})

/** PowerShell 命令执行器（前台窗口检测用，注入 passiveRuntime） */
const runPowerShell = promisify(execFile)
const powershellRunner = async (cmd: string): Promise<string> => {
  const { stdout } = await runPowerShell('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', cmd
  ])
  return stdout
}

// 被动数据源运行时（配置/hub/采样器为其私有状态；插件清单经 getter 现读）
const passive = createPassiveRuntime({
  events: eventRuntime,
  stats,
  notifyPet,
  getPlugins: () => loadedPlugins,
  powershellRunner,
  log
})

// 性能采样运行时（latestFps 为其私有状态）
const perf = createPerfRuntime({ windows })

// 主循环（4s tick；lastTickAt/lastEventTypes 为其闭包私有状态）
const tickLoop = createTickLoop({
  stats,
  events: eventRuntime,
  passive,
  notifyPet
})

/** 切换角色：更新 settings → 落盘 → 通知渲染层 → 统计切目录 */
function selectCharacter(id: string): void {
  settingsCtl.setActiveCharacter(id)
  notifyPet('character:changed', id)
  stats.switchRole()
}

// 红线：协议特权声明必须在 app ready 之前执行（声明晚于 ready 会静默失效）
protocol.registerSchemesAsPrivileged([PET_SCHEME_PRIVILEGES])

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

if (!acquireSingleInstanceLock(() => windows.openCenter())) {
  app.quit()
} else {
  app.whenReady().then(() => {
    logger = createLogger(join(app.getPath('userData'), 'logs'))
    log('info', 'DesktopPet starting, userData=', app.getPath('userData'))
    seedDefaultCharacters(log)
    seedDefaultPlugins(log)
    loadedPlugins = loadPlugins(pluginsDir())
    log('info', '[plugins] loaded', loadedPlugins.length, 'plugins from', pluginsDir())
    settingsCtl.load()
    schedule.start()
    stats.init()
    autoReports.start()
    push.loadConfig()
    passive.loadConfig()
    push.start()
    registerPetProtocol({ log })
    // 红线：IPC 注册必须先于 windows.createPet()（handle 先于渲染层 invoke）
    registerAllIpc({
      settings: settingsCtl,
      windows,
      shortcuts,
      events: eventRuntime,
      stats,
      autoReports,
      push,
      passive,
      perf,
      schedule,
      log,
      notifyPet,
      notifyCenter,
      openCenter: (tab) => windows.openCenter(tab),
      selectCharacter,
      getActiveCharacterId: () => settingsCtl.get().activeCharacterId,
      getPlugins: () => loadedPlugins
    })
    windows.ensurePetPosition()
    createTray({
      showPet: () => windows.showPet(),
      hidePet: () => windows.hidePet(),
      openCenter: (tab) => windows.openCenter(tab)
    })
    windows.createPet()
    shortcuts.register()
    screen.on('display-metrics-changed', () => windows.ensurePetPosition())

    passive.start()
    tickLoop.start()

    // 自动更新检查（启动后 30 秒延迟）
    const updater = createUpdater({
      getMainWindow: () => windows.center(),
      log
    })
    updater.start()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) windows.createPet()
    })
  })

  // 退出清理顺序红线：globalShortcut → 调度器 → 被动源（电池先停、hub 后停）→ 推送 → 统计最后落盘
  registerQuitCleanup([
    () => globalShortcut.unregisterAll(),
    () => schedule.stop(),
    () => passive.stop(),
    () => push.stop(),
    () => stats.dispose()
  ])

  app.on('window-all-closed', () => {
    app.quit()
  })
}
