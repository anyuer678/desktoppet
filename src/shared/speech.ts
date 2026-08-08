import type { PushApiFired } from './ipc'

export interface Speech {
  key: string
  text: string
}

export type SpeechPoolKey =
  | 'welcome'
  | 'morning'
  | 'noon'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'interact'
  | 'sleep'
  | 'happy'
  | 'warning'
  | 'clipLink'
  | 'clipCode'
  | 'clipLong'
  | 'clipShort'
  | 'clipImage'
  | 'clipSensitive'
  | 'folderChange'
  | 'foreground'
  | 'pushNote'

export type SpeechPools = Record<SpeechPoolKey, string[]>

export const DEFAULT_SPEECH: SpeechPools = {
  welcome: ['嗨，我是兔兔！', '我回来啦～', '想我了吗？', '嘿，今天的你精神不错嘛', '我一睁眼就看到你了'],
  morning: ['早上好呀～', '早安！今天也要加油哦', '新的一天，一起努力吧', '早上好，今天的太阳是我的台词本', '早安，从伸个懒腰开始'],
  noon: ['中午好，记得吃饭～', '午安，休息一下吧', '中午好，饭点别错过', '午后的能量，我来守护'],
  afternoon: ['下午好呀', '喝口水，伸个懒腰', '下午好，效率巅峰时段', '下午茶时间，点心配台词'],
  evening: ['晚上好～', '今天辛苦啦', '傍晚的灯，我陪你一起开', '晚上好，今天过得怎么样？'],
  night: ['夜深了，早点休息～', '该睡觉啦，晚安', '熬夜对身体不好哦', '夜深人静，我也开始犯困', '夜深了，睡吧，明天见'],
  interact: ['嗯？叫我吗？', '怎么啦～', '嘿嘿，有什么好事？', '再戳我就要咬人啦', '在听呢，你说嘛', '手指控号启动'],
  sleep: ['有点困了…先眯一会儿', '呼…呼…睡着了', '主人不在，我先睡会', '眼皮开始打架啦', '梦里也守着你的桌面'],
  happy: ['耶！好开心！', '太棒啦！', '今天运气不错嘛', '开心得想转圈圈', '值得庆祝的一天'],
  warning: ['感觉不太对劲…', '小心哦，好像出问题了', '设备好像在报警呢', '有点不对劲，留意一下', '警报灯在闪，有点紧张'],
  clipLink: ['这条链接…{placeholder} 我认得', '要蹭 {placeholder} 的热点了', '{placeholder} 是今天的重点网站吗', '链接新收录：{placeholder}'],
  clipCode: ['代码！我不懂，但觉得很高级', '这代码写得真辛苦吧', '看到缩进了，是认真写的代码', '纠结了三秒，决定这次不吐槽'],
  clipLong: ['好长的一段，我只看了一眼就划走了', '这内容够我看三天的', '这么长，我走神三十秒', '长文来了，我给标题点个赞'],
  clipShort: ['记下了。就这么点儿？', '简短而有力', '这几个字我印象深刻', '收到，信息已压缩'],
  clipImage: ['哇！一张图！我没看清', '图片，我的另一只眼很努力', '是图啊，我可擅长脑补了', '图片模式点亮'],
  clipSensitive: ['有点像密码。我什么都没看见', '保险的东西，我不碰', '这段内容我格式化处理了', '我捂住眼睛，乖'],
  folderChange: ['{placeholder} 有新动静', '文件夹里有新成员：{placeholder}', '{placeholder} 是新来的吗', '目录里多了个 {placeholder}'],
  foreground: ['在用 {placeholder}，摸鱼时间到？', '切到 {placeholder} 了，我当你的小尾巴', '目标 {placeholder}，已锁定', '我盯上 {placeholder} 了'],
  pushNote: ['收到：{title}', '有新推送：{title}', '刚来一条消息：{title}', '{title}，我记下了']
}

export type GreetingKey = 'morning' | 'noon' | 'afternoon' | 'evening' | 'night'

