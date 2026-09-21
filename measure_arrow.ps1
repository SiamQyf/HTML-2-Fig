Add-Type -AssemblyName System.Drawing

function Measure-ArrowOnly($imgPath) {
    $bmp = New-Object System.Drawing.Bitmap($imgPath)
    Write-Host "File: $imgPath ($($bmp.Width) x $($bmp.Height))"
    
    # First find circle bounds
    $cMinX = 9999; $cMaxX = 0; $cMinY = 9999; $cMaxY = 0
    for ($y = [int]($bmp.Height * 0.7); $y -lt $bmp.Height; $y++) {
        for ($x = [int]($bmp.Width * 0.7); $x -lt $bmp.Width; $x++) {
            $p = $bmp.GetPixel($x, $y)
            if ($p.G -gt 90 -and $p.R -lt 70 -and $p.B -lt 110 -and $p.A -gt 150) {
                if ($x -lt $cMinX) { $cMinX = $x }
                if ($x -gt $cMaxX) { $cMaxX = $x }
                if ($y -lt $cMinY) { $cMinY = $y }
                if ($y -gt $cMaxY) { $cMaxY = $y }
            }
        }
    }

    $cCX = ($cMinX + $cMaxX) / 2.0
    $cCY = ($cMinY + $cMaxY) / 2.0
    Write-Host ("Circle: X=[{0}..{1}] Y=[{2}..{3}] W={4} H={5} Center=({6:N2}, {7:N2})" -f $cMinX, $cMaxX, $cMinY, $cMaxY, ($cMaxX - $cMinX), ($cMaxY - $cMinY), $cCX, $cCY)

    # Now find white pixels ONLY WITHIN the circle bounding box
    $aMinX = 9999; $aMaxX = 0; $aMinY = 9999; $aMaxY = 0
    for ($y = $cMinY; $y -le $cMaxY; $y++) {
        for ($x = $cMinX; $x -le $cMaxX; $x++) {
            $p = $bmp.GetPixel($x, $y)
            if ($p.R -gt 220 -and $p.G -gt 220 -and $p.B -gt 220) {
                if ($x -lt $aMinX) { $aMinX = $x }
                if ($x -gt $aMaxX) { $aMaxX = $x }
                if ($y -lt $aMinY) { $aMinY = $y }
                if ($y -gt $aMaxY) { $aMaxY = $y }
            }
        }
    }

    $aCX = ($aMinX + $aMaxX) / 2.0
    $aCY = ($aMinY + $aMaxY) / 2.0
    Write-Host ("Arrow inside circle: X=[{0}..{1}] Y=[{2}..{3}] W={4} H={5} Center=({6:N2}, {7:N2})" -f $aMinX, $aMaxX, $aMinY, $aMaxY, ($aMaxX - $aMinX), ($aMaxY - $aMinY), $aCX, $aCY)
    Write-Host ("Arrow offset from circle center: dX={0:N2}px, dY={1:N2}px`n" -f ($aCX - $cCX), ($aCY - $cCY))
    $bmp.Dispose()
}

Measure-ArrowOnly "C:\Users\Siam\.gemini\antigravity-ide\brain\861219f0-ff9a-4d7d-ac4a-4d10e197c2aa\.user_uploaded\media_1789976796315.png"
Measure-ArrowOnly "C:\Users\Siam\.gemini\antigravity-ide\brain\861219f0-ff9a-4d7d-ac4a-4d10e197c2aa\.user_uploaded\media_1789976805499.png"
