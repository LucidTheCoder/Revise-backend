function Get-PrintableStrings($path, $minLen = 6) {
  $bytes = [System.IO.File]::ReadAllBytes($path)
  $sb = New-Object System.Text.StringBuilder
  $out = New-Object System.Collections.Generic.List[string]
  foreach ($b in $bytes) {
    if (($b -ge 32 -and $b -le 126) -or $b -eq 9) {
      [void]$sb.Append([char]$b)
    } else {
      if ($sb.Length -ge $minLen) { $out.Add($sb.ToString()) }
      [void]$sb.Clear()
    }
  }
  if ($sb.Length -ge $minLen) { $out.Add($sb.ToString()) }
  return $out
}

$files = @(
  'C:\Users\nitti\Downloads\664563-2025-2027-syllabus.pdf',
  'C:\Users\nitti\Downloads\664560-2025-2027-syllabus.pdf',
  'C:\Users\nitti\Downloads\664565-2025-2027-syllabus.pdf'
)

foreach ($f in $files) {
  Write-Output "=== $f ==="
  $strings = Get-PrintableStrings $f
  $hits = $strings | Where-Object {
    $_ -match 'Biology|Chemistry|Physics|Cambridge|Syllabus|AS Level|A Level|content|topic|Subject'
  }
  if ($hits.Count -gt 0) {
    $hits | Select-Object -First 30 | ForEach-Object { Write-Output $_ }
  } else {
    Write-Output "(no readable strings extracted)"
  }
}
