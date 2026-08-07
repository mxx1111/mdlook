/** 是否运行在 Tauri 桌面环境（WKWebView 屏蔽了富文本剪贴板 API） */
function isTauri(): boolean {
  return typeof window !== `undefined`
    && (`__TAURI_INTERNALS__` in window || `__TAURI__` in window)
}

/** 桌面端：通过 Tauri 原生剪贴板写入，绕开 WKWebView 的限制 */
async function tauriCopy(cmd: string, args: Record<string, unknown>): Promise<boolean> {
  try {
    const { invoke } = await import(`@tauri-apps/api/core`)
    await invoke(cmd, args)
    return true
  }
  catch {
    return false
  }
}

function legacyCopy(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const textarea = document.createElement(`textarea`)
      textarea.value = text
      textarea.setAttribute(`readonly`, `true`)
      textarea.style.position = `fixed`
      textarea.style.opacity = `0`
      document.body.appendChild(textarea)

      textarea.select()
      const ok = document.execCommand(`copy`)
      document.body.removeChild(textarea)

      ok ? resolve() : reject(new Error(`execCommand failed`))
    }
    catch (err) {
      reject(err)
    }
  })
}

export async function copyPlain(text: string): Promise<void> {
  if (isTauri() && await tauriCopy(`copy_text`, { text }))
    return

  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return
    }
    catch {
    }
  }
  await legacyCopy(text)
}

export async function copyHtml(html: string, fallback?: string): Promise<void> {
  const plain = fallback ?? html.replace(/<[^>]+>/g, ``)

  if (isTauri() && await tauriCopy(`copy_html`, { html, text: plain }))
    return

  if (window.isSecureContext && navigator.clipboard?.write) {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([html], { type: `text/html` }),
        'text/plain': new Blob([plain], { type: `text/plain` }),
      })
      await navigator.clipboard.write([item])
      return
    }
    catch {
    }
  }
  await copyPlain(plain)
}
