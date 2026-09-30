# AI Code

`@agent-xy/ai-code` 是面向 Vue 3 + Vite + TypeScript 的 AI 编码规范 npm 包。为 Cursor 提供一份短规则、七个通用技能及按项目选择的场景补充，并把项目现有质量检查统一为 `npm run ai:check`。源码与项目配置是技术事实来源；不需要填写任务档案或维护项目事实状态机。

## 一键接入

Node.js 18+，项目需要已有 `package.json` 及 Vue 3、Vite、TypeScript 依赖。执行：

```bash
npx @agent-xy/ai-code init
npm run ai:check
```

`init` 根据项目的 `packageManager` 字段或锁文件选择 npm、pnpm 或 yarn，安装确切版本的开发依赖，生成 `.cursor/rules/ai-code.mdc`、`.cursor/skills/ai-code-*/SKILL.md`、`.ai-code/config.json` 并添加 `ai:check` 脚本。对已经安装包的项目不会重复安装；离线验收可使用 `init --no-install`，之后仍需手动安装依赖才能运行 `npm run ai:check`。已有同名用户文件或脚本不会被覆盖。

Cursor 的基础规则默认加载；页面、组件、Hook、API、共享状态、路由和国际化技能按任务加载。CLI 决定项目安装哪些场景补充，AI 再根据当前任务选择相关技能。包中的 `content/` 是工具无关的唯一规范来源；`src/adapters/` 用于工具投影，后续可以在不改项目质量命令的情况下增加 Codex 适配器。当前未提供 Codex 投影。

## 按项目选择场景

首次在交互终端执行 `init` 时，可以输入编号选择场景，多个编号用逗号分隔，直接回车只安装通用规则。非交互环境、CI 或使用 `--json` 时不会询问，未指定场景则默认通用；已接入项目再次 `init` 会保留已有选择。

| 场景参数 | 安装内容 |
| --- | --- |
| `none` | 基础规则 + 七个通用技能 |
| `admin` | 通用内容 + 管理后台技能：复杂查询、表格、批量操作、权限与编辑流程 |
| `mobile-h5` | 通用内容 + 移动端 H5 技能：触摸、安全区域、软键盘、滚动、弱网与资源加载 |
| `admin,mobile-h5` | 通用内容 + 两类场景补充；按当前页面判断适用范围 |

通用层负责 Vue 数据流、组件与组合式函数边界、实例状态隔离、类型、异步资源和样式作用域，不预设页面文件树或 UI 库。后台的搜索与列配置、分页流程、详情抽屉和头像管理范例集中在 `admin`；移动端的触摸、安全区域、软键盘与滚动行为集中在 `mobile-h5`。

场景安装范围与任务适用范围分别判断：仅启用 H5 时不会生成后台技能；混合项目也只按当前功能选择，存在搜索、表单、列表或登录权限不足以判定为后台。移动端管理功能可以同时应用两个已启用的场景。

也可以直接指定，适用于脚本和自动化：

```bash
# 新项目接入管理后台场景
npx @agent-xy/ai-code init --scenarios admin

# 新项目只接入通用 Vue 与移动端 H5 能力
npx @agent-xy/ai-code init --scenarios mobile-h5

# 已接入项目改为同时启用后台与移动端
npx @agent-xy/ai-code sync --scenarios admin,mobile-h5

# 恢复为仅通用规则
npx @agent-xy/ai-code sync --scenarios none

# 查看选择与规则一致性
npx @agent-xy/ai-code status
```

选择保存在 `.ai-code/config.json` 的 `scenarios` 数组中；`--scenarios` 替换完整选择，`sync` 省略该参数则沿用已保存的值。没有此字段的旧配置按通用场景读取，下次同步时补齐。未知场景或无效参数会报错，不能静默退回默认。

同步会更新基础规则中的场景入口，并只安装所选场景的技能。取消选择时，只删除受控清单中未经手改的对应 `SKILL.md`，保留同目录用户文件；任何受控文件被修改、路径为符号链接或新文件与用户文件冲突时，先报错，不切换场景。项目类型由开发者选择，不通过组件库或目录名自动推断。

场景补充没有独立的质量命令，也不会自动引入移动端适配库、UI 库或新的构建框架；继续使用项目已有检查。查看全部命令可运行 `npx @agent-xy/ai-code --help`。

## 项目补充约定

团队可自行创建 `.ai-code/profile.md`，记录推荐范例、团队选择的组织方式与禁止效仿的遗留实现；组件契约和接口事实仍需读取源码。按通用约定与实际启用的场景分别记录，混合项目标明页面或模块的适用范围。下面路径仅作格式示意，应替换为当前仓库实际存在的入口，未使用的场景段落直接省略：

```markdown
# 通用约定

新 API 请求放入 `src/api/modules/`。

# 管理后台约定（仅后台页面适用）

新建后台列表页参考 `src/views/orders/index.vue` 的组件组合和查询流程。
成组搜索、列和枚举配置放页面同域 `config/`；较多页面样式放同域 `index.scss`。
私有详情面板、卡片和业务弹窗放同域 `components/`，接口类型复用领域 API 定义。
优先复用当前项目已有的搜索、列表、上传与分页 Hook；不能引用参考仓库才有的能力。

# 移动端 H5 约定（仅移动页面适用）

移动页面参考本项目已验证的布局与适配入口，复用触摸、滚动与安全区方案。
按移动交互和实际复杂度组织页面，不要求建立后台搜索配置、表格列或详情抽屉目录。

# 负面清单

`src/views/legacy-order/` 是待迁移旧代码，新增页面不得照搬其请求写法。
```

