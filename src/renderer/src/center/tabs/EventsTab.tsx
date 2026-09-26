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

interface EventsTabProps {
  expandedIndex: number | null
  handleClearHistory: () => void
  histHighOnly: boolean
  histSource: string
  histState: string
  historyEvents: PetEventInfo[]
  setExpandedIndex: React.Dispatch<React.SetStateAction<number | null>>
  setHistHighOnly: React.Dispatch<React.SetStateAction<boolean>>
  setHistSource: React.Dispatch<React.SetStateAction<string>>
  setHistState: React.Dispatch<React.SetStateAction<string>>
  visible: PetEventInfo[]
}

export function EventsTab({ expandedIndex, handleClearHistory, histHighOnly, histSource, histState, historyEvents, setExpandedIndex, setHistHighOnly, setHistSource, setHistState, visible }: EventsTabProps): React.JSX.Element {
  return (
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
  )
}
