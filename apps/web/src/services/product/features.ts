function envFlag(name: string, defaultValue = false): boolean {
  const env = import.meta.env as Record<string, string | undefined>
  const value = env[name]
  if (value === undefined || value === ``)
    return defaultValue
  return value === `true` || value === `1`
}

/**
 * mdlook keeps inherited doocs/md capabilities in code, but hides heavier
 * product surfaces by default so the app stays focused on writing and copying
 * Markdown for WeChat.
 */
export function isAccountFeatureEnabled(): boolean {
  return envFlag(`VITE_ACCOUNT_UI_ENABLED`)
}

export function isSyncFeatureEnabled(): boolean {
  return envFlag(`VITE_SYNC_UI_ENABLED`)
}

export function isShareFeatureEnabled(): boolean {
  return envFlag(`VITE_SHARE_UI_ENABLED`)
}

export function isAiFeatureEnabled(): boolean {
  return envFlag(`VITE_AI_UI_ENABLED`)
}

export function isFundFeatureEnabled(): boolean {
  return envFlag(`VITE_FUND_UI_ENABLED`)
}
