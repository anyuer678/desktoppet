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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { SCHEDULE_TYPE_LABELS, formatScheduleTrigger, formatTime } from '../centerShared'

interface ScheduleListTabProps {
  deleteSchedule: (item: ScheduleItem) => Promise<void>
  openScheduleEditor: (item?: ScheduleItem) => void
  scheduleError: string
  scheduleOk: string
  schedules: ScheduleItem[]
  testSchedule: (item: ScheduleItem) => Promise<void>
  toggleScheduleEnabled: (item: ScheduleItem, enabled: boolean) => Promise<void>
}

export function ScheduleListTab({ deleteSchedule, openScheduleEditor, scheduleError, scheduleOk, schedules, testSchedule, toggleScheduleEnabled }: ScheduleListTabProps): React.JSX.Element {
  return (
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
  )
}
