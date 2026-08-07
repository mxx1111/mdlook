---
status: accepted
---

# Keep Document identity independent from local file paths

Cloud Documents will use stable generated identities, while each device keeps its own Binding from that identity to an optional local Markdown path. A path cannot be the identity because paths differ across macOS, Windows, browser storage, renamed folders, and restored backups; keeping the Binding device-local also prevents one device from overwriting another device's filesystem assumptions. The trade-off is an explicit first-time “link this file” interaction, but it gives sync and conflict handling one durable seam.
