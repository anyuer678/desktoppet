import { describe, expect, it } from 'vitest'
import { clipboardBody, clipboardShouldNotify } from './clipboard'

describe('clipboardShouldNotify：空文本', () => {
  it('空字符串 / 纯空白 → empty', () => {
    const rules = { onlyPatterns: [], ignorePatterns: [], maxLen: 120 }
    expect(clipboardShouldNotify('', rules)).toEqual({ ok: false, reason: 'empty' })
    expect(clipboardShouldNotify('   \t\n ', rules)).toEqual({ ok: false, reason: 'empty' })
  })
})

describe('clipboardShouldNotify：ignorePatterns', () => {
  it('命中 ignore → ignored；未命中 → ok', () => {
    const rules = { onlyPatterns: [], ignorePatterns: ['^\\d+$'], maxLen: 120 }
    expect(clipboardShouldNotify('12345', rules)).toEqual({ ok: false, reason: 'ignored' })
    expect(clipboardShouldNotify('hello', rules)).toEqual({ ok: true })
  })
})

describe('clipboardShouldNotify：onlyPatterns', () => {
  it('命中 only → ok；未命中 → not-matched', () => {
    const rules = { onlyPatterns: ['^http'], ignorePatterns: [], maxLen: 120 }
    expect(clipboardShouldNotify('http://x', rules)).toEqual({ ok: true })
    expect(clipboardShouldNotify('hello', rules)).toEqual({ ok: false, reason: 'not-matched' })
  })

  it('onlyPatterns 空：任意非空文本 → ok', () => {
    const rules = { onlyPatterns: [], ignorePatterns: [], maxLen: 120 }
    expect(clipboardShouldNotify('anything', rules)).toEqual({ ok: true })
    expect(clipboardShouldNotify('中文内容', rules)).toEqual({ ok: true })
  })
})

describe('clipboardShouldNotify：ignore 优先于 only', () => {
  it('同时命中两者 → ignored', () => {
    const rules = { onlyPatterns: ['^\\d+$'], ignorePatterns: ['3'], maxLen: 120 }
    expect(clipboardShouldNotify('123', rules)).toEqual({ ok: false, reason: 'ignored' })
  })
})

describe('clipboardShouldNotify：非法正则', () => {
  it('ignorePatterns 含非法正则 → 不抛异常且视为未命中 → ok', () => {
    const rules = { onlyPatterns: [], ignorePatterns: ['['], maxLen: 120 }
    expect(() => clipboardShouldNotify('abc', rules)).not.toThrow()
    expect(clipboardShouldNotify('abc', rules)).toEqual({ ok: true })
  })

  it('onlyPatterns 含非法正则 → 不抛异常且视为未命中 → not-matched', () => {
    const rules = { onlyPatterns: ['['], ignorePatterns: [], maxLen: 120 }
    expect(() => clipboardShouldNotify('abc', rules)).not.toThrow()
    expect(clipboardShouldNotify('abc', rules)).toEqual({ ok: false, reason: 'not-matched' })
  })
})

describe('clipboardBody', () => {
  it('不超长 → 原样返回', () => {
    expect(clipboardBody('ab', 5)).toBe('ab')
  })

  it('超长 → 截断并追加省略号', () => {
    expect(clipboardBody('abcdef', 3)).toBe('abc…')
  })

  it('空字符串 → 空字符串', () => {
    expect(clipboardBody('', 5)).toBe('')
  })
})