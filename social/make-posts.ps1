<#
  Battle on Imperial - social post generator

  Builds Instagram/TikTok-ready graphics from the tournament photos, using the
  same typeface and colours as the website.

    .\make-posts.ps1                       # everything, with placeholders
    .\make-posts.ps1 -Team "Foothill"      # that team's "IS IN" announcement
    .\make-posts.ps1 -Days 30              # that countdown
    .\make-posts.ps1 -Team "El Dorado" -Days 14

  Output lands in .\out - one file per size:
    -portrait.jpg  1080x1350  feed (best reach)
    -square.jpg    1080x1080  feed
    -story.jpg     1080x1920  stories / Reels cover
#>

param(
  [string]$Team = "YOUR TEAM",
  [int]$Days = 30,
  [string]$PhotoDir = "C:\dev\battleofimperial\assets\img",
  [string]$OutDir   = "$PSScriptRoot\out"
)

Add-Type -AssemblyName System.Drawing
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# ---------------------------------------------------------------- brand ----
$NAVY   = [System.Drawing.Color]::FromArgb(6, 16, 33)
$AMBER  = [System.Drawing.Color]::FromArgb(255, 176, 32)
$BLUE   = [System.Drawing.Color]::FromArgb(91, 140, 255)
$WHITE  = [System.Drawing.Color]::White
$MUTED  = [System.Drawing.Color]::FromArgb(198, 212, 234)

# Barlow Condensed, the site's display face. Loaded privately so nothing has to
# be installed on the machine running this.
$pfc = New-Object System.Drawing.Text.PrivateFontCollection
foreach ($f in @("BarlowCondensed-Bold.ttf", "BarlowCondensed-SemiBold.ttf")) {
  $p = Join-Path $PSScriptRoot "fonts\$f"
  if (Test-Path $p) { $pfc.AddFontFile($p) } else { throw "Missing font: $p" }
}
$FamBold = $pfc.Families | Where-Object { $_.Name -notlike "*SemiBold*" } | Select-Object -First 1
$FamSemi = $pfc.Families | Where-Object { $_.Name -like "*SemiBold*" } | Select-Object -First 1
if (-not $FamSemi) { $FamSemi = $FamBold }

function New-Font($family, [single]$px) {
  New-Object System.Drawing.Font($family, $px, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
}

# --------------------------------------------------------------- helpers ----
# System.Drawing has no letter-spacing, so draw a string glyph by glyph.
function Draw-Tracked {
  param($g, [string]$text, $font, $brush, [single]$x, [single]$y, [single]$track)
  $fmt = [System.Drawing.StringFormat]::GenericTypographic
  foreach ($ch in $text.ToCharArray()) {
    $s = [string]$ch
    $g.DrawString($s, $font, $brush, $x, $y, $fmt)
    $x += $g.MeasureString($s, $font, [System.Drawing.PointF]::Empty, $fmt).Width + $track
  }
}
function Measure-Tracked {
  param($g, [string]$text, $font, [single]$track)
  $fmt = [System.Drawing.StringFormat]::GenericTypographic
  $w = 0
  foreach ($ch in $text.ToCharArray()) {
    $w += $g.MeasureString([string]$ch, $font, [System.Drawing.PointF]::Empty, $fmt).Width + $track
  }
  return $w
}

# Scale-and-centre-crop so the photo fills the canvas without distortion.
function Draw-Cover {
  param($g, $img, [int]$W, [int]$H, [single]$focusY = 0.5, [single]$focusX = 0.5)
  $scale = [math]::Max($W / $img.Width, $H / $img.Height)
  $w = $img.Width * $scale; $h = $img.Height * $scale
  # Cropping a 3:2 photo to 4:5 throws away a third of the width, so which
  # third matters. focusX/focusY pick the part of the frame to keep.
  $x = ($W - $w) * $focusX
  $y = ($H - $h) * $focusY
  $g.DrawImage($img, $x, $y, $w, $h)
}

function Load-Photo($name) {
  $p = Join-Path $PhotoDir $name
  if (-not (Test-Path $p)) { throw "Missing photo: $p" }
  $img = [System.Drawing.Image]::FromFile($p)
  try {
    if ($img.PropertyIdList -contains 274) {
      switch ($img.GetPropertyItem(274).Value[0]) {
        3 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate180FlipNone) }
        6 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate90FlipNone) }
        8 { $img.RotateFlip([System.Drawing.RotateFlipType]::Rotate270FlipNone) }
      }
    }
  } catch {}
  return $img
}

