# Hearth

A personal file server for files that live at home, on hardware you own — the
network's only job is to let you sit by them from somewhere else. It is equally
a **browser** of those files and a **reader/viewer** of what is inside them.

## Language

### Subsystems

**Vault**:
The root tree and everything about reaching a file safely — path resolution,
containment checks, listing, file operations.
_Avoid_: filesystem layer, storage

**Beacon**:
Name search across the tree, whichever provider answers it.
_Avoid_: index, indexer, search engine

**Kiln**:
The transform layer that turns a file on disk into something a browser can
render — transcode, thumbnail, probe, comic/PSD/Office rendering.
_Avoid_: media service, converter

**Warden**:
Who you are and what you are allowed to touch — login, sessions, per-path
permission rules.
_Avoid_: auth module, ACL

**Ember**:
The recycle bin. A deleted file is in Ember until it is purged.
_Avoid_: trash service, bin

**Mantel**:
The frontend surface that shows a file's contents — the overlay, the dock, the
minimise/pin behaviour, and the viewers within it.
_Avoid_: preview overlay, modal, lightbox

**Ledger**:
The household account of where you were. Per user: reading and playback
positions, what was opened recently, what is pinned. Survives across devices
because it lives on the server, not in the browser.
_Avoid_: history, watch state, progress store

**Hob**:
The shelf beside the fire, where things are left arranged the way you like
them. Per user: theme, density, view mode, wallpaper. Stored separately from
[[Ledger]] because it is written rarely while Ledger is written constantly.
_Avoid_: settings, config, prefs

### Concepts

**Viewer**:
One renderer inside Mantel, chosen by file type — the image viewer, the comic
viewer, the text viewer. A file has exactly one viewer.
_Avoid_: preview component, player, reader

**Preview**:
Opening a file's contents in Mantel. A committed act — it takes over the
screen and is what Escape closes.
_Avoid_: open, view

**Peek**:
A glance at a file without committing to a Preview: cover or thumbnail, name,
size, date, progress, and the actions available on it. Summoned by hover on a
fine pointer and by long-press on a coarse one — one concept, two triggers.
_Avoid_: hover preview, tooltip, quick look

**Focus**:
The single item the keyboard is currently pointing at. Distinct from
[[Selection]]: an item can be focused without being selected, which is what
makes discontiguous keyboard selection possible.
_Avoid_: current item, active item, cursor

**Selection**:
The set of items an operation will apply to. Zero or more; unrelated to how
many are visible or which one has Focus.
_Avoid_: marked, checked, highlighted

**Glyph**:
The small type icon standing in for a file in a list — not a thumbnail, which
is generated from the file's actual contents by Kiln.
_Avoid_: file icon, type icon

**Progress**:
How far through a file you are, in whatever unit that file measures itself —
seconds for video and audio, page for comics, CFI for EPUB. Belongs to Ledger.
_Avoid_: position, bookmark, resume point

**Pinned**:
A file the user has marked to keep at hand. Distinct from *pinning a preview*,
which is a Mantel behaviour that keeps a viewer open while browsing elsewhere.
_Avoid_: favourite, starred — for the Ledger sense

### Adaptation

Hearth adapts along two independent axes. Conflating them is the mistake this
vocabulary exists to prevent: a phone in landscape is wide *and* touched, and a
desktop window dragged narrow is small *and* moused.

**Width axis**:
What the layout can hold — column count, whether the folder tree is on screen,
how far the breadcrumb folds, where the reader's controls sit. Three tiers,
cut at 768 and 1024.
_Avoid_: breakpoint, screen size — when input is what's actually meant

**Input axis**:
What the hands can do — hit-area floor, whether [[Peek]] is summoned by hover
or long-press, whether shortcut labels are shown. Branches on `pointer` and
`hover`, never on width.
_Avoid_: mobile, desktop — neither names an input capability

**Identity**:
What never varies across either axis: palette, icon language, motion timing,
cover aspect ratio, and whether a filename sits on or below its cover. If it
changed per device, Hearth would read as three products rather than one.
_Avoid_: theme, style
