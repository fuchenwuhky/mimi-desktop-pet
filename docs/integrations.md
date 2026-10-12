# 咪咪与智能体联动

咪咪是独立桌面应用。即使没有智能体，她也会自己待着、偷看、趴成一团。联动通过本机事件接口实现，不需要模型 API Key。

## 目前交付的接入方式

| 应用 | 方式 | 能感知的状态 | 验证边界 |
| --- | --- | --- | --- |
| Codex 本地 CLI / 桌面本地会话 | 原生 hooks | 开工、工具活动、等待审批、回合结束、中断 | 已按官方 schema 实现；需在本机启用并信任 hooks |
| Claude Code | 原生 hooks | 开工、工具活动、等待审批、回合结束、工具/API 出错 | 已按官方 schema 实现 |
| Cursor | 原生 hooks | 发出提示、工具完成、工具失败、回合结束/中止 | 已按官方 schema 实现；没有把执行前事件假装成“等待审批” |
| Gemini CLI | 原生 hooks | 开工、工具活动、工具审批、回合结束 | 已按官方 schema 实现 |
| 其他本地 CLI，例如 Aider、OpenCode、Copilot CLI | 通用命令包装 | 进程启动、正常退出、非零退出 | 只知道进程生命周期，交互式终端内每一轮的状态不可见 |
| 任意本地程序 / 自建智能体 | HTTP 或手动事件 | 由调用者明确发送五种状态 | 通用接口，不等于已安装官方插件 |

适配器已做本地 HTTP、事件映射、内容过滤与离线退化测试；没有替你登录各个产品逐一实跑，也没有改动现有智能体设置。云端、远程机器、容器和 WSL 中的 `127.0.0.1` 不一定是运行桌宠的 Windows 主机；这版不自动跨机器转发。

## 快速试一下

先启动桌宠，在本目录打开终端：

```powershell
node adapters/send.cjs codex working
node adapters/send.cjs codex waiting
node adapters/send.cjs codex success
```

手动测试消息可跟在后面，例如 `node adapters/send.cjs manual waiting "咪…等你一下"`。自动 hooks 只发送状态，不发送提示词、代码、回复、工作目录、工具参数或错误详情。

## 为常用智能体生成配置

需要本机 Node.js 18 或以上版本。运行：

```powershell
node adapters/generate-configs.cjs
```

生成的文件都在 `adapters/generated/`，命令已填入当前安装目录的绝对路径。搬动咪咪目录后重新生成。配置使用 `node` 命令；如果智能体找不到 Node，请在其启动环境补充 Node 所在目录到 PATH。

| 生成文件 | 合并位置 |
| --- | --- |
| `codex.hooks.json` | `%USERPROFILE%/.codex/hooks.json` 或项目 `.codex/hooks.json` |
| `claude.settings.fragment.json` | `%USERPROFILE%/.claude/settings.json` 或项目 `.claude/settings.local.json` 的 `hooks` 字段 |
| `cursor.hooks.json` | `%USERPROFILE%/.cursor/hooks.json` 或项目 `.cursor/hooks.json` |
| `gemini.settings.fragment.json` | `%USERPROFILE%/.gemini/settings.json` 或项目 `.gemini/settings.json` 的 `hooks` 字段 |

已有配置时，保留原来的条目，把咪咪的条目追加到对应事件数组。不要整份覆盖。重启对应应用后用一轮短任务验证；测试通过前不要把“已生成”理解成“已连接”。

Codex 的非托管 hooks 需要用户审核并信任；云端编排不支持本地命令 hooks，即使部分工具在本地执行也一样。支持的本地事件包括 `UserPromptSubmit`、`PermissionRequest`、`Stop` 和 `Interrupt`。[官方 Hooks 文档](https://learn.chatgpt.com/docs/hooks)

Claude Code 使用 `UserPromptSubmit`、`PermissionRequest`、`Stop`、`StopFailure` 等生命周期事件；旧版本可能没有较新的错误事件。[Claude Code hooks](https://code.claude.com/docs/en/hooks)

Cursor 使用 `beforeSubmitPrompt`、`postToolUse`、`postToolUseFailure` 与 `stop`；`stop.status` 区分正常结束、错误和中止。[Cursor hooks](https://cursor.com/docs/hooks)

Gemini CLI 的 `BeforeAgent` / `AfterAgent` 覆盖回合，`Notification` 的 `ToolPermission` 表示等待工具许可；它的超时单位是毫秒。[Gemini CLI hooks](https://geminicli.com/docs/hooks/reference/)

所有 hook 都只观察；连接失败时安静退出，不做批准、拒绝、续写或修改工具的决定。`success` 表示所观察的回合或进程结束，不能保证模型回答正确、测试通过，或用户整体目标已完成。工具报错也可能随后被智能体修复。

## 通用命令包装

Windows PowerShell 可直接包装 `.cmd`、`.exe` 和已安装的命令：

```powershell
./adapters/run.ps1 -Source codex -Command codex -CommandArgs @('exec', '你的任务')
./adapters/run.ps1 -Source aider -Command aider
```

macOS / Linux，或 Windows 下直接运行可执行文件：

```sh
node adapters/run.cjs aider -- aider
node adapters/run.cjs my-agent -- python agent.py
```

包装器保留终端输入输出和退出码。Node 包装器每 30 秒发送一次工作状态；PowerShell 包装器只在开始和退出时发事件。长驻交互式 CLI 请优先用原生 hooks；不支持 hooks 的程序使用手动事件。不要同时为同一会话启用包装器和原生 hooks，以免出现重复来源。

## 本机事件协议

```http
POST http://127.0.0.1:47831/events
Content-Type: application/json
X-Mimi-Token: <读取 ~/.mimi-pet/token>

{"source":"my-agent","event":"working","sessionId":"my-session"}
```

`event` 取 `working`、`waiting`、`success`、`error`、`idle`；`source` 是简短应用标识；`sessionId` 和 `message` 可选。自动适配器将会话标识散列后再发送。鉴权文件由桌宠创建，适配器不会生成或输出令牌。可用 `MIMI_PET_TOKEN_FILE` 改变读取路径，`MIMI_PET_PORT` 改变端口；桌宠服务也必须相应配置。

这里只连接 IPv4 回环地址，不读全局聊天记录，不扫描进程、不截屏、不把事件上传到外部服务。自定义短消息由你主动提供，建议只写状态提示。

## 鲸鱼娘参考

根据你描述的 DSH 桌宠，找到同系列候选：[dsh-whale-pet](https://github.com/aceice01/dsh-whale-pet)、[dsh-BigfishPet](https://github.com/s17179XTY/dsh-BigfishPet)、[dsh-pet](https://github.com/PC2005-cloud/dsh-pet) 以及 [独立桌面移植](https://github.com/MerZlin/dsh-pet-indesktop)。尚不能确认你记忆中具体是哪一款。

这版借鉴“独立透明窗口、工作状态带动表情、短气泡、动作自然接续”的交互方向；猫的形象、动作和台词另行制作，没有复制鲸鱼娘角色资源。没有安装或捆绑 DSH 原生插件，DSH 目前可通过通用本机事件接入。
