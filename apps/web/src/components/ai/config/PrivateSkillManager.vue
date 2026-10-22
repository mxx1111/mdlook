<script setup lang="ts">
import type { PrivateSkillFileInput, PrivateSkillFileRole, PrivateSkillRecord } from '@/services/ai/types'
import { FileUp, FolderUp, Loader2, RefreshCw, ShieldCheck, Trash2 } from '@lucide/vue'
import { useAuthStore } from '@/stores/auth'
import { useConfirmStore } from '@/stores/confirm'
import {
  usePrivateSkillsStore,
  WRITING_STYLE_SKILL_SLUG,
} from '@/stores/privateSkills'

interface DraftSkillFile extends PrivateSkillFileInput {
  byteSize: number
}

const MAX_FILES = 64
const MAX_FILE_BYTES = 256 * 1024
const MAX_BUNDLE_BYTES = 1024 * 1024

const authStore = useAuthStore()
const confirmStore = useConfirmStore()
const privateSkillsStore = usePrivateSkillsStore()
const { skills, loading, error } = storeToRefs(privateSkillsStore)

const fileInput = ref<HTMLInputElement | null>(null)
const directoryInput = ref<HTMLInputElement | null>(null)
const draftFiles = ref<DraftSkillFile[]>([])
const draftName = ref(``)
const draftSlug = ref(WRITING_STYLE_SKILL_SLUG)
const draftEnabled = ref(true)
const importing = ref(false)
const saving = ref(false)
const actionSlug = ref<string | null>(null)
const importError = ref(``)
const directorySupported = ref(false)
let importGeneration = 0

const totalDraftBytes = computed(() => draftFiles.value.reduce((sum, file) => sum + file.byteSize, 0))

onMounted(() => {
  const probe = document.createElement(`input`)
  directorySupported.value = `webkitdirectory` in probe
  directoryInput.value?.setAttribute(`webkitdirectory`, ``)
  directoryInput.value?.setAttribute(`directory`, ``)
})

function safeMessage(errorValue: unknown): string {
  return errorValue instanceof Error ? errorValue.message : `操作失败，请稍后重试。`
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, `/`).replace(/^\/+/, ``)
  const parts = normalized.split(`/`).filter(part => part && part !== `.`)
  if (!parts.length || parts.includes(`..`))
    throw new Error(`Skill 文件路径无效。`)
  return parts.join(`/`)
}

function normalizeSlug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, `-`)
    .replace(/^-+|-+$/g, ``)
    .slice(0, 64)
}

function inferName(files: File[]): string {
  const relativePath = files.find(file => file.webkitRelativePath)?.webkitRelativePath
  if (relativePath)
    return relativePath.split(`/`)[0] || `我的私有 Skill`
  return files[0]?.name.replace(/\.[^.]+$/, ``) || `我的私有 Skill`
}

function relativePaths(files: File[]): string[] {
  const rawPaths = files.map(file => normalizePath(file.webkitRelativePath || file.name))
  const firstSegments = rawPaths.map(path => path.split(`/`)[0])
  const commonRoot = firstSegments.length > 0 && firstSegments.every(segment => segment === firstSegments[0])
    && rawPaths.every(path => path.includes(`/`))
    ? firstSegments[0]
    : null
  return rawPaths.map(path => commonRoot ? path.slice(commonRoot.length + 1) : path)
}

function inferRoles(paths: string[]): PrivateSkillFileRole[] {
  const skillIndex = paths.findIndex(path => /(?:^|\/)SKILL\.md$/i.test(path))
  const coreIndex = skillIndex >= 0 ? skillIndex : paths.findIndex(path => /\.md$/i.test(path))
  return paths.map((path, index) => {
    if (index === (coreIndex >= 0 ? coreIndex : 0))
      return `core`
    if (/(?:^|\/)(?:samples?|examples?)(?:\/|$)/i.test(path))
      return `sample`
    return `reference`
  })
}

