import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBackupArchive } from '../backup/backup'
import { registerBackupIpc } from './backupIpc'

const h = vi.hoisted(() => ({
  handlers: new Map<string, (event: unknown) => unknown>(),
  state: { userData: '', docs: '', savePath: '', openPath: '', confirm: 1 }
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, fn: (event: unknown) => unknown) => {
      h.handlers.set(channel, fn)
    }
  },
  app: {
    getPath: (name: string) => (name === 'documents' ? h.state.docs : h.state.userData),
    getVersion: () => '1.3.0'
  },
  dialog: {
    showSaveDialog: async () => ({ canceled: false, filePath: h.state.savePath }),
    showOpenDialog: async () => ({ canceled: false, filePaths: [h.state.openPath] }),
    showMessageBox: async () => ({ response: h.state.confirm })
  },
  BrowserWindow: { fromWebContents: () => null }
}))

vi.mock('../app/paths', () => ({
  settingsPath: () => `${h.state.userData}/settings.json`,
  schedulesPath: () => `${h.state.userData}/schedules.json`,
  autoReportsPath: () => `${h.state.userData}/autoReports.json`,
  passiveConfigPath: () => `${h.state.userData}/passiveSources.json`
}))

const validSchedule = [
  {
    id: 'a1',
    title: '喝水',
    message: '',
    type: 'daily',
    trigger: '10:30',
    daysOfWeek: [],
    enabled: true,
    lastFiredAt: null,
    createdAt: 1
  }
]
const validAutoReport = {
  weekly: { enabled: false, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' },
  monthly: { enabled: false, dayOfWeek: 0, dayOfMonth: 1, time: '21:00' }
}
const validPassive = {
  clipboard: { enabled: false, pollMs: 3000, onlyPatterns: [], ignorePatterns: [], maxLen: 120 },
  folder: { enabled: false, dir: '', patterns: ['*'], debounceMs: 500 },
  foreground: { enabled: false, pollMs: 15000, mappings: [] }
}

function makeDeps() {
  return {
    settings: { reload: vi.fn() },
    schedule: { repo: () => ({ reload: vi.fn() }) },
    passive: { setConfig: vi.fn(), rebuild: vi.fn() },
    autoReports: { setConfig: vi.fn() },
    notifyCenter: vi.fn(),
    log: vi.fn()
  }
}

function invoke(channel: string): Promise<unknown> {
  const handler = h.handlers.get(channel)
  if (!handler) throw new Error(`missing handler: ${channel}`)
  return Promise.resolve(handler({ sender: {} }))
}

describe('backup IPC', () => {
  let tmp: string

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), 'dp-backup-ipc-'))
    h.state.userData = join(tmp, 'userData')
    h.state.docs = join(tmp, 'docs')
    h.state.savePath = join(tmp, 'docs', 'out.dpbackup')
    h.state.openPath = ''
    h.state.confirm = 1
    h.handlers.clear()
    for (const dir of [h.state.userData, h.state.docs]) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(join(h.state.userData, 'settings.json'), JSON.stringify({ size: 300 }))
    writeFileSync(join(h.state.userData, 'schedules.json'), JSON.stringify(validSchedule))
    writeFileSync(join(h.state.userData, 'autoReports.json'), JSON.stringify(validAutoReport))
    writeFileSync(join(h.state.userData, 'passiveSources.json'), JSON.stringify(validPassive))
    registerBackupIpc(makeDeps())
  })

  it('导出：生成可读的 .dpbackup 并返回条目', async () => {
    const res = (await invoke('backup:export')) as { ok: boolean; path?: string; entries?: string[] }
    expect(res.ok).toBe(true)
    expect(res.path).toBe(h.state.savePath)
    expect(res.entries).toContain('settings.json')
    expect(readFileSync(h.state.savePath).length).toBeGreaterThan(0)
  })

  it('导入：覆盖配置、生成导入前备份并调用运行时 reload', async () => {
    const source = mkdtempSync(join(tmpdir(), 'dp-backup-src-'))
    const sourcePaths = {
      settings: join(source, 'settings.json'),
      schedules: join(source, 'schedules.json'),
      autoReports: join(source, 'autoReports.json'),
      passive: join(source, 'passiveSources.json')
    }
    writeFileSync(sourcePaths.settings, JSON.stringify({ size: 444 }))
    writeFileSync(sourcePaths.schedules, JSON.stringify(validSchedule))
    writeFileSync(sourcePaths.autoReports, JSON.stringify(validAutoReport))
    writeFileSync(sourcePaths.passive, JSON.stringify(validPassive))
    h.state.openPath = join(source, 'in.dpbackup')
    createBackupArchive(h.state.openPath, sourcePaths, '1.3.0')

    const deps = makeDeps()
    h.handlers.clear()
    registerBackupIpc(deps)
    const res = (await invoke('backup:import')) as { ok: boolean; backupDir?: string }

    expect(res.ok).toBe(true)
    expect(JSON.parse(readFileSync(join(h.state.userData, 'settings.json'), 'utf-8')).size).toBe(444)
    expect(deps.settings.reload).toHaveBeenCalled()
    expect(deps.passive.rebuild).toHaveBeenCalled()
    expect(deps.autoReports.setConfig).toHaveBeenCalled()
    expect(readFileSync(join(res.backupDir!, 'settings.json'), 'utf-8')).toContain('300')
    rmSync(source, { recursive: true, force: true })
  })

  it('非法备份 → 确认前拒绝且不改动配置', async () => {
    h.state.openPath = join(tmp, 'no.dpbackup')
    writeFileSync(h.state.openPath, 'not a zip')
    const res = (await invoke('backup:import')) as { ok: boolean; error?: string }
    expect(res.ok).toBe(false)
    expect(res.error).toBeTruthy()
    expect(JSON.parse(readFileSync(join(h.state.userData, 'settings.json'), 'utf-8')).size).toBe(300)
  })

  it('用户在确认框取消 → canceled 且不改动配置', async () => {
    const source = mkdtempSync(join(tmpdir(), 'dp-backup-cancel-'))
    const sourcePaths = {
      settings: join(source, 'settings.json'),
      schedules: join(source, 'schedules.json'),
      autoReports: join(source, 'autoReports.json'),
      passive: join(source, 'passiveSources.json')
    }
    writeFileSync(sourcePaths.settings, JSON.stringify({ size: 999 }))
    h.state.openPath = join(source, 'in.dpbackup')
    createBackupArchive(h.state.openPath, sourcePaths, '1.3.0')
    h.state.confirm = 0

    const res = (await invoke('backup:import')) as { ok: boolean; canceled?: boolean }
    expect(res.ok).toBe(false)
    expect(res.canceled).toBe(true)
    expect(JSON.parse(readFileSync(join(h.state.userData, 'settings.json'), 'utf-8')).size).toBe(300)
    rmSync(source, { recursive: true, force: true })
  })

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
  })
})
