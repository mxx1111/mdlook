---
status: accepted
---

# Encrypt AI secrets and keep private Skills behind the account seam

mdlook stores AI provider credentials and private writing Skills outside ordinary
user settings. Credentials and Skill file contents are encrypted with
AES-256-GCM using a fresh nonce for every write; the master key is supplied only
through the backend environment and is never stored in MySQL or returned to a
client. Metadata endpoints expose masks, versions, hashes and manifests, not
plaintext. The backend calls a fixed allowlist of AI providers, so browsers and
desktop clients do not need a decrypted provider key and cannot turn the server
into an arbitrary proxy.

The Web bundle contains only the Skill-management interface. A user's writing
rules and corpus are imported into that user's private library, selected by
slug, and loaded by the backend only for an authenticated AI request. The
implementation retrieves the core instructions plus task-relevant references
and at most two samples rather than sending the whole bundle on every call.

This adds server-side key management and rotation work, but it prevents ordinary
configuration sync, logs and public frontend assets from becoming secret or
personal-corpus storage.
