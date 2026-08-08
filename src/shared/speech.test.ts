import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SPEECH,
  EVENT_STATE_MAP,
  eventSpeech,
  greetingKey,
  greetingSpeech,
  interpolateSpeech,
  pickText,
  reactionReply,
  stateSpeech,
  welcomeSpeech
} from './speech'

describe('greetingKey', () => {
  it('时段边界正确', () => {
    expect(greetingKey(0)).toBe('night')
    expect(greetingKey(5)).toBe('night')
    expect(greetingKey(6)).toBe('morning')
    expect(greetingKey(10)).toBe('morning')
    expect(greetingKey(11)).toBe('noon')
    expect(greetingKey(13)).toBe('noon')
    expect(greetingKey(14)).toBe('afternoon')
    expect(greetingKey(17)).toBe('afternoon')
    expect(greetingKey(18)).toBe('evening')
    expect(greetingKey(22)).toBe('evening')
    expect(greetingKey(23)).toBe('night')
  })
})

describe('pickText', () => {
  it('随机挑选且避免重复', () => {
    for (let i = 0; i < 50; i++) {
      const first = pickText(DEFAULT_SPEECH.welcome, null)
      expect(first).not.toBeNull()
      const second = pickText(DEFAULT_SPEECH.welcome, first!.text)
      expect(second!.text).not.toBe(first!.text)
    }
  })

  it('空池返回 null', () => {
    expect(pickText([], null)).toBeNull()
  })

  it('池内仅一条时允许重复', () => {
    const single = pickText(['只有一句'], '只有一句')
    expect(single!.text).toBe('只有一句')
  })
})

describe('greetingSpeech', () => {
  it('返回对应时段的台词', () => {
    expect(greetingSpeech(DEFAULT_SPEECH, 7, null)!.text).toMatch(/早上好|早安|新的一天/)
    expect(greetingSpeech(DEFAULT_SPEECH, 23, null)!.text).toMatch(/夜深|睡觉|熬夜/)
  })

  it('自定义池生效', () => {
    const pools = { ...DEFAULT_SPEECH, morning: ['我的早安'] }
    expect(greetingSpeech(pools, 8, null)!.text).toBe('我的早安')
  })
})

describe('welcomeSpeech', () => {
  it('来自欢迎语池', () => {
    expect(DEFAULT_SPEECH.welcome).toContain(welcomeSpeech(DEFAULT_SPEECH, null)!.text)
  })
})

describe('interact 互动池', () => {
  it('默认池非空且随机挑选不回退 null', () => {
    expect(DEFAULT_SPEECH.interact.length).toBeGreaterThan(0)
    const msg = pickText(DEFAULT_SPEECH.interact, null)
    expect(msg).not.toBeNull()
    expect(DEFAULT_SPEECH.interact).toContain(msg!.text)
  })
})

describe('EVENT_STATE_MAP', () => {
  it('事件类型映射到消息池', () => {
    expect(EVENT_STATE_MAP.cpu_high).toBe('warning')
    expect(EVENT_STATE_MAP.memory_warning).toBe('warning')
    expect(EVENT_STATE_MAP.success).toBe('happy')
    expect(EVENT_STATE_MAP.user_idle).toBe('sleep')
    expect(EVENT_STATE_MAP.focus).toBeUndefined()
  })
})

describe('eventSpeech', () => {
  it('有映射的事件返回台词', () => {
    const pools = { ...DEFAULT_SPEECH, warning: ['警报！'] }
    expect(eventSpeech(pools, 'cpu_high', null)!.text).toBe('警报！')
    expect(eventSpeech(pools, 'success', null)).not.toBeNull()
  })

  it('无映射事件（focus 类）返回 null', () => {
    expect(eventSpeech(DEFAULT_SPEECH, 'focus', null)).toBeNull()
    expect(eventSpeech(DEFAULT_SPEECH, 'unknown', null)).toBeNull()
  })

  it('空池返回 null', () => {
    const pools = { ...DEFAULT_SPEECH, warning: [] }
    expect(eventSpeech(pools, 'cpu_high', null)).toBeNull()
  })
})

describe('stateSpeech', () => {
  it('状态名直接对应池', () => {
    expect(stateSpeech(DEFAULT_SPEECH, 'sleep', null)).not.toBeNull()
    expect(stateSpeech(DEFAULT_SPEECH, 'idle', null)).toBeNull()
  })
})

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
