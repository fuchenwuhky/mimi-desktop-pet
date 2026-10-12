# 小咪的素材目录

本仓库包含角色制作的完整本地素材。原始猫咪照片与参考拼图经项目发起人明确同意公开；没有上传本机接入令牌、运行设置、第三方依赖目录或构建缓存。

| 位置 | 内容 |
| --- | --- |
| 根目录 13 张 JPG | 未修改的原始猫咪照片 |
| `art/reference/photos-contact.jpg` | 原照联系表 |
| `art/mimi/references/` | 统一角色原型、身份参考、布局导引 |
| `art/mimi/prompts/` | 原版动作与修复提示词 |
| `art/mimi/decoded/` | 原版生成条带及修订 |
| `art/mimi/frames/` | 按整段统一比例登记的动画帧 |
| `art/mimi/final/` | 兼容图集、最终编码帧和验证记录 |
| `art/mimi/qa/` | 比例、视线方向、透明边缘与盲评记录 |
| `art/mimi/smooth/decoded/` | 补帧版生成源图及保留的修订版本 |
| `art/mimi/smooth/extracted/`、`registered/`、`sheets/` | 补帧版处理过程和独立图集 |
| `art/mimi/smooth/qa/` | 提示词、共同缩放参数、连通组件和最终字节检查 |
| `art/mimi/smooth/generation-prompts.json` | 补帧版最终提示词合集 |
| `art/mimi/previews/final/` | 原版预览 |
| `art/mimi/previews/smooth/` | 130 帧版 GIF、MP4 与连续状态故事板 |
| `assets/pet/` | 应用实际加载的完整运行素材与两个版本的配置 |

`manifest.json` 使用 130 帧桌面版；`manifest-compatibility.json` 保留 83 帧版配置。帧数包含双向跑步和 16 个视线方向，不重复计算同一过渡动画的正反播放。

图像生成源图保留了洋红色底，以记录完整制作流程。应用使用 `assets/pet/` 中已处理为透明背景的素材，不会显示洋红色底。

Windows 程序、完整便携 ZIP、运行素材与预览 ZIP 位于 [Releases](https://github.com/fuchenwuhky/mimi-desktop-pet/releases/latest)。原始照片、全部修订和制作过程可通过仓库的 Code → Download ZIP 或 Release 的 Source code 下载。构建压缩包不进入 Git 历史；各素材展开后的源文件都已放在上述目录。

本地运行与跨智能体接入见 [README](../README.md) 和 [接入说明](integrations.md)。美术素材许可范围见 [ASSETS-LICENSE.md](../ASSETS-LICENSE.md)。
