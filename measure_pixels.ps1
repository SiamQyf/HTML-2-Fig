Add-Type -AssemblyName System.Drawing

function Measure-Image($imgPath) {
    $bmp = New-Object System.Drawing.Bitmap($imgPath)
    Write-Host "File: $imgPath ($($bmp.Width) x $($bmp.Height))"
    $cMinX = 9999; $cMaxX = 0; $cMinY = 9999; $cMaxY = 0
    $aMinX = 9999; $aMaxX = 0; $aMinY = 9999; $aMaxY = 0

    $startY = [int]($bmp.Height * 0.7)
    $startX = [int]($bmp.Width * 0.7)

    for ($y = $startY; $y -lt $bmp.Height; $y++) {
        for ($x = $startX; $x -lt $bmp.Width; $x++) {
            $p = $bmp.GetPixel($x, $y)
            # Green circle
            if ($p.G -gt 90 -and $p.R -lt 70 -and $p.B -lt 110 -and $p.A -gt 150) {
                if ($x -lt $cMinX) { $cMinX = $x }
                if ($x -gt $cMaxX) { $cMaxX = $x }
                if ($y -lt $cMinY) { $cMinY = $y }
                if ($y -gt $cMaxY) { $cMaxY = $y }
            }
            # White arrow
            if ($p.R -gt 220 -and $p.G -gt 220 -and $p.B -gt 220 -and $p.A -gt 150) {
                if ($x -lt $aMinX) { $aMinX = $x }
                if ($x -gt $aMaxX) { $aMaxX = $x }
                if ($y -lt $aMinY) { $aMinY = $y }
                if ($y -gt $aMaxY) { $aMaxY = $y }
            }
        }
    }

    $cCX = ($cMinX + $cMaxX) / 2.0
    $cCY = ($cMinY + $cMaxY) / 2.0
    $aCX = ($aMinX + $aMaxX) / 2.0
    $aCY = ($aMinY + $aMaxY) / 2.0

    Write-Host ("Circle: X=[{0}..{1}] Y=[{2}..{3}] W={4} H={5} Center=({6:N2}, {7:N2})" -f $cMinX, $cMaxX, $cMinY, $cMaxY, ($cMaxX - $cMinX), ($cMaxY - $cMinY), $cCX, $cCY)
    Write-Host ("Arrow:  X=[{0}..{1}] Y=[{2}..{3}] W={4} H={5} Center=({6:N2}, {7:N2})" -f $aMinX, $aMaxX, $aMinY, $aMaxY, ($aMaxX - $aMinX), ($aMaxY - $aMinY), $aCX, $aCY)
    Write-Host ("Arrow offset from circle center: dX={0:N2}px, dY={1:N2}px" -f ($aCX - $cCX), ($aCY - $cCY))
    
    # Also find "Learn More" text bounds to compare vertical alignment with circle!
    $tMinX = 9999; $tMaxX = 0; $tMinY = 9999; $tMaxY = 0
    for ($y = $startY; $y -lt $bmp.Height; $y++) {
        for ($x = 0; $x -lt $startX; $x++) {
            $p = $bmp.GetPixel($x, $y)
            # Dark green text of "Learn More"
            if ($p.G -gt 80 -and $p.R -lt 70 -and $p.B -lt 100 -and $p.A -gt 150) {
                if ($x -lt $tMinX) { $tMinX = $x }
                if ($x -gt $tMaxX) { $tMaxX = $x }
                if ($y -lt $tMinY) { $tMinY = $y }
                if ($y -gt $tMaxY) { $tMaxY = $y }
            }
        }
    }
    $tCY = ($tMinY + $tMaxY) / 2.0
    Write-Host ("Text:   X=[{0}..{1}] Y=[{2}..{3}] CenterY={4:N2}" -f $tMinX, $tMaxX, $tMinY, $tMaxY, $tCY)
    Write-Host ("Vertical center difference (Circle CenterY - Text CenterY): {0:N2}px`n" -f ($cCY - $tCY))
    $bmp.Dispose()
}

Measure-Image "C:\Users\Siam\.gemini\antigravity-ide\brain\861219f0-ff9a-4d7d-ac4a-4d10e197c2aa\.user_uploaded\media_1789976796315.png"
Measure-Image "C:\Users\Siam\.gemini\antigravity-ide\brain\861219f0-ff9a-4d7d-ac4a-4d10e197c2aa\.user_uploaded\media_1789976805499.png"
