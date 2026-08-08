import { contextBridge, ipcRenderer } from 'electron'
import type {
  AutoReportConfig,
  AutoReportFired,
  AutoReportGetResult,
  AutoReportSetResult,
  CharacterDetail,
  CharacterLoaded,
  CharacterPatch,
  CharacterSummary,
  EventHistoryResult,
  HistoryChanged,
  ImportResult,
  InteractionKind,
  MarketEntryWithStatus,
  OpResult,
  PassiveGetResult,
  PassiveSetResult,
  PassiveTestResult,
  PassiveSourcesConfig,
  PerfReport,
  PluginInfo,
  PushApiGetResult,
  PushApiResetTokenResult,
  PushApiSetEnabledResult,
  PushApiTestResult,
  PushApiFired,
  ScheduleFired,
  ScheduleInput,
  ScheduleItem,
  Settings,
  StatsAchievementsResult,
  StatsClearResult,
  StatsExportResult,
  StatsHeatmapResult,
  StatsRangeResult,
  StatsReport,
  StatsReportGenerateResult,
  StatsSpreadsheetResult,
  StatsTrendResult,
  StatsYearResult
} from '../shared/ipc'

const api = {
  version: (): Promise<string> => ipcRenderer.invoke('app:version'),
  settings: {
    get: (): Promise<Settings> => ipcRenderer.invoke('settings:get'),
    set: (patch: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke('settings:set', patch),
    filePath: (): Promise<string> => ipcRenderer.invoke('settings:filePath')
  },
  character: {
    list: (): Promise<CharacterSummary[]> => ipcRenderer.invoke('character:list'),
    get: (id: string): Promise<CharacterDetail | CharacterLoaded> =>
      ipcRenderer.invoke('character:get', id),
    select: (id: string): Promise<CharacterLoaded> => ipcRenderer.invoke('character:select', id),
    pick: (): Promise<string | null> => ipcRenderer.invoke('character:pick'),
    import: (zipPath: string, overwrite?: boolean): Promise<ImportResult> =>
      ipcRenderer.invoke('character:import', zipPath, overwrite),
    delete: (id: string): Promise<ImportResult> => ipcRenderer.invoke('character:delete', id),
    export: (id: string): Promise<ImportResult> => ipcRenderer.invoke('character:export', id),
    update: (id: string, patch: CharacterPatch): Promise<CharacterLoaded> =>
      ipcRenderer.invoke('character:update', id, patch)
  },
  window: {
    hide: (): Promise<void> => ipcRenderer.invoke('window:hide'),
    quit: (): Promise<void> => ipcRenderer.invoke('window:quit'),
    dragBy: (dx: number, dy: number): Promise<void> => ipcRenderer.invoke('window:dragBy', dx, dy),
    setSize: (size: number): Promise<number> => ipcRenderer.invoke('window:setSize', size),
    setOpacity: (opacity: number): Promise<number> => ipcRenderer.invoke('window:setOpacity', opacity),
    setIgnoreMouseEvents: (ignore: boolean): Promise<void> =>
      ipcRenderer.invoke('window:setIgnoreMouseEvents', ignore)
  },
  market: {
    catalog: (): Promise<MarketEntryWithStatus[]> => ipcRenderer.invoke('market:catalog'),
    install: (entryId: string): Promise<ImportResult> => ipcRenderer.invoke('market:install', entryId)
  },
  plugin: {
    list: (): Promise<PluginInfo[]> => ipcRenderer.invoke('plugin:list')
  },
  schedule: {
    list: (): Promise<ScheduleItem[]> => ipcRenderer.invoke('schedule:list'),
    create: (input: ScheduleInput): Promise<{ ok: boolean; item?: ScheduleItem; error?: string }> =>
      ipcRenderer.invoke('schedule:create', input),
    update: (id: string, input: ScheduleInput): Promise<{ ok: boolean; item?: ScheduleItem; error?: string }> =>
      ipcRenderer.invoke('schedule:update', id, input),
    delete: (id: string): Promise<OpResult> => ipcRenderer.invoke('schedule:delete', id),
    toggle: (id: string, enabled: boolean): Promise<OpResult> =>
      ipcRenderer.invoke('schedule:toggle', id, enabled),
    test: (id: string): Promise<OpResult> => ipcRenderer.invoke('schedule:test', id)
  },
  stats: {
    get: (): Promise<StatsReport> => ipcRenderer.invoke('stats:report'),
    range: (start: string, end: string): Promise<StatsRangeResult> =>
      ipcRenderer.invoke('stats:range', start, end),
    year: (year: number): Promise<StatsYearResult> => ipcRenderer.invoke('stats:year', year),
    heatmap: (year: number): Promise<StatsHeatmapResult> => ipcRenderer.invoke('stats:heatmap', year),
    achievements: (): Promise<StatsAchievementsResult> => ipcRenderer.invoke('stats:achievements'),
    trend: (cStart: string, cEnd: string, pStart: string, pEnd: string): Promise<StatsTrendResult> =>
      ipcRenderer.invoke('stats:trend', cStart, cEnd, pStart, pEnd),
    reportGenerate: (mode: 'week' | 'month'): Promise<StatsReportGenerateResult> =>
      ipcRenderer.invoke('stats:report:generate', mode),
    openReportDir: (): Promise<OpResult> => ipcRenderer.invoke('stats:openReportDir'),
    exportExcel: (year: number): Promise<StatsSpreadsheetResult> =>
      ipcRenderer.invoke('stats:exportExcel', year),
    exportCsv: (start: string, end: string): Promise<StatsExportResult> =>
      ipcRenderer.invoke('stats:exportCsv', start, end),
    deleteDay: (date: string): Promise<OpResult> => ipcRenderer.invoke('stats:deleteDay', date),
    clearAll: (): Promise<StatsClearResult> => ipcRenderer.invoke('stats:clearAll'),
    reportInteraction: (kind: InteractionKind): void => ipcRenderer.send('pet:interact', kind)
  },
  autoReport: {
    get: (): Promise<AutoReportGetResult> => ipcRenderer.invoke('autoReport:get'),
    set: (config: AutoReportConfig): Promise<AutoReportSetResult> =>
      ipcRenderer.invoke('autoReport:set', config)
  },
  pushApi: {
    get: (): Promise<PushApiGetResult> => ipcRenderer.invoke('pushApi:get'),
    setEnabled: (enabled: boolean): Promise<PushApiSetEnabledResult> =>
      ipcRenderer.invoke('pushApi:setEnabled', enabled),
    resetToken: (): Promise<PushApiResetTokenResult> => ipcRenderer.invoke('pushApi:resetToken'),
    test: (): Promise<PushApiTestResult> => ipcRenderer.invoke('pushApi:test')
  },
  passive: {
    get: (): Promise<PassiveGetResult> => ipcRenderer.invoke('passive:get'),
    set: (config: PassiveSourcesConfig): Promise<PassiveSetResult> =>
      ipcRenderer.invoke('passive:set', config),
    test: (sourceId: 'clipboard' | 'folder' | 'foreground'): Promise<PassiveTestResult> =>
      ipcRenderer.invoke('passive:test', sourceId)
  },
  center: {
    open: (tab?: string): Promise<void> => ipcRenderer.invoke('center:open', tab)
  },
  menu: {
    popup: (): Promise<void> => ipcRenderer.invoke('menu:popup')
  },
  perf: {
    report: (fps: number): void => ipcRenderer.send('perf:fps', fps),
    start: (): Promise<PerfReport> => ipcRenderer.invoke('perf:start')
  },
  events: {
    onCharacterChanged: (cb: (id: string) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, id: string): void => cb(id)
      ipcRenderer.on('character:changed', handler)
      return () => ipcRenderer.removeListener('character:changed', handler)
    },
    onTogglePause: (cb: () => void): (() => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('pet:toggle-pause', handler)
      return () => ipcRenderer.removeListener('pet:toggle-pause', handler)
    },
    onPetState: (cb: (state: string) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, state: string): void => cb(state)
      ipcRenderer.on('pet:state', handler)
      return () => ipcRenderer.removeListener('pet:state', handler)
    },
    onPetSpeech: (cb: (eventType: string) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, eventType: string): void => cb(eventType)
      ipcRenderer.on('pet:speech', handler)
      return () => ipcRenderer.removeListener('pet:speech', handler)
    },
    onScheduleFired: (cb: (fired: ScheduleFired) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, fired: ScheduleFired): void => cb(fired)
      ipcRenderer.on('schedule:fired', handler)
      return () => ipcRenderer.removeListener('schedule:fired', handler)
    },
    onAutoReportFired: (cb: (fired: AutoReportFired) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, fired: AutoReportFired): void => cb(fired)
      ipcRenderer.on('autoReport:fired', handler)
      return () => ipcRenderer.removeListener('autoReport:fired', handler)
    },
    onPushFired: (cb: (fired: PushApiFired) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, fired: PushApiFired): void => cb(fired)
      ipcRenderer.on('push:fired', handler)
      return () => ipcRenderer.removeListener('push:fired', handler)
    },
    history: (): Promise<EventHistoryResult> => ipcRenderer.invoke('events:history'),
    clearHistory: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('events:historyClear'),
    onHistoryChanged: (cb: (payload: HistoryChanged) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, payload: HistoryChanged): void => cb(payload)
      ipcRenderer.on('pet:events:history', handler)
      return () => ipcRenderer.removeListener('pet:events:history', handler)
    },
    onSettingsChanged: (cb: (patch: { size: number; opacity: number }) => void): (() => void) => {
      const handler = (_e: Electron.IpcRendererEvent, patch: { size: number; opacity: number }): void =>
        cb(patch)
      ipcRenderer.on('pet:settings-changed', handler)
      return () => ipcRenderer.removeListener('pet:settings-changed', handler)
    }
  }
}

contextBridge.exposeInMainWorld('desktopPet', api)