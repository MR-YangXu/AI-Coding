---
name: ai-code-hook
description: 用于创建或修改 Vue 3 composable、Hook 及其副作用生命周期。
---

# Hook

先看现有 composable 与调用方。只有独立、可复用的状态或复杂流程才抽取 `useXxx`；暴露最小接口。为请求、监听器、定时器和观察器处理失效、竞态、失败及卸载清理；测试重复调用和页面离开场景。
