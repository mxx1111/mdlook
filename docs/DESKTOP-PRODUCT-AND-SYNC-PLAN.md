# mdlook 写作体验、账户与多端同步规划

> 2026-07-26 收口版：账户、用户配置、Cloud Document、AI 凭据和私有
> Skill 均以 blog-system 为统一身份源；本文同时记录已落地边界和后续增强项。

## 1. 产品与技术结论

mdlook 不是两套独立产品。网页端与 macOS App 共用 `apps/web` 的 Vue 前端；macOS App 由 `apps/web/src-tauri` 的 Tauri 2 外壳增加本地文件、文件夹、原生菜单和剪贴板能力。手机使用同一套 Web 应用，但交互需要按窄屏重新编排，不能只把桌面界面等比缩小。

账户和用户配置采用最终确认的方案：

- App 内用户名密码注册登录，不依赖 GitHub 跳转，也不接入邮箱验证码服务。
- 账户 API 放在现有 blog Spring Boot 后端，数据写入其已连接的 `blog-new` MySQL。
- 只新建 `mdlook_*` 独立表，不复用 blog 管理员、游戏用户或其可逆密码逻辑。
- 密码只保存 BCrypt 等自适应单向哈希；登录态由独立的 mdlook Sa-Token 逻辑管理。
- 现有 Cloudflare Workers + D1 账户/同步代码暂不作为生产身份源，避免一名用户同时存在两套身份。
- blog-system 账户基址与原 md-api 能力基址必须分开配置；图床、微信图片转换、主题、分享和旧文档同步不能误发到账户后端。
- 两个后端的令牌不可互传：blog Sa-Token 不能作为旧 md-api 的 Bearer JWT。正式文档同步启用前必须迁移到统一身份源或增加可信令牌交换，不能只打开前端开关。
- 主题、字号和排版偏好等非敏感 User Configuration 可以同步；编辑器模式、预览设备等 Device Preference 留在本机。
- DeepSeek 等 AI Key 不进入普通配置 JSON：使用每用户独立的 Secret Configuration 表，以 AES-256-GCM 加密落库，主密钥仅来自服务端环境变量；前端只看到掩码，AI 请求由后端代理发出。
- 公众号 AppSecret、图床 Token 和本机路径仍不进入用户配置同步；对应能力必须使用自托管后端，并在界面明确数据流向。
- 私有文风 Skill 作为用户拥有的 bundle 保存；正文和样本文件加密落库，网页公开构建只包含管理界面，不包含用户语料。

“多端”采用本地优先：未登录草稿进入 guest 工作区；登录后切换到
`user:<id>` 工作区并使用稳定 UUID、服务端版本号、离线 outbox 和冲突副本。
客户端时间戳不能直接覆盖服务端版本。

## 2. 已核查的问题

### P0 正确性问题

1. 所见即所得编辑器曾只监听 `currentPostId`。桌面端切本地文件时复用了同一个 Post，导致标题和侧栏变化而正文停留在旧文件。
2. 自动排版、复制和部分导出曾只从 CodeMirror 取值。在 Vditor 模式下会读到隐藏或已经卸载的编辑器，所以“排版没有作用”或作用在旧内容上。
3. 切文件时未刷新的自动保存定时器可能跨文件执行，带来丢失或写错目标的风险。
4. 编辑器即时内容若不先写回统一状态，文件切换前的缓存仍可能保存旧正文。

### 体验与架构问题

1. 原侧栏、编辑正文和预览字号偏小，长时间写作费眼。
2. 桌面大屏预览缺少稳定阅读宽度；公众号手机宽度与普通预览的差别不清楚。
3. DeepSeek 已可自配 Key、端点、模型、温度、Token 和提示词，但配置入口分散，密钥保存在 Web Storage，不适合长期桌面产品。
4. 现有同步是客户端时间戳 LWW，两台设备并发编辑可能静默覆盖。
5. 同步游标只在运行内存中，重启会重复拉取。
6. GitHub OAuth 的可达性和普通用户体验不足，不能承担唯一登录入口。
7. 手机窄屏下，桌面顶栏、左右分栏和固定高度弹窗会产生遮挡、横向溢出或可点区域过小。
8. 所见即所得工具栏的提示默认向上展开，会被编辑区边界裁掉，只剩提示框边缘和箭头。

