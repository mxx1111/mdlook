<script setup lang="ts">
import { EyeOff, Trash2 } from '@lucide/vue'
import { PasswordInput } from '@/components/ui/password-input'
import {
  clearWechatImageCredentials,
  wechatImageAppId,
  wechatImageAppSecret,
} from '@/services/wechat/config'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const dialogOpen = computed({
  get: () => props.open,
  set: value => emit(`update:open`, value),
})

function saveConfig() {
  if (!wechatImageAppId.value.trim() || !wechatImageAppSecret.value.trim()) {
    toast.warning(`请填写 AppID 和 AppSecret`)
    return
  }
  toast.success(`公众号图片转换配置已保存`)
  dialogOpen.value = false
}

function clearConfig() {
  clearWechatImageCredentials()
  toast.success(`已清除公众号图片转换配置`)
}
</script>

<template>
  <Dialog v-model:open="dialogOpen">
    <DialogContent class="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>微信图片转换配置</DialogTitle>
        <DialogDescription>
          配置保存在本机，复制“微信图片”时临时发送给后端代调微信接口。
        </DialogDescription>
      </DialogHeader>

      <div class="space-y-4">
        <div>
          <Label class="mb-1 block text-sm font-medium">公众号 AppID</Label>
          <Input v-model="wechatImageAppId" placeholder="wx..." />
        </div>

        <div>
          <Label class="mb-1 block text-sm font-medium">公众号 AppSecret</Label>
          <PasswordInput v-model="wechatImageAppSecret" placeholder="AppSecret" />
        </div>

        <div class="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
          <div class="flex gap-2">
            <EyeOff class="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              AppSecret 不会提交到仓库，也不会保存到 mdlook 服务器；但转换图片时会通过 HTTPS 临时发给 mdlook 后端，请确保使用可信后端。
            </p>
          </div>
        </div>
      </div>

      <DialogFooter>
        <Button variant="ghost" type="button" @click="clearConfig">
          <Trash2 class="mr-2 h-4 w-4" />
          清除
        </Button>
        <Button type="button" @click="saveConfig">
          保存
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
