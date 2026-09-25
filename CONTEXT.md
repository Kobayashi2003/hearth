# Hearth

A personal file server for files that live at home, on hardware you own — the
network's only job is to let you reach them from somewhere else. It is equally
a **browser** of those files and a **viewer** of what is inside them.

## Language

### Subsystems

**Vault**: the root tree and reaching a file safely — path resolution,
containment, listing, file operations, upload and download.
_Avoid_: filesystem layer, storage

**Beacon**: name search, whichever provider (Everything or a folder walk) answers.
_Avoid_: index, indexer

**Kiln**: turning a file on disk into something a browser can show — streaming,
transcode, thumbnails, comic/Office/PSD/HTML rendering.
_Avoid_: media service, converter

**Warden**: who you are and what you may touch — login, sessions, per-path rules.
_Avoid_: auth module, ACL

**Ember**: the recycle bin. A deleted item is in Ember until purged.
_Avoid_: trash service

**Ledger**: per user, where you were in each file — a Progress per path, plus a
viewer's own reading session (the EPUB reader's position, bookmarks and
highlights). Lives on the server so it follows you across devices.
_Avoid_: history, recent, watch state

**Hob**: per user, how you like things set — theme, density, view, wallpaper.
Stored apart from Ledger because it is written rarely and Ledger constantly.
_Avoid_: settings, config

### Concepts

**Preview**: opening a file's contents on the full-screen stage. One at a time;
Back or Escape closes it. Audio keeps playing afterwards in the mini player.
_Avoid_: lightbox, modal

**Viewer**: the renderer a Preview uses, chosen by file kind (image, video,
audio, text, comic, archive, epub, office, html, pdf, flash).
_Avoid_: player, reader — except for the EPUB component's own name

**Gallery**: the same-kind siblings of the previewed file in the listing it was
opened from; ←/→ and next/previous step through it.

**Progress**: how far through a file you are, in its own unit — seconds, page,
or an opaque locator — always with a 0–100 percent for drawing a bar.
_Avoid_: bookmark, resume point

**Focus** vs **Selection**: Focus is the one item the keyboard points at;
Selection is the set an operation applies to. They are independent.

### Adaptation

Layout follows **width** (sidebar or drawer at 1024px; column count); ergonomics
follow the **pointer** (row height, long-press, hit areas). A phone in landscape
is wide *and* touched; a narrow desktop window is small *and* moused.