function Draw-Mark {
  param($g, [single]$x, [single]$y, [single]$size)
  $r = $size * 0.22
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $rect = New-Object System.Drawing.RectangleF($x, $y, $size, $size)
  $path.AddArc($rect.X, $rect.Y, $r*2, $r*2, 180, 90)
  $path.AddArc($rect.Right-$r*2, $rect.Y, $r*2, $r*2, 270, 90)
  $path.AddArc($rect.Right-$r*2, $rect.Bottom-$r*2, $r*2, $r*2, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom-$r*2, $r*2, $r*2, 90, 90)
  $path.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(235,11,27,51))), $path)
  $pad = $size * 0.30
  $penA = New-Object System.Drawing.Pen ($AMBER, ($size*0.095)); $penA.StartCap='Round'; $penA.EndCap='Round'
  $penB = New-Object System.Drawing.Pen ($BLUE,  ($size*0.095)); $penB.StartCap='Round'; $penB.EndCap='Round'
  $g.DrawLine($penA, ($x+$pad), ($y+$size-$pad), ($x+$size-$pad), ($y+$pad))
  $g.DrawLine($penB, ($x+$pad), ($y+$pad), ($x+$size-$pad), ($y+$size-$pad))
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $WHITE), ($x+$size/2-$size*0.075), ($y+$size/2-$size*0.075), ($size*0.15), ($size*0.15))
  $path.Dispose(); $penA.Dispose(); $penB.Dispose()
}

# ------------------------------------------------------------ the layout ----
function New-Post {
  param(
    [string]$Photo, [int]$W, [int]$H,
    [string]$Eyebrow, [string[]]$Headline, [string]$Subline,
    [string]$OutFile, [single]$FocusY = 0.42, [single]$FocusX = 0.5, [switch]$NoPhoto
  )

  $bmp = New-Object System.Drawing.Bitmap $W, $H
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode     = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.PixelOffsetMode   = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

  $g.Clear($NAVY)
  $img = $null
  if (-not $NoPhoto) {
    $img = Load-Photo $Photo
    Draw-Cover $g $img $W $H $FocusY $FocusX
  }

  # Scrim: strong at the bottom where the type sits, light at the top so the
  # mark still reads. Two passes rather than one long gradient keeps the middle
  # of the photo clear.
  $botH = [int]($H * 0.62)
  $rectB = New-Object System.Drawing.Rectangle 0, ($H - $botH), $W, $botH
  $gb = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
          $rectB,
          [System.Drawing.Color]::FromArgb(0, 6, 16, 33),
          [System.Drawing.Color]::FromArgb(247, 6, 16, 33),
          [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $blend = New-Object System.Drawing.Drawing2D.Blend 3
  $blend.Positions = @(0.0, 0.45, 1.0); $blend.Factors = @(0.0, 0.55, 1.0)
  $gb.Blend = $blend
  $g.FillRectangle($gb, $rectB)

  $topH = [int]($H * 0.22)
  $rectT = New-Object System.Drawing.Rectangle 0, 0, $W, $topH
  $gt = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
          $rectT,
          [System.Drawing.Color]::FromArgb(170, 6, 16, 33),
          [System.Drawing.Color]::FromArgb(0, 6, 16, 33),
          [System.Drawing.Drawing2D.LinearGradientMode]::Vertical)
  $g.FillRectangle($gt, $rectT)

  $pad  = [int]($W * 0.083)
  $mark = [int]($W * 0.105)
  Draw-Mark $g $pad $pad $mark

  $wordFont = New-Font $FamBold ($W * 0.037)
  $g.DrawString("BATTLE ON IMPERIAL", $wordFont, (New-Object System.Drawing.SolidBrush $WHITE),
                ($pad + $mark + $W*0.028), ($pad + $mark*0.26))

  # --- bottom stack, measured from the baseline up so it never overflows ---
  $subFont  = New-Font $FamSemi ($W * 0.0315)
  $eyeFont  = New-Font $FamBold ($W * 0.0275)
  $eyeTrack = $W * 0.0043

  $maxTextW = $W - ($pad * 2)
  $headPx   = $W * 0.125
  if ($Headline.Count -ge 3) { $headPx = $W * 0.098 }
  # Shrink until the longest line fits the column.
  do {
    $headFont = New-Font $FamBold $headPx
    $widest = 0
    foreach ($l in $Headline) {
      $m = $g.MeasureString($l, $headFont, [System.Drawing.PointF]::Empty,
            [System.Drawing.StringFormat]::GenericTypographic).Width
      if ($m -gt $widest) { $widest = $m }
    }
    if ($widest -le $maxTextW) { break }
    $headPx = $headPx * 0.94
  } while ($headPx -gt $W * 0.045)

  $lineH = $headPx * 0.88
  $y = $H - $pad

  if ($Subline) {
    $y -= $subFont.Height
    $g.DrawString($Subline, $subFont, (New-Object System.Drawing.SolidBrush $MUTED), $pad, $y)
    $y -= ($W * 0.022)
  }
  $y -= ($lineH * $Headline.Count)
  $hy = $y
  foreach ($l in $Headline) {
    $g.DrawString($l, $headFont, (New-Object System.Drawing.SolidBrush $WHITE), ($pad - $headPx*0.06), $hy,
                  [System.Drawing.StringFormat]::GenericTypographic)
    $hy += $lineH
  }

  if ($Eyebrow) {
    $y -= ($W * 0.030)
    $y -= $eyeFont.Height
    $barW = $W * 0.055
    $g.FillRectangle((New-Object System.Drawing.SolidBrush $AMBER), $pad, ($y + $eyeFont.Height*0.48), $barW, ($W*0.0042))
    Draw-Tracked $g $Eyebrow $eyeFont (New-Object System.Drawing.SolidBrush $AMBER) ($pad + $barW + $W*0.022) $y $eyeTrack
  }

  $enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
  $p = New-Object System.Drawing.Imaging.EncoderParameters 1
  $p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, 88)
  $path = Join-Path $OutDir $OutFile
  $bmp.Save($path, $enc, $p)

  $g.Dispose(); $bmp.Dispose(); if ($img) { $img.Dispose() }
  "  {0,-34} {1,4}x{2,-5} {3,5} KB" -f $OutFile, $W, $H, [math]::Round((Get-Item $path).Length/1KB)
}

