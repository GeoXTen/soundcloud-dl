function Show-Context($path, $pattern, $before, $after, $label, $max = 8) {
  $c = Get-Content $path -Raw
  $ms = [regex]::Matches($c, $pattern)
  "===== $path :: $label ($($ms.Count) matches) ====="
  $shown = @()
  foreach ($m in $ms) {
    $s = [Math]::Max(0, $m.Index - $before)
    $e = [Math]::Min($c.Length, $m.Index + $m.Length + $after)
    $ctx = ($c.Substring($s, $e - $s) -replace '\s+', ' ')
    if ($shown -notcontains $ctx) { $shown += $ctx }
    if ($shown.Count -ge $max) { break }
  }
  $i = 0
  foreach ($ctx in $shown) { "---- #$i ----"; $ctx; $i++ }
}

# All polyfill browser-API usages in background.js
Show-Context 'js\background.js' '\.default\.(tabs|downloads|storage\.|runtime|windows|alarms|i18n|action|browserAction|webRequest|proxy|permissions|management)\.?[A-Za-z_$]*' 120 160 'browser api uses' 30
Show-Context 'js\background.js' 'iframe|createObjectURL|new Blob\(|window\.addEventListener|window\.document|window\.navigator|window\.location|localStorage' 260 260 'dom/blob usage' 14
Show-Context 'js\background.js' 'onInstalled|onStartup|onMessage' 200 200 'lifecycle/messages' 12