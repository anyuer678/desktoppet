import { ipcMain } from 'electron'
import type { ScheduleInput } from '../../shared/ipc'
import type { ScheduleRuntime } from '../schedule/scheduleRuntime'

export interface ScheduleIpcDeps {
  schedule: ScheduleRuntime
}

/** schedule:list/create/update/delete/toggle/test */
export function registerScheduleIpc(deps: ScheduleIpcDeps): void {
  ipcMain.handle('schedule:list', () => deps.schedule.repo()?.list() ?? [])
  ipcMain.handle('schedule:create', (_e, input: ScheduleInput) => {
    const repo = deps.schedule.repo()
    if (!repo) return { ok: false, error: '调度器未初始化' }
    const r = repo.create(input)
    return r.ok ? { ok: true, item: r.item } : { ok: false, error: r.error }
  })
  ipcMain.handle('schedule:update', (_e, id: string, input: ScheduleInput) => {
    const repo = deps.schedule.repo()
    if (!repo) return { ok: false, error: '调度器未初始化' }
    const r = repo.update(id, input)
    return r.ok ? { ok: true, item: r.item } : { ok: false, error: r.error }
  })
  ipcMain.handle('schedule:delete', (_e, id: string) => {
    const repo = deps.schedule.repo()
    if (!repo) return { ok: false, error: '调度器未初始化' }
    return repo.remove(id)
  })
  ipcMain.handle('schedule:toggle', (_e, id: string, enabled: boolean) => {
    const repo = deps.schedule.repo()
    if (!repo) return { ok: false, error: '调度器未初始化' }
    return repo.setEnabled(id, enabled)
  })
  ipcMain.handle('schedule:test', (_e, id: string) => deps.schedule.testFire(id))
}
