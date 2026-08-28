# Sub2API 用量浮窗

一个只读的 macOS、Windows 和 Linux 桌面用量看板。数据全部来自现有 Sub2API 管理 API，不直连 PostgreSQL/Redis，也不需要修改服务器部署。

[下载最新版本](https://github.com/chopperH0824/sub2api-usage-float/releases/latest) · [问题反馈](https://github.com/chopperH0824/sub2api-usage-float/issues)

## 看板内容

- 全部导入账号的 5h、7d、周、月及平台特有额度窗口
- 窗口使用率、重置倒计时、请求数、Token、标准/账号/用户成本和采样状态
- 今日请求、Token、成本以及按需加载的 30 天汇总、每日历史、模型和接口统计
- 并发、RPM、活跃会话、窗口费用和日/周/总容量
- 调度状态、优先级、分组、代理关系、冷却原因和上游健康告警
- Grok 配额/账单、Antigravity AI Credits、Ollama Cloud 套餐/余额等可操作的平台数据
- 异常、封禁、验证、重新授权、暂停、限流、过载和临时不可调度状态
- 平台/状态筛选、账号搜索、告警优先排序
- 每个账号可打开独立透明浮窗，并单独保存位置、尺寸、透明度和置顶状态
- 主看板置顶、紧凑模式、透明度、暗色模式、系统托盘，以及 macOS/Windows 登录时启动

支持 OpenAI/Codex、Anthropic/Claude、Gemini、Antigravity、Grok、Kimi、智谱、DeepSeek 和 Ollama Cloud 的现有字段。新版服务器优先使用批量接口；旧版没有批量接口时自动降级为受限并发的逐账号读取。

## 自定义显示内容

看板设置提供 29 个经过筛选的监控项，按“额度与容量、实时负载、今日消耗、趋势与归因、调度与账号、健康与平台”分组。令牌配置状态、TLS/缓存开关、原始账号 ID、通用扩展字段等实现细节不进入看板。可使用“默认 / 全选 / 清空”，也可以逐项选择；只有实际有值的数据才占用界面空间。

主看板和每个账号浮窗都提供“极简 / 日常 / 成本 / 调度 / 分析”快捷预设。详情数据使用指标单元、状态徽标、配额进度、消耗排行、分组标签和备注块呈现，避免把复杂统计压成纯文字列表。

主看板保存一套全局选择，每个账号浮窗单独保存自己的选择。历史、模型、接口和调度分等开销较高的数据只在对应显示项启用后读取，30 天统计会缓存 5 分钟。Sub2API 版本不支持某项接口时会自动降级，不影响其他数据刷新。

## 账号独立浮窗

点击账号卡片右上角的浮窗图标即可为该账号创建独立桌面窗口。默认“小”档为 `320 × 172`，中档为 `380 × 280`，大档为 `440 × 480`；浮窗内可切换尺寸，并分别调整显示内容、透明度和置顶状态。窗口位置、尺寸、显示项和开启状态会保存到本地，下次启动自动恢复。

主看板可以隐藏到系统托盘，账号浮窗继续留在桌面。托盘菜单可统一显示、隐藏或关闭当前账号浮窗。所有窗口共享主进程中的同一份刷新结果，不会因为打开多个浮窗而重复请求 Sub2API。

## 连接服务器

推荐使用 Sub2API 的 `Admin API Key`：

1. 登录现有 Sub2API 管理后台。
2. 在系统设置中生成 `Admin API Key`（格式通常为 `admin-...`）。
3. 启动浮窗，填写服务器地址和该 Key。

也可以使用管理员邮箱和密码登录，客户端支持 TOTP 二次验证。若服务器登录启用了网页验证码，使用 Admin API Key 更稳定。

服务器地址可填写 `https://sub2api.example.com` 或包含 `/api/v1` 的完整地址，客户端会自动规范化。生产环境应使用 HTTPS，避免认证信息通过明文 HTTP 传输。

## 本地开发

需要 Node.js 22.12 或更高版本。正式产物支持 Apple Silicon Mac（macOS 13+）、Windows x64 和 Linux x64。

```bash
npm install
npm run dev
```

仅预览界面（使用本地模拟账号数据）：

```bash
npm run dev:web
```

预览地址为 `http://127.0.0.1:5173/`；连接页可访问 `http://127.0.0.1:5173/?screen=connect`，开屏动画可访问 `http://127.0.0.1:5173/?screen=boot`，账号浮窗可访问 `http://127.0.0.1:5173/?view=account-float&accountId=1`。

## 构建桌面安装包

```bash
npm run build:mac    # macOS arm64: DMG + ZIP
npm run build:win    # Windows x64: NSIS EXE + ZIP
npm run build:linux  # Linux x64: AppImage + DEB
```

构建产物位于 `release/`。macOS 与 Windows 当前未配置开发者签名，首次打开时可能出现系统安全提示；Linux AppImage 首次运行前需要赋予可执行权限。正式 Release 的三个平台产物由对应的 GitHub Actions 原生运行器分别构建。

## 验证

```bash
npm run typecheck
npm test
npm run build
```

## 数据请求

常规刷新主要使用：

- `GET /api/v1/admin/accounts`
- `POST /api/v1/admin/accounts/usage/batch`
- `POST /api/v1/admin/accounts/today-stats/batch`
- `GET /api/v1/admin/accounts/:id/stats?days=30`（仅启用 30 天显示项时）
- `GET /api/v1/admin/system/version`

管理员账号登录使用 `/api/v1/auth/login`、`/api/v1/auth/login/2fa` 和 `/api/v1/auth/refresh`。自动刷新不会请求重置额度、修改账号或写入业务数据；`force` 始终为 `false`。

## 本地安全

- 密码只用于当前登录请求，从不落盘。
- Admin API Key 或刷新令牌通过 Electron `safeStorage` 加密，并交由 macOS 钥匙串、Windows DPAPI 或 Linux Secret Service/KWallet 保护。
- Linux 缺少安全密钥环并退化为 `basic_text` 时，应用不会保存任何凭据。
- Key/令牌只存在于 Electron 主进程，不暴露给 Vue 渲染页面。
- 本地配置保存在 Electron 的应用数据目录，文件权限为 `0600`。
- 若系统安全存储不可用，凭据只保留在当前运行会话。

## License

[MIT](LICENSE) © 2026 Qiangbin Hu
