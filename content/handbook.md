# AI Code 使用说明

`@agent-xy/ai-code` 为 Vue 3 + Vite + TypeScript 项目提供 Cursor 编码规则：一份基础规则、八个通用技能，以及按项目选择的后台或移动端场景。项目已有的 lint、类型检查和构建仍由 `npm run ai:check` 统一执行。

这份文件由安装包维护，给人看，不是给 AI 的编码规则。`init` 时写入，`sync` 时覆盖。不要手改；改过之后 `sync` 会拒绝更新全部受控文件。团队约定写在 `.ai-code/profile.md`。

## 项目里有什么

| 路径 | 作用 | 升级时 |
| --- | --- | --- |
| `.cursor/rules/ai-code.mdc` | 每次对话都会加载的基础规则 | `sync` 覆盖 |
| `.cursor/skills/ai-code-*/SKILL.md` | 页面、组件、常量、Hook、API、状态、路由、国际化，以及已选场景 | `sync` 覆盖 |
| `.ai-code/config.json` | 场景选择、质量命令映射、受控文件记录 | 更新版本和受控记录，保留已有 `mode` 与命令映射 |
| `.ai-code/profile.md` | 本仓库的推荐组件、参考页、目录和常量入口 | 不覆盖 |
| `.ai-code/README.md` | 本说明 | `sync` 覆盖 |

基础规则默认加载。其余技能按本次改动读取一份。AI 不读取本文件。

## 日常使用

先看档案里的推荐入口；没有档案时，只看一个相邻页面。然后复用已有组件和请求，只改本次范围，最后对改动文件做 lint。

放弃已有能力时说明：

```text
需求：当前交互必须满足什么。
候选：组件或 Hook 的源码位置及已有调用方。
能力与缺口：哪些已满足，哪些参数、分支或事件不匹配。
扩展评估：配置、插槽或最小扩展是否足够，会影响哪些调用方。
决定：直接复用、兼容扩展或私有实现，以及对应验证项。
```

交付时写明复用了哪一页、哪一个组件，以及 lint 的实际结果。接口还没联调时单独标明，不要写成已经完成。

## 场景

| 选择 | 得到什么 |
| --- | --- |
| 不接入 | 基础规则和八个通用技能 |
| `admin` | 再加管理后台：搜索、表格、批量操作、权限、编辑流程 |
| `mobile-h5` | 再加移动端：触摸、安全区、软键盘、滚动、弱网 |
| 两个都选 | 按当前页面决定用哪一个，不把后台规则套到普通 H5 |

有搜索、列表或登录，不等于这是后台页。

```bash
npx @agent-xy/ai-code sync --scenarios admin,mobile-h5
npx @agent-xy/ai-code sync --scenarios none
npx @agent-xy/ai-code status
```

`--scenarios` 替换完整选择。省略该参数时，`sync` 沿用 `.ai-code/config.json` 里已保存的场景。

## 项目档案

`.ai-code/profile.md` 记录本仓库的推荐组件、参考页面、筛选列表目录和常量入口。模板在 `node_modules/@agent-xy/ai-code/content/templates/`。

首次接入可以指定：

```bash
npx @agent-xy/ai-code init --scenarios admin --profile admin
```

已有项目、档案还不存在时：

```bash
mkdir -p .ai-code
cp -n node_modules/@agent-xy/ai-code/content/templates/profile.admin.md .ai-code/profile.md
```

后台和 H5 分别换成 `profile.admin.md`、`profile.mobile-h5.md`。文件已存在时不要覆盖。把「待填写」换成核实过的路径，删掉用不到的行。未填写的项不算约定。

新建页按档案里的目录和常量入口。档案改过之后，新建页以改后的为准。已有页面和已有常量文件保持原样，不按档案迁移。

## 升级

```bash
npm install @agent-xy/ai-code@新版本
npx @agent-xy/ai-code sync
```

`sync` 更新规则、技能和本说明，不改档案。包里的模板有新增段落时，打开 `node_modules/@agent-xy/ai-code/content/templates/` 里对应模板，把新段落合并进 `.ai-code/profile.md`，保留本仓库已经改过的目录和路径。

受控文件被手改过时，`sync` 会整次拒绝。先把约定挪到档案，再重新执行 `sync`。若 `.ai-code/README.md` 是团队自己写的同名文件，先移走再同步。

## 质量检查

```bash
npx @agent-xy/ai-code status
npm run ai:check -- --json
```

`status` 只看场景和受控文件是否一致，不跑检查。`check` 还会执行 `config.json` 里映射的 lint、类型检查、测试和构建。

默认是观察模式：缺检查显示 `missing`，不阻断；已有命令失败或规则被改过仍会失败。把 `config.json` 的 `mode` 改成 `enforce` 后，缺少 lint、类型检查或构建也会阻断。

`sync` 不会重新发现后来新增的检查脚本。补了 `typecheck` 之后，要在 `config.json` 的 `scripts.typecheck` 里写成该脚本名。

常量检查在配置了 `constants` 之后出现在 `checks.constants`。同一业务码值只维护一份：公共定义默认是 `src/constants/common.ts`，由 `src/constants/index.ts` 导出；业务定义放在所属模块的 `constants.ts`。档案写了不同路径时，新增定义以档案为准。示例在 `node_modules/@agent-xy/ai-code/content/templates/constants/`，复制前换成自己的路径，不要覆盖已有定义。
