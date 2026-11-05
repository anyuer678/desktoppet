import { computeStreak, listStatsDates, loadDailyStats, sanitizeRoleId, todayStr, totalSeconds } from './dailyStats'
import type { Achievements } from '../../shared/ipc'

const LEVEL_HOURS = [0, 10, 50, 100, 250, 500, 1000, 2000, 3500, 5000]
const BADGES: { id: string; label: string; kind: 'streak' | 'totalHours' | 'activeDays'; threshold: number }[] = [
  { id: 'streak-7', label: '连续陪伴 7 天', kind: 'streak', threshold: 7 },
  { id: 'streak-30', label: '连续陪伴 30 天', kind: 'streak', threshold: 30 },
  { id: 'streak-100', label: '连续陪伴 100 天', kind: 'streak', threshold: 100 },
  { id: 'streak-365', label: '连续陪伴 365 天', kind: 'streak', threshold: 365 },
  { id: 'total-100h', label: '累计陪伴 100 小时', kind: 'totalHours', threshold: 100 },
  { id: 'total-500h', label: '累计陪伴 500 小时', kind: 'totalHours', threshold: 500 },
  { id: 'total-1000h', label: '累计陪伴 1000 小时', kind: 'totalHours', threshold: 1000 },
  { id: 'days-30', label: '活跃 30 天', kind: 'activeDays', threshold: 30 },
  { id: 'days-100', label: '活跃 100 天', kind: 'activeDays', threshold: 100 }
]

/** 用日历日减法而非 86400000 毫秒，避免 DST 切换日日期漂移 */
function prevDay(d: string): string {
  const dt = new Date(d + 'T00:00:00')
  return todayStr(new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() - 1))
}

export function computeAchievements(dir: string, roleId: string, today: string): Achievements {
  // 「累计」必须覆盖全部历史：旧实现只扫去年+今年，使用两年后累计时长/徽章/等级会失真
  const presentDates = listStatsDates(dir).filter((d) => d <= today)
  const days = presentDates.map((date) => ({ date, stats: loadDailyStats(dir, date) }))
  const totalSecondsSum = days.reduce((a, d) => a + totalSeconds(d.stats), 0)
  const activeDays = presentDates.length
  const totalHours = totalSecondsSum / 3600

  const streak = computeStreak(dir, today)
  let bestStreak = 0
  let run = 0
  let prev = ''
  for (const date of presentDates) {
    run = prev === '' || prevDay(date) === prev ? run + 1 : 1
    if (run > bestStreak) bestStreak = run
    prev = date
  }

  let no = 1
  for (let i = 0; i < LEVEL_HOURS.length; i++) {
    if (totalHours >= LEVEL_HOURS[i]) no = i + 1
  }
  const nextHours = no < LEVEL_HOURS.length ? LEVEL_HOURS[no] : null

  const badges = BADGES.map((b) => {
    const value = b.kind === 'streak' ? streak : b.kind === 'totalHours' ? totalHours : activeDays
    return { id: b.id, label: b.label, unlocked: value >= b.threshold }
  })

  return {
    charId: sanitizeRoleId(roleId),
    streak,
    bestStreak,
    totalSeconds: Math.round(totalSecondsSum),
    level: { no, label: `Lv${no}`, nextHours },
    badges
  }
}