async function readSelectedFiles(fileList: FileList | null): Promise<void> {
  const files = Array.from(fileList ?? [])
  if (!files.length)
    return

  const currentImportGeneration = ++importGeneration
  importError.value = ``
  importing.value = true
  try {
    if (files.length > MAX_FILES)
      throw new Error(`单个 Skill 最多包含 ${MAX_FILES} 个文件。`)
    if (files.some(file => file.size > MAX_FILE_BYTES))
      throw new Error(`单个文件不能超过 256KB。`)
    const totalBytes = files.reduce((sum, file) => sum + file.size, 0)
    if (totalBytes > MAX_BUNDLE_BYTES)
      throw new Error(`单个 Skill bundle 不能超过 1MB。`)

    const paths = relativePaths(files)
    if (new Set(paths).size !== paths.length)
      throw new Error(`存在重复文件路径，请整理目录后重试。`)
    const roles = inferRoles(paths)
    const contents = await Promise.all(files.map(file => file.text()))
    if (currentImportGeneration !== importGeneration || !authStore.isLoggedIn)
      return

    draftFiles.value = paths.map((path, index) => ({
      path,
      role: roles[index],
      content: contents[index],
      byteSize: files[index].size,
    }))
    const inferredName = inferName(files)
    draftName.value = inferredName
    draftSlug.value = normalizeSlug(inferredName) || WRITING_STYLE_SKILL_SLUG
  }
  catch (caught) {
    importError.value = safeMessage(caught)
  }
  finally {
    importing.value = false
    if (fileInput.value)
      fileInput.value.value = ``
    if (directoryInput.value)
      directoryInput.value.value = ``
  }
}

watch(
  () => [authStore.token, authStore.user?.id] as const,
  () => {
    importGeneration += 1
    draftFiles.value = []
    draftName.value = ``
    draftSlug.value = WRITING_STYLE_SKILL_SLUG
    importError.value = ``
  },
)

function setFileRole(index: number, role: PrivateSkillFileRole): void {
  if (role === `core`) {
    draftFiles.value.forEach((file, fileIndex) => {
      if (fileIndex !== index && file.role === `core`)
        file.role = `reference`
    })
  }
  draftFiles.value[index].role = role
}

async function saveDraft(): Promise<void> {
  importError.value = ``
  const slug = normalizeSlug(draftSlug.value)
  const coreCount = draftFiles.value.filter(file => file.role === `core`).length
  if (!slug) {
    importError.value = `请填写仅含小写字母、数字和连字符的 slug。`
    return
  }
  if (!draftName.value.trim()) {
    importError.value = `请填写 Skill 名称。`
    return
  }
  if (coreCount !== 1) {
    importError.value = `Skill 必须且只能指定一个核心文件。`
    return
  }

  const existing = skills.value.find(skill => skill.slug === slug)
  saving.value = true
  try {
    await privateSkillsStore.save(slug, {
      name: draftName.value.trim(),
      version: existing?.version ?? 0,
      enabled: draftEnabled.value,
      files: draftFiles.value.map(({ path, role, content }) => ({ path, role, content })),
    })
    toast.success(existing ? `私有 Skill 已更新` : `私有 Skill 已导入`)
    draftFiles.value = []
  }
  catch (caught) {
    importError.value = safeMessage(caught)
  }
  finally {
    saving.value = false
  }
}

async function toggleSkill(skill: PrivateSkillRecord): Promise<void> {
  actionSlug.value = skill.slug
  try {
    await privateSkillsStore.setEnabled(skill, !skill.enabled)
    toast.success(skill.enabled ? `Skill 已停用` : `Skill 已启用`)
  }
  catch (caught) {
    toast.error(safeMessage(caught))
  }
  finally {
    actionSlug.value = null
  }
}

async function removeSkillConfirmed(skill: PrivateSkillRecord): Promise<void> {
  actionSlug.value = skill.slug
  try {
    await privateSkillsStore.remove(skill)
    toast.success(`私有 Skill 已删除`)
  }
  catch (caught) {
    toast.error(safeMessage(caught))
  }
  finally {
    actionSlug.value = null
  }
}

function removeSkill(skill: PrivateSkillRecord): void {
  confirmStore.confirm({
    title: `删除私有 Skill`,
    description: `确定删除“${skill.name}”吗？此操作会从云端移除加密文件。`,
    confirmText: `删除`,
    destructive: true,
    onConfirm: () => removeSkillConfirmed(skill),
  })
}
</script>

