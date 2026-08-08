# DesktopPet 可扩展桌面宠物平台

当前版本：**v1.0**（正式版）· 协议：**GPL-3.0**

一个可扩展的桌面宠物平台：**角色 = 资源包**，核心引擎与角色完全解耦。桌宠根据系统状态与事件产生不同表现，会说话、有心情；用户可导入自制角色，也可通过本地 API 与被动数据源接入自己的自动化。

## 功能总览

- **桌宠本体**：透明置顶悬浮窗口、呼吸/浮动动画、点击穿透（逐像素 alpha）、拖动记忆位置、多显示器、多角色切换、夜间叠加层
- **状态系统**：idle / focus / sleep / happy / warning，由事件中心决策驱动（优先级 + 去重 + 过期管理，纯逻辑可单测）
- **事件中心（v0.2+）**：可插拔数据源架构（系统监控 / 插件 / 剪贴板 / 目录 / 前台应用），统一源表驱动
- **系统监控**：CPU / 内存 / 电池 / 用户空闲 → 状态事件
- **剪贴板拟人化互动（v0.9.1）**：复制链接/代码/长文/图片/敏感内容时，桌宠按特征从可自定义台词池回应；敏感内容（token/密码/卡号/验证码）原文绝不进入 IPC
- **事件通知页（v1.0）**：控制中心「事件」页签展示本次运行事件流（200 条环形缓冲），来源/状态/高优先级筛选、详情展开、清空；状态徽章与兔兔情绪色对应
- **陪伴统计（v0.5+）**：时长/状态分布/互动/热力图/趋势对比/成就徽章；CSV/Markdown 周报月报/Excel 年度导出；自动报告定时生成
- **日程提醒**：单次/每日/每周/每月触发，alarm 驱动 warning 状态
- **事件推送 API（v0.8）**：本地 HTTP `POST /api/event`（Bearer token 认证），第三方程序把事件推给桌宠转达
- **控制中心**：首页 / 角色 / 市场 / 消息（台词池自定义）/ 日程 / 统计 / 推送 / 事件 / 开发者 / 设置
- **角色包（.pet）**：config.json 驱动 + 序列帧/模板动画，缺素材自动回退；本地市场安装/升级
- **Windows 一键脚本**：`启动.bat` / `自检.bat` / `构建验证.bat`

## 技术栈

Electron + React 19 + TypeScript（严格模式）+ electron-vite + Tailwind CSS v4 + shadcn 风格组件 + vitest（450 例单测）· **零运行时新依赖，全程本地离线**

## 快速开始

```bash
npm install
npm run dev        # 开发模式（热更新）
```

正式构建与自检：

```bash
npm run typecheck  # 类型检查（node + web，必须 0 错误）
npm test           # 单元测试（450 例）
npm run build      # 构建产物到 out/
```

打包（electron-builder 已配置）：`npx electron-builder --win`（配置见 `electron-builder.yml`，产物输出到 `release/`）。

## 项目结构

```text
src/main/       Electron 主进程（窗口/角色/事件中心/数据源/监控/统计/日程/推送/存储）
src/preload/    白名单 API 桥（contextIsolation + sandbox）
src/renderer/   桌宠窗口 + 控制中心（React，含 pet/ 与 center/ 两个应用）
src/shared/     跨进程类型与纯逻辑（IPC 契约/语音台词池/事件分类）
characters/     角色包仓库（开发期目录形式）
plugins/        插件目录
docs/           设计文档（specs/ 与 plans/ 为 superpowers 流程产物）
backup/         版本快照（vX-final = 各版本最终版，_archive/ = 历史中间快照，见 backup/README.md）
.superpowers/   SDD 开发过程台账（brief/report/ledger，无 git 下的记录）
out/            构建产物（gitignore）
dist/ release/  electron-builder 打包产物（gitignore，可再生）
```

## 文档

- `README.md` — 本文件
- `docs/使用说明.md` — 用户操作手册（最新版 v1.0）
- `docs/架构设计.md` — 架构与进程模型
- `docs/API设计.md` — IPC 契约与事件中心（含 v1.0 事件通知页）
- `docs/角色包规范.md` — 角色包 config.json 标准
- `docs/部署说明.md` — 环境要求、构建、测试、打包与故障排查
- `docs/开发规范.md` — 版本管理、备份、UI、文档规范
- `docs/可行性分析.md` — 项目定位与技术选型
- `CHANGELOG.md` — 版本记录（v0.1 → v1.0 正式版）
- `LICENSE` — GPL-3.0（含免责声明）

## 备份与版本

`backup/` 下每个 `v<大版本>-final` 目录对应该大版本的**最终快照**（与 CHANGELOG 对照，内含 package.json 可核对真实版本）；历史中间快照归档于 `backup/_archive/`。发版收盘刷新对应 final：`node .superpowers\sdd\copy-backup.js "backup\v<大版本>-final"`。

## License

本项目基于 **GNU General Public License v3.0** 开源，详见 [`LICENSE`](./LICENSE)。

### 协议要点

- ✅ 自由使用、修改、分发
- ⚠️ 衍生作品必须以相同许可证（GPL v3）开源
- ❌ 禁止闭源商业化

> **免责声明**：本项目仅供学习交流与演示用途，不构成任何形式的商业服务或技术承诺。软件按「现状」提供，不作任何明示或暗示的保证。如您在使用过程中发现缺陷或问题，欢迎通过 GitHub Issues 反馈，但作者不因使用本软件所直接或间接产生的任何损失承担责任。
