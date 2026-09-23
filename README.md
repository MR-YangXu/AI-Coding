# AI Code

`@agent-xy/ai-code` 是面向 Vue 3 + Vite + TypeScript 的 AI 编码规范 npm 包。V1 为 Cursor 提供一份短规则和七个按任务加载的技能，并把项目现有质量检查统一为 `npm run ai:check`。源码与项目配置始终是业务事实来源，不需要填写任务档案或维护第二份项目事实。

## 一键接入

Node.js 18+，项目需要已有 `package.json` 及 Vue 3、Vite、TypeScript 依赖。执行：

```bash
npx @agent-xy/ai-code init
npm run ai:check
```

`init` 根据项目的 `packageManager` 字段或锁文件选择 npm、pnpm 或 yarn，安装确切版本的开发依赖，生成 `.cursor/rules/ai-code.mdc`、`.cursor/skills/ai-code-*/SKILL.md`、`.ai-code/config.json` 并添加 `ai:check` 脚本。对已经安装包的项目不会重复安装；离线验收可使用 `init --no-install`，之后仍需手动安装依赖才能运行 `npm run ai:check`。已有同名用户文件或脚本不会被覆盖。

Cursor 的基础规则默认加载；页面、组件、Hook、API、共享状态、路由和国际化技能按任务加载。包中的 `content/` 是工具无关的唯一规范来源；`src/adapters/` 用于工具投影，后续可以在不改项目质量命令的情况下增加 Codex 适配器。当前未提供 Codex 投影。

## 质量检查

初始化会识别已存在的 `lint`、`typecheck`、`test`、`build` 等别名，写入 `.ai-code/config.json` 的 `scripts` 映射。不会安装或重写 ESLint、Vitest、Vite、TypeScript 的配置。`--fix` 与交互式测试脚本不作为自动检查；可在项目中新增非交互、非修改型脚本后更新映射。

```bash
npx @agent-xy/ai-code status
npm run ai:check -- --json
npx @agent-xy/ai-code sync
```

- `status` 仅读取项目，不运行检查。`check` 执行配置的质量命令并检查受控文件与包版本。
- 默认 `observe`（观察）模式：缺失检查显示 `missing`，不阻断；已有命令失败、规则漂移和无效配置仍阻断。
- 修改 `.ai-code/config.json` 的 `mode` 为 `enforce`（阻断）后，缺少 lint、typecheck 或 build 也会阻断；test 暂不列为所有项目的强制项。
- npm 包升级后执行 `npx @agent-xy/ai-code sync`；有手工改动的受控文件会拒绝覆盖。团队定制内容请放入其他 Cursor 文件。`status` 和 `check` 支持 `--json`。

建议先在项目内执行 `status` 了解缺口，再为当前项目补齐合适的检查脚本。规范无法独自验证业务需求；关键交互还需要对应测试与人工代码审查。

## Jenkins 共享流水线

公司平台在项目安装依赖后检测 `package.json` 是否声明 `ai:check`，有则执行 `npm run ai:check`（pnpm/yarn 使用对应的 `run ai:check`）。无需写入每个项目的 Jenkinsfile。流水线以退出码判定结果；观察模式的 `missing` 是能力缺口，不得展示成通过。若需要纯 JSON 报告，可在使用 npm 或 pnpm 的项目直接执行 `./node_modules/.bin/ai-code check --json`，或使用包管理器对应的命令入口。`npm run ai:check -- --json` 会带 npm 横幅，不能把整段输出直接解析为 JSON。

## 开发与发布

```bash
npm test
npm pack --dry-run
```

包以 MIT 授权，通过 `publishConfig` 发布到 npm 公共仓库。发布前需确认 npm 账号具有 `@agent` scope 的发布权限；本仓库的构建与测试不会自动发布。GitHub 仓库用于维护包源码，公司项目继续托管在 GitLab。
