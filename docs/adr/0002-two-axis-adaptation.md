# Adapt on two axes — width and input — never on "device"

The rewrite's first attempt at responsiveness used width alone, via Tailwind
`hidden sm:block` in 10 of 51 components, which is why a phone got a squeezed
desktop rather than a phone layout. Replacing it with a wider set of width
breakpoints would repeat the underlying error, because width does not tell you
what the hands can do: a phone in landscape is 844px and still touched, a
desktop window dragged to 700px is narrow and still moused, and an iPad with a
keyboard attached is all three at once.

Hearth therefore adapts on **two independent axes**. The **width axis** decides
what the layout can hold — column count, folder-tree visibility, breadcrumb
folding, reader control placement — cut at **768** and **1024** (Tailwind's `md`
and `lg`, so no custom breakpoints are introduced). The **input axis** decides
what the hands can do — hit-area floor, whether Peek is summoned by hover or by
long-press, whether shortcut labels are rendered — branching on `pointer` and
`hover` via Tailwind 4.3's `pointer-coarse` / `pointer-fine` variants.

## Consequences

**The 1024 cut is chosen for the tablet, not the laptop.** At 1280 (`xl`) an iPad
in landscape at 1180px would not get the folder tree, which is the posture that
most wants it.

**Hover-dependent affordances must have a coarse-pointer counterpart or they do
not ship.** Peek is the first instance: hover on fine pointers, long-press on
coarse. Long-press therefore cannot also mean "enter multi-select" — selecting
is one action inside the Peek card, mirroring right-click's menu on the fine
pointer side.

**Density is an interval, not a value.** The input axis sets the floor and the
allowed range — 44/52px on coarse, 28/36px on fine — and the user's Hob
preference picks within it. A list row's hit area and its height are the same
pixel, so "compact" can never be allowed to breach the coarse-pointer floor;
one preference therefore yields 44px on a phone and 28px on a desktop.

**A fixed set of things is forbidden from varying on either axis**: palette,
icon language, motion timing, cover aspect ratio, and whether a filename sits on
or below its cover. Corner radius and spacing are exempt and track density,
because a 16px radius on a 30px row renders as a pill.
