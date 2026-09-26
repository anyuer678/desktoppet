import { useEffect, useRef, useState } from 'react'
import type {
  Achievements,
  AutoReportConfig,
  CharacterDetail,
  CharacterSummary,
  EventHistoryResult,
  HistoryChanged,
  MarketEntryWithStatus,
  PassiveSourcesConfig,
  PerfReport,
  PeriodCompareResult,
  PetEventInfo,
  PluginInfo,
  PushApiInfo,
  RangeDay,
  ScheduleInput,
  ScheduleItem,
  Settings,
  StatsReport,
  YearSummary
} from '../../../shared/ipc'
import { DEFAULT_SPEECH, type SpeechPoolKey, type SpeechPools } from '../../../shared/speech'
import { filterHistory, groupLabel, stateOf } from '../../../shared/eventState'
import type { InteractionAction } from '../../../shared/ipc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { EMPTY_EDIT_FORM, SPEECH_KEYS, TABS, Tab, buildEmptyScheduleForm, daysAgoStr, monthDates, scheduleToForm, todayStr } from './centerShared'
import { HomeTab } from './tabs/HomeTab'
import { CharactersTab } from './tabs/CharactersTab'
import { MarketTab } from './tabs/MarketTab'
import { SpeechTab } from './tabs/SpeechTab'
import { ScheduleListTab } from './tabs/ScheduleListTab'
import { ScheduleEditTab } from './tabs/ScheduleEditTab'
import { StatsTab } from './tabs/StatsTab'
import { PushTab } from './tabs/PushTab'
import { EventsTab } from './tabs/EventsTab'
import { DevTab } from './tabs/DevTab'
import { SettingsTab } from './tabs/SettingsTab'

