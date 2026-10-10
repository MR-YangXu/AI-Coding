# AI Code 项目使用说明

当前能力：**{{stack}}**。业务场景与质量命令见 `.ai-code/config.json`。

## 文件归属

- `.cursor/rules/ai-code.mdc`、生成的 `ai-code-*` 技能及本说明由包维护，禁止直接修改；`ai-code sync` 会覆盖修改、恢复缺失文件并移除废弃能力。
- `.ai-code/profile.md` 由团队维护，记录推荐组件、{{logic}}、参考页面、业务目录及局部约定；已有文件永不被同步覆盖。
- `.ai-code/config.json` 保存明确选择的框架、语言、场景、检查脚本及可选常量绑定；同步保留项目自行维护的检查与常量配置。
- 工具只生成能力文件，不建立业务源码骨架。源码、依赖实际版本及调用方仍是实现事实来源。

## 日常开发

先读取 profile 中与当前任务有关的推荐入口，再核实一个相邻实现及实际契约。没有 profile 时按基础规则就近定位，不为了本次任务创建档案。

页面先加载当前框架的页面技能，再按当前功能叠加后台或 H5 技能；其余任务只加载相关技能。已安装不等于每次都要全文读取。

优先直接复用、兼容扩展已有能力。不复用时在交付中说明需求、候选入口、能力缺口、扩展影响及决定，不另建任务档案。不从其他仓库照抄导入、接口或权限。

接口字段以已确认契约为准。已有请求函数直接调用，失败使用项目错误处理；字段不明或失败不能成为改用演示数据的理由。仅在 URL 和请求函数都不存在、任务明确允许模拟时，按已确认契约使用独立 `mock.{{ext}}`，保留真实接口待联调说明。

业务目录沿用本项目，组件示例扩展名为 `.{{componentExt}}`，常量入口示例为 `src/constants/index.{{ext}}`，使用前核实路径。

## 同步与切换

```bash
npx @agent-xy/ai-code status
npx @agent-xy/ai-code sync
npx @agent-xy/ai-code sync --scenarios admin,mobile-h5
npx @agent-xy/ai-code sync --scenarios none
```

升级 npm 包后执行 sync。同步覆盖受控文件的手改内容，无需额外开关；仅删除清单内文件，保留同目录其他文件和 profile。新目标与未受控文件冲突、路径为符号链接时会报错。

切换能力使用 `sync --framework vue2|vue3|react --language js|ts`。Vue 2 固定 JS；切换至 Vue 3 或 React 时明确指定语言。选择只决定安装的规则与扫描适配器，不转换业务源码或升级框架。

## 质量命令

```bash
npm run ai:check
npx @agent-xy/ai-code check --json
npx @agent-xy/ai-code quality inspect --json
```

`status` 只读取配置、受控文件和检查可用性；`check` 执行已配置的项目质量脚本及常量扫描。`quality inspect` 对相对 Git HEAD 的改动文件运行已有 ESLint，区分新增与历史诊断，不自动修复源码。

工具需要 Node 18+，不安装或改写项目 ESLint、构建、测试及类型配置。旧工程需要不同 Node 版本时，由项目已有脚本或 CI 明确安排。

- 默认 `observe`：缺少通用检查不阻断；已有检查失败、受控内容漂移、扫描未完成仍阻断。
- `enforce`：JS 必须有 lint 和 build；TS 还必须有 typecheck。test 不作为所有项目必需项。
- JS 未配置类型检查显示 `not_applicable`（不适用）；已经配置的检查照常运行。构建不能替代类型检查。
- 检查脚本必须单次退出且不改写源码，带 `--fix`、`--write` 或交互监听的脚本不用于自动检查。
- 新增质量脚本后显式更新配置中的 scripts 映射，sync 不重建已有映射。

## 常量扫描

三种框架都支持只读常量检查，需在配置中显式添加 `constants` 后启用；不猜测业务枚举或扫描所有数字。

配置登记公共入口、业务定义位置、导出名、业务模块 include/exclude、fields（字段）、options（选项变量），不重复维护码值和文案。Vue 可加 template 绑定（component、prop、可选 model），React 可加 jsx 绑定（component、prop）。绑定范围限定在对应业务模块。

按“公共导出 → 当前业务入口 → 相关定义”复用常量；同一业务语义只有一个权威来源。动态字典来自既有接口；字典保存翻译键时，在当前框架的响应式展示中生成文案。

扫描检查重复定义、导入归属、业务字面量、成员引用和字典完整性；结构相同只提示疑似重复，不自动合并不同业务。普通数字、运行时值不作为确定违规。

Vue 2 支持普通 JavaScript 脚本、data/this 和模板变量、过滤器及插槽作用域；React 支持 JSX、真实 useState 初始值与更新、对象字段及属性绑定。不承诺任意跨函数动态推导。

默认按所选语言寻找 jsconfig.json 或 tsconfig.json 解析别名；也可用历史字段 `constants.tsconfig` 指定其中任一配置文件。未声明的构建工具别名不能自动猜测。

`not_configured` 表示未配置；`incomplete` 表示解析或配置未完成，不等于通过。外置 Vue 脚本、模板和预处理模板不在当前扫描范围内。诊断保留源文件行列，默认最多展示 5 条并保留总数。

可复制示例位于安装包 `content/templates/constants/<框架>-<语言>/`。旧 `content/templates/constants/` 仍提供 Vue 3 TS 示例。先按实际契约替换示例，再合并 constants 配置，不覆盖已有项目配置。init/sync 不复制业务示例、不自动启用业务扫描。

## 交付

说明复用了哪些页面、组件和逻辑入口，实际执行了什么检查，哪些接口尚未联调。请求失败、检查失败或未运行均如实报告；不能通过忽略诊断、关闭检查或替换演示数据制造通过。
