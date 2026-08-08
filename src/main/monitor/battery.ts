import { execFile } from 'child_process'

export interface BatterySample {
  /** 剩余电量百分比 0-100 */
  percent: number
  /** true = 交流供电（充电中或已充满） */
  charging: boolean
}

/** 低电量判定：有电池、未充电且电量 <= 阈值 */
export function isBatteryLow(sample: BatterySample | null, thresholdPercent: number): boolean {
  if (!sample) return false
  if (sample.charging) return false
  return sample.percent <= thresholdPercent
}

/** 通过 PowerShell 读取电池状态（Windows）：无电池/查询失败返回 null */
export function readBatteryViaPowerShell(): Promise<BatterySample | null> {
  return new Promise((resolve) => {
    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        '(Get-CimInstance Win32_Battery) | Select-Object EstimatedChargeRemaining, BatteryStatus | ConvertTo-Json -Compress'
      ],
      { timeout: 8000, windowsHide: true },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          resolve(null)
          return
        }
        try {
          const parsed = JSON.parse(stdout)
          const items = Array.isArray(parsed) ? parsed : [parsed]
          const first = items[0]
          const percent = Number(first?.EstimatedChargeRemaining)
          const status = Number(first?.BatteryStatus)
          if (!Number.isFinite(percent) || !Number.isFinite(status)) {
            resolve(null)
            return
          }
          resolve({ percent, charging: status === 2 || status === 3 })
        } catch {
          resolve(null)
        }
      }
    )
  })
}

export interface BatterySampler {
  start(): void
  stop(): void
  /** 最近一次采样结果（尚未完成首次采样时为 null），供事件 tick 同步读取 */
  get(): BatterySample | null
}

/**
 * 电池采样器：间隔轮询缓存最新样本。
 * PowerShell 查询较重（数百毫秒），不能放在 4s 事件 tick 内同步执行，
 * 故独立异步轮询，tick 只读缓存。
 */
export function createBatterySampler(
  read: () => Promise<BatterySample | null> = readBatteryViaPowerShell,
  intervalMs = 60_000
): BatterySampler {
  let latest: BatterySample | null = null
  let timer: ReturnType<typeof setInterval> | null = null
  let running = false

  const poll = async (): Promise<void> => {
    if (running) return
    running = true
    try {
      latest = await read()
    } catch {
      latest = null
    } finally {
      running = false
    }
  }

  return {
    start(): void {
      if (timer) return
      void poll()
      timer = setInterval(() => void poll(), intervalMs)
    },
    stop(): void {
      if (timer) clearInterval(timer)
      timer = null
    },
    get(): BatterySample | null {
      return latest
    }
  }
}
