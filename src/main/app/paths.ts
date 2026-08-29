import { join } from 'path'
import { app } from 'electron'

/**
 * 主进程全部持久化路径的唯一出处。
 * 纯函数：每次调用现读 app.getPath()，无模块级状态。
 */

/** 角色包根目录：生产在 userData/characters（可写，支持导入/删除），开发在项目根 characters/ */
export function charactersRoot(): string {
  if (app.isPackaged) {
    return join(app.getPath('userData'), 'characters')
  }
  return join(app.getAppPath(), 'characters')
}

/** 插件根目录：生产在 userData/plugins，开发在项目根 plugins/ */
export function pluginsDir(): string {
  if (app.isPackaged) {
    return join(app.getPath('userData'), 'plugins')
  }
  return join(app.getAppPath(), 'plugins')
}

export function settingsPath(): string {
  return join(app.getPath('userData'), 'settings.json')
}

export function schedulesPath(): string {
  return join(app.getPath('userData'), 'schedules.json')
}

/** 陪伴统计根目录（按角色分目录：stats/<角色id>/） */
export function statsRootPath(): string {
  return join(app.getPath('userData'), 'stats')
}

/** 推送 API 配置文件（userData/pushApi.json） */
export function pushApiConfigPath(): string {
  return join(app.getPath('userData'), 'pushApi.json')
}

/** 被动数据源配置文件（userData/passiveSources.json） */
export function passiveConfigPath(): string {
  return join(app.getPath('userData'), 'passiveSources.json')
}

/** 自动报告落盘目录（文档/DesktopPet/报告） */
export function reportOutputDir(): string {
  return join(app.getPath('documents'), 'DesktopPet', '报告')
}
