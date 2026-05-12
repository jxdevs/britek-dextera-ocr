# Plan MVP — Legalización de caja menor por WhatsApp con IA

## 1. Contexto del problema

Varios trabajadores envían facturas de sus gastos por WhatsApp a un único número. Por cada factura se debe:

1. Identificar al trabajador por el número de teléfono (o cédula).
2. Extraer los datos de la factura con IA (proveedor, NIT, fecha, número, subtotal, IVA, total, ítems).
3. Asociar el gasto a una **caja menor** activa del trabajador.
4. Pasar la factura a estado **pendiente de aprobación**.
5. Un aprobador revisa los datos extraídos en un dashboard, los corrige si hace falta, y aprueba o rechaza.
6. Al aprobar, el saldo de la caja menor disminuye.

La caja menor es un anticipo en efectivo. Se abre por un período con un monto inicial y se va consumiendo a medida que se aprueban facturas. Puede ser **individual** (un trabajador) o **compartida** (varios trabajadores descuentan de la misma bolsa).

## 2. Stack

| Capa | Tecnología |
|---|---|
| WhatsApp | Kapso (recibe mensajes/imágenes, dispara webhooks, envía respuestas) |
| Backend | NestJS + TypeScript |
| ORM | Sequelize + sequelize-typescript |
| DB | PostgreSQL local (Docker) → Cloud SQL en prod |
| Storage de archivos | Filesystem local (`./uploads`) → Cloud Storage en prod (tras una interfaz `StorageService`) |
| IA / OCR | Gemini 2.5 Flash vía `@google/genai`, con `responseSchema` JSON |
| Colas | BullMQ + Redis (Docker en dev) |
| Frontend | React + Vite + TypeScript + Tailwind + shadcn/ui + TanStack Query |
| Auth dashboard | JWT propio para MVP → Google OAuth cuando migremos a GCP |

Decisiones clave:
- **Procesamiento asíncrono:** el webhook de Kapso no debe esperar a Gemini. Encolamos un job y respondemos 200 OK inmediatamente.
- **Storage abstraído:** una sola interfaz `StorageService` con dos implementaciones (`LocalStorage`, `GcsStorage`). Cambiar de local a Cloud Storage es solo configuración.
- **Transacciones con lock:** la aprobación que descuenta saldo usa `SELECT ... FOR UPDATE` para evitar condiciones de carrera cuando varias aprobaciones simultáneas tocan la misma caja compartida.

## 3. Modelo de dominio

```
Worker
  id, document_number, phone (único), name, email, role (worker|approver|admin),
  created_at, updated_at

PettyCashBox
  id, code, name, type (individual|shared),
  initial_amount, current_balance,
  opened_at, closed_at, status (open|closed),
  created_by (worker_id), created_at, updated_at

BoxAssignment              -- N:N entre Worker y PettyCashBox
  box_id, worker_id, is_primary, created_at

Invoice
  id, box_id (nullable hasta aprobación si elegimos opción B),
  worker_id, image_url, status (pending|approved|rejected),
  vendor_nit, vendor_name, invoice_number, invoice_date,
  subtotal, iva, total,
  extracted_data (jsonb),  -- payload crudo de Gemini
  confidence_score,
  submitted_at, created_at, updated_at

Approval                   -- auditoría
  id, invoice_id, approver_id, action (approve|reject),
  comments, edited_fields (jsonb),  -- diff con lo que Gemini extrajo
  created_at

WhatsappEvent              -- log de mensajes entrantes para debug y auditoría
  id, worker_id (nullable si no se identificó), kapso_message_id,
  raw_payload (jsonb), processed (bool), error,
  created_at
```

### Resolución de la caja al recibir una factura

Decisión adoptada: **Opción B — el aprobador elige la caja en el dashboard.**

- La factura entra con `box_id = null` y `status = pending`.
- El dashboard de aprobación muestra las cajas activas del trabajador en un dropdown.
- Al aprobar, se setea `box_id` y se descuenta de esa caja.

