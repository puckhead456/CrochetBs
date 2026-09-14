# Minimal static file server for local testing (no node/python needed).
# Usage: powershell -ExecutionPolicy Bypass -File tools\serve.ps1 [-Port 8765]
param([int]$Port = 8765)
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$mime = @{
  '.html'='text/html; charset=utf-8'; '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8'
  '.json'='application/json'; '.webmanifest'='application/manifest+json'; '.png'='image/png'; '.svg'='image/svg+xml'
  '.ico'='image/x-icon'; '.txt'='text/plain'; '.md'='text/plain; charset=utf-8'; '.woff2'='font/woff2'
}
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root at http://localhost:$Port/"
while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $req = $ctx.Request; $res = $ctx.Response
  try {
    $path = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
    if ($path.EndsWith('/')) { $path += 'index.html' }
    $file = Join-Path $root ($path.TrimStart('/') -replace '/', '\')
    if ((Test-Path $file -PathType Leaf) -and ((Resolve-Path $file).Path.StartsWith($root.Path))) {
      $bytes = [IO.File]::ReadAllBytes($file)
      $ext = [IO.Path]::GetExtension($file).ToLower()
      $res.ContentType = if ($mime[$ext]) { $mime[$ext] } else { 'application/octet-stream' }
      $res.Headers['Cache-Control'] = 'no-store'
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $b = [Text.Encoding]::UTF8.GetBytes("404 $path")
      $res.OutputStream.Write($b, 0, $b.Length)
    }
  } catch { $res.StatusCode = 500 } finally { $res.OutputStream.Close() }
}
