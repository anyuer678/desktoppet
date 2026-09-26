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
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { STATE_LABELS, VBarChart, dayTotalSeconds, daysAgoStr, formatCompactDuration, formatDuration, heatColor, monthDates, todayStr } from '../centerShared'

interface StatsTabProps {
  achievements: Achievements | null
  autoReportCfg: AutoReportConfig | null
  autoReportMsg: string
  autoReportSaving: boolean
  confirmClear: boolean
  confirmDeleteDay: boolean
  exportMsg: string
  generateReport: (mode: 'week' | 'month') => Promise<void>
  handleAutoReportSave: () => Promise<void>
  handleClearAll: () => Promise<void>
  handleDeleteDay: () => Promise<void>
  handleExportCsv: () => Promise<void>
  handleExportExcel: () => Promise<void>
  handleOpenReportDir: () => Promise<void>
  heatmapDays: RangeDay[] | null
  heatmapError: string
  heatmapMonth: { year: number; month: number }
  levelProgress: unknown
  loadRange: (start: string, end: string) => Promise<void>
  rangeBusy: boolean
  rangeDays: RangeDay[] | null
  rangeEnd: string
  rangeError: string
  rangeStart: string
  reportMsg: string
  selectedDay: RangeDay | null
  setAutoReportCfg: React.Dispatch<React.SetStateAction<AutoReportConfig | null>>
  setConfirmClear: React.Dispatch<React.SetStateAction<boolean>>
  setConfirmDeleteDay: React.Dispatch<React.SetStateAction<boolean>>
  setHeatmapMonth: React.Dispatch<React.SetStateAction<{ year: number; month: number }>>
  setRangeEnd: React.Dispatch<React.SetStateAction<string>>
  setRangeStart: React.Dispatch<React.SetStateAction<string>>
  setSelectedDay: React.Dispatch<React.SetStateAction<RangeDay | null>>
  setTrendMode: React.Dispatch<React.SetStateAction<'7d' | 'month' | 'year'>>
  setYearHeatYear: React.Dispatch<React.SetStateAction<number>>
  statsReport: StatsReport | null
  trendBusy: boolean
  trendData: PeriodCompareResult | null
  trendError: string
  trendMode: '7d' | 'month' | 'year'
  yearHeatDays: RangeDay[] | null
  yearHeatError: string
  yearHeatYear: number
  yearSummary: YearSummary | null | undefined
}

export function StatsTab({ achievements, autoReportCfg, autoReportMsg, autoReportSaving, confirmClear, confirmDeleteDay, exportMsg, generateReport, handleAutoReportSave, handleClearAll, handleDeleteDay, handleExportCsv, handleExportExcel, handleOpenReportDir, heatmapDays, heatmapError, heatmapMonth, levelProgress, loadRange, rangeBusy, rangeDays, rangeEnd, rangeError, rangeStart, reportMsg, selectedDay, setAutoReportCfg, setConfirmClear, setConfirmDeleteDay, setHeatmapMonth, setRangeEnd, setRangeStart, setSelectedDay, setTrendMode, setYearHeatYear, statsReport, trendBusy, trendData, trendError, trendMode, yearHeatDays, yearHeatError, yearHeatYear, yearSummary }: StatsTabProps): React.JSX.Element {
  return (
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
  )
}
