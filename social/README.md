# Social graphics

Generates Instagram and TikTok-ready post images from the tournament photos,
using the same typeface and colours as the website.

```powershell
.\make-posts.ps1                          # all templates, with placeholders
.\make-posts.ps1 -Team "Foothill"         # that team's "IS IN" announcement
.\make-posts.ps1 -Days 14                 # that countdown
.\make-posts.ps1 -Team "El Dorado" -Days 7
```

Output goes to `social/out/`, which is gitignored — these are derived files,
regenerate them rather than committing them.

## What it makes

Every template is rendered at three sizes:

| Suffix | Size | Use |
|---|---|---|
| `-portrait` | 1080 x 1350 | Instagram feed. Best reach; use this by default. |
| `-square` | 1080 x 1080 | Feed, when a square crop suits the photo better. |
| `-story` | 1080 x 1920 | Stories, and as a Reels or TikTok cover frame. |

| Template | Says |
|---|---|
| `announce` | Battle on Imperial / March 13, 2027 / Canyon High School |
| `format` | 20 teams, 3 games guaranteed |
| `register` | Claim one of 20 spots |
| `film` | AI cameras on every field |
| `teamin` | **{TEAM} is in** - the one you will use twenty times |
| `countdown` | **{N} days to go** |
| `profile-1080` | Profile picture, mark on brand navy |

## Changing a photo or its crop

Each template names a photo from `assets/img` plus two numbers:

```powershell
@{ key="register"; photo="gallery-save.jpg"; focus=0.38; focusx=0.30 ... }
```

`focus` is vertical, `focusx` horizontal, both 0 to 1. They matter more than
they look: cropping a 3:2 photo to 1080x1350 throws away about a third of the
width, so `focusx` decides which third survives. If a subject is cut off,
nudge that number toward them and re-run.

## Notes

- The font is Barlow Condensed, in `fonts/`, loaded privately so nothing needs
  installing. It is SIL Open Font Licensed; `fonts/OFL.txt` ships with it.
- The script is deliberately pure ASCII. Windows PowerShell reads a script with
  no byte-order mark as ANSI, which turns an em dash into mojibake and breaks
  parsing. Separators are built from `[char]` codes instead - keep it that way.
- Dollar amounts in captions need escaping: `"$250"` is read as a variable and
  renders as nothing. Write `` "`$250" ``.

## Before posting

These are identifiable minors. Same question as the website: check the roster
against whatever photo release the school holds. On social specifically, avoid
naming individual players, tag school and team accounts rather than player
accounts, and keep comments monitored on posts that feature players.
