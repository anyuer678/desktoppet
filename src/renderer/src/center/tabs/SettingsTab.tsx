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
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { HELP_ITEMS } from '../centerShared'

interface SettingsTabProps {
  openHelp: string | null
  setOpenHelp: React.Dispatch<React.SetStateAction<string | null>>
  settings: Settings
  updateSettings: (patch: Partial<Settings>) => void
}

export function SettingsTab({ openHelp, setOpenHelp, settings, updateSettings }: SettingsTabProps): React.JSX.Element {
  return (
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
  )
}
