---
status: accepted
date: 2026-07-26
---

# Keep each Account's Draft Library local-first and isolated

The reactive Post model remains the editor-facing projection, but durable drafts live in a guest or `user:<id>` Draft Library backed primarily by IndexedDB, with localStorage only as a compatibility fallback. Guest drafts are never transferred into an Account implicitly; a user may explicitly copy them from the draft-status popover, which creates new UUIDs, preserves the guest originals, renames title collisions as guest copies, and skips the same guest revision when repeated on the same device. Only cloud-safe Document fields cross the account backend seam, while file bindings, copy provenance, and local history stay on the device. Local edits enter a durable Outbox after a short debounce, server versions are updated with optimistic locking, and a Conflict creates a separate Conflict Copy instead of choosing a silent last writer. This costs more client-side coordination than one global localStorage array, but preserves offline writing, account privacy, and both sides of concurrent edits.
