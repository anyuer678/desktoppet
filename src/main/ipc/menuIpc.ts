import { BrowserWindow, Menu, app, ipcMain } from 'electron'
import type { WindowHub } from '../window/windows'
import { charactersRoot } from '../app/paths'
import { listCharacters } from '../character/configReader'

export interface MenuIpcDeps {
  windows: WindowHub
  getActiveCharacterId(): string
  selectCharacter(id: string): void
  notifyPet(channel: string, payload?: unknown): void
  openCenter(tab?: string): void
}

/** menu:popup：桌宠右键菜单 */
export function registerMenuIpc(deps: MenuIpcDeps): void {
  ipcMain.handle('menu:popup', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    const template: Electron.MenuItemConstructorOptions[] = [
      { label: '打开控制中心', click: () => deps.openCenter() },
      { label: '设置', click: () => deps.openCenter('settings') },
      {
        label: '换一个',
        click: () => {
          const chars = listCharacters(charactersRoot())
          if (chars.length < 2) return
          const idx = chars.findIndex((c) => c.id === deps.getActiveCharacterId())
          const next = chars[(idx + 1) % chars.length]
          deps.selectCharacter(next.id)
        }
      },
      { label: '隐藏', click: () => deps.windows.hidePet() },
      { type: 'separator' },
      {
        label: '切换角色',
        submenu: listCharacters(charactersRoot()).map<Electron.MenuItemConstructorOptions>((c) => ({
          label: c.name,
          type: 'radio',
          checked: c.id === deps.getActiveCharacterId(),
          click: () => deps.selectCharacter(c.id)
        }))
      },
      { label: '暂停动画', click: () => deps.notifyPet('pet:toggle-pause') },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() }
    ]
    Menu.buildFromTemplate(template).popup({ window: win })
  })
}
