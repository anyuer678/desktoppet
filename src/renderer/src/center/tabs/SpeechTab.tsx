import { DEFAULT_SPEECH, type SpeechPoolKey, type SpeechPools } from '../../../../shared/speech'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SPEECH_KEYS } from '../centerShared'

interface SpeechTabProps {
  speechDraft: Record<SpeechPoolKey, string>
  updateSpeechPool: (key: SpeechPoolKey, raw: string) => void
}

export function SpeechTab({ speechDraft, updateSpeechPool }: SpeechTabProps): React.JSX.Element {
  return (
          <div className="max-w-2xl space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>气泡消息自定义</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5 text-xs text-muted-foreground">
                <div>每个场景一行一条消息，空行自动忽略；清空某场景则该场景不说话。</div>
                <div>修改后防抖 200ms 自动保存，桌宠下次说话即生效。</div>
                <div>警告/开心/困倦池由系统事件与插件事件触发；日程提醒直接显示日程标题与备注。</div>
              </CardContent>
            </Card>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {SPEECH_KEYS.map((item) => (
                <Card key={item.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">
                      {item.label}
                      <span className="ml-2 text-xs font-normal text-muted-foreground">{item.hint}</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <textarea
                      value={speechDraft[item.key]}
                      onChange={(e) => updateSpeechPool(item.key, e.target.value)}
                      rows={4}
                      placeholder="一行一条消息…"
                      className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm leading-5 outline-none focus:border-primary"
                    />
                    <div className="mt-1 text-right text-[11px] text-muted-foreground">
                      {speechDraft[item.key].split('\n').filter((t) => t.trim() !== '').length} 条
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
  )
}
