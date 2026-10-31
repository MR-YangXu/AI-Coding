---
name: nestjs-engineering
description: 在 NestJS 项目中设计、实现、排查或审查模块与依赖注入、HTTP/GraphQL 接口、数据库、认证权限、文件上传、异步任务、实时通信及部署。适用于 NestJS 后端和与其联调的前端；纯前端任务、其他后端框架及仅浏览课程时不自动使用。
---

# NestJS 工程开发

把任务落实为可验证的接口、数据变更或服务行为。基于《Nest 通关秘籍》200 章的知识主题整理，具体规则包含独立的工程补充；来源与阅读边界见 [sources.md](references/sources.md)。

## 先定位本次任务

1. 读取项目约定、依赖版本、启动入口及直接调用方。确认 HTTP 适配器、ORM（对象关系映射）、认证方式、部署拓扑；沿用已选技术，不因课程使用某个库而替换项目方案。
2. 写清输入、输出、权限、状态变化及失败行为。修改已有接口时先看消费者；没有依据的字段、权限和第三方接口标为待确认，不编造。
3. 从现有模块及注入关系查找复用入口。只读下表中与任务有关的参考文件，不把全部章节或全部主题装入上下文。

| 本次触发情境 | 按需读取 |
| --- | --- |
| 模块、Provider（依赖提供者）、装饰器、生命周期、请求链路、调试 | [architecture.md](references/architecture.md) |
| DTO（数据传输对象）、参数验证、错误响应、Swagger、序列化、GraphQL、国际化 | [contracts.md](references/contracts.md) |
| SQL、TypeORM、Prisma、MongoDB、迁移、Redis、关系和统计 | [data.md](references/data.md) |
| 密码、验证码、JWT（签名令牌）、Session（会话）、权限、OAuth、扫码登录 | [auth.md](references/auth.md) |
| 文件上传下载、OSS（对象存储）、分片、图片、Excel/PPT、数据采集 | [files.md](references/files.md) |
| 定时任务、事件、SSE（服务端事件推送）、WebSocket、消息队列、微服务 | [async.md](references/async.md) |
| 配置、日志、Docker、Nginx、发布、运行监控 | [operations.md](references/operations.md) |
| 图书、会议室、考试、聊天项目；React 联调与完整业务验收 | [delivery.md](references/delivery.md) |

## 实施顺序与决策

- 先确定模块边界、持久化约束与接口契约，再实现 Service（业务服务）及 Controller/Resolver/Gateway（不同协议入口）。入口负责协议适配，业务规则应能在对应服务层测试。
- 共享规则按作用位置选择 Guard（守卫）、Pipe（管道）、Interceptor（拦截器）或 Filter（异常过滤器）。需要依赖注入的全局扩展交给模块注册，避免手动实例化导致依赖缺失。
- 实现当前任务涉及的失败与并发行为：写入是否原子、重试是否重复生效、旧响应是否污染新状态、连接和订阅是否释放。不要为简单任务预建通用框架。
- 课程中的文件数据库、手写协议、固定配置、演示初始化接口是教学案例。生产方案按本项目的持久化、授权和运维要求判断，示例名称不能替代业务契约。
- 依赖 API 以安装版本及对应文档为准。没有需求和验证依据时，不自动升级依赖、切换适配器、改用微服务或增加缓存。

## 验证与交付

根据改动选择必要检查：类型和构建、业务单元测试、接口集成测试、数据约束与并发测试、前后端联调、部署验证。已有质量命令优先复用。

验证外部可见结果：非法输入是否拒绝、无权操作是否阻止、失败写入是否回滚、重复请求是否符合约定、连接关闭后是否释放资源。只直接调用 Service 或使用 REPL（交互式运行环境）不能证明 Guard/Pipe/Interceptor 生效。

交付时列出实际改动与验证结果；区分已执行、未执行及环境阻碍。不要因为课程写了“测试成功”而声称当前项目通过测试。审查任务只报告问题位置、触发条件和影响，除非用户要求修复。

## 按章节回查

需要回溯课程出处或指定某一章时，按编号读取对应索引。每章只有简短原创要点和原文链接，不是原文归档，也不是完整教学步骤。

- [第 001—050 章](references/chapters-001-050.md)：基础、图书项目、上传、日志、Docker、SQL。
- [第 051—100 章](references/chapters-051-100.md)：数据库、认证、部署、验证、后台能力。
- [第 101—150 章](references/chapters-101-150.md)：工具能力、会议室项目、微服务、Prisma。
- [第 151—200 章](references/chapters-151-200.md)：数据应用、考试、聊天、MongoDB、GraphQL、源码调试。