export function CenterApp(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('home')
  const [appVersion, setAppVersion] = useState('')
  const [characters, setCharacters] = useState<CharacterSummary[]>([])
  const [settings, setSettings] = useState<Settings | null>(null)
  const [activeId, setActiveId] = useState('')
  const [state, setState] = useState('idle')
  const [historyEvents, setHistoryEvents] = useState<PetEventInfo[]>([])
  const [histSource, setHistSource] = useState('')
  const [histState, setHistState] = useState('')
  const [histHighOnly, setHistHighOnly] = useState(false)
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)
  const [marketEntries, setMarketEntries] = useState<MarketEntryWithStatus[]>([])
  const [marketBusy, setMarketBusy] = useState(false)
  const [marketError, setMarketError] = useState('')
  const [marketOk, setMarketOk] = useState('')
  const [plugins, setPlugins] = useState<PluginInfo[]>([])
  const [perfBusy, setPerfBusy] = useState(false)
  const [perfReport, setPerfReport] = useState<PerfReport | null>(null)
  const [statsReport, setStatsReport] = useState<StatsReport | null>(null)
  const [statsError, setStatsError] = useState('')
  const [rangeDays, setRangeDays] = useState<RangeDay[] | null>(null)
  const [rangeError, setRangeError] = useState('')
  const [rangeStart, setRangeStart] = useState(() => daysAgoStr(6))
  const [rangeEnd, setRangeEnd] = useState(todayStr)
  const [rangeBusy, setRangeBusy] = useState(false)
  const [heatmapMonth, setHeatmapMonth] = useState(() => {
    const d = new Date()
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
  const [heatmapDays, setHeatmapDays] = useState<RangeDay[] | null>(null)
  const [heatmapError, setHeatmapError] = useState('')
  const [yearHeatYear, setYearHeatYear] = useState(() => new Date().getFullYear())
  const [yearHeatDays, setYearHeatDays] = useState<RangeDay[] | null>(null)
  const [yearHeatError, setYearHeatError] = useState('')
  const [selectedDay, setSelectedDay] = useState<RangeDay | null>(null)
  const [achievements, setAchievements] = useState<Achievements | null>(null)
  const [confirmDeleteDay, setConfirmDeleteDay] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const [exportMsg, setExportMsg] = useState('')
  const [autoReportCfg, setAutoReportCfg] = useState<AutoReportConfig | null>(null)
  const [autoReportMsg, setAutoReportMsg] = useState('')
  const [autoReportSaving, setAutoReportSaving] = useState(false)
  const [pushApiInfo, setPushApiInfo] = useState<PushApiInfo | null>(null)
  const [pushApiMsg, setPushApiMsg] = useState('')
  const [passiveCfg, setPassiveCfg] = useState<PassiveSourcesConfig | null>(null)
  const [passiveMsg, setPassiveMsg] = useState('')
  const [yearSummary, setYearSummary] = useState<YearSummary | null | undefined>(undefined)
  const [trendMode, setTrendMode] = useState<'7d' | 'month' | 'year'>('7d')
  const [trendData, setTrendData] = useState<PeriodCompareResult | null>(null)
  const [trendError, setTrendError] = useState('')
  const [trendBusy, setTrendBusy] = useState(false)
  const [reportMsg, setReportMsg] = useState('')
  const [importBusy, setImportBusy] = useState(false)
  const [importError, setImportError] = useState('')
  const [importOk, setImportOk] = useState('')
  const [schedules, setSchedules] = useState<ScheduleItem[]>([])
  const [editingScheduleId, setEditingScheduleId] = useState<string | null>(null)
  const [scheduleForm, setScheduleForm] = useState<ScheduleInput>(buildEmptyScheduleForm)
  const [scheduleBusy, setScheduleBusy] = useState(false)
  const [scheduleError, setScheduleError] = useState('')
  const [scheduleOk, setScheduleOk] = useState('')
  const [openHelp, setOpenHelp] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDetail, setEditDetail] = useState<CharacterDetail | null>(null)
  const [editForm, setEditForm] = useState(EMPTY_EDIT_FORM)
  const [saveBusy, setSaveBusy] = useState(false)
  const pendingPatchRef = useRef<Partial<Settings>>({})
  const settingsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 统计图表请求竞态守卫：每个图表独立 seq，过期响应直接丢弃
  const statsSeqRef = useRef(0)
  const rangeSeqRef = useRef(0)
  const heatmapSeqRef = useRef(0)
  const yearHeatSeqRef = useRef(0)
  const yearSumSeqRef = useRef(0)
  const achSeqRef = useRef(0)
  const trendSeqRef = useRef(0)
  const reportSeqRef = useRef(0)

  const buildInitialSpeechDraft = (): Record<SpeechPoolKey, string> => {
    const init = {} as Record<SpeechPoolKey, string>
    for (const k of SPEECH_KEYS) init[k.key] = DEFAULT_SPEECH[k.key].join('\n')
    return init
  }
  const [speechDraft, setSpeechDraft] = useState<Record<SpeechPoolKey, string>>(buildInitialSpeechDraft)
  const speechDraftRef = useRef<Record<SpeechPoolKey, string>>(speechDraft)
  const speechTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechInitRef = useRef(false)

  const runPerf = async (): Promise<void> => {
    setPerfBusy(true)
    try {
      setPerfReport(await window.desktopPet.perf.start())
    } finally {
      setPerfBusy(false)
    }
  }

  useEffect(() => {
    void window.desktopPet.version().then(setAppVersion).catch(() => {})
    void window.desktopPet.character.list().then(setCharacters)
    void window.desktopPet.plugin.list().then(setPlugins)
    void window.desktopPet.settings.get().then((s) => {
      setSettings(s)
      setActiveId(s.activeCharacterId)
    })
    void window.desktopPet.schedule.list().then(setSchedules).catch((err) => {
      console.error('[schedule.list] failed:', err)
    })
    const offState = window.desktopPet.events.onPetState(setState)
    const offHistory = window.desktopPet.events.onHistoryChanged((payload: HistoryChanged) =>
      setHistoryEvents(payload.events)
    )
    void window.desktopPet.events.history().then((r: EventHistoryResult) => setHistoryEvents(r.events)).catch((err) => {
      console.error('[events.history] failed:', err)
    })
    const offScheduleFired = window.desktopPet.events.onScheduleFired(() => {
      // 触发后刷新列表（lastFiredAt / enabled 可能变化）
      void window.desktopPet.schedule.list().then(setSchedules)
    })
    const offChanged = window.desktopPet.events.onCharacterChanged((id) => {
      setActiveId(id)
      void window.desktopPet.character.list().then(setCharacters)
    })
    return () => {
      offState()
      offHistory()
      offScheduleFired()
      offChanged()
    }
  }, [])

  useEffect(() => {
    const applyTab = (): void => {
      const h = window.location.hash
      if (h.includes('/settings')) setTab('settings')
      else if (h.includes('/characters')) setTab('characters')
      else if (h.includes('/market')) setTab('market')
      else if (h.includes('/speech')) setTab('speech')
      else if (h.includes('/schedule')) setTab('schedule')
      else if (h.includes('/stats')) setTab('stats')
      else if (h.includes('/push')) setTab('push')
      else if (h.includes('/events')) setTab('events')
      else if (h.includes('/dev')) setTab('dev')
      else setTab('home')
    }
    applyTab()
    window.addEventListener('hashchange', applyTab)
    return () => window.removeEventListener('hashchange', applyTab)
  }, [])

  const active = characters.find((c) => c.id === activeId)

  const updateSettings = (patch: Partial<Settings>): void => {
    pendingPatchRef.current = { ...pendingPatchRef.current, ...patch }
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev))
    if (settingsTimer.current) clearTimeout(settingsTimer.current)
    settingsTimer.current = setTimeout(() => {
      const flush = pendingPatchRef.current
      pendingPatchRef.current = {}
      void window.desktopPet.settings.set(flush)
    }, 200)
  }

  // 卸载时清理防抖定时器，并把未写出的设置立即落盘（避免丢失最后一次修改）
  useEffect(() => {
    return () => {
      if (settingsTimer.current) {
        clearTimeout(settingsTimer.current)
        settingsTimer.current = null
        const flush = pendingPatchRef.current
        if (Object.keys(flush).length > 0) {
          pendingPatchRef.current = {}
          void window.desktopPet.settings.set(flush)
        }
      }
    }
  }, [])

  useEffect(() => {
    if (!settings || speechInitRef.current) return
    speechInitRef.current = true
    const init = {} as Record<SpeechPoolKey, string>
    for (const k of SPEECH_KEYS) init[k.key] = settings.speech[k.key].join('\n')
    speechDraftRef.current = init
    setSpeechDraft(init)
  }, [settings])

  useEffect(() => {
    if (tab === 'market' && marketEntries.length === 0) {
      void loadMarket()
    }
  }, [tab, marketEntries.length])

  const refreshStats = (): void => {
    const seq = ++statsSeqRef.current
    void window.desktopPet.stats
      .get()
      .then((r) => {
        if (seq !== statsSeqRef.current) return
        setStatsReport(r)
        setStatsError('')
      })
      .catch(() => {
        if (seq !== statsSeqRef.current) return
        setStatsReport(null)
        setStatsError('统计读取失败')
      })
  }

  const loadRange = async (start: string, end: string): Promise<void> => {
    const seq = ++rangeSeqRef.current
    setRangeBusy(true)
    setRangeError('')
    try {
      const r = await window.desktopPet.stats.range(start, end)
      if (seq !== rangeSeqRef.current) return
      if (r.ok && r.days) {
        setRangeDays(r.days)
      } else {
        // 查询失败保留上一次图表数据，仅提示错误
        setRangeError(r.error ?? '查询失败')
      }
    } catch (err) {
      if (seq !== rangeSeqRef.current) return
      setRangeError(`查询失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (seq === rangeSeqRef.current) setRangeBusy(false)
    }
  }

  const loadHeatmap = async (year: number, month: number): Promise<void> => {
    const seq = ++heatmapSeqRef.current
    const dates = monthDates(year, month)
    const start = dates[0]
    const end = dates[dates.length - 1]
    const res = await window.desktopPet.stats.range(start, end)
    if (seq !== heatmapSeqRef.current) return
    setSelectedDay(null)
    setConfirmDeleteDay(false)
    if (res.ok && res.days) {
      setHeatmapDays(res.days)
      setHeatmapError('')
      return
    }
    // 未来月份 range 会拒绝（不查未来）→ 按空月渲染
    if ((res.error ?? '').includes('未来')) {
      setHeatmapDays(
        dates.map((d) => ({
          date: d,
          present: false,
          stats: { date: d, secondsByState: {}, hours: new Array(24).fill(0), events: {}, interactions: { click: 0, drag: 0, speak: 0 }, updatedAt: 0 }
        }))
      )
      setHeatmapError('')
      return
    }
    setHeatmapDays(null)
    setHeatmapError(res.error ?? '加载失败')
  }

  const loadYearHeatmap = async (year: number): Promise<void> => {
    const seq = ++yearHeatSeqRef.current
    setYearHeatError('')
    try {
      const res = await window.desktopPet.stats.heatmap(year)
      if (seq !== yearHeatSeqRef.current) return
      if (res.ok && res.days) setYearHeatDays(res.days)
      else {
        setYearHeatDays(null)
        setYearHeatError(res.error ?? '加载失败')
      }
    } catch (err) {
      if (seq !== yearHeatSeqRef.current) return
      setYearHeatDays(null)
      setYearHeatError(`加载失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const loadYearSummary = async (year: number): Promise<void> => {
    const seq = ++yearSumSeqRef.current
    const res = await window.desktopPet.stats.year(year)
    if (seq !== yearSumSeqRef.current) return
    setYearSummary(res.ok ? res.summary : undefined)
  }

  const loadAchievements = async (): Promise<void> => {
    const seq = ++achSeqRef.current
    const res = await window.desktopPet.stats.achievements()
    if (seq !== achSeqRef.current) return
    if (res.ok && res.achievements) setAchievements(res.achievements)
  }

  const getTrendRange = (mode: '7d' | 'month' | 'year') => {
    const today = todayStr()
    if (mode === '7d') {
      return { cS: daysAgoStr(6), cE: today, pS: daysAgoStr(13), pE: daysAgoStr(7) }
    }
    if (mode === 'month') {
      const now = new Date()
      const cS = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const lastDay = new Date(now.getFullYear(), now.getMonth(), 0).getDate()
      const pS = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-01`
      const pE = `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`
      return { cS, cE: today, pS, pE }
    }
    const y = new Date().getFullYear()
    return { cS: `${y}-01-01`, cE: today, pS: `${y - 1}-01-01`, pE: `${y - 1}-12-31` }
  }

  const loadTrend = async (mode: '7d' | 'month' | 'year'): Promise<void> => {
    const seq = ++trendSeqRef.current
    setTrendBusy(true)
    try {
      const { cS, cE, pS, pE } = getTrendRange(mode)
      const res = await window.desktopPet.stats.trend(cS, cE, pS, pE)
      if (seq !== trendSeqRef.current) return
      if (res.ok && res.compare) setTrendData(res.compare)
      else setTrendError(res.error ?? '查询失败')
    } catch (err) {
      if (seq !== trendSeqRef.current) return
      setTrendError(`查询失败: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      if (seq === trendSeqRef.current) setTrendBusy(false)
    }
  }

  const generateReport = async (mode: 'week' | 'month'): Promise<void> => {
    const seq = ++reportSeqRef.current
    setReportMsg('')
    const res = await window.desktopPet.stats.reportGenerate(mode)
    if (seq !== reportSeqRef.current) return
    if (res.ok && res.path) setReportMsg(`已生成：${res.path}`)
    else setReportMsg(res.error ?? '生成失败')
  }

  const loadAutoReportCfg = async (): Promise<void> => {
    const res = await window.desktopPet.autoReport.get()
    if (res.ok && res.config) setAutoReportCfg(res.config)
  }

  const handleAutoReportSave = async (): Promise<void> => {
    if (!autoReportCfg) return
    setAutoReportSaving(true)
    try {
      const res = await window.desktopPet.autoReport.set(autoReportCfg)
      setAutoReportMsg(res.ok ? '已保存' : `保存失败：${res.error ?? ''}`)
    } finally {
      setAutoReportSaving(false)
    }
  }

  const handleOpenReportDir = async (): Promise<void> => {
    const res = await window.desktopPet.stats.openReportDir()
    if (!res.ok) setReportMsg(res.error ?? '打开报告目录失败')
  }

  const loadPushApiInfo = async (): Promise<void> => {
    const res = await window.desktopPet.pushApi.get()
    if (res.ok && res.info) setPushApiInfo(res.info)
  }

  const handlePushApiToggle = async (enabled: boolean): Promise<void> => {
    setPushApiMsg('')
    const res = await window.desktopPet.pushApi.setEnabled(enabled)
    if (!res.ok) setPushApiMsg(res.error ?? '操作失败')
    await loadPushApiInfo()
  }

  const handleResetPushToken = async (): Promise<void> => {
    if (!window.confirm('重置 Token 后，已配置的第三方程序需更新，继续？')) return
    setPushApiMsg('')
    const res = await window.desktopPet.pushApi.resetToken()
    if (res.ok) {
      setPushApiMsg('已重置 Token')
      await loadPushApiInfo()
    } else {
      setPushApiMsg(res.error ?? '重置失败')
    }
  }

  const handleCopyPushToken = async (): Promise<void> => {
    if (!pushApiInfo?.token) return
    try {
      await navigator.clipboard.writeText(pushApiInfo.token)
      setPushApiMsg('Token 已复制')
    } catch {
      setPushApiMsg('复制失败')
    }
  }

  const handlePushTest = async (): Promise<void> => {
    setPushApiMsg('')
    const res = await window.desktopPet.pushApi.test()
    setPushApiMsg(res.ok ? '已发送测试推送（看兔兔气泡）' : (res.error ?? '测试失败'))
  }

  const loadPassiveCfg = async (): Promise<void> => {
    const res = await window.desktopPet.passive.get()
    if (res.ok && res.config) setPassiveCfg(res.config)
  }

  const handlePassiveSave = async (): Promise<void> => {
    if (!passiveCfg) return
    setPassiveMsg('')
    const res = await window.desktopPet.passive.set(passiveCfg)
    if (res.ok) {
      setPassiveMsg('已保存并应用')
      void loadPassiveCfg()
    } else {
      setPassiveMsg(res.error ?? '保存失败')
    }
  }

  const handlePassiveTest = async (sourceId: 'clipboard' | 'folder' | 'foreground'): Promise<void> => {
    setPassiveMsg('')
    const res = await window.desktopPet.passive.test(sourceId)
    if (!res.ok) setPassiveMsg(res.error ?? '测试失败')
    else setPassiveMsg(res.ok ? `已触发${sourceId}测试（看兔兔气泡）` : '')
  }

  const handleClearHistory = (): void => {
    if (historyEvents.length === 0) return
    if (!window.confirm('清空全部事件记录？')) return
    void window.desktopPet.events.clearHistory()
    setHistSource('')
    setHistState('')
    setHistHighOnly(false)
  }

  const updatePassive = (fn: (cfg: PassiveSourcesConfig) => PassiveSourcesConfig): void => {
    setPassiveCfg((prev) => (prev ? fn(prev) : prev))
  }

  const handleExportCsv = async (): Promise<void> => {
    setExportMsg('')
    const res = await window.desktopPet.stats.exportCsv(rangeStart, rangeEnd)
    if (res.ok) setExportMsg(`已导出：${res.path}`)
    else if (res.canceled) setExportMsg('')
    else setExportMsg(res.error ?? '导出失败')
  }

  const handleExportExcel = async (): Promise<void> => {
    setExportMsg('')
    const res = await window.desktopPet.stats.exportExcel(new Date().getFullYear())
    if (res.ok) setExportMsg(`已导出：${res.path}`)
    else if (res.canceled) setExportMsg('')
    else setExportMsg(res.error ?? '导出失败')
  }

  const handleClearAll = async (): Promise<void> => {
    const res = await window.desktopPet.stats.clearAll()
    if (res.ok) {
      setConfirmClear(false)
      setExportMsg('')
      setStatsReport(null)
      await Promise.all([
        refreshStats(),
        loadRange(rangeStart, rangeEnd),
        loadHeatmap(heatmapMonth.year, heatmapMonth.month),
        loadYearSummary(new Date().getFullYear()),
        loadYearHeatmap(yearHeatYear),
        loadAchievements(),
        loadTrend(trendMode)
      ])
    }
  }

  const handleDeleteDay = async (): Promise<void> => {
    if (!selectedDay) return
    const res = await window.desktopPet.stats.deleteDay(selectedDay.date)
    if (res.ok) {
      setSelectedDay(null)
      setConfirmDeleteDay(false)
      setStatsReport(null)
      await Promise.all([
        refreshStats(),
        loadRange(rangeStart, rangeEnd),
        loadHeatmap(heatmapMonth.year, heatmapMonth.month),
        loadYearHeatmap(yearHeatYear),
        loadAchievements(),
        loadTrend(trendMode)
      ])
    }
  }

  // 首页陪伴统计：切页拉取 + 15s 自动刷新（主进程 4s 粒度累计）
  useEffect(() => {
    if (tab !== 'home') return undefined
    refreshStats()
    const timer = setInterval(refreshStats, 15000)
    return () => clearInterval(timer)
  }, [tab])

  // 统计页：日期变化 / 切页拉取 + 15s 自动刷新
  useEffect(() => {
    if (tab !== 'stats') return undefined
    void loadRange(rangeStart, rangeEnd)
    void loadHeatmap(heatmapMonth.year, heatmapMonth.month)
    void loadYearSummary(new Date().getFullYear())
    void loadYearHeatmap(yearHeatYear)
    void loadAchievements()
    void loadTrend(trendMode)
    void loadAutoReportCfg()
    const timer = setInterval(() => void loadRange(rangeStart, rangeEnd), 15000)
    return () => clearInterval(timer)
  }, [tab, rangeStart, rangeEnd])

  // 趋势模式切换：仅重新加载趋势对比
  useEffect(() => {
    if (tab === 'stats') void loadTrend(trendMode)
  }, [trendMode, tab])

  // 热力图年份导航：仅重新加载年度热力图
  useEffect(() => {
    if (tab === 'stats') void loadYearHeatmap(yearHeatYear)
  }, [yearHeatYear, tab])

  // 热力图月份导航：仅重新加载热力图
  useEffect(() => {
    if (tab === 'stats') void loadHeatmap(heatmapMonth.year, heatmapMonth.month)
  }, [heatmapMonth, tab])

  // 推送页：切页拉取服务信息
  useEffect(() => {
    if (tab !== 'push') return undefined
    void loadPushApiInfo()
    return () => setPushApiMsg('')
  }, [tab])

  // 开发者页：切页拉取被动源配置
  useEffect(() => {
    if (tab !== 'dev') return undefined
    void loadPassiveCfg()
    return () => setPassiveMsg('')
  }, [tab])

  const updateSpeechPool = (key: SpeechPoolKey, raw: string): void => {
    const next = { ...speechDraftRef.current, [key]: raw }
    speechDraftRef.current = next
    setSpeechDraft(next)
    if (speechTimer.current) clearTimeout(speechTimer.current)
    speechTimer.current = setTimeout(() => {
      const speech = {} as SpeechPools
      for (const k of SPEECH_KEYS) {
        speech[k.key] = speechDraftRef.current[k.key]
          .split('\n')
          .map((t) => t.trim())
          .filter((t) => t !== '')
      }
      void window.desktopPet.settings.set({ speech })
      setSettings((prev) => (prev ? { ...prev, speech } : prev))
    }, 200)
  }

  useEffect(() => {
    return () => {
      if (speechTimer.current) clearTimeout(speechTimer.current)
    }
  }, [])

  const selectCharacter = (id: string): void => {
    setActiveId(id)
    void window.desktopPet.character.select(id)
  }

  const importCharacter = async (): Promise<void> => {
    const zipPath = await window.desktopPet.character.pick()
    if (!zipPath) return
    setImportBusy(true)
    setImportError('')
    setImportOk('')
    try {
      let result = await window.desktopPet.character.import(zipPath)
      if (!result.ok && result.error?.includes('已存在')) {
        // 角色已存在，询问是否覆盖升级
        if (window.confirm(`角色「${result.error.match(/「(.+?)」/)?.[1] ?? ''}」已存在，是否覆盖升级？\n（旧版将自动备份，升级失败会恢复旧版）`)) {
          result = await window.desktopPet.character.import(zipPath, true)
        }
      }
      if (result.ok) {
        setImportOk(result.overwritten ? `已升级角色「${result.name}」` : `已导入角色「${result.name}」`)
        setCharacters(await window.desktopPet.character.list())
      } else if (result.error) {
        setImportError(result.error)
      }
    } finally {
      setImportBusy(false)
    }
  }

  const deleteCharacter = async (c: CharacterSummary): Promise<void> => {
    if (!window.confirm(`确定删除角色「${c.name}」（${c.id}）？该操作不可恢复。`)) return
    const result = await window.desktopPet.character.delete(c.id)
    setImportOk('')
    if (result.ok) {
      setImportOk(`已删除角色「${c.name}」`)
      setCharacters(await window.desktopPet.character.list())
    } else {
      setImportError(result.error ?? '删除失败')
    }
  }

  const exportCharacter = async (c: CharacterSummary): Promise<void> => {
    const result = await window.desktopPet.character.export(c.id)
    if (result.ok && result.path) {
      setImportError('')
      setImportOk(`已导出角色包：${result.path}`)
    } else if (result.error !== '已取消导出') {
      setImportOk('')
      setImportError(result.error ?? '导出失败')
    }
  }

  const loadMarket = async (): Promise<void> => {
    try {
      setMarketEntries(await window.desktopPet.market.catalog())
    } catch (err) {
      setMarketError(`市场加载失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  const installMarket = async (e: MarketEntryWithStatus): Promise<void> => {
    if (marketBusy) return
    setMarketBusy(true)
    setMarketError('')
    setMarketOk('')
    try {
      const result = await window.desktopPet.market.install(e.id)
      if (result.ok) {
        setMarketOk(result.overwritten ? `已升级角色「${e.name}」` : `已安装角色「${e.name}」`)
        await loadMarket()
      } else {
        setMarketError(result.error ?? '安装失败')
      }
    } finally {
      setMarketBusy(false)
    }
  }

  const openEditor = async (c: CharacterSummary): Promise<void> => {
    const detail = await window.desktopPet.character.get(c.id)
    if (!('animation' in detail)) {
      setImportError('角色配置读取失败，无法编辑')
      return
    }
    const d = detail as CharacterDetail
    const firstKey = d.supportedStates[0] ?? 'idle'
    const st = d.animation[firstKey]?.template
    const night = d.overlays?.night
    setEditForm({
      name: d.name,
      version: d.version,
      defaultSize: d.settings?.defaultSize ?? 256,
      allowResize: d.settings?.allowResize ?? true,
      editStateKey: firstKey,
      click: d.interaction?.click ?? 'speak',
      doubleClick: d.interaction?.doubleClick ?? 'open_center',
      rightClick: d.interaction?.rightClick ?? 'menu',
      nightEnabled: Boolean(night),
      breatheScale: st?.breathe?.scale ?? 0.02,
      breatheDuration: st?.breathe?.duration ?? 2400,
      floatY: st?.float?.y ?? 6,
      floatDuration: st?.float?.duration ?? 3600,
      nightStart: night?.condition?.time?.start ?? 22,
      nightEnd: night?.condition?.time?.end ?? 6,
      nightOpacity: night?.apply?.opacity ?? 0.65,
      nightBreathe: night?.apply?.template?.breatheScale ?? 0.6,
      nightFloatY: night?.apply?.template?.floatY ?? 0.4,
      nightSpeed: night?.apply?.template?.speed ?? 0.9
    })
    setEditDetail(d)
    setEditingId(c.id)
    setImportError('')
    setImportOk('')
  }

  const switchEditState = (key: string): void => {
    const st = editDetail?.animation[key]?.template
    setEditForm((prev) => ({
      ...prev,
      editStateKey: key,
      breatheScale: st?.breathe?.scale ?? 0.02,
      breatheDuration: st?.breathe?.duration ?? 2400,
      floatY: st?.float?.y ?? 6,
      floatDuration: st?.float?.duration ?? 3600
    }))
  }

  const saveEdit = async (): Promise<void> => {
    if (!editingId) return
    setSaveBusy(true)
    try {
      const result = await window.desktopPet.character.update(editingId, {
        name: editForm.name,
        version: editForm.version,
        defaultSize: editForm.defaultSize,
        allowResize: editForm.allowResize,
        interaction: {
          click: editForm.click,
          doubleClick: editForm.doubleClick,
          rightClick: editForm.rightClick
        },
        states: {
          [editForm.editStateKey]: {
            breatheScale: editForm.breatheScale,
            breatheDuration: editForm.breatheDuration,
            floatY: editForm.floatY,
            floatDuration: editForm.floatDuration
          }
        },
        ...(editForm.nightEnabled
          ? {
              overlays: {
                night: {
                  start: editForm.nightStart,
                  end: editForm.nightEnd,
                  opacity: editForm.nightOpacity,
                  breatheScale: editForm.nightBreathe,
                  floatY: editForm.nightFloatY,
                  speed: editForm.nightSpeed
                }
              }
            }
          : {})
      })
      if (result.ok) {
        setImportOk(`已保存「${editForm.name}」的修改`)
        setEditingId(null)
        setCharacters(await window.desktopPet.character.list())
      } else {
        setImportError(result.error ?? '保存失败')
      }
    } finally {
      setSaveBusy(false)
    }
  }

  const refreshSchedules = async (): Promise<void> => {
    setSchedules(await window.desktopPet.schedule.list())
  }

  const openScheduleEditor = (item?: ScheduleItem): void => {
    setScheduleError('')
    setScheduleOk('')
    setScheduleForm(item ? scheduleToForm(item) : buildEmptyScheduleForm())
    setEditingScheduleId(item?.id ?? '')
  }

  const toggleScheduleDay = (day: number): void => {
    setScheduleForm((prev) => {
      const has = prev.daysOfWeek.includes(day)
      return {
        ...prev,
        daysOfWeek: has ? prev.daysOfWeek.filter((d) => d !== day) : [...prev.daysOfWeek, day]
      }
    })
  }

  const saveSchedule = async (): Promise<void> => {
    setScheduleBusy(true)
    setScheduleError('')
    setScheduleOk('')
    try {
      const result = editingScheduleId
        ? await window.desktopPet.schedule.update(editingScheduleId, scheduleForm)
        : await window.desktopPet.schedule.create(scheduleForm)
      if (result.ok) {
        setScheduleOk(editingScheduleId ? '已更新日程' : '已创建日程')
        setEditingScheduleId(null)
        await refreshSchedules()
      } else {
        setScheduleError(result.error ?? '保存失败')
      }
    } finally {
      setScheduleBusy(false)
    }
  }

  const deleteSchedule = async (item: ScheduleItem): Promise<void> => {
    if (!window.confirm(`确定删除日程「${item.title}」？`)) return
    const result = await window.desktopPet.schedule.delete(item.id)
    if (result.ok) {
      setScheduleOk(`已删除「${item.title}」`)
      await refreshSchedules()
    } else {
      setScheduleError(result.error ?? '删除失败')
    }
  }

  const toggleScheduleEnabled = async (item: ScheduleItem, enabled: boolean): Promise<void> => {
    const result = await window.desktopPet.schedule.toggle(item.id, enabled)
    if (result.ok) {
      await refreshSchedules()
    } else {
      setScheduleError(result.error ?? '切换失败')
    }
  }

  const testSchedule = async (item: ScheduleItem): Promise<void> => {
    const result = await window.desktopPet.schedule.test(item.id)
    if (!result.ok) setScheduleError(result.error ?? '测试触发失败')
  }

  // 成就等级进度（0~100）；未达最高级按「当前累计/下一级阈值」，满级或未加载时取 100
  const levelProgress =
    achievements && achievements.level.nextHours !== null
      ? Math.min(100, (achievements.totalSeconds / 3600 / achievements.level.nextHours) * 100)
      : 100
  const visible = filterHistory(historyEvents, { source: histSource, state: histState, highOnly: histHighOnly })

  return (
    <div className="flex h-full bg-background text-foreground">
      <aside className="flex w-44 flex-col gap-1 border-r border-border bg-card p-3">
        <div className="mb-2 flex items-center gap-1.5 px-2 text-base font-semibold tracking-wide text-primary">
          <span className="size-2 rounded-full bg-primary shadow-soft" />
          DesktopPet
        </div>
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={cn(
              'rounded-full px-3 py-2 text-left text-sm transition-all',
              tab === t.key
                ? 'bg-primary font-medium text-primary-foreground shadow-soft'
                : 'text-foreground/75 hover:bg-muted/70 hover:text-foreground'
            )}
          >
            {t.label}
          </button>
        ))}
        <div className="mt-auto px-2 text-xs text-muted-foreground">DesktopPet v{appVersion}</div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">
        <div key={tab} className="dp-fade-in">
        {tab === 'home' && <HomeTab active={active} perfBusy={perfBusy} perfReport={perfReport} plugins={plugins} refreshStats={refreshStats} runPerf={runPerf} state={state} statsError={statsError} statsReport={statsReport} />}

        {tab === 'characters' && <CharactersTab activeId={activeId} characters={characters} deleteCharacter={deleteCharacter} editDetail={editDetail} editForm={editForm} editingId={editingId} exportCharacter={exportCharacter} importBusy={importBusy} importCharacter={importCharacter} importError={importError} importOk={importOk} openEditor={openEditor} saveBusy={saveBusy} saveEdit={saveEdit} selectCharacter={selectCharacter} setEditForm={setEditForm} setEditingId={setEditingId} switchEditState={switchEditState} />}

        {tab === 'market' && <MarketTab installMarket={installMarket} marketBusy={marketBusy} marketEntries={marketEntries} marketError={marketError} marketOk={marketOk} />}

        {tab === 'speech' && settings && <SpeechTab speechDraft={speechDraft} updateSpeechPool={updateSpeechPool} />}

        {tab === 'schedule' && editingScheduleId === null && <ScheduleListTab deleteSchedule={deleteSchedule} openScheduleEditor={openScheduleEditor} scheduleError={scheduleError} scheduleOk={scheduleOk} schedules={schedules} testSchedule={testSchedule} toggleScheduleEnabled={toggleScheduleEnabled} />}

        {tab === 'schedule' && editingScheduleId !== null && <ScheduleEditTab active={active} editingScheduleId={editingScheduleId} saveSchedule={saveSchedule} scheduleBusy={scheduleBusy} scheduleError={scheduleError} scheduleForm={scheduleForm} setEditingScheduleId={setEditingScheduleId} setScheduleForm={setScheduleForm} toggleScheduleDay={toggleScheduleDay} />}

        {tab === 'stats' && <StatsTab achievements={achievements} autoReportCfg={autoReportCfg} autoReportMsg={autoReportMsg} autoReportSaving={autoReportSaving} confirmClear={confirmClear} confirmDeleteDay={confirmDeleteDay} exportMsg={exportMsg} generateReport={generateReport} handleAutoReportSave={handleAutoReportSave} handleClearAll={handleClearAll} handleDeleteDay={handleDeleteDay} handleExportCsv={handleExportCsv} handleExportExcel={handleExportExcel} handleOpenReportDir={handleOpenReportDir} heatmapDays={heatmapDays} heatmapError={heatmapError} heatmapMonth={heatmapMonth} levelProgress={levelProgress} loadRange={loadRange} rangeBusy={rangeBusy} rangeDays={rangeDays} rangeEnd={rangeEnd} rangeError={rangeError} rangeStart={rangeStart} reportMsg={reportMsg} selectedDay={selectedDay} setAutoReportCfg={setAutoReportCfg} setConfirmClear={setConfirmClear} setConfirmDeleteDay={setConfirmDeleteDay} setHeatmapMonth={setHeatmapMonth} setRangeEnd={setRangeEnd} setRangeStart={setRangeStart} setSelectedDay={setSelectedDay} setTrendMode={setTrendMode} setYearHeatYear={setYearHeatYear} statsReport={statsReport} trendBusy={trendBusy} trendData={trendData} trendError={trendError} trendMode={trendMode} yearHeatDays={yearHeatDays} yearHeatError={yearHeatError} yearHeatYear={yearHeatYear} yearSummary={yearSummary} />}

        {tab === 'push' && <PushTab handleCopyPushToken={handleCopyPushToken} handlePushApiToggle={handlePushApiToggle} handlePushTest={handlePushTest} handleResetPushToken={handleResetPushToken} pushApiInfo={pushApiInfo} pushApiMsg={pushApiMsg} />}

        {tab === 'events' && <EventsTab expandedIndex={expandedIndex} handleClearHistory={handleClearHistory} histHighOnly={histHighOnly} histSource={histSource} histState={histState} historyEvents={historyEvents} setExpandedIndex={setExpandedIndex} setHistHighOnly={setHistHighOnly} setHistSource={setHistSource} setHistState={setHistState} visible={visible} />}

        {tab === 'dev' && <DevTab handlePassiveSave={handlePassiveSave} handlePassiveTest={handlePassiveTest} passiveCfg={passiveCfg} passiveMsg={passiveMsg} updatePassive={updatePassive} />}

        {tab === 'settings' && settings && <SettingsTab openHelp={openHelp} setOpenHelp={setOpenHelp} settings={settings!} updateSettings={updateSettings} />}
        </div>
      </main>
    </div>
  )
}