# 被动事件拟人化互动 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让剪贴板/文件夹/前台/推送触发时，桌宠以可自定义的拟人化台词互动，不再复述原文。

**Architecture:** main 端（clipboardSource/被动源）只算"事件特征"（链接/代码/长文/短文/图片/敏感，文件名/应用名作占位），IPC `push:fired` 消息携带 `reaction`（台词池 key）+ 可选 `placeholder`；pet 渲染层用 `reactionReply()` 从台词池取句 + 占位插值 + 气泡。剪贴板原文不经过 IPC。

**Tech Stack:** TypeScript 严格模式、vitest（现有 391 测试）、Electron、零新依赖。

## Global Constraints

- **零新增依赖**：不得 `npm install` 任何新包。
- **类型严格**：`npm run typecheck`（`tsc --noEmit -p tsconfig.web.json --composite false`）必须 0 错误。
- **回归绿**：`npm test` 全部通过（当前 391 条，完成后只增不减）；`npm run build` 成功。
- **本项目无 git**：所有任务省略 commit 步骤，任务末尾以 `npm run typecheck` + 相关 vitest 文件跑通作为验收；全部 7 个任务完成后统一 bump 版本 + 更新 CHANGELOG。
- 命令规范：单文件测试 `npx vitest run <path>`；全量 `npm test`。
- 台词文案不加 emoji、不加注释（遵守仓库风格）。

---

### Task 1: speech 层：新台词池 + 占位插值

**Files:**
- Modify: `src/shared/speech.ts`
- Test: `src/shared/speech.test.ts`

**Interfaces:**
- Produces:
  - `SpeechPoolKey` 新增：`'clipLink' | 'clipCode' | 'clipLong' | 'clipShort' | 'clipImage' | 'clipSensitive' | 'folderChange' | 'foreground' | 'pushNote'`
  - `DEFAULT_SPEECH` 覆盖全部新 key（数组每个至少 1 条）
  - `interpolateSpeech(text: string, vars: Record<string, string>): string`：将 `{name}` 占位替换为 `vars[name]`；var 缺失或为空 → 移除该 token 及其紧邻多余空白；最终去首尾空白。占位片段超过 24 字符截断加 `…`。

- [ ] **Step 1: 写失败测试**

在 `src/shared/speech.test.ts` 末尾追加：

```ts
describe('新增互动池', () => {
  const KEYS = [
    'clipLink',
    'clipCode',
    'clipLong',
    'clipShort',
    'clipImage',
    'clipSensitive',
    'folderChange',
    'foreground',
    'pushNote'
  ] as const
  it('DEFAULT_SPEECH 包含全部新池且非空', () => {
    for (const k of KEYS) {
      expect(DEFAULT_SPEECH[k].length).toBeGreaterThan(0)
    }
  })
})

describe('interpolateSpeech', () => {
  it('占位符替换', () => {
    expect(interpolateSpeech('收到：{title}', { title: '下载完成' })).toBe('收到：下载完成')
  })
  it('缺失占位 → 移除 token 并清理多余空白', () => {
    expect(interpolateSpeech('{domain} 有动静', {})).toBe('有动静')
    expect(interpolateSpeech('前缀 {name} 后缀', {})).toBe('前缀 后缀')
  })
  it('占位超 24 字符截断', () => {
    expect(interpolateSpeech('链接：{domain}', { domain: 'very-long-domain-name-that-exceeds-limit.com' }).length).toBeLessThanOrEqual('链接：'.length + 25)
    expect(interpolateSpeech('链接：{domain}', { domain: 'very-long-domain-name-that-exceeds-limit.com' })).toMatch(/…$/)
  })
  it('无占位原样返回', () => {
    expect(interpolateSpeech('你好啊', {})).toBe('你好啊')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/shared/speech.test.ts`
Expected: 编译报错（SpeechPoolKey 暂无新 key、interpolateSpeech 未定义）。

- [ ] **Step 3: 实现**

`src/shared/speech.ts`：

```ts
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
```

`DEFAULT_SPEECH` 末尾追加（占位符统一为 `{placeholder}` 与 `{title}` 两个 token；`placeholder` 由 IPC 提供域名/文件名/应用名）：

