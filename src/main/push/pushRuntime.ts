import { app } from 'electron'
import type { PushApiConfig, PushApiFired } from '../../shared/ipc'
import { pushApiConfigPath } from '../app/paths'
import type { LogFn } from '../logging/logger'
import type { EventRuntime } from '../event/eventRuntime'
import type { StatsRuntime } from '../stats/statsRuntime'
import { countEvent } from '../stats/dailyStats'
import { generateToken } from './pushApi'
import { startPushHttpService, type PushHttpServer, type PushServiceStatus } from './httpService'
import { DEFAULT_PUSH_API_CONFIG, loadPushApiConfig, savePushApiConfig } from './pushApiStore'

export interface PushEventBody {
  title: string
  message: string
  type?: string
}

export interface PushRuntimeDeps {
  events: Pick<EventRuntime, 'apply' | 'syncStateAndNotify' | 'currentState'>
  stats: Pick<StatsRuntime, 'record'>
  /** 当前角色 id（状态端点展示用） */
  getRoleId(): string
  notifyPet(channel: string, payload?: unknown): void
  notifyCenter(channel: string, payload?: unknown): void
  log: LogFn
}

export interface PushRuntime {
  /** 加载配置（whenReady 中、start 之前调用，保持原语句顺序） */
  loadConfig(): void
  /** 启动推送 HTTP 服务（disabled 则跳过；幂等） */
  start(): void
  /** 停止推送服务（幂等） */
  stop(): Promise<void>
  config(): PushApiConfig
  /** 仅更新 enabled 并落盘；启停由调用方决定（保持原 handler 行为） */
  setEnabled(enabled: boolean): void
  /** 确保服务拥有合法 token：为空/非法时生成新 token 并落盘 */
  ensureToken(force?: boolean): void
  /** 监听端口（未启动时 0） */
  port(): number
  /** 运行状态快照（GET /api/status） */
  status(): PushServiceStatus
  /** 推送事件处理：计入统计 + 注入事件中心 + 气泡 + 状态转换广播 */
  fireEvent(body: PushEventBody): void
}

/** 推送 API 运行时：配置/token/服务句柄/事件计数器均为闭包私有状态 */
export function createPushRuntime(deps: PushRuntimeDeps): PushRuntime {
  let pushApiCfg: PushApiConfig = { ...DEFAULT_PUSH_API_CONFIG }
  let pushServer: PushHttpServer | null = null
  let pushEventSource = 1
  let pushStartedAt = 0
  let pushReceived = 0

  function status(): PushServiceStatus {
    return {
      app: 'desktoppet',
      version: app.getVersion(),
      role: deps.getRoleId(),
      state: deps.events.currentState(),
      uptimeMs: pushStartedAt > 0 ? Date.now() - pushStartedAt : 0,
      eventsReceived: pushReceived
    }
  }

  function loadConfig(): void {
    pushApiCfg = loadPushApiConfig(pushApiConfigPath())
  }

  function ensureToken(force = false): void {
    if (force || !/^[0-9a-f]{32}$/.test(pushApiCfg.token)) {
      pushApiCfg = { ...pushApiCfg, token: generateToken() }
      savePushApiConfig(pushApiConfigPath(), pushApiCfg)
    }
  }

  function fireEvent(body: PushEventBody): void {
    const now = Date.now()
    pushReceived++
    deps.stats.record((s) => countEvent(s, 'push'))
    const sourceId = `push:${(pushEventSource++ % 100000).toString(36)}-${now.toString(36).slice(-4)}`
    deps.events.apply({
      source: sourceId,
      type: body.type ?? 'notice',
      priority: 50,
      durationMs: 8000,
      occurredAt: now
    })
    const fired: PushApiFired = {
      kind: 'push',
      reaction: 'pushNote',
      title: body.title,
      body: body.message,
      type: body.type
    }
    deps.log('info', '[pushApi] event', fired.title)
    deps.notifyPet('push:fired', fired)
    deps.events.syncStateAndNotify(now)
  }

  function start(): void {
    if (!pushApiCfg.enabled) {
      deps.log('info', '[pushApi] disabled, not starting')
      return
    }
    if (pushServer) return
    ensureToken()
    startPushHttpService({
      getConfig: () => pushApiCfg,
      onPushEvent: fireEvent,
      getStatus: status,
      log: deps.log
    })
      .then((srv) => {
        pushServer = srv
        pushStartedAt = Date.now()
        pushApiCfg.port = srv.port
        savePushApiConfig(pushApiConfigPath(), pushApiCfg)
        deps.log('info', '[pushApi] listening on port', srv.port)
        deps.notifyCenter('pushApi:state', { port: srv.port, enabled: true })
      })
      .catch((err) => deps.log('error', '[pushApi] start failed', err))
  }

  async function stop(): Promise<void> {
    if (pushServer) {
      // 先同步清掉发现文件里的 port：will-quit 不等待异步清理，
      // 否则旧端口会残留给 lumen 等读取方
      pushStartedAt = 0
      pushApiCfg = { ...pushApiCfg, port: undefined }
      savePushApiConfig(pushApiConfigPath(), pushApiCfg)
      const server = pushServer
      pushServer = null
      await server.close()
    }
  }

  function setEnabled(enabled: boolean): void {
    pushApiCfg = { ...pushApiCfg, enabled }
    savePushApiConfig(pushApiConfigPath(), pushApiCfg)
  }

  return {
    loadConfig,
    start,
    stop,
    config: () => pushApiCfg,
    setEnabled,
    ensureToken,
    port: () => pushServer?.port ?? 0,
    status,
    fireEvent
  }
}
