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
import { compareVersions } from '../centerShared'

interface MarketTabProps {
  installMarket: (e: MarketEntryWithStatus) => Promise<void>
  marketBusy: boolean
  marketEntries: MarketEntryWithStatus[]
  marketError: string
  marketOk: string
}

export function MarketTab({ installMarket, marketBusy, marketEntries, marketError, marketOk }: MarketTabProps): React.JSX.Element {
  return (
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
  )
}
