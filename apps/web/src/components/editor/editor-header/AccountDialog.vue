<script setup lang="ts">
import { CheckCircle2, Cloud, CloudAlert, Eye, EyeOff, KeyRound, Loader2, LogIn, LogOut, RefreshCw, ShieldCheck, User, UserPlus } from '@lucide/vue'
import { storeToRefs } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import AIAccountSecurity from '@/components/ai/config/AIAccountSecurity.vue'
import { isProPlan, SYNC_PRO_ENABLED } from '@/services/account/features'
import { useAccountSettingsStore } from '@/stores/accountSettings'
import { useAuthStore } from '@/stores/auth'
import { useSyncStore } from '@/stores/sync'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits([`close`])

const authStore = useAuthStore()
const accountSettingsStore = useAccountSettingsStore()
const syncStore = useSyncStore()

const { user, isConfigured, isLoggedIn } = storeToRefs(authStore)
const {
  status: settingsStatus,
  lastError: settingsError,
  lastSavedAt,
} = storeToRefs(accountSettingsStore)

const activeTab = ref<`login` | `register`>(`login`)
const pendingAction = ref<`login` | `register` | `logout` | `password` | `settings` | null>(null)
const formError = ref(``)
const passwordError = ref(``)
const showLoginPassword = ref(false)
const showRegisterPassword = ref(false)
const showCurrentPassword = ref(false)
const showNewPassword = ref(false)

const loginForm = reactive({
  username: ``,
  password: ``,
})

const registerForm = reactive({
  username: ``,
  password: ``,
  confirmPassword: ``,
})

const passwordForm = reactive({
  currentPassword: ``,
  newPassword: ``,
  confirmPassword: ``,
})

const isPro = computed(() => isProPlan(user.value?.plan))

const settingsStatusText = computed(() => {
  switch (settingsStatus.value) {
    case `loading`:
      return `正在读取你的配置`
    case `saving`:
      return `正在保存你的配置`
    case `saved`:
      return lastSavedAt.value
        ? `配置已同步`
        : `配置同步已开启`
    case `error`:
      return `配置同步失败`
    default:
      return `登录后自动同步个人配置`
  }
})

function onUpdate(value: boolean) {
  if (!value)
    emit(`close`)
}

function clearPasswords() {
  loginForm.password = ``
  registerForm.password = ``
  registerForm.confirmPassword = ``
  passwordForm.currentPassword = ``
  passwordForm.newPassword = ``
  passwordForm.confirmPassword = ``
}

function validateUsername(username: string): string | null {
  if (!/^\w{4,32}$/.test(username))
    return `用户名需为 4–32 位字母、数字或下划线`
  return null
}

function validatePassword(password: string): string | null {
  if (password.length < 8 || password.length > 72)
    return `密码长度需为 8–72 位`
  if (new TextEncoder().encode(password).length > 72)
    return `密码使用 UTF-8 编码后不能超过 72 字节`
  return null
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : `操作失败，请稍后再试`
}

async function handleLogin() {
  formError.value = validateUsername(loginForm.username.trim())
    ?? validatePassword(loginForm.password)
    ?? ``
  if (formError.value)
    return

  pendingAction.value = `login`
  try {
    await authStore.login({
      username: loginForm.username.trim(),
      password: loginForm.password,
    })
    await accountSettingsStore.bootstrap()
    loginForm.password = ``
    toast.success(`登录成功`)
  }
  catch (error) {
    formError.value = messageOf(error)
  }
  finally {
    pendingAction.value = null
  }
}

async function handleRegister() {
  formError.value = validateUsername(registerForm.username.trim())
    ?? validatePassword(registerForm.password)
    ?? (registerForm.password !== registerForm.confirmPassword ? `两次输入的密码不一致` : ``)
  if (formError.value)
    return

  pendingAction.value = `register`
  try {
    const outcome = await authStore.register({
      username: registerForm.username.trim(),
      password: registerForm.password,
      confirmPassword: registerForm.confirmPassword,
    })
    if (!outcome.autoLoggedIn) {
      loginForm.username = registerForm.username.trim()
      activeTab.value = `login`
      clearPasswords()
      await nextTick()
      formError.value = `注册已成功，但自动登录未完成：${outcome.loginError ?? '自动登录失败'}。请直接登录。`
      toast.success(`注册成功，请登录`)
      return
    }

    await accountSettingsStore.bootstrap()
    clearPasswords()
    toast.success(`注册成功，已自动登录`)
  }
  catch (error) {
    formError.value = messageOf(error)
  }
  finally {
    pendingAction.value = null
  }
}

