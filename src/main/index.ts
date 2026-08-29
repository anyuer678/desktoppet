import { app, BrowserWindow, dialog, globalShortcut, ipcMain, Menu, protocol, screen, shell } from 'electron'
import { execFile } from 'child_process'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'
import { promisify } from 'util'
import type {
  AutoReportConfig,
  AutoReportFired,
  CharacterPatch,
  CharacterSummary,
  DailyStats,
  ImportResult,
  InteractionKind,
  MarketEntryWithStatus,
  OpResult,
  PerfSample,
  PluginInfo,
  PluginManifest,
  PushApiConfig,
  PushApiFired,
  ScheduleFired,
  ScheduleInput,
  ScheduleItem,
  Settings,
  PassiveSourcesConfig
} from '../shared/ipc'
import { isWithinRoot, listCharacters, readCharacterDetail } from './character/configReader'
import { updateCharacterConfig } from './character/configEditor'
import { importPetArchive, deletePetArchive, exportPetArchive, suggestPackFileName, validatePackId } from './character/importer'
import {
  charactersRoot,
  pluginsDir,
  reportOutputDir,
  settingsPath
} from './app/paths'
import { seedDefaultCharacters, seedDefaultPlugins } from './app/seed'
import { createWindowHub } from './window/windows'
import { createShortcutsHub } from './window/shortcuts'
import { createTray } from './window/tray'
import { PET_SCHEME_PRIVILEGES, registerPetProtocol } from './protocol/petProtocol'
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from './storage/settingsStore'
import { diffEventTypes } from './event/eventCenter'
import { createEventRuntime } from './event/eventRuntime'
import { createPassiveRuntime } from './event/passiveRuntime'
import { readMarketCatalog, installMarketEntry } from './market/catalog'
import { createLogger, type Logger } from './logging/logger'
import { loadPlugins, toPluginInfo } from './plugin/pluginHost'
import { validatePassiveConfig } from './event/passiveStore'
import {
  addStateTime,
  aggregateWeek,
  buildStatsCsv,
  computeStreak,
  countEvent,
  countInteraction,
  emptyStats,
  loadDailyRange,
  loadDailyRangeFullYear,
  loadDailyStats,
  summarizeYear,
  todayStr,
  validateRange
} from './stats/dailyStats'
import { computeAchievements } from './stats/achievements'
import { comparePeriods, generateReportFile } from './stats/report'
import { validateAutoReportConfig } from './stats/autoReportStore'
import { createStatsRuntime } from './stats/statsRuntime'
import { createAutoReportRuntime } from './stats/autoReportRuntime'
import { buildWorkbook } from './stats/spreadsheet'
import { createPushRuntime } from './push/pushRuntime'
import { createScheduleRuntime } from './schedule/scheduleRuntime'
import { createPerfRuntime } from './perf/perfRuntime'

let settings: Settings = DEFAULT_SETTINGS
let saveTimer: NodeJS.Timeout | null = null

// 事件中心运行时（活跃事件/历史/上次状态为其闭包私有状态）
const eventRuntime = createEventRuntime({ notifyPet, notifyCenter })

// 文件日志器（whenReady 中初始化，落盘到 %APPDATA%/DesktopPet/logs/）
let logger: Logger | null = null

// 插件系统（whenReady 中加载）
let loadedPlugins: PluginManifest[] = []

// 窗口运行时（pet/center 引用注册表；moved/位置修正经依赖回调回写 settings）
const windows = createWindowHub({
  getSettings: () => settings,
  onPetMoved: (position) => {
    settings = { ...settings, position }
    debouncedSaveSettings()
  },
  fixPetPosition: (position) => {
    settings = { ...settings, position }
    saveSettings(settingsPath(), settings)
  }
})

// 全局快捷键（依赖均为惰性 getter，创建时机无关）
const shortcuts = createShortcutsHub({
  getPetWindow: () => windows.pet(),
  openCenter,
  enabled: () => settings.shortcutsEnabled
})

