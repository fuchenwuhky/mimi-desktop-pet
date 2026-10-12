# 复用与重建桌宠素材

仓库已包含可直接使用的 `assets/pet/`、13 张原始猫咪照片、参考拼图、生成源图、提示词、逐帧素材和检查记录。直接运行桌宠不需要图像生成工具或 Python；图片生成具有随机性，重新执行提示词并不保证得到相同像素。

## 创作环境

处理脚本使用 Python 3.10+ 和 Pillow。需要提取、配准或清理图像时，还需要已安装的 **work-pets / create-pet** 技能提供的原版脚本。本仓库没有复制或替换技能实现。

```text
python -m pip install Pillow
python art/mimi/skill_runtime.py
```

第二条命令只检查依赖位置，不写入素材。默认查找当前用户的 `~/.codex/plugins/cache/openai-curated-remote/work-pets/*/skills/create-pet/scripts`，优先采用版本号较新的完整目录；设置了 `CODEX_HOME` 时则从该目录查找。原项目使用 0.1.6，其他版本需要重新核对输出和检查结果。

如果插件存放在其他位置，把环境变量 `MIMI_PET_SKILL_SCRIPTS` 设为实际的 `create-pet/scripts` 目录。例如在 PowerShell 中：

```powershell
$env:MIMI_PET_SKILL_SCRIPTS = 'E:\plugins\work-pets\0.1.6\skills\create-pet\scripts'
python art/mimi/skill_runtime.py
```

找不到技能时，处理脚本会报告需要安装或配置的依赖，不会悄悄改用另一种提取算法。所有项目内输入输出均从脚本位置解析，仓库不必位于原来的磁盘目录。

预览脚本优先选择系统中的中文字体。也可把 `MIMI_PET_FONT` 设为本地 `.ttf`、`.ttc` 或 `.otf` 字体文件。没有可用中文字体时会警告并使用 Pillow 默认字体，中文说明可能显示为缺字方框；猫咪图像不受影响。

## 制作记录和脚本入口

以下命令从仓库根目录执行。除依赖检查外，制作命令会覆盖相应的派生文件；尝试重做时请使用单独的工作副本。

| 位置或命令 | 用途 |
| --- | --- |
| `art/mimi/prompts/`、`art/mimi/imagegen-jobs.json` | 原版生成提示词与任务记录 |
| `art/mimi/smooth/generation-prompts.json` | 高帧数动作生成提示词 |
| `art/mimi/references/`、`art/reference/`（原照在 `photos/` 子目录） | 猫咪身份、照片和版式参考 |
| `python art/mimi/register_rows.py` | 对原版已提取帧使用整段统一的身体尺度和地面配准 |
| `python art/mimi/smooth/build_smooth.py` | 使用技能提取 `smooth/decoded/` 源图，再配准、去边色并生成高帧数图集 |
| `python art/mimi/smooth/build_smooth.py idle` | 仅重建指定动作，其他动作继续使用当前仓库中的图集 |
| `python art/mimi/smooth/release_smooth.py` | 将高帧数图集复制到 `assets/pet/` 并写入桌面版配置 |
| `python art/mimi/render_final_previews.py smooth` | 用当前发布素材生成连续状态预览 |
| `python art/mimi/smooth/verify_release.py` | 检查发布图集边界、独立帧、跳跃位移和趴下接续，并写入检查预览 |
| `art/mimi/smooth/qa/*.py` | 检查源图连通区域、视线标记或特定动作的制作辅助脚本 |

`export_art.py` 是原版兼容素材导出步骤，会重新写入 `assets/pet/manifest.json`；它不是高帧数桌面版的日常构建入口。固定格式的 v2 兼容图集已保留在仓库中，重建兼容图集还需要按照 create-pet 技能流程完成组图和验证。

原始 JSON、提示词与审核记录保留了制作当时的路径、版本和参数。其中出现的旧机器绝对路径是历史元数据，不作为运行配置使用；新增脚本通过当前仓库及上述环境变量定位依赖。检查报告也只是对应当时素材的结果，修改图像后应重新执行相应检查并人工查看动作衔接。

保持比例的关键是让同一段动画共用一个变换，按身体标记与共同地面对齐，始终播放完整的 192×208 画格。不要把每帧猫咪的可见边界分别裁切并撑满画格，这会重新引入大小跳变。
