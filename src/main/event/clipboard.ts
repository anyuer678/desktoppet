export interface ClipboardRules {
  onlyPatterns: string[]
  ignorePatterns: string[]
  maxLen: number
}

export function clipboardShouldNotify(
  text: string,
  rules: ClipboardRules
): { ok: boolean; reason?: string } {
  if (text.trim() === '') {
    return { ok: false, reason: 'empty' }
  }
  for (const p of rules.ignorePatterns) {
    try {
      if (new RegExp(p).test(text)) {
        return { ok: false, reason: 'ignored' }
      }
    } catch {
      // 非法正则：跳过该 pattern，视为不匹配
    }
  }
  if (rules.onlyPatterns.length > 0) {
    let matched = false
    for (const p of rules.onlyPatterns) {
      try {
        if (new RegExp(p).test(text)) {
          matched = true
          break
        }
      } catch {
        // 非法正则：跳过该 pattern，视为不匹配
      }
    }
    if (!matched) {
      return { ok: false, reason: 'not-matched' }
    }
  }
  return { ok: true }
}

export function clipboardBody(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text
  }
  return text.slice(0, maxLen) + '…'
}