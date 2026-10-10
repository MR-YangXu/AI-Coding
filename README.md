# AI Code

`@agent-xy/ai-code` 为 Cursor 安装按项目选择的前端 AI 编码规则、技能、项目约定模板，并通过 `ai:check` 复用已有质量命令及常量扫描。

## 接入

工具运行环境为 Node.js 18+，在已有 package.json 的项目中执行：

```bash
npx @agent-xy/ai-code init
```

首次交互依次选择框架、语言规则、业务场景和可选项目 profile：

| 框架 | 语言规则 | 技能 |
| --- | --- | --- |
| Vue 2 | JavaScript | 页面、组件、逻辑复用、状态、路由、国际化、API、常量 |
| Vue 3 | JavaScript / TypeScript | 页面、组件、组合式函数、状态、路由、国际化、API、常量；TS 另加类型 |
| React | JavaScript / TypeScript | 页面、组件、React Hook、状态、路由、国际化、API、常量；TS 另加类型 |

框架与语言完全由用户选择，不读取依赖推断，不强制 Vite，也不会因缺少框架依赖而拒绝安装。选择规则不会转换业务源码。Vue 2 面向传统 Options API（选项式 API）；React 面向普通网页函数组件，未提供 Next.js、React Native 或多框架根目录隔离能力。

非交互、CI 或 `--json` 必须指定框架；Vue 3、React 还必须明确指定语言：

```bash
npx @agent-xy/ai-code init --framework vue2 --scenarios admin
npx @agent-xy/ai-code init --framework vue3 --language ts --profile base
npx @agent-xy/ai-code init --framework react --language js --scenarios mobile-h5
```

Vue 2 可省略 `--language`，固定为 js。场景支持 none、admin、mobile-h5、admin,mobile-h5；默认仅通用规则。非交互未指定 profile 时不创建档案；交互时可选择创建或暂不创建。任一选择取消均不修改项目。

工具按 packageManager 字段或锁文件选择 npm/pnpm/yarn，安装确切版本开发依赖、注册 `ai:check`，生成规则和配置。`--no-install` 可用于离线生成，后续仍需安装依赖。不会安装或重写目标项目的构建、ESLint、测试或类型配置。

## 文件归属与升级

| 文件 | 维护方式 |
| --- | --- |
| `.cursor/rules/ai-code.mdc` | 包生成，sync 覆盖 |
| `.cursor/skills/ai-code-*/SKILL.md` | 只安装所选能力，sync 覆盖或移除 |
| `.ai-code/README.md` | 当前技术栈的使用说明，sync 覆盖 |
| `.ai-code/profile.md` | 团队维护，已有文件永不覆盖 |
| `.ai-code/config.json` | 保存选择、脚本映射、可选常量扫描配置和受控文件清单 |

**受控规则禁止直接修改。项目补充约定统一写入 profile；升级同步会覆盖受控文件的手工修改，无需 `--force`。** 同步恢复缺失文件，移除不再适用的旧技能；只操作清单内文件，保留同目录其他文件。首次接入或新增目标与未受控文件冲突时仍报错。路径越界和符号链接不会被绕过。

```bash
npx @agent-xy/ai-code status
npx @agent-xy/ai-code sync
npx @agent-xy/ai-code sync --framework react --language ts
npx @agent-xy/ai-code sync --scenarios admin,mobile-h5
npx @agent-xy/ai-code sync --scenarios none
```

npm 包升级后执行 sync，不自动通过安装钩子改写项目。重复 init 沿用已有选择；需要更新或恢复时运行 sync。status/check 会检测被修改的规则并提示恢复。

配置版本为 2，新增 `stack: { "framework": "vue3", "language": "ts" }`。版本 1 按原支持范围 Vue 3 + TS 读取，sync 时迁移，保留场景、脚本和 constants 设置。直接改配置的选择后，需 sync 使受控内容一致。

## 项目约定与技能

`--profile base|admin|mobile-h5|none` 创建一次项目档案，Vue 项目兼容旧 `--profile vue`。模板中的扩展名、逻辑复用名称和示例随技术栈生成；已有档案后续由团队维护。

profile 记录适用范围、推荐组件及逻辑入口、参考实现、借鉴边界和业务目录；先核实源码与调用方，再替换待填内容。不为模板完整而创建不存在的模块。业务目录沿用项目，工具不创建页面骨架。

基础规则提供当前安装的技能入口。页面使用框架对应 view 技能，再叠加实际适用的后台/H5 场景。只读任务相关技能，多个技能共享已有检索和验收结果。

内容源分层在 `content/common/`、`content/frameworks/`、`content/languages/`、`content/scenarios/`，通过显式能力清单生成，工具适配器只负责目标路径。项目只能看到选中组合；JS 不安装类型技能，Vue 2 使用 logic，Vue 3/React 使用各自的 hook。

## 质量检查

```bash
npm run ai:check
npx @agent-xy/ai-code check --json
npx @agent-xy/ai-code quality inspect --json
```

