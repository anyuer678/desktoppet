import { describe, expect, it } from 'vitest'
import { isAllowedNavigation } from './navigation'

describe('isAllowedNavigation', () => {
  it('打包模式只允许同一个 index.html（含 hash）', () => {
    const base = 'file:///C:/app/out/renderer/index.html'
    expect(isAllowedNavigation('file:///C:/app/out/renderer/index.html#/pet', base)).toBe(true)
    expect(isAllowedNavigation('file:///C:/app/out/renderer/index.html#/center', base)).toBe(true)
    expect(isAllowedNavigation('file:///C:/app/out/renderer/other.html', base)).toBe(false)
    expect(isAllowedNavigation('https://evil.example/', base)).toBe(false)
    expect(isAllowedNavigation('file:///C:/Windows/System32/drivers/etc/hosts', base)).toBe(false)
  })

  it('开发模式允许同源页面，拒绝其他 origin', () => {
    const base = 'http://localhost:5173/'
    expect(isAllowedNavigation('http://localhost:5173/#/center', base)).toBe(true)
    expect(isAllowedNavigation('http://localhost:5174/', base)).toBe(false)
    expect(isAllowedNavigation('https://localhost:5173/', base)).toBe(false)
    expect(isAllowedNavigation('http://127.0.0.1:5173/', base)).toBe(false)
  })

  it('非法 URL 一律拒绝', () => {
    expect(isAllowedNavigation('not a url', 'http://localhost:5173/')).toBe(false)
    expect(isAllowedNavigation('http://localhost:5173/', 'not a url')).toBe(false)
  })
})