// 陪伴统计运行时（目录/内存/防抖落盘/跨日与切角色为其私有状态；init 于 whenReady 调用）
const stats = createStatsRuntime({
  getActiveCharacterId: () => settings.activeCharacterId,
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

// tick 循环状态（上一轮 tick 时间戳；步骤⑧随 tick 迁入 runtime/tick.ts）
let lastTickAt = 0

function log(level: 'info' | 'warn' | 'error', message: string, ...args: unknown[]): void {
  logger?.[level](message, ...args)
}

/** PowerShell 命令执行器（前台窗口检测用，注入 passiveRuntime） */
const runPowerShell = promisify(execFile)
async function powershellRunner(cmd: string): Promise<string> {
  const { stdout } = await runPowerShell('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', cmd
  ])
  return stdout
}

function debouncedSaveSettings(): void {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => saveSettings(settingsPath(), settings), 300)
}

function notifyPet(channel: string, payload?: unknown): void {
  windows.notifyPet(channel, payload)
}

function notifyCenter(channel: string, payload?: unknown): void {
  windows.notifyCenter(channel, payload)
}

/** 读取市场目录下的预览图并转为 data URL（sandbox 渲染层无法直接 file:// 访问） */
function readPreviewDataUrl(marketDir: string, preview: string): string {
  if (!preview) return ''
  const filePath = resolve(marketDir, preview)
  if (!isWithinRoot(marketDir, filePath) || !existsSync(filePath)) return ''
  const ext = filePath.toLowerCase().split('.').pop() ?? ''
  const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ''
  if (!mime) return ''
  try {
    const buf = readFileSync(filePath)
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return ''
  }
}

function selectCharacter(id: string): void {
  settings = { ...settings, activeCharacterId: id }
  saveSettings(settingsPath(), settings)
  notifyPet('character:changed', id)
  stats.switchRole()
}

function openCenter(tab?: string): void {
  windows.openCenter(tab)
}

const MIN_PET_SIZE = 96
const MAX_PET_SIZE = 512

