# shamith-s-poojari.github.io

My portfolio, live at <https://shamith-s-poojari.github.io>

A static page with no build step: `index.html`, `css/`, `js/`, and the libraries
vendored in `vendor/` (three.js, GSAP with ScrollTrigger, Lenis). Serve the folder
with any static server; ES modules will not load straight from the filesystem.

## Files

| Path | Purpose |
|---|---|
| `index.html` | all of the content, complete without JavaScript |
| `js/avatar.js` | the 3D scene behind the page, driven by scroll position |
| `js/stack.js` | the tech stack balls, with hand-written physics |
| `js/main.js` | loader, smooth scroll, reveals, pinned work section, cursor |
| `img/character.svg` | a flat drawing of the character, for when WebGL is unavailable |
| `img/shamith.webp`, `img/depth.png` | the earlier photo head, no longer used by the page |
| `tools/bake-portrait.mjs` | regenerates the photo head from the source photos (needs `sharp`) |

## Implementation notes

**The character is modelled in code.** The head, hair, sweater, trousers and mug are
all three.js geometry in `js/avatar.js`, with no image behind them. Arms are aimed by
a small two-bone solver, so a hand can be told to hold the mug or rest on the keyboard
and the elbow works itself out. The head turns toward the cursor, and the eyes blink.

**One scene, many stages.** The stages (hero, about, at the desk, contact) are plain
values keyed to scroll positions. Each frame works out where the scene should be
and eases toward it, so scrolling, jumping to an anchor and resizing cannot put
timelines in conflict.

**Failure is designed for.** Content is visible by default and entrance states are
only applied by script. Without WebGL the hero falls back to a flat drawing of the character.
Reduced motion gets no loader, no smooth scroll and a still scene.

**Credit.** The kind of motion here is inspired by
[Moncy Yohannan's portfolio](https://github.com/MoncyDev/Portfolio-Website). None of
its code or assets are used; its license does not allow that.
