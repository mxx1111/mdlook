<script setup lang="ts">
const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([`close`])

function onUpdate(val: boolean) {
  if (!val) {
    emit(`close`)
  }
}

const links = [
  { label: `GitHub 仓库`, url: `https://github.com/doocs/md` },
  { label: `Gitee 仓库`, url: `https://gitee.com/doocs/md` },
  { label: `GitCode 仓库`, url: `https://gitcode.com/doocs/md` },
]

function onRedirect(url: string) {
  window.open(url, `_blank`)
}
</script>

<template>
  <Dialog :open="props.visible" @update:open="onUpdate">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>关于</DialogTitle>
      </DialogHeader>
      <div class="text-center">
        <h3>mdlook · Markdown 查看器与公众号排版工具</h3>
        <p>左看源码 · 右览预览 · 一键复制到公众号</p>
        <p class="text-xs text-muted-foreground mt-1">
          基于开源项目 doocs/md 定制，感谢原作者
        </p>
        <img
          class="mx-auto my-5"
          src="https://cdn-doocs.oss-cn-shenzhen.aliyuncs.com/gh/doocs/md/images/1648303220922-7e14aefa-816e-44c1-8604-ade709ca1c69.png"
          alt="Doocs Markdown 编辑器"
          style="width: 40%"
        >
      </div>
      <DialogFooter class="sm:justify-evenly flex flex-wrap gap-2">
        <Button
          v-for="link in links"
          :key="link.url"
          @click="onRedirect(link.url)"
        >
          {{ link.label }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