## 3. 核心用户路径

### macOS

新建临时草稿或打开工作区/文件 → 写作 → AI/基础排版 → 双栏或手机宽度预览 → 检查 → 复制到公众号 → 保存。新建不先询问文件夹；第一次保存时才选择路径。

### 桌面 Web

登录或离线使用 → 新建/打开浏览器草稿 → 写作与排版 → 预览 → 复制 → 可选同步。

### 手机 Web

登录 → 新建或打开 Cloud Document/浏览器草稿 → 单栏写作 → 切换全屏预览 → 排版/检查 → 复制。手机端不显示本机工作区文件树，也不伪装成拥有 Tauri 文件系统能力。

登录和同步是增值能力，不应阻断未登录用户的基础写作、预览和复制。

## 4. 分阶段实施

### Phase 0：可信写作

- CodeMirror 与 Vditor 通过统一 Editor Adapter 提供读取、写入、聚焦和销毁能力。
- 新建立即进入可恢复的无标题草稿，不打开文件选择器；首次保存才执行 Save As，取消保存不丢草稿。
- 文件切换、排版、复制、检查、导出和保存只读取“当前活动编辑器”。
- 切文件前刷新待保存内容；迟到的异步打开结果不得覆盖最新选择。
- 当前工作区文件不在“最近文件”中重复出现。
- 侧栏正文不小于 14px，编辑正文约 17px，并优化行高、留白、纸张层次和阅读宽度。
- 工具栏悬浮提示始终在可视区域内完整显示，不能被编辑区边界裁切。

验收：连续快速切换 10 个内容明显不同的文件，标题、正文、选中项和保存路径始终一致；源码和所见即所得两种模式排版均修改当前文件；新建草稿可直接输入，取消首次保存或退出重开后内容仍在本机缓存。

### Phase 1：DeepSeek 自配置产品化

- 将 DeepSeek 配置收敛为 Formatting Profile：端点、模型、温度、最大 Token、提示词和连接测试。
- API Key 属于 Secret Configuration：登录后由后端加密保存并代理 AI 请求；
  Web/macOS 不再默认把新 Key 长期写入 localStorage。
- 发现旧版 `openai_key_*` 时只提示迁移；必须由用户确认后上传，成功后再清除本地副本，禁止静默迁移。
- 只在普通 User Configuration 中同步模型、提示词、排版风格等非敏感字段。
- 排版前保存 Revision，结果提供差异、接受、撤销和另存副本。
- 长文显示进度，支持取消、超时和可理解的错误提示。

验收：断网时基础排版可用；错误 Key、限流、超时和空结果都有明确反馈；AI 排版不会写入未选中的文件。

### Phase 2：账户与 User Configuration

- 用户名 4–32 个字符，标准化后唯一；密码 8–72 个字符。
- 注册、登录、退出、获取当前用户、登录后修改密码均在 App 内完成。
- 不提供邮箱找回。第一版忘记密码走明确的管理员重置流程，后续绑定验证邮箱或 Passkey 后再开放自助找回。
- User Configuration 采用白名单字段和服务端版本号；服务端拒绝未知字段和 Secret Configuration。
- 客户端本地修改立即生效，登录后拉取云端设置；保存时携带 `version` 做乐观并发控制。
- 大屏账号入口和手机账号入口共用同一状态机，表单错误、加载、成功与退出状态一致。

验收：Web 与 macOS 可以注册、登录、退出和修改密码；A 端改变主题/字号后 B 端登录可得到配置；错误密码不泄露账号是否存在；并发覆盖返回明确冲突。

