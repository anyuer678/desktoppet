import { existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync } from 'fs'
import { join } from 'path'
import { parseEventBody, type PushEventBody } from '../push/pushApi'
import type { LogFn } from '../logging/logger'

/** 单个收件文件上限：本地工具投递事件不需要大文件 */
export const INBOX_MAX_BYTES = 64 * 1024
/** 单轮最多处理文件数：避免目录被大量文件灌爆时阻塞主进程 */
export const INBOX_MAX_PER_POLL = 20

export interface InboxReadResult {
  ok: boolean
  body?: PushEventBody
  error?: string
}

/** 列出收件箱中待处理的 .json 普通文件（拒绝符号链接，按文件名排序保证顺序稳定） */
export function listInboxFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  try {
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .sort()
      .filter((name) => {
        try {
          return lstatSync(join(dir, name)).isFile()
        } catch {
          return false
        }
      })
  } catch {
    return []
  }
}

/** 读取并校验一个收件文件；文件缺失/超限/JSON 非法/字段非法均返回 error */
export function readInboxFile(filePath: string, maxBytes = INBOX_MAX_BYTES): InboxReadResult {
  try {
    const info = lstatSync(filePath)
    if (!info.isFile()) return { ok: false, error: '不是普通文件' }
    if (info.size > maxBytes) return { ok: false, error: `文件超过 ${maxBytes} 字节上限` }
    const raw: unknown = JSON.parse(readFileSync(filePath, 'utf-8'))
    const parsed = parseEventBody(raw)
    return parsed.ok ? { ok: true, body: parsed.body } : { ok: false, error: parsed.error }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** 把无法处理的文件改名为 .bad（保留原文便于排查，且不再被轮询） */
function quarantine(filePath: string): void {
  const target = `${filePath}.${Date.now()}.bad`
  try {
    renameSync(filePath, target)
  } catch {
    // 改名失败则尝试删除，至少避免每轮重复报错
    try {
      unlinkSync(filePath)
    } catch {
      /* ignore */
    }
  }
}

export interface InboxRuntimeDeps {
  dir(): string
  fire(body: PushEventBody): void
  log: LogFn
}

export interface InboxRuntime {
  start(): void
  stop(): void
  /** 立即处理一轮（测试/手动），返回成功投递数 */
  pollOnce(): number
}

/**
 * 本地集成收件箱：其他工具把 {title,message,type?} 写成 inbox/*.json 即可让桌宠广播。
 * 与 HTTP 推送共用同一套校验规则，但不需要发现文件/Token，适合一次性脚本与离线工具。
 */
export function createInboxRuntime(deps: InboxRuntimeDeps, intervalMs = 5000): InboxRuntime {
  let timer: NodeJS.Timeout | null = null

  function pollOnce(): number {
    const dir = deps.dir()
    try {
      mkdirSync(dir, { recursive: true })
    } catch (err) {
      deps.log('warn', '[inbox] create dir failed:', err)
      return 0
    }
    let handled = 0
    for (const name of listInboxFiles(dir).slice(0, INBOX_MAX_PER_POLL)) {
      const filePath = join(dir, name)
      const result = readInboxFile(filePath)
      if (!result.ok || !result.body) {
        deps.log('warn', `[inbox] rejected ${name}:`, result.error)
        quarantine(filePath)
        continue
      }
      try {
        deps.fire(result.body)
        unlinkSync(filePath)
        handled++
      } catch (err) {
        deps.log('error', `[inbox] dispatch failed ${name}:`, err)
        quarantine(filePath)
      }
    }
    return handled
  }

  return {
    pollOnce,
    start: () => {
      if (timer) return
      pollOnce()
      timer = setInterval(pollOnce, intervalMs)
    },
    stop: () => {
      if (timer) clearInterval(timer)
      timer = null
    }
  }
}
