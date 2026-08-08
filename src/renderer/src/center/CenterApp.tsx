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

type Tab = 'home' | 'characters' | 'market' | 'speech' | 'schedule' | 'stats' | 'push' | 'events' | 'dev' | 'settings'

const TABS: { key: Tab; label: string }[] = [
  { key: 'home', label: '首页' },
  { key: 'characters', label: '角色' },
  { key: 'market', label: '市场' },
  { key: 'speech', label: '消息' },
  { key: 'schedule', label: '日程' },
  { key: 'stats', label: '统计' },
  { key: 'push', label: '推送' },
  { key: 'events', label: '事件' },
  { key: 'dev', label: '开发者' },
  { key: 'settings', label: '设置' }
]

const SPEECH_KEYS: { key: SpeechPoolKey; label: string; hint: string }[] = [
  { key: 'welcome', label: '启动欢迎', hint: '桌宠启动时显示' },
  { key: 'morning', label: '早安', hint: '6:00-11:00' },
  { key: 'noon', label: '午安', hint: '11:00-14:00' },
  { key: 'afternoon', label: '下午好', hint: '14:00-18:00' },
  { key: 'evening', label: '晚上好', hint: '18:00-23:00' },
  { key: 'night', label: '深夜', hint: '23:00-6:00' },
  { key: 'interact', label: '互动回应', hint: '点击/右键「说互动台词」时' },
  { key: 'sleep', label: '困倦/睡眠', hint: '空闲 60s+ 或锁屏' },
  { key: 'happy', label: '开心', hint: '成功/奖励事件' },
  { key: 'warning', label: '警告', hint: 'CPU/内存/电池/网络异常' },
  { key: 'clipLink', label: '剪贴板·链接', hint: '复制到链接时，{placeholder} 自动代入域名' },
  { key: 'clipCode', label: '剪贴板·代码', hint: '复制到代码时' },
  { key: 'clipLong', label: '剪贴板·长文', hint: '复制到长文本时' },
  { key: 'clipShort', label: '剪贴板·短文', hint: '复制到短文本时' },
  { key: 'clipImage', label: '剪贴板·图片', hint: '剪贴板含图片时' },
  { key: 'clipSensitive', label: '剪贴板·敏感', hint: '疑似密码/卡号等时' },
  { key: 'folderChange', label: '文件夹变化', hint: '监听目录新增文件时，{placeholder} 代入文件名' },
  { key: 'foreground', label: '前台应用', hint: '切换到已映射应用时，{placeholder} 代入进程名' },
  { key: 'pushNote', label: '推送提醒', hint: '第三方推送 API 时，{title} 代入标题' }
]

const INTERACTION_OPTIONS: { value: InteractionAction; label: string }[] = [
  { value: 'open_center', label: '打开控制中心' },
  { value: 'menu', label: '弹出右键菜单' },
  { value: 'speak', label: '说互动台词' },
  { value: 'none', label: '无动作' }
]

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const STATE_LABELS: { key: string; label: string; className: string }[] = [
  { key: 'idle', label: '待机', className: 'bg-idle' },
  { key: 'focus', label: '专注', className: 'bg-focus' },
  { key: 'sleep', label: '睡眠', className: 'bg-sleep' },
  { key: 'happy', label: '开心', className: 'bg-happy' },
  { key: 'warning', label: '告警', className: 'bg-warning' }
]

/** 秒 → 可读时长 */
function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds)
  if (s < 60) return `${s}秒`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}小时${m}分` : `${m}分钟`
}

/** 秒 → 紧凑时长（图表柱顶标注用）：64 → 1分钟 */
function formatCompactDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}秒`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}分钟`
  return `${Math.round(minutes / 60)}小时`
}

/** 本地日期 YYYY-MM-DD */
function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStr(): string {
  return localDateStr(new Date())
}

/** n 天前的日期字符串 */
function daysAgoStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDateStr(d)
}

/** 版本比较：数值分段逐位比较（1.2 < 1.10） */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((n) => Number.parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => Number.parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0
    const y = pb[i] ?? 0
    if (x !== y) return x - y
  }
  return 0
}

/** 热力图配色：无记录灰，其余按当月最大值分 4 档 */
function heatColor(sec: number, max: number): string {
  if (sec <= 0) return 'bg-muted'
  const r = sec / Math.max(1, max)
  if (r <= 0.25) return 'bg-emerald-200'
  if (r <= 0.5) return 'bg-emerald-300'
  if (r <= 0.75) return 'bg-emerald-400'
  return 'bg-emerald-500'
}

/** 生成某月全部日期（YYYY-MM-DD 升序） */
function monthDates(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate()
  const out: string[] = []
  for (let d = 1; d <= last; d++) {
    out.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return out
}

interface ChartSegment {
  color: string
  value: number
}

interface ChartBar {
  label: string
  title: string
  value: number
  segments: ChartSegment[]
}

/** 纯 CSS 垂直柱状图（支持堆叠段）；无可展示数据时显示占位文案 */
function VBarChart({
  bars,
  height = 180,
  emptyText = '暂无数据',
  valueFormatter = (v) => String(v)
}: {
  bars: ChartBar[]
  height?: number
  emptyText?: string
  valueFormatter?: (v: number) => string
}): React.JSX.Element {
  const max = Math.max(1, ...bars.map((b) => b.value))
  if (!bars.some((b) => b.value > 0)) {
    return <div className="py-8 text-center text-sm text-muted-foreground">{emptyText}</div>
  }
  return (
    <div>
      <div className="flex items-end gap-[3px] pt-5" style={{ height: height + 20 }}>
        <div className="relative h-full w-full">
          <div className="absolute inset-x-0 top-1/3 border-t border-dashed border-border/40" />
          <div className="absolute inset-x-0 top-2/3 border-t border-dashed border-border/40" />
          <div className="flex h-full items-end gap-[3px]">
            {bars.map((b, i) => (
              <div
                key={b.label || `bar-${i}`}
                title={b.value > 0 ? b.title : `${b.label} · 无记录`}
                className="flex h-full min-w-0 flex-1 flex-col justify-end"
              >
                {b.value > 0 && (
                  <div className="flex w-full flex-col" style={{ height: `${Math.max(3, (b.value / max) * 100)}%` }}>
                    <div className="truncate text-center text-[10px] leading-3 text-muted-foreground">
                      {valueFormatter(b.value)}
                    </div>
                    <div className="flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-t-sm">
                      {b.segments
                        .filter((s) => s.value > 0)
                        .map((s) => (
                          <div key={s.color} className={s.color} style={{ flexGrow: s.value }} />
                        ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-1 flex gap-[3px]">
        {bars.map((b, i) => (
          <div
            key={b.label || `label-${i}`}
            className="min-w-0 flex-1 truncate text-center text-[11px] leading-4 text-muted-foreground"
          >
            {b.label}
          </div>
        ))}
      </div>
    </div>
  )
}

/** 单日总时长（秒） */
function dayTotalSeconds(stats: { secondsByState: Record<string, number> }): number {
  return Object.values(stats.secondsByState).reduce((a, b) => a + b, 0)
}

const SCHEDULE_TYPE_LABELS: Record<ScheduleInput['type'], string> = {
  once: '单次',
  daily: '每日',
  weekly: '每周'
}

/** 默认新建表单值 */
function buildEmptyScheduleForm(): ScheduleInput {
  // 默认值：明天的 09:00 单次提醒
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(9, 0, 0, 0)
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return {
    title: '',
    message: '',
    type: 'once',
    trigger: `${ymd}T09:00`,
    daysOfWeek: [],
    enabled: true
  }
}

/** 将 ScheduleItem 转为可编辑表单值 */
function scheduleToForm(item: ScheduleItem): ScheduleInput {
  return {
    title: item.title,
    message: item.message,
    type: item.type,
    trigger: item.trigger,
    daysOfWeek: item.daysOfWeek.slice(),
    enabled: item.enabled
  }
}

/** 格式化日程触发时间为可读字符串 */
function formatScheduleTrigger(item: ScheduleItem): string {
  if (item.type === 'once') return item.trigger.replace('T', ' ')
  if (item.type === 'daily') return `每天 ${item.trigger}`
  if (item.daysOfWeek.length === 0) return `每周 ${item.trigger}（未选星期）`
  const days = item.daysOfWeek.slice().sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join('、')
  return `${days} ${item.trigger}`
}

/** 格式化时间戳为本地短时间 */
function formatTime(ts: number | null): string {
  if (ts === null) return '—'
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${m}-${day} ${hh}:${mm}`
}

/** 多行文本 → 字符串数组（逐行 trim，忽略空行） */
const parseList = (raw: string): string[] =>
  raw.split('\n').map((s) => s.trim()).filter((s) => s !== '')

