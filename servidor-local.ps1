[CmdletBinding()]
param([switch]$NoBrowser)

$ErrorActionPreference = 'Stop'
$port = 4173
$siteRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'dist'))
$address = "http://127.0.0.1:$port/"

if (-not (Test-Path -LiteralPath (Join-Path $siteRoot 'index.html'))) {
  Write-Host 'No se encuentra la web compilada. Ejecuta pnpm build primero.' -ForegroundColor Red
  Read-Host 'Pulsa Enter para cerrar'
  exit 1
}

$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $port)
try {
  $listener.Start()
} catch {
  if (-not $NoBrowser) { Start-Process $address }
  exit 0
}

Write-Host "PizzPlass esta disponible en $address" -ForegroundColor Green
Write-Host 'Para apagar la vista previa, cierra esta ventana.'
if (-not $NoBrowser) { Start-Process $address }

$mimeTypes = @{
  '.html' = 'text/html; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg' = 'image/svg+xml'
  '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.png' = 'image/png'
  '.ico' = 'image/x-icon'
  '.txt' = 'text/plain; charset=utf-8'
  '.xml' = 'application/xml; charset=utf-8'
}

try {
  while ($true) {
    $client = $listener.AcceptTcpClient()
    try {
      $stream = $client.GetStream()
      $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
      $requestLine = $reader.ReadLine()
      while (($line = $reader.ReadLine()) -ne '') { if ($null -eq $line) { break } }

      $requestPath = if ($requestLine -match '^GET\s+([^\s]+)') { $matches[1].Split('?')[0] } else { '/' }
      $requestPath = [System.Uri]::UnescapeDataString($requestPath).TrimStart('/')
      if ([string]::IsNullOrWhiteSpace($requestPath)) { $requestPath = 'index.html' }

      $target = [System.IO.Path]::GetFullPath((Join-Path $siteRoot $requestPath))
      $insideRoot = $target.StartsWith($siteRoot, [System.StringComparison]::OrdinalIgnoreCase)
      if (-not $insideRoot -or -not (Test-Path -LiteralPath $target -PathType Leaf)) {
        $status = '404 Not Found'
        $body = [System.Text.Encoding]::UTF8.GetBytes('No encontrado')
        $contentType = 'text/plain; charset=utf-8'
      } else {
        $status = '200 OK'
        $body = [System.IO.File]::ReadAllBytes($target)
        $extension = [System.IO.Path]::GetExtension($target).ToLowerInvariant()
        $contentType = if ($mimeTypes.ContainsKey($extension)) { $mimeTypes[$extension] } else { 'application/octet-stream' }
      }

      $headers = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`nConnection: close`r`n`r`n"
      $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($headers)
      $stream.Write($headerBytes, 0, $headerBytes.Length)
      $stream.Write($body, 0, $body.Length)
      $stream.Flush()
    } finally {
      $client.Close()
    }
  }
} finally {
  $listener.Stop()
}
