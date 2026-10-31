# 后台源码工具集：react-ts

## 添加与归属

```bash
npx @agent-xy/ai-code add admin
npx @agent-xy/ai-code add admin --only NewTable,usePageList --dry-run --json
```

先 init 选择技术栈。源码默认复制到 src/components、src/hooks、src/utils、src/types。支持 --source-dir 指定源码根目录。
只添加缺少的能力，先核对项目已有实现和 profile。usePageList/useSelectOptions/useAsyncListAction 是命令里的能力标识；Vue 2 实际导出 createPageList/createSelectOptions/createAsyncListAction。

冲突可交互选择替换、不复制、重命名；非交互需 --conflict replace|skip|rename。跳过一个不兼容依赖会连带跳过消费者；内容完全一致可直接复用。重命名会更新本批源码相对导入，不改已有业务调用。文件归项目维护，sync 不更新或删除；需要升级时先对比，再明确选择替换或重命名。

## 依赖与入口

支持基线：React / React DOM 18.x、Ant Design 5.x、Day.js 1.x、Sass 1.x。依赖声明不等于已安装或已兼容，命令只报告缺失项和安装命令，不更改项目构建、入口、package.json 或锁文件。使用本项目已有构建工具；Vue 单文件组件需要对应编译插件，React 使用自动 JSX 运行时（例如 TypeScript 的 `jsx: "react-jsx"` 或 Vite 的 React 插件）。TS 项目使用现有类型检查。

在项目样式入口导入一次：

```js
import 'antd/dist/reset.css';
```

组件自身显式导入 UI 组件；无需配置自动导入插件。复制后的工具集内部使用相对路径。调用者按真实位置导入；重命名后以命令结果为准。

## 最小列表页

[AdminList.tsx](examples/AdminList.tsx) 是组合示例，命令不会创建业务页面或接口。示例接收 fetchList 函数；调用项目既有请求层并返回 { list, total }，不自动兼容 res.data 或猜测后端响应。不要把演示数组用于请求失败回退。

搜索字段使用 propName、labelName、itemType（text/selectOne/date/dateRange/custom）、optionsArr；buildFormItems 默认 selectOne。日期默认输出格式化字符串；Vue 2 的日期格式为 yyyy-MM-dd，其他框架为 YYYY-MM-DD。选项 value 保留数字、字符串、布尔原值；Ant Design Select 只接受字符串/数字，React 搜索选项在 UI 边界将布尔值编码并在提交前恢复。

表格列使用 prop、label、showColumn、render；buildColumns 支持默认、enum、nested、clip。0、false、空字符串不是缺失值。formatter 按文本展示，富内容用 render/插槽；不直接插入 HTML。复制操作使用 Clipboard API，需要安全上下文，失败通过 onCopyError 或提示反馈。

pageParams 为 { currentPage, pageSize, pageSizes, total }；列表查询使用 page/page_size。实际接口不同则在 fetchList 中映射；total 和 page_sizes 不发送，其他业务字段不删除。onSubmit 保存条件并回第一页；分页继续使用已提交条件。输入草稿不会在分页时丢失；reset 深拷贝恢复初始查询并移除后来新增的键。getData 刷新；结果页码超界时补请求有效页。

查询失败通过 error/onError 暴露，getData 返回 undefined；旧响应、旧失败与卸载后的响应不会更新列表。useSelectOptions/createSelectOptions 的当前请求失败会拒绝，调用处处理；useAsyncListAction/createAsyncListAction 的 exec 同样保留拒绝，支持第三个参数操作键，重复键共用进行中的请求。

## 搜索与表格的职责边界

- `NewSearchForm/index` 组合字段和操作区，负责校验后提交与事件输出；`SearchField.tsx + fieldBinding.ts` 负责单个字段的控件、校验配置和 UI 值适配。`useSearchForm.ts` 管理 Ant Design Form 的同步与重置；Form store（表单存储）是唯一草稿来源。
- `renderField(item)` 返回支持 `value/onChange` 的受控控件，由 Form.Item 注入数据和事件。
- 搜索字段配置中的 `propName` 是模型的顶层键。父级分页等字段变化只同步该字段，保留未提交输入；显式变更某个条件会更新对应草稿。提交包含未注册为表单项的查询字段，使用深拷贝快照；重置恢复首次挂载时的初值并清理后来添加的键。需要切换整套初始查询时，由父级通过组件 key 明确重新挂载。
- `NewTable` 接收行、列和 pageParams，向父级报告选择、排序及分页，不发请求或缓存服务端数据。`columns.ts` 集中适配 Ant Design 列配置，优先使用 render，再使用 formatter 或默认文本；入口管理选择事件和分页。`selectedRowKeys` 传入后由父级控制，回调只请求更新，父级确认后才改变勾选。
- 两个组件的静态样式各自位于 `style.scss`，由入口自动引入，按组件结构组织 SCSS 嵌套与局部间距变量，使用 `ai-code-search-form` / `ai-code-table` 命名空间。动态宽度由字段的 `width` 配置传入 CSS 变量；颜色、字体及控件状态沿用项目 UI 主题，不覆盖库内部的表格尺寸计算。单独复制组件时保留整个组件目录，并安装 Dart Sass（`sass`）；Vite 可直接编译，Webpack 项目沿用与现有构建版本兼容的 `sass-loader`。

## 弹窗和抽屉

组件式 BaseDialog/BaseDrawer 的确认逻辑传 onConfirm，返回 Promise；成功关闭，失败保留输入并触发错误回调。关闭期间可清理资源，避免将 confirm 事件当成等待异步提交的入口。

```jsx
import { App, ConfigProvider } from 'antd';
import { DialogProvider, useDialog } from './components/Dialog';
// 根布局：<ConfigProvider><App><DialogProvider>{children}</DialogProvider></App></ConfigProvider>
// 组件内：
const { Dialog, showDialog } = useDialog();
const confirmed = await Dialog.confirm('确认执行此操作？');
const panel = showDialog({ title: '详情', content: '内容' });
panel.update({ title: '更新标题' });
panel.close();
```

组件通过 open/onOpenChange 控制可见性，错误使用 onError；BaseDrawer 支持相同提交契约。Provider 保留 React Context（上下文），卸载后销毁弹窗并将未完成的确认结果置为 false。useAsyncListAction 放在 Ant Design 的 App 内使用，继承消息主题。

三框架的 Dialog.alert 返回实例；Dialog.confirm 返回 Promise<boolean>，确认 true，取消/关闭/卸载 false；Dialog.component 接收组件及属性，返回实例；showDialog 返回 close/update。首版不提供函数式抽屉。

## 与原始 Vue 3 实现的差异

Vue 3 组件来源于 matrixflow-front 的 BaseCard、NewSearchForm、NewTable、Dialog、Drawer，保留通用调用方式，搜索与表格按字段、草稿、单元格职责重构；移除了固定账单金额编辑、业务日期清理、业务默认行键、项目图片与全局变量。通用列显隐使用 showColumnSettings，行内编辑由列插槽承接；特殊业务搜索项由 custom 插槽承接。React/Vue 2 覆盖标准列表页，不要求复制旧组件的所有参数。

复制完成后按命令给出的真实路径补充 .ai-code/profile.md 的推荐入口、用途、适用范围与参考页面。未安装项不要登记为可用。工具不会自动改 profile。
