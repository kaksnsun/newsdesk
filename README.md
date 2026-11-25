# Newsdesk

Newsdesk 是在本机浏览器中使用的新闻写作工作台。一个项目可以存放素材、检索记录和多篇稿件。可以从代表作中提取个人文风，按所选材料生成文章，也可以对单个段落提出修改并审阅差异。界面支持英语、西语、法语、中文、日语和韩语。

## 平台支持

本版本以源码形式运行，已在 Apple Silicon Mac 上完成本机验证。Intel Mac 和 Windows x64 是 Docker 版的目标平台，尚待适配和验收。当前仓库提供 [Docker 适配说明](docs/DOCKER-HANDOFF.md)，正式镜像和一键启动配置待发布。

Newsdesk 面向单人本机使用。写作和检索评分需要用户配置兼容的模型服务。

## 本机启动

以下命令适用于 macOS 的终端。在含有本 README 和 `package.json` 的目录执行。需要 Node.js 22.13 或更高版本、npm、uv、tar，以及首次安装所需的网络。用 `node -v` 和 `uv --version` 确认环境。Apple Silicon 是本版已本机验证的平台。开发依赖的安装说明见 [Node.js](https://nodejs.org/) 和 [uv](https://docs.astral.sh/uv/getting-started/installation/)。

```sh
npm ci
SEARCH_UV="$(command -v uv)" npm run setup:search
npm start
```

打开 **[本地 Newsdesk](http://127.0.0.1:43219/)**。如已有实例占用端口，使用 `PORT=43220 npm start` 并打开对应端口。用 Ctrl+C 退出，Newsdesk 会停止自己的搜索进程。搜索运行环境生成在 `.runtime/search/`，首次安装会下载 SearXNG 和 Python 依赖，之后可以复用。

## 第一次使用

1. 在「设置 → 模型」填写兼容 Chat Completions 的 API 根地址、模型名称和可选密钥。本机服务的示例地址是 `http://127.0.0.1:1234/v1`。模型由用户提供。连通性检测会访问该地址。
2. 创建项目，上传或粘贴已有素材，或在 Research 输入选题。应用默认用内置 SearXNG 搜索，由模型改写查询、评估相关性。可读取的结果能直接加入项目素材库。网络、模型或上游搜索源异常时，查看对应阶段的状态。
3. 在写作页勾选素材，选择文风与输出语言，再输入写作要求。编辑器支持局部修改和稿件导出。自动读取依赖脚本渲染的网页需要本机 Chrome 或 Chromium，必要时用 `NEWSROOM_BROWSER_PATH` 指向浏览器可执行文件。

## 存储、备份与联网范围

所有项目、稿件和文风默认自动保存到 `~/Documents/Newsdesk/Newsdesk.newsdesk`，这是一个带格式版本的 SQLite 文件。设置中的「本地存储」可更改文件夹。「备份历史」支持手动备份和整库恢复。备份位于资料库旁的 `Newsdesk Backups/`。恢复前会保存当前库的快照。更改位置会复制并校验当前库，原目录中的库与旧备份会保留。迁移到另一台电脑前请先停止服务，再复制资料库及需要保留的备份。

API 密钥按服务地址保存在当前浏览器的本地存储中。清除浏览器数据可能需要重新配置密钥。配置远程模型后，任务所需的提示词、选择的材料、稿件上下文或文风样例会发给该服务。检索查询和正文读取也会联网。新建测试资料库或备份生产库之前，先核对数据目录。

## 验证

```sh
npm test
npm run verify:ux
```

第一条运行单元与集成测试。第二条需要安装 Google Chrome，使用临时资料库实测浏览器中的编辑、保存失败恢复、备份、还原、目录切换及文章导出。模型相关测试使用测试响应。手动验证搜索时，打开设置中的搜索连接测试，并确认返回实际搜索结果。验证真实模型则需自行配置服务。

## 仓库入口

| 路径 | 用途 |
| --- | --- |
| `server.mjs`、`generation.mjs` | 本地 HTTP、静态页面、模型请求 |
| `library*.mjs`、`public/library-*.js` | 资料库读写、版本校验、自动保存与恢复 |
| `research.mjs`、`search-service.mjs` | 检索、评分、搜索进程管理 |
| `website*.mjs`、`source-import.mjs` | 网页与文档正文提取 |
| `public/`、`scripts/`、`test/` | 界面、开发脚本、回归测试 |

详细测试环境、实测结果及已知限制见[验证记录](docs/VERIFICATION.md)。

## 许可证

Newsdesk 自有代码采用 [MIT 许可证](LICENSE)。SearXNG、字体、图标、壁纸及其他依赖分别遵循各自的许可条款，见[第三方说明](THIRD-PARTY-NOTICES.md)。
