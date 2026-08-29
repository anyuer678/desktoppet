import { cpSync, existsSync } from 'fs'
import { join } from 'path'
import { app } from 'electron'
import { charactersRoot, pluginsDir } from './paths'
import type { LogFn } from '../logging/logger'

/** 生产模式首次启动：将 extraResources 中的默认角色复制到 userData/characters/ */
export function seedDefaultCharacters(log: LogFn): void {
  if (!app.isPackaged) return
  const userChars = charactersRoot()
  if (existsSync(join(userChars, 'rabbit'))) return // 已初始化
  const bundledChars = join(process.resourcesPath, 'characters')
  if (!existsSync(bundledChars)) return
  try {
    cpSync(bundledChars, userChars, { recursive: true })
    log('info', '[seed] 默认角色已复制到', userChars)
  } catch (err) {
    log('error', '[seed] 默认角色复制失败:', err)
  }
}

/** 生产模式首次启动：将 extraResources 中的默认插件复制到 userData/plugins/ */
export function seedDefaultPlugins(log: LogFn): void {
  if (!app.isPackaged) return
  const userPlugins = pluginsDir()
  if (existsSync(join(userPlugins, 'sample'))) return // 已初始化
  const bundledPlugins = join(process.resourcesPath, 'plugins')
  if (!existsSync(bundledPlugins)) return
  try {
    cpSync(bundledPlugins, userPlugins, { recursive: true })
    log('info', '[seed] 默认插件已复制到', userPlugins)
  } catch (err) {
    log('error', '[seed] 默认插件复制失败:', err)
  }
}
