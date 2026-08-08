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
  it('卡号 13-19 位数字（通过 Luhn）', () => {
    expect(isSensitive('6222600260001072444')).toBe(true)
    expect(isSensitive('4111111111111111')).toBe(true)
  })
  it('13 位时间戳等伪卡号（不通过 Luhn）不误报', () => {
    expect(isSensitive('1700000000000')).toBe(false)
    expect(isSensitive('时间戳 1609459200000')).toBe(false)
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