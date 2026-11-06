import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { pathToFileURL } from 'url'
import { ensurePositionVisible } from './placement'
import { isAllowedNavigation } from './navigation'
import { isCenterTab } from '../../shared/ipc'
import type { Settings } from '../../shared/ipc'
import { normalizePhysicsConfig, stepFling, type FlingState, type PhysicsConfig } from '../../shared/physics'

export interface WindowHubDeps {
  getSettings(): Settings
  /** 拖动窗口后合并 position 到 settings 并防抖落盘（原 moved 行为） */
  onPetMoved(position: { x: number; y: number }): void
  /** 位置越界修正：合并 position 到 settings 并立即落盘（原 ensurePetPosition 行为） */
  fixPetPosition(position: { x: number; y: number }): void
}

export interface WindowHub {
  /** 当前桌宠窗口（getter：closed 后为 null，禁止缓存快照） */
  pet(): BrowserWindow | null
  /** 当前控制中心窗口（getter：closed 后为 null） */
  center(): BrowserWindow | null
  createPet(): void
  createCenter(tab?: string): void
  openCenter(tab?: string): void
  notifyPet(channel: string, payload?: unknown): void
  notifyCenter(channel: string, payload?: unknown): void
  ensurePetPosition(): void
  showPet(): void
  hidePet(): void
  applyPetSize(size: number): void
  /** 拖动松手后的惯性滑动（参数在主进程夹取；未启用 physics 时无操作） */
  fling(vx: number, vy: number, physics?: unknown): void
  stopFling(): void
}

/**
 * 窗口运行时：pet/center 两个窗口的创建、引用注册表与广播。
 * 窗口引用是闭包私有状态，外部一律经 pet()/center() 现取，避免捕获已关闭窗口的旧引用。
 */