/** 多行「进程名:focus|ignore」→ 映射数组（按第一个冒号切分） */
const parseMappings = (raw: string): { process: string; state: 'focus' | 'ignore' }[] =>
  raw.split('\n').map((s) => s.trim()).filter((s) => s !== '')
    .map((line) => {
      const i = line.indexOf(':')
      return { process: line.slice(0, i), state: (line.slice(i + 1) as 'focus' | 'ignore') }
    })
    .filter((m) => m.process && (m.state === 'focus' || m.state === 'ignore'))

const formatList = (arr: string[]): string => arr.join('\n')

const joinList = formatList

const formatMappings = (arr: { process: string; state: 'focus' | 'ignore' }[]): string =>
  arr.map((m) => `${m.process}:${m.state}`).join('\n')

/** 开发者页多行输入框样式（与 Input 接近） */
const textareaCls = 'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

const HELP_ITEMS: { title: string; lines: string[] }[] = [
  {
    title: '气泡消息（v0.4）',
    lines: [
      '启动时欢迎语、时段切换时问候（早/中/下午/晚/深夜 5 时段）',
      '系统事件通知：CPU 高/内存不足/空闲/电池低等事件出现时说话，事件持续期间不重复，恢复后再次出现会重新通知',
      '「消息」页可自定义每个场景的台词（一行一条，清空则该场景不说话），修改自动保存即时生效',
      '显示 4 秒自动消失，不挡点击；消息随机挑选不连续重复'
    ]
  },
  {
    title: '交互方式',
    lines: [
      '单击兔兔：说一句互动台词',
      '双击兔兔：打开控制中心',
      '右键兔兔：菜单（控制中心 / 设置 / 换一个 / 隐藏 / 切换角色 / 暂停动画 / 退出）',
      '按住拖动：移动兔兔，松手自动记忆位置，下次启动原位出现'
    ]
  },
  {
    title: '点击穿透',
    lines: [
      '兔兔身体（不透明像素）可点击 / 拖拽；周围透明区域鼠标直接穿透到底层窗口',
      '判定基于主图逐像素 alpha（阈值 32），半透明阴影与羽化边缘不可点'
    ]
  },
  {
    title: '状态系统',
    lines: [
      '每 4 秒采样系统指标，事件经事件中心决策后广播状态',
      'idle：默认，呼吸 + 浮动；focus：工作类事件，呼吸变缓；sleep：空闲 60s+，缓慢呼吸；happy：成功/奖励，快速呼吸；warning：CPU>70% 或内存空闲<15%，急促呼吸',
      '状态动画缺失时自动回退到 idle'
    ]
  },
  {
    title: '叠加层（夜间模式）',
    lines: [
      '环境条件在基态动画上叠加修饰，不改变状态',
      '22:00-06:00 兔兔整体变暗、呼吸放缓、浮动减弱',
      '角色可自定义叠加条件与强度（characters/<id>/config.json 的 overlays）'
    ]
  },
  {
    title: '性能自检',
    lines: [
      '控制中心首页「性能自检」按钮，5 秒采样后展示主进程 CPU%/内存、渲染进程内存、动画帧率',
      '兔兔窗口空闲 60fps、主进程 < 10% 属正常'
    ]
  },
  {
    title: '多显示器',
    lines: [
      '兔兔位置按屏幕坐标记忆，可跨屏拖动',
      '拔掉显示器或分辨率变化后自动回落到主屏工作区，不会丢到屏幕外'
    ]
  },
  {
    title: '角色导入与删除',
    lines: [
      '「角色」页点击「导入角色包」，选择 .pet/.zip 文件即可导入',
      '导入自动校验：拒绝路径穿越、缺 config.json、非法 id、重复角色，失败显示具体原因',
      '角色卡片带「导出」按钮，打包为 .pet 分发（保存对话框，默认名 <id>-v<版本>.pet）',
      '角色卡片带「编辑」按钮：基本信息 + 各状态动画参数（下拉切换）+ 夜间叠加层时间与强度，保存后桌宠即时重载',
      '角色卡片带「删除」按钮；删除当前激活角色时自动回退到剩余第一个角色',
      '托盘右键「切换角色」菜单与角色列表同步'
    ]
  },
  {
    title: '日程提醒 / 闹钟',
    lines: [
      '「日程」页可新建/编辑/删除提醒：单次（指定日期+时分）/ 每日（HH:mm）/ 每周（指定星期+时分）',
      '到点触发时桌宠进入 warning 状态 6 秒，并通过气泡显示日程标题与备注',
      '同一分钟内只触发一次（防止重复响铃）；单次类型触发后自动禁用，可重新启用再次触发',
      '日程持久化于 %APPDATA%/DesktopPet/schedules.json，重启后保留',
      '点击列表项右侧「测试」按钮可立即触发一次预览效果（不会修改 lastFiredAt）'
    ]
  },
  {
    title: '托盘与单实例',
    lines: [
      '系统托盘图标：左键 / 双击显示桌宠，右键菜单（显示 / 隐藏 / 控制中心 / 退出）',
      '重复启动不会开第二个桌宠，而是唤起控制中心窗口'
    ]
  }
]

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
  const [editForm, setEditForm] = useState({
    name: '',
    version: '',
    defaultSize: 256,
    allowResize: true,
    editStateKey: 'idle',
    click: 'speak' as InteractionAction,
    doubleClick: 'open_center' as InteractionAction,
    rightClick: 'menu' as InteractionAction,
    nightEnabled: false,
    breatheScale: 0.02,
    breatheDuration: 2400,
    floatY: 6,
    floatDuration: 3600,
    nightStart: 22,
    nightEnd: 6,
    nightOpacity: 0.65,
    nightBreathe: 0.6,
    nightFloatY: 0.4,
    nightSpeed: 0.9
  })
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
        {tab === 'home' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>当前角色</CardTitle>
              </CardHeader>
              <CardContent>
                {active ? (
                  <div className="flex items-center gap-4">
                    {active.preview && (
                      <img src={active.preview} alt={active.name} className="size-16 rounded-2xl object-contain ring-2 ring-focus-soft shadow-soft" />
                    )}
                    <div>
                      <div className="text-lg font-semibold">{active.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {active.id} · v{active.version}
                      </div>
                      <div className="mt-1.5 flex gap-1.5">
                        <Badge variant={stateOf(state)}>{state}</Badge>
                        <Badge variant="muted">支持 {active.supportedStates.length} 个状态</Badge>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">暂无角色，请先添加角色包。</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle>陪伴统计</CardTitle>
                <Button variant="ghost" size="sm" onClick={refreshStats}>
                  刷新
                </Button>
              </CardHeader>
              <CardContent>
                {statsError && (
                  <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {statsError}
                  </div>
                )}
                {statsReport ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div className="rounded-lg border border-focus/15 bg-focus-soft/60 p-2.5">
                        <div className="text-xs text-muted-foreground">今日陪伴</div>
                        <div className="mt-0.5 text-base font-semibold">
                          {formatDuration(
                            Object.values(statsReport.today.secondsByState).reduce((a, b) => a + b, 0)
                          )}
                        </div>
                      </div>
                      <div className="rounded-lg border border-sleep/15 bg-sleep-soft/60 p-2.5">
                        <div className="text-xs text-muted-foreground">本周陪伴</div>
                        <div className="mt-0.5 text-base font-semibold">
                          {formatDuration(statsReport.week.totalSeconds)}
                          <span className="ml-1 text-xs font-normal text-muted-foreground">
                            {statsReport.week.days} 天
                          </span>
                        </div>
                      </div>
                      <div className="rounded-lg border border-happy/15 bg-happy-soft/60 p-2.5">
                        <div className="text-xs text-muted-foreground">互动</div>
                        <div className="mt-0.5 text-base font-semibold">
                          点击 {statsReport.today.interactions.click} · 拖动{' '}
                          {statsReport.today.interactions.drag} · 说话{' '}
                          {statsReport.today.interactions.speak}
                        </div>
                      </div>
                    </div>
                    <div>
                      <div className="mb-1.5 text-xs text-muted-foreground">今日状态分布</div>
                      {(() => {
                        const total = Object.values(statsReport.today.secondsByState).reduce((a, b) => a + b, 0)
                        return total > 0 ? (
                          <div className="space-y-1">
                            <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
                              {STATE_LABELS.map((s) => {
                                const sec = statsReport.today.secondsByState[s.key] ?? 0
                                if (sec <= 0) return null
                                return (
                                  <div
                                    key={s.key}
                                    className={s.className}
                                    style={{ width: `${(sec / total) * 100}%` }}
                                  />
                                )
                              })}
                            </div>
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                              {STATE_LABELS.filter(
                                (s) => (statsReport.today.secondsByState[s.key] ?? 0) > 0
                              ).map((s) => (
                                <span key={s.key} className="inline-flex items-center gap-1">
                                  <span className={`inline-block size-2 rounded-full ${s.className}`} />
                                  {s.label} {formatDuration(statsReport.today.secondsByState[s.key] ?? 0)}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">今天还没有陪伴记录，让兔兔多陪陪你吧～</div>
                        )
                      })()}
                    </div>
                    <div className="text-xs text-muted-foreground">连续陪伴 {statsReport.streak} 天</div>
                  </div>
                ) : (
                  <div className="text-sm text-muted-foreground">加载中…</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>性能自检</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-3">
                  <Button variant="outline" onClick={() => void runPerf()} disabled={perfBusy}>
                    {perfBusy ? '采集中（5 秒）…' : '开始自检'}
                  </Button>
                  {perfReport && (
                    <div className="grid grid-cols-3 gap-x-4 gap-y-1 text-xs">
                      <span className="text-muted-foreground">主进程 CPU</span>
                      <span className="text-muted-foreground">内存（主/渲染）</span>
                      <span className="text-muted-foreground">动画帧率</span>
                      <span className="font-medium">
                        {perfReport.avgCpu.toFixed(1)}% <span className="text-muted-foreground">峰值 {perfReport.maxCpu.toFixed(1)}%</span>
                      </span>
                      <span className="font-medium">
                        {perfReport.avgRssMB.toFixed(1)}MB / {perfReport.avgRendererMB.toFixed(1)}MB
                      </span>
                      <span className="font-medium">{perfReport.avgFps.toFixed(1)} fps</span>
                    </div>
                  )}
                </div>
                {perfReport && (
                  <div className="mt-2 text-xs text-muted-foreground">
                    单核 CPU 百分比；兔兔窗口空闲 60fps、主进程 {'< 10%'} 属正常。
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>插件</CardTitle>
              </CardHeader>
              <CardContent>
                {plugins.length === 0 ? (
                  <div className="text-sm text-muted-foreground">暂无已加载插件</div>
                ) : (
                  <div className="space-y-1.5">
                    {plugins.map((p) => (
                      <div key={p.id} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs">
                        <span className="font-medium">{p.name}</span>
                        <span className="text-muted-foreground">v{p.version}</span>
                        <Badge variant="muted">{p.eventCount} 事件</Badge>
                        <span className="ml-auto text-muted-foreground">{p.id}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'characters' && (
          editingId ? (
            <div className="max-w-md space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>编辑角色</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <div className="text-sm">名称</div>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm">版本</div>
                    <Input
                      value={editForm.version}
                      onChange={(e) => setEditForm({ ...editForm, version: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>默认大小</span>
                      <span className="text-muted-foreground">{editForm.defaultSize}px</span>
                    </div>
                    <Slider
                      min={96}
                      max={512}
                      step={8}
                      value={editForm.defaultSize}
                      onChange={(v) => setEditForm({ ...editForm, defaultSize: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">允许缩放</div>
                      <div className="text-xs text-muted-foreground">设置面板中可调整该角色大小</div>
                    </div>
                    <Switch
                      checked={editForm.allowResize}
                      onCheckedChange={(v) => setEditForm({ ...editForm, allowResize: v })}
                    />
                  </div>
                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="text-sm font-medium">交互动作</div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1.5">
                        <div className="text-xs text-muted-foreground">单击</div>
                        <select
                          value={editForm.click}
                          onChange={(e) => setEditForm({ ...editForm, click: e.target.value as InteractionAction })}
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        >
                          {INTERACTION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-xs text-muted-foreground">双击</div>
                        <select
                          value={editForm.doubleClick}
                          onChange={(e) => setEditForm({ ...editForm, doubleClick: e.target.value as InteractionAction })}
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        >
                          {INTERACTION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-xs text-muted-foreground">右键</div>
                        <select
                          value={editForm.rightClick}
                          onChange={(e) => setEditForm({ ...editForm, rightClick: e.target.value as InteractionAction })}
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        >
                          {INTERACTION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">「说互动台词」使用消息页的互动回应池；未涉及的动作保留原配置。</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm">状态动画</div>
                    <select
                      value={editForm.editStateKey}
                      onChange={(e) => switchEditState(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    >
                      {(editDetail?.supportedStates ?? []).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>呼吸幅度</span>
                      <span className="text-muted-foreground">{(editForm.breatheScale * 100).toFixed(1)}%</span>
                    </div>
                    <Slider
                      min={0}
                      max={10}
                      step={0.5}
                      value={editForm.breatheScale * 100}
                      onChange={(v) => setEditForm({ ...editForm, breatheScale: v / 100 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>呼吸时长</span>
                      <span className="text-muted-foreground">{editForm.breatheDuration}ms</span>
                    </div>
                    <Slider
                      min={500}
                      max={10000}
                      step={100}
                      value={editForm.breatheDuration}
                      onChange={(v) => setEditForm({ ...editForm, breatheDuration: v })}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>浮动高度</span>
                      <span className="text-muted-foreground">{editForm.floatY}px</span>
                    </div>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={editForm.floatY}
                      onChange={(v) => setEditForm({ ...editForm, floatY: v })}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>浮动时长</span>
                      <span className="text-muted-foreground">{editForm.floatDuration}ms</span>
                    </div>
                    <Slider
                      min={500}
                      max={10000}
                      step={100}
                      value={editForm.floatDuration}
                      onChange={(v) => setEditForm({ ...editForm, floatDuration: v })}
                    />
                  </div>
                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">夜间叠加层</div>
                      <Switch
                        checked={editForm.nightEnabled}
                        onCheckedChange={(v) => setEditForm({ ...editForm, nightEnabled: v })}
                      />
                    </div>
                    {editForm.nightEnabled ? (
                      <>
                        <div className="text-xs text-muted-foreground">夜间变暗、呼吸放缓、浮动减弱（默认 22:00-06:00）</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>开始</span>
                              <span className="text-muted-foreground">{editForm.nightStart}:00</span>
                            </div>
                            <Slider
                              min={0}
                              max={23}
                              step={1}
                              value={editForm.nightStart}
                              onChange={(v) => setEditForm({ ...editForm, nightStart: v })}
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>结束</span>
                              <span className="text-muted-foreground">{editForm.nightEnd}:00</span>
                            </div>
                            <Slider
                              min={0}
                              max={23}
                              step={1}
                              value={editForm.nightEnd}
                              onChange={(v) => setEditForm({ ...editForm, nightEnd: v })}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>夜间亮度</span>
                            <span className="text-muted-foreground">{Math.round(editForm.nightOpacity * 100)}%</span>
                          </div>
                          <Slider
                            min={10}
                            max={100}
                            step={5}
                            value={Math.round(editForm.nightOpacity * 100)}
                            onChange={(v) => setEditForm({ ...editForm, nightOpacity: v / 100 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>呼吸缩放</span>
                            <span className="text-muted-foreground">{Math.round(editForm.nightBreathe * 100)}%</span>
                          </div>
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={Math.round(editForm.nightBreathe * 100)}
                            onChange={(v) => setEditForm({ ...editForm, nightBreathe: v / 100 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>浮动高度缩放</span>
                            <span className="text-muted-foreground">{Math.round(editForm.nightFloatY * 100)}%</span>
                          </div>
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={Math.round(editForm.nightFloatY * 100)}
                            onChange={(v) => setEditForm({ ...editForm, nightFloatY: v / 100 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>动画速度</span>
                            <span className="text-muted-foreground">{Math.round(editForm.nightSpeed * 100)}%</span>
                          </div>
                          <Slider
                            min={20}
                            max={200}
                            step={10}
                            value={Math.round(editForm.nightSpeed * 100)}
                            onChange={(v) => setEditForm({ ...editForm, nightSpeed: v / 100 })}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground">关闭则保存时不写入叠加层配置（原有配置保留）</div>
                    )}
                  </div>
                </CardContent>
              </Card>
              <div className="flex gap-2">
                <Button variant="default" onClick={() => void saveEdit()} disabled={saveBusy}>
                  {saveBusy ? '保存中…' : '保存'}
                </Button>
                <Button variant="ghost" onClick={() => setEditingId(null)}>
                  取消
                </Button>
              </div>
            </div>
          ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">共 {characters.length} 个角色</div>
              <Button variant="default" onClick={() => void importCharacter()} disabled={importBusy}>
                {importBusy ? '导入中…' : '导入角色包'}
              </Button>
            </div>
            {importError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {importError}
              </div>
            )}
            {importOk && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
                {importOk}
              </div>
            )}
            {characters.length === 0 && <div className="text-sm text-muted-foreground">暂无角色，请导入角色包。</div>}
            {characters.map((c) => (
              <Card
                key={c.id}
                className={cn('cursor-pointer transition-colors hover:bg-muted/40', c.id === activeId && 'ring-2 ring-ring')}
                onClick={() => selectCharacter(c.id)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  {c.preview && <img src={c.preview} alt={c.name} className="size-12 rounded-lg object-contain" />}
                  <div className="flex-1">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.id} · v{c.version}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {c.supportedStates.slice(0, 4).map((s) => (
                      <Badge key={s} variant="muted">
                        {s}
                      </Badge>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        void deleteCharacter(c)
                      }}
                    >
                      删除
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        void exportCharacter(c)
                      }}
                    >
                      导出
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        void openEditor(c)
                      }}
                    >
                      编辑
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          )
        )}

        {tab === 'market' && (
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              本地角色市场：未安装可「安装」；已安装且市场版本更新时显示「升级」（覆盖导入，失败自动恢复旧版）。
            </div>
            {marketError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {marketError}
              </div>
            )}
            {marketOk && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
                {marketOk}
              </div>
            )}
            {marketEntries.length === 0 && (
              <div className="text-sm text-muted-foreground">市场暂无可安装角色。</div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {marketEntries.map((e) => (
                <Card key={e.id}>
                  <CardContent className="flex items-start gap-3 p-4">
                    {e.previewDataUrl && (
                      <img src={e.previewDataUrl} alt={e.name} className="size-16 rounded-lg object-contain" />
                    )}
                    <div className="flex-1 space-y-1">
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {e.id} · v{e.version} · {e.author}
                      </div>
                      <div className="text-xs text-muted-foreground">{e.description}</div>
                      <div className="pt-1.5">
                        {e.installed && e.installedVersion !== undefined && compareVersions(e.version, e.installedVersion) > 0 ? (
                          <Button variant="default" size="sm" onClick={() => void installMarket(e)} disabled={marketBusy}>
                            {marketBusy ? '升级中…' : `升级到 v${e.version}`}
                          </Button>
                        ) : e.installed ? (
                          <Button variant="outline" size="sm" disabled>
                            已安装{e.installedVersion ? ` v${e.installedVersion}` : ''}
                          </Button>
                        ) : (
                          <Button variant="default" size="sm" onClick={() => void installMarket(e)} disabled={marketBusy}>
                            {marketBusy ? '安装中…' : '安装'}
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {tab === 'speech' && settings && (
          <div className="max-w-2xl space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>气泡消息自定义</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                <div>每个场景一行一条消息，空行自动忽略；清空某场景则该场景不说话。</div>
                <div>修改后防抖 200ms 自动保存，桌宠下次说话即生效。</div>
                <div>警告/开心/困倦池由系统事件与插件事件触发；日程提醒直接显示日程标题与备注。</div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SPEECH_KEYS.map((item) => (
                <Card key={item.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {item.label}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{item.hint}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <textarea
                      value={speechDraft[item.key]}
                      onChange={(e) => updateSpeechPool(item.key, e.target.value)}
                      rows={4}
                      placeholder="一行一条消息…"
                      className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-5 outline-none focus:border-primary"
                    />
                    <div className="mt-1 text-right text-[11px] text-muted-foreground">
                      {speechDraft[item.key].split('\n').filter((t) => t.trim() !== '').length} 条
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )}

        {tab === 'schedule' && editingScheduleId === null && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">共 {schedules.length} 条日程</div>
              <Button variant="default" onClick={() => openScheduleEditor()}>
                新建日程
              </Button>
            </div>
            {scheduleError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {scheduleError}
              </div>
            )}
            {scheduleOk && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
                {scheduleOk}
              </div>
            )}
            {schedules.length === 0 && (
              <div className="text-sm text-muted-foreground">暂无日程，点击「新建日程」添加提醒。</div>
            )}
            {schedules.map((item) => (
              <Card key={item.id}>
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{item.title}</span>
                      <Badge variant="muted">{SCHEDULE_TYPE_LABELS[item.type]}</Badge>
                      {!item.enabled && <Badge variant="outline">已禁用</Badge>}
                    </div>
                    {item.message && (
                      <div className="text-xs text-muted-foreground">{item.message}</div>
                    )}
                    <div className="text-xs text-muted-foreground">
                      触发：{formatScheduleTrigger(item)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      上次触发：{formatTime(item.lastFiredAt)}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <Switch
                      checked={item.enabled}
                      onCheckedChange={(v) => void toggleScheduleEnabled(item, v)}
                    />
                    <div className="flex gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void testSchedule(item)}
                        title="立即触发一次预览效果"
                      >
                        测试
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openScheduleEditor(item)}
                      >
                        编辑
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => void deleteSchedule(item)}
                      >
                        删除
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {tab === 'schedule' && editingScheduleId !== null && (
          <div className="max-w-md space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>{editingScheduleId ? '编辑日程' : '新建日程'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <div className="text-sm">标题</div>
                  <Input
                    value={scheduleForm.title}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, title: e.target.value })}
                    placeholder="如：早会、吃药、提交周报"
                    maxLength={60}
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-sm">备注（可选）</div>
                  <Input
                    value={scheduleForm.message}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, message: e.target.value })}
                    placeholder="气泡副文本，可留空"
                    maxLength={200}
                  />
                </div>
                <div className="space-y-2">
                  <div className="text-sm">类型</div>
                  <div className="flex gap-2">
                    {(['once', 'daily', 'weekly'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setScheduleForm({ ...scheduleForm, type: t })}
                        className={cn(
                          'flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors',
                          scheduleForm.type === t
                            ? 'border-primary bg-primary/10 text-primary'
                            : 'border-border text-foreground/80 hover:bg-muted'
                        )}
                      >
                        {SCHEDULE_TYPE_LABELS[t]}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="text-sm">
                    {scheduleForm.type === 'once' ? '触发时间（YYYY-MM-DDTHH:mm）' : '触发时间（HH:mm，24 小时制）'}
                  </div>
                  <Input
                    value={scheduleForm.trigger}
                    onChange={(e) => setScheduleForm({ ...scheduleForm, trigger: e.target.value })}
                    placeholder={scheduleForm.type === 'once' ? '2026-08-05T09:00' : '09:00'}
                  />
                  {scheduleForm.type === 'once' && (
                    <div className="text-xs text-muted-foreground">单次提醒触发后自动禁用</div>
                  )}
                </div>
                {scheduleForm.type === 'weekly' && (
                  <div className="space-y-2">
                    <div className="text-sm">星期</div>
                    <div className="flex flex-wrap gap-1.5">
                      {WEEKDAY_LABELS.map((label, idx) => {
                        const active = scheduleForm.daysOfWeek.includes(idx)
                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => toggleScheduleDay(idx)}
                            className={cn(
                              'rounded-md border px-3 py-1 text-xs transition-colors',
                              active
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-border text-foreground/80 hover:bg-muted'
                            )}
                          >
                            {label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-border pt-4">
                  <div className="text-sm">启用</div>
                  <Switch
                    checked={scheduleForm.enabled}
                    onCheckedChange={(v) => setScheduleForm({ ...scheduleForm, enabled: v })}
                  />
                </div>
              </CardContent>
            </Card>
            {scheduleError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {scheduleError}
              </div>
            )}
            <div className="flex gap-2">
              <Button variant="default" onClick={() => void saveSchedule()} disabled={scheduleBusy}>
                {scheduleBusy ? '保存中…' : '保存'}
              </Button>
              <Button variant="ghost" onClick={() => setEditingScheduleId(null)}>
                取消
              </Button>
            </div>
          </div>
        )}

        {tab === 'stats' && (
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                <CardTitle>陪伴统计明细</CardTitle>
                <div className="flex flex-wrap items-center gap-2">
                  <Input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="w-36" />
                  <span className="text-xs text-muted-foreground">至</span>
                  <Input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="w-36" />
                  <Button variant="outline" size="sm" onClick={() => { setRangeStart(daysAgoStr(6)); setRangeEnd(todayStr()) }}>
                    近7天
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { setRangeStart(daysAgoStr(29)); setRangeEnd(todayStr()) }}>
                    近30天
                  </Button>
                  <Button variant="default" size="sm" onClick={() => void loadRange(rangeStart, rangeEnd)} disabled={rangeBusy}>
                    {rangeBusy ? '查询中…' : '查询'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {rangeError && (
                  <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {rangeError}
                  </div>
                )}
                {rangeDays && rangeDays.length > 0 && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      <div className="rounded-md border border-border p-2.5">
                        <div className="text-xs text-muted-foreground">区间陪伴</div>
                        <div className="mt-0.5 text-base font-semibold">
                          {formatDuration(rangeDays.filter((d) => d.present).reduce((a, d) => a + dayTotalSeconds(d.stats), 0))}
                        </div>
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <div className="text-xs text-muted-foreground">活跃天数</div>
                        <div className="mt-0.5 text-base font-semibold">
                          {rangeDays.filter((d) => d.present).length} / {rangeDays.length} 天
                        </div>
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <div className="text-xs text-muted-foreground">互动总数</div>
                        <div className="mt-0.5 text-base font-semibold">
                          {rangeDays
                            .filter((d) => d.present)
                            .reduce(
                              (a, d) => a + d.stats.interactions.click + d.stats.interactions.drag + d.stats.interactions.speak,
                              0
                            )}
                        </div>
                      </div>
                      <div className="rounded-md border border-border p-2.5">
                        <div className="text-xs text-muted-foreground">事件总数</div>
                        <div className="mt-0.5 text-base font-semibold">
                          {rangeDays
                            .filter((d) => d.present)
                            .reduce((a, d) => a + Object.values(d.stats.events).reduce((x, y) => x + y, 0), 0)}
                        </div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      <Card>
                        <CardHeader>
                          <CardTitle>每日陪伴时长</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <VBarChart
                            bars={rangeDays.map((d) => {
                              const total = dayTotalSeconds(d.stats)
                              return {
                                label: d.date.slice(5),
                                title: `${d.date} ${formatDuration(total)}`,
                                value: total,
                                segments: total > 0 ? [{ color: 'bg-primary', value: total }] : []
                              }
                            })}
                            valueFormatter={formatCompactDuration}
                            emptyText="所选区间没有陪伴记录"
                          />
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle>状态分布</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <VBarChart
                            bars={rangeDays.map((d) => {
                              const total = dayTotalSeconds(d.stats)
                              return {
                                label: d.date.slice(5),
                                title: d.date,
                                value: total,
                                segments: STATE_LABELS.map((s) => ({
                                  color: s.className,
                                  value: d.stats.secondsByState[s.key] ?? 0
                                })).filter((s) => s.value > 0)
                              }
                            })}
                            valueFormatter={formatCompactDuration}
                            emptyText="所选区间没有陪伴记录"
                          />
                          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
                            {STATE_LABELS.map((s) => (
                              <span key={s.key} className="inline-flex items-center gap-1">
                                <span className={`inline-block size-2 rounded-full ${s.className}`} />
                                {s.label}
                              </span>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle>事件趋势</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <VBarChart
                            bars={rangeDays.map((d) => {
                              const total = Object.values(d.stats.events).reduce((a, b) => a + b, 0)
                              return {
                                label: d.date.slice(5),
                                title: `${d.date} ${total} 次`,
                                value: total,
                                segments: total > 0 ? [{ color: 'bg-violet-500', value: total }] : []
                              }
                            })}
                            emptyText="所选区间没有事件记录"
                          />
                          {(() => {
                            const totals = new Map<string, number>()
                            for (const d of rangeDays) {
                              for (const [k, v] of Object.entries(d.stats.events)) {
                                totals.set(k, (totals.get(k) ?? 0) + v)
                              }
                            }
                            const top = [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
                            if (top.length === 0) return null
                            const maxCount = top[0][1]
                            return (
                              <div className="space-y-1 pt-1">
                                {top.map(([k, v]) => (
                                  <div key={k} className="flex items-center gap-2 text-xs">
                                    <span className="w-24 shrink-0 truncate text-muted-foreground" title={k}>
                                      {k}
                                    </span>
                                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                                      <div className="h-full rounded-full bg-violet-500" style={{ width: `${(v / maxCount) * 100}%` }} />
                                    </div>
                                    <span className="w-10 shrink-0 text-right">{v} 次</span>
                                  </div>
                                ))}
                              </div>
                            )
                          })()}
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader>
                          <CardTitle>互动次数</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <VBarChart
                            bars={rangeDays.map((d) => {
                              const total = d.stats.interactions.click + d.stats.interactions.drag + d.stats.interactions.speak
                              return {
                                label: d.date.slice(5),
                                title: `${d.date} 点击 ${d.stats.interactions.click} · 拖动 ${d.stats.interactions.drag} · 说话 ${d.stats.interactions.speak}`,
                                value: total,
                                segments: [
                                  { color: 'bg-sky-500', value: d.stats.interactions.click },
                                  { color: 'bg-amber-400', value: d.stats.interactions.drag },
                                  { color: 'bg-emerald-500', value: d.stats.interactions.speak }
                                ].filter((s) => s.value > 0)
                              }
                            })}
                            emptyText="所选区间没有互动记录"
                          />
                          <div className="flex flex-wrap gap-x-4 gap-y-1 pt-1 text-xs">
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block size-2 rounded-full bg-sky-500" />点击
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block size-2 rounded-full bg-amber-400" />拖动
                            </span>
                            <span className="inline-flex items-center gap-1">
                              <span className="inline-block size-2 rounded-full bg-emerald-500" />说话
                            </span>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                    <Card>
                      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                        <CardTitle>月度热力图</CardTitle>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => setHeatmapMonth((m) => (m.month === 1 ? { year: m.year - 1, month: 12 } : { ...m, month: m.month - 1 }))}>‹</Button>
                          <span className="w-24 text-center text-sm font-medium">{heatmapMonth.year} 年 {heatmapMonth.month} 月</span>
                          <Button variant="outline" size="sm" onClick={() => setHeatmapMonth((m) => (m.month === 12 ? { year: m.year + 1, month: 1 } : { ...m, month: m.month + 1 }))}>›</Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {heatmapError && (
                          <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{heatmapError}</div>
                        )}
                        {heatmapDays && (() => {
                          const byDate = new Map(heatmapDays.map((d) => [d.date, d.stats]))
                          const max = Math.max(1, ...heatmapDays.map((d) => dayTotalSeconds(d.stats)))
                          const today = todayStr()
                          const cells = monthDates(heatmapMonth.year, heatmapMonth.month)
                          const offset = (new Date(heatmapMonth.year, heatmapMonth.month - 1, 1).getDay() + 6) % 7
                          const monthTotal = heatmapDays.reduce((a, d) => a + dayTotalSeconds(d.stats), 0)
                          const activeDays = heatmapDays.filter((d) => d.present).length
                          return (
                            <div className="space-y-3">
                              <div className="grid grid-cols-7 gap-1">
                                {['一', '二', '三', '四', '五', '六', '日'].map((w) => (
                                  <div key={w} className="pb-1 text-center text-[11px] text-muted-foreground">{w}</div>
                                ))}
                                {Array.from({ length: offset }, (_, i) => (
                                  <div key={`b${i}`} />
                                ))}
                                {cells.map((date) => {
                                  const stats = byDate.get(date)
                                  const sec = stats ? dayTotalSeconds(stats) : 0
                                  return (
                                    <button
                                      key={date}
                                      type="button"
                                      title={`${date} · ${sec > 0 ? formatDuration(sec) : '无记录'}`}
                                      onClick={() => setSelectedDay(heatmapDays.find((d) => d.date === date) ?? null)}
                                      className={cn(
                                        'aspect-square rounded text-[11px] leading-none transition-colors',
                                        heatColor(sec, max),
                                        date === today && 'ring-2 ring-primary'
                                      )}
                                    >
                                      {Number(date.slice(8))}
                                    </button>
                                  )
                                })}
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>本月陪伴 {formatDuration(monthTotal)}</span>
                                <span>活跃 {activeDays} 天</span>
                                <span>日均 {activeDays > 0 ? formatDuration(monthTotal / activeDays) : '—'}</span>
                                <span className="inline-flex items-center gap-1">
                                  无
                                  <span className="size-2.5 rounded-sm bg-muted" />
                                  <span className="size-2.5 rounded-sm bg-emerald-200" />
                                  <span className="size-2.5 rounded-sm bg-emerald-300" />
                                  <span className="size-2.5 rounded-sm bg-emerald-400" />
                                  <span className="size-2.5 rounded-sm bg-emerald-500" />
                                  多
                                </span>
                              </div>
                              {selectedDay && (
                                <div className="space-y-2 rounded-md border border-border p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-sm font-medium">{selectedDay.date} 明细</div>
                                    <div className="flex items-center gap-2">
{confirmDeleteDay ? (
        <>
          <Button size="sm" variant="default" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleDeleteDay()}>确认删除</Button>
          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteDay(false)}>取消</Button>
        </>
                                      ) : (
                                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteDay(true)}>
                                          删除这一天
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                  {selectedDay.present ? (
                                    <div className="space-y-1 text-xs text-muted-foreground">
                                      <div>总陪伴 {formatDuration(dayTotalSeconds(selectedDay.stats))}</div>
                                      <div>
                                        状态{' '}
                                        {STATE_LABELS.filter((s) => (selectedDay.stats.secondsByState[s.key] ?? 0) > 0)
                                          .map((s) => `${s.label} ${formatDuration(selectedDay.stats.secondsByState[s.key] ?? 0)}`)
                                          .join(' · ') || '无'}
                                      </div>
                                      <div>事件 {Object.entries(selectedDay.stats.events).map(([k, v]) => `${k} ${v}`).join(' · ') || '无'}</div>
                                      <div>互动 点击 {selectedDay.stats.interactions.click} · 拖动 {selectedDay.stats.interactions.drag} · 说话 {selectedDay.stats.interactions.speak}</div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">当天没有记录</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                        <CardTitle>年度热力图</CardTitle>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => setYearHeatYear((y) => y - 1)}>‹</Button>
                          <span className="w-24 text-center text-sm font-medium">{yearHeatYear} 年</span>
                          <Button variant="outline" size="sm" onClick={() => setYearHeatYear((y) => Math.min(2100, y + 1))}>›</Button>
                        </div>
                      </CardHeader>
                      <CardContent>
                        {yearHeatError && <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{yearHeatError}</div>}
                        {yearHeatDays && (() => {
                          const byDate = new Map(yearHeatDays.map((d) => [d.date, d.stats]))
                          const max = Math.max(1, ...yearHeatDays.map((d) => dayTotalSeconds(d.stats)))
                          const yearTotal = yearHeatDays.reduce((a, d) => a + dayTotalSeconds(d.stats), 0)
                          const activeDays = yearHeatDays.filter((d) => d.present).length
                          return (
                            <div className="space-y-3">
                              <div className="space-y-1">
                                {Array.from({ length: 12 }, (_, m) => {
                                  const cells = monthDates(yearHeatYear, m + 1)
                                  return (
                                    <div key={m} className="flex items-center gap-2">
                                      <div className="w-7 shrink-0 text-right text-[11px] text-muted-foreground">{m + 1}月</div>
                                      <div className="grid flex-1 gap-[3px]" style={{ gridTemplateColumns: 'repeat(31, minmax(0, 1fr))' }}>
                                        {cells.map((date) => {
                                          const stats = byDate.get(date)
                                          const sec = stats ? dayTotalSeconds(stats) : 0
                                          return (
                                            <button
                                              key={date}
                                              type="button"
                                              title={`${date} · ${sec > 0 ? formatDuration(sec) : '无记录'}`}
                                              onClick={() => setSelectedDay(yearHeatDays.find((d) => d.date === date) ?? null)}
                                              className={cn('aspect-square rounded-[3px]', heatColor(sec, max))}
                                            />
                                          )
                                        })}
                                      </div>
                                    </div>
                                  )
                                })}
                              </div>
                              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span>{yearHeatYear} 年陪伴 {formatDuration(yearTotal)}</span>
                                <span>活跃 {activeDays} 天</span>
                                <span className="inline-flex items-center gap-1">无 <span className="size-2.5 rounded-sm bg-muted" /> <span className="size-2.5 rounded-sm bg-emerald-200" /> <span className="size-2.5 rounded-sm bg-emerald-300" /> <span className="size-2.5 rounded-sm bg-emerald-400" /> <span className="size-2.5 rounded-sm bg-emerald-500" /> 多</span>
                              </div>
                              {selectedDay && (
                                <div className="space-y-2 rounded-md border border-border p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-sm font-medium">{selectedDay.date} 明细</div>
                                    <div className="flex items-center gap-2">
                                      {confirmDeleteDay ? (
                                        <>
                                          <Button size="sm" variant="default" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleDeleteDay()}>确认删除</Button>
                                          <Button size="sm" variant="ghost" onClick={() => setConfirmDeleteDay(false)}>取消</Button>
                                        </>
                                      ) : (
                                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteDay(true)}>
                                          删除这一天
                                        </Button>
                                      )}
                                    </div>
                                  </div>
                                  {selectedDay.present ? (
                                    <div className="space-y-1 text-xs text-muted-foreground">
                                      <div>总陪伴 {formatDuration(dayTotalSeconds(selectedDay.stats))}</div>
                                      <div>
                                        状态{' '}
                                        {STATE_LABELS.filter((s) => (selectedDay.stats.secondsByState[s.key] ?? 0) > 0)
                                          .map((s) => `${s.label} ${formatDuration(selectedDay.stats.secondsByState[s.key] ?? 0)}`)
                                          .join(' · ') || '无'}
                                      </div>
                                      <div>事件 {Object.entries(selectedDay.stats.events).map(([k, v]) => `${k} ${v}`).join(' · ') || '无'}</div>
                                      <div>互动 点击 {selectedDay.stats.interactions.click} · 拖动 {selectedDay.stats.interactions.drag} · 说话 {selectedDay.stats.interactions.speak}</div>
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground">当天没有记录</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>24小时时段分布</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {(() => {
                          const hours = new Array(24).fill(0)
                          let hasData = false
                          for (const d of rangeDays ?? []) {
                            const h = d.stats.hours ?? []
                            for (let i = 0; i < 24; i++) {
                              const v = h[i] ?? 0
                              if (v > 0) hasData = true
                              hours[i] += v
                            }
                          }
                          if (!hasData) {
                            return <div className="py-8 text-center text-sm text-muted-foreground">历史数据不包含时段分布（自 v0.5.0805.04 起记录）</div>
                          }
                          return (
                            <VBarChart
                              bars={hours.map((v, i) => ({
                                label: i % 3 === 0 ? String(i) : '',
                                title: `${String(i).padStart(2, '0')}:00-${String(i).padStart(2, '0')}:59 · ${formatDuration(v)}`,
                                value: v,
                                segments: v > 0 ? [{ color: 'bg-primary', value: v }] : []
                              }))}
                              valueFormatter={formatCompactDuration}
                              emptyText="所选区间没有时段数据"
                            />
                          )
                        })()}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>年度汇总</CardTitle>
                      </CardHeader>
                      <CardContent>
                        {yearSummary === undefined ? (
                          <div className="text-sm text-muted-foreground">加载中…</div>
                        ) : yearSummary ? (
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="rounded-md border border-border p-2.5">
                              <div className="text-xs text-muted-foreground">{yearSummary.year} 年陪伴</div>
                              <div className="mt-0.5 text-base font-semibold">{formatDuration(yearSummary.totalSeconds)}</div>
                            </div>
                            <div className="rounded-md border border-border p-2.5">
                              <div className="text-xs text-muted-foreground">活跃天数</div>
                              <div className="mt-0.5 text-base font-semibold">{yearSummary.activeDays} 天</div>
                            </div>
                            <div className="rounded-md border border-border p-2.5">
                              <div className="text-xs text-muted-foreground">日均陪伴（活跃日）</div>
                              <div className="mt-0.5 text-base font-semibold">{formatDuration(yearSummary.avgSecondsPerActiveDay)}</div>
                            </div>
                            <div className="rounded-md border border-border p-2.5">
                              <div className="text-xs text-muted-foreground">最活跃日</div>
                              <div className="mt-0.5 text-base font-semibold">{yearSummary.bestDay ? `${yearSummary.bestDay.date.slice(5)} · ${formatDuration(yearSummary.bestDay.seconds)}` : '—'}</div>
                            </div>
                            <div className="rounded-md border border-border p-2.5">
                              <div className="text-xs text-muted-foreground">当前连续陪伴</div>
                              <div className="mt-0.5 text-base font-semibold">{statsReport ? `${statsReport.streak} 天` : '—'}</div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">{new Date().getFullYear()} 年还没有记录</div>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2 space-y-0">
                        <CardTitle>趋势对比</CardTitle>
                        <div className="flex gap-1">
                          {(['7d', 'month', 'year'] as const).map((m) => (
                            <Button key={m} variant={trendMode === m ? 'default' : 'outline'} size="sm" onClick={() => setTrendMode(m)}>
                              {m === '7d' ? '近7天' : m === 'month' ? '本月' : '本年'}
                            </Button>
                          ))}
                        </div>
                      </CardHeader>
                      <CardContent>
                        {trendError && <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{trendError}</div>}
                        {trendData ? (
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="rounded-md border border-border p-2.5">
                              <div className="text-xs text-muted-foreground">本期陪伴</div>
                              <div className="mt-0.5 text-base font-semibold">{formatDuration(trendData.current.totalSeconds)}</div>
                            </div>
                            <div className="rounded-md border border-border p-2.5">
                              <div className="text-xs text-muted-foreground">上期陪伴</div>
                              <div className="mt-0.5 text-base font-semibold">{formatDuration(trendData.previous.totalSeconds)}</div>
                            </div>
                            <div className="rounded-md border border-border p-2.5">
                              <div className="text-xs text-muted-foreground">变化</div>
                              <div className="mt-0.5 text-base font-semibold">
                                {trendData.changeTotalPercent === null ? '—' : `${trendData.changeTotalPercent >= 0 ? '+' : ''}${trendData.changeTotalPercent}%`}
                              </div>
                            </div>
                            <div className="rounded-md border border-border p-2.5">
                              <div className="text-xs text-muted-foreground">活跃天数</div>
                              <div className="mt-0.5 text-base font-semibold">
                                {trendData.current.activeDays} / {trendData.previous.activeDays}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground">{trendBusy ? '加载中…' : '暂无数据'}</div>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>成就与里程碑</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {achievements ? (
                          <>
                            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                              <span>当前连续 <b>{achievements.streak}</b> 天</span>
                              <span>最长连续 <b>{achievements.bestStreak}</b> 天</span>
                              <span>累计陪伴 <b>{formatDuration(achievements.totalSeconds)}</b></span>
                            </div>
                            <div>
                              <div className="mb-1 text-xs text-muted-foreground">
                                {achievements.level.label}
                                {achievements.level.nextHours !== null
                                  ? ` · 距 Lv${achievements.level.no + 1} 还需 ${Math.max(0, Math.ceil(achievements.level.nextHours - achievements.totalSeconds / 3600))} 小时`
                                  : ' · 已满级'}
                              </div>
                              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                                <div className="h-full rounded-full bg-primary" style={{ width: `${levelProgress}%` }} />
                              </div>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-center text-xs">
                              {achievements.badges.map((b) => (
                                <div key={b.id} className={cn('rounded-md border border-border p-2', b.unlocked ? '' : 'opacity-40')}>
                                  <div className={cn('mx-auto mb-1 flex size-8 items-center justify-center rounded-full', b.unlocked ? 'bg-emerald-500 text-white' : 'bg-muted text-muted-foreground')}>
                                    {b.unlocked ? '✓' : '🔒'}
                                  </div>
                                  <div className="truncate" title={b.label}>{b.label}</div>
                                </div>
                              ))}
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">加载中…</div>
                        )}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>数据管理</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => void handleExportCsv()}>导出 CSV（当前区间）</Button>
                          <Button variant="outline" size="sm" onClick={() => void handleExportExcel()}>导出 Excel（{new Date().getFullYear()} 年）</Button>
                          <Button variant="outline" size="sm" onClick={() => void generateReport('week')}>生成周报</Button>
                          <Button variant="outline" size="sm" onClick={() => void generateReport('month')}>生成月报</Button>
                          <Button variant="outline" size="sm" onClick={() => void handleOpenReportDir()}>打开报告文件夹</Button>
{confirmClear ? (
  <>
    <Button size="sm" variant="default" className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => void handleClearAll()}>确认清空全部统计</Button>
    <Button size="sm" variant="ghost" onClick={() => setConfirmClear(false)}>取消</Button>
    <span className="text-xs text-destructive">将删除全部统计数据，不可恢复</span>
  </>
) : (
                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmClear(true)}>
                              清空全部统计
                            </Button>
                          )}
                        </div>
                        {exportMsg && <div className="text-xs text-muted-foreground">{exportMsg}</div>}
                        {reportMsg && <div className="text-xs text-muted-foreground">{reportMsg}</div>}
                      </CardContent>
                    </Card>
                    <Card>
                      <CardHeader>
                        <CardTitle>自动报告</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {autoReportCfg ? (
                          <>
                            <div className="flex flex-wrap items-center gap-2">
                              <label className="w-10 text-sm">周报</label>
                              <input
                                type="checkbox"
                                checked={autoReportCfg.weekly.enabled}
                                onChange={(e) =>
                                  setAutoReportCfg((p) => (p ? { ...p, weekly: { ...p.weekly, enabled: e.target.checked } } : p))
                                }
                              />
                              <select
                                className="rounded border px-2 py-1 text-sm"
                                value={autoReportCfg.weekly.dayOfWeek}
                                onChange={(e) =>
                                  setAutoReportCfg((p) =>
                                    p ? { ...p, weekly: { ...p.weekly, dayOfWeek: Number(e.target.value) } } : p
                                  )
                                }
                              >
                                {['周日', '周一', '周二', '周三', '周四', '周五', '周六'].map((label, i) => (
                                  <option key={i} value={i}>{label}</option>
                                ))}
                              </select>
                              <input
                                type="time"
                                className="rounded border px-2 py-1 text-sm"
                                value={autoReportCfg.weekly.time}
                                onChange={(e) =>
                                  setAutoReportCfg((p) => (p ? { ...p, weekly: { ...p.weekly, time: e.target.value } } : p))
                                }
                              />
                              <span className="text-xs text-muted-foreground">每周固定时刻生成</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-3">
                              <span className="text-sm">月报</span>
                              <input
                                type="checkbox"
                                checked={autoReportCfg.monthly.enabled}
                                onChange={(e) =>
                                  setAutoReportCfg((p) => (p ? { ...p, monthly: { ...p.monthly, enabled: e.target.checked } } : p))
                                }
                              />
                              <input
                                type="number"
                                min={1}
                                max={31}
                                className="w-16 rounded border px-2 py-1 text-sm"
                                value={autoReportCfg.monthly.dayOfMonth}
                                onChange={(e) =>
                                  setAutoReportCfg((p) =>
                                    p ? { ...p, monthly: { ...p.monthly, dayOfMonth: Number(e.target.value) } } : p
                                  )
                                }
                              />
                              <span className="text-xs text-muted-foreground">日每月固定时刻生成</span>
                              <input
                                type="time"
                                className="h-9 rounded border px-2 py-1 text-sm"
                                value={autoReportCfg.monthly.time}
                                onChange={(e) =>
                                  setAutoReportCfg((p) => (p ? { ...p, monthly: { ...p.monthly, time: e.target.value } } : p))
                                }
                              />
                            </div>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline" onClick={() => void handleAutoReportSave()} disabled={autoReportSaving}>
                                {autoReportSaving ? '保存中…' : '保存'}
                              </Button>
                              {autoReportMsg && <span className="text-xs text-muted-foreground">{autoReportMsg}</span>}
                            </div>
                          </>
                        ) : (
                          <div className="text-sm text-muted-foreground">加载中…</div>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'push' && (
          <div className="max-w-2xl space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>事件推送 API</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {pushApiInfo ? (
                  <>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium">本地 HTTP 服务</div>
                        <div className="text-xs text-muted-foreground">第三方程序通过本地址向桌宠推送事件</div>
                      </div>
                      <Badge variant={pushApiInfo.port > 0 ? 'default' : 'muted'}>
                        {pushApiInfo.port > 0 ? '运行中' : '已停'}
                      </Badge>
                    </div>
                    <div className="grid gap-2 text-sm">
                      <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                        <span className="text-muted-foreground">服务地址</span>
                        <code className="font-mono text-xs">
                          {pushApiInfo.port > 0 ? `http://127.0.0.1:${pushApiInfo.port}/api/event` : '服务未启动'}
                        </code>
                      </div>
                      <div className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2">
                        <span className="shrink-0 text-muted-foreground">Token</span>
                        <code className="min-w-0 flex-1 truncate font-mono text-xs">{pushApiInfo.token || '（未生成）'}</code>
                        <button
                          type="button"
                          onClick={() => void handleCopyPushToken()}
                          className="shrink-0 rounded border border-border px-2 py-1 text-xs transition-colors hover:bg-muted"
                        >
                          复制
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={pushApiInfo.enabled}
                          onCheckedChange={(v) => void handlePushApiToggle(v)}
                        />
                        <span className="text-sm">{pushApiInfo.enabled ? '启用' : '已停用'}</span>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => void handleResetPushToken()}>
                        重置 Token
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => void handlePushTest()}>
                        发送测试
                      </Button>
                      {pushApiMsg && <span className="text-xs text-muted-foreground">{pushApiMsg}</span>}
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">加载中…</div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>调用示例</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="rounded-md bg-muted p-3 font-mono text-xs leading-5">
                  <div>curl -X POST http://127.0.0.1:{pushApiInfo?.port ?? 0}/api/event</div>
                  <div>-H &quot;Authorization: Bearer {pushApiInfo?.token ?? '&lt;token&gt;'}&quot;</div>
                  <div>-d &apos;{'{'} &quot;title&quot;: &quot;标题&quot;, &quot;message&quot;: &quot;正文内容&quot; {'}'}
                  &apos;</div>
                </div>
                <div className="space-y-1 text-xs leading-5 text-muted-foreground">
                  <div>· 仅监听本机回环地址，不对外暴露。</div>
                  <div>· 请求需携带 Authorization: Bearer &lt;Token&gt;，未携带或错误返回 401。</div>
                  <div>· title ≤60 字符、message ≤200 字符、可选 type（如 complete / warning）会驱动状态动画。</div>
                  <div>· 推送成功会显示气泡并计入当日统计（push 事件）。</div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'events' && (
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>事件通知</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap items-center gap-3 rounded-xl bg-muted/50 p-2.5">
                  <select
                    value={histSource}
                    onChange={(e) => setHistSource(e.target.value)}
                    className="w-36 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="">全部来源</option>
                    {[...new Set(historyEvents.map((e) => groupLabel(e.source)))].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <select
                    value={histState}
                    onChange={(e) => setHistState(e.target.value)}
                    className="w-32 rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="">全部状态</option>
                    {['warning', 'happy', 'sleep', 'focus', 'idle'].map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <label className="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={histHighOnly}
                      onChange={(e) => setHistHighOnly(e.target.checked)}
                    />
                    仅高优先级
                  </label>
                  <Button variant="outline" size="sm" onClick={handleClearHistory}>
                    清空
                  </Button>
                </div>
                {visible.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">
                    <span className="mx-auto mb-2 block size-2.5 rounded-full bg-primary/25" />
                    暂无事件记录
                  </div>
                ) : (
                  <div className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                    {visible.map((e, i) => (
                      <div key={`${e.source}-${e.occurredAt}-${i}`}>
                        <button
                          type="button"
                          onClick={() => setExpandedIndex(expandedIndex === i ? null : i)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/60"
                        >
                          <Badge variant={stateOf(e.type)}>{stateOf(e.type)}</Badge>
                          <span className="text-xs tabular-nums text-muted-foreground">
                            {new Date(e.occurredAt).toLocaleTimeString('zh-CN', { hour12: false })}
                          </span>
                          <span className="text-sm font-medium">{groupLabel(e.source)}</span>
                          <span className="text-sm text-muted-foreground">{e.type}</span>
                          <span className="ml-auto text-xs text-muted-foreground">P{e.priority}</span>
                        </button>
                        {expandedIndex === i && (
                          <div className="break-all border-t border-border px-3 py-2 text-xs text-muted-foreground">
                            <div>source: {e.source}</div>
                            <div>type: {e.type}</div>
                            <div>priority: {e.priority}</div>
                            <div>durationMs: {e.durationMs}</div>
                            <div>occurredAt: {new Date(e.occurredAt).toISOString()}</div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'dev' && (
          <div className="max-w-2xl space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>事件源（开发者选项）</CardTitle>
                <p className="text-xs text-muted-foreground">
                  被动数据源为没有 API 的软件提供接入事件中心的通道；默认低打扰，按需精调。
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 剪贴板源 */}
                <div className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">剪贴板</span>
                    <Switch checked={passiveCfg?.clipboard.enabled ?? false} onCheckedChange={(v) => { if (passiveCfg) updatePassive((c) => ({ ...c, clipboard: { ...c.clipboard, enabled: v } })) }} />
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    复制内容变化时提示（默认开启，按规则过滤，低打扰）。规则为正则表达式，逐行一条。
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      轮询间隔 (ms)
                      <Input type="number" value={String(passiveCfg?.clipboard.pollMs ?? 3000)} onChange={(e) => updatePassive((c) => ({ ...c, clipboard: { ...c.clipboard, pollMs: Number(e.target.value) || 0 } }))} />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      气泡截断长度 (字符)
                      <Input type="number" value={String(passiveCfg?.clipboard.maxLen ?? 120)} onChange={(e) => updatePassive((c) => ({ ...c, clipboard: { ...c.clipboard, maxLen: Number(e.target.value) || 0 } }))} />
                    </label>
                  </div>
                  <label className="mt-2 block space-y-1 text-xs text-muted-foreground">
                    仅通知（正则，逐行；留空=全部）
                    <textarea className={textareaCls} value={joinList(passiveCfg?.clipboard.onlyPatterns ?? [])} onChange={(e) => updatePassive((c) => ({ ...c, clipboard: { ...c.clipboard, onlyPatterns: parseList(e.target.value) } }))} />
                  </label>
                  <label className="mt-2 block space-y-1 text-xs text-muted-foreground">
                    忽略（正则，逐行）
                    <textarea className={textareaCls} value={joinList(passiveCfg?.clipboard.ignorePatterns ?? [])} onChange={(e) => updatePassive((c) => ({ ...c, clipboard: { ...c.clipboard, ignorePatterns: parseList(e.target.value) } }))} />
                  </label>
                </div>
                {/* 目录源 */}
                <div className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">目录监听</span>
                    <Switch checked={passiveCfg?.folder.enabled ?? false} onCheckedChange={(v) => updatePassive((c) => ({ ...c, folder: { ...c.folder, enabled: v } }))} />
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    向指定目录放入新文件时提示（默认关闭，需填写目录路径）。文件通配：* 任意、? 单字符。
                  </p>
                  <label className="block space-y-1 text-xs text-muted-foreground">
                    监听目录
                    <Input value={passiveCfg?.folder.dir ?? ''} placeholder="例如 D:\Downloads" onChange={(e) => updatePassive((c) => ({ ...c, folder: { ...c.folder, dir: e.target.value } }))} />
                  </label>
                  <label className="mt-2 block space-y-1 text-xs text-muted-foreground">
                    文件匹配（逐行，如 *.png / report*）
                    <textarea className={textareaCls} value={joinList(passiveCfg?.folder.patterns ?? ['*'])} onChange={(e) => updatePassive((c) => ({ ...c, folder: { ...c.folder, patterns: parseList(e.target.value) } }))} />
                  </label>
                  <label className="mt-2 block space-y-1 text-xs text-muted-foreground">
                    防抖 (ms)
                    <Input type="number" value={String(passiveCfg?.folder.debounceMs ?? 500)} onChange={(e) => updatePassive((c) => ({ ...c, folder: { ...c.folder, debounceMs: Number(e.target.value) || 0 } }))} />
                  </label>
                </div>
                {/* 前台应用源 */}
                <div className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">前台应用</span>
                    <Switch checked={passiveCfg?.foreground.enabled ?? false} onCheckedChange={(v) => updatePassive((c) => ({ ...c, foreground: { ...c.foreground, enabled: v } }))} />
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    检测最前窗口进程（默认关闭）。映射 focus 会令兔兔进入「专注」；ignore 忽略。不读取窗口内容。
                  </p>
                  <label className="block space-y-1 text-xs text-muted-foreground">
                    轮询间隔 (ms)
                    <Input type="number" value={String(passiveCfg?.foreground.pollMs ?? 15000)} onChange={(e) => updatePassive((c) => ({ ...c, foreground: { ...c.foreground, pollMs: Number(e.target.value) || 0 } }))} />
                  </label>
                  <label className="mt-2 block space-y-1 text-xs text-muted-foreground">
                    进程映射（逐行 进程名:focus 或 进程名:ignore）
                    <textarea className={textareaCls} value={formatMappings(passiveCfg?.foreground.mappings ?? [])} onChange={(e) => updatePassive((c) => ({ ...c, foreground: { ...c.foreground, mappings: parseMappings(e.target.value) } }))} />
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => void handlePassiveSave()}>保存</Button>
                  <Button size="sm" variant="outline" onClick={() => void handlePassiveTest('clipboard')}>测试剪贴板</Button>
                  <Button size="sm" variant="outline" onClick={() => void handlePassiveTest('folder')}>测试目录</Button>
                  <Button size="sm" variant="outline" onClick={() => void handlePassiveTest('foreground')}>测试前台</Button>
                  {passiveMsg && <span className="text-xs text-muted-foreground">{passiveMsg}</span>}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {tab === 'settings' && settings && (
          <div className="max-w-md space-y-5">
            <Card>
              <CardHeader>
                <CardTitle>外观</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>角色大小</span>
                    <span className="text-muted-foreground">{settings.size}px</span>
                  </div>
                  <Slider
                    min={96}
                    max={512}
                    step={8}
                    value={settings.size}
                    onChange={(v) => updateSettings({ size: v })}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>透明度</span>
                    <span className="text-muted-foreground">{Math.round(settings.opacity * 100)}%</span>
                  </div>
                  <Slider
                    min={30}
                    max={100}
                    step={5}
                    value={Math.round(settings.opacity * 100)}
                    onChange={(v) => updateSettings({ opacity: v / 100 })}
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>启动</CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <div>
                  <div className="text-sm">开机自动启动</div>
                  <div className="text-xs text-muted-foreground">登录 Windows 后自动出现桌宠</div>
                </div>
                <Switch
                  checked={settings.autoLaunch}
                  onCheckedChange={(v) => updateSettings({ autoLaunch: v })}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>全局快捷键</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm">启用快捷键</div>
                    <div className="text-xs text-muted-foreground">关闭后下方组合键全部失效</div>
                  </div>
                  <Switch
                    checked={settings.shortcutsEnabled}
                    onCheckedChange={(v) => updateSettings({ shortcutsEnabled: v })}
                  />
                </div>
                <div className="space-y-1.5 border-t border-border pt-3 text-xs text-muted-foreground">
                  <div className="flex justify-between">
                    <span>显示 / 隐藏桌宠</span>
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl+Shift+P</kbd>
                  </div>
                  <div className="flex justify-between">
                    <span>打开控制中心</span>
                    <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10px]">Ctrl+Shift+C</kbd>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>操作</CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2">
                <Button variant="outline" onClick={() => void window.desktopPet.window.setSize(settings.size)}>
                  应用大小
                </Button>
                <Button variant="ghost" onClick={() => void window.desktopPet.window.hide()}>
                  隐藏桌宠
                </Button>
                <Button
                  variant="ghost"
                  className="text-destructive hover:text-destructive"
                  onClick={() => void window.desktopPet.window.quit()}
                >
                  退出桌宠
                </Button>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>使用说明</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                {HELP_ITEMS.map((item) => {
                  const open = openHelp === item.title
                  return (
                    <div key={item.title} className="rounded-md border border-border">
                      <button
                        type="button"
                        onClick={() => setOpenHelp(open ? null : item.title)}
                        className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium transition-colors hover:bg-muted/50"
                      >
                        {item.title}
                        <span className={cn('text-xs text-muted-foreground transition-transform', open && 'rotate-90')}>
                          ›
                        </span>
                      </button>
                      {open && (
                        <div className="space-y-1.5 border-t border-border px-3 py-2.5">
                          {item.lines.map((line, i) => (
                            <div key={i} className="text-xs leading-5 text-muted-foreground">
                              {line}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </CardContent>
            </Card>
          </div>
        )}
        </div>
      </main>
    </div>
  )
}