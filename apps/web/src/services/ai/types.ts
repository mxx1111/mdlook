export type AIRequestMode = `direct` | `proxy`

export interface AICredentialRecord {
  provider: string
  maskedKey: string
  version: number
  updatedAt?: string | number | null
}

export interface AICredentialUpdate {
  apiKey: string
  version: number
}

export type PrivateSkillFileRole = `core` | `reference` | `sample`

export interface PrivateSkillFileInput {
  path: string
  role: PrivateSkillFileRole
  content: string
}

export interface PrivateSkillFileManifest {
  path: string
  role: PrivateSkillFileRole
  sha256: string
  byteSize: number
}

export interface PrivateSkillRecord {
  skillUuid: string
  slug: string
  name: string
  version: number
  contentHash: string
  fileCount: number
  totalBytes: number
  enabled: boolean
  updatedAt?: number | null
  manifest: PrivateSkillFileManifest[]
}

export interface PrivateSkillUpsert {
  name: string
  version: number
  enabled: boolean
  files: PrivateSkillFileInput[]
}

export interface AIChatMessage {
  role: `assistant` | `system` | `user`
  content: string
}

export interface AIChatPayload {
  model: string
  messages: AIChatMessage[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
}

export interface AIProxyChatPayload extends AIChatPayload {
  provider: string
  skill_slugs?: string[]
  task?: string
}
