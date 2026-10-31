# ai-code 安装评审 · 缺陷清单

安装事实：`npm i @agent-xy/ai-code`（0.7.0）→ `init --framework vue2 --scenarios admin --profile admin`
产物：11 份受控文件（`.cursor/rules/ai-code.mdc` + 9 份 `ai-code-*` SKILL + `.ai-code/README.md`）、`.ai-code/config.json`、`.ai-code/profile.md`，并改写 `package.json`
状态：`mode: observe`、`adapter: cursor`

---

## P0 · 结构性冲突（不可就地修）

### 1. 受控规则自带排他条款，与项目既有规则争位

- 证据：`.cursor/rules/ai-code.mdc` 同时为 `alwaysApply: true`，且第 13 行写「本仓库**只**使用已安装的 `ai-code-*` 技能，不读取…其他规范全文」。
- 缺陷性质：问题不在内容对错，而在**生效方式是排他的**。一条 always-on 规则声明「只读我这 9 份」，等价于把项目按 glob / description 按需触发的既有规则全部判为不该读。
- 不可修正：该措辞写死在受控文件内，而 `.ai-code/README.md` 第 9 行规定受控文件禁止手改，`sync` 会覆盖手改、恢复缺失、移除废弃能力；`config.json` 的 `managed` 段用 SHA256 锁定这些文件，手改会被判漂移。
- 结论：只能在更高优先级的 always-on 入口做外部仲裁，或整体移除。

### 2. 只产出 cursor 适配文件，且未登记进本仓库的 AI 总入口

- 证据：`.ai-code/config.json` 第 4 行 `"adapter": "cursor"`，11 份受控文件全部落在 `.cursor/` 下；本仓库的 AI 总入口是 `AGENTS.md`（其自称「本表为规则目录权威清单」，逐条列出 `.cursor/rules/*.mdc` 指针与 Skill 索引），而安装器只改了 `package.json`，未向 `AGENTS.md` 写入任何 `.ai-code` / `ai-code-*` 入口。
- 后果（双向落空）：

  | 读取方式 | 结果 |
  | --- | --- |
  | 按 `.cursor/rules` 自动注入 | 触发 P0-1 的排他冲突 |
  | 按 `AGENTS.md` 索引按需读取 | 这 11 份文件不在加载清单内，装了读不到 |

- 与 P0-1 联动：`AGENTS.md` 是唯一能压住排他条款的位置（受控文件改不了），所以补登记不只是「加个索引」，而是仲裁入口本身。

---

## P1 · 产物内容与本项目不符

| # | 缺陷 | 证据 | 影响 |
| --- | --- | --- | --- |
| 1 | `src/constants/` 被写成**默认值**而非示例 | `.cursor/skills/ai-code-constant/SKILL.md` 第 14 行：「**默认**公共定义为 `src/constants/common.js`，由 `src/constants/index.js` 导出」 | 本仓库不存在 `src/constants/`（已核实 `Test-Path` = False），枚举实际位于模块级 `constants.js`。该表述位于受控技能内，profile 无法覆盖措辞，Agent 会顺手新建该目录，凭空造出第二套常量归属 |
| 2 | mock 指引与本项目注册机制不通 | `.cursor/rules/ai-code.mdc` 第 32 行：「使用独立的 `mock.js`…后续可通过替换 `import` 接入真实 API」 | 本项目 mock 由 `src/mock/index.js` 第 4-7 行 `require.context('./api')` 收集后以 `Mock.mock(new RegExp(url), method, …)` 全局拦截注册；照 ai-code 写法产出的文件不会被注册，假数据不生效。受控规则通篇未提 Mock.js 模板，也无「API 与 mock 成对」的落位约定 |
| 3 | 常量扫描的别名前置条件无法满足 | `.ai-code/README.md` 第 69 行：「默认按所选语言寻找 jsconfig.json 或 tsconfig.json 解析别名…未声明的构建工具别名不能自动猜测」 | 本项目别名只定义在 `rsbuild.config.js` 第 51-54 行（`@` → `src`、`~` → 根目录），仓库无 `jsconfig.json` / `tsconfig.json` → 即使配置 `constants` 也只会得到 `incomplete`；README 第 71 行明确 `incomplete` ≠ 通过 |
| 4 | 用 Vue 3 的 SFC 编译器解析 Vue 2 代码，且扫描面覆盖不到本项目主要逻辑载体 | 工具依赖 `@vue/compiler-sfc@3.5.25`（精确锁版本、自带 `node_modules`）；`.ai-code/README.md` 第 71 行「外置 Vue 脚本、模板和预处理模板不在当前扫描范围内」 | 本项目大量逻辑位于外置 `logic.js` / `columns.js` / `constants.js`，页面模板内联 → 常量扫描对本项目基本无产出。`content/templates/constants/vue2-js` 目录确实存在（已核实），但 README 第 73 行说明 init/sync 不会自动接入，仅可复制示例 |
| 5 | 质量门禁当前空转，且没有可用升级路径 | `config.json` 第 14-19 行四项全 `null`；实测 `npm run ai:check` 输出 `lint: missing / typecheck: not_applicable / test: missing / build: missing / constants: not_configured`；README 第 52 行「enforce：JS 必须有 lint 和 build」 | 只能停在 `observe`；切 `enforce` 必然失败。而 observe 模式下「已有检查失败、受控内容漂移、扫描未完成」仍会阻断，等于在交付链路上埋了一个失败面 |
| 6 | 技能集按需性差，不适用的技能仍进入阅读清单 | `.cursor/skills/ai-code-i18n/SKILL.md` 整份约束 `$t` / 语言切换 / 翻译键；`.cursor/skills/ai-code-constant/SKILL.md` 第 38 行反向引用 i18n 的翻译键规则 | 本项目无国际化。`--scenarios` 只控制 admin / mobile-h5，无法裁剪 vue 通用技能集（9 份中 `i18n` / `state` / `route` / `component` / `logic` 多为装了不用），且会把不适用的表述带进常量流程 |

