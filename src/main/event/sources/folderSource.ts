import { readdirSync, watch, type FSWatcher } from 'fs'
import type { PassiveFolderConfig } from '../../../shared/ipc'
import type { EventSource, SourceContext } from '../sourceHub'

const GLOB_SPECIAL = new Set(['\\', '.', '^', '$', '+', '(', ')', '[', ']', '{', '}', '|'])

/** pattern → RegExp 缓存：避免每次匹配都重新编译（flush 高频调用） */
const globCache = new Map<string, RegExp>()

function globToRegExp(pattern: string): RegExp {
  const cached = globCache.get(pattern)
  if (cached) return cached
  let source = ''
  for (const ch of pattern) {
    if (ch === '*') source += '.*'
    else if (ch === '?') source += '.'
    else source += GLOB_SPECIAL.has(ch) ? `\\${ch}` : ch
  }
  const re = new RegExp(`^${source}$`)
  // 模式数量有限（配置项），缓存最多 100 条防止膨胀
  if (globCache.size < 100) globCache.set(pattern, re)
  return re
}

export function folderShouldNotify(fileName: string, patterns: string[]): boolean {
  if (patterns.length === 0 || patterns.every((p) => p === '')) {
    return true
  }
  return patterns.some((p) => globToRegExp(p).test(fileName))
}

export function defaultListFiles(dir: string): string[] {
  try {
    return readdirSync(dir)
  } catch {
    return []
  }
}

export function createFolderSource(
  cfg: () => PassiveFolderConfig,
  listFiles: (dir: string) => string[]
): EventSource {
  let ctx: SourceContext | null = null
  let watcher: FSWatcher | null = null
  let baseline = new Set<string>()
  let debounceTimer: NodeJS.Timeout | null = null

  function flush(): void {
    if (ctx == null) return
    try {
      const dir = cfg().dir
      const files = listFiles(dir)
      const added = files.filter((f) => !baseline.has(f))
      for (const f of added) {
        if (!folderShouldNotify(f, cfg().patterns)) continue
        ctx.count('folder')
        ctx.inject({
          source: 'folder',
          type: 'folder',
          priority: 5,
          durationMs: 8000,
          occurredAt: Date.now()
        })
        ctx.notify('push:fired', { kind: 'passive', reaction: 'folderChange', placeholder: f })
      }
      baseline = new Set(files)
    } catch (err) {
      ctx.log('warn', '[folder] 刷新目录失败', err)
    }
  }

  const onFsEvent = (): void => {
    if (debounceTimer != null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      flush()
    }, cfg().debounceMs)
  }

  function start(c: SourceContext): void {
    ctx = c
    const dir = cfg().dir
    if (!dir) {
      ctx.log('warn', '[folder] 未配置目录，跳过')
      return
    }
    baseline = new Set(listFiles(dir))
    try {
      watcher = watch(dir, { persistent: false }, onFsEvent)
    } catch (err) {
      ctx.log('warn', '[folder] 监听失败', err)
      return
    }
  }

  function stop(): void {
    if (debounceTimer != null) {
      clearTimeout(debounceTimer)
      debounceTimer = null
    }
    if (watcher != null) {
      try {
        watcher.close()
      } catch {
        // 幂等：关闭失败忽略
      }
      watcher = null
    }
  }

  return {
    id: 'folder',
    kind: 'watch',
    enabled: () => cfg().enabled,
    start,
    stop
  }
}