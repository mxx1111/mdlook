import type { CreateTemplateParams, Template, UpdateTemplateParams } from '@md/shared'
import { v4 as uuidv4 } from 'uuid'
import { addPrefix } from '@/utils'
import { store } from '@/utils/storage'

const BUILTIN_TEMPLATES: Template[] = [
  {
    id: `builtin-product-intro`,
    name: `产品说明`,
    description: `适合发布产品能力、版本更新或功能介绍。`,
    tags: [`产品`, `公众号`],
    createdAt: 1,
    updatedAt: 1,
    content: `# 产品名称

## 一句话介绍

用一句话说明这个产品解决什么问题，适合谁使用。

## 核心能力

- 能力一：
- 能力二：
- 能力三：

## 使用场景

### 场景一

说明用户在什么情况下会用到它。

### 场景二

说明它带来的效率、成本或体验变化。

## 如何开始

1. 第一步：
2. 第二步：
3. 第三步：

## 总结

用 2-3 句话收束价值。`,
  },
  {
    id: `builtin-tech-article`,
    name: `技术文章`,
    description: `适合技术方案、踩坑复盘和实现说明。`,
    tags: [`技术`, `复盘`],
    createdAt: 1,
    updatedAt: 1,
    content: `# 标题

## 背景

说明问题出现的业务背景和技术上下文。

## 目标

- 目标一：
- 目标二：
- 非目标：

## 方案

### 核心思路

说明整体设计。

### 关键实现

\`\`\`ts
// 放一段最关键的代码或伪代码
\`\`\`

## 结果

说明上线后的效果、指标或验证方式。

## 经验

- 经验一：
- 经验二：`,
  },
  {
    id: `builtin-notice`,
    name: `通知公告`,
    description: `适合服务通知、上线通知、活动公告。`,
    tags: [`通知`, `公告`],
    createdAt: 1,
    updatedAt: 1,
    content: `# 通知标题

各位好：

## 事项

简要说明本次通知的核心事项。

## 时间

- 开始时间：
- 结束时间：

## 影响范围

说明涉及的用户、系统、业务或区域。

## 注意事项

1. 注意事项一
2. 注意事项二
3. 注意事项三

如有问题，请联系：`,
  },
  {
    id: `builtin-event-post`,
    name: `活动推文`,
    description: `适合活动预告、报名招募和现场回顾。`,
    tags: [`活动`, `运营`],
    createdAt: 1,
    updatedAt: 1,
    content: `# 活动标题

## 活动亮点

- 亮点一：
- 亮点二：
- 亮点三：

## 活动信息

- 时间：
- 地点：
- 对象：
- 报名方式：

## 活动流程

| 时间 | 内容 |
| --- | --- |
| 14:00 | 签到 |
| 14:30 | 分享 |
| 16:00 | 交流 |

## 报名入口

填写报名方式或二维码提示。`,
  },
  {
    id: `builtin-weekly-report`,
    name: `周报`,
    description: `适合个人、团队或项目周报。`,
    tags: [`周报`, `总结`],
    createdAt: 1,
    updatedAt: 1,
    content: `# 本周周报

## 本周完成

- 事项一：
- 事项二：
- 事项三：

## 关键进展

说明最重要的进展和结果。

## 问题与风险

- 问题一：
- 风险一：

## 下周计划

1. 计划一
2. 计划二
3. 计划三`,
  },
]

/**
 * 模板管理 Store
 * 负责管理 Markdown 模板的增删改查
 */
