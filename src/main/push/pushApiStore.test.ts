import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  DEFAULT_PUSH_API_CONFIG,
  loadPushApiConfig,
  savePushApiConfig,
  validatePushApiConfig
} from './pushApiStore'

describe('pushApiStore', () => {
  let dir: string
  let file: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'push-api-'))
    file = join(dir, 'pushApi.json')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('默认值：enabled=true，token 为空（首次启动惰性生成）', () => {
    expect(DEFAULT_PUSH_API_CONFIG).toEqual({ enabled: false, token: '' })
  })

  it('文件不存在 → 返回默认值', () => {
    expect(loadPushApiConfig(join(dir, 'missing.json'))).toEqual(DEFAULT_PUSH_API_CONFIG)
  })

  it('非法 JSON → 返回默认值', () => {
    writeFileSync(file, '{broken', 'utf-8')
    expect(loadPushApiConfig(file)).toEqual(DEFAULT_PUSH_API_CONFIG)
  })

  it('字段缺失 → 逐项补默认', () => {
    writeFileSync(file, JSON.stringify({ token: 'ab'.repeat(16) }), 'utf-8')
    const cfg = loadPushApiConfig(file)
    expect(cfg.token).toBe('ab'.repeat(16))
    expect(cfg.enabled).toBe(false)
  })

  it('token 类型非法（非字符串）→ 补默认空串', () => {
    writeFileSync(file, JSON.stringify({ token: 123 }), 'utf-8')
    const cfg = loadPushApiConfig(file)
    expect(cfg.token).toBe('')
    expect(cfg.enabled).toBe(false)
  })

  it('round-trip：保存后可读回', () => {
    const cfg = { enabled: false, token: '12'.repeat(16) }
    savePushApiConfig(file, cfg)
    expect(loadPushApiConfig(file)).toEqual(cfg)
  })

  it('validate：合法配置通过', () => {
    expect(validatePushApiConfig({ enabled: true, token: 'ab'.repeat(16) })).toBeNull()
  })

  it('validate：非对象 → 拒绝', () => {
    expect(validatePushApiConfig(null)).toContain('推送配置为空')
  })

  it('validate：enabled 非布尔 → 拒绝', () => {
    expect(validatePushApiConfig({ enabled: 'yes', token: 'ab'.repeat(16) })).toContain('布尔')
  })

  it('validate：token 长度错 / 含非 hex / 缺失 → 拒绝', () => {
    expect(validatePushApiConfig({ enabled: true, token: 'ab' })).toContain('32')
    expect(validatePushApiConfig({ enabled: true, token: 'zz'.repeat(16) })).toContain('32')
    expect(validatePushApiConfig({ enabled: true })).toContain('token')
  })

  it('保存文件内容为格式化 JSON', () => {
    savePushApiConfig(file, { enabled: true, token: 'cd'.repeat(16) })
    const text = readFileSync(file, 'utf-8')
    expect(text).toContain('\n')
    expect(JSON.parse(text)).toEqual({ enabled: true, token: 'cd'.repeat(16) })
  })
})
