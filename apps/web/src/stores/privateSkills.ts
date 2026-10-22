import type { PrivateSkillRecord, PrivateSkillUpsert } from '@/services/ai/types'
import { useAuthStore } from '@/stores/auth'

export const WRITING_STYLE_SKILL_SLUG = `muxiong-writing-style`

interface PrivateSkillSession {
  generation: number
  token: string
  userId: string
}

class StalePrivateSkillSessionError extends Error {
  constructor() {
    super(`账户已切换，本次私有 Skill 操作已丢弃。`)
    this.name = `StalePrivateSkillSessionError`
  }
}

export const usePrivateSkillsStore = defineStore(`privateSkills`, () => {
  const authStore = useAuthStore()
  const skills = ref<PrivateSkillRecord[]>([])
  const loading = ref(false)
  const error = ref(``)
  let sessionGeneration = 0

  const writingStyleSkill = computed(
    () => skills.value.find(skill => skill.slug === WRITING_STYLE_SKILL_SLUG) ?? null,
  )
  const isWritingStyleSkillReady = computed(() => Boolean(writingStyleSkill.value?.enabled))

  function replaceRecord(record: PrivateSkillRecord): void {
    skills.value = [
      ...skills.value.filter(skill => skill.slug !== record.slug),
      record,
    ].sort((a, b) => a.name.localeCompare(b.name, `zh-CN`))
  }

  function currentSession(): PrivateSkillSession | null {
    const token = authStore.token
    const userId = authStore.user?.id
    return token && userId
      ? { generation: sessionGeneration, token, userId }
      : null
  }

  function isCurrentSession(session: PrivateSkillSession): boolean {
    return session.generation === sessionGeneration
      && session.token === authStore.token
      && session.userId === authStore.user?.id
      && authStore.isLoggedIn
  }

  function assertCurrentSession(session: PrivateSkillSession): void {
    if (!isCurrentSession(session))
      throw new StalePrivateSkillSessionError()
  }

  async function load(): Promise<void> {
    const session = currentSession()
    if (!session) {
      skills.value = []
      return
    }
    loading.value = true
    error.value = ``
    try {
      const records = await authStore.api.getPrivateSkills()
      assertCurrentSession(session)
      skills.value = records
    }
    catch (caught) {
      if (caught instanceof StalePrivateSkillSessionError)
        return
      error.value = `暂时无法读取私有 Skill，请稍后重试。`
    }
    finally {
      if (isCurrentSession(session))
        loading.value = false
    }
  }

  async function save(slug: string, payload: PrivateSkillUpsert): Promise<PrivateSkillRecord> {
    const session = currentSession()
    if (!session)
      throw new Error(`请先登录后再导入私有 Skill。`)
    const record = await authStore.api.updatePrivateSkill(slug, payload)
    assertCurrentSession(session)
    replaceRecord(record)
    return record
  }

  async function setEnabled(record: PrivateSkillRecord, enabled: boolean): Promise<PrivateSkillRecord> {
    const session = currentSession()
    if (!session)
      throw new Error(`请先登录后再修改私有 Skill。`)
    const updated = await authStore.api.setPrivateSkillEnabled(record.slug, record.version, enabled)
    assertCurrentSession(session)
    replaceRecord(updated)
    return updated
  }

  async function remove(record: PrivateSkillRecord): Promise<void> {
    const session = currentSession()
    if (!session)
      throw new Error(`请先登录后再删除私有 Skill。`)
    await authStore.api.deletePrivateSkill(record.slug, record.version)
    assertCurrentSession(session)
    skills.value = skills.value.filter(skill => skill.slug !== record.slug)
  }

  watch(
    () => [authStore.token, authStore.user?.id] as const,
    async ([token, userId]) => {
      sessionGeneration += 1
      skills.value = []
      loading.value = false
      error.value = ``
      if (token && userId)
        await load()
    },
    { immediate: true },
  )

  return {
    skills,
    loading,
    error,
    writingStyleSkill,
    isWritingStyleSkillReady,
    load,
    save,
    setEnabled,
    remove,
  }
})
