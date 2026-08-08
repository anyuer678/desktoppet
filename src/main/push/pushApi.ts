import { randomBytes, timingSafeEqual } from 'crypto'

/** 推送事件体（POST /api/event 的合法载荷） */
export interface PushEventBody {
  /** 气泡标题，非空 ≤60 字符 */
  title: string
  /** 气泡正文，非空 ≤200 字符 */
  message: string
  /** 可选事件类型（驱动状态动画），缺省为 notice */
  type?: string
}

const MAX_TITLE = 60
const MAX_MESSAGE = 200
const MAX_TYPE = 32
const TYPE_RE = /^[a-zA-Z0-9_-]+$/

export type ParseEventBodyResult =
  | { ok: true; body: PushEventBody }
  | { ok: false; error: string }

/** 校验并规范化请求体；非法返回具体错误文案 */
export function parseEventBody(raw: unknown): ParseEventBodyResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: '请求体必须为 JSON 对象' }
  }
  const r = raw as Record<string, unknown>
  if (typeof r.title !== 'string' || r.title.trim() === '') {
    return { ok: false, error: 'title 必填且为非空字符串' }
  }
  if (r.title.length > MAX_TITLE) {
    return { ok: false, error: `title 不能超过 ${MAX_TITLE} 字符` }
  }
  if (typeof r.message !== 'string' || r.message.trim() === '') {
    return { ok: false, error: 'message 必填且为非空字符串' }
  }
  if (r.message.length > MAX_MESSAGE) {
    return { ok: false, error: `message 不能超过 ${MAX_MESSAGE} 字符` }
  }
  const body: PushEventBody = { title: r.title, message: r.message }
  if (r.type !== undefined && r.type !== null) {
    if (typeof r.type !== 'string' || r.type.length > MAX_TYPE || !TYPE_RE.test(r.type)) {
      return { ok: false, error: 'type 必须为 ≤32 字符的字母/数字/下划线/连字符' }
    }
    body.type = r.type
  }
  return { ok: true, body }
}

/** Bearer token 认证：header 精确等于 `Bearer <token>` 才通过（恒定时间比较，防时序侧信道） */
export function isAuthorized(authHeader: string | undefined, token: string): boolean {
  if (!token) return false
  if (!authHeader) return false
  const expected = Buffer.from(`Bearer ${token}`)
  const actual = Buffer.from(authHeader)
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}

/** 生成 32 位十六进制 token */
export function generateToken(): string {
  return randomBytes(16).toString('hex')
}