async function handleLogout() {
  const previousLogin = user.value?.login ?? loginForm.username
  pendingAction.value = `logout`
  try {
    await authStore.logout()
    toast.success(`已退出登录`)
  }
  catch (error) {
    toast.error(messageOf(error))
  }
  finally {
    accountSettingsStore.reset()
    syncStore.reset()
    clearPasswords()
    loginForm.username = previousLogin
    registerForm.username = ``
    activeTab.value = `login`
    pendingAction.value = null
  }
}

async function handleChangePassword() {
  passwordError.value = validatePassword(passwordForm.newPassword)
    ?? (passwordForm.newPassword !== passwordForm.confirmPassword ? `两次输入的新密码不一致` : ``)
  if (!passwordForm.currentPassword)
    passwordError.value = `请输入当前密码`
  if (passwordError.value)
    return

  pendingAction.value = `password`
  try {
    await authStore.changePassword({
      currentPassword: passwordForm.currentPassword,
      newPassword: passwordForm.newPassword,
    })
    clearPasswords()
    toast.success(`密码已更新，请重新登录`)
  }
  catch (error) {
    passwordError.value = messageOf(error)
  }
  finally {
    pendingAction.value = null
  }
}

async function handleSettingsSync() {
  pendingAction.value = `settings`
  try {
    await accountSettingsStore.saveNow(true)
    toast.success(`个人配置已同步`)
  }
  catch (error) {
    toast.error(messageOf(error))
  }
  finally {
    pendingAction.value = null
  }
}

watch(activeTab, () => {
  formError.value = ``
})

watch(() => props.visible, (visible) => {
  if (visible) {
    formError.value = ``
    passwordError.value = ``
    return
  }
  clearPasswords()
})
</script>

