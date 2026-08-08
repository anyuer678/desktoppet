# 设计：被动事件拟人化互动（v0.9.1）

日期：2026-08-07
状态：已批准

## 背景

v0.9 被动数据源上线后，剪贴板/文件夹/前台/推送触发时，`push:fired` 事件把**原文**（剪贴板全文、文件路径、前台窗口名、推送正文）直接复述在兔兔气泡里，效果机械、有刷屏感，且剪贴板全文外显存在隐私风险。

目标：被动事件改走**拟人化互动**——兔兔不原文复述，而是根据事件内容特征从（可自定义的）台词池挑选一句有性格的台词，可选地在台词里注入**简短占位片段**（域名/文件名/应用名/推送标题）。

## 非目标

- 不做表情/动作动画（本期只改台词与气泡文案）
- 不做被动数据源之外的识别（如 OCR 剪贴板图片，只识别"是否有图片"）
- 不改动 v0.8 push API 的调用/通知通道，仅加台词包装
- 不重构事件中心/sourceHub

## 决策摘要

1. **原文不下发**：剪贴板文本只在 main 端算特征，IPC 消息携带特征与占位片段，不携带原文全文；疑似敏感内容时 body 整条拦截。
2. **剪贴板 5 类特征**：链接 / 代码 / 长文 / 短文 / 图片（sensitive 拦截后走专用池，共 6 类台词池）。
3. **9 个新台词池**并入现有语音池体系（`SpeechPools` + 台词设置页），支持 `{占位符}` 插值。
4. **重复抑制**：fingerprint(text) + 8s 时间窗，同一内容短时间不重复触发（现有仅比对上一读，无法避免 A→B→A 三次触发）。
5. **push 保留原文语义**：第三方通知本质是展示正文，仅套一句台词包装（如「收到：{title}」），正文照常显示。
6. 文件夹/前台源：特征天然自带（名称/操作），直接进占位片段。

## 数据流

```
[clipboardSource 轮询]
  readClipboard → {text, hasImage}
  └─ clipboardShouldNotify 规则 → 不满足则跳过
  └─ classifyClipboard(text) / isSensitive(text) / hasImage → reactionKey
  └─ fingerprint 抑制（8s 窗）→ 命中则跳过
  └─ ctx.inject(event)         // 事件中心照旧
  └─ ctx.notify('push:fired', {
        kind: 'passive' | 'push',
        reaction: 'clipLink'|'clipCode'|…|'pushNote',
        title?: string,          // push 通道标题；被动源可省略
        body?: string,           // push 正文照常；被动源不传原文
        placeholder?: string     // 域名/文件名/应用名 等简短特征
     })

[folderSource / foregroundSource]
  属性 notify('push:fired', { kind:'passive', reaction:'folderChange'|'foreground', placeholder: name })

[preload] events.onPushFired<PushApiFired>（类型扩展，字段全可选）

[PetApp]
  onPushFired → reaction 台词池 → pickText(request,避免上一条) → 占位插值 → setSpeech({key, text}) 8s
  └─ clipSensitive：无 placeholder，只有台词
  └─ push：title 作为占位符 {title}，body 其余展示在台词下方（保留现状语义）
```

## 模块

### 1. `src/main/event/sourceClassifier.ts`（新增，纯函数）
- `classifyClipboard(text: string): 'link' | 'code' | 'long' | 'short'`
  - link：匹配 URL（`https?://` 或带点域名样式）
  - code：多行，或含代码风格符号（`=>`、`{` … `}` 配对、`#include`、`import `、`def `、`;` 后换行等）
  - long：单行且长度 > 阈值（建议 40）
  - short：其余
- `isSensitive(text: string): boolean`：`sk-`、`AKIA`、`ghp_/github_pat_`、`-----BEGIN`、19 位卡号、身份证、6 位验证码、`password=`/`token=`/`token:` 等（正则表集中维护）
- `extractDomain(url): string | null`（link 占位片段）

### 2. `src/shared/speech.ts`（扩展）
- `SpeechPoolKey` 增加：`clipLink` / `clipCode` / `clipLong` / `clipShort` / `clipImage` / `clipSensitive` / `folderChange` / `foreground` / `pushNote`
- `DEFAULT_SPEECH` 增加默认台词（见下）
- 新增 `interpolateSpeech(text, vars)`：将 `{name}` 等占位替换为传入值；无对应值则删除占位片段；长片段 > 指定长度截断加 …