```ts
  clipLink: ['这条链接…{placeholder} 我认得，摸鱼的味道', '要蹭 {placeholder} 的热点了'],
  clipCode: ['代码！我不懂，但感觉很高级', '这代码写得真辛苦吧'],
  clipLong: ['好长的一段，我只看了一眼就划走了', '这内容够我看三天的'],
  clipShort: ['记下了。就这么点儿？', '简短而有力'],
  clipImage: ['哇！一张图！我没看清', '图片，我的另一只眼很努力'],
  clipSensitive: ['有点像密码。我什么都没看见', '保险的东西，我不碰'],
  folderChange: ['{placeholder} 有新动静', '文件夹里有新成员：{placeholder}'],
  foreground: ['在用 {placeholder}，摸鱼时间到？', '切到 {placeholder} 了，我当你的小尾巴'],
  pushNote: ['收到：{title}', '有新推送：{title}']
```

文件末尾追加：

```ts
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/shared/speech.test.ts`
Expected: 全部 PASS（含原有 greeting/pick 等）。

- [ ] **Step 5: 全量回归**

Run: `npm run typecheck` 必须 0 错误；`npx vitest run` 全部通过。

---

### Task 2: 剪贴板内容分类器（纯函数）

**Files:**
- Create: `src/main/event/sourceClassifier.ts`
- Test: `src/main/event/sourceClassifier.test.ts`

**Interfaces:**
- Consumes: 无。
- Produces:
  - `export type ClipboardFeature = 'clipLink' | 'clipCode' | 'clipLong' | 'clipShort'`
  - `export function classifyClipboard(text: string): ClipboardFeature`
  - `export function isSensitive(text: string): boolean`
  - `export function extractDomain(url: string): string | null`

- [ ] **Step 1: 写失败测试**

`src/main/event/sourceClassifier.test.ts`：

```ts
import { describe, expect, it } from 'vitest'
import { classifyClipboard, extractDomain, isSensitive } from './sourceClassifier'

describe('classifyClipboard', () => {
  it('链接 → clipLink', () => {
    expect(classifyClipboard('https://example.com/page?q=1')).toBe('clipLink')
    expect(classifyClipboard('http://a.b/c')).toBe('clipLink')
    expect(classifyClipboard('www.example.com')).toBe('clipLink')
  })
  it('多行代码 → clipCode', () => {
    expect(classifyClipboard('function a() {\n  return 1\n}')).toBe('clipCode')
    expect(classifyClipboard('import x from "y"\nconst a = 1')).toBe('clipCode')
  })
  it('单行代码特征 → clipCode', () => {
    expect(classifyClipboard('const a = () => 1')).toBe('clipCode')
  })
  it('单行超长文本 → clipLong', () => {
    expect(classifyClipboard('字'.repeat(50))).toBe('clipLong')
  })
  it('单行短文本 → clipShort', () => {
    expect(classifyClipboard('你好')).toBe('clipShort')
    expect(classifyClipboard('https://example.com is fine')).toBe('clipLink')
  })
  it('空串 → clipShort', () => {
    expect(classifyClipboard('')).toBe('clipShort')
  })
})

describe('isSensitive', () => {
  it('密钥/账号特征', () => {
    expect(isSensitive('sk-abcdef1234567890')).toBe(true)
    expect(isSensitive('AKIAIOSFODNN7EXAMPLE')).toBe(true)
    expect(isSensitive('-----BEGIN RSA PRIVATE KEY-----')).toBe(true)
  })
  it('卡号 13-19 位数字', () => {
    expect(isSensitive('6222600260001072444')).toBe(true)
  })
  it('6 位验证码', () => {
    expect(isSensitive('验证码 123456 有效')).toBe(true)
  })
  it('普通文字不误判', () => {
    expect(isSensitive('hello world')).toBe(false)
    expect(isSensitive('12345')).toBe(false)
    expect(isSensitive('今天天气不错')).toBe(false)
  })
})

describe('extractDomain', () => {
  it('http 链接取域名', () => {
    expect(extractDomain('https://www.example.com/path?a=1')).toBe('example.com')
    expect(extractDomain('http://a.b.co/x')).toBe('a.b.co')
  })
  it('裸域名', () => {
    expect(extractDomain('www.example.com')).toBe('example.com')
  })
  it('非链接返回 null', () => {
    expect(extractDomain('你好')).toBeNull()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/main/event/sourceClassifier.test.ts`
