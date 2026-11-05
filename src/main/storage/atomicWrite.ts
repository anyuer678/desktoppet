import { mkdirSync, renameSync, rmSync, writeFileSync } from 'fs'
import { dirname } from 'path'

/**
 * 原子写文件：先写同目录临时文件再 rename 覆盖。
 * 进程在写入中途退出时，原文件保持完整；避免 settings/schedules/stats 被截断后
 * 加载器回退默认值造成静默数据丢失。
 */
export function writeFileAtomic(filePath: string, data: string): void {
  mkdirSync(dirname(filePath), { recursive: true })
  const temp = `${filePath}.${process.pid}.tmp`
  try {
    writeFileSync(temp, data, 'utf-8')
    renameSync(temp, filePath)
  } catch (err) {
    try {
      rmSync(temp, { force: true })
    } catch {
      // 清理失败不掩盖原始错误
    }
    throw err
  }
}
