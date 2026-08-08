import { Component, type ErrorInfo, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import './assets/index.css'
import { PetApp } from './pet/PetApp'
import { CenterApp } from './center/CenterApp'

/** 渲染错误兜底：避免渲染抛错整窗白屏，展示可恢复界面 */
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; message: string }> {
  state = { hasError: false, message: '' }

  static getDerivedStateFromError(err: unknown): { hasError: boolean; message: string } {
    return { hasError: true, message: err instanceof Error ? err.message : String(err) }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[desktop-pet] render error:', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex h-screen w-screen flex-col items-center justify-center gap-3 bg-background p-6 text-center text-sm text-foreground">
          <div className="text-base font-semibold">界面渲染出错</div>
          <div className="max-w-md break-all text-muted-foreground">{this.state.message}</div>
          <button
            className="rounded-md border px-3 py-1.5 hover:bg-accent"
            onClick={() => this.setState({ hasError: false, message: '' })}
          >
            重试
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('missing #root')

const isCenter = window.location.hash.startsWith('#/center')

createRoot(rootEl).render(
  <ErrorBoundary>{isCenter ? <CenterApp /> : <PetApp />}</ErrorBoundary>
)
