# Viewing state lives on the server, keyed by path

Reading and playback positions were scattered across three independent
`localStorage` keys (`useResumePosition`, `EpubViewer`, `TextViewer`), which
meant a position saved on a phone was invisible on a desktop and two Warden
users sharing one browser shared one history. Since Hearth is used from phone,
tablet and desktop interchangeably, and since "continue reading / continue
watching" is becoming a first-class entry point rather than a convenience inside
a viewer, this state is now owned by a server-side subsystem — **Ledger** —
persisted per user at `server/data/ledger/<userId>.json` and served over
`GET/PATCH /hearth-api/ledger`.

## Considered options

**Keep `localStorage`, merely unified and namespaced by user id.** Zero backend
risk and a day's work, but cross-device continuity is the entire point and this
cannot deliver it.

**Local-first with background sync.** Best playback behaviour — writes never
block on the network — but requires merge-conflict resolution and an offline
queue for a single-user home server that is on the same LAN most of the time.
Rejected as unearned complexity; revisit if write latency proves noticeable.

## Consequences

Ledger keys entries by **path**, not by a content fingerprint. Paths are
readable, debuggable, and need no reverse index or per-open disk hashing — but
they are not stable identities. Vault's rename/move and Ember's restore
therefore call `ledger.reprefix(from, to)` so that progress follows a file moved
*through Hearth*, including directory-level renames. A file renamed outside
Hearth — in Windows Explorer, say — loses its progress. This is accepted: the
alternative costs a disk read on every open and silently merges the progress of
two identical copies of the same file, which may or may not be wanted.