该文件可选，`init` 和 `sync` 不创建、不覆盖它；不要在此重复 `package.json` 中的质量命令。生成的基础规则会提示 AI 在文件存在时读取。

## 页面生成与结构验收

通用 Vue 页面先明确交付范围，检索相关项目能力，按实际复杂度确定状态、逻辑和展示职责，再实现并验收。常规实现决策自主推进，不要求逐步审批或维护任务档案；小改动保持原有范围，不按行数或固定目录机械拆分。

`admin` 在通用能力上补充搜索与列配置、私有详情和卡片组件、页面样式的组织方式，以及头像卡片页、标准表格页和详情抽屉页的正反范例。这些内容不进入通用技能；H5 页面应用通用能力与移动端交互要求，按自身项目惯例组织代码。

范例不自带业务接口或项目组件；所有导入、字段和权限以目标仓库为准。接口缺失时继续完成不依赖它的工作，并明确待联调项，不能把演示交互写成业务功能已完成。

交付证据分为结构审查、实际交互验证和项目质量命令结果。`ai:check` 与增量诊断沿用既有检查机制，不会自动判断组件职责是否合理、数据是否符合业务口径，也不能证明 Cursor 实际执行了每条规范。更新包后运行 `ai-code sync` 可同步增强后的规则；仅修改本包源码不会改变已经接入项目的规则。

## 质量检查

初始化会识别已存在的 `lint`、`typecheck`、`test`、`build` 等别名，写入 `.ai-code/config.json` 的 `scripts` 映射。不会安装或重写 ESLint、Vitest、Vite、TypeScript 的配置。`--fix` 与交互式测试脚本不作为自动检查；可在项目中新增非交互、非修改型脚本后更新映射。

```bash
npx @agent-xy/ai-code status
npm run ai:check -- --json
npx @agent-xy/ai-code sync
```

- `status` 仅读取项目，不运行检查。`status` 和 `check` 都展示场景选择并检查与受控文件是否一致；`check` 还执行配置的质量命令并检查包版本。
- 默认 `observe`（观察）模式：缺失检查显示 `missing`，不阻断；已有命令失败、规则漂移和无效配置仍阻断。
- 修改 `.ai-code/config.json` 的 `mode` 为 `enforce`（阻断）后，缺少 lint、typecheck 或 build 也会阻断；test 暂不列为所有项目的强制项。
- npm 包升级后执行 `npx @agent-xy/ai-code sync`；有手工改动的受控文件会拒绝覆盖。团队定制内容请放入其他 Cursor 文件。`status` 和 `check` 支持 `--json`。

建议先在项目内执行 `status` 了解缺口，再为当前项目补齐合适的检查脚本。规范无法独自验证业务需求；关键交互还需要对应测试与人工代码审查。

## 可选的增量诊断

已安装项目依赖且有本地 ESLint 的 Git 工作区可在开发中运行：

```bash
npx @agent-xy/ai-code quality inspect
npx @agent-xy/ai-code quality inspect --json
```

`inspect` 将相对 `HEAD` 已暂存、未暂存和未跟踪的 Vue/JS/TS 文件按当前工作区内容交给项目 ESLint 检查，并用 `HEAD` 内容计算历史诊断基线。不会自动修复源码或写入诊断日志；默认只显示前五条新增诊断、总数和是否截断。新增诊断返回 `failed`（退出码 1）；Git、基线或 ESLint 无法可靠检查时返回 `incomplete`（退出码 1），不得视为通过；没有适用改动时返回 `skipped`。本命令不需要也不会修改 `.ai-code/config.json`。

增量指纹结合路径、严重程度、规则和消息，并参考 Git 新增行处理同文件同名错误与重命名；它仍是近似诊断，不能证明没有新问题。基线使用当前安装的 ESLint 与配置；规则/配置变更、跨文件依赖及类型错误需要通过原有的 `ai-code check`、适用测试和人工审查验证。暂不提供自动 `fix`、严格暂存区检查或审计报告。

## Jenkins 共享流水线

公司平台在项目安装依赖后检测 `package.json` 是否声明 `ai:check`，有则执行 `npm run ai:check`（pnpm/yarn 使用对应的 `run ai:check`）。无需写入每个项目的 Jenkinsfile。流水线以退出码判定结果；观察模式的 `missing` 是能力缺口，不得展示成通过。若需要纯 JSON 报告，可在使用 npm 或 pnpm 的项目直接执行 `./node_modules/.bin/ai-code check --json`，或使用包管理器对应的命令入口。`npm run ai:check -- --json` 会带 npm 横幅，不能把整段输出直接解析为 JSON。

## 开发与发布

```bash
npm test
npm pack --dry-run
```

包以 MIT 授权，通过 `publishConfig` 发布到 npm 公共仓库。发布前需确认 npm 账号具有 `@agent` scope 的发布权限；本仓库的构建与测试不会自动发布。GitHub 仓库用于维护包源码，公司项目继续托管在 GitLab。
