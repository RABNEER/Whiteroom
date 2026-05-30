Add-Type -AssemblyName System.Drawing

$sourcePath = "d:\Whiteroom\Minimalist_geometric_logo_mark._A_202605201103.jpeg"
$resDir = "d:\Whiteroom\apps\mobile\android\app\src\main\res"

if (-not (Test-Path $sourcePath)) {
    Write-Error "Source image not found!"
    exit 1
}

$sizes = @{
    "mipmap-mdpi" = 48
    "mipmap-hdpi" = 72
    "mipmap-xhdpi" = 96
    "mipmap-xxhdpi" = 144
    "mipmap-xxxhdpi" = 192
}

$img = [System.Drawing.Image]::FromFile($sourcePath)

foreach ($folder in $sizes.Keys) {
    $size = $sizes[$folder]
    $folderPath = Join-Path $resDir $folder
    if (-not (Test-Path $folderPath)) {
        New-Item -ItemType Directory -Force -Path $folderPath
    }

    # Delete existing webp files to avoid duplicates
    $webpSquare = Join-Path $folderPath "ic_launcher.webp"
    if (Test-Path $webpSquare) { Remove-Item $webpSquare -Force }
    $webpRound = Join-Path $folderPath "ic_launcher_round.webp"
    if (Test-Path $webpRound) { Remove-Item $webpRound -Force }

    # Resize image
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $size, $size)
    $g.Dispose()

    # Save square png
    $pngSquare = Join-Path $folderPath "ic_launcher.png"
    $bmp.Save($pngSquare, [System.Drawing.Imaging.ImageFormat]::Png)

    # Save round png
    $pngRound = Join-Path $folderPath "ic_launcher_round.png"
    $bmp.Save($pngRound, [System.Drawing.Imaging.ImageFormat]::Png)

    $bmp.Dispose()
    Write-Host "Generated PNG icons for $folder ($size x $size)"
}

$img.Dispose()
Write-Host "Successfully generated all Android Launcher PNG icons!"
