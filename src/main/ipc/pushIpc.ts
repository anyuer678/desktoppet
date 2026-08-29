import { ipcMain } from 'electron'
import type { PushRuntime } from '../push/pushRuntime'

export interface PushIpcDeps {
  push: PushRuntime
  notifyCenter(channel: string, payload?: unknown): void
}

/** pushApi:get / pushApi:setEnabled / pushApi:resetToken / pushApi:test */
export function registerPushIpc(deps: PushIpcDeps): void {
  ipcMain.handle('pushApi:get', () => ({
    ok: true,
    info: {
      enabled: deps.push.config().enabled,
      port: deps.push.port(),
      token: deps.push.config().token
    }
  }))
  ipcMain.handle('pushApi:setEnabled', (_e, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return { ok: false, error: 'enabled 必须为布尔' }
    deps.push.setEnabled(enabled)
    if (enabled) {
      deps.push.start()
    } else {
      void deps.push.stop().then(() => deps.notifyCenter('pushApi:state', { enabled: false, port: 0 }))
    }
    return { ok: true }
  })
  ipcMain.handle('pushApi:resetToken', () => {
    deps.push.ensureToken(true)
    return { ok: true, token: deps.push.config().token }
  })
  ipcMain.handle('pushApi:test', () => {
    deps.push.fireEvent({ title: '测试推送', message: '桌宠收到啦，链路正常', type: 'complete' })
    return { ok: true }
  })
}