### Phase 3：Cloud Document 同步 Beta

- Document 使用稳定 ID，本机路径只是设备私有 Binding。
- 每次保存提交 `version`；服务端只在版本匹配时生成下一版本。
- 冲突时保留本地与远端内容，展示差异并允许合并、保留一方或另存副本，禁止静默覆盖。
- 持久化同步游标、outbox、最近成功版本和设备身份，支持离线编辑与恢复。
- 删除使用墓碑和保留期，防止离线设备把已删除文档复活。

验收：Mac A 离线编辑、Web/手机 B 同时编辑后重新联网，不丢失任一版本；用户可见并可解决冲突；退出登录不删除本地文件。

### Phase 4：私有文风 Skill 与创作闭环

- Skill bundle 使用 `slug + version + manifest + files`，每名用户独立拥有。
- 核心规则、参考资料和样本加密保存；列表只返回路径、角色、大小和哈希。
- AI 调用只加载核心规则、与任务相关的参考和最多 1–2 篇样本，避免每次把完整语料塞进上下文。
- “按我的文风润色”先生成差异预览，用户确认后才替换正文，并保留撤销/冲突副本。
- 完成写作 → 文风润色 → 公众号宽度预览 → 发布前检查 → 一键复制的闭环。

### Phase 5：资源与完整个性化

- 同步 Formatting Profile、模板、自定义 CSS 和快捷指令白名单。
- 图片附件使用对象存储和内容哈希去重，本地 `assets/` Binding 与云端资源身份分离。
- 提供配额、设备管理、全部数据导出、注销账户和云端数据删除。
- 评估 PWA 安装、Windows 桌面端和系统分享入口。

## 5. 深模块边界

界面只依赖清晰的账户和设置接口，不自行拼 Token、版本或冲突逻辑：

```ts
interface AccountGateway {
  register: (input: Credentials) => Promise<Session>
  login: (input: Credentials) => Promise<Session>
  me: () => Promise<Account>
  changePassword: (input: PasswordChange) => Promise<void>
  logout: () => Promise<void>
}

interface UserConfigurationGateway {
  load: () => Promise<VersionedUserConfiguration>
  save: (change: UserConfigurationChange) => Promise<VersionedUserConfiguration>
}

interface DocumentSync {
  open: (documentId: string) => Promise<Document>
  save: (change: DocumentChange) => Promise<SaveResult>
  sync: () => Promise<SyncResult>
  resolve: (conflict: ConflictResolution) => Promise<Document>
}

interface SecretConfiguration {
  list: () => Promise<MaskedCredential[]>
  replace: (change: CredentialChange) => Promise<MaskedCredential>
  remove: (change: CredentialDelete) => Promise<void>
}

interface AuthoringAssistant {
  polish: (input: ArticleDraft, options: AuthoringOptions) => AsyncIterable<AuthoringDelta>
  preview: (original: ArticleDraft, candidate: ArticleDraft) => ArticleDiff
}

interface PrivateSkillLibrary {
  list: () => Promise<PrivateSkillMetadata[]>
  import: (bundle: PrivateSkillBundle) => Promise<PrivateSkillMetadata>
  enable: (change: SkillStateChange) => Promise<PrivateSkillMetadata>
}
```

HTTP 是生产 Adapter，IndexedDB 是离线 Adapter。文件系统通过 Binding 接入
Document，不把路径泄漏为云端身份。AI 供应商是外部 Adapter，只能由后端
受控白名单调用；界面不能自行拼接供应商 URL、Token 或解密逻辑。

## 6. MySQL 首期模型

SQL 脚本放在 blog 项目的 `blog/sql`，使用 MySQL 8 可重复执行的 DDL。

### `mdlook_user`

- 账户 ID
- 规范化且唯一的用户名
- BCrypt 密码哈希
- 状态、最后登录时间、创建和更新时间
- 禁止保存明文、可逆密码、DeepSeek Key 或第三方密钥

### `mdlook_user_setting`

- 用户 ID（一名用户一行）
- 白名单配置 JSON
- `version` 乐观锁
- 创建和更新时间

`mdlook_user_setting` 允许同步：

- 主题、主色和代码主题
- 正文字体、字号和标题样式
- 非敏感排版偏好和 Formatting Profile

### `mdlook_ai_credential`

- 用户 ID、供应商白名单值和乐观锁版本
- AES-256-GCM 密文、随机 nonce、认证标签和主密钥版本
- 仅供展示的掩码；任何接口均不得返回明文

### `mdlook_document` / `mdlook_document_change`

- 用户 ID + 稳定文档 UUID 唯一
- 当前标题、正文哈希、版本、服务端时间和删除墓碑
- 单调变更游标用于增量拉取；所有查询必须携带用户 ID

### `mdlook_private_skill` / `mdlook_private_skill_file`

- 用户 ID + slug 唯一，保存版本、manifest、总大小和启用状态
- 文件正文使用与 Secret Configuration 相同的服务端密钥体系加密
- 所有明细查询同时限定 `skill_id` 与 `user_id`

明确不进入上述云端模型：

- 本机文件绝对路径和 Workspace 路径
- 编辑器模式、预览设备宽度等 Device Preference；手机和 Mac 各自保留
- 光标、选区和临时弹窗状态
- 公众号 AppSecret、图床 Token（仍由各自专用能力后端管理）

## 7. 手机端交互要求

- 以 390×844 和 430×932 为基准验收，覆盖 iPhone 安全区。
- 顶栏保持单行且不覆盖正文；次要操作进入“更多”抽屉或底部操作区。
- 手机默认单栏编辑，编辑/预览使用清晰切换，不同时挤压两栏。
- 对话框使用可滚动的近全屏布局，软键盘弹起后仍能提交注册、登录和配置。
- 触控目标建议至少 44×44px；正文输入字号不低于 16px，避免 iOS 自动放大。
- 文件名、同步状态和保存状态必须可见，但长标题不能挤掉主要动作。
- 排版、检查、复制等耗时动作有加载、取消、完成或失败反馈。
- 无网络时保留当前草稿，明确显示“仅本地”；恢复网络后由用户可见地重试。

## 8. 安全与隐私

- 密码使用 BCrypt 等自适应单向哈希，禁止复用项目中的 AES 可逆密码工具。
- 注册、登录和改密做服务端校验、限流和审计；登录失败统一提示。
- Token 可撤销并有过期策略；日志、URL、同步 payload、崩溃报告和导出文件不得包含密码或密钥。
- 设置 API 服务端白名单过滤，不能依赖前端“自觉不上传”。
- AI 主密钥必须显式配置且至少 32 字节；缺失时加密能力 fail-closed，不能回退明文。
- AI 供应商端点为服务端固定白名单，禁止把用户 URL 当代理目标；上游错误正文不得原样回传。
- 私有 Skill 路径必须规范化并阻止 `..`、绝对路径和重复路径；列表接口不返回正文。
- 文档默认私有；开启同步不等于公开分享。
- 正式同步前完成备份恢复、迁移回滚和冲突演练。

## 9. 发布顺序

1. 先执行可重复 SQL，并显式配置可信代理、CORS 和 AI 主密钥。
2. 发布 blog-system 后端，验证账户、配置、文档、密钥和 Skill 的用户隔离。
3. 发布 Web/macOS/手机前端；guest 草稿和基础写作始终可离线使用。
4. 小范围验证密钥迁移、文档冲突副本、文风润色差异确认和多设备同步。
5. 完成备份恢复、主密钥轮换、数据导出/删除演练后，再扩大开放范围。

旧 D1 文档同步不再作为正式身份源；UI 只启用 blog-system 统一身份下的
Cloud Document。
