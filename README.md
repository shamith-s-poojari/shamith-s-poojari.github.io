# shamith-s-poojari.github.io

My portfolio, live at <https://shamith-s-poojari.github.io>

One self-contained HTML page. No build step, no framework, nothing to install:
`index.html` carries its own CSS and JavaScript, and the portrait is embedded in
the file itself.

## Files

| File | Purpose |
|---|---|
| `index.html` | the entire site |
| `Shamith-Poojari-Resume.pdf` | served alongside, opened in an in-page viewer |
| `og-image.jpg` | link preview image for shared links |

## Implementation notes

**Motion.** anime.js v4, loaded from a CDN as an ES module. There is one authored
moment: the hero name splits into characters that rise from behind a per-word
mask, so wrapping and descenders survive. Everything below the fold is
deliberately quiet, one restrained arrival triggered once by IntersectionObserver.

**Failure is designed for.** Content is visible by default. Entrance states are
applied by script and withdrawn again if the library fails to load, if the tab is
backgrounded (where `requestAnimationFrame` is frozen, so nothing could animate
anyway), or if the visitor prefers reduced motion. A broken script never leaves
the page blank.

**Resume viewer.** Opens in a native `<dialog>` on desktop. On narrow screens it
falls through to a plain link, because an iframed PDF is unreliable on mobile and
the OS viewer is better there. The links stay real `<a href>` elements, so
middle-click, "save link as", and a visitor with JavaScript disabled all still
get the file.

**Type and colour.** Geist throughout, one accent colour, and every text and
background pair meets WCAG AA. Browser surfaces are themed too: selection, caret,
scrollbar, and focus rings.

## Running it locally

Open `index.html` in a browser. It works straight from the filesystem, since the
CDN it uses sends permissive CORS headers.
