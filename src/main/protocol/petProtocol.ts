import { net, protocol } from 'electron'
import { existsSync } from 'fs'
import { resolve } from 'path'
import { pathToFileURL } from 'url'
import { charactersRoot } from '../app/paths'
import { resolvePetPath } from '../character/configReader'
import type { LogFn } from '../logging/logger'

/** pet:// 自定义协议名 */
export const PET_SCHEME = 'pet'

/**
 * pet:// 协议特权声明。
 * 红线：必须经 index.ts 顶层在 app ready 之前传入 protocol.registerSchemesAsPrivileged，
 * 声明在 ready 之后调用会静默失效（角色资源全部加载失败）。
 */
export const PET_SCHEME_PRIVILEGES = {
  scheme: PET_SCHEME,
  // corsEnabled 必须为 true：渲染层 <img crossOrigin="anonymous"> 对 pet:// 发起的是 CORS 模式请求，
  // 缺少该声明时 Electron 在 scheme 层面直接拒绝跨域请求，响应头带 ACAO 也没用
  // （实机复现：精灵图 naturalWidth=0，宠物破图）。修复见 PR #11/#12。
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true }
}

/**
 * 注册 pet:// 请求处理器：pet://<角色id>/<路径> 映射到角色包根目录下文件。
 * 调用时机：app ready 之后、创建渲染窗口之前（渲染层加载即发起 pet:// 请求）。
 */
export function registerPetProtocol(deps: { log: LogFn }): void {
  const { log } = deps
  const root = resolve(charactersRoot())
  protocol.handle(PET_SCHEME, async (request) => {
    const url = new URL(request.url)
    const host = url.hostname
    const pathParts = url.pathname.split('/').filter(Boolean)
    const filePath = resolvePetPath(root, host, pathParts)
    if (!filePath) {
      log('warn', '[pet] rejected:', request.url)
      return new Response('forbidden', { status: 403 })
    }
    if (!existsSync(filePath)) {
      log('warn', '[pet] not found:', request.url)
      return new Response('not found', { status: 404 })
    }
    try {
      const resp = await net.fetch(pathToFileURL(filePath).toString())
      const headers = new Headers(resp.headers)
      // 渲染层 <img crossOrigin="anonymous">（PetApp 命中图需要无污染 canvas）发起 CORS 模式请求，
      // 而宠物窗口经 file:// 加载（Origin: null），控制中心等其他来源也可能引用 pet:// 资源。
      // 硬编码单来源会与所有实际 origin 不匹配 → 打包版宠物精灵图全部加载失败（naturalWidth=0）。
      // 角色素材是本地公开静态文件、不含凭据，通配 ACAO 是正确语义。
      headers.set('Access-Control-Allow-Origin', '*')
      return new Response(resp.body, { status: resp.status, headers })
    } catch (err) {
      log('warn', '[pet] fetch error:', filePath, err)
      return new Response('error', { status: 500 })
    }
  })
}
