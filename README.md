# OCRDEMO — Caja menor por WhatsApp con IA

MVP para legalizar gastos de caja menor: trabajadores envían facturas por WhatsApp, Gemini extrae los datos, un aprobador los valida en un dashboard, y se descuenta del saldo de la caja.

Plan completo en [`PLAN.md`](./PLAN.md).

## Estructura

```
apps/
  api/          NestJS + TypeScript (puerto 3000)
  web/          React + Vite + Tailwind (puerto 5173)
```

## Setup inicial

Requisitos: Node 20+, npm 10+.

```powershell
# 1. Instalar deps de todos los workspaces
npm install

# 2. Configurar API key de Gemini
copy apps\api\.env.example apps\api\.env
# Editar apps\api\.env y pegar GEMINI_API_KEY de https://aistudio.google.com/apikey
```

## Levantar el banco de pruebas de extracción

```powershell
# En una terminal
npm run dev:api

# En otra
npm run dev:web
```

Abrir http://localhost:5173 → la pantalla **Test Extraction** te deja arrastrar una factura y ver lo que Gemini extrae.

## Próximos pasos

Ver [`PLAN.md`](./PLAN.md) — Sprint 1 en adelante: persistencia, aprobación, Kapso.
