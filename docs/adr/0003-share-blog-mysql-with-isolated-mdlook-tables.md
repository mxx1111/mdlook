---
status: accepted
---

# Share the blog MySQL database through isolated mdlook tables

mdlook account and User Configuration data will be served by the existing blog Spring Boot backend and stored in the `blog-new` MySQL database, using tables prefixed with `mdlook_`. mdlook will not reuse the blog administrator or game-user tables, authentication logic, password format, or ownership rules. The backend owns password verification, Sa-Token sessions, validation, and optimistic version checks; clients only consume the `/mdlook` API. Existing Cloudflare D1 account and sync code remains disabled while this path is active so that one Account cannot diverge across two authorities. Sharing the deployed database reduces infrastructure and operating work, while the prefix and module boundary preserve an extraction path if mdlook later needs an independent service. The trade-off is deployment and availability coupling with the blog backend.
