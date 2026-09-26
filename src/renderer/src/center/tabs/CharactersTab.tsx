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
import type { InteractionAction } from '../../../../shared/ipc'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { EditFormState, INTERACTION_OPTIONS } from '../centerShared'

interface CharactersTabProps {
  activeId: string
  characters: CharacterSummary[]
  deleteCharacter: (c: CharacterSummary) => Promise<void>
  editDetail: CharacterDetail | null
  editForm: EditFormState
  editingId: string | null
  exportCharacter: (c: CharacterSummary) => Promise<void>
  importBusy: boolean
  importCharacter: () => Promise<void>
  importError: string
  importOk: string
  openEditor: (c: CharacterSummary) => Promise<void>
  saveBusy: boolean
  saveEdit: () => Promise<void>
  selectCharacter: (id: string) => void
  setEditForm: React.Dispatch<React.SetStateAction<EditFormState>>
  setEditingId: React.Dispatch<React.SetStateAction<string | null>>
  switchEditState: (key: string) => void
}

export function CharactersTab({ activeId, characters, deleteCharacter, editDetail, editForm, editingId, exportCharacter, importBusy, importCharacter, importError, importOk, openEditor, saveBusy, saveEdit, selectCharacter, setEditForm, setEditingId, switchEditState }: CharactersTabProps): React.JSX.Element {
  return (
          editingId ? (
            <div className="max-w-md space-y-5">
              <Card>
                <CardHeader>
                  <CardTitle>编辑角色</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <div className="text-sm">名称</div>
                    <Input
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm">版本</div>
                    <Input
                      value={editForm.version}
                      onChange={(e) => setEditForm({ ...editForm, version: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>默认大小</span>
                      <span className="text-muted-foreground">{editForm.defaultSize}px</span>
                    </div>
                    <Slider
                      min={96}
                      max={512}
                      step={8}
                      value={editForm.defaultSize}
                      onChange={(v) => setEditForm({ ...editForm, defaultSize: v })}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">允许缩放</div>
                      <div className="text-xs text-muted-foreground">设置面板中可调整该角色大小</div>
                    </div>
                    <Switch
                      checked={editForm.allowResize}
                      onCheckedChange={(v) => setEditForm({ ...editForm, allowResize: v })}
                    />
                  </div>
                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="text-sm font-medium">交互动作</div>
                    <div className="grid grid-cols-1 gap-3">
                      <div className="space-y-1.5">
                        <div className="text-xs text-muted-foreground">单击</div>
                        <select
                          value={editForm.click}
                          onChange={(e) => setEditForm({ ...editForm, click: e.target.value as InteractionAction })}
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        >
                          {INTERACTION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-xs text-muted-foreground">双击</div>
                        <select
                          value={editForm.doubleClick}
                          onChange={(e) => setEditForm({ ...editForm, doubleClick: e.target.value as InteractionAction })}
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        >
                          {INTERACTION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <div className="text-xs text-muted-foreground">右键</div>
                        <select
                          value={editForm.rightClick}
                          onChange={(e) => setEditForm({ ...editForm, rightClick: e.target.value as InteractionAction })}
                          className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                        >
                          {INTERACTION_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="text-xs text-muted-foreground">「说互动台词」使用消息页的互动回应池；未涉及的动作保留原配置。</div>
                  </div>
                  <div className="space-y-2">
                    <div className="text-sm">状态动画</div>
                    <select
                      value={editForm.editStateKey}
                      onChange={(e) => switchEditState(e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                    >
                      {(editDetail?.supportedStates ?? []).map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>呼吸幅度</span>
                      <span className="text-muted-foreground">{(editForm.breatheScale * 100).toFixed(1)}%</span>
                    </div>
                    <Slider
                      min={0}
                      max={10}
                      step={0.5}
                      value={editForm.breatheScale * 100}
                      onChange={(v) => setEditForm({ ...editForm, breatheScale: v / 100 })}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>呼吸时长</span>
                      <span className="text-muted-foreground">{editForm.breatheDuration}ms</span>
                    </div>
                    <Slider
                      min={500}
                      max={10000}
                      step={100}
                      value={editForm.breatheDuration}
                      onChange={(v) => setEditForm({ ...editForm, breatheDuration: v })}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>浮动高度</span>
                      <span className="text-muted-foreground">{editForm.floatY}px</span>
                    </div>
                    <Slider
                      min={0}
                      max={100}
                      step={1}
                      value={editForm.floatY}
                      onChange={(v) => setEditForm({ ...editForm, floatY: v })}
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>浮动时长</span>
                      <span className="text-muted-foreground">{editForm.floatDuration}ms</span>
                    </div>
                    <Slider
                      min={500}
                      max={10000}
                      step={100}
                      value={editForm.floatDuration}
                      onChange={(v) => setEditForm({ ...editForm, floatDuration: v })}
                    />
                  </div>
                  <div className="space-y-3 border-t border-border pt-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-medium">夜间叠加层</div>
                      <Switch
                        checked={editForm.nightEnabled}
                        onCheckedChange={(v) => setEditForm({ ...editForm, nightEnabled: v })}
                      />
                    </div>
                    {editForm.nightEnabled ? (
                      <>
                        <div className="text-xs text-muted-foreground">夜间变暗、呼吸放缓、浮动减弱（默认 22:00-06:00）</div>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>开始</span>
                              <span className="text-muted-foreground">{editForm.nightStart}:00</span>
                            </div>
                            <Slider
                              min={0}
                              max={23}
                              step={1}
                              value={editForm.nightStart}
                              onChange={(v) => setEditForm({ ...editForm, nightStart: v })}
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-sm">
                              <span>结束</span>
                              <span className="text-muted-foreground">{editForm.nightEnd}:00</span>
                            </div>
                            <Slider
                              min={0}
                              max={23}
                              step={1}
                              value={editForm.nightEnd}
                              onChange={(v) => setEditForm({ ...editForm, nightEnd: v })}
                            />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>夜间亮度</span>
                            <span className="text-muted-foreground">{Math.round(editForm.nightOpacity * 100)}%</span>
                          </div>
                          <Slider
                            min={10}
                            max={100}
                            step={5}
                            value={Math.round(editForm.nightOpacity * 100)}
                            onChange={(v) => setEditForm({ ...editForm, nightOpacity: v / 100 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>呼吸缩放</span>
                            <span className="text-muted-foreground">{Math.round(editForm.nightBreathe * 100)}%</span>
                          </div>
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={Math.round(editForm.nightBreathe * 100)}
                            onChange={(v) => setEditForm({ ...editForm, nightBreathe: v / 100 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>浮动高度缩放</span>
                            <span className="text-muted-foreground">{Math.round(editForm.nightFloatY * 100)}%</span>
                          </div>
                          <Slider
                            min={0}
                            max={100}
                            step={5}
                            value={Math.round(editForm.nightFloatY * 100)}
                            onChange={(v) => setEditForm({ ...editForm, nightFloatY: v / 100 })}
                          />
                        </div>
                        <div className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>动画速度</span>
                            <span className="text-muted-foreground">{Math.round(editForm.nightSpeed * 100)}%</span>
                          </div>
                          <Slider
                            min={20}
                            max={200}
                            step={10}
                            value={Math.round(editForm.nightSpeed * 100)}
                            onChange={(v) => setEditForm({ ...editForm, nightSpeed: v / 100 })}
                          />
                        </div>
                      </>
                    ) : (
                      <div className="text-xs text-muted-foreground">关闭则保存时不写入叠加层配置（原有配置保留）</div>
                    )}
                  </div>
                </CardContent>
              </Card>
              <div className="flex gap-2">
                <Button variant="default" onClick={() => void saveEdit()} disabled={saveBusy}>
                  {saveBusy ? '保存中…' : '保存'}
                </Button>
                <Button variant="ghost" onClick={() => setEditingId(null)}>
                  取消
                </Button>
              </div>
            </div>
          ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">共 {characters.length} 个角色</div>
              <Button variant="default" onClick={() => void importCharacter()} disabled={importBusy}>
                {importBusy ? '导入中…' : '导入角色包'}
              </Button>
            </div>
            {importError && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {importError}
              </div>
            )}
            {importOk && (
              <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600">
                {importOk}
              </div>
            )}
            {characters.length === 0 && <div className="text-sm text-muted-foreground">暂无角色，请导入角色包。</div>}
            {characters.map((c) => (
              <Card
                key={c.id}
                className={cn('cursor-pointer transition-colors hover:bg-muted/40', c.id === activeId && 'ring-2 ring-ring')}
                onClick={() => selectCharacter(c.id)}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  {c.preview && <img src={c.preview} alt={c.name} className="size-12 rounded-lg object-contain" />}
                  <div className="flex-1">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.id} · v{c.version}
                    </div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1.5">
                    {c.supportedStates.slice(0, 4).map((s) => (
                      <Badge key={s} variant="muted">
                        {s}
                      </Badge>
                    ))}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation()
                        void deleteCharacter(c)
                      }}
                    >
                      删除
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        void exportCharacter(c)
                      }}
                    >
                      导出
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="ml-1"
                      onClick={(e) => {
                        e.stopPropagation()
                        void openEditor(c)
                      }}
                    >
                      编辑
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          )
  )
}
