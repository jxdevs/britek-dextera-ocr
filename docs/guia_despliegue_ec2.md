# Guía de Despliegue — Caja Menor (EC2 Windows Server + Docker)

---

## Requisitos previos

| Requisito | Detalle |
|---|---|
| **Sistema operativo** | Windows Server 2019 Datacenter |
| **Docker Desktop** | Docker Desktop 4.x con **Linux containers** habilitado |
| **Git** | Git para Windows |
| **RAM mínima** | 4 GB (recomendado 8 GB, Hyper-V consume recursos adicionales) |
| **Almacenamiento** | 30 GB libres mínimo |
| **Hyper-V** | Debe estar habilitado (requerido para Linux containers) |

---

## Paso 0 — Instalar Docker en Windows Server 2019

### 0.1 — Habilitar Hyper-V y Contenedores

Abrir **PowerShell como Administrador** y ejecutar:

```powershell
# Habilitar las features necesarias
Install-WindowsFeature -Name Hyper-V -IncludeManagementTools -Restart
Install-WindowsFeature -Name Containers
```

> La máquina se reiniciará automáticamente. Volver a conectarse por RDP después del reinicio.

### 0.2 — Instalar Docker Desktop

1. Descargar Docker Desktop desde: https://docs.docker.com/desktop/setup/install/windows-install/
2. Ejecutar el instalador
3. Durante la instalación, seleccionar **"Use WSL 2 instead of Hyper-V"** si WSL2 está disponible, o dejar la opción por defecto (Hyper-V)
4. Reiniciar la máquina cuando lo pida

### 0.3 — Cambiar a Linux Containers

Esto es **crítico**. Docker en Windows Server arranca por defecto en modo Windows Containers, pero nuestra app usa imágenes Linux.

```powershell
# Verificar el modo actual
docker version

# Si dice "OS/Arch: windows/amd64" en la sección Server, 
# hay que cambiar a Linux:

# Opción 1: Click derecho en el ícono de Docker en la bandeja del sistema
#            → "Switch to Linux containers..."

# Opción 2: Por línea de comandos
& "C:\Program Files\Docker\Docker\DockerCli.exe" -SwitchLinuxEngine
```

### 0.4 — Verificar la instalación

```powershell
docker version
# La sección "Server" debe mostrar OS/Arch: linux/amd64

docker run --rm hello-world
# Debe mostrar "Hello from Docker!"

docker compose version
# Debe mostrar v2.x.x
```

### 0.5 — Instalar Git (si no está instalado)

Descargar e instalar desde: https://git-scm.com/download/win

---

## Paso 1 — Clonar el repositorio

Abrir **PowerShell** (puede ser como usuario normal):

```powershell
cd C:\
git clone <URL_DEL_REPOSITORIO> cajamenor
cd C:\cajamenor
```

---

## Paso 2 — Crear el archivo de variables de entorno

Crear el archivo `.env.production` en la raíz del proyecto (`C:\cajamenor\.env.production`):

```powershell
notepad .env.production
```

Copiar y pegar el siguiente contenido, ajustando los valores según corresponda:

```env
NODE_ENV=production
PORT=3000

# Gemini (IA para extracción de facturas)
GEMINI_API_KEY=<CLAVE_GEMINI>
GEMINI_DEFAULT_MODEL=gemini-2.5-flash
GEMINI_FLASH_INPUT_PRICE=0.30
GEMINI_FLASH_OUTPUT_PRICE=2.50
GEMINI_PRO_INPUT_PRICE=1.25
GEMINI_PRO_OUTPUT_PRICE=10.00

# CORS
CORS_ORIGIN=*

# Base de datos (PostgreSQL — Amazon RDS)
DB_HOST=postgres-prod.cueoe7ixkmuc.us-east-1.rds.amazonaws.com
DB_PORT=5432
DB_NAME=cajamenordb
DB_USER=cajamenoruser
DB_PASSWORD=<CONTRASEÑA_DB>
DB_SYNC=true

# JWT (autenticación)
JWT_SECRET=<GENERAR_UN_SECRET_SEGURO>
JWT_EXPIRES_IN=8h

# Almacenamiento de facturas (AWS S3)
STORAGE_DRIVER=s3
LOCAL_STORAGE_PATH=./uploads
AWS_ACCESS_KEY_ID=<ACCESS_KEY>
AWS_SECRET_ACCESS_KEY=<SECRET_KEY>
AWS_DEFAULT_REGION=us-east-1
AWS_BUCKET=cajamenor-storage

# WhatsApp (Kapso)
KAPSO_WEBHOOK_SECRET=<WEBHOOK_SECRET>
KAPSO_API_KEY=<API_KEY>
KAPSO_API_URL=https://api.kapso.ai/v1
KAPSO_PHONE_NUMBER_ID=<PHONE_NUMBER_ID>

# Google OAuth (inicio de sesión)
GOOGLE_CLIENT_ID=<GOOGLE_CLIENT_ID>
GOOGLE_SECRET_KEY=<GOOGLE_SECRET_KEY>
```

