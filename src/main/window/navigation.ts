/**
 * 导航白名单：窗口只允许停留在自己的 renderer 页面。
 * 开发模式允许同源（Vite 热更新/重新加载）；打包模式只允许同一个 index.html 文件。
 * 拖入链接/文件或其他脚本触发导航时，preload 会挂到远程文档上并暴露全部 IPC 能力，因此必须拦截。
 */
export function isAllowedNavigation(url: string, rendererUrl: string): boolean {
  try {
    const target = new URL(url)
    const base = new URL(rendererUrl)
    if (base.protocol === 'file:') {
      return target.protocol === 'file:' && target.pathname === base.pathname
    }
    return target.origin === base.origin
  } catch {
    return false
  }
}
