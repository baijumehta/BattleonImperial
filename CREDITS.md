# Photo credits

All photography on the site is from the Canyon High School girls lacrosse
program's own 2025–26 season, supplied by the booster club.

| File | Shows |
|---|---|
| `assets/img/hero-canyon.jpg` | Canyon attacker driving past a defender |
| `assets/img/band-canyon.jpg` | Two players leaping for the draw, hills behind |
| `assets/img/gallery-draw.jpg` | Close-up of the draw, sticks crossed |
| `assets/img/gallery-save.jpg` | Goalkeeper reaching to make a save |
| `assets/img/gallery-goalie.jpg` | Goalkeeper set in front of the goal |
| `assets/img/gallery-squad.jpg` | Five players outside the school |
| `assets/img/gallery-balls.jpg` | Balls lined up along the practice line |
| `assets/img/gallery-team.jpg` | The squad together in front of the school |

Originals came from the club's Dropbox and are untouched apart from being
resized for the web (hero and band 2000px on the long edge, gallery 1400px,
JPEG quality 78–80). Total weight on the page is about 1.7 MB.

## Before these go in front of a wider audience

**Media releases.** These are identifiable minors on a public website. Most
districts require a signed photo release before a student's image is used in
promotional material, and some families opt out. Worth checking the roster
against whatever release the school holds before the site is promoted beyond
the booster club.

**Two photos were deliberately left out.** The 2026 Varsity and JV banner
portraits in the Dropbox folder carry an "EPIC IMAGES" watermark. Those are a
professional photographer's work, usually licensed to families for personal use
rather than to the club for marketing. Get written permission before publishing
them.

**Unused but available.** The Dropbox folder holds 25 photos; eight are on the
site. The rest include more game action, several player group shots and a video.
Ask if you want the selection changed.

## Replacing a photo

Drop a replacement at the same path and filename, keeping a similar aspect
ratio — the hero and band are wide crops, the gallery tiles are 4:3. Because
`vercel.json` caches `/assets/img/*` for a day, **change the filename** if you
need the new image live immediately, and update the `src` in `index.html`.

## Logo

`logo-master.png` is Lydie's original artwork, 1254&nbsp;px square, kept as the
source of truth. Nothing on the site links it; every file below is generated
from it and should be regenerated rather than edited:

| File | Used by |
|---|---|
| `logo-480.*`, `logo.*` | the crest band on the home page (1x and 2x) |
| `logo-240.*` | the footer on every page, and the sign-in card |
| `logo-96.*` | the nav badge on every page (2x of 42px) |
| `favicon-32.png` | the browser tab |
| `apple-touch-icon.png` | home-screen and bookmark icon, 180px |
| `og-battle-on-imperial.jpg` | the social preview card, 1200&times;630 |

**The black background is part of the artwork and cannot be removed.** 95% of
the file's near-black pixels connect to its border, so a background knockout
takes the palm silhouettes and the crest outlines with it. Anywhere the logo
appears, the surrounding colour has to be black — the crest band is pure `#000`
for exactly this reason, not `--black-900`.

To regenerate after a new master, from `battleofimperial-ops/tools`:

```
node logo.js
```
