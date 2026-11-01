# =============================================================================
# XNOVA - DESCARGAR EL ULTIMO BACKUP DEL SERVIDOR A ESTE PC
# Uso:  .\descargar_backup.ps1
# Guarda en:  D:\XnovaBackups
# =============================================================================

$VPS       = "root@76.13.98.28"
$KEY       = "$env:USERPROFILE\.ssh\id_rsa"
$DESTINO   = "D:\XnovaBackups"
$CONSERVAR = 10   # cuantas copias guardar en el PC
$INTENTOS  = 8    # reintentos cuando la red falla
$ESPERA    = 60   # segundos entre reintentos

# Los comandos nativos (ssh/scp) escriben avisos en stderr; con "Stop" eso
# abortaba el script aunque la operacion hubiese ido bien.
$ErrorActionPreference = "Continue"

function Log($m) { Write-Host "[$(Get-Date -Format 'HH:mm:ss')] $m" }

if (-not (Test-Path $DESTINO)) { New-Item -ItemType Directory -Path $DESTINO | Out-Null }

$LOG = Join-Path $DESTINO "descargar_backup.log"
Start-Transcript -Path $LOG -Append | Out-Null

try {
    $SSH_OPTS = @(
        '-i', $KEY,
        '-o', 'StrictHostKeyChecking=no',
        '-o', 'ConnectTimeout=30',
        '-o', 'ServerAliveInterval=15',
        '-o', 'ServerAliveCountMax=4'
    )

    # ---------------------------------------------------------------------
    # 1) Localizar el ultimo backup en el servidor (con reintentos)
    # ---------------------------------------------------------------------
    $ultimo = $null
    $ultimoError = ""

    for ($i = 1; $i -le $INTENTOS; $i++) {
        Log "Buscando el ultimo backup en el servidor (intento $i/$INTENTOS)..."
        $salida = & ssh @SSH_OPTS $VPS "ls -1t /root/backups/auto/diario/*.dump 2>/dev/null | head -1" 2>&1
        $code = $LASTEXITCODE

        if ($code -eq 0) {
            $ultimo = ($salida | Where-Object { $_ -is [string] -and $_ -match '\.dump$' } | Select-Object -First 1)
            if (-not [string]::IsNullOrWhiteSpace($ultimo)) { break }
            Log "ERROR: el servidor responde pero no hay ningun backup en /root/backups/auto/diario/"
            Stop-Transcript | Out-Null
            exit 2
        }

        $ultimoError = ($salida | Out-String).Trim()
        Log "Fallo de conexion SSH (codigo $code). $ultimoError"
        if ($i -lt $INTENTOS) {
            Log "Reintentando en $ESPERA s..."
            Start-Sleep -Seconds $ESPERA
        }
    }

    if ([string]::IsNullOrWhiteSpace($ultimo)) {
        Log "ERROR: no se pudo conectar al servidor tras $INTENTOS intentos. NO se descargo ningun backup."
        Log "Detalle: $ultimoError"
        Stop-Transcript | Out-Null
        exit 1
    }

    $ultimo = $ultimo.Trim()
    $nombre = Split-Path $ultimo -Leaf
    $local  = Join-Path $DESTINO $nombre

    # Fichero companero con roles/permisos globales + tareas programadas (pg_cron),
    # que pg_dump no incluye.
    $rolesRemoto = $ultimo -replace '\.dump$', '_roles.tar.gz'
    $rolesNombre = Split-Path $rolesRemoto -Leaf
    $rolesLocal  = Join-Path $DESTINO $rolesNombre

    # ---------------------------------------------------------------------
    # 2) Descargar y verificar (con reintentos)
    # ---------------------------------------------------------------------
    if (Test-Path $local) {
        Log "Ya tienes ese backup descargado: $nombre"
    } else {
        $ok = $false
        for ($i = 1; $i -le $INTENTOS; $i++) {
            Log "Descargando $nombre (intento $i/$INTENTOS)..."
            Remove-Item $local, "$local.sha256" -Force -ErrorAction SilentlyContinue

            & scp @SSH_OPTS "${VPS}:$ultimo" $local 2>&1 | ForEach-Object { Write-Host $_ }
            $c1 = $LASTEXITCODE
            & scp @SSH_OPTS "${VPS}:$ultimo.sha256" "$local.sha256" 2>&1 | ForEach-Object { Write-Host $_ }
            $c2 = $LASTEXITCODE

            if ($c1 -ne 0 -or $c2 -ne 0 -or -not (Test-Path $local) -or -not (Test-Path "$local.sha256")) {
                Log "Fallo la descarga (scp $c1 / $c2)."
            } else {
                $esperado = (Get-Content "$local.sha256" -Raw).Trim().Split(' ')[0].ToLower()
                $actual   = (Get-FileHash $local -Algorithm SHA256).Hash.ToLower()
                if ($esperado -eq $actual) {
                    $mb = [math]::Round((Get-Item $local).Length / 1MB, 1)
                    Log "OK - descargado y verificado: $nombre ($mb MB)"
                    $ok = $true
                    break
                }
                Log "El archivo llego corrupto (hash no coincide)."
            }

            Remove-Item $local, "$local.sha256" -Force -ErrorAction SilentlyContinue
            if ($i -lt $INTENTOS) {
                Log "Reintentando en $ESPERA s..."
                Start-Sleep -Seconds $ESPERA
            }
        }

        if (-not $ok) {
            Log "ERROR: no se pudo descargar el backup tras $INTENTOS intentos."
            Stop-Transcript | Out-Null
            exit 1
        }
    }

    # ---------------------------------------------------------------------
    # 2b) Descargar roles + tareas programadas (pg_cron)
    # ---------------------------------------------------------------------
    if (Test-Path $rolesLocal) {
        Log "Ya tienes los roles/cron de ese backup: $rolesNombre"
    } else {
        $okRoles = $false
        for ($i = 1; $i -le $INTENTOS; $i++) {
            Log "Descargando $rolesNombre (intento $i/$INTENTOS)..."
            Remove-Item $rolesLocal -Force -ErrorAction SilentlyContinue
            & scp @SSH_OPTS "${VPS}:$rolesRemoto" $rolesLocal 2>&1 | ForEach-Object { Write-Host $_ }
            if ($LASTEXITCODE -eq 0 -and (Test-Path $rolesLocal)) {
                Log "OK - descargado: $rolesNombre"
                $okRoles = $true
                break
            }
            Log "Fallo la descarga de $rolesNombre."
            Remove-Item $rolesLocal -Force -ErrorAction SilentlyContinue
            if ($i -lt $INTENTOS) {
                Log "Reintentando en $ESPERA s..."
                Start-Sleep -Seconds $ESPERA
            }
        }
        if (-not $okRoles) {
            Log "AVISO: no se pudo descargar $rolesNombre (el .dump SI esta descargado y verificado)."
        }
    }

    # ---------------------------------------------------------------------
    # 3) Limpiar copias antiguas en el PC
    # ---------------------------------------------------------------------
    $copias = Get-ChildItem $DESTINO -Filter "*.dump" | Sort-Object LastWriteTime -Descending
    if ($copias.Count -gt $CONSERVAR) {
        $copias | Select-Object -Skip $CONSERVAR | ForEach-Object {
            Remove-Item $_.FullName -Force
            Remove-Item "$($_.FullName).sha256" -Force -ErrorAction SilentlyContinue
            Remove-Item ($_.FullName -replace '\.dump$', '_roles.tar.gz') -Force -ErrorAction SilentlyContinue
            Log "Borrada copia antigua: $($_.Name)"
        }
    }

    Log "Backups en tu PC ($DESTINO):"
    Get-ChildItem $DESTINO -Filter "*.dump" | Sort-Object LastWriteTime -Descending |
        ForEach-Object { Log ("   {0}  {1} MB  {2}" -f $_.Name, [math]::Round($_.Length/1MB,1), $_.LastWriteTime) }

    Stop-Transcript | Out-Null
    exit 0
}
catch {
    Log "ERROR inesperado: $($_.Exception.Message)"
    Stop-Transcript | Out-Null
    exit 1
}
