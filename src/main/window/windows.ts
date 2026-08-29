import { BrowserWindow, screen } from 'electron'
import { join } from 'path'
import { ensurePositionVisible } from './placement'
import type { Settings } from '../../shared/ipc'

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
}

/**
 * 窗口运行时：pet/center 两个窗口的创建、引用注册表与广播。
 * 窗口引用是闭包私有状态，外部一律经 pet()/center() 现取，避免捕获已关闭窗口的旧引用。
 */
export function createWindowHub(deps: WindowHubDeps): WindowHub {
  let petWindow: BrowserWindow | null = null
  let centerWindow: BrowserWindow | null = null

  function loadRenderer(win: BrowserWindow, hash: string): void {
    if (process.env['ELECTRON_RENDERER_URL']) {
      void win.loadURL(process.env['ELECTRON_RENDERER_URL'] + hash)
    } else {
      void win.loadFile(join(__dirname, '../renderer/index.html'), { hash })
    }
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
        sandbox: true
      }
    })
    petWindow.setAlwaysOnTop(true, 'screen-saver')
    petWindow.setOpacity(settings.opacity)
    petWindow.on('moved', () => {
      const [x, y] = petWindow?.getPosition() ?? [settings.position.x, settings.position.y]
      deps.onPetMoved({ x, y })
    })
    petWindow.on('closed', () => {
      petWindow = null
    })
    loadRenderer(petWindow, '#/pet')
  }

  function createCenter(tab?: string): void {
    centerWindow = new BrowserWindow({
      width: 960,
      height: 640,
      frame: true,
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        sandbox: true
      }
    })
    centerWindow.on('closed', () => {
      centerWindow = null
    })
    loadRenderer(centerWindow, `#/center${tab ? '/' + tab : ''}`)
  }

  function openCenter(tab?: string): void {
    if (!centerWindow) {
      createCenter(tab)
    } else if (tab) {
      void centerWindow.webContents.executeJavaScript(`window.location.hash = '#/center/${tab}'`)
    }
    centerWindow?.show()
    centerWindow?.focus()
  }

  function notifyPet(channel: string, payload?: unknown): void {
    petWindow?.webContents.send(channel, payload)
  }

  function notifyCenter(channel: string, payload?: unknown): void {
    centerWindow?.webContents.send(channel, payload)
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
    applyPetSize
  }
}