Razones: no toca el bot, deja el control donde está la auditoría, y es el menor camino para MVP. Si después molesta, se mueve a un menú por WhatsApp (Opción A).

## 4. Arquitectura del backend (NestJS)

```
src/
  modules/
    auth/                          # login del aprobador, guards JWT
    workers/                       # CRUD trabajadores
    petty-cash/                    # abrir/cerrar caja, asignaciones, saldo
    invoices/                      # crear desde webhook, listar, detalle
    approvals/                     # aprobar/rechazar con transacción
    whatsapp/                      # webhook Kapso + cliente para responder
    ai/                            # GeminiService.extractInvoice(image)
    storage/                       # StorageService (Local|Gcs)
  jobs/
    process-invoice.processor.ts   # BullMQ worker
    queues.module.ts
  common/
    filters/, interceptors/, decorators/, dto/
  config/                          # @nestjs/config + validación con joi/zod
  database/
    models/                        # sequelize-typescript
    migrations/                    # umzug o sequelize-cli
    seeders/
  main.ts
```

### Endpoints principales

```
POST   /auth/login                 # email + password → JWT
GET    /auth/me

GET    /workers                    # listar
POST   /workers
PATCH  /workers/:id
DELETE /workers/:id

GET    /petty-cash                 # listar cajas
POST   /petty-cash                 # abrir caja
POST   /petty-cash/:id/close       # cerrar caja
POST   /petty-cash/:id/assign      # asignar trabajadores
GET    /petty-cash/:id/movements   # histórico de aprobaciones

GET    /invoices?status=pending&worker_id=&box_id=
GET    /invoices/:id
PATCH  /invoices/:id               # editar campos antes de aprobar

POST   /approvals                  # { invoice_id, box_id, action, comments, edited_fields }

POST   /webhooks/kapso             # entrada de mensajes (público, valida firma)
```

## 5. Flujo end-to-end

1. Trabajador envía foto de factura por WhatsApp → Kapso recibe.
2. Kapso dispara `POST /webhooks/kapso` con el mensaje y URL de la imagen.
3. `WhatsappController` valida firma → registra `WhatsappEvent` → encola job `process-invoice` → responde 200 OK.
4. Job worker:
   - Identifica trabajador por `phone`. Si no existe → responde "no estás registrado, contacta al admin".
   - Descarga la imagen, la sube vía `StorageService.put()`.
   - `GeminiService.extractInvoice(image)` → JSON con campos + `confidence_score`.
   - Crea `Invoice` con `status = pending`, `box_id = null`.
   - Responde por WhatsApp: *"Recibí factura de [proveedor] por $[total]. Queda en revisión, ID #[id]."*
5. Aprobador entra al dashboard → `/pending` → ve tabla de pendientes.
6. Abre detalle → imagen al 50% izquierda, campos editables a la derecha, dropdown de caja.
7. Aprueba → `POST /approvals` con transacción Sequelize:
   - `SELECT ... FOR UPDATE` sobre `petty_cash_boxes`
   - valida `current_balance >= invoice.total` y que la caja siga `open`
   - decrementa `current_balance`, setea `invoice.box_id`, `status = approved`
   - inserta `approvals` con `edited_fields` (diff de lo que cambió)
8. (Opcional para MVP) Bot notifica al trabajador con saldo restante.

## 6. Frontend (React)

Pantallas mínimas:

1. **Login** del aprobador.
2. **Cola de pendientes** — tabla con paginación, filtros por caja y trabajador, badge de `confidence_score` bajo.
3. **Detalle / aprobación** — imagen 50% / form 50%, dropdown de caja, botones aprobar/rechazar/comentar.
4. **Cajas** — listar, abrir nueva (individual o compartida), asignar trabajadores, ver saldo y movimientos.
5. **Trabajadores** — CRUD básico.
6. **Histórico** — facturas aprobadas/rechazadas con búsqueda.

Stack frontend:
- Vite + React + TypeScript
- Tailwind + shadcn/ui (componentes accesibles, look profesional, fácil de personalizar)
- TanStack Query para el data fetching
- React Hook Form + Zod para los formularios y validación
- React Router