默认台词示例（可调）：
- clipLink：`这条链接…{domain}？我闻到了摸鱼的味道` / `又要我盯着哪家网站啦？`
- clipCode：`代码的味道…我不专业，但很感兴趣` / `这代码写得很辛苦吧`
- clipLong：`好长的一段，我只看了一眼就划走了` / `这内容够我看三天的`
- clipShort：`记下了。就这么点儿？` / `简短而有力`
- clipImage：`哇，一张图！我的 0.5 只眼睛也很灵活`（不发图片本体）
- clipSensitive：`很像密码。我闭上眼睛，什么都没看见` / `保险的东西，我不看～`
- folderChange：`{name} 有新动静` / `文件夹里来了个新家伙：{name}`
- foreground：`在用 {name}，偷懒时间到啦？` / `切换到 {name} 了，我要当你的小尾巴`
- pushNote：`收到：{title}` / `推送正文我记下了："{title}"`

### 3. `src/main/event/sources/clipboardSource.ts`（改造）
- 读取改 `createClipboardSource(read: () => { text: string; hasImage: boolean }, cfg)`：`clipboard.readText()` + `availableFormats()` 含 image/* 探测（`main/index.ts` 调用点与测试同步改签名）
- 分类 + 敏感判定 + fingerprint 抑制（`Map<fingerprint, lastAt>`，清窗数据）
- `notifyPet('push:fired', { kind:'passive', reaction, placeholder })`；sensitive 时 placeholder 置空、不携带本文

### 4. `src/shared/ipc.ts`（扩展）
- `PushApiFired`（或新 `PushFired`）扩展：
  ```ts
  interface PassiveFired {
    kind: 'passive' | 'push'
    reaction: string          // 台词池 key
    placeholder?: string
    title?: string
    body?: string
  }
  ```
  保持既有字段名兼容（title/body 仍可用于 push）

### 5. `src/renderer/src/pet/PetApp.tsx`
- `onPushFired((fired) => { … })`：按 `reaction` 池 `pickText` → 是有占位插值 → `setSpeech` 8s
- push（kind==='push'）：台词来自 `pushNote` 池，占位 `{title}` 由 `fired.title` 提供；有 body 时正文附在气泡内（保留现有展示语义）

### 6. `src/renderer/src/center/CenterApp.tsx`
- `SPEECH_KEYS` 增加 9 条（label/hint）：链接/代码/长文/短文/图片/敏感/文件夹/前台/推送
- `updateSpeechPool` / 持久化逻辑不变（Record<SpeechPoolKey,string> 自动含新 key）

### 7. main `passive:test` handler（`src/main/index.ts`）
- 替换 `notifyPet('push:fired', {title:'剪贴板', body})` 为 reaction 结构；目录/前台同

## IPC 消息形态（最终）

```
push:fired ➜ { kind:'passive', reaction:'clipLink', placeholder:'example.com' }
push:fired ➜ { kind:'passive', reaction:'clipSensitive' }
push:fired ➜ { kind:'passive', reaction:'folderChange', placeholder:'report.txt' }
push:fired ➜ { kind:'push',      reaction:'pushNote', title:'下载完成', body:'file.zip' }
```

## 测试

- `sourceClassifier.test.ts`：link/code/long/short/sensitive/domain 各类样例与边界（空串、全数字、中文、多行、单行超长、URL withoutScheme）
- `clipboardSource.test.ts` 扩展：hasImage → clipImage；同 text 两次 → 第二次不通知；敏感 → 无 placeholder；fingerprint 窗内 A→B→A 抑制
- `speech.test.ts` 扩展：interpolate 插值/缺失占位/超长截断
- CDP 验证：复制链接 → 气泡为台词（含域名）；复制密码 → 无占位、只出台词；（手动）复制图片 → 图片台词
- 回归：391 现有 + typecheck 0 + build

## 实施顺序

1. speech.ts（new pools + interpolate + 测试）
2. sourceClassifier.ts（+测试）
3. clipboardSource 改造（+测试）
4. ipc/preload 类型扩展
5. PetApp 渲染改造
6. CenterApp 台词页加 9 池
7. main passive:test 同步新结构
8. typecheck/build/test 回归 + CDP 端到端