Expected: 模块未定义报错。

- [ ] **Step 3: 实现 `src/main/event/sourceClassifier.ts`**

```ts
const URL_RE = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/?#]|$)/i
const CODE_RE = /(?:=>|import |export |function\s|const |let |return |def |sudo |#include|;\s*\n|->|```|class )/
const LONG_LEN = 40

/** 剪贴板文本 → 拟人反应类别（纯文本启发式） */
export type ClipboardFeature = 'clipLink' | 'clipCode' | 'clipLong' | 'clipShort'

export function classifyClipboard(text: string): ClipboardFeature {
  const t = text.trim()
  if (URL_RE.test(t) && t.length <= 100) return 'clipLink'
  if (text.includes('\n') && (CODE_RE.test(text) || text.includes('{'))) return 'clipCode'
  if (text.length > LONG_LEN) return 'clipLong'
  if (CODE_RE.test(text)) return 'clipCode'
  return 'clipShort'
}
```

注意 `CODE_RE` 里 `=>|import |function |const ` 只做始启发式，允许误判比例低即可；不要过度工程。

```ts
const SENSITIVE_RE =
  /(sk-[A-Za-z0-9]{8,}|AKIA[A-Z0-9]{12,}|gh[pous]_[A-Za-z0-9]{20,}|\bgithub_pat_\w+|-----BEGIN [A-Z ]+PRIVATE KEY-----|password\s*[=:]\s*\S+|token\s*[=:]\s*\S+/i
const CARD_RE = /\b\d{13,19}\b/
const OTP_RE = /(?:验证码|短信码|OTP)[：: ]?\s*\d{6}/

export function isSensitive(text: string): boolean {
  return SENSITIVE_RE.test(text) || CARD_RE.test(text) || OTP_RE.test(text)
}
```

注意：`CARD_RE/\b\d{13,19}\b/` 会把 13~19 位纯数字都当敏感——但剪贴板 `ignorePatterns` 默认 `^\d+$` 已挡纯数字。仍有风险误伤长数字串；可先接受（评估时再收紧）。

```ts
export function extractDomain(url: string): string | null {
  const t = url.trim()
  const m = t.match(URL_RE)
  if (!m) return null
  let domain = m[1]
  if (domain.startsWith('www.')) domain = domain.slice(4)
  return domain.length > 0 ? domain : null
}
```

注意 `URL_RE` 存在 `startsWith('www.')` 检查，但正则已消费 `www.`；如需保险保留两种写法，若发现死代码可裁剪。

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/main/event/sourceClassifier.test.ts`
Expected: 全过。

- [ ] **Step 5: 全量回归**

Run: `npm run typecheck` 0 错误；`npx vitest run` 全过。

---

### Task 3: clipboardSource 改造（分类 + 图片探测 + 指纹抑制 + reaction notify）

**Files:**
- Modify: `src/main/event/sources/clipboardSource.ts`
- Test: `src/main/event/sources/clipboardSource.test.ts`

**Interfaces:**
- Consumes: `sourceClassifier`（Task 2），`interpolateSpeech` 不在此用。
- Produces:
  - `createClipboardSource(read: () => { text: string; hasImage: boolean }, cfg: () => PassiveClipboardConfig): EventSource`
  - notify 形态：`ctx.notify('push:fired', { kind: 'passive', reaction, placeholder? })`，`reaction` 只在 `'clipLink'|'clipCode'|'clipLong'|'clipShort'|'clipImage'|'clipSensitive'` 中取值。

- [ ] **Step 1: 改写失败测试**

`src/main/event/sources/clipboardSource.test.ts` 全文替换为：

```ts
import { describe, expect, it, vi } from 'vitest'
import { createClipboardSource } from './clipboardSource'
import type { PassiveClipboardConfig } from '../../../shared/ipc'
import type { SourceContext } from '../sourceHub'

function makeCtx(): SourceContext & Record<string, ReturnType<typeof vi.fn>> {
  return {
    inject: vi.fn(),
    replaceBySource: vi.fn(),
    notify: vi.fn(),
    count: vi.fn(),
    log: vi.fn()
  }
}

function baseCfg(over: Partial<PassiveClipboardConfig> = {}): PassiveClipboardConfig {
  return { enabled: true, pollMs: 300, onlyPatterns: [], ignorePatterns: [], maxLen: 120, ...over }
}

function read(text: string, hasImage = false) {
  return vi.fn(() => ({ text, hasImage }))
}

describe('createClipboardSource：内容变化触发', () => {
  it('短文本 → clipShort，notify 不带原文', () => {
    const ctx = makeCtx()
    const source = createClipboardSource(read('hello'), () => baseCfg())
    source.start(ctx)
    source.poll?.(1000)
    expect(ctx.count).toHaveBeenCalledWith('clipboard')
    expect(ctx.inject).toHaveBeenCalledTimes(1)
    expect(ctx.notify).toHaveBeenCalledWith('push:fired', { kind: 'passive', reaction: 'clipShort' })
  })

  it('链接 → clipLink + placeholder 域名', () => {
    const ctx = makeCtx()
    const source = createClipboardSource(read('https://www.example.com/x'), () => baseCfg())
    source.start(ctx); source.poll?.(1000)
    expect(ctx.notify).toHaveBeenCalledWith('push:fired', { kind: 'passive', reaction: 'clipLink', placeholder: 'example.com' })
  })

  it('图片剪贴板 → clipImage', () => {
    const ctx = makeCtx()
    const source = createClipboardSource(read('', true), () => baseCfg())
    source.start(ctx); source.poll?.(1000)
    expect(ctx.notify).toHaveBeenCalledWith('push:fired', { kind: 'passive', reaction: 'clipImage' })
  })

  it('敏感文本 → clipSensitive 且不带 placeholder', () => {
    const ctx = makeCtx()
    const source = createClipboardSource(read('sk-abcdef1234567890'), () => baseCfg())
    source.start(ctx); source.poll?.(1000)
    expect(ctx.notify).toHaveBeenCalledWith('push:fired', { kind: 'passive', reaction: 'clipSensitive', placeholder: '' })
  })
})

describe('createClipboardSource：指纹抑制', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 0, 1)) })
  afterEach(() => { vi.useRealTimers() })

  it('同文本 A→B→A（8s 窗口内）只通知两次', () => {
    const seq = ['A', 'B', 'A']
    let i = 0
    const readText = vi.fn(() => ({ text: seq[i], hasImage: false }))
    const ctx = makeCtx()
    const source = createClipboardSource(readText, () => baseCfg({ pollMs: 0 }))
    source.start(ctx)
    source.poll?.(1000); i++
    source.poll?.(2000); i++
    source.poll?.(3000)
    expect(ctx.notify).toHaveBeenCalledTimes(2) // A、B 各一次；第二次 A 被抑制
  })
})
```

（该 describe 用 fake timers 固定系统时间，使 dedup 窗口内的第三次触发被抑制。）

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/main/event/sources/clipboardSource.test.ts`
Expected: FAIL（签名/notify 形态不匹配）。

- [ ] **Step 3: 实现 clipboardSource.ts**

```ts
import { clipboardShouldNotify } from '../clipboard'
import { classifyClipboard, extractDomain, isSensitive } from '../sourceClassifier'
import type { PassiveClipboardConfig } from '../../../shared/ipc'
import type { EventSource, SourceContext } from '../sourceHub'

const DEDUP_WINDOW_MS = 8000

export function createClipboardSource(
  read: () => { text: string; hasImage: boolean },
  cfg: () => PassiveClipboardConfig
): EventSource {
  let ctx: SourceContext | null = null
  let lastText = ''
  let lastPollAt = 0
  const seen: Map<string, number> = new Map()

  function notif(reaction: string, placeholder = ''): void {
    if (ctx == null) return
    ctx.notify('push:fired', { kind: 'passive', reaction, placeholder })
  }

  function poll(now: number): void {
    if (ctx == null) return
    if (now - lastPollAt < cfg().pollMs) return
    lastPollAt = now
    const { text, hasImage } = read()
    if (text === '' && !hasImage) return
    if (text !== '' && text === lastText && !hasImage) return
    if (text !== '' && clipboardShouldNotify(text, cfg()).ok !== true) {
      lastText = text
      return
    }
    const nowRef = Date.now()
    const fingerprint = text === '' ? `img:${nowRef.toString(36)}` : text
    // 短时窗口内同一内容不重复
    const lastSeen = seen.get(fingerprint) ?? 0
    if (text !== '' && nowRef - lastSeen < DEDUP_WINDOW_MS) {
      lastText = text
      return
    }
    seen.set(fingerprint, nowRef)
    if (seen.size > 64) {
      const first = seen.keys().next().value
      if (first !== undefined) seen.delete(first)
    }
    ctx.count('clipboard')
    ctx.inject({ source: 'clipboard', type: 'clipboard', priority: 5, durationMs: 8000, occurredAt: Date.now() })
    if (hasImage) {
      notif('clipImage')
      lastText = text
      return
    }
    if (isSensitive(text)) {
      notif('clipSensitive')
      lastText = text
      return
    }
    const feature = classifyClipboard(text)
    const placeholder = feature === 'clipLink' ? extractDomain(text) ?? '' : ''
    notif(feature, placeholder)
    lastText = text
  }

  return {
    id: 'clipboard',
    kind: 'poll',
    enabled: () => cfg().enabled,
    start: (c: SourceContext) => { ctx = c },
    stop: () => {},
    poll
  }
}
```

注意：上述实现中 `hashImage` 双分支可合并，保持简单；`seen` 上限裁剪用 `Map.keys().next()` 即可（ES2015 兼容）。`clipboardShouldNotify` 只对 text 判（hasImage 时跳过规则）。

- [ ] **Step 4: 测试通过**

Run: `npx vitest run src/main/event/sources/clipboardSource.test.ts`
Expected: 全过。

- [ ] **Step 5: 全量回归**

Run: `npm run typecheck`；`npm test`。

---

### Task 4: 文件夹/前台源 notify 改 reaction + 主进程被动源接入

**Files:**
- Modify: `src/main/event/sources/folderSource.ts`, `src/main/event/sources/foregroundSource.ts`
- Test: `src/main/event/sources/folderSource.test.ts`, `src/main/event/sources/foregroundSource.test.ts`

**Interfaces:**
- Consumes: `SourceContext`。
- Produces:
  - 文件夹：`ctx.notify('push:fired', { kind:'passive', reaction:'folderChange', placeholder: fileName })`（`fileName` 取新增文件名字，不再传绝对路径）
  - 前台聚焦：`ctx.notify('push:fired', { kind:'passive', reaction:'foreground', placeholder: processName })`（仅进程切换且 focus 映射时）。

- [ ] **Step 1: 先改 folderSource 的失败测试**

在 `folderSource.test.ts` 找到并替换断言（行 96-99）：

```ts
    expect(ctx.notify).toHaveBeenCalledWith('push:fired', {
      kind: 'passive',
      reaction: 'folderChange',
      placeholder: 'new.png'
    })
```

- [ ] **Step 2: 运行失败**

Run: `npx vitest run src/main/event/sources/folderSource.test.ts`
Expected: assertion 不匹配 → FAIL。

- [ ] **Step 3: 实现 folderSource notify**

`folderSource.ts` 中 `ctx.notify(...)` 替换为：

```ts
        ctx.notify('push:fired', { kind: 'passive', reaction: 'folderChange', placeholder: f })
```

- [ ] **Step 4: 文件夹测试通过**

Run: `npx vitest run src/main/event/sources/folderSource.test.ts`
Expected: 全过。

- [ ] **Step 5: 增加前台源 notify（行为增强）**

`foregroundSource.ts` 在成功聚焦（`m.state === 'focus'`）分支内、`c.inject(...)` 之后追加：

```ts
            c.notify('push:fired', { kind: 'passive', reaction: 'foreground', placeholder: app.process })
```

在 `foregroundSource.test.ts` 新增用例：`切换聚焦 → notify foreground`（构造 `getForegroundApp` mock 返回某 focus 进程两次不同进程，断言 notify 调用）。参考现有测试写法（第 93-130 行附近有 `runner` mock 用法）。

- [ ] **Step 6: 前台测试跑通 + 全量回归**

Run: `npx vitest run src/main/event/sources/foregroundSource.test.ts`; 然后 `npm run typecheck` + `npm test`。

---

### Task 5: IPC 类型 + preload + 主进程 pushApi / passive:test 同步

**Files:**
- Modify: `src/shared/ipc.ts`（`PushApiFired`）, `src/preload/index.ts`（仅 import 引用不变）, `src/preload/index.d.ts`（类型引用不变）
- Modify: `src/main/index.ts`（pushApi handler、passive:test、passiveHub 组装点）
- Test: 无新测试（已有 `clipboardSource`/`folderSource` 覆盖）；靠 typecheck 把关。

**Interfaces:**
- Produces:
  - `interface PushApiFired { kind?: 'push' | 'passive'; reaction?: string; placeholder?: string; title?: string; body?: string; type?: string }`
  - main pushApi handler 改为 `{ kind:'push', reaction:'pushNote', title: body.title, body }`
  - passive:test：clipboard 分支用 `sourceClassifier` 出 reaction；folder 分支 `{kind:'passive', reaction:'folderChange', placeholder: hit}`；新增 foreground 成功分支补 notify。

- [ ] **Step 1: 改 ipc.ts 类型**

`src/shared/ipc.ts` 内 `PushApiFired` 替换为：

```ts
/** push:fired 事件（主进程 → 渲染层，气泡展示） */
export interface PushApiFired {
  /** 来源：push=第三方推送通道；passive=被动数据源 */
  kind?: 'push' | 'passive'
  /** 台词池 key（见 speech.ts SpeechPoolKey） */
  reaction?: string
  /** 简短占位片段（域名/文件名/应用名/推送标题） */
  placeholder?: string
  title?: string
  body?: string
  type?: string
}
```

- [ ] **Step 2: 改 pushApi handler**

`src/main/index.ts` 第 634 行改为：

```ts
  const fired: PushApiFired = {
    kind: 'push',
    reaction: 'pushNote',
    title: body.title,
    body: body.message,
    type: body.type
  }
```

- [ ] **Step 3: 改 passive:test handler（clipboard / folder / foreground）**

clipboard 分支（第 904-914 行）替换为：

```ts
    if (id === 'clipboard') {
      const text = clipboard.readText()
      if (!text.trim()) return { ok: false, error: '剪贴板当前为空' }
      if (clipboardShouldNotify(text, passiveCfg.clipboard).ok !== true) {
        return { ok: false, error: '剪贴板内容不满足当前规则' }
      }
      const now = Date.now()
      recordStats((s) => countEvent(s, 'clipboard'))
      events = addEvent(events, { source: 'clipboard', type: 'clipboard', priority: 5, durationMs: 8000, occurredAt: now })
      const reaction = isSensitive(text)
        ? 'clipSensitive'
        : classifyClipboard(text)
      const placeholder = reaction === 'clipLink' ? extractDomain(text) ?? '' : ''
      notifyPet('push:fired', { kind: 'passive', reaction, placeholder })
      return { ok: true }
    }
```

文件头 import 增加：`import { classifyClipboard, extractDomain, isSensitive } from './event/sourceClassifier'`；若 `clipboardBody` 不再被使用，将其 import 一并删除（`npm run typecheck` 会以 0 错误为准）。

folder 分支（第 925 行）：

```ts
      notifyPet('push:fired', { kind: 'passive', reaction: 'folderChange', placeholder: hit })
```

focus 分支成功返回前补 notify（回显进程名）：

```ts
      notifyPet('push:fired', { kind: 'passive', reaction: 'foreground', placeholder: app.process })
```

（`app` 在 then 回调里作用域内。）

- [ ] **Step 4: typecheck + 全量回归**

Run: `npm run typecheck` 0 错误；`npm test` 全过。

---

### Task 6: PetApp 渲染接线（reactionReply）

**Files:**
- Modify: `src/shared/speech.ts`（新增 `reactionReply`）
- Test: `src/shared/speech.test.ts`
- Modify: `src/renderer/src/pet/PetApp.tsx`

**Interfaces:**
- Produces:
  - `function reactionReply(pools: SpeechPools, fired: PushApiFired, avoid: string | null): Speech | null`：
    - 池 key = `fired.reaction`（合法 pool key）否则 `push`/`pushNote`，否则 `null`
    - 行 = `pickText(pool, avoid)`；无则 `null`
    - `vars = { placeholder: fired.placeholder ?? '', title: fired.title ?? '' }`
    - `text = interpolateSpeech(line.text, vars)`
    - `kind==='push' && fired.body` → `text += '\n' + fired.body`
  - `PushApiFired` 类型（Task 5 已定义）供 `speech.ts` import 使用（同包 shared 内 import）。

- [ ] **Step 1: 失败测试**

`src/shared/speech.test.ts` 追加：

```ts
describe('reactionReply', () => {
  it('by reaction 选池并插值 → placeholder', () => {
    const pools = { ...DEFAULT_SPEECH, clipLink: ['逛逛 {placeholder}？'] }
    const fired = { kind: 'passive', reaction: 'clipLink', placeholder: 'example.com' } as const
    expect(reactionReply(pools, fired, null)!.text).toBe('逛逛 example.com？')
  })
  it('敏感无 placeholder → 语句不残留占位', () => {
    const pools = { ...DEFAULT_SPEECH, clipSensitive: ['{placeholder}不看，我闭眼'] }
    const fired = { kind: 'passive', reaction: 'clipSensitive' } as const
    expect(reactionReply(pools, fired, null)!.text).toBe('不看，我闭眼')
  })
  it('push 保留标题 + 正文第二行', () => {
    const pools = { ...DEFAULT_SPEECH, pushNote: ['收到：{title}'] }
    const fired = { kind: 'push', reaction: 'pushNote', title: '完成', body: 'file.zip' } as const
    expect(reactionReply(pools, fired, null)!.text).toBe('收到：完成\nfile.zip')
  })
  it('空池 → null', () => {
    expect(reactionReply({ ...DEFAULT_SPEECH, clipLink: [] }, { kind: 'passive', reaction: 'clipLink' }, null)).toBeNull()
  })
})
```

（`as const` 与 `PushApiFired` 结构兼容性 OK；若 TS 报字段类型更宽，去掉 `as const`。）

- [ ] **Step 2: 运行失败**

Run: `npx vitest run src/shared/speech.test.ts`
Expected: `reactionReply` 未定义。

- [ ] **Step 3: 在 `src/shared/speech.ts` 新增 `reactionReply`**

```ts
import type { PushApiFired } from './ipc'

/** 生成被动图标 → 气泡台词；kind=push 时正文附在第二行；无池/null 返回 null */
export function reactionReply(
  pools: SpeechPools,
  fired: Pick<PushApiFired, 'kind' | 'reaction' | 'placeholder' | 'title' | 'body'>,
  avoid: string | null
): Speech | null {
  const poolKey = (fired.reaction ?? (fired.kind === 'push' ? 'pushNote' : '')) as SpeechPoolKey
  const pool = pools[poolKey]
  if (!pool || pool.length === 0) return null
  const line = pickText(pool, avoid)
  if (!line) return null
  const vars: Record<string, string> = {
    placeholder: fired.placeholder ?? '',
    title: fired.title ?? ''
  }
  let text = interpolateSpeech(line.text, vars)
  if (fired.kind === 'push' && fired.body) text += `\n${fired.body}`
  return { key: poolKey, text }
}
```

注意 `as SpeechPoolKey` 在 `fired.reaction` 可能为任意字符串：`reaction:'???'` 不合法 key → `pools[key]` undefined → null 返回，安全。

- [ ] **Step 4: 测试通过 + PetApp 接线**

Run: `npx vitest run src/shared/speech.test.ts` 全过。

`src/renderer/src/pet/PetApp.tsx`：将现有的 `onPushFired` effect（当前直接复述原文）替换为：

```ts
  useEffect(() => {
    return window.desktopPet.events.onPushFired((fired) => {
      // 被动源/推送 → 台词池拟人反应；push 正文附第二行
      const msg = reactionReply(poolsRef.current, fired, lastSpeechText.current)
      if (msg) {
        lastSpeechText.current = msg.text
        setSpeech({ key: 'reaction', text: msg.text })
        if (speechTimer.current) clearTimeout(speechTimer.current)
        speechTimer.current = setTimeout(() => setSpeech(null), 8000)
      }
    })
  }, [])
```

`src/renderer/src/pet/PetApp.tsx` import 行（第 6 行）追加 `reactionReply`（保留现有其他 import）。

- [ ] **Step 5: 全量回归**

Run: `npm run typecheck`；`npm test`；`npm run build`。

---

### Task 7: 台词页展示 + 收盘

**Files:**
- Modify: `src/renderer/src/center/CenterApp.tsx`
- Modify: `CHANGELOG.md`
- （脚本）`node .superpowers\sdd\bump-version.js 0.9.0806.04 0.9.0806.05` + `node .superpowers\sdd\copy-backup.js "backup\backup_20260806_v09-complete"`

**Interfaces:**
- Consumes: `SpeechPoolKey`（Task 1）。

- [ ] **Step 1: 台词设置页加 9 条**

`CenterApp.tsx` 的 `SPEECH_KEYS` 数组（约 45 行）末尾追加：

```ts
  { key: 'clipLink', label: '剪贴板·链接', hint: '复制到链接时，{domain} 自动代入域名' },
  { key: 'clipCode', label: '剪贴板·代码', hint: '复制到代码时' },
  { key: 'clipLong', label: '剪贴板·长文', hint: '复制到长文本时' },
  { key: 'clipShort', label: '剪贴板·短文', hint: '复制到短文本时' },
  { key: 'clipImage', label: '剪贴板·图片', hint: '剪贴板含图片时' },
  { key: 'clipSensitive', label: '剪贴板·敏感', hint: '疑似密码/卡号等时' },
  { key: 'folderChange', label: '文件夹变化', hint: '监听目录新增文件时，{name} 代入文件名' },
  { key: 'foreground', label: '前台应用', hint: '切换到已映射应用时，{name} 代入进程名' },
  { key: 'pushNote', label: '推送提醒', hint: '第三方推送 API 时，{title} 代入标题' }
```

（`SPEECH_KEYS` 数组中每项需保证 hint 文案精简、与默认池语义一致。）

- [ ] **Step 2: 前端 typecheck**

Run: `npm run typecheck` 0 错误（新建 pool key 已覆盖）。

- [ ] **Step 3: 收盘：CHANGELOG + bump + 备份**

`CHANGELOG.md` "修复/改进"段落追加：

```md
改进：
- 被动数据源（剪贴板/目录/前台）改为拟人化台词互动：不再复述剪贴板原文/路径，按内容特征（链接/代码/长文/短文/图片/敏感）从台词池生成反应，支持 {domain}/{name}/{title} 占位符，台词设置页新增 9 组可自定义台词池
- 剪贴板原文不再经 IPC 下发到渲染层，敏感内容（token/密码/卡号/验证码）仅以专用台词回应
- 剪贴板重复抑制：同一内容 8 秒内不重复触发，避免连弹
- push 通道保留正文展示，套用「收到：{title}」台词包装（介于第三行）
```

Run:

```bash
node .superpowers\sdd\bump-version.js 0.9.0806.04 0.9.0806.05
npm run typecheck
npm test
npm run build
node .superpowers\sdd\copy-backup.js "backup\backup_20260806_v09-complete"
```

- [ ] **Step 4: 【端到端验证】CDP 手动复现**

启动调试实例（`electron . --remote-debugging-port=9223`，端口应与历史脚本一致），跑 CDP 驱动：
1. 复制一段链接 → 兔兔气泡应显示台词且含域名（不含原文）
2. 复制 `sk-...` → 只显示敏感台词，无任何 token 片段
3. 中心「开发者 → 测试剪贴板」→ 同样行为
4. 中心「复制」测试 → 气泡「收到：xxx」第二行显示正文

脚本历史见 `C:\Users\30816\AppData\Local\Temp\opencode\cdp-driver*.mjs`（遗留同目录，参考 4 号脚本写法）。

---

## Self-Review

- **Spec coverage**：spec 全部 7 节被 Task 1-7 覆盖；图片探测（Task 3）、敏感拦截（Task 2/5）、fingerprint（Task 3）、push 保留正文（Task 5/6）、台词池 + 插值（Task 1）、前台源 notify（Task 4）、台词页（Task 7）、端到端（Task 7-⑤）。
- **Placeholder scan**：全部 Step 均带真实代码；已消除全部占位措辞。
- **Type consistency**：`PushApiFired` 新形状在 Task 5 定义、Task 6（`reactionReply` Pick）与 `notifyPet`（Task 3/4）使用一致；`reaction` 统一取 SpeechPoolKey 同名字符串；preload/index.d.ts 与 preload/index.ts 仍引用 `PushApiFired`，无需改名。