init 识别现有 lint、typecheck、test、build 等脚本别名，保存到配置。带 `--fix`、`--write`、发布行为或未配置单次执行的监听测试命令不参与自动检查。新增脚本后手动更新 scripts 映射，sync 保留原映射。

- observe（观察模式）：缺少通用检查不阻断；已有检查失败、规则漂移、无效配置和扫描未完成仍阻断。
- enforce（阻断模式）：JS 要求 lint/build；TS 另要求 typecheck。test 不统一强制。
- JS 未配置 typecheck 显示 not_applicable（不适用）；已配置则照常执行，失败不能忽略。
- status 仅读取，不执行质量命令。check 执行项目配置的命令，范围可能是整个项目；构建不能代替类型检查。
- quality inspect 对相对 HEAD 的已暂存、未暂存和未跟踪源码执行项目 ESLint，比较新增与历史诊断；不自动修复，不依赖接入配置。需已有 Git HEAD 和本地 ESLint。

日常 AI 任务默认先检查改动文件；涉及类型契约时运行覆盖受影响调用方的项目类型检查。完整日志保存到临时文件，先报告退出码、数量和少量代表性问题。本次引入的错误修复后复验，未处理的历史或环境问题不无效重试。

工具使用 Node 18+；旧业务构建需要其他版本时，通过项目脚本或 CI 安排，不自动切换 Node。

## 常量扫描

Vue 2、Vue 3、React 均支持只读常量扫描。项目显式配置 constants 后启用，框架适配器由保存的选择决定，不扫描依赖来判断。init/sync 不自动创建业务常量或猜测字段绑定。

检查覆盖：业务硬编码、错误成员、常量归属及导入入口、重复定义、字典键与完整性。改名后结构相同只提示疑似重复，必须核对业务语义。普通数字、动态值和合法引用不作为确定违规。

支持 JS 普通对象及可静态确认的 Object.freeze、TS as const 和显式赋值枚举；支持导入别名、命名空间与作用域遮蔽。Vue 2 支持 data/this、模板别名、v-for、插槽、过滤器和 .sync；React 支持 JSX 属性、真实 useState 初始值与更新，以及对象状态/reducer 中明确绑定的字段。不承诺任意跨函数动态推导。

配置示例（路径与契约需替换为项目实际内容）：

```json
{
  "constants": {
    "definitions": [
      { "id": "order.status", "owner": "orders", "file": "src/orders/constants.js", "export": "ORDER_STATUS", "dictionary": "ORDER_STATUS_DICT" }
    ],
    "modules": [{
      "id": "orders",
      "include": ["src/orders/**/*"],
      "bindings": [{
        "definition": "order.status",
        "fields": ["status"],
        "options": ["statusOptions"],
        "jsx": [{ "component": "StatusSelect", "prop": "value" }]
      }]
    }]
  }
}
```

| 配置 | 含义 |
| --- | --- |
| common.entry / common.files | 可选公共导出入口与实际定义文件 |
| definitions | 唯一业务标识、所属模块、定义文件、导出名及可选字典 |
| modules.include / exclude | 相对根目录的范围，支持 `*`、`**`、`?` |
| bindings.fields / options | 业务字段及选项变量 |
| bindings.template | Vue 的 component、prop、可选 model（v-model 表达式）绑定 |
| bindings.jsx | React 的 component、prop 绑定，名称按源码，范围限定在业务模块 |
| tsconfig | 历史字段，可指向 tsconfig.json 或 jsconfig.json 以解析别名 |

未指定配置文件时，JS 优先 jsconfig.json，TS 优先 tsconfig.json，再尝试另一种；不改变用户选择的语言。构建工具中未登记的别名不自动猜测。路径不能逃出项目，源码不能经符号链接引用项目外定义。

示例位于 `content/templates/constants/vue2-js/`、`vue3-js/`、`vue3-ts/`、`react-js/`、`react-ts/`，旧 `content/templates/constants/` 保留 Vue 3 TS 入口。复制前核实已有定义，配置只合并 constants 部分。示例不是业务接口事实。

报告状态：not_configured（未配置）、available（只检查配置）、passed（扫描完成无诊断）、warning（观察模式违规或疑似重复）、failed（阻断模式确定违规）、incomplete（解析/配置未完成）。失败的解析不会显示通过，外置 Vue 块、预处理模板等当前不支持输入会明确报告。默认展示最多 5 条诊断，保留总数和原始源文件行列。

## 开发与验证

```bash
npm ci
npm test
npm pack --dry-run
```

测试包括五种技术栈的接入、交互、配置迁移、受控覆盖、常量解析和离线打包安装。离线安装测试需要 npm 缓存含锁文件的依赖；先完成 npm ci。工具内部的 TypeScript 和模板解析器不代表目标 JS 项目需要类型规则。

命令完整参数见 `ai-code --help`。发布流程见 docs 中的发包说明；本仓库不会自动发布包。
