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
import { useEffect, useState } from 'react'
import { joinList, parseList, textareaCls } from '../centerShared'

/** 正整数输入：允许输入过程中清空/临时非法，只有合法正整数才提交；失焦恢复最后有效值 */
function NumberInput({
  value,
  onCommit,
  ariaLabel
}: {
  value: number
  onCommit: (value: number) => void
  ariaLabel: string
}): React.JSX.Element {
  const [text, setText] = useState(String(value))
  const [focused, setFocused] = useState(false)
  useEffect(() => {
    if (!focused) setText(String(value))
  }, [value, focused])
  return (
    <Input
      type="number"
      min={1}
      value={text}
      aria-label={ariaLabel}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const raw = e.target.value
        setText(raw)
        const n = Number(raw)
        if (raw.trim() !== '' && Number.isInteger(n) && n > 0) onCommit(n)
      }}
    />
  )
}

interface DevTabProps {
  handlePassiveSave: () => Promise<void>
  handlePassiveTest: (sourceId: 'clipboard' | 'folder' | 'foreground') => Promise<void>
  mappingDraft: string
  passiveCfg: PassiveSourcesConfig | null
  passiveMsg: string
  setMappingDraft: (value: string) => void
  updatePassive: (fn: (cfg: PassiveSourcesConfig) => PassiveSourcesConfig) => void
}

export function DevTab({ handlePassiveSave, handlePassiveTest, mappingDraft, passiveCfg, passiveMsg, setMappingDraft, updatePassive }: DevTabProps): React.JSX.Element {
  return (
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
                    <Switch aria-label="启用剪贴板源" checked={passiveCfg?.clipboard.enabled ?? false} onCheckedChange={(v) => { if (passiveCfg) updatePassive((c) => ({ ...c, clipboard: { ...c.clipboard, enabled: v } })) }} />
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    复制内容变化时提示（默认开启，按规则过滤，低打扰）。规则为正则表达式，逐行一条。
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className="space-y-1 text-xs text-muted-foreground">
                      轮询间隔 (ms)
                      <NumberInput
                        value={passiveCfg?.clipboard.pollMs ?? 3000}
                        ariaLabel="剪贴板轮询间隔（毫秒）"
                        onCommit={(pollMs) => updatePassive((c) => ({ ...c, clipboard: { ...c.clipboard, pollMs } }))}
                      />
                    </label>
                    <label className="space-y-1 text-xs text-muted-foreground">
                      气泡截断长度 (字符)
                      <NumberInput
                        value={passiveCfg?.clipboard.maxLen ?? 120}
                        ariaLabel="剪贴板最大长度"
                        onCommit={(maxLen) => updatePassive((c) => ({ ...c, clipboard: { ...c.clipboard, maxLen } }))}
                      />
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
                    <Switch aria-label="启用目录监听" checked={passiveCfg?.folder.enabled ?? false} onCheckedChange={(v) => updatePassive((c) => ({ ...c, folder: { ...c.folder, enabled: v } }))} />
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
                    <NumberInput
                      value={passiveCfg?.folder.debounceMs ?? 500}
                      ariaLabel="目录监听防抖（毫秒）"
                      onCommit={(debounceMs) => updatePassive((c) => ({ ...c, folder: { ...c.folder, debounceMs } }))}
                    />
                  </label>
                </div>
                {/* 前台应用源 */}
                <div className="rounded-md border border-border p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-sm font-medium">前台应用</span>
                    <Switch aria-label="启用前台应用源" checked={passiveCfg?.foreground.enabled ?? false} onCheckedChange={(v) => updatePassive((c) => ({ ...c, foreground: { ...c.foreground, enabled: v } }))} />
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    检测最前窗口进程（默认关闭）。映射 focus 会令兔兔进入「专注」；ignore 忽略。不读取窗口内容。
                  </p>
                  <label className="block space-y-1 text-xs text-muted-foreground">
                    轮询间隔 (ms)
                    <NumberInput
                      value={passiveCfg?.foreground.pollMs ?? 15000}
                      ariaLabel="前台应用轮询间隔（毫秒）"
                      onCommit={(pollMs) => updatePassive((c) => ({ ...c, foreground: { ...c.foreground, pollMs } }))}
                    />
                  </label>
                  <label className="mt-2 block space-y-1 text-xs text-muted-foreground">
                    进程映射（逐行 进程名:focus 或 进程名:ignore）
                    <textarea className={textareaCls} value={mappingDraft} onChange={(e) => setMappingDraft(e.target.value)} />
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
  )
}