## 7. Servicio de IA (Gemini)

Prompt + `responseSchema` para forzar salida estructurada:

```ts
const schema = {
  type: "object",
  properties: {
    vendor_nit: { type: "string", nullable: true },
    vendor_name: { type: "string" },
    invoice_number: { type: "string", nullable: true },
    invoice_date: { type: "string", description: "ISO YYYY-MM-DD" },
    subtotal: { type: "number" },
    iva: { type: "number" },
    total: { type: "number" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          description: { type: "string" },
          quantity: { type: "number", nullable: true },
          unit_price: { type: "number", nullable: true },
          total: { type: "number", nullable: true },
        },
      },
    },
    confidence_score: { type: "number", description: "0..1" },
    notes: { type: "string", nullable: true },
  },
  required: ["vendor_name", "total", "confidence_score"],
};
```

Política:
- Modelo por defecto: `gemini-2.5-flash`.
- Si `confidence_score < 0.6`, marcar la factura con flag visual en el dashboard.
- Reintentos: 2 con backoff exponencial ante errores de red o 5xx.

## 8. Plan de implementación por sprints

### Sprint 0 — Setup (1–2 días)
- Estructura del repo (monorepo con `apps/api`, `apps/web` y `packages/shared` opcional).
- NestJS scaffold + Sequelize + Postgres en Docker Compose.
- React + Vite + Tailwind + shadcn.
- BullMQ + Redis en Docker Compose.
- `.env.example` y validación de config.
- Linter, Prettier, scripts de dev.

### Sprint 0.5 — Banco de pruebas de extracción (1–2 días) ⏩ EN CURSO

Aislar el riesgo más alto del MVP (que Gemini extraiga bien facturas reales) **antes** de meter Kapso, DB, colas y aprobación.

**Backend (`apps/api`)** — NestJS mínimo:
- `AiModule` con `GeminiService` (`@google/genai`, `responseSchema`, reintentos, log de prompt y respuesta cruda).
- `ExtractionController` con `POST /extraction/test`: recibe imagen multipart, llama Gemini, devuelve `{ extracted, raw_response, latency_ms, tokens, cost_estimate }`.

**Frontend (`apps/web`)** — React + Vite, una página `/test-extraction`:
- Drag & drop / file picker de imagen (JPG, PNG).
- Preview al 50% izquierda + panel derecho con campos extraídos editables.
- Badge de `confidence_score` con color (verde >0.8, amarillo 0.6–0.8, rojo <0.6).
- JSON crudo colapsable para debug del prompt.
- Métricas: latencia, tokens in/out, costo estimado.
- Selector de modelo: `gemini-2.5-flash` vs `gemini-2.5-pro`.
- Botón "reextraer" para iterar sin volver a subir.

**Fuera de alcance de este sprint:** persistencia, auth, storage permanente, colas. Cuando el prompt esté afinado, se reusan `GeminiService` y la UI casi tal cual en Sprint 1.

### Sprint 1 — Núcleo sin WhatsApp (4 sub-sprints incrementales)

#### Sprint 1.0 — Capa de datos ⏩ EN CURSO
- Docker Compose con Postgres 16.
- Sequelize + sequelize-typescript + `@nestjs/sequelize`.
- 6 modelos con asociaciones: `Worker`, `PettyCashBox`, `BoxAssignment`, `Invoice`, `Approval`, `WhatsappEvent`.
- Seed script con 1 admin, 1 aprobador, 3 trabajadores, 1 caja individual y 1 caja compartida.
- `DB_SYNC=true` en dev hace que Sequelize cree el schema al arrancar la API (migrations vienen en Sprint 1.5).

#### Sprint 1.1 — Auth JWT + Workers CRUD
- `AuthModule` con login email+password (bcrypt) y JWT.
- Guards `JwtAuthGuard` y `RolesGuard`.
- `WorkersModule` con CRUD restringido a admin.
- Pantalla de login en frontend + página de gestión de trabajadores.