# ------------------------------------------------------------- templates ----
# Kept out of string literals so this file stays pure ASCII: Windows PowerShell
# reads a BOM-less script as ANSI and would mangle them.
$DOT  = [char]0x00B7   # middot separator
$DASH = [char]0x2014   # em dash

$SIZES = @(
  @{ suffix="portrait"; w=1080; h=1350 },
  @{ suffix="square";   w=1080; h=1080 },
  @{ suffix="story";    w=1080; h=1920 }
)

$TEMPLATES = @(
  @{ key="announce"; photo="hero-canyon.jpg";    focus=0.40; focusx=0.62
     eyebrow="GIRLS HIGH SCHOOL LACROSSE"
     head=@("BATTLE","ON IMPERIAL")
     sub="March 2027  $DOT  Canyon High School, Anaheim Hills" },

  @{ key="format";   photo="gallery-draw.jpg";   focus=0.30; focusx=0.62
     eyebrow="ONE DAY  $DOT  THREE FIELDS"
     head=@("20 TEAMS","3 GAMES","GUARANTEED")
     sub="Round-robin pools $DASH every game counts in the table" },

  @{ key="register"; photo="gallery-save.jpg";   focus=0.38; focusx=0.30
     eyebrow="ENTRY IS OPEN"
     head=@("CLAIM ONE","OF 20 SPOTS")
     sub="A `$250 deposit holds your place  $DOT  Link in bio" },

  @{ key="film";     photo="gallery-goalie.jpg"; focus=0.38; focusx=0.58
     eyebrow="EVERY FIELD  $DOT  EVERY GAME"
     head=@("AI CAMERAS","ON EVERY","FIELD")
     sub="Film delivered to your coaching staff $DASH no extra fee" },

  @{ key="teamin";   photo="gallery-squad.jpg";  focus=0.30; focusx=0.55
     eyebrow="TEAM CONFIRMED"
     head=@($Team.ToUpper(), "IS IN")
     sub="Battle on Imperial  $DOT  March 2027  $DOT  Anaheim Hills" },

  @{ key="countdown"; photo="gallery-team.jpg";  focus=0.28; focusx=0.50
     eyebrow="COUNTDOWN"
     head=@("$Days DAYS","TO GO")
     sub="Battle on Imperial  $DOT  Canyon High School" }
)

"Generating into $OutDir"
""
foreach ($t in $TEMPLATES) {
  foreach ($s in $SIZES) {
    New-Post -Photo $t.photo -W $s.w -H $s.h `
             -Eyebrow $t.eyebrow -Headline $t.head -Subline $t.sub `
             -FocusY $t.focus -FocusX $t.focusx -OutFile "$($t.key)-$($s.suffix).jpg"
  }
}

# Profile picture: mark on brand navy, no photo.
$bmp = New-Object System.Drawing.Bitmap 1080, 1080
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.Clear($NAVY)
Draw-Mark $g 230 200 620
$f = New-Font $FamBold 86
$fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'
$g.DrawString("BATTLE ON IMPERIAL", $f, (New-Object System.Drawing.SolidBrush $WHITE), 540, 880, $fmt)
$enc = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$p = New-Object System.Drawing.Imaging.EncoderParameters 1
$p.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality, 92)
$bmp.Save((Join-Path $OutDir "profile-1080.jpg"), $enc, $p)
$g.Dispose(); $bmp.Dispose()
"  {0,-34} {1,4}x{2,-5} {3,5} KB" -f "profile-1080.jpg", 1080, 1080, [math]::Round((Get-Item (Join-Path $OutDir "profile-1080.jpg")).Length/1KB)

""
"Done. $((Get-ChildItem $OutDir -Filter *.jpg).Count) files."