/** hour → 问候时段 */
export function greetingKey(hour: number): GreetingKey {
  if (hour >= 6 && hour < 11) return 'morning'
  if (hour >= 11 && hour < 14) return 'noon'
  if (hour >= 14 && hour < 18) return 'afternoon'
  if (hour >= 18 && hour < 23) return 'evening'
  return 'night'
}

/** 系统事件类型 → 消息池（与事件中心 STATE_CATEGORIES 语义一致；focus 类不打扰） */
export const EVENT_STATE_MAP: Record<string, SpeechPoolKey> = {
  cpu_high: 'warning',
  memory_warning: 'warning',
  battery_low: 'warning',
  network_error: 'warning',
  alarm: 'warning',
  warning: 'warning',
  error: 'warning',
  complete: 'happy',
  success: 'happy',
  reward: 'happy',
  user_idle: 'sleep',
  sleep: 'sleep',
  away: 'sleep',
  lock_screen: 'sleep'
}

/** 从消息池随机挑选，优先避开上一条（avoid 为消息文本）；空池返回 null。key 为来源池 key */
export function pickText(pool: string[], avoid: string | null, poolKey = ''): Speech | null {
  if (pool.length === 0) return null
  const candidates = pool.filter((t) => t !== avoid)
  const list = candidates.length > 0 ? candidates : pool
  const text = list[Math.floor(Math.random() * list.length)]
  return { key: poolKey || text, text }
}

/** 时段问候 */
export function greetingSpeech(pools: SpeechPools, hour: number, avoid: string | null): Speech | null {
  const poolKey = greetingKey(hour)
  return pickText(pools[poolKey], avoid, poolKey)
}

/** 启动欢迎语 */
export function welcomeSpeech(pools: SpeechPools, avoid: string | null): Speech | null {
  return pickText(pools.welcome, avoid, 'welcome')
}

/** 系统事件 → 台词；focus 类事件或空池返回 null */
export function eventSpeech(pools: SpeechPools, eventType: string, avoid: string | null): Speech | null {
  const poolKey = EVENT_STATE_MAP[eventType]
  if (!poolKey) return null
  return pickText(pools[poolKey], avoid, poolKey)
}

/** 状态台词（旧通道兼容：状态名直接对应池） */
export function stateSpeech(pools: SpeechPools, state: string, avoid: string | null): Speech | null {
  const pool = pools[state as SpeechPoolKey]
  if (!pool) return null
  return pickText(pool, avoid, state)
}

const TRUNCATE = 24

/** 将 {name} 占位替换为 vars 值；缺省/空占位移除；超长片段截断加 … */
export function interpolateSpeech(text: string, vars: Record<string, string>): string {
  let out = text.replace(/\{(\w+)\}/g, (_all, key: string) => {
    const value = vars[key] ?? ''
    if (value === '') return ''
    const trimmed = value.length > TRUNCATE ? value.slice(0, TRUNCATE) + '…' : value
    return trimmed
  })
  out = out.replace(/\s{2,}/g, ' ').trim()
  return out
}

/** 生成被动图标 → 气泡台词；kind=push 时正文附在第二行；无池/null 返回 null */
export function reactionReply(
  pools: SpeechPools,
  fired: Pick<PushApiFired, 'kind' | 'reaction' | 'placeholder' | 'title' | 'body'>,
  avoid: string | null
): Speech | null {
  const poolKey = (fired.reaction ?? (fired.kind === 'push' ? 'pushNote' : '')) as SpeechPoolKey
  const pool = pools[poolKey]
  if (!pool || pool.length === 0) return null
  const line = pickText(pool, avoid, poolKey)
  if (!line) return null
  const vars: Record<string, string> = {
    placeholder: fired.placeholder ?? '',
    title: fired.title ?? ''
  }
  let text = interpolateSpeech(line.text, vars)
  if (fired.kind === 'push' && fired.body) text += `\n${fired.body}`
  return { key: poolKey, text }
}
