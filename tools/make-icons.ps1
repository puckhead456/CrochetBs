<#
    Stitchkeeper icon generator.
    Renders the app icon (sage-green rounded square + cream yarn ball +
    strands + heart + crochet hook) as PNGs using System.Drawing, since this
    machine has no node/python/ImageMagick.

    Produces, in ..\icons\:
      icon-192.png             192x192, purpose "any"
      icon-512.png              512x512, purpose "any"
      icon-maskable-512.png     512x512, purpose "maskable" (art in central 80%)
      apple-touch-icon.png      180x180, opaque, square corners
#>

Add-Type -AssemblyName System.Drawing

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root 'icons'
if (-not (Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Path $iconsDir | Out-Null
}

function New-RoundedRectPath {
    param(
        [single]$X, [single]$Y, [single]$Width, [single]$Height, [single]$Radius
    )
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $Radius * 2
    $path.AddArc($X, $Y, $d, $d, 180, 90)
    $path.AddArc($X + $Width - $d, $Y, $d, $d, 270, 90)
    $path.AddArc($X + $Width - $d, $Y + $Height - $d, $d, $d, 0, 90)
    $path.AddArc($X, $Y + $Height - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    return $path
}

function Draw-YarnArt {
    param([System.Drawing.Graphics]$g)

    $creamColor    = [System.Drawing.Color]::FromArgb(255, 0xfb, 0xf6, 0xec)
    $strandColor   = [System.Drawing.Color]::FromArgb(255, 0xe8, 0xdd, 0xc2)
    $heartColor    = [System.Drawing.Color]::FromArgb(255, 0xf2, 0xa6, 0xa0)
    $hookColor     = [System.Drawing.Color]::FromArgb(255, 0x8b, 0x5e, 0x3c)
    $hookHighlight = [System.Drawing.Color]::FromArgb(153, 0xa9, 0x76, 0x4f)

    # --- yarn ball (circle, cx=230 cy=290 r=128 -> bbox 102,162,256,256) ---
    $ballBrush = New-Object System.Drawing.SolidBrush($creamColor)
    $g.FillEllipse($ballBrush, 102, 162, 256, 256)
    $ballBrush.Dispose()

    # --- strand arcs across the ball ---
    $strandPen = New-Object System.Drawing.Pen($strandColor, 10)
    $strandPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $strandPen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($strandPen, 102, 162, 256, 256, 200, 75)
    $g.DrawArc($strandPen, 102, 162, 256, 256, 100, 75)
    $g.DrawArc($strandPen, 102, 162, 256, 256, 15, 75)
    $strandPen.Dispose()

    # --- small heart on the yarn ball ---
    $heartPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $heartPath.AddEllipse(172, 278, 60, 60)
    $heartPath.AddEllipse(228, 278, 60, 60)
    $heartPath.AddPolygon(@(
        (New-Object System.Drawing.PointF(178, 308)),
        (New-Object System.Drawing.PointF(230, 368)),
        (New-Object System.Drawing.PointF(282, 308))
    ))
    $heartBrush = New-Object System.Drawing.SolidBrush($heartColor)
    $g.FillPath($heartBrush, $heartPath)
    $heartBrush.Dispose()
    $heartPath.Dispose()

    # --- crochet hook, diagonal across the ball ---
    $hookPen = New-Object System.Drawing.Pen($hookColor, 26)
    $hookPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $hookPen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($hookPen, 356, 118, 168, 396)
    $hookPen.Dispose()

    # hook curl at the top end
    $curlPen = New-Object System.Drawing.Pen($hookColor, 22)
    $curlPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $curlPen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawArc($curlPen, 336, 88, 70, 70, 200, 250)
    $curlPen.Dispose()

    # highlight on the hook shaft
    $hlPen = New-Object System.Drawing.Pen($hookHighlight, 8)
    $hlPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $hlPen.EndCap   = [System.Drawing.Drawing2D.LineCap]::Round
    $g.DrawLine($hlPen, 352, 126, 176, 388)
    $hlPen.Dispose()
}

function New-StitchkeeperIcon {
    param(
        [int]$Size,
        [switch]$RoundedCorners,
        [switch]$Maskable
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)

    $scale = $Size / 512.0
    $g.ScaleTransform($scale, $scale)

    $bgColor = [System.Drawing.Color]::FromArgb(255, 0x7c, 0xb8, 0x7a)
    $bgBrush = New-Object System.Drawing.SolidBrush($bgColor)

    if ($RoundedCorners) {
        $bgPath = New-RoundedRectPath -X 0 -Y 0 -Width 512 -Height 512 -Radius 112
        $g.FillPath($bgBrush, $bgPath)
        $g.SetClip($bgPath)
        $bgPath.Dispose()
    } else {
        # Full-bleed square background (used for maskable, where the OS applies
        # its own mask shape, and for the apple-touch icon, which must be an
        # opaque square with no rounding of its own).
        $g.FillRectangle($bgBrush, 0, 0, 512, 512)
    }
    $bgBrush.Dispose()

    if ($Maskable) {
        # Shrink the artwork into the central ~80% safe zone required by the
        # maskable icon spec, scaling uniformly about the canvas center.
        $g.TranslateTransform(256, 256)
        $g.ScaleTransform(0.8, 0.8)
        $g.TranslateTransform(-256, -256)
    }

    Draw-YarnArt -g $g

    $g.ResetClip()
    $g.Dispose()

    return $bmp
}

# --- icon-192.png (any) ---
$bmp192 = New-StitchkeeperIcon -Size 192 -RoundedCorners
$bmp192.Save((Join-Path $iconsDir 'icon-192.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp192.Dispose()

# --- icon-512.png (any) ---
$bmp512 = New-StitchkeeperIcon -Size 512 -RoundedCorners
$bmp512.Save((Join-Path $iconsDir 'icon-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp512.Dispose()

# --- icon-maskable-512.png (maskable, extra safe-zone padding) ---
$bmpMaskable = New-StitchkeeperIcon -Size 512 -Maskable
$bmpMaskable.Save((Join-Path $iconsDir 'icon-maskable-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmpMaskable.Dispose()

# --- apple-touch-icon.png (180x180, opaque, square corners; iOS rounds them) ---
$bmpApple = New-StitchkeeperIcon -Size 180
$bmpApple.Save((Join-Path $iconsDir 'apple-touch-icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmpApple.Dispose()

Write-Host "Icons written to $iconsDir"

# --- verify by loading each PNG back and printing its dimensions ---
$files = @('icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png')
foreach ($f in $files) {
    $path = Join-Path $iconsDir $f
    $img = [System.Drawing.Image]::FromFile($path)
    Write-Host ("{0}: {1}x{2}" -f $f, $img.Width, $img.Height)
    $img.Dispose()
}