<template>
  <section class="space-y-3 rounded-lg border p-3">
    <div class="flex items-start justify-between gap-3">
      <div>
        <div class="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck class="size-4 text-primary" />
          私有文风 Skill
        </div>
        <p class="mt-1 text-xs leading-5 text-muted-foreground">
          文件上传后在服务器加密保存。它不是端到端加密：执行时服务器需要解密选中的片段，并随文章内容发送给你选择的 AI 供应商。
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        class="size-9 shrink-0"
        title="刷新 Skill"
        :disabled="loading"
        @click="privateSkillsStore.load"
      >
        <RefreshCw class="size-4" :class="{ 'animate-spin': loading }" />
      </Button>
    </div>

    <div v-if="!authStore.isLoggedIn" class="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
      登录后才能导入和跨端使用私有 Skill。
    </div>

    <template v-else>
      <div v-if="error" class="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
        {{ error }}
      </div>

      <div v-if="skills.length" class="space-y-2">
        <div
          v-for="skill in skills"
          :key="skill.slug"
          class="flex items-center gap-3 rounded-md border bg-muted/20 p-2.5"
        >
          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-2 text-sm font-medium">
              <span class="truncate">{{ skill.name }}</span>
              <span class="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
                v{{ skill.version }}
              </span>
            </div>
            <p class="mt-1 truncate text-xs text-muted-foreground">
              {{ skill.slug }} · {{ skill.fileCount }} 个文件 · {{ Math.ceil(skill.totalBytes / 1024) }}KB
            </p>
          </div>
          <Button
            size="sm"
            :variant="skill.enabled ? 'secondary' : 'outline'"
            :disabled="actionSlug === skill.slug"
            @click="toggleSkill(skill)"
          >
            <Loader2 v-if="actionSlug === skill.slug" class="mr-1 size-3.5 animate-spin" />
            {{ skill.enabled ? '已启用' : '启用' }}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            class="size-9 text-muted-foreground hover:text-destructive"
            :disabled="actionSlug === skill.slug"
            title="删除 Skill"
            @click="removeSkill(skill)"
          >
            <Trash2 class="size-4" />
          </Button>
        </div>
      </div>
      <div v-else-if="!loading" class="rounded-md border border-dashed p-3 text-xs leading-5 text-muted-foreground">
        尚未导入私有 Skill。“按我的文风润色”会查找并使用
        <code>{{ WRITING_STYLE_SKILL_SLUG }}</code>。
      </div>

      <input
        ref="fileInput"
        type="file"
        multiple
        class="hidden"
        @change="readSelectedFiles(($event.target as HTMLInputElement).files)"
      >
      <input
        ref="directoryInput"
        type="file"
        multiple
        class="hidden"
        @change="readSelectedFiles(($event.target as HTMLInputElement).files)"
      >

      <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button variant="outline" type="button" :disabled="importing" @click="directoryInput?.click()">
          <Loader2 v-if="importing" class="mr-2 size-4 animate-spin" />
          <FolderUp v-else class="mr-2 size-4" />
          {{ directorySupported ? '选择 Skill 目录' : '尝试选择目录' }}
        </Button>
        <Button variant="outline" type="button" :disabled="importing" @click="fileInput?.click()">
          <FileUp class="mr-2 size-4" />
          选择多个文件
        </Button>
      </div>
      <p class="text-xs leading-5 text-muted-foreground">
        目录选择会保留相对路径；不支持目录选择的浏览器可改用多文件导入。最多 64 个文件、总计 1MB，正文不会打进 mdlook 公开安装包。
      </p>

      <div v-if="draftFiles.length" class="space-y-3 rounded-md border bg-background p-3">
        <div class="grid gap-2 sm:grid-cols-2">
          <div>
            <Label class="mb-1 block text-xs">名称</Label>
            <Input v-model="draftName" class="h-10 text-base sm:text-sm" maxlength="128" />
          </div>
          <div>
            <Label class="mb-1 block text-xs">Slug</Label>
            <Input
              v-model="draftSlug"
              class="h-10 text-base sm:text-sm"
              maxlength="64"
              autocapitalize="none"
              spellcheck="false"
            />
          </div>
        </div>

        <div class="max-h-52 space-y-1.5 overflow-y-auto pr-1">
          <div
            v-for="(file, index) in draftFiles"
            :key="file.path"
            class="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-2 rounded border px-2 py-1.5"
          >
            <div class="min-w-0">
              <p class="truncate text-xs font-medium" :title="file.path">
                {{ file.path }}
              </p>
              <p class="text-[11px] text-muted-foreground">
                {{ Math.max(1, Math.ceil(file.byteSize / 1024)) }}KB
              </p>
            </div>
            <Select :model-value="file.role" @update:model-value="setFileRole(index, $event as PrivateSkillFileRole)">
              <SelectTrigger class="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="core">
                  核心规则
                </SelectItem>
                <SelectItem value="reference">
                  参考资料
                </SelectItem>
                <SelectItem value="sample">
                  写作样本
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-xs text-muted-foreground">
            {{ draftFiles.length }} 个文件 · {{ Math.ceil(totalDraftBytes / 1024) }}KB · 必须且只能有 1 个核心规则
          </p>
          <div class="flex gap-2">
            <Button variant="ghost" type="button" @click="draftFiles = []">
              取消
            </Button>
            <Button type="button" :disabled="saving" @click="saveDraft">
              <Loader2 v-if="saving" class="mr-2 size-4 animate-spin" />
              加密导入
            </Button>
          </div>
        </div>
      </div>

      <div v-if="importError" class="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
        {{ importError }}
      </div>
    </template>
  </section>
</template>
