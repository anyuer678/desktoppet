import { existsSync, mkdirSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { describe, expect, it } from 'vitest'
import { createLogger, dateStamp } from './logger'

function tempDir(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

describe('createLogger', () => {
  it('创建日志目录并写入 info 日志', () => {
    const dir = tempDir('dp-log-')
    const logger = createLogger(dir)
    logger.info('hello world')
    const fileName = `main-${dateStamp()}.log`
    const filePath = join(dir, fileName)
    expect(existsSync(filePath)).toBe(true)
    const content = readFileSync(filePath, 'utf-8')
    expect(content).toContain('[INFO]')
    expect(content).toContain('hello world')
    rmSync(dir, { recursive: true, force: true })
  })

  it('多级别日志写入同一文件', () => {
    const dir = tempDir('dp-log-')
    const logger = createLogger(dir)
    logger.info('info msg')
    logger.warn('warn msg')
    logger.error('error msg')
    const filePath = join(dir, `main-${dateStamp()}.log`)
    const content = readFileSync(filePath, 'utf-8')
    expect(content).toContain('[INFO] info msg')
    expect(content).toContain('[WARN] warn msg')
    expect(content).toContain('[ERROR] error msg')
    rmSync(dir, { recursive: true, force: true })
  })

  it('日志目录不存在时自动创建', () => {
    const dir = join(tempDir('dp-log-'), 'nested', 'logs')
    expect(existsSync(dir)).toBe(false)
    const logger = createLogger(dir)
    logger.info('test')
    expect(existsSync(dir)).toBe(true)
    expect(existsSync(join(dir, `main-${dateStamp()}.log`))).toBe(true)
    rmSync(dir, { recursive: true, force: true })
  })

  it('每行包含 ISO 时间戳', () => {
    const dir = tempDir('dp-log-')
    const logger = createLogger(dir)
    logger.info('timestamped')
    const content = readFileSync(join(dir, `main-${dateStamp()}.log`), 'utf-8')
    // 格式: [2026-08-04T09:30:00.000Z] [INFO] timestamped
    expect(content).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] timestamped/)
    rmSync(dir, { recursive: true, force: true })
  })

  it('额外参数被序列化追加到日志行', () => {
    const dir = tempDir('dp-log-')
    const logger = createLogger(dir)
    logger.info('action', { id: 42 }, 'done')
    const content = readFileSync(join(dir, `main-${dateStamp()}.log`), 'utf-8')
    expect(content).toContain('"id":42')
    expect(content).toContain('done')
    rmSync(dir, { recursive: true, force: true })
  })

  it('多次调用追加到同一文件（不覆盖）', () => {
    const dir = tempDir('dp-log-')
    const logger = createLogger(dir)
    logger.info('first')
    logger.info('second')
    logger.info('third')
    const content = readFileSync(join(dir, `main-${dateStamp()}.log`), 'utf-8')
    const lines = content.trim().split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toContain('first')
    expect(lines[1]).toContain('second')
    expect(lines[2]).toContain('third')
    rmSync(dir, { recursive: true, force: true })
  })
})

describe('dateStamp', () => {
  it('格式为 YYYY-MM-DD', () => {
    const stamp = dateStamp(new Date('2026-08-04T12:00:00'))
    expect(stamp).toBe('2026-08-04')
  })

  it('月份和日期补零', () => {
    const stamp = dateStamp(new Date('2026-01-05T12:00:00'))
    expect(stamp).toBe('2026-01-05')
  })
})