#### Sprint 1.2 — Cajas menores
- `PettyCashModule`: abrir caja, cerrar caja, asignar trabajadores, consultar saldo, listar movimientos.
- Página de cajas en el frontend con creación de cajas individuales y compartidas.

#### Sprint 1.3 — Facturas + flujo de aprobación
- `StorageModule` con impl local (filesystem en `./uploads`).
- `POST /invoices` recibe imagen, llama Gemini (reusa el `GeminiService` del banco de pruebas), crea factura `pending` sin caja.
- `POST /approvals` con transacción Sequelize y `SELECT ... FOR UPDATE` sobre la caja.
- Cola de pendientes + pantalla de detalle/aprobación en el frontend, con la imagen y los campos editables.
- **Demo posible:** subir factura → IA extrae → aprobador asigna caja + aprueba → saldo decrementa.

#### Sprint 1.5 — Migrations (opcional antes de prod)
- Reemplazar `sync` por migrations propias con `sequelize-cli` o `umzug`.

### Sprint 2 — IA (2–3 días)
- `StorageService` con impl local.
- `GeminiService` con `responseSchema`.
- Job BullMQ que toma imagen → storage → Gemini → crea invoice.
- Mostrar `confidence_score` y `extracted_data` crudo en el dashboard.

### Sprint 3 — WhatsApp vía Kapso (3–4 días)
- Configurar agente en Kapso con webhook al backend.
- Endpoint `POST /webhooks/kapso` con validación de firma.
- `KapsoService` para enviar mensajes salientes.
- Comandos del bot: `saldo`, `mis facturas`, `ayuda`.
- Manejo de trabajador no registrado.

### Sprint 4 — Pulido para demo (1–2 días)
- Notificaciones de aprobación/rechazo por WhatsApp.
- Histórico y reportes básicos (export CSV).
- Logs de auditoría visibles en el dashboard.

### Sprint 5 — Migración a GCP (cuando esté listo)
- Crear Cloud SQL Postgres + Cloud Storage bucket.
- Implementar `GcsStorage` (la interfaz ya existe).
- Cloud Run para backend, Vercel o Cloud Run para frontend.
- Secret Manager para keys de Gemini y Kapso.
- Memorystore para Redis o Upstash como alternativa.

## 9. Variables de entorno

```
# Backend
NODE_ENV=development
PORT=3000

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=ocrdemo
DB_USER=ocrdemo
DB_PASSWORD=ocrdemo

# Redis / BullMQ
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT
JWT_SECRET=change-me
JWT_EXPIRES_IN=8h

# Storage
STORAGE_DRIVER=local             # local | gcs
LOCAL_STORAGE_PATH=./uploads
GCS_BUCKET=
GCS_KEYFILE=

# Gemini
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash

# Kapso
KAPSO_WEBHOOK_SECRET=
KAPSO_API_KEY=
KAPSO_API_URL=
```

## 10. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Gemini extrae mal campos de facturas borrosas o con sello | `confidence_score` visible, aprobador siempre puede editar antes de aprobar |
| Trabajador manda algo que no es factura (selfie, captura) | El prompt rechaza con `confidence_score` bajo y el bot pide reenviar |
| Aprobaciones concurrentes sobre la misma caja compartida descuentan dos veces | Transacción con `SELECT ... FOR UPDATE` y validación de saldo antes de descontar |
| Webhook de Kapso se reintenta y duplica facturas | Idempotencia por `kapso_message_id` en `WhatsappEvent` |
| Costo de Gemini si crece el volumen | Flash por defecto, monitoreo de tokens, opción de cachear extracciones por hash de imagen |

## 11. Fuera de alcance del MVP

- App móvil propia (todo va por WhatsApp).
- Integración con contabilidad (SAP, Siigo, etc.).
- Multi-tenant (una sola organización por ahora).
- OCR de tickets POS muy degradados (puede venir en v2 con Document AI).
- Reportes avanzados y BI.
