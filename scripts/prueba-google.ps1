# Prueba de conexion con la API de Google Business Profile.
#
# Lee las fichas de la cuenta y, para los locales del piloto, la nota media, el total de
# resenas y las ultimas resenas (sin publicar ni cambiar nada en Google).
#
# Credenciales FUERA del repo, en %APPDATA%\resenas-doombo\:
#   client_secret.json  cliente OAuth de escritorio del proyecto juanchos-resenas
#   token.json          se crea al iniciar sesion la primera vez (contiene el refresh token)
#
# Uso:  powershell -ExecutionPolicy Bypass -File scripts\prueba-google.ps1

param(
    [string]$Locales = 'Las Tablas|Valladolid|San Leopoldo|Chamber',
    [int]$Ultimas = 3
)

$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$dir        = Join-Path $env:APPDATA 'resenas-doombo'
$secretPath = Join-Path $dir 'client_secret.json'
$tokenPath  = Join-Path $dir 'token.json'
$scope      = 'https://www.googleapis.com/auth/business.manage'

if (-not (Test-Path $secretPath)) { throw "Falta $secretPath (cliente OAuth de escritorio)." }
$client = (Get-Content $secretPath -Raw | ConvertFrom-Json).installed

function Save-Token($t) {
    $t | Add-Member -NotePropertyName obtained_at -NotePropertyValue ([DateTimeOffset]::UtcNow.ToUnixTimeSeconds()) -Force
    $t | ConvertTo-Json | Set-Content -Path $tokenPath -Encoding UTF8
}

function Get-NewToken {
    # Flujo OAuth para apps de escritorio: redireccion a 127.0.0.1 con PKCE.
    $port = Get-Random -Minimum 49152 -Maximum 65000
    $redirect = "http://127.0.0.1:$port/"
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $verifier = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $hash = [Security.Cryptography.SHA256]::Create().ComputeHash([Text.Encoding]::ASCII.GetBytes($verifier))
    $challenge = [Convert]::ToBase64String($hash).TrimEnd('=').Replace('+', '-').Replace('/', '_')
    $state = [guid]::NewGuid().ToString('N')

    $q = @{
        client_id = $client.client_id; redirect_uri = $redirect; response_type = 'code'; scope = $scope
        access_type = 'offline'; prompt = 'consent'; state = $state
        code_challenge = $challenge; code_challenge_method = 'S256'
    }
    $qs = ($q.GetEnumerator() | ForEach-Object { "$($_.Key)=$([Uri]::EscapeDataString($_.Value))" }) -join '&'

    $listener = New-Object Net.HttpListener
    $listener.Prefixes.Add($redirect)
    $listener.Start()
    Write-Host 'Abriendo el navegador para iniciar sesion en Google (cuenta que gestiona las fichas)...'
    Start-Process "$($client.auth_uri)?$qs"

    $task = $listener.GetContextAsync()
    if (-not $task.Wait([TimeSpan]::FromMinutes(8))) { $listener.Stop(); throw 'Tiempo de espera agotado sin iniciar sesion.' }
    $ctx = $task.Result
    $params = [Web.HttpUtility]::ParseQueryString($ctx.Request.Url.Query)
    $html = '<html><body style="font-family:sans-serif"><h2>Listo. Ya puedes cerrar esta pestana.</h2></body></html>'
    $buf = [Text.Encoding]::UTF8.GetBytes($html)
    $ctx.Response.ContentType = 'text/html; charset=utf-8'
    $ctx.Response.OutputStream.Write($buf, 0, $buf.Length)
    $ctx.Response.Close()
    $listener.Stop()

    if ($params['error']) { throw "Google devolvio un error: $($params['error'])" }
    if ($params['state'] -ne $state) { throw 'El parametro state no coincide.' }

    $t = Invoke-RestMethod -Method Post -Uri $client.token_uri -Body @{
        code = $params['code']; client_id = $client.client_id; client_secret = $client.client_secret
        redirect_uri = $redirect; grant_type = 'authorization_code'; code_verifier = $verifier
    }
    Save-Token $t
    return $t
}

function Get-AccessToken {
    if (-not (Test-Path $tokenPath)) { return (Get-NewToken).access_token }
    $t = Get-Content $tokenPath -Raw | ConvertFrom-Json
    $now = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
    if ($now -lt ($t.obtained_at + $t.expires_in - 60)) { return $t.access_token }
    try {
        $r = Invoke-RestMethod -Method Post -Uri $client.token_uri -Body @{
            client_id = $client.client_id; client_secret = $client.client_secret
            refresh_token = $t.refresh_token; grant_type = 'refresh_token'
        }
        $r | Add-Member -NotePropertyName refresh_token -NotePropertyValue $t.refresh_token -Force
        Save-Token $r
        return $r.access_token
    } catch {
        Write-Host 'El refresh token ya no vale; hay que volver a iniciar sesion.'
        return (Get-NewToken).access_token
    }
}

Add-Type -AssemblyName System.Web
$headers = @{ Authorization = "Bearer $(Get-AccessToken)" }

function Get-Api($url) { Invoke-RestMethod -Uri $url -Headers $headers }

$stars = @{ ONE = 1; TWO = 2; THREE = 3; FOUR = 4; FIVE = 5 }

$accounts = (Get-Api 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts').accounts
Write-Host ("Cuentas accesibles: {0}" -f $accounts.Count)

$encontrados = 0
foreach ($acc in $accounts) {
    $url = "https://mybusinessbusinessinformation.googleapis.com/v1/$($acc.name)/locations?readMask=name,title&pageSize=100"
    $locs = (Get-Api $url).locations
    if (-not $locs) { continue }
    Write-Host ("`n{0} ({1}): {2} fichas" -f $acc.accountName, $acc.type, $locs.Count)

    foreach ($loc in ($locs | Where-Object { $_.title -match $Locales })) {
        $encontrados++
        $r = Get-Api "https://mybusiness.googleapis.com/v4/$($acc.name)/$($loc.name)/reviews?pageSize=$Ultimas&orderBy=updateTime%20desc"
        Write-Host ("`n  {0}  [{1}]" -f $loc.title, $loc.name)
        Write-Host ("    Nota media {0:N2} - {1} resenas" -f [double]$r.averageRating, $r.totalReviewCount)
        foreach ($rev in $r.reviews) {
            $respondida = if ($rev.reviewReply) { 'respondida' } else { 'SIN RESPONDER' }
            # Google devuelve "(Translated by Google) <traduccion> (Original) <texto original>"
            # cuando la resena no esta en el idioma de la cuenta: nos quedamos con el original.
            $texto = if ($rev.comment) { ($rev.comment -replace '\s+', ' ') } else { '(sin texto)' }
            if ($texto -match '\(Original\)\s*(.+)$') { $texto = $Matches[1] }
            if ($texto.Length -gt 70) { $texto = $texto.Substring(0, 70) + '...' }
            Write-Host ("    {0}* {1}  {2,-13} {3}" -f $stars[$rev.starRating], $rev.createTime.Substring(0, 10), $respondida, $texto)
        }
    }
}

Write-Host ("`nLocales del piloto encontrados: {0} de 4" -f $encontrados)