> **Solicitar los valores reales al equipo de desarrollo.** No usar valores de ejemplo en producción.

---

## Paso 3 — Construir y levantar los contenedores

```powershell
cd C:\cajamenor
docker compose -f docker-compose.prod.yml up -d --build
```

Este comando:
1. Descarga las dependencias del proyecto
2. Compila el backend (NestJS) y el frontend (React/Vite)
3. Crea una imagen de producción optimizada (~150 MB)
4. Levanta el backend (NestJS) y el frontend (Nginx)
5. Nginx queda escuchando en el **puerto 80**

La primera vez tarda entre 5 y 10 minutos. Las siguientes veces será más rápido gracias al cache de Docker.

---

## Paso 4 — Verificar que todo funciona

```powershell
# Ver el estado de los contenedores
docker compose -f docker-compose.prod.yml ps

# Resultado esperado:
# cajamenor-api   running (healthy)
# cajamenor-web   running

# Ver los logs en tiempo real (Ctrl+C para salir)
docker compose -f docker-compose.prod.yml logs -f

# Probar que la API responde
Invoke-WebRequest -Uri http://localhost/api/auth/me -UseBasicParsing
# Debe responder con error 401 (Unauthorized) — eso es correcto
```

Abrir en el navegador: `http://localhost` — debe aparecer la pantalla de login con Google.

---

## Arquitectura del despliegue

```
Internet
   │
   ▼
┌──────────────────────────────────────────────┐
│  EC2 Windows Server 2019 (Puerto 80)         │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │  Docker Desktop (Linux Containers)     │  │
│  │                                        │  │
│  │  ┌────────────────────────────────┐    │  │
│  │  │  Nginx (cajamenor-web)         │    │  │
│  │  │  • Sirve archivos del frontend │    │  │
│  │  │  • Proxy /api/ → backend       │    │  │
│  │  │  • Proxy /webhooks/ → backend  │    │  │
│  │  └──────────┬─────────────────────┘    │  │
│  │             │                          │  │
│  │             ▼                          │  │
│  │  ┌────────────────────────────────┐    │  │
│  │  │  NestJS (cajamenor-api:3000)   │    │  │
│  │  │  • API REST                    │    │  │
│  │  │  • Extracción IA (Gemini)      │    │  │
│  │  │  • Solo accesible internamente │    │  │
│  │  └──────────┬──────────┬──────────┘    │  │
│  │             │          │               │  │
│  └─────────────┼──────────┼───────────────┘  │
│                │          │                  │
└────────────────┼──────────┼──────────────────┘
                 │          │
                 ▼          ▼
           ┌──────────┐  ┌──────────┐
           │ RDS      │  │ S3       │
           │ Postgres │  │ Bucket   │
           │ (AWS)    │  │ (AWS)    │
           └──────────┘  └──────────┘
```

---

## ⚠️ NOTAS IMPORTANTES PARA EL ADMINISTRADOR

### 1. Docker DEBE estar en modo Linux Containers

Si Docker está en modo **Windows Containers**, los contenedores no arrancarán. Verificar con:

```powershell
docker version
# Server → OS/Arch debe decir: linux/amd64
```

Si dice `windows/amd64`, cambiar con:
```powershell
& "C:\Program Files\Docker\Docker\DockerCli.exe" -SwitchLinuxEngine
```

### 2. Firewall de Windows

Windows Server tiene el firewall activo por defecto. Hay que abrir el puerto 80:

```powershell
# Abrir puerto 80 (HTTP) en el firewall de Windows
New-NetFirewallRule -DisplayName "Cajamenor HTTP" -Direction Inbound -Protocol TCP -LocalPort 80 -Action Allow

# Si se va a usar HTTPS, abrir también el 443
New-NetFirewallRule -DisplayName "Cajamenor HTTPS" -Direction Inbound -Protocol TCP -LocalPort 443 -Action Allow
```

### 3. Security Groups de la EC2 (AWS)

Además del firewall de Windows, la EC2 tiene Security Groups en AWS. Verificar que estén abiertos:

| Puerto | Protocolo | Origen | Propósito |
|---|---|---|---|
| **80** | TCP | 0.0.0.0/0 | HTTP — acceso a la aplicación |
| **443** | TCP | 0.0.0.0/0 | HTTPS — si se agrega certificado SSL |
| **3389** | TCP | Su IP fija | RDP — administración remota |

### 4. Acceso de red a Amazon RDS

La EC2 debe poder conectarse a la base de datos RDS. Verificar que:

- El **Security Group de la RDS** permite conexiones entrantes en el puerto **5432** desde el Security Group de la EC2.
- Ambos recursos (EC2 y RDS) están en la **misma VPC** o tienen peering configurado.