export const useTemplateStore = defineStore(`template`, () => {
  // ==================== 状态 ====================
  // 模板列表 - 使用响应式存储，自动持久化到 localStorage
  const templates = store.reactive<Template[]>(addPrefix(`templates`), [])

  // ==================== 计算属性 ====================
  // 按创建时间倒序排列的模板列表
  const sortedTemplates = computed(() => {
    return [...templates.value].sort((a, b) => b.createdAt - a.createdAt)
  })

  // 模板总数
  const templateCount = computed(() => templates.value.length)

  // ==================== 方法 ====================
  /**
   * 创建新模板
   */
  function createTemplate(params: CreateTemplateParams): Template {
    const now = Date.now()
    const newTemplate: Template = {
      id: uuidv4(),
      name: params.name,
      content: params.content,
      description: params.description,
      tags: params.tags,
      createdAt: now,
      updatedAt: now,
    }

    templates.value.push(newTemplate)
    toast.success(`模板「${params.name}」创建成功`)
    return newTemplate
  }

  /**
   * 根据 ID 获取模板
   */
  function getTemplateById(id: string): Template | undefined {
    return templates.value.find(t => t.id === id)
  }

  /**
   * 更新模板
   */
  function updateTemplate(id: string, params: UpdateTemplateParams): boolean {
    const index = templates.value.findIndex(t => t.id === id)
    if (index === -1) {
      toast.error(`模板不存在`)
      return false
    }

    templates.value[index] = {
      ...templates.value[index],
      ...params,
      updatedAt: Date.now(),
    }

    toast.success(`模板已更新`)
    return true
  }

  /**
   * 删除模板
   */
  function deleteTemplate(id: string): boolean {
    const index = templates.value.findIndex(t => t.id === id)
    if (index === -1) {
      toast.error(`模板不存在`)
      return false
    }

    const templateName = templates.value[index].name
    templates.value.splice(index, 1)
    toast.success(`模板「${templateName}」已删除`)
    return true
  }

  /**
   * 根据名称搜索模板
   */
  function searchTemplates(keyword: string): Template[] {
    if (!keyword.trim()) {
      return sortedTemplates.value
    }

    const lowerKeyword = keyword.toLowerCase()
    return sortedTemplates.value.filter((template) => {
      return (
        template.name.toLowerCase().includes(lowerKeyword)
        || template.description?.toLowerCase().includes(lowerKeyword)
        || template.tags?.some(tag => tag.toLowerCase().includes(lowerKeyword))
      )
    })
  }

  /**
   * 批量删除模板
   */
  function deleteTemplates(ids: string[]): number {
    let deletedCount = 0
    ids.forEach((id) => {
      const index = templates.value.findIndex(t => t.id === id)
      if (index !== -1) {
        templates.value.splice(index, 1)
        deletedCount++
      }
    })

    if (deletedCount > 0) {
      toast.success(`已删除 ${deletedCount} 个模板`)
    }

    return deletedCount
  }

  /**
   * 清空所有模板
   */
  function clearAllTemplates(): void {
    const count = templates.value.length
    templates.value = []
    toast.success(`已清空所有模板（共 ${count} 个）`)
  }

  /**
   * 安装内置离线模板
   */
  function installBuiltInTemplates(): number {
    let addedCount = 0
    const now = Date.now()

    BUILTIN_TEMPLATES.forEach((template) => {
      const exists = templates.value.some(t => t.id === template.id)
      if (exists)
        return

      templates.value.push({
        ...template,
        createdAt: now,
        updatedAt: now,
      })
      addedCount++
    })

    if (addedCount > 0)
      toast.success(`已添加 ${addedCount} 个内置模板`)
    else
      toast.info(`内置模板已存在`)

    return addedCount
  }

  /**
   * 导出所有模板为 JSON
   */
  function exportTemplates(): string {
    return JSON.stringify(templates.value, null, 2)
  }

  /**
   * 从 JSON 导入模板
   */
  function importTemplates(jsonData: string): boolean {
    try {
      const importedTemplates = JSON.parse(jsonData) as Template[]

      if (!Array.isArray(importedTemplates)) {
        toast.error(`导入失败：数据格式不正确`)
        return false
      }

      // 验证每个模板的必需字段
      const validTemplates = importedTemplates.filter((t) => {
        return t.id && t.name && t.content && t.createdAt && t.updatedAt
      })

      if (validTemplates.length === 0) {
        toast.error(`导入失败：没有有效的模板数据`)
        return false
      }

      // 合并模板（避免 ID 重复）
      validTemplates.forEach((importedTemplate) => {
        const existingIndex = templates.value.findIndex(t => t.id === importedTemplate.id)
        if (existingIndex !== -1) {
          // ID 重复，生成新 ID
          templates.value.push({
            ...importedTemplate,
            id: uuidv4(),
          })
        }
        else {
          templates.value.push(importedTemplate)
        }
      })

      toast.success(`成功导入 ${validTemplates.length} 个模板`)
      return true
    }
    catch (error) {
      console.error(`Import templates failed:`, error)
      toast.error(`导入失败：数据解析错误`)
      return false
    }
  }

  return {
    // 状态
    templates,

    // 计算属性
    sortedTemplates,
    templateCount,

    // 方法
    createTemplate,
    getTemplateById,
    updateTemplate,
    deleteTemplate,
    searchTemplates,
    deleteTemplates,
    clearAllTemplates,
    installBuiltInTemplates,
    exportTemplates,
    importTemplates,
  }
})
