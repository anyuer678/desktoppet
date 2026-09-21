import { describe, expect, it, vi } from 'vitest'
import { computeState, pruneEvents, type PetEvent } from '../event/eventCenter'
import { isAuthorized, parseEventBody, generateToken } from '../push/pushApi'
import { isSensitive } from '../event/sourceClassifier'
import { createClipboardSource } from '../event/sources/clipboardSource'
import { listCharacters, readCharacterDetail } from '../character/configReader'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { PassiveClipboardConfig } from '../../shared/ipc'
import type { SourceContext } from '../event/sourceHub'

/**
 * Headless smoke（CI 可跑，无 Electron / 无显示）：
 * 覆盖事件中心决策、推送鉴权、角色包失败路径、敏感剪贴板 IPC 零泄漏。
 * 详细用例见同模块 *.test.ts；本文件强调「组合链路一次跑通」。
 */

describe('headless smoke：核心链路', () => {
  it('事件中心：cpu_high → warning，并在过期后回到 idle', () => {
    const now = 1_000_000
    const list: PetEvent[] = [
      { source: 'monitor', type: 'cpu_high', priority: 8, durationMs: 5000, occurredAt: now }
    ]
    const active = computeState(list)
    expect(active.state).toBe('warning')
    expect(pruneEvents(list, now + 10_000)).toHaveLength(0)
    expect(computeState([]).state).toBe('idle')
  })

  it('推送鉴权 + 载荷校验闭环', () => {
    const token = generateToken()
    expect(isAuthorized(`Bearer ${token}`, token)).toBe(true)
    expect(isAuthorized(undefined, token)).toBe(false)
    const ok = parseEventBody({ title: '构建完成', message: 'desktoppet CI green' })
    expect(ok.ok).toBe(true)
    const bad = parseEventBody({ title: 'x'.repeat(100), message: 'm' })
    expect(bad.ok).toBe(false)
  })

  it('角色包：空仓库加载失败返回 ok:false', () => {
    const root = mkdtempSync(join(tmpdir(), 'dp-smoke-'))
    expect(listCharacters(root)).toHaveLength(0)
    expect(readCharacterDetail(root, 'nope')).toBeNull()
    rmSync(root, { recursive: true, force: true })
  })

  it('敏感剪贴板走事件源时，IPC 载荷只有 reaction', () => {
    const secret = 'sk-Abcdef1234567890'
    expect(isSensitive(secret)).toBe(true)
    const calls: unknown[] = []
    const ctx: SourceContext = {
      inject: vi.fn(),
      replaceBySource: vi.fn(),
      notify: (...args: unknown[]) => {
        calls.push(args)
      },
      count: vi.fn(),
      log: vi.fn()
    }
    const cfg: PassiveClipboardConfig = {
      enabled: true,
      pollMs: 0,
      onlyPatterns: [],
      ignorePatterns: [],
      maxLen: 100
    }
    const source = createClipboardSource(
      vi.fn(() => ({ text: secret, hasImage: false })),
      () => cfg
    )
    source.start(ctx)
    source.poll?.(Date.now())
    const dump = JSON.stringify(calls)
    expect(dump).toContain('clipSensitive')
    expect(dump).not.toContain(secret)
  })
})
