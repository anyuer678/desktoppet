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
  PushApiFired,
  PushApiGetResult,
  PushApiResetTokenResult,
  PushApiSetEnabledResult,
  PushApiTestResult,
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

declare global {
  interface Window {
    desktopPet: {
      version(): Promise<string>
      settings: {
        get(): Promise<Settings>
        set(patch: Partial<Settings>): Promise<Settings>
        filePath(): Promise<string>
      }
      character: {
        list(): Promise<CharacterSummary[]>
        get(id: string): Promise<CharacterDetail | CharacterLoaded>
        select(id: string): Promise<CharacterLoaded>
        pick(): Promise<string | null>
        import(zipPath: string, overwrite?: boolean): Promise<ImportResult>
        delete(id: string): Promise<ImportResult>
        export(id: string): Promise<ImportResult>
        update(id: string, patch: CharacterPatch): Promise<CharacterLoaded>
      }
      window: {
        hide(): Promise<void>
        quit(): Promise<void>
        dragBy(dx: number, dy: number): Promise<void>
        setSize(size: number): Promise<number>
        setOpacity(opacity: number): Promise<number>
        setIgnoreMouseEvents(ignore: boolean): Promise<void>
      }
      market: {
        catalog(): Promise<MarketEntryWithStatus[]>
        install(entryId: string): Promise<ImportResult>
      }
      plugin: {
        list(): Promise<PluginInfo[]>
      }
      schedule: {
        list(): Promise<ScheduleItem[]>
        create(input: ScheduleInput): Promise<{ ok: boolean; item?: ScheduleItem; error?: string }>
        update(id: string, input: ScheduleInput): Promise<{ ok: boolean; item?: ScheduleItem; error?: string }>
        delete(id: string): Promise<OpResult>
        toggle(id: string, enabled: boolean): Promise<OpResult>
        test(id: string): Promise<OpResult>
      }
      stats: {
        get(): Promise<StatsReport>
        range(start: string, end: string): Promise<StatsRangeResult>
        year(year: number): Promise<StatsYearResult>
        heatmap(year: number): Promise<StatsHeatmapResult>
        achievements(): Promise<StatsAchievementsResult>
        trend(cStart: string, cEnd: string, pStart: string, pEnd: string): Promise<StatsTrendResult>
        reportGenerate(mode: 'week' | 'month'): Promise<StatsReportGenerateResult>
        openReportDir(): Promise<OpResult>
        exportExcel(year: number): Promise<StatsSpreadsheetResult>
        exportCsv(start: string, end: string): Promise<StatsExportResult>
        deleteDay(date: string): Promise<OpResult>
        clearAll(): Promise<StatsClearResult>
        reportInteraction(kind: InteractionKind): void
      }
      autoReport: {
        get(): Promise<AutoReportGetResult>
        set(config: AutoReportConfig): Promise<AutoReportSetResult>
      }
      pushApi: {
        get(): Promise<PushApiGetResult>
        setEnabled(enabled: boolean): Promise<PushApiSetEnabledResult>
        resetToken(): Promise<PushApiResetTokenResult>
        test(): Promise<PushApiTestResult>
      }
      passive: {
        get(): Promise<PassiveGetResult>
        set(config: PassiveSourcesConfig): Promise<PassiveSetResult>
        test(sourceId: 'clipboard' | 'folder' | 'foreground'): Promise<PassiveTestResult>
      }
      center: {
        open(tab?: string): Promise<void>
      }
      menu: {
        popup(): Promise<void>
      }
      perf: {
        report(fps: number): void
        start(): Promise<PerfReport>
      }
      events: {
        onCharacterChanged(cb: (id: string) => void): () => void
        onTogglePause(cb: () => void): () => void
        onPetState(cb: (state: string) => void): () => void
        onPetSpeech(cb: (eventType: string) => void): () => void
        onScheduleFired(cb: (fired: ScheduleFired) => void): () => void
        onAutoReportFired(cb: (fired: AutoReportFired) => void): () => void
        onPushFired(cb: (fired: PushApiFired) => void): () => void
        history(): Promise<EventHistoryResult>
        clearHistory(): Promise<{ ok: boolean }>
        onHistoryChanged(cb: (payload: HistoryChanged) => void): () => void
        onSettingsChanged(cb: (patch: { size: number; opacity: number }) => void): () => void
      }
    }
  }
}

export {}
