---
status: accepted
---

# Use first-party username and password as the primary login method

mdlook will use an in-app username and password as its primary Login Method. The service normalizes usernames, stores only an adaptive one-way password verifier such as BCrypt, returns generic authentication errors, rate-limits failed attempts, and issues revocable Sa-Token sessions. GitHub OAuth is not required for normal use and will not be the primary entry point. This works consistently in Web and Tauri without depending on an overseas redirect or a transactional email provider. Because the first version does not collect a verified recovery channel, it will support changing the password while signed in and an explicit administrator reset, but not an automated “forgot password” flow. A verified email, passkey, Apple, or WeChat method can be linked later without changing Account ownership.
