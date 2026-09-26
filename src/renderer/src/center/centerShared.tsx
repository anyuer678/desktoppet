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
import type { InteractionAction } from '../../../shared/ipc'
import { Input } from '@/components/ui/input'

// 从 CenterApp.tsx 机械外移的模块级类型/常量/工具/图表组件（零逻辑改动）

export type Tab = 'home' | 'characters' | 'market' | 'speech' | 'schedule' | 'stats' | 'push' | 'events' | 'dev' | 'settings'

export const TABS: { key: Tab; label: string }[] = [
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

export const SPEECH_KEYS: { key: SpeechPoolKey; label: string; hint: string }[] = [
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

export const INTERACTION_OPTIONS: { value: InteractionAction; label: string }[] = [
  { value: 'open_center', label: '打开控制中心' },
  { value: 'menu', label: '弹出右键菜单' },
  { value: 'speak', label: '说互动台词' },
  { value: 'none', label: '无动作' }
]

export const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export const STATE_LABELS: { key: string; label: string; className: string }[] = [
  { key: 'idle', label: '待机', className: 'bg-idle' },
  { key: 'focus', label: '专注', className: 'bg-focus' },
  { key: 'sleep', label: '睡眠', className: 'bg-sleep' },
  { key: 'happy', label: '开心', className: 'bg-happy' },
  { key: 'warning', label: '告警', className: 'bg-warning' }
]

/** 秒 → 可读时长 */
export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds)
  if (s < 60) return `${s}秒`
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}小时${m}分` : `${m}分钟`
}

/** 秒 → 紧凑时长（图表柱顶标注用）：64 → 1分钟 */
export function formatCompactDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}秒`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}分钟`
  return `${Math.round(minutes / 60)}小时`
}

/** 本地日期 YYYY-MM-DD */
export function localDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function todayStr(): string {
  return localDateStr(new Date())
}

/** n 天前的日期字符串 */
export function daysAgoStr(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return localDateStr(d)
}

/** 版本比较：数值分段逐位比较（1.2 < 1.10） */
export function compareVersions(a: string, b: string): number {
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
export function heatColor(sec: number, max: number): string {
  if (sec <= 0) return 'bg-muted'
  const r = sec / Math.max(1, max)
  if (r <= 0.25) return 'bg-emerald-200'
  if (r <= 0.5) return 'bg-emerald-300'
  if (r <= 0.75) return 'bg-emerald-400'
  return 'bg-emerald-500'
}

/** 生成某月全部日期（YYYY-MM-DD 升序） */
export function monthDates(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate()
  const out: string[] = []
  for (let d = 1; d <= last; d++) {
    out.push(`${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
  }
  return out
}

export interface ChartSegment {
  color: string
  value: number
}

export interface ChartBar {
  label: string
  title: string
  value: number
  segments: ChartSegment[]
}

/** 纯 CSS 垂直柱状图（支持堆叠段）；无可展示数据时显示占位文案 */
export function VBarChart({
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
export function dayTotalSeconds(stats: { secondsByState: Record<string, number> }): number {
  return Object.values(stats.secondsByState).reduce((a, b) => a + b, 0)
}

export const SCHEDULE_TYPE_LABELS: Record<ScheduleInput['type'], string> = {
  once: '单次',
  daily: '每日',
  weekly: '每周'
}

/** 默认新建表单值 */
export function buildEmptyScheduleForm(): ScheduleInput {
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
export function scheduleToForm(item: ScheduleItem): ScheduleInput {
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
export function formatScheduleTrigger(item: ScheduleItem): string {
  if (item.type === 'once') return item.trigger.replace('T', ' ')
  if (item.type === 'daily') return `每天 ${item.trigger}`
  if (item.daysOfWeek.length === 0) return `每周 ${item.trigger}（未选星期）`
  const days = item.daysOfWeek.slice().sort((a, b) => a - b).map((d) => WEEKDAY_LABELS[d]).join('、')
  return `${days} ${item.trigger}`
}

/** 格式化时间戳为本地短时间 */
export function formatTime(ts: number | null): string {
  if (ts === null) return '—'
  const d = new Date(ts)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${m}-${day} ${hh}:${mm}`
}

/** 多行文本 → 字符串数组（逐行 trim，忽略空行） */
export const parseList = (raw: string): string[] =>
  raw.split('\n').map((s) => s.trim()).filter((s) => s !== '')

/** 多行「进程名:focus|ignore」→ 映射数组（按第一个冒号切分） */
export const parseMappings = (raw: string): { process: string; state: 'focus' | 'ignore' }[] =>
  raw.split('\n').map((s) => s.trim()).filter((s) => s !== '')
    .map((line) => {
      const i = line.indexOf(':')
      return { process: line.slice(0, i), state: (line.slice(i + 1) as 'focus' | 'ignore') }
    })
    .filter((m) => m.process && (m.state === 'focus' || m.state === 'ignore'))

export const formatList = (arr: string[]): string => arr.join('\n')

export const joinList = formatList

export const formatMappings = (arr: { process: string; state: 'focus' | 'ignore' }[]): string =>
  arr.map((m) => `${m.process}:${m.state}`).join('\n')

/** 开发者页多行输入框样式（与 Input 接近） */
export const textareaCls = 'w-full rounded-md border border-border bg-card px-3 py-2 text-sm text-foreground shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export const HELP_ITEMS: { title: string; lines: string[] }[] = [
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


// 角色编辑表单初始值（自 CenterApp 机械外移，纯静态对象）
export const EMPTY_EDIT_FORM = {
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
  }
export type EditFormState = typeof EMPTY_EDIT_FORM
