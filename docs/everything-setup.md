# Everything setup

Hearth delegates recursive search to [Everything](https://www.voidtools.com/)
(voidtools), which indexes NTFS volumes by reading the Master File Table and
stays current through the USN change journal. Hearth never builds an index of
its own.

Everything is **optional**. Without it, Hearth falls back to a filesystem walk
(the `walk` provider) — correct, but slower on a large tree, and the only option
on a non-Windows host.

---

## > ⚠ Bind the Everything HTTP server to loopback only

**The Everything HTTP server will serve and download the contents of any indexed
file, with no authentication of its own.** If it listens on anything other than
`127.0.0.1`, it becomes a second, unauthenticated door into the filesystem, and
Hearth's own login, permissions, and path containment become irrelevant — an
attacker simply talks to Everything instead.

Set the bind address to `127.0.0.1`. Set HTTP credentials as well, even on
loopback, so another local process cannot read files through it.

Hearth logs a warning at startup if `HEARTH_EVERYTHING_URL` does not point at a
loopback address.

---

## Steps

1. **Install Everything** — the 64-bit installer from
   <https://www.voidtools.com/downloads/>. The installing account needs
   administrator rights so Everything can read the MFT.

2. **Confirm your volumes are indexed** — *Tools → Options → Indexes → NTFS*.
   Each volume holding a Hearth root must be listed with *Include in database*
   enabled. Non-NTFS volumes (exFAT, network shares) need the slower *Folders*
   indexing mode instead; add them under *Indexes → Folders*.

3. **Enable the HTTP server** — *Tools → Options → HTTP Server*:

   | Setting | Value |
   |---|---|
   | Enable HTTP Server | ✅ |
   | HTTP Server listen address | `127.0.0.1` |
   | HTTP Server port | `8081` (any free port; must not collide with Hearth's `5111`) |
   | HTTP Server username | pick one |
   | HTTP Server password | pick one |

4. **Point Hearth at it** — in `.env`:

   ```ini
   HEARTH_SEARCH_PROVIDER=auto
   HEARTH_EVERYTHING_URL=http://127.0.0.1:8081
   HEARTH_EVERYTHING_USERNAME=your-username
   HEARTH_EVERYTHING_PASSWORD=your-password
   ```

   `auto` uses Everything when it answers and falls back to the walk provider
   when it does not. `everything` forces it; `walk` disables it entirely.

5. **Verify** — with Everything running:

   ```bash
   curl -u user:pass "http://127.0.0.1:8081/?s=test&j=1&c=3"
   ```

   A JSON body with `totalResults` and a `results` array means it is working.
   Hearth's own view of this is at `GET /api/system/search-status`, and in the
   UI under *Settings → Search*.

---

## Response-shape compatibility

Everything's JSON field types are not fully pinned down by its public
documentation and have varied between versions. Rather than assume one shape,
`server/src/adapters/everything/parse.ts` accepts every form observed in the
wild, and `test/server/everything.test.ts` covers each:

| Field | Accepted forms |
|---|---|
| `totalResults` | number, numeric string, absent (falls back to the row count) |
| `size` | number, numeric string, `-1` or absent for folders |
| `date_modified` | Windows FILETIME (100 ns ticks since 1601-01-01), epoch milliseconds, ISO 8601 string |
| directory marker | `type: "folder"` |

If a future version of Everything reports something not on this list, dates or
sizes will read as `0` rather than corrupting — fix it in `parse.ts` and add the
form to the test.

> **Not yet verified against a live instance.** The parser was written against
> the documented and community-reported shapes; Everything was not installed on
> the development machine. Run the `curl` in step 5 and compare against the
> table above before relying on Everything in production.

---

## What Hearth asks Everything for

Every query is confined to the active root, and re-verified afterwards:

```
path:"<absolute-root>\<scope>" ext:jpg;png;… "term1" "term2"
```

- **Scoping** — `path:` restricts the search to the active root's subtree.
- **Escaping** — Everything's query language gives `|`, `!`, `<>` and `"`
  meaning. Every user term is wrapped in double quotes, inside which content is
  literal, and any embedded quote is stripped. User input is data, never syntax.
- **Containment** — every returned path is re-checked against the active root
  before it leaves the server (`Vault.adopt`). Everything's index is not
  permission-aware and knows nothing of Hearth's root, so a query-syntax mistake
  must not become a path disclosure. This is a security boundary, tested in
  `test/server/search-containment.test.ts`.
- **Push-down** — filtering (`ext:`), sorting (`sort`, `ascending`), and
  pagination (`o`, `c`) all happen inside Everything, so totals are exact and
  large roots stay fast.

---

## Known constraints

| Constraint | Consequence |
|---|---|
| Windows only | The walk provider is what keeps Hearth nominally portable. |
| NTFS for instant indexing | Other filesystems need Everything's slower folder mode. |
| Name and path search only | No content/full-text search. Not a regression — Hearth never had one. |
| No directory sizes | Folder sizes are not shown in search results. |
| A second process must run | Document it as a prerequisite; Hearth detects its absence and degrades. |
