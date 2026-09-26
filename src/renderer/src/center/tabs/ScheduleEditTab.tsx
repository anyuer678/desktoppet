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
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { SCHEDULE_TYPE_LABELS, WEEKDAY_LABELS } from '../centerShared'

interface ScheduleEditTabProps {
  active: CharacterSummary | undefined
  editingScheduleId: string | null
  saveSchedule: () => Promise<void>
  scheduleBusy: boolean
  scheduleError: string
  scheduleForm: ScheduleInput
  setEditingScheduleId: React.Dispatch<React.SetStateAction<string | null>>
  setScheduleForm: React.Dispatch<React.SetStateAction<ScheduleInput>>
  toggleScheduleDay: (day: number) => void
}

export function ScheduleEditTab({ active, editingScheduleId, saveSchedule, scheduleBusy, scheduleError, scheduleForm, setEditingScheduleId, setScheduleForm, toggleScheduleDay }: ScheduleEditTabProps): React.JSX.Element {
  return (
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
  )
}
