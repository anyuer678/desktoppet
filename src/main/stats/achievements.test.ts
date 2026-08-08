import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { computeAchievements } from './achievements'
import { emptyStats, saveDailyStats, todayStr } from './dailyStats'

const writeDay = (dir: string, date: string, sec: number): void => {
  saveDailyStats(dir, { ...emptyStats(date), secondsByState: { idle: sec }, updatedAt: Date.now() })
}

function mk(): string {
  return mkdtempSync(join(tmpdir(), 'acv-'))
}

// 注意 computeAchievements 内部会复算 computeStreak(bestStreak 从整年扫描)
describe('computeAchievements', () => {
  it('空目录：streak 0 / level Lv1 / 无解锁徽章', () => {
    const dir = mk()
    const a = computeAchievements(dir, 'rabbit', '2026-08-06')
    expect(a.streak).toBe(0)
    expect(a.level.no).toBe(1)
    expect(a.level.nextHours).toBe(10)
    expect(a.bestStreak).toBe(0)
    expect(a.badges.every((b) => !b.unlocked)).toBe(true)
  })
  it('连续 7 天解锁 streak-7 与 days-7 逻辑（连续 7 天有记录）', () => {
    const dir = mk()
    for (let i = 0; i < 7; i++) {
      const d = todayStr(new Date(new Date('2026-08-06T00:00:00').getTime() - (6 - i) * 86400000))
      writeDay(dir, d, 60)
    }
    const a = computeAchievements(dir, 'rabbit', '2026-08-06')
    expect(a.streak).toBe(7)
    expect(a.badges.find((b) => b.id === 'streak-7')?.unlocked).toBe(true)
    expect(a.badges.find((b) => b.id === 'streak-30')?.unlocked).toBe(false)
  })
  it('累计 12 小时达 Lv2', () => {
    const dir = mk()
    writeDay(dir, '2026-08-01', 43200) // 12h
    const a = computeAchievements(dir, 'rabbit', '2026-08-06')
    expect(a.totalSeconds).toBe(43200)
    expect(a.level.no).toBe(2)
    expect(a.level.nextHours).toBe(50)
  })
})