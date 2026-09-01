import type { AccountSettingsRecord, UserPreferenceSnapshot } from '@/services/account/types'
import { ApiError } from '@/services/account/client'
import { mergeUserPreferenceSnapshots } from '@/services/account/settingsMerge'
import { useAuthStore } from '@/stores/auth'
import { useThemeStore } from '@/stores/theme'

export type AccountSettingsStatus = `idle` | `loading` | `saving` | `saved` | `error`

const SAVE_DEBOUNCE_MS = 1000

interface SettingsSession {
  generation: number
  userId: string
}

interface SettingsSaveResult {
  record: AccountSettingsRecord
  settings: UserPreferenceSnapshot
}

class StaleSettingsSessionError extends Error {
  constructor() {
    super(`账户配置会话已切换`)
    this.name = `StaleSettingsSessionError`
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== `object` || Array.isArray(value))
    return null
  return value as Record<string, unknown>
}

function parseSettings(value: unknown): UserPreferenceSnapshot | null {
  if (typeof value === `string`) {
    try {
      return parseSettings(JSON.parse(value))
    }
    catch {
      return null
    }
  }

  const root = asRecord(value)
  const theme = asRecord(root?.theme)
  const headingStyles = asRecord(theme?.headingStyles)
  const formatting = asRecord(root?.formatting)
  if (
    root?.schemaVersion !== 1
    || !theme
    || !headingStyles
    || !formatting
    || typeof theme.name !== `string`
    || typeof theme.fontFamily !== `string`
    || typeof theme.fontSize !== `string`
    || typeof theme.primaryColor !== `string`
    || typeof theme.codeBlockTheme !== `string`
    || typeof theme.showLineNumber !== `boolean`
    || typeof theme.macCodeBlock !== `boolean`
    || typeof formatting.useIndent !== `boolean`
    || typeof formatting.useJustify !== `boolean`
    || typeof formatting.citeLinks !== `boolean`
    || typeof formatting.countWords !== `boolean`
    || typeof formatting.legend !== `string`
  ) {
    return null
  }

  const normalizedHeadingStyles: UserPreferenceSnapshot[`theme`][`headingStyles`] = {}
  for (const level of [`h1`, `h2`, `h3`, `h4`, `h5`, `h6`] as const) {
    const style = headingStyles[level]
    if (typeof style === `string`)
      normalizedHeadingStyles[level] = style as typeof normalizedHeadingStyles[typeof level]
  }

  // 只提取服务端白名单字段，旧快照中的 editor 等设备偏好不会被继续传播。
  return {
    schemaVersion: 1,
    theme: {
      name: theme.name,
      fontFamily: theme.fontFamily,
      fontSize: theme.fontSize,
      primaryColor: theme.primaryColor,
      codeBlockTheme: theme.codeBlockTheme,
      headingStyles: normalizedHeadingStyles,
      showLineNumber: theme.showLineNumber,
      macCodeBlock: theme.macCodeBlock,
    },
    formatting: {
      useIndent: formatting.useIndent,
      useJustify: formatting.useJustify,
      citeLinks: formatting.citeLinks,
      countWords: formatting.countWords,
      legend: formatting.legend,
    },
  }
}

function normalizeSettingsRecord(value: AccountSettingsRecord | null | undefined): AccountSettingsRecord {
  const raw = asRecord(value)
  return {
    settings: parseSettings(raw?.settings),
    version: typeof raw?.version === `number`
      ? raw.version
      : typeof raw?.baseVersion === `number`
        ? raw.baseVersion
        : 0,
    updatedAt: typeof raw?.updatedAt === `number` ? raw.updatedAt : null,
  }
}

/**
 * 账户配置同步 Store。
 *
 * 只在这里组装明确的非敏感字段；AI Key、公众号凭据和图床密钥不会进入快照，
 * 也不会被传给服务器。
 */
export const useAccountSettingsStore = defineStore(`accountSettings`, () => {
  const authStore = useAuthStore()
  const themeStore = useThemeStore()

  const status = ref<AccountSettingsStatus>(`idle`)
  const lastError = ref(``)
  const remoteVersion = ref(0)
  const lastSavedAt = ref<number | null>(null)

  let activeUserId = ``
  let ready = false
  let applyingRemote = false
  let watcherStarted = false
  let saveTimer: ReturnType<typeof setTimeout> | null = null
  let savePromise: Promise<void> | null = null
  let saveAfterCurrent = false
  let lastSerialized = ``
  let lastSyncedSettings: UserPreferenceSnapshot | null = null
  let sessionGeneration = 0
  let saveSequence = 0

  function isCurrentSession(session: SettingsSession): boolean {
    return session.generation === sessionGeneration
      && activeUserId === session.userId
      && authStore.isLoggedIn
      && authStore.user?.id === session.userId
  }

  function assertCurrentSession(session: SettingsSession): void {
    if (!isCurrentSession(session))
      throw new StaleSettingsSessionError()
  }

  function getCurrentSession(): SettingsSession | null {
    const userId = authStore.user?.id
    if (!authStore.isLoggedIn || !userId || activeUserId !== userId)
      return null
    return {
      generation: sessionGeneration,
      userId,
    }
  }

  function snapshot(): UserPreferenceSnapshot {
    return {
      schemaVersion: 1,
      theme: {
        name: themeStore.theme,
        fontFamily: themeStore.fontFamily,
        fontSize: themeStore.fontSize,
        primaryColor: themeStore.primaryColor,
        codeBlockTheme: themeStore.codeBlockTheme,
        headingStyles: { ...themeStore.headingStyles },
        showLineNumber: themeStore.isShowLineNumber,
        macCodeBlock: themeStore.isMacCodeBlock,
      },
      formatting: {
        useIndent: themeStore.isUseIndent,
        useJustify: themeStore.isUseJustify,
        citeLinks: themeStore.isCiteStatus,
        countWords: themeStore.isCountStatus,
        legend: themeStore.legend,
      },
    }
  }

  async function applySettings(
    settings: UserPreferenceSnapshot,
    session: SettingsSession,
  ): Promise<void> {
    assertCurrentSession(session)
    applyingRemote = true
    try {
      themeStore.theme = settings.theme.name
      themeStore.fontFamily = settings.theme.fontFamily
      themeStore.fontSize = settings.theme.fontSize
      themeStore.primaryColor = settings.theme.primaryColor
      themeStore.codeBlockTheme = settings.theme.codeBlockTheme
      themeStore.headingStyles = { ...settings.theme.headingStyles }
      themeStore.isShowLineNumber = settings.theme.showLineNumber
      themeStore.isMacCodeBlock = settings.theme.macCodeBlock

      themeStore.isUseIndent = settings.formatting.useIndent
      themeStore.isUseJustify = settings.formatting.useJustify
      themeStore.isCiteStatus = settings.formatting.citeLinks
      themeStore.isCountStatus = settings.formatting.countWords
      themeStore.legend = settings.formatting.legend

      await nextTick()
      assertCurrentSession(session)
      await themeStore.applyCurrentTheme()
      assertCurrentSession(session)
      themeStore.updateCodeTheme()
    }
    finally {
      applyingRemote = false
    }
  }

  function clearTimer(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
  }

  function reset(): void {
    sessionGeneration += 1
    clearTimer()
    activeUserId = ``
    ready = false
    applyingRemote = false
    remoteVersion.value = 0
    lastSavedAt.value = null
    lastSerialized = ``
    lastSyncedSettings = null
    saveAfterCurrent = false
    saveSequence += 1
    savePromise = null
    lastError.value = ``
    status.value = `idle`
  }

  async function putWithLatestVersion(
    settings: UserPreferenceSnapshot,
    baseSettings: UserPreferenceSnapshot | null,
    session: SettingsSession,
  ): Promise<SettingsSaveResult> {
    assertCurrentSession(session)
    try {
      const saved = normalizeSettingsRecord(
        await authStore.api.updateSettings(settings, remoteVersion.value),
      )
      assertCurrentSession(session)
      return {
        record: saved,
        settings: saved.settings ?? settings,
      }
    }
    catch (error) {
      assertCurrentSession(session)
      if (!(error instanceof ApiError) || error.status !== 409)
        throw error

      // 多端同时修改时重新读取版本，再以本次明确的本地操作重试一次。
      const latest = normalizeSettingsRecord(await authStore.api.getSettings())
      assertCurrentSession(session)
      const merged = latest.settings
        ? mergeUserPreferenceSnapshots(baseSettings, settings, latest.settings)
        : settings
      const saved = normalizeSettingsRecord(
        await authStore.api.updateSettings(merged, latest.version),
      )
      assertCurrentSession(session)
      return {
        record: saved,
        settings: saved.settings ?? merged,
      }
    }
  }

  async function saveNow(force = false): Promise<void> {
    clearTimer()
    const session = getCurrentSession()
    if (!ready || !session || applyingRemote)
      return
    if (savePromise) {
      saveAfterCurrent = true
      return savePromise
    }

    const settings = snapshot()
    const baseSettings = lastSyncedSettings
    const serialized = JSON.stringify(settings)
    if (!force && serialized === lastSerialized)
      return

    const saveId = ++saveSequence
    const currentSavePromise = (async () => {
      status.value = `saving`
      lastError.value = ``
      try {
        const result = await putWithLatestVersion(settings, baseSettings, session)
        assertCurrentSession(session)
        remoteVersion.value = result.record.version
        lastSyncedSettings = result.settings

        // 把远端独有改动带回当前界面，同时保留请求期间发生的新本地改动。
        const currentSettings = snapshot()
        const reconciled = mergeUserPreferenceSnapshots(settings, currentSettings, result.settings)
        if (JSON.stringify(reconciled) !== JSON.stringify(currentSettings))
          await applySettings(reconciled, session)
        assertCurrentSession(session)

        lastSerialized = JSON.stringify(result.settings)
        lastSavedAt.value = Date.now()
        status.value = `saved`
      }
      catch (error) {
        if (error instanceof StaleSettingsSessionError || !isCurrentSession(session))
          return
        lastError.value = error instanceof Error ? error.message : String(error)
        status.value = `error`
        throw error
      }
      finally {
        if (saveSequence === saveId) {
          savePromise = null
          if (isCurrentSession(session) && saveAfterCurrent) {
            saveAfterCurrent = false
            scheduleSave()
          }
        }
      }
    })()
    savePromise = currentSavePromise

    return currentSavePromise
  }

  function scheduleSave(): void {
    if (!ready || !authStore.isLoggedIn || applyingRemote)
      return
    clearTimer()
    saveTimer = setTimeout(() => {
      saveTimer = null
      void saveNow().catch(() => {})
    }, SAVE_DEBOUNCE_MS)
  }

  function startWatcher(): void {
    if (watcherStarted)
      return
    watcherStarted = true

    watch(snapshot, scheduleSave, { deep: true, flush: `post` })
    watch(
      () => authStore.token,
      (token) => {
        if (!token)
          reset()
      },
    )
  }

  async function bootstrap(): Promise<void> {
    startWatcher()
    if (!authStore.isLoggedIn || !authStore.user)
      return

    const userId = authStore.user.id
    if (ready && activeUserId === userId)
      return

    clearTimer()
    sessionGeneration += 1
    ready = false
    activeUserId = userId
    const session: SettingsSession = {
      generation: sessionGeneration,
      userId,
    }
    status.value = `loading`
    lastError.value = ``

    try {
      const remote = normalizeSettingsRecord(await authStore.api.getSettings())
      assertCurrentSession(session)
      remoteVersion.value = remote.version

      if (remote.settings) {
        await applySettings(remote.settings, session)
        assertCurrentSession(session)
        lastSyncedSettings = remote.settings
        lastSerialized = JSON.stringify(remote.settings)
        lastSavedAt.value = remote.updatedAt ?? Date.now()
        status.value = `saved`
        ready = true
        return
      }

      // 新账户没有云端配置时，以当前设备的偏好作为初始配置。
      lastSyncedSettings = null
      ready = true
      await saveNow(true)
    }
    catch (error) {
      if (error instanceof StaleSettingsSessionError || !isCurrentSession(session))
        return
      ready = true
      lastError.value = error instanceof Error ? error.message : String(error)
      status.value = `error`
    }
  }

  return {
    status,
    lastError,
    remoteVersion,
    lastSavedAt,
    snapshot,
    bootstrap,
    saveNow,
    reset,
  }
})
