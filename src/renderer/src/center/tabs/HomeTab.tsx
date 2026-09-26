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
} from '../../../../shared/ipc'
import { filterHistory, groupLabel, stateOf } from '../../../../shared/eventState'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { STATE_LABELS, formatDuration } from '../centerShared'

interface HomeTabProps {
  active: CharacterSummary | undefined
  perfBusy: boolean
  perfReport: PerfReport | null
  plugins: PluginInfo[]
  refreshStats: () => void
  runPerf: () => Promise<void>
  state: string
  statsError: string
  statsReport: StatsReport | null
}

export function HomeTab({ active, perfBusy, perfReport, plugins, refreshStats, runPerf, state, statsError, statsReport }: HomeTabProps): React.JSX.Element {
  return (
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
  )
}
