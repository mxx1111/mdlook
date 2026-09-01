<script setup lang="ts">
import type {
  HeadingLevel,
  HeadingStyleType,
} from '@md/shared/configs'
import type { Format } from 'vue-pick-colors'
import type { ThemeSummary } from '@/services/themes/client'
import { Check, Download, ExternalLink, Link, Trash2, X } from '@lucide/vue'
import {
  codeBlockThemeOptions,
  colorOptions,
  fontFamilyOptions,
  fontSizeOptions,
  headingLevelOptions,
  headingStyleOptions,
  legendOptions,
} from '@md/shared/configs'
import PickColors from 'vue-pick-colors'
import { importDesignTheme, isThemeServiceConfigured, listDesignThemes, loadDesignTheme } from '@/services/themes/client'
import { useConfirmStore } from '@/stores/confirm'
import { useCssEditorStore } from '@/stores/cssEditor'
import { useEditorStore } from '@/stores/editor'
import { useRenderStore } from '@/stores/render'
import { useThemeStore } from '@/stores/theme'
import { useUIStore } from '@/stores/ui'

const confirmStore = useConfirmStore()
const cssEditorStore = useCssEditorStore()
const uiStore = useUIStore()
const themeStore = useThemeStore()
const {
  theme,
  fontFamily,
  fontSize,
  primaryColor,
  codeBlockTheme,
  legend,
  isMacCodeBlock,
  isShowLineNumber,
  isCiteStatus,
  isUseIndent,
  isUseJustify,
} = storeToRefs(themeStore)
const { allThemeOptions, designThemes } = storeToRefs(themeStore)

// 标题样式选择器状态
const selectedHeadingLevel = ref<HeadingLevel>(`h2`)
const selectedHeadingStyle = computed({
  get: () => themeStore.getHeadingStyle(selectedHeadingLevel.value),
  set: (val: HeadingStyleType) => {
    themeStore.setHeadingStyle(selectedHeadingLevel.value, val)
    if (val === `custom`) {
      // 打开 CSS 编辑器并滚动到对应标题区域
      uiStore.isShowCssEditor = true
      // 等待 CSS 编辑器打开后再滚动
      nextTick(() => {
        setTimeout(() => {
          cssEditorStore.scrollToHeading(selectedHeadingLevel.value)
        }, 100)
      })
    }
    // 无论选择预设还是自定义，都立即应用主题，确保标题样式及时恢复/更新
    themeStore.applyCurrentTheme()
    editorRefresh()
  },
})

const { isMobile, isOpenRightSlider, isDark } = storeToRefs(uiStore)

const editorStore = useEditorStore()
const renderStore = useRenderStore()
const themeServiceConfigured = isThemeServiceConfigured()
const curatedThemes = ref<ThemeSummary[]>([])
const selectedCuratedThemeId = ref(``)
const selectedDesignThemeId = ref(``)
const designThemeUrl = ref(``)
const designThemeLoading = ref(false)
const designThemeLoadError = ref(``)
const designThemeRepoUrl = `https://github.com/VoltAgent/awesome-design-md`
const selectedCuratedTheme = computed(() => curatedThemes.value.find(item => item.id === selectedCuratedThemeId.value))
const importedDesignThemes = computed(() => Object.values(designThemes.value))
// 基础排版主题（不含已下载的 DESIGN.md 设计主题，避免上下两处重复展示）
const baseThemeOptions = computed(() => allThemeOptions.value.filter(option => !designThemes.value[option.value]))
const selectedThemePreview = computed(() => buildThemePreview(selectedCuratedTheme.value?.name ?? selectedCuratedThemeId.value))

watch(importedDesignThemes, (items) => {
  if (!selectedDesignThemeId.value || !items.some(item => item.id === selectedDesignThemeId.value))
    selectedDesignThemeId.value = items[0]?.id ?? ``
}, { immediate: true })

onMounted(async () => {
  if (!themeServiceConfigured)
    return
  try {
    curatedThemes.value = await listDesignThemes()
    selectedCuratedThemeId.value = curatedThemes.value[0]?.id ?? ``
    designThemeLoadError.value = ``
  }
  catch (error) {
    designThemeLoadError.value = error instanceof Error ? error.message : `主题服务暂不可用`
    console.warn(`[design-theme] 主题列表加载失败`, error)
  }
})

