export interface RateLimiter {
  /** 记录一次请求；超出窗口配额返回 false */
  allow(at?: number): boolean
}

/**
 * 滑动窗口限流：窗口内最多 limit 次。
 * 用于本机推送 API，避免脚本/异常进程高频刷气泡与统计写盘。
 */
export function createRateLimiter(
  limit: number,
  windowMs: number,
  clock: () => number = Date.now
): RateLimiter {
  const max = Math.max(1, Math.floor(limit))
  const window = Math.max(1, Math.floor(windowMs))
  const hits: number[] = []

  return {
    allow(at = clock()): boolean {
      while (hits.length > 0 && at - hits[0] >= window) hits.shift()
      if (hits.length >= max) return false
      hits.push(at)
      return true
    }
  }
}
