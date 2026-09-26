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

interface PushTabProps {
  handleCopyPushToken: () => Promise<void>
  handlePushApiToggle: (enabled: boolean) => Promise<void>
  handlePushTest: () => Promise<void>
  handleResetPushToken: () => Promise<void>
  pushApiInfo: PushApiInfo | null
  pushApiMsg: string
}

export function PushTab({ handleCopyPushToken, handlePushApiToggle, handlePushTest, handleResetPushToken, pushApiInfo, pushApiMsg }: PushTabProps): React.JSX.Element {
  return (
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
  )
}