// Editor refresh function - triggers re-render with current theme settings
function editorRefresh() {
  themeStore.updateCodeTheme()

  const raw = editorStore.getContent()
  renderStore.render(raw)
}

// Theme change handlers
function themeChanged(newTheme: string) {
  themeStore.theme = newTheme
  // 使用新主题系统
  themeStore.applyCurrentTheme()
  editorRefresh()
}

function applyDesignTheme(themeId: string) {
  themeStore.theme = themeId
  // 强调色跟随设计主题的品牌色（取自下方预览色板同一来源），保证文章与预览一致
  syncDesignAccent(designThemes.value[themeId]?.name ?? themeId)
  themeStore.applyCurrentTheme()
  editorRefresh()
  toast.success(`设计主题已应用`)
}

function applySelectedDesignTheme() {
  if (!selectedDesignThemeId.value)
    return
  applyDesignTheme(selectedDesignThemeId.value)
}

function buildThemePreview(name: string) {
  const key = name.toLowerCase()
  if (key.includes(`linear`))
    return { accent: `#5E6AD2`, bg: `#F7F8FC`, ink: `#1F2433`, soft: `#E9ECFA` }
  if (key.includes(`vercel`))
    return { accent: `#000000`, bg: `#FAFAFA`, ink: `#111111`, soft: `#EDEDED` }
  if (key.includes(`stripe`))
    return { accent: `#635BFF`, bg: `#F6F9FC`, ink: `#0A2540`, soft: `#E7ECFF` }
  if (key.includes(`apple`))
    return { accent: `#0071E3`, bg: `#F5F5F7`, ink: `#1D1D1F`, soft: `#E8F1FC` }
  if (key.includes(`figma`))
    return { accent: `#A259FF`, bg: `#FFFFFF`, ink: `#2C2C2C`, soft: `#F1E8FF` }
  if (key.includes(`notion`))
    return { accent: `#7A6A58`, bg: `#FBFAF8`, ink: `#37352F`, soft: `#EFEAE3` }
  return { accent: `#D97757`, bg: `#FBF7F1`, ink: `#2E2A27`, soft: `#F3E3D9` }
}

// 把强调色对齐到设计主题预览色板的品牌色（DESIGN.md 解析出的 primary 对黑白系主题可能是黑色，
// 与色板展示不一致；这里以色板为准，做到“所见即所得”）。调用前需保证 theme.value 已切到该设计主题。
function syncDesignAccent(name: string) {
  primaryColor.value = buildThemePreview(name).accent
}

async function loadSelectedCuratedDesignTheme() {
  if (!selectedCuratedThemeId.value)
    return
  if (designThemes.value[selectedCuratedThemeId.value]) {
    applyDesignTheme(selectedCuratedThemeId.value)
    return
  }
  await loadCuratedDesignTheme(selectedCuratedThemeId.value)
  selectedDesignThemeId.value = selectedCuratedThemeId.value
}

async function loadCuratedDesignTheme(id: string) {
  if (designThemeLoading.value)
    return

  designThemeLoading.value = true
  try {
    const designTheme = await loadDesignTheme(id)
    themeStore.setDesignTheme(designTheme)
    syncDesignAccent(designTheme.name)
    await themeStore.applyCurrentTheme()
    editorRefresh()
    toast.success(`设计主题已导入`)
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : `设计主题导入失败`)
  }
  finally {
    designThemeLoading.value = false
  }
}

async function importDesignThemeFromUrl() {
  const url = designThemeUrl.value.trim()
  if (!url) {
    toast.error(`请输入 DESIGN.md 地址`)
    return
  }

  designThemeLoading.value = true
  try {
    const designTheme = await importDesignTheme(url)
    themeStore.setDesignTheme(designTheme)
    syncDesignAccent(designTheme.name)
    selectedDesignThemeId.value = designTheme.id
    designThemeUrl.value = ``
    await themeStore.applyCurrentTheme()
    editorRefresh()
    toast.success(`设计主题已导入`)
  }
  catch (error) {
    toast.error(error instanceof Error ? error.message : `设计主题导入失败`)
  }
  finally {
    designThemeLoading.value = false
  }
}

