import { appendFileSync, existsSync, mkdirSync, renameSync, statSync } from 'fs'
import { join } from 'path'

/** 单日日志文件上限：超过后归档为 main-YYYY-MM-DD.1.log 并新建 */
const MAX_LOG_BYTES = 10 * 1024 * 1024

export type LogLevel = 'info' | 'warn' | 'error'

/** 供各运行时模块经依赖注入使用的日志函数签名（index.ts 中 log() 包装器的形态） */
export type LogFn = (level: LogLevel, message: string, ...args: unknown[]) => void

export interface Logger {
  info(message: string, ...args: unknown[]): void
  warn(message: string, ...args: unknown[]): void
  error(message: string, ...args: unknown[]): void
}

/** 当前日期（本地时区）→ YYYY-MM-DD，用于日志文件名轮转 */
function dateStamp(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** ISO 时间戳（含毫秒），用于日志行前缀 */
function timestamp(now: Date = new Date()): string {
  return now.toISOString()
}

function formatArgs(args: unknown[]): string {
  if (args.length === 0) return ''
  return ' ' + args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')
}

/**
 * 创建文件日志器：每行同步追加到 logDir/main-YYYY-MM-DD.log，同时输出到 console。
 * - logDir 不存在时自动创建
 * - 按日期轮转（跨天自动写新文件）
 * - 同步写入（日志量小，appendFileSync 足够；避免丢日志）
 */
export function createLogger(logDir: string): Logger {
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true })
  }

  function write(level: LogLevel, message: string, args: unknown[]): void {
    const now = new Date()
    const fileName = `main-${dateStamp(now)}.log`
    const filePath = join(logDir, fileName)
    const line = `[${timestamp(now)}] [${level.toUpperCase()}] ${message}${formatArgs(args)}\n`
    try {
      // 超限归档：避免单日日志无限增长
      try {
        if (existsSync(filePath) && statSync(filePath).size > MAX_LOG_BYTES) {
          const archived = filePath.replace(/\.log$/, `.1-${Date.now()}.log`)
          renameSync(filePath, archived)
        }
      } catch {
        // stat/rename 失败不阻塞写日志
      }
      appendFileSync(filePath, line, 'utf-8')
    } catch {
      // 日志写入失败不应影响主流程
    }
    // 同时输出到 console（便于 dev 模式调试）
    const consoleMsg = `${message}${formatArgs(args)}`
    if (level === 'error') {
      console.error(consoleMsg)
    } else if (level === 'warn') {
      console.warn(consoleMsg)
    } else {
      console.log(consoleMsg)
    }
  }

  return {
    info: (message: string, ...args: unknown[]) => write('info', message, args),
    warn: (message: string, ...args: unknown[]) => write('warn', message, args),
    error: (message: string, ...args: unknown[]) => write('error', message, args)
  }
}

/** 暴露日期格式化函数供测试使用 */
export { dateStamp, timestamp }
