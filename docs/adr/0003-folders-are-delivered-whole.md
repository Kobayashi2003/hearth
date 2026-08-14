# A folder is delivered whole, not paged

The explorer requested `page: 1, limit: 500` and there was no UI — no pager, no
infinite scroll, no "load more" — to ask for page two. The server was answering
`hasMore: true` and nobody read it, so a folder of 1 590 files showed 500 and
silently pretended the rest did not exist. They could not be scrolled to,
searched within, selected, or sorted into view.

Rather than build a pager, the listing is now fetched whole and both views
virtualise. Paging a file listing makes "select all", "sort" and End quietly
mean "…of this page", which is not what any of them should mean, and a file
manager that hides files is broken in a way a slow one is not.

## Consequences

**The cost is the JSON, not the DOM.** An entry is ~225 bytes, so 1 590 files is
323 KB and 54 ms. The DOM was the real expense: 500 tiles held 4 540 nodes and
made every arrow key a full re-render — 45 ms median, 137 ms worst, against
17 ms for the already-virtualised list. Virtualising the grid brought it to 37
tiles, 587 nodes and 17.7 ms.

**`MAX_PAGE_SIZE` is a safety valve, not a page size.** It is 20 000 — about
4.3 MB — so a pathological directory cannot pull tens of megabytes. When it
bites, the response still says `hasMore` and the explorer says so on screen
("showing the first N of M"). The failure mode is now visible instead of silent,
which was the whole problem.