function deleteDesignTheme(id: string) {
  themeStore.removeDesignTheme(id)
  themeStore.applyCurrentTheme()
  editorRefresh()
  if (selectedDesignThemeId.value === id)
    selectedDesignThemeId.value = importedDesignThemes.value[0]?.id ?? ``
  toast.success(`设计主题已删除`)
}

function deleteSelectedDesignTheme() {
  if (!selectedDesignThemeId.value)
    return
  deleteDesignTheme(selectedDesignThemeId.value)
}

function fontChanged(fonts: string) {
  themeStore.fontFamily = fonts
  // 使用新主题系统
  themeStore.applyCurrentTheme()
  editorRefresh()
}

function sizeChanged(size: string) {
  themeStore.fontSize = size
  // 使用新主题系统
  themeStore.applyCurrentTheme()
  editorRefresh()
}

function colorChanged(newColor: string) {
  themeStore.primaryColor = newColor
  // 使用新主题系统
  themeStore.applyCurrentTheme()
  editorRefresh()
}

function codeBlockThemeChanged(newTheme: unknown) {
  if (typeof newTheme !== 'string')
    return
  themeStore.codeBlockTheme = newTheme
  editorRefresh()
}

function legendChanged(newVal: string) {
  themeStore.legend = newVal
  editorRefresh()
}

function macCodeBlockChanged() {
  themeStore.isMacCodeBlock = !themeStore.isMacCodeBlock
  editorRefresh()
}

function showLineNumberChanged() {
  themeStore.isShowLineNumber = !themeStore.isShowLineNumber
  editorRefresh()
}

function citeStatusChanged() {
  themeStore.isCiteStatus = !themeStore.isCiteStatus
  editorRefresh()
}

function useIndentChanged() {
  themeStore.isUseIndent = !themeStore.isUseIndent
  // 使用新主题系统
  themeStore.applyCurrentTheme()
  editorRefresh()
}

function useJustifyChanged() {
  themeStore.isUseJustify = !themeStore.isUseJustify
  // 使用新主题系统
  themeStore.applyCurrentTheme()
  editorRefresh()
}

function resetStyleConfirm() {
  confirmStore.confirm({
    title: '提示',
    description: '此操作将丢失本地自定义样式，是否继续？',
    onConfirm: () => {
      themeStore.resetStyle()
      cssEditorStore.resetCssConfig()
      themeStore.applyCurrentTheme()
      themeStore.updateCodeTheme()
      const raw = editorStore.getContent()
      renderStore.render(raw)
      toast.success(`样式已重置`)
    },
  })
}

// 控制是否启用动画
const enableAnimation = ref(false)

// 监听 RightSlider 开关状态变化
watch(isOpenRightSlider, () => {
  if (isMobile.value) {
    // 在移动端，用户操作时启用动画
    enableAnimation.value = true
  }
})

// 监听设备类型变化，重置动画状态
watch(isMobile, () => {
  enableAnimation.value = false
})

const isOpen = ref(false)

const addPostInputVal = ref(``)

watch(isOpen, () => {
  if (isOpen.value) {
    addPostInputVal.value = ``
  }
})

const pickColorsContainer = useTemplateRef<HTMLElement | undefined>(`pickColorsContainer`)
const format = ref<Format>(`rgb`)
const formatOptions = ref<Format[]>([`rgb`, `hex`, `hsl`, `hsv`])
</script>

