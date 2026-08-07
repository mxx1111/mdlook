# mdlook Writing and Sync

mdlook helps authors write Markdown, format it for WeChat, and keep their work available across local files and signed-in devices.

## Language

**Document**:
An authored Markdown work with a stable identity, title, content, and revision history.
_Avoid_: Post, article record

**File-backed Document**:
A Document whose working content is bound to a Markdown file chosen by the user.
_Avoid_: Local post, disk article

**Cloud Document**:
A Document available to the same signed-in user on more than one device.
_Avoid_: Synced file, online post

**Draft Document**:
A Document that is recoverable locally but is not yet bound to a user-chosen Markdown file.
_Avoid_: Temporary file, cache entry

**Draft Library**:
The isolated collection of Draft Documents belonging either to the guest identity or to exactly one Account.
_Avoid_: Workspace, global drafts

**Workspace**:
A user-selected folder whose Markdown files are available for browsing and editing.
_Avoid_: Project, repository

**Guest Workspace**:
The browser-local Workspace used before sign-in. Its Documents remain usable
offline and are never exposed to another Account on the same device.
_Avoid_: Anonymous cloud account, temporary memory

**Account Workspace**:
The user-scoped local Replica set and outbox associated with one Account.
_Avoid_: Global browser drafts, shared local storage

**Binding**:
The device-local association between a Document and a file path.
_Avoid_: Cloud path, synced path

**Replica**:
One device's editable copy of a Cloud Document.
_Avoid_: Cache, backup

**Revision**:
An immutable saved state of a Document used for history, comparison, and conflict recovery.
_Avoid_: Autosave, snapshot row

**Conflict**:
A state in which two Replicas changed from the same Revision and neither change can be safely discarded.
_Avoid_: Latest wins, sync error

**Conflict Copy**:
A new Draft Document that preserves one Replica when a Conflict prevents safely updating the original Document.
_Avoid_: Overwritten version, error backup

**Account**:
A durable user identity that owns private Cloud Documents and can be reached through one or more Login Methods.
_Avoid_: GitHub user, database user row

**Login Method**:
A verified way to access an Account, such as a username and Password Credential or an external identity provider.
_Avoid_: Account type, user source

**Password Credential**:
An Account's normalized username and irreversible password verifier used by the first-party login flow.
_Avoid_: Plaintext password, reversible password, password row

**Formatting Profile**:
A reusable set of presentation preferences and AI layout instructions applied to a Document.
_Avoid_: Theme, AI key

**User Configuration**:
A versioned, non-secret preference owned by an Account and eligible for synchronization across devices.
_Avoid_: Secret Configuration, local storage dump

**Device Preference**:
A non-secret preference intentionally kept on one device because it depends on its form factor or local workflow.
_Avoid_: User Configuration, cloud default

**Secret Configuration**:
A provider credential stored separately from User Configuration, encrypted by
the backend and used only through a controlled provider adapter. Clients may
create, replace or remove it and see a mask, but cannot read the plaintext back.
_Avoid_: Synced setting JSON, localStorage key, decrypted credential response

**Private Skill**:
An Account-owned, versioned bundle of writing instructions, references and
samples used by the Authoring Assistant. Its files are encrypted and are not
part of the public Web bundle.
_Avoid_: Public prompt, built-in theme, global corpus

**Authoring Assistant**:
The module that applies a selected Private Skill and provider to a Document,
returns a candidate revision, and requires an explicit preview/accept step.
_Avoid_: Direct overwrite, browser-to-provider fetch
