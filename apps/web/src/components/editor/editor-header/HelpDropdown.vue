<script setup lang="ts">
import { BookText, Download, Heart, HelpCircle, MessageSquare, Tag } from '@lucide/vue'
import { isFundFeatureEnabled } from '@/services/product/features'

const props = withDefaults(defineProps<{
  asSub?: boolean
}>(), {
  asSub: false,
})

const emit = defineEmits([`openAbout`, `openChangelog`, `openFeedback`, `openFund`, `openMarkdownHelp`])

const { asSub } = toRefs(props)
const showFundUi = isFundFeatureEnabled()

// 下载页地址随部署而变，不写死在源码里：自托管方在构建变量里指定，
// 没有配置时（如公开仓库的默认构建）直接隐藏入口，避免留下死链。
const downloadPageUrl = (import.meta.env.VITE_DOWNLOAD_PAGE_URL ?? ``).trim()
const showDownloadEntry = Boolean(downloadPageUrl)

function openAboutDialog() {
  emit('openAbout')
}

function openFundDialog() {
  emit('openFund')
}

function openMarkdownHelp() {
  emit(`openMarkdownHelp`)
}

function openFeedback() {
  emit(`openFeedback`)
}

function openChangelog() {
  emit(`openChangelog`)
}

function openDownloadPage() {
  if (!downloadPageUrl)
    return
  window.open(downloadPageUrl, `_blank`, `noopener,noreferrer`)
}
</script>

<template>
  <!-- 作为 MenubarSub 使用 -->
  <MenubarSub v-if="asSub">
    <MenubarSubTrigger>
      帮助
    </MenubarSubTrigger>
    <MenubarSubContent>
      <MenubarItem @click="openMarkdownHelp()">
        <BookText class="mr-2 h-4 w-4" />
        语法帮助
      </MenubarItem>
      <MenubarItem @click="openFeedback()">
        <MessageSquare class="mr-2 h-4 w-4" />
        反馈与建议
      </MenubarItem>
      <MenubarItem @click="openChangelog()">
        <Tag class="mr-2 h-4 w-4" />
        版本历史
      </MenubarItem>
      <MenubarItem v-if="showDownloadEntry" @click="openDownloadPage()">
        <Download class="mr-2 h-4 w-4" />
        下载 Mac 版
      </MenubarItem>
      <MenubarItem @click="openAboutDialog()">
        <HelpCircle class="mr-2 h-4 w-4" />
        关于 mdlook
      </MenubarItem>
      <MenubarItem v-if="showFundUi" @click="openFundDialog()">
        <Heart class="mr-2 h-4 w-4" />
        支持 mdlook
      </MenubarItem>
    </MenubarSubContent>
  </MenubarSub>

  <!-- 作为 MenubarMenu 使用（默认） -->
  <MenubarMenu v-else>
    <MenubarTrigger>帮助</MenubarTrigger>
    <MenubarContent align="start">
      <MenubarItem @click="openMarkdownHelp()">
        <BookText class="mr-2 h-4 w-4" />
        语法帮助
      </MenubarItem>
      <MenubarItem @click="openFeedback()">
        <MessageSquare class="mr-2 h-4 w-4" />
        反馈与建议
      </MenubarItem>
      <MenubarItem @click="openChangelog()">
        <Tag class="mr-2 h-4 w-4" />
        版本历史
      </MenubarItem>
      <MenubarItem v-if="showDownloadEntry" @click="openDownloadPage()">
        <Download class="mr-2 h-4 w-4" />
        下载 Mac 版
      </MenubarItem>
      <MenubarItem @click="openAboutDialog()">
        <HelpCircle class="mr-2 h-4 w-4" />
        关于 mdlook
      </MenubarItem>
      <MenubarItem v-if="showFundUi" @click="openFundDialog()">
        <Heart class="mr-2 h-4 w-4" />
        支持 mdlook
      </MenubarItem>
    </MenubarContent>
  </MenubarMenu>
</template>