<template>
  <!-- 移动端遮罩层 -->
  <div
    v-if="isMobile && isOpenRightSlider"
    class="fixed inset-0 bg-black/50 z-40"
    @click="isOpenRightSlider = false"
  />

  <div
    class="h-full overflow-hidden"
    :class="{
      'fixed top-0 right-0 w-full h-full z-55 bg-background border-l shadow-lg mobile-right-drawer': isMobile,
      'animate': isMobile && enableAnimation,
    }"
    :style="isMobile ? { transform: isOpenRightSlider ? 'translateX(0)' : 'translateX(100%)' } : undefined"
  >
    <div
      class="space-y-4 h-full overflow-auto p-4"
      :class="{ 'pt-0': isMobile }"
    >
      <!-- 移动端标题栏 -->
      <div v-if="isMobile" class="sticky top-0 z-10 flex items-center justify-between -mx-4 px-4 py-3 border-b mb-4 bg-background">
        <h2 class="text-lg font-semibold">
          样式设置
        </h2>
        <Button variant="ghost" size="sm" @click="isOpenRightSlider = false">
          <X class="h-4 w-4" />
        </Button>
      </div>
      <div class="space-y-2">
        <h2>排版主题</h2>
        <div class="grid grid-cols-3 justify-items-center gap-2">
          <Button
            v-for="{ label, value } in baseThemeOptions" :key="value" class="w-full" variant="outline" :class="{
              'border-black dark:border-white border-2': theme === value,
            }" @click="themeChanged(value)"
          >
            {{ label }}
          </Button>
        </div>
      </div>
      <div class="space-y-2">
        <h2>DESIGN.md 主题</h2>
        <div v-if="themeServiceConfigured" class="space-y-2">
          <p v-if="designThemeLoadError" class="text-muted-foreground text-sm">
            {{ designThemeLoadError }}
          </p>
          <div class="flex gap-2">
            <Select v-model="selectedCuratedThemeId">
              <SelectTrigger class="min-w-0 flex-1">
                <SelectValue placeholder="选择官方主题" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="item in curatedThemes" :key="item.id" :value="item.id">
                  {{ item.name.replace(/\s+inspired$/i, '') }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              :disabled="designThemeLoading || !selectedCuratedTheme"
              :title="selectedCuratedThemeId && designThemes[selectedCuratedThemeId] ? '应用主题' : '导入主题'"
              @click="loadSelectedCuratedDesignTheme"
            >
              <Download class="h-4 w-4 shrink-0" />
            </Button>
          </div>
          <div
            v-if="selectedCuratedTheme"
            class="theme-preview"
            :style="{
              '--preview-accent': selectedThemePreview.accent,
              '--preview-bg': selectedThemePreview.bg,
              '--preview-ink': selectedThemePreview.ink,
              '--preview-soft': selectedThemePreview.soft,
            }"
          >
            <div class="theme-preview__head">
              <span class="theme-preview__dot" />
              <span class="theme-preview__name">{{ selectedCuratedTheme.name.replace(/\s+inspired$/i, '') }}</span>
            </div>
            <div class="theme-preview__title">
              一级标题风格
            </div>
            <div class="theme-preview__line theme-preview__line--wide" />
            <div class="theme-preview__line" />
            <div class="theme-preview__callout">
              DESIGN.md 会同步文章排版与应用色彩变量
            </div>
          </div>
          <div class="flex gap-2">
            <Input
              v-model="designThemeUrl"
              placeholder="https://.../DESIGN.md"
              :disabled="designThemeLoading"
              @keydown.enter="importDesignThemeFromUrl"
            />
            <Button variant="outline" size="icon" as="a" :href="designThemeRepoUrl" target="_blank" rel="noopener noreferrer" title="浏览 DESIGN.md 主题仓库">
              <ExternalLink class="h-4 w-4" />
            </Button>
            <Button variant="outline" size="icon" :disabled="designThemeLoading" @click="importDesignThemeFromUrl">
              <Link class="h-4 w-4" />
            </Button>
          </div>
          <div v-if="importedDesignThemes.length" class="flex gap-2">
            <Select v-model="selectedDesignThemeId">
              <SelectTrigger class="min-w-0 flex-1">
                <SelectValue placeholder="已导入主题" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem v-for="item in importedDesignThemes" :key="item.id" :value="item.id">
                  {{ item.name }}
                </SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="icon" :disabled="!selectedDesignThemeId" title="应用主题" @click="applySelectedDesignTheme">
              <Check class="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" :disabled="!selectedDesignThemeId" title="删除主题" @click="deleteSelectedDesignTheme">
              <Trash2 class="h-4 w-4" />
            </Button>
          </div>
        </div>
        <p v-else class="text-muted-foreground text-sm">
          需要配置 VITE_CAPABILITY_API_URL 后使用
        </p>
      </div>
      <div class="space-y-2">
        <h2>字体</h2>
        <div class="grid grid-cols-3 justify-items-center gap-2">
          <Button
            v-for="{ label, value } in fontFamilyOptions" :key="value" variant="outline" class="w-full"
            :class="{ 'border-black dark:border-white border-2': fontFamily === value }" @click="fontChanged(value)"
          >
            {{ label }}
          </Button>
        </div>
      </div>
      <div class="space-y-2">
        <h2>字号</h2>
        <div class="grid grid-cols-5 justify-items-center gap-2">
          <Button
            v-for="{ value, desc } in fontSizeOptions" :key="value" variant="outline" class="w-full" :class="{
              'border-black dark:border-white border-2': fontSize === value,
            }" @click="sizeChanged(value)"
          >
            {{ desc }}
          </Button>
        </div>
      </div>
      <div class="space-y-2">
        <h2>强调色</h2>
        <div class="grid grid-cols-3 justify-items-center gap-2">
          <Button
            v-for="{ label, value } in colorOptions" :key="value" class="w-full" variant="outline" :class="{
              'border-black dark:border-white border-2': primaryColor === value,
            }" @click="colorChanged(value)"
          >
            <span
              class="mr-2 inline-block h-4 w-4 rounded-full" :style="{
                background: value,
              }"
            />
            {{ label }}
          </Button>
        </div>
      </div>
      <div class="space-y-2">
        <h2>自定义强调色</h2>
        <div ref="pickColorsContainer">
          <PickColors
            v-if="pickColorsContainer" v-model:value="primaryColor" show-alpha :format="format"
            :format-options="formatOptions" :theme="isDark ? 'dark' : 'light'"
            :popup-container="pickColorsContainer" @change="colorChanged"
          />
        </div>
      </div>
      <div class="space-y-2">
        <h2>标题样式</h2>
        <div class="flex gap-2">
          <Select v-model="selectedHeadingLevel">
            <SelectTrigger class="w-[120px]">
              <SelectValue placeholder="选择标题" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="{ label, value } in headingLevelOptions" :key="value" :value="value">
                {{ label }}
              </SelectItem>
            </SelectContent>
          </Select>
          <Select v-model="selectedHeadingStyle">
            <SelectTrigger class="flex-1">
              <SelectValue placeholder="选择样式" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="{ label, value } in headingStyleOptions" :key="value" :value="value">
                {{ label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div class="space-y-2">
        <h2>代码块主题</h2>
        <div>
          <Select v-model="codeBlockTheme" @update:model-value="codeBlockThemeChanged">
            <SelectTrigger>
              <SelectValue placeholder="Select a code block theme" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="{ label, value } in codeBlockThemeOptions" :key="label" :value="value">
                {{ label }}
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div class="space-y-2">
        <h2>图注格式</h2>
        <div class="grid grid-cols-3 justify-items-center gap-2">
          <Button
            v-for="{ label, value } in legendOptions" :key="value" class="w-full" variant="outline" :class="{
              'border-black dark:border-white border-2': legend === value,
            }" @click="legendChanged(value)"
          >
            {{ label }}
          </Button>
        </div>
      </div>

      <div class="space-y-2">
        <h2>Mac 代码块</h2>
        <div class="grid grid-cols-5 justify-items-center gap-2">
          <Button
            class="w-full" variant="outline" :class="{
              'border-black dark:border-white border-2': isMacCodeBlock,
            }" @click="!isMacCodeBlock && macCodeBlockChanged()"
          >
            开启
          </Button>
          <Button
            class="w-full" variant="outline" :class="{
              'border-black dark:border-white border-2': !isMacCodeBlock,
            }" @click="isMacCodeBlock && macCodeBlockChanged()"
          >
            关闭
          </Button>
        </div>
      </div>
      <div class="space-y-2">
        <h2>代码块行号</h2>
        <div class="grid grid-cols-5 justify-items-center gap-2">
          <Button
            class="w-full" variant="outline" :class="{
              'border-black dark:border-white border-2': isShowLineNumber,
            }" @click="!isShowLineNumber && showLineNumberChanged()"
          >
            开启
          </Button>
          <Button
            class="w-full" variant="outline" :class="{
              'border-black dark:border-white border-2': !isShowLineNumber,
            }" @click="isShowLineNumber && showLineNumberChanged()"
          >
            关闭
          </Button>
        </div>
      </div>

      <div class="space-y-2">
        <h2>微信外链转底部引用</h2>
        <div class="grid grid-cols-5 justify-items-center gap-2">
          <Button
            class="w-full" variant="outline" :class="{
              'border-black dark:border-white border-2': isCiteStatus,
            }" @click="!isCiteStatus && citeStatusChanged()"
          >
            开启
          </Button>
          <Button
            class="w-full" variant="outline" :class="{
              'border-black dark:border-white border-2': !isCiteStatus,
            }" @click="isCiteStatus && citeStatusChanged()"
          >
            关闭
          </Button>
        </div>
      </div>
      <div class="space-y-2">
        <h2>段落首行缩进</h2>
        <div class="grid grid-cols-5 justify-items-center gap-2">
          <Button
            class="w-full" variant="outline" :class="{
              'border-black dark:border-white border-2': isUseIndent,
            }" @click="!isUseIndent && useIndentChanged()"
          >
            开启
          </Button>
          <Button
            class="w-full" variant="outline" :class="{
              'border-black dark:border-white border-2': !isUseIndent,
            }" @click="isUseIndent && useIndentChanged()"
          >
            关闭
          </Button>
        </div>
      </div>
      <div class="space-y-2">
        <h2>段落两端对齐</h2>
        <div class="grid grid-cols-5 justify-items-center gap-2">
          <Button
            class="w-full" variant="outline" :class="{
              'border-black dark:border-white border-2': isUseJustify,
            }" @click="!isUseJustify && useJustifyChanged()"
          >
            开启
          </Button>
          <Button
            class="w-full" variant="outline" :class="{
              'border-black dark:border-white border-2': !isUseJustify,
            }" @click="isUseJustify && useJustifyChanged()"
          >
            关闭
          </Button>
        </div>
      </div>
      <div class="space-y-2">
        <h2>样式配置</h2>
        <Button variant="destructive" @click="resetStyleConfirm">
          重置
        </Button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* 移动端右侧栏动画 - 只有添加了 animate 类才启用 */