export function createWindowHub(deps: WindowHubDeps): WindowHub {
  let petWindow: BrowserWindow | null = null
  let centerWindow: BrowserWindow | null = null
  let flingTimer: NodeJS.Timeout | null = null
  let flingState: FlingState | null = null

  function stopFling(): void {
    if (flingTimer) clearInterval(flingTimer)
    flingTimer = null
    flingState = null
  }

  function fling(vx: number, vy: number, physics?: unknown): void {
    const win = petWindow
    if (!win || win.isDestroyed()) return
    stopFling()
    const config: PhysicsConfig = normalizePhysicsConfig(physics)
    if (!config.enabled || !Number.isFinite(vx) || !Number.isFinite(vy)) return
    const speed = Math.hypot(vx, vy)
    if (speed < 100) return
    const scale = Math.min(1, config.maxSpeed / speed)
    const [x, y] = win.getPosition()
    const [size] = win.getSize()
    const area = screen.getDisplayNearestPoint({
      x: Math.round(x + size / 2),
      y: Math.round(y + size / 2)
    }).workArea
    flingState = { x, y, vx: vx * scale, vy: vy * scale }
    let lastAt = Date.now()
    flingTimer = setInterval(() => {
      const current = flingState
      if (!current || !petWindow || petWindow.isDestroyed()) {
        stopFling()
        return
      }
      const now = Date.now()
      const step = stepFling(current, size, area, config, (now - lastAt) / 1000)
      lastAt = now
      flingState = step.state
      petWindow.setPosition(Math.round(step.state.x), Math.round(step.state.y))
      if (!step.active) stopFling()
    }, 16)
  }

  function rendererUrl(): string {
    return (
      process.env['ELECTRON_RENDERER_URL'] ??
      pathToFileURL(join(__dirname, '../renderer/index.html')).toString()
    )
  }

  function loadRenderer(win: BrowserWindow, hash: string): void {
    if (process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(process.env['ELECTRON_RENDERER_URL'] + hash)
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
    }
  }

  /** 禁止导航到远程/本地任意页面，并拒绝新窗口与 webview（preload 会暴露完整 IPC） */
  function hardenNavigation(win: BrowserWindow): void {
    const base = rendererUrl()
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event, url) => {
      if (!isAllowedNavigation(url, base)) event.preventDefault()
    })
    win.webContents.on('will-attach-webview', (event) => event.preventDefault())
  }

  function createPet(): void {
    const settings = deps.getSettings()
    petWindow = new BrowserWindow({
      width: settings.size,
      height: settings.size,
      x: settings.position.x,
      y: settings.position.y,
      transparent: true,
      frame: false,
      resizable: false,
      hasShadow: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        // 显式声明（Electron 当前默认即如此，写死防止未来默认变化引入静默回归）
        contextIsolation: true,
        nodeIntegration: false,
        // 角色音效由桌宠自主播放，不依赖用户手势
        autoplayPolicy: 'no-user-gesture-required'
      }
    })
    petWindow.setAlwaysOnTop(true, 'screen-saver')
    hardenNavigation(petWindow)
    petWindow.on('moved', () => {
      const [x, y] = petWindow?.getPosition() ?? [settings.position.x, settings.position.y]
      deps.onPetMoved({ x, y })
    })
    petWindow.on('closed', () => {
      stopFling()
      petWindow = null
    })
    loadRenderer(petWindow, '#/pet')
  }

  function createCenter(tab?: string): void {
    const safeTab = isCenterTab(tab) ? tab : undefined
    centerWindow = new BrowserWindow({
      width: 960,
      height: 640,
      frame: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true,
        // 显式声明（Electron 当前默认即如此，写死防止未来默认变化引入静默回归）
        contextIsolation: true,
        nodeIntegration: false
      }
    })
    centerWindow.on('closed', () => {
      centerWindow = null
    })
    hardenNavigation(centerWindow)
    loadRenderer(centerWindow, safeTab ? `#/center/${safeTab}` : '#/center')
  }

  function openCenter(tab?: string): void {
    // 页签白名单 + JSON.stringify：绝不把调用方字符串直接拼进执行代码
    const safeTab = isCenterTab(tab) ? tab : undefined
    if (!centerWindow) {
      createCenter(safeTab)
    } else if (safeTab) {
      void centerWindow.webContents.executeJavaScript(
        `window.location.hash = ${JSON.stringify(`#/center/${safeTab}`)}`
      )
    }
    centerWindow?.show()
    centerWindow?.focus()
  }

  function sendSafely(win: BrowserWindow | null, channel: string, payload?: unknown): void {
    if (!win || win.isDestroyed() || win.webContents.isDestroyed()) return
    try {
      win.webContents.send(channel, payload)
    } catch {
      // 窗口销毁竞态：丢弃本次广播，不能让 4s tick 抛错拖垮主进程
    }
  }

  function notifyPet(channel: string, payload?: unknown): void {
    sendSafely(petWindow, channel, payload)
  }

  function notifyCenter(channel: string, payload?: unknown): void {
    sendSafely(centerWindow, channel, payload)
  }

  function ensurePetPosition(): void {
    const settings = deps.getSettings()
    const workAreas = screen.getAllDisplays().map((d) => d.workArea)
    const primary = screen.getPrimaryDisplay().workArea
    const fixed = ensurePositionVisible(settings.position, settings.size, primary, workAreas)
    if (!fixed) return
    deps.fixPetPosition(fixed)
    petWindow?.setPosition(fixed.x, fixed.y)
  }

  function showPet(): void {
    petWindow?.show()
  }

  function hidePet(): void {
    petWindow?.hide()
  }

  function applyPetSize(size: number): void {
    stopFling()
    const win = petWindow
    if (!win) return
    const [x, y] = win.getPosition()
    const [w, h] = win.getSize()
    win.setBounds({
      x: Math.round(x + (w - size) / 2),
      y: Math.round(y + (h - size) / 2),
      width: size,
      height: size
    })
    notifyPet('pet:settings-changed', { size, opacity: deps.getSettings().opacity })
  }

  return {
    pet: () => petWindow,
    center: () => centerWindow,
    createPet,
    createCenter,
    openCenter,
    notifyPet,
    notifyCenter,
    ensurePetPosition,
    showPet,
    hidePet,
    applyPetSize,
    fling,
    stopFling
  }
}