function registerIpc(): void {
  ipcMain.handle('settings:get', () => settings)
  ipcMain.handle('settings:filePath', () => settingsPath())
  ipcMain.handle('settings:set', (_e, patch: Partial<Settings>) => {
    const next: Partial<Settings> = { ...patch }
    if (typeof next.size === 'number') {
      next.size = Math.round(Math.min(MAX_PET_SIZE, Math.max(MIN_PET_SIZE, next.size)))
    }
    if (typeof next.opacity === 'number') {
      next.opacity = Math.min(1, Math.max(0.3, next.opacity))
    }
    // activeCharacterId 仅接受合法角色 id 或空串（删除全部角色后的兜底）；非法值忽略
    if ('activeCharacterId' in next) {
      const id = next.activeCharacterId
      if (typeof id !== 'string' || (id !== '' && validatePackId(id) !== null)) {
        delete next.activeCharacterId
      }
    }
    settings = { ...settings, ...next }
    saveSettings(settingsPath(), settings)
    windows.applyPetSize(settings.size)
    if (typeof patch.autoLaunch === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: patch.autoLaunch })
    }
    if (typeof patch.shortcutsEnabled === 'boolean') {
      shortcuts.applyEnabled(patch.shortcutsEnabled)
    }
    return settings
  })
  ipcMain.handle('character:list', () => {
    return listCharacters(charactersRoot()).map<CharacterSummary>((c) => ({
      id: c.id,
      name: c.name,
      version: c.version,
      preview: c.avatarPreview ? `pet://${c.id}/${c.avatarPreview}` : '',
      supportedStates: c.supportedStates
    }))
  })
  ipcMain.handle('character:get', (_e, id: string) => {
    const idError = validatePackId(id)
    if (idError) return { id, ok: false, error: idError }
    const detail = readCharacterDetail(charactersRoot(), id)
    return detail ?? { id, ok: false, error: '角色包加载失败或不存在' }
  })
  ipcMain.handle('character:select', (_e, id: string) => {
    if (id !== '' && validatePackId(id) !== null) {
      return { id, ok: false, error: '角色 id 不合法' }
    }
    selectCharacter(id)
    return { id, ok: true }
  })
  ipcMain.handle('character:pick', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.OpenDialogOptions = {
      title: '选择角色包',
      properties: ['openFile'],
      filters: [{ name: '角色包', extensions: ['pet', 'zip'] }]
    }
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
  ipcMain.handle('character:import', (_e, zipPath: string, overwrite?: boolean) => {
    return importPetArchive(zipPath, charactersRoot(), overwrite ? { overwrite: true } : undefined)
  })
  ipcMain.handle('character:delete', (_e, id: string) => {
    const result = deletePetArchive(charactersRoot(), id)
    if (result.ok && settings.activeCharacterId === id) {
      const fallback = listCharacters(charactersRoot())[0]?.id ?? ''
      settings = { ...settings, activeCharacterId: fallback }
      saveSettings(settingsPath(), settings)
      notifyPet('character:changed', fallback)
      stats.switchRole()
    }
    return result
  })
  ipcMain.handle('character:update', (_e, id: string, patch: CharacterPatch) => {
    const idError = validatePackId(id)
    if (idError) return { ok: false, id, error: idError }
    const result = updateCharacterConfig(join(charactersRoot(), id, 'config.json'), patch)
    if (result.ok) notifyPet('character:changed', id)
    return { ok: result.ok, id, error: result.error }
  })
  ipcMain.handle('character:export', async (event, id: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const options: Electron.SaveDialogOptions = {
      title: '导出角色包',
      defaultPath: suggestPackFileName(charactersRoot(), id),
      filters: [{ name: '角色包', extensions: ['pet'] }]
    }
    const result = win
      ? await dialog.showSaveDialog(win, options)
      : await dialog.showSaveDialog(options)
    if (result.canceled || !result.filePath) return { ok: false, error: '已取消导出' }
    return exportPetArchive(charactersRoot(), id, result.filePath)
  })
  ipcMain.handle('window:hide', () => windows.hidePet())
  ipcMain.handle('window:quit', () => app.quit())
  ipcMain.handle('window:dragBy', (_e, dx: number, dy: number) => {
    const win = windows.pet()
    if (!win) return
    if (typeof dx !== 'number' || !Number.isFinite(dx) || typeof dy !== 'number' || !Number.isFinite(dy)) return
    const [x, y] = win.getPosition()
    win.setPosition(x + Math.round(dx), y + Math.round(dy))
  })
  ipcMain.handle('window:setSize', (_e, size: number) => {
    settings = { ...settings, size: Math.round(Math.min(MAX_PET_SIZE, Math.max(MIN_PET_SIZE, size))) }
    saveSettings(settingsPath(), settings)
    windows.applyPetSize(settings.size)
    return settings.size
  })
  ipcMain.handle('window:setOpacity', (_e, opacity: number) => {
    const clamped = Math.min(1, Math.max(0.3, opacity))
    settings = { ...settings, opacity: clamped }
    saveSettings(settingsPath(), settings)
    notifyPet('pet:settings-changed', { size: settings.size, opacity: clamped })
    return settings.opacity
  })
  ipcMain.handle('window:setIgnoreMouseEvents', (_e, ignore: boolean) => {
    windows.pet()?.setIgnoreMouseEvents(ignore, { forward: true })
    log('info', '[pet-hit] ignore =', ignore)
  })
  ipcMain.handle('center:open', (_e, tab?: string) => openCenter(tab))
  ipcMain.handle('app:version', () => app.getVersion())
  ipcMain.handle('events:history', () => ({ ok: true, events: eventRuntime.history().list() }))
  ipcMain.handle('events:historyClear', () => {
    eventRuntime.history().clear()
    notifyCenter('pet:events:history', { events: [] })
    return { ok: true }
  })
  ipcMain.on('pet:interact', (_e, kind: unknown) => {
    if (kind !== 'click' && kind !== 'drag' && kind !== 'speak') return
    stats.record((s) => countInteraction(s, kind as InteractionKind))
  })
  ipcMain.handle('stats:report', () => {
    // 先做跨日/切角色检查，再将今日内存统计落盘，保证「本周」聚合与磁盘一致（含进行中的时长）
    stats.ensureDate(Date.now())
    stats.flush()
    return {
      today: stats.today() ?? emptyStats(''),
      week: aggregateWeek(stats.dir(), stats.date()),
      streak: computeStreak(stats.dir(), stats.date())
    }
  })
  ipcMain.handle('stats:range', (_e, start: unknown, end: unknown) => {
    if (typeof start !== 'string' || typeof end !== 'string') {
      return { ok: false, error: '日期格式应为 YYYY-MM-DD' }
    }
    const v = validateRange(start, end)
    if (!v.ok) return v
    return { ok: true, days: loadDailyRange(stats.dir(), start, end) }
  })
  ipcMain.handle('stats:year', (_e, year: unknown) => {
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return { ok: false, error: '年份应在 2000~2100 之间' }
    }
    return { ok: true, summary: summarizeYear(stats.dir(), year) }
  })
  ipcMain.handle('stats:heatmap', (_e, year: unknown) => {
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return { ok: false, error: '年份应在 2000~2100 之间' }
    }
    return { ok: true, days: loadDailyRangeFullYear(stats.dir(), year) }
  })
  ipcMain.handle('stats:achievements', () => ({
    ok: true,
    achievements: computeAchievements(stats.dir(), stats.roleId(), todayStr())
  }))
  ipcMain.handle('stats:trend', (_e, cStart: unknown, cEnd: unknown, pStart: unknown, pEnd: unknown) => {
    const four = [cStart, cEnd, pStart, pEnd]
    if (!four.every((x) => typeof x === 'string')) return { ok: false, error: '日期格式应为 YYYY-MM-DD' }
    const [cs, ce, ps, pe] = four as string[]
    const v1 = validateRange(cs, ce)
    const v2 = validateRange(ps, pe)
    if (!v1.ok) return v1
    if (!v2.ok) return v2
    const compare = comparePeriods(stats.dir(), stats.roleId(), cs, ce, ps, pe)
    return { ok: true, compare }
  })
  ipcMain.handle('stats:report:generate', async (_e, mode: unknown) => {
    const m = mode === 'month' ? 'month' : mode === 'week' ? 'week' : null
    if (!m) return { ok: false, error: 'mode 应为 week 或 month' }
    try {
      const { path } = generateReportFile({
        dir: stats.dir(),
        outputDir: join(app.getPath('documents'), 'DesktopPet', '报告'),
        mode: m
      })
      log('info', '[stats:report:generate] saved', path)
      return { ok: true, path }
    } catch (err) {
      log('error', '[stats:report:generate]', err)
      return { ok: false, error: '报告写入失败' }
    }
  })
  ipcMain.handle('autoReport:get', () => ({ ok: true, config: autoReports.config() }))
  ipcMain.handle('autoReport:set', (_e, cfg: unknown) => {
    const err = validateAutoReportConfig(cfg)
    if (err) return { ok: false, error: err }
    autoReports.setConfig(cfg as AutoReportConfig)
    return { ok: true }
  })
  ipcMain.handle('pushApi:get', () => ({
    ok: true,
    info: {
      enabled: push.config().enabled,
      port: push.port(),
      token: push.config().token
    }
  }))
  ipcMain.handle('pushApi:setEnabled', (_e, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return { ok: false, error: 'enabled 必须为布尔' }
    push.setEnabled(enabled)
    if (enabled) {
      push.start()
    } else {
      void push.stop().then(() => notifyCenter('pushApi:state', { enabled: false, port: 0 }))
    }
    return { ok: true }
  })
  ipcMain.handle('pushApi:resetToken', () => {
    push.ensureToken(true)
    return { ok: true, token: push.config().token }
  })
  ipcMain.handle('pushApi:test', () => {
    push.fireEvent({ title: '测试推送', message: '桌宠收到啦，链路正常', type: 'complete' })
    return { ok: true }
  })
  ipcMain.handle('passive:get', () => ({ ok: true, config: passive.config() }))
  ipcMain.handle('passive:set', (_e, cfg: unknown) => {
    const err = validatePassiveConfig(cfg)
    if (err) return { ok: false, error: err }
    passive.setConfig(cfg as PassiveSourcesConfig)
    passive.rebuild()
    log('info', '[passive] config updated')
    return { ok: true }
  })
  ipcMain.handle('passive:test', (_e, sourceId: unknown) => passive.test(sourceId))
  ipcMain.handle('stats:openReportDir', async () => {
    const dir = reportOutputDir()
    try {
      const err = await shell.openPath(dir)
      if (err) return { ok: false, error: `打开失败：${err}` }
      return { ok: true }
    } catch (err) {
      log('error', '[stats:openReportDir]', err)
      return { ok: false, error: '打开失败' }
    }
  })
  ipcMain.handle('stats:exportExcel', async (_e, year: unknown) => {
    if (typeof year !== 'number' || !Number.isInteger(year) || year < 2000 || year > 2100) {
      return { ok: false, error: '年份应在 2000~2100 之间' }
    }
    const days = loadDailyRangeFullYear(stats.dir(), year)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出 Excel 统计',
      defaultPath: join(app.getPath('documents'), `陪伴统计-${stats.roleId()}-${year}.xlsx`),
      filters: [{ name: 'Excel', extensions: ['xlsx'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      const buf = await buildWorkbook(days)
      writeFileSync(filePath, buf)
      log('info', '[stats:exportExcel] saved', filePath)
      return { ok: true, path: filePath }
    } catch (err) {
      log('error', '[stats:exportExcel]', err)
      return { ok: false, error: '导出 Excel 失败' }
    }
  })
  ipcMain.handle('stats:exportCsv', async (_e, start: unknown, end: unknown) => {
    if (typeof start !== 'string' || typeof end !== 'string') {
      return { ok: false, error: '日期格式应为 YYYY-MM-DD' }
    }
    const v = validateRange(start, end)
    if (!v.ok || !v.dates) return v
    const rows = v.dates.map((d) => ({ date: d, stats: loadDailyStats(stats.dir(), d) }))
    const csv = buildStatsCsv(rows)
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出陪伴统计',
      defaultPath: join(app.getPath('documents'), `陪伴统计-${start}-至-${end}.csv`),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    try {
      writeFileSync(filePath, '\ufeff' + csv, 'utf-8')
      log('info', '[stats:exportCsv] saved', filePath)
      return { ok: true, path: filePath }
    } catch (err) {
      log('error', '[stats:exportCsv] write failed:', err)
      return { ok: false, error: '导出文件写入失败' }
    }
  })
  ipcMain.handle('stats:deleteDay', (_e, date: unknown) => {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return { ok: false, error: '日期格式应为 YYYY-MM-DD' }
    }
    stats.deleteDay(date)
    return { ok: true }
  })
  ipcMain.handle('stats:clearAll', () => {
    const deleted = stats.clearAll()
    log('info', '[stats:clearAll] deleted', deleted, 'files')
    return { ok: true, deleted }
  })
  ipcMain.on('perf:fps', (_e, fps: unknown) => {
    perf.onFps(fps)
  })
  ipcMain.handle('perf:start', () => perf.sample())
  ipcMain.handle('market:catalog', () => {
    const marketDir = join(charactersRoot(), 'market')
    const catalog = readMarketCatalog(marketDir)
    log('info', '[market:catalog] marketDir=', marketDir, 'entries=', catalog.length)
    const installed = new Map(listCharacters(charactersRoot()).map((c) => [c.id, c.version]))
    return catalog.map<MarketEntryWithStatus>((e) => ({
      ...e,
      installed: installed.has(e.id),
      installedVersion: installed.get(e.id),
      previewDataUrl: readPreviewDataUrl(marketDir, e.preview)
    }))
  })
  ipcMain.handle('market:install', (_e, entryId: string) => {
    const marketDir = join(charactersRoot(), 'market')
    return installMarketEntry(marketDir, entryId, charactersRoot())
  })
  ipcMain.handle('plugin:list', () => toPluginInfo(loadedPlugins))
  ipcMain.handle('schedule:list', () => schedule.repo()?.list() ?? [])
  ipcMain.handle('schedule:create', (_e, input: ScheduleInput) => {
    const repo = schedule.repo()
    if (!repo) return { ok: false, error: '调度器未初始化' }
    const r = repo.create(input)
    return r.ok ? { ok: true, item: r.item } : { ok: false, error: r.error }
  })
  ipcMain.handle('schedule:update', (_e, id: string, input: ScheduleInput) => {
    const repo = schedule.repo()
    if (!repo) return { ok: false, error: '调度器未初始化' }
    const r = repo.update(id, input)
    return r.ok ? { ok: true, item: r.item } : { ok: false, error: r.error }
  })
  ipcMain.handle('schedule:delete', (_e, id: string) => {
    const repo = schedule.repo()
    if (!repo) return { ok: false, error: '调度器未初始化' }
    return repo.remove(id)
  })
  ipcMain.handle('schedule:toggle', (_e, id: string, enabled: boolean) => {
    const repo = schedule.repo()
    if (!repo) return { ok: false, error: '调度器未初始化' }
    return repo.setEnabled(id, enabled)
  })
  ipcMain.handle('schedule:test', (_e, id: string) => schedule.testFire(id))
  ipcMain.handle('menu:popup', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const template: Electron.MenuItemConstructorOptions[] = [
      { label: '打开控制中心', click: () => openCenter() },
      { label: '设置', click: () => openCenter('settings') },
      {
        label: '换一个',
        click: () => {
          const chars = listCharacters(charactersRoot())
          if (chars.length < 2) return
          const idx = chars.findIndex((c) => c.id === settings.activeCharacterId)
          const next = chars[(idx + 1) % chars.length]
          selectCharacter(next.id)
        }
      },
      { label: '隐藏', click: () => windows.hidePet() },
      { type: 'separator' },
      {
        label: '切换角色',
        submenu: listCharacters(charactersRoot()).map<Electron.MenuItemConstructorOptions>((c) => ({
          label: c.name,
          type: 'radio',
          checked: c.id === settings.activeCharacterId,
          click: () => selectCharacter(c.id)
        }))
      },
      { label: '暂停动画', click: () => notifyPet('pet:toggle-pause') },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ]
    Menu.buildFromTemplate(template).popup({ window: win })
  })
}