Probar la conexión:
```powershell
Test-NetConnection -ComputerName postgres-prod.cueoe7ixkmuc.us-east-1.rds.amazonaws.com -Port 5432
# TcpTestSucceeded debe ser True
```

### 5. Acceso al bucket S3

El bucket `cajamenor-storage` almacena las imágenes de las facturas. Verificar que:

- Las credenciales AWS en `.env.production` tienen permisos de **PutObject**, **GetObject** y **DeleteObject**.
- El bucket **NO debe ser público**.
- Política mínima IAM requerida:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::cajamenor-storage/*"
    }
  ]
}
```

### 6. Google OAuth — Orígenes autorizados

Para que el inicio de sesión con Google funcione, se debe agregar la URL de producción en la **consola de Google Cloud**:

1. Ir a [Google Cloud Console → APIs & Services → Credentials](https://console.cloud.google.com/apis/credentials)
2. Editar el cliente OAuth 2.0
3. En **"Orígenes de JavaScript autorizados"**, agregar:
   - `http://<IP-PUBLICA-EC2>`
   - `https://dominio.com` (si se configura dominio)
4. Guardar

> Sin este paso, el botón de "Iniciar sesión con Google" dará error.

### 7. Dominio y HTTPS (recomendado)

Para HTTPS en Windows Server, se recomienda usar un **reverse proxy externo** o **AWS Application Load Balancer (ALB)**:

**Opción A — ALB (recomendada)**
1. Crear un Application Load Balancer en AWS
2. Asociar un certificado SSL desde AWS Certificate Manager (gratuito)
3. Target Group apuntando al puerto 80 de la EC2
4. El ALB se encarga de HTTPS → HTTP al backend

**Opción B — win-acme (Let's Encrypt para Windows)**
1. Descargar win-acme: https://www.win-acme.com/
2. Ejecutar y seguir el asistente para generar certificado
3. Configurar el certificado en Nginx

### 8. DB_SYNC en producción

El archivo tiene `DB_SYNC=true`. Esto significa que Sequelize creará y actualizará las tablas automáticamente al iniciar.

- **Primera ejecución**: Déjelo en `true` para que cree todas las tablas.
- **Después del primer despliegue exitoso**: Cambie a `DB_SYNC=false` para proteger la estructura de la base de datos.

### 9. Docker Desktop y licencias

Docker Desktop requiere **licencia comercial** para empresas con más de 250 empleados o más de $10M de ingresos anuales. Verificar si aplica en: https://www.docker.com/pricing/

Alternativa gratuita: instalar solo **Docker Engine** con WSL2:
```powershell
# Instalar WSL2
wsl --install -d Ubuntu
# Luego instalar Docker Engine dentro de Ubuntu WSL
```

---

## Comandos útiles de operación (PowerShell)

```powershell
# Ver estado de los contenedores
docker compose -f docker-compose.prod.yml ps

# Ver logs en tiempo real (Ctrl+C para salir)
docker compose -f docker-compose.prod.yml logs -f

# Ver logs solo del backend
docker compose -f docker-compose.prod.yml logs -f api

# Reiniciar todo
docker compose -f docker-compose.prod.yml restart

# Actualizar después de un cambio en el código
git pull
docker compose -f docker-compose.prod.yml up -d --build

# Parar todo
docker compose -f docker-compose.prod.yml down

# Parar y eliminar volúmenes (¡cuidado, limpia cache!)
docker compose -f docker-compose.prod.yml down -v

# Entrar al contenedor del backend (debug)
docker exec -it cajamenor-api sh

# Ver uso de recursos
docker stats cajamenor-api cajamenor-web
```

---

## Solución de problemas

| Problema | Causa probable | Solución |
|---|---|---|
| `image operating system "linux" cannot be used on this platform` | Docker en modo Windows Containers | Cambiar a Linux Containers (ver nota 1) |
| `Connection refused` al abrir en navegador | Puerto 80 bloqueado | Verificar firewall de Windows (nota 2) Y Security Groups (nota 3) |
| `502 Bad Gateway` en Nginx | El backend no arrancó | `docker logs cajamenor-api` para ver el error |
| `ECONNREFUSED` a la base de datos | EC2 no puede llegar a RDS | `Test-NetConnection` al host RDS (nota 4) |
| `no pg_hba.conf entry` | Falta SSL en la conexión | Ya implementado en el código (auto-SSL si host no es localhost) |
| `redirect_uri_mismatch` en Google Login | URL no autorizada en Google | Agregar URL en Google OAuth (nota 6) |
| `AccessDenied` en S3 | Credenciales sin permisos | Verificar política IAM (nota 5) |
| `Hyper-V is not enabled` | Feature de Windows no habilitada | Ejecutar `Install-WindowsFeature -Name Hyper-V` y reiniciar |
| Build muy lento (>15 min) | Poca RAM o disco | Verificar que la EC2 tenga al menos 4 GB RAM |

---

*Documento generado el 8 de junio de 2026. Para soporte técnico, contactar al equipo de desarrollo.*
