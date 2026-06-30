param(
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

$ProjectPath = "C:\britek-dextera-ocr-main"
$ComposeFile = "docker-compose.windows.yml"
$EnvironmentFile = ".env.production"
$LogFolder = Join-Path $ProjectPath "logs\deploy"
$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$LogFile = Join-Path $LogFolder "deploy_$Timestamp.log"

New-Item -ItemType Directory -Force $LogFolder | Out-Null

function Write-DeployLog {
    param([string]$Message)
    $Line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $Message"
    Write-Host $Line
    Add-Content -Path $LogFile -Value $Line -Encoding UTF8
}

function Assert-LastExitCode {
    param([string]$Action)
    if ($LASTEXITCODE -ne 0) {
        throw "$Action terminó con código $LASTEXITCODE"
    }
}

Set-Location $ProjectPath

Write-DeployLog "Inicio del despliegue de CajaMenor. Rama: $Branch"

Write-DeployLog "Actualizando repositorio"
git fetch origin
Assert-LastExitCode "git fetch"

git checkout $Branch
Assert-LastExitCode "git checkout"

git reset --hard "origin/$Branch"
Assert-LastExitCode "git reset"

if (-not (Test-Path $EnvironmentFile)) {
    throw "No existe el archivo $EnvironmentFile"
}

Write-DeployLog "Construyendo imágenes"
docker-compose `
    --env-file $EnvironmentFile `
    -f $ComposeFile `
    build
Assert-LastExitCode "docker-compose build"

Write-DeployLog "Recreando contenedores"
docker-compose `
    --env-file $EnvironmentFile `
    -f $ComposeFile `
    up -d --force-recreate
Assert-LastExitCode "docker-compose up"

Write-DeployLog "Validando estado de los contenedores"
docker-compose `
    --env-file $EnvironmentFile `
    -f $ComposeFile `
    ps | Tee-Object -FilePath $LogFile -Append

Write-DeployLog "Validando frontend"
$WebResponse = Invoke-WebRequest `
    -Uri "http://localhost:8080" `
    -UseBasicParsing `
    -TimeoutSec 30

if ($WebResponse.StatusCode -ne 200) {
    throw "El frontend respondió con estado $($WebResponse.StatusCode)"
}

Write-DeployLog "Validando API"
try {
    Invoke-WebRequest `
        -Uri "http://localhost:3000/auth/me" `
        -UseBasicParsing `
        -TimeoutSec 30 | Out-Null
}
catch {
    if (
        -not $_.Exception.Response -or
        [int]$_.Exception.Response.StatusCode -ne 401
    ) {
        throw "La API no respondió correctamente: $($_.Exception.Message)"
    }
}

Write-DeployLog "Despliegue finalizado correctamente"
