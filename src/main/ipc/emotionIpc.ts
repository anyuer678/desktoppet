import { ipcMain } from 'electron'
import type { EmotionRuntime } from '../emotion/emotionRuntime'

export interface EmotionIpcDeps {
  emotion: Pick<EmotionRuntime, 'status'>
}

/** emotion:get：当前角色心情快照（按时间衰减后的投影值） */
export function registerEmotionIpc(deps: EmotionIpcDeps): void {
  ipcMain.handle('emotion:get', () => deps.emotion.status())
}
