# AI Code V1 设计

`@agent-xy/ai-code` 面向 Vue 3 + Vite + TypeScript 项目，首版只适配 Cursor；公共规范与适配器分离，后续可接入 Codex。包发布到公共 npm，业务项目的 Jenkins 共享流水线执行 `npm run ai:check`。

## 接入

`npx @agent-xy/ai-code init` 验证技术栈、发现已有 lint/typecheck/test/build 脚本，生成 `.ai-code/config.json`、一份默认 Cursor 规则、按需加载的 Vue Skills，并添加 npm 开发依赖和 `ai:check`。默认安装依赖；离线验证可用 `--no-install`。初始化不得覆盖已有非本包文件，也不接管项目 ESLint、Vite、Vitest 配置。重复执行幂等，`sync` 更新受控文件，检测到手工修改时停止。

## 规则和质量

`content/` 是工具无关的规则与技能唯一来源；`src/adapters/cursor.mjs` 将其投影到项目 `.cursor/`。Core 默认加载；页面、组件、Hook、API、状态、路由、国际化技能仅在相关任务加载。代码和项目配置是项目事实来源，不维护第二份需要人工同步的 Profile。

观察模式中，缺失脚本仅告警，已存在脚本失败、配置无效和受控文件漂移均阻断。阻断模式还要求 lint、typecheck、build 存在。检查报告可输出 JSON；缺失项不可报为通过。`status` 只读，`check` 运行项目脚本。

## 验收

测试覆盖合法与非法项目、幂等、冲突、观察与阻断、失败命令、漂移、同步和 npm 包安装。V1 不发布到 npm、不修改远程仓库或 Jenkins 配置。