// 红线：协议特权声明必须在 app ready 之前执行（声明晚于 ready 会静默失效）
protocol.registerSchemesAsPrivileged([PET_SCHEME_PRIVILEGES])

app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    openCenter()
  })

  app.whenReady().then(() => {
    logger = createLogger(join(app.getPath('userData'), 'logs'))
    log('info', 'DesktopPet starting, userData=', app.getPath('userData'))
    seedDefaultCharacters(log)
    seedDefaultPlugins(log)
    loadedPlugins = loadPlugins(pluginsDir())
    log('info', '[plugins] loaded', loadedPlugins.length, 'plugins from', pluginsDir())
    settings = loadSettings(settingsPath())
    schedule.start()
    stats.init()
    autoReports.start()
    push.loadConfig()
    passive.loadConfig()
    push.start()
    registerPetProtocol({ log })
    registerIpc()
    windows.ensurePetPosition()
    createTray({ showPet: () => windows.showPet(), hidePet: () => windows.hidePet(), openCenter })
    windows.createPet()
    shortcuts.register()
    screen.on('display-metrics-changed', () => windows.ensurePetPosition())

    passive.start()
    lastTickAt = Date.now()
    // 上一轮活跃事件类型（新增类型才广播 pet:speech 让桌宠说话，避免持续事件刷屏）
    let lastEventTypes = new Set<string>()
    const tick = (): void => {
      const now = Date.now()
      stats.ensureDate(now)
      // 陪伴统计：按实际间隔累加当前状态时长（秒），并记录到小时分段
      if (stats.today() && lastTickAt > 0) {
        stats.record((s) => addStateTime(s, eventRuntime.currentState(), (now - lastTickAt) / 1000, now))
      }
      lastTickAt = now
      passive.tick(now)
      const diff = diffEventTypes(lastEventTypes, eventRuntime.active(now))
      for (const t of diff.added) {
        notifyPet('pet:speech', t)
        stats.record((s) => countEvent(s, t))
      }
      lastEventTypes = diff.current
      eventRuntime.syncStateAndNotify(now)
    }
    tick()
    setInterval(tick, 4000)

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) windows.createPet()
    })
  })

  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    schedule.stop()
    // passive.stop 内部保持原顺序：电池采样先停、hub 后停
    passive.stop()
    void push.stop()
    stats.dispose()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })
}