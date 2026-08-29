import { app, Menu, nativeImage, Tray } from 'electron'
import { join } from 'path'
import { charactersRoot } from '../app/paths'
import { listCharacters } from '../character/configReader'

const FALLBACK_TRAY_ICON = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAFklEQVR4nGP8z8Dwn4EIwESMGBhGAAAS+wIB2x2hZQAAAABJRU5ErkJggg=='

export interface TrayDeps {
  showPet(): void
  hidePet(): void
  openCenter(): void
}

/** 创建系统托盘：图标优先取 rabbit 头像，再依次尝试各角色主头像，缺失时回退占位图 */
export function createTray(deps: TrayDeps): Tray {
  const root = charactersRoot()
  const iconCandidates = [
    join(root, 'rabbit', 'avatar.png'),
    ...listCharacters(root).map((c) => join(root, c.id, c.avatarMain))
  ]
  let icon = nativeImage.createEmpty()
  for (const p of iconCandidates) {
    const candidate = nativeImage.createFromPath(p)
    if (!candidate.isEmpty()) {
      icon = candidate
      break
    }
  }
  if (icon.isEmpty()) icon = nativeImage.createFromDataURL(FALLBACK_TRAY_ICON)
  icon = icon.resize({ width: 16, height: 16 })
  const tray = new Tray(icon)
  tray.setToolTip('DesktopPet')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '显示桌宠', click: () => deps.showPet() },
      { label: '隐藏桌宠', click: () => deps.hidePet() },
      { label: '打开控制中心', click: () => deps.openCenter() },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ])
  )
  tray.on('double-click', () => deps.showPet())
  return tray
}
