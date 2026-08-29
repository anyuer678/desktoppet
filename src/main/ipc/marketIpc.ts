import { ipcMain } from 'electron'
import { join, resolve } from 'path'
import { readFileSync, existsSync } from 'fs'
import type { LogFn } from '../logging/logger'
import type { MarketEntryWithStatus, PluginManifest } from '../../shared/ipc'
import { charactersRoot } from '../app/paths'
import { isWithinRoot, listCharacters } from '../character/configReader'
import { readMarketCatalog, installMarketEntry } from '../market/catalog'
import { toPluginInfo } from '../plugin/pluginHost'

export interface MarketIpcDeps {
  /** 插件清单（getter：插件重载后 list 现读最新值） */
  getPlugins(): PluginManifest[]
  log: LogFn
}

/** 读取市场目录下的预览图并转为 data URL（sandbox 渲染层无法直接 file:// 访问） */
function readPreviewDataUrl(marketDir: string, preview: string): string {
  if (!preview) return ''
  const filePath = resolve(marketDir, preview)
  if (!isWithinRoot(marketDir, filePath) || !existsSync(filePath)) return ''
  const ext = filePath.toLowerCase().split('.').pop() ?? ''
  const mime = ext === 'png' ? 'image/png' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ''
  if (!mime) return ''
  try {
    const buf = readFileSync(filePath)
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return ''
  }
}

/** market:catalog / market:install / plugin:list */
export function registerMarketIpc(deps: MarketIpcDeps): void {
  ipcMain.handle('market:catalog', () => {
    const marketDir = join(charactersRoot(), 'market')
    const catalog = readMarketCatalog(marketDir)
    deps.log('info', '[market:catalog] marketDir=', marketDir, 'entries=', catalog.length)
    const installed = new Map(listCharacters(charactersRoot()).map((c) => [c.id, c.version]))
    return catalog.map<MarketEntryWithStatus>((e) => ({
      ...e,
      installed: installed.has(e.id),
      installedVersion: installed.get(e.id),
      previewDataUrl: readPreviewDataUrl(marketDir, e.preview)
    }))
  })
  ipcMain.handle('market:install', (_e, entryId: string) => {
    const marketDir = join(charactersRoot(), 'market')
    return installMarketEntry(marketDir, entryId, charactersRoot())
  })
  ipcMain.handle('plugin:list', () => toPluginInfo(deps.getPlugins()))
}