---

## P2 · 安装引入的工程配置问题

1. **依赖放错层**：`git diff package.json` 确认 `"@agent-xy/ai-code": "^0.7.0"` 被加进 `dependencies`（连同 `ai:check` 脚本）。纯开发期工具进入运行时依赖口径，而本项目每次启动前都跑 `deps-check`。
2. **向根 `node_modules` 提升 `eslint@8.57.1`**：实测根目录 eslint 版本与工具依赖完全一致，而项目 devDependencies 不含任何 eslint。副作用是「`npx eslint` 突然可解析但仓库无配置」；v8 属 legacy config 体系，与当前 flat config 方向不同。工具自身又在 README 第 49 行声明「不安装或改写项目 ESLint」→ 这块能力交付的是半成品。
3. **Node 版本要求直接对撞**：工具要求 ≥18，项目 `bk-magic-vue@2.5.9` 声明 `node <= 16.14`，`npm i` 已打印 `EBADENGINE`。工具明确「不改写项目 Node 安排」（README 第 49 行）→ 双版本策略必须显式落到文档，否则按项目老版本 Node 装依赖会卡住。
4. **体积与依赖锁死偏重**：包体 3.1 MB，自带 `@vue` / `magic-string` / `estree-walker`，外加 `@inquirer/prompts`、`typescript@5.9.3`（JS 项目用不到）、`vue-eslint-parser`；`@vue/compiler-sfc` 精确锁版本无升级弹性。产出物是 11 个 markdown。
5. **非 UTF-8 代码页下中文输出乱码**：`npm run ai:check` 与 `--help` 输出 `鎶€鏈爤` / `椤圭洰鍦烘櫙`，影响 CI 日志与人工核对（规避方式为 `--json`）。
6. **入库范围与手改规则未决**：`.gitignore` 只忽略 `.cursor/.local-token`、`.perm-tree-*`，`.ai-code/`（config.json + profile.md + README.md）当前未跟踪会入库；同时受控文件被 SHA256 锁在 `config.json` 第 20-32 行，任何人手改 `.mdc` / `SKILL.md` 都会在 sync/check 被判漂移并阻断 —— 与本项目「规则文件按需手工迭代」的维护模型对立方，需团队共识。

---

## 修复清单

### 第 0 步（决策，后续全部依赖它）

- **A 保留**：向 `AGENTS.md` 增补「AI Code 接入与优先级」小节 ——
  ① 把 `.ai-code/profile.md` 与 9 份 `ai-code-*` 技能登记进规则索引（解 P0-2）；
  ② 声明「`ai-code-*` 为通用补充，不得替代本仓库 `.cursor/rules/*.mdc` 与项目 Skill；`ai-code.mdc` 第 13 行的排他表述对本仓库不适用」（解 P0-1）。
- **B 回退**：`npm un @agent-xy/ai-code`，删除 `.ai-code/`、`.cursor/rules/ai-code.mdc`、`.cursor/skills/ai-code-*`。
  理由：P0 两条均为受控文件内写死的行为，无法就地修正，只能外部仲裁或移除。

### 第 1 步（选 A 后必做）

- 在 profile 中显式覆盖 P1-1：声明本仓库无公共常量入口，枚举位于模块 `constants.js`。
- 在 profile 中补 mock 节，替换 P1-2 的机制描述：`src/mock/api/<模块>.js` + `src/mock/index.js` 注册 + Mock.js 模板，并与 `src/services/api/<模块>.js` 成对。
- 新增 `jsconfig.json`（`@/*` → `src/*`、`~/*` → `./*`），解 P1-3；无此文件则常量扫描永远 `incomplete`。
- 明确放弃 `enforce`（P1-5），或补一个只读 `lint` 脚本（不带 `--fix`，符合 README 第 54 行「单次退出且不改写源码」要求）后再显式写入 `config.json` 的 `scripts`。

### 第 2 步（工程配置）

- `@agent-xy/ai-code` 移入 `devDependencies`（P2-1）。
- `scripts` 保持 `null` 时，不在文档里把 `ai:check` 宣传为质量门禁（当前为空操作）。
- 确定 `.ai-code/` 入库范围，并就「受控文件禁止手改 vs 规则手工迭代」达成团队共识（P2-6）。
- 文档写清 Node 分工：跑 ai-code 用 18+，跑项目构建用 16.14（P2-3）。
