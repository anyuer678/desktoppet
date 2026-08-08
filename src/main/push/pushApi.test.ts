import { describe, expect, it } from 'vitest'
import { generateToken, isAuthorized, parseEventBody } from './pushApi'

describe('parseEventBody', () => {
  it('仅 title + message 合法', () => {
    const res = parseEventBody({ title: '标题', message: '正文' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.body).toEqual({ title: '标题', message: '正文' })
  })

  it('全字段合法（含 type）', () => {
    const res = parseEventBody({ title: 't', message: 'm', type: 'complete' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.body.type).toBe('complete')
  })

  it('type 缺省不写入', () => {
    const res = parseEventBody({ title: 't', message: 'm' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.body.type).toBeUndefined()
  })

  it('type 为 null 视为缺省', () => {
    const res = parseEventBody({ title: 't', message: 'm', type: null })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.body.type).toBeUndefined()
  })

  it('非对象（null/数组/字符串）→ 拒绝', () => {
    expect(parseEventBody(null).ok).toBe(false)
    expect(parseEventBody('str').ok).toBe(false)
    expect(parseEventBody([1, 2]).ok).toBe(false)
    expect(parseEventBody(undefined).ok).toBe(false)
  })

  it('title 缺失 / 非字符串 / 空串 / 超 60 → 拒绝', () => {
    expect(parseEventBody({ message: 'm' }).ok).toBe(false)
    expect(parseEventBody({ title: 123, message: 'm' }).ok).toBe(false)
    expect(parseEventBody({ title: '   ', message: 'm' }).ok).toBe(false)
    expect(parseEventBody({ title: 'x'.repeat(61), message: 'm' }).ok).toBe(false)
  })

  it('message 缺失 / 超 200 → 拒绝', () => {
    expect(parseEventBody({ title: 't' }).ok).toBe(false)
    expect(parseEventBody({ title: 't', message: 'y'.repeat(201) }).ok).toBe(false)
  })

  it('type 非法字符 / 超 32 → 拒绝', () => {
    expect(parseEventBody({ title: 't', message: 'm', type: 'bad type!' }).ok).toBe(false)
    expect(parseEventBody({ title: 't', message: 'm', type: 'a'.repeat(33) }).ok).toBe(false)
  })

  it('多余字段被忽略', () => {
    const res = parseEventBody({ title: 't', message: 'm', foo: 'bar', type: 'notice' })
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.body).toEqual({ title: 't', message: 'm', type: 'notice' })
  })
})

describe('isAuthorized', () => {
  const token = 'ab'.repeat(16)

  it('精确匹配通过', () => {
    expect(isAuthorized(`Bearer ${token}`, token)).toBe(true)
  })

  it('token 为空 → 拒绝', () => {
    expect(isAuthorized(`Bearer ${token}`, '')).toBe(false)
  })

  it('header 缺失 / 前缀错误 / token 错误 / 大小写敏感 → 拒绝', () => {
    expect(isAuthorized(undefined, token)).toBe(false)
    expect(isAuthorized(`Token ${token}`, token)).toBe(false)
    expect(isAuthorized(`Bearer ${'cd'.repeat(16)}`, token)).toBe(false)
    expect(isAuthorized(`bearer ${token}`, token)).toBe(false)
  })
})

describe('generateToken', () => {
  it('生成 32 位十六进制', () => {
    expect(generateToken()).toMatch(/^[0-9a-f]{32}$/)
  })

  it('两次生成不同', () => {
    expect(generateToken()).not.toBe(generateToken())
  })
})
