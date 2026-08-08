const URL_RE = /(?:https?:\/\/)?(?:www\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?:[/?#\s]|$)/i
const CODE_RE = /(?:=>|import |export |function\s|const |let |return |def |sudo |#include|;\s*\n|->|```|class )/
const LONG_LEN = 40

/** 剪贴板文本 → 拟人反应类别（纯文本启发式） */
export type ClipboardFeature = 'clipLink' | 'clipCode' | 'clipLong' | 'clipShort'

export function classifyClipboard(text: string): ClipboardFeature {
  const t = text.trim()
  if (URL_RE.test(t) && t.length <= 100) return 'clipLink'
  if (text.includes('\n') && (CODE_RE.test(text) || text.includes('{'))) return 'clipCode'
  if (text.length > LONG_LEN) return 'clipLong'
  if (CODE_RE.test(text)) return 'clipCode'
  return 'clipShort'
}

const SENSITIVE_RE =
  /(sk-[A-Za-z0-9]{8,}|AKIA[A-Z0-9]{12,}|\bgh[pous]_[A-Za-z0-9]{20,}|\bgithub_pat_\w+|-----BEGIN [A-Z ]+PRIVATE KEY-----|password\s*[=:]\s*\S+|token\s*[=:]\s*\S+)/i
const CARD_RE = /\d{13,19}/
const OTP_RE = /(?:验证码|短信码|OTP)[：: ]?\s*\d{6}/

/** Luhn 校验：真实银行卡号通过，13-19 位时间戳等伪卡号（通常不通过）不再误报 */
export function luhnValid(digits: string): boolean {
  let sum = 0
  let double = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48
    if (d < 0 || d > 9) return false
    if (double) {
      d *= 2
      if (d > 9) d -= 9
    }
    sum += d
    double = !double
  }
  return sum % 10 === 0
}

export function isSensitive(text: string): boolean {
  if (SENSITIVE_RE.test(text) || OTP_RE.test(text)) return true
  const card = text.match(CARD_RE)
  return card ? luhnValid(card[0]) : false
}

export function extractDomain(url: string): string | null {
  const t = url.trim()
  const m = t.match(URL_RE)
  if (!m) return null
  let domain = m[1]
  if (domain.startsWith('www.')) domain = domain.slice(4)
  return domain.length > 0 ? domain : null
}