import type { HeadingLevel } from '@md/shared/configs'
import type { UserPreferenceSnapshot } from './types'

const HEADING_LEVELS: HeadingLevel[] = [`h1`, `h2`, `h3`, `h4`, `h5`, `h6`]

function mergeLeaf<T>(base: T, local: T, remote: T): T {
  const localChanged = !Object.is(local, base)
  const remoteChanged = !Object.is(remote, base)

  // 本地独有改动和同一叶冲突都保留本地；仅远端改动才采用远端。
  if (localChanged)
    return local
  if (remoteChanged)
    return remote
  return local
}

function copySnapshot(settings: UserPreferenceSnapshot): UserPreferenceSnapshot {
  return {
    schemaVersion: 1,
    theme: {
      name: settings.theme.name,
      fontFamily: settings.theme.fontFamily,
      fontSize: settings.theme.fontSize,
      primaryColor: settings.theme.primaryColor,
      codeBlockTheme: settings.theme.codeBlockTheme,
      headingStyles: { ...settings.theme.headingStyles },
      showLineNumber: settings.theme.showLineNumber,
      macCodeBlock: settings.theme.macCodeBlock,
    },
    formatting: {
      useIndent: settings.formatting.useIndent,
      useJustify: settings.formatting.useJustify,
      citeLinks: settings.formatting.citeLinks,
      countWords: settings.formatting.countWords,
      legend: settings.formatting.legend,
    },
  }
}

/**
 * 基于最后同步快照合并当前设备与服务端配置。
 *
 * 该接口只接受 UserPreferenceSnapshot，因此密钥及 editorType、previewDevice
 * 等设备偏好无法进入合并结果。首次同步没有共同基线时，确定性地保留本地快照。
 */
export function mergeUserPreferenceSnapshots(
  base: UserPreferenceSnapshot | null,
  local: UserPreferenceSnapshot,
  remote: UserPreferenceSnapshot,
): UserPreferenceSnapshot {
  if (!base)
    return copySnapshot(local)

  const headingStyles: UserPreferenceSnapshot[`theme`][`headingStyles`] = {}
  for (const level of HEADING_LEVELS) {
    const merged = mergeLeaf(
      base.theme.headingStyles[level],
      local.theme.headingStyles[level],
      remote.theme.headingStyles[level],
    )
    if (merged !== undefined)
      headingStyles[level] = merged
  }

  return {
    schemaVersion: 1,
    theme: {
      name: mergeLeaf(base.theme.name, local.theme.name, remote.theme.name),
      fontFamily: mergeLeaf(base.theme.fontFamily, local.theme.fontFamily, remote.theme.fontFamily),
      fontSize: mergeLeaf(base.theme.fontSize, local.theme.fontSize, remote.theme.fontSize),
      primaryColor: mergeLeaf(base.theme.primaryColor, local.theme.primaryColor, remote.theme.primaryColor),
      codeBlockTheme: mergeLeaf(base.theme.codeBlockTheme, local.theme.codeBlockTheme, remote.theme.codeBlockTheme),
      headingStyles,
      showLineNumber: mergeLeaf(
        base.theme.showLineNumber,
        local.theme.showLineNumber,
        remote.theme.showLineNumber,
      ),
      macCodeBlock: mergeLeaf(
        base.theme.macCodeBlock,
        local.theme.macCodeBlock,
        remote.theme.macCodeBlock,
      ),
    },
    formatting: {
      useIndent: mergeLeaf(
        base.formatting.useIndent,
        local.formatting.useIndent,
        remote.formatting.useIndent,
      ),
      useJustify: mergeLeaf(
        base.formatting.useJustify,
        local.formatting.useJustify,
        remote.formatting.useJustify,
      ),
      citeLinks: mergeLeaf(
        base.formatting.citeLinks,
        local.formatting.citeLinks,
        remote.formatting.citeLinks,
      ),
      countWords: mergeLeaf(
        base.formatting.countWords,
        local.formatting.countWords,
        remote.formatting.countWords,
      ),
      legend: mergeLeaf(
        base.formatting.legend,
        local.formatting.legend,
        remote.formatting.legend,
      ),
    },
  }
}