<template>
  <Dialog :open="props.visible" @update:open="onUpdate">
    <DialogContent
      class="max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-2xl gap-0 overflow-hidden rounded-xl p-0 sm:max-w-2xl"
    >
      <DialogHeader class="space-y-1.5 border-b px-5 py-4 pr-12 sm:px-6">
        <DialogTitle class="flex items-center gap-2">
          <User class="size-5" />
          {{ isLoggedIn ? `我的账户` : `登录 mdlook` }}
        </DialogTitle>
        <DialogDescription>
          {{ isLoggedIn ? `个人排版、AI 凭据与私有 Skill 由你的账户独立管理。` : `登录后可同步个人配置，并使用加密 AI 凭据与私有 Skill。` }}
        </DialogDescription>
      </DialogHeader>

      <div v-if="!isConfigured" class="text-muted-foreground px-5 py-8 text-center text-sm sm:px-6">
        账户服务暂未配置，请检查 <code>VITE_ACCOUNT_API_URL</code>。
      </div>

      <div v-else-if="!isLoggedIn" class="max-h-[calc(100dvh-8rem)] overflow-y-auto px-5 py-5 sm:px-6">
        <Tabs v-model="activeTab" class="w-full">
          <TabsList class="grid h-11 w-full grid-cols-2">
            <TabsTrigger value="login" class="h-9">
              登录
            </TabsTrigger>
            <TabsTrigger value="register" class="h-9">
              注册
            </TabsTrigger>
          </TabsList>

          <div
            v-if="formError"
            role="alert"
            class="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 text-sm text-destructive"
          >
            {{ formError }}
          </div>

          <TabsContent value="login" class="mt-4">
            <form class="space-y-4" @submit.prevent="handleLogin">
              <div class="space-y-1.5">
                <Label for="account-login-username">用户名</Label>
                <Input
                  id="account-login-username"
                  v-model="loginForm.username"
                  class="h-11 text-base sm:text-sm"
                  autocomplete="username"
                  autocapitalize="none"
                  spellcheck="false"
                  maxlength="32"
                  placeholder="请输入用户名"
                />
              </div>

              <div class="space-y-1.5">
                <Label for="account-login-password">密码</Label>
                <div class="relative">
                  <Input
                    id="account-login-password"
                    v-model="loginForm.password"
                    :type="showLoginPassword ? 'text' : 'password'"
                    class="h-11 pr-11 text-base sm:text-sm"
                    autocomplete="current-password"
                    maxlength="72"
                    placeholder="请输入密码"
                  />
                  <button
                    type="button"
                    class="text-muted-foreground absolute right-0 top-0 grid size-11 place-items-center rounded-md"
                    :aria-label="showLoginPassword ? '隐藏密码' : '显示密码'"
                    @click="showLoginPassword = !showLoginPassword"
                  >
                    <EyeOff v-if="showLoginPassword" class="size-4" />
                    <Eye v-else class="size-4" />
                  </button>
                </div>
              </div>

              <Button type="submit" class="h-11 w-full gap-2" :disabled="pendingAction !== null">
                <Loader2 v-if="pendingAction === 'login'" class="size-4 animate-spin" />
                <LogIn v-else class="size-4" />
                登录
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="register" class="mt-4">
            <form class="space-y-4" @submit.prevent="handleRegister">
              <div class="space-y-1.5">
                <Label for="account-register-username">用户名</Label>
                <Input
                  id="account-register-username"
                  v-model="registerForm.username"
                  class="h-11 text-base sm:text-sm"
                  autocomplete="username"
                  autocapitalize="none"
                  spellcheck="false"
                  maxlength="32"
                  placeholder="4–32 位字母、数字或下划线"
                />
              </div>

              <div class="space-y-1.5">
                <Label for="account-register-password">密码</Label>
                <div class="relative">
                  <Input
                    id="account-register-password"
                    v-model="registerForm.password"
                    :type="showRegisterPassword ? 'text' : 'password'"
                    class="h-11 pr-11 text-base sm:text-sm"
                    autocomplete="new-password"
                    maxlength="72"
                    placeholder="8–72 位字符"
                  />
                  <button
                    type="button"
                    class="text-muted-foreground absolute right-0 top-0 grid size-11 place-items-center rounded-md"
                    :aria-label="showRegisterPassword ? '隐藏密码' : '显示密码'"
                    @click="showRegisterPassword = !showRegisterPassword"
                  >
                    <EyeOff v-if="showRegisterPassword" class="size-4" />
                    <Eye v-else class="size-4" />
                  </button>
                </div>
              </div>

              <div class="space-y-1.5">
                <Label for="account-register-confirm">确认密码</Label>
                <Input
                  id="account-register-confirm"
                  v-model="registerForm.confirmPassword"
                  type="password"
                  class="h-11 text-base sm:text-sm"
                  autocomplete="new-password"
                  maxlength="72"
                  placeholder="请再次输入密码"
                />
              </div>

              <Button type="submit" class="h-11 w-full gap-2" :disabled="pendingAction !== null">
                <Loader2 v-if="pendingAction === 'register'" class="size-4 animate-spin" />
                <UserPlus v-else class="size-4" />
                注册并登录
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <p class="text-muted-foreground mt-4 text-center text-xs leading-5">
          未登录时 AI Key 只保存在当前页面内存，不会默认写入本机；登录后可由你主动保存到加密云端。
        </p>
      </div>

      <div v-else class="max-h-[calc(100dvh-8rem)] space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
        <div class="flex items-center gap-3 rounded-lg border p-3">
          <img
            v-if="user?.avatar"
            :src="user.avatar"
            :alt="user?.login"
            class="size-11 shrink-0 rounded-full"
          >
          <div v-else class="bg-muted grid size-11 shrink-0 place-items-center rounded-full">
            <User class="size-5 text-muted-foreground" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 text-sm font-medium">
              <span class="truncate">{{ user?.name || user?.login }}</span>
              <template v-if="SYNC_PRO_ENABLED">
                <span
                  v-if="isPro"
                  class="bg-primary text-primary-foreground inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs"
                >
                  Pro
                </span>
                <span v-else class="bg-muted text-muted-foreground shrink-0 rounded px-1.5 py-0.5 text-xs uppercase">
                  Free
                </span>
              </template>
            </div>
            <div class="text-muted-foreground truncate text-xs">
              @{{ user?.login }}
            </div>
          </div>
        </div>

        <div
          class="rounded-lg border p-3"
          :class="{ 'border-destructive/30 bg-destructive/5': settingsStatus === 'error' }"
        >
          <div class="flex items-start gap-3">
            <Loader2 v-if="settingsStatus === 'loading' || settingsStatus === 'saving'" class="mt-0.5 size-4 shrink-0 animate-spin" />
            <CloudAlert v-else-if="settingsStatus === 'error'" class="mt-0.5 size-4 shrink-0 text-destructive" />
            <CheckCircle2 v-else-if="settingsStatus === 'saved'" class="mt-0.5 size-4 shrink-0 text-emerald-600" />
            <Cloud v-else class="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium">
                {{ settingsStatusText }}
              </p>
              <p class="text-muted-foreground mt-1 text-xs leading-5">
                主题、字号、标题样式和排版偏好；编辑模式与预览设备保留在本机。
              </p>
              <p v-if="settingsError" class="mt-1 break-words text-xs text-destructive">
                {{ settingsError }}
              </p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              class="size-10 shrink-0"
              title="立即同步配置"
              :disabled="pendingAction !== null"
              @click="handleSettingsSync"
            >
              <RefreshCw class="size-4" :class="{ 'animate-spin': pendingAction === 'settings' }" />
            </Button>
          </div>
        </div>

        <details class="group rounded-lg border">
          <summary class="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm font-medium">
            <ShieldCheck class="size-4 text-primary" />
            AI 密钥与私有文风 Skill
            <span class="ml-auto text-xs font-normal text-muted-foreground group-open:hidden">展开</span>
            <span class="ml-auto hidden text-xs font-normal text-muted-foreground group-open:inline">收起</span>
          </summary>
          <div class="border-t p-3">
            <AIAccountSecurity provider="deepseek" />
          </div>
        </details>

        <form class="space-y-3 rounded-lg border p-3" @submit.prevent="handleChangePassword">
          <div class="flex items-center gap-2 text-sm font-medium">
            <KeyRound class="size-4" />
            修改密码
          </div>

          <div
            v-if="passwordError"
            role="alert"
            class="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {{ passwordError }}
          </div>

          <div class="relative">
            <Input
              v-model="passwordForm.currentPassword"
              :type="showCurrentPassword ? 'text' : 'password'"
              class="h-11 pr-11 text-base sm:text-sm"
              autocomplete="current-password"
              maxlength="72"
              aria-label="当前密码"
              placeholder="当前密码"
            />
            <button
              type="button"
              class="text-muted-foreground absolute right-0 top-0 grid size-11 place-items-center rounded-md"
              :aria-label="showCurrentPassword ? '隐藏密码' : '显示密码'"
              @click="showCurrentPassword = !showCurrentPassword"
            >
              <EyeOff v-if="showCurrentPassword" class="size-4" />
              <Eye v-else class="size-4" />
            </button>
          </div>

          <div class="relative">
            <Input
              v-model="passwordForm.newPassword"
              :type="showNewPassword ? 'text' : 'password'"
              class="h-11 pr-11 text-base sm:text-sm"
              autocomplete="new-password"
              maxlength="72"
              aria-label="新密码"
              placeholder="新密码（8–72 位）"
            />
            <button
              type="button"
              class="text-muted-foreground absolute right-0 top-0 grid size-11 place-items-center rounded-md"
              :aria-label="showNewPassword ? '隐藏密码' : '显示密码'"
              @click="showNewPassword = !showNewPassword"
            >
              <EyeOff v-if="showNewPassword" class="size-4" />
              <Eye v-else class="size-4" />
            </button>
          </div>

          <Input
            v-model="passwordForm.confirmPassword"
            type="password"
            class="h-11 text-base sm:text-sm"
            autocomplete="new-password"
            maxlength="72"
            aria-label="确认新密码"
            placeholder="再次输入新密码"
          />

          <Button type="submit" variant="outline" class="h-11 w-full gap-2" :disabled="pendingAction !== null">
            <Loader2 v-if="pendingAction === 'password'" class="size-4 animate-spin" />
            <KeyRound v-else class="size-4" />
            更新密码
          </Button>
        </form>

        <Button
          variant="ghost"
          class="h-11 w-full gap-2 text-muted-foreground hover:text-destructive"
          :disabled="pendingAction !== null"
          @click="handleLogout"
        >
          <Loader2 v-if="pendingAction === 'logout'" class="size-4 animate-spin" />
          <LogOut v-else class="size-4" />
          退出登录
        </Button>
      </div>
    </DialogContent>
  </Dialog>
</template>