.mobile-right-drawer.animate {
  transition: transform 300ms cubic-bezier(0.16, 1, 0.3, 1);
}

.mobile-right-drawer {
  box-sizing: border-box;
  padding-top: env(safe-area-inset-top);
  padding-bottom: env(safe-area-inset-bottom);
}

.theme-preview {
  padding: 0.75rem;
  border: 1px solid color-mix(in srgb, var(--preview-accent) 24%, transparent);
  border-radius: 8px;
  background: var(--preview-bg);
  color: var(--preview-ink);
}

.theme-preview__head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.55rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.theme-preview__dot {
  width: 0.55rem;
  height: 0.55rem;
  border-radius: 999px;
  background: var(--preview-accent);
}

.theme-preview__name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-preview__title {
  display: inline-flex;
  align-items: center;
  min-height: 1.6rem;
  margin-bottom: 0.55rem;
  padding: 0 0.55rem;
  border-left: 3px solid var(--preview-accent);
  background: var(--preview-soft);
  font-size: 0.875rem;
  font-weight: 700;
}

.theme-preview__line {
  height: 0.45rem;
  width: 68%;
  margin-top: 0.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--preview-ink) 16%, transparent);
}

.theme-preview__line--wide {
  width: 88%;
}

.theme-preview__callout {
  margin-top: 0.7rem;
  padding: 0.5rem 0.6rem;
  border-radius: 6px;
  background: #fff;
  color: color-mix(in srgb, var(--preview-ink) 78%, white);
  font-size: 0.75rem;
  line-height: 1.45;
}
</style>
