<div align="center">

# DesktopPet 可扩展桌面宠物平台

**角色 = 资源包**——核心引擎与角色完全解耦的可扩展桌宠平台

![CI](https://github.com/anyuer678/desktoppet/actions/workflows/test.yml/badge.svg) ![Release](https://img.shields.io/github/v/release/anyuer678/desktoppet) ![License](https://img.shields.io/github/license/anyuer678/desktoppet) ![Tests](https://img.shields.io/badge/tests-470%2B-green) ![Top language](https://img.shields.io/github/languages/top/anyuer678/desktoppet)

<p align="center"><img src="characters/rabbit/preview.jpg" alt="Rabbit 角色预览" width="420"></p>

</div>

> **状态**：`portfolio` · Electron 桌宠平台 · GPL-3.0 · **非**通用生产组件库  
> 单测约 **470+** 例（含 headless smoke / IPC schema / 敏感剪贴板零泄漏 / 角色包失败路径 / Push 回环绑定）；CI 跑 typecheck + unit tests + build + 产物校验。  
> 支持与隐私：敏感剪贴板内容设计上不进 IPC（有自动化断言）；推送 API 仅绑定 `127.0.0.1` + Bearer token。

当前版本：**v1.2.0**（正式版，附 Windows 安装包下载）· 协议：**GPL-3.0**

一个可扩展的桌面宠物平台：**角色 = 资源包**，核心引擎与角色完全解耦。桌宠根据系统状态与事件产生不同表现，会说话、有心情；用户可导入自制角色，也可通过本地 API 与被动数据源接入自己的自动化。

## 功能总览

- **桌宠本体**：透明置顶悬浮窗口、呼吸/浮动动画、点击穿透、拖动记忆位置、多显示器、多角色切换、夜间叠加层
- **状态系统**：idle / focus / sleep / happy / warning，由事件中心决策驱动（优先级 + 去重 + 过期管理，纯逻辑可单测）
- **事件中心**：可插拔数据源（系统监控 / 插件 / 剪贴板 / 目录 / 前台应用），统一源表驱动
- **系统监控**：CPU / 内存 / 电池 / 用户闲置 → 状态事件
- **剪贴板拟人互动**：复制链接/代码/长文/图片/敏感内容时按特征回应；敏感内容（token/密码/卡号/验证码）**原文不进 IPC**
- **事件通知页**：控制中心「事件」页签展示运行事件流（环形缓冲）
- **伴随统计**：时长/状态分布/互动热力/趋势/成就；CSV/Markdown 周报月报/Excel 年度导出
- **日程提醒**：单次 / 每日 / 每周触发，alarm 驱动 warning 状态
- **事件推送 API**：本机 HTTP `POST /api/event`（仅 `127.0.0.1` + Bearer token），第三方程序把事件推给桌宠
- **控制中心**：首页 / 角色 / 市场 / 消息 / 日程 / 统计 / 推送 / 事件 / 开发者 / 设置
- **角色包（.pet）**：config.json 驱动 + 序列帧/模板动画；缺素材自动回退；本地市场安装/升级
- **Windows 一键脚本**：`启动.bat` / `自检.bat` / `构建验证.bat`

## 技术栈

Electron + React 19 + TypeScript（严格模式）+ electron-vite + Tailwind CSS v4 + shadcn 风格组件 + vitest · **零运行时新依赖，全程本地离线**

## 快速开始

```bash
npm install
npm run dev        # 开发模式（热更新）
```

正式构建与自检：

```bash
npm run typecheck  # 类型检查（node + web，必须 0 错误）
npm test           # 单元测试 + headless smoke
npm run build      # 构建产物到 out/

# 本地一键门禁（typecheck + test + build + 产物存在性）
powershell -ExecutionPolicy Bypass -File scripts/verify-local.ps1
# 仅测已有 out/ 时：
#   ... -File scripts/verify-local.ps1 -SkipBuild
```

打包（electron-builder 已配置）：`npx electron-builder --win`（配置见 `electron-builder.yml`，产物输出到 `release/`）。

## 质量门禁（CI 与本地同源）

| 门禁 | 命令 | 说明 |
|------|------|------|
| 类型 | `npm run typecheck` | tsc node + web |
| 单测 | `npm test` | vitest，含 headless smoke |
| 构建 | `npm run build` | electron-vite → `out/` |
| 产物 | `scripts/verify-local.ps1` | 断言 main/preload/renderer 产物存在 |

**Headless 冒烟覆盖点**（无 Electron / 无显示，适合 GitHub Actions）：

- 事件中心状态决策与过期裁剪
- Push API 载荷校验 + Bearer 鉴权
- 角色包加载失败路径（损坏 config / 非法 id / 坏 zip）→ `ok:false` 且仓库无污染
- **敏感剪贴板原文零泄漏**：`push:fired` 载荷仅含 `reaction`，序列化结果不含密钥片段
- Push 服务 **仅绑定 `127.0.0.1`**（常量 + 源码契约 + 运行时 host 断言）
- IPC 通道命名 schema（`namespace:action`）与载荷字段白名单

## 项目结构

```text
src/main/       Electron 主进程（窗口/角色/事件中心/数据源/监控/统计/日程/推送/存储）
src/preload/    白名单 API 桥（contextIsolation + sandbox）
src/renderer/   桌宠窗口 + 控制中心（React，含 pet/ 与 center/ 两个应用）
src/shared/     跨进程类型与纯逻辑（IPC 契约/语音台词池/事件分类）
scripts/        本地门禁（verify-local.ps1）
characters/     角色包仓库（开发期目录形式）
plugins/        插件目录
docs/           设计文档（specs/ 与 plans/）
out/            构建产物（gitignore）
dist/ release/  electron-builder 打包产物（gitignore，可再生）
```

## 文档

- `README.md` — 本文件
- `docs/` — 使用说明、架构设计、API/IPC 设计、角色包规范、部署说明等
- `CHANGELOG.md` — 版本记录（v0.1 → v1.0）
- `CONTRIBUTING.md` / `SECURITY.md` — 贡献与安全策略
- `LICENSE` — GPL-3.0

## 资产体积债务与 Git LFS 路线图（不改写历史）

仓库当前包含少量**大二进制角色/图标资产**（刻意不改写 git 历史；只记录债务与迁移动作）：

| 路径 | 约大小 | 说明 |
|------|--------|------|
| `characters/market/rabbit.pet` | ~2.3 MB | 角色包（zip） |
| `build/icon.png` | ~2.2 MB | 应用图标 |
| `characters/rabbit/avatar.png` | ~2.2 MB | 角色立绘（与 icon 同源冗余） |
| `characters/**/preview.jpg` | ~160 KB ×2 | 预览图 |

**路线图（按优先级）**：

1. **短期（不迁移 LFS）**：压缩 `avatar.png`/`icon.png`（建议最长边 ≤512，WebP/PNG 优化）；`rabbit.pet` 内帧图去冗余。目标：单文件 < 500 KB。
2. **中期（可选 LFS）**：对 `characters/**/*.pet`、`build/icon.png`、`characters/**/*.png` 启用 Git LFS 追踪；仅影响**后续提交**，历史 blob 仍在 Git 对象库中（符合「不改写历史」）。
3. **长期（若需要瘦身克隆）**：将示例角色包改为「发布资产 / Release 附件」下载，仓库只保留 `config.json` + 小体积占位图；或使用 `git filter-repo` **另行维护 thin 分支**（不 force-push `main`）。

LFS 启用示例（迁移前请先开分支验证）：

```bash
git lfs install
git lfs track "characters/**/*.pet" "build/icon.png" "characters/**/*.png"
git add .gitattributes
# 后续新提交的大文件自动走 LFS；旧历史保持原样
```

## License

本项目基于 **GNU General Public License v3.0** 开源，详见 [`LICENSE`](./LICENSE)。

### 协议要点

- ✅ 自由使用、修改、分发
- ⚠️ 衍生作品必须以相同许可证（GPL v3）开源
- ❌ 禁止闭源商业化

> **免责声明**：本项目仅供学习交流与演示用途，不构成任何形式的商业服务或技术承诺。软件按「现状」提供，不作任何明示或暗示的保证。
