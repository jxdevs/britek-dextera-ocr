# Informe Ejecutivo — Control de Caja Menor
### Sistema Britek Dextera · Junio 2026

---

## Objetivo del sistema

Britek Dextera es una plataforma diseñada para **controlar y legalizar el uso de Caja Menor** en proyectos de construcción. Los residentes de obra reportan sus gastos enviando fotos de facturas por WhatsApp. El sistema extrae la información automáticamente con inteligencia artificial y la somete a un flujo de aprobación controlado.

---

## Resumen de cumplimiento

De las **15 reglas** definidas en el borrador de políticas, el sistema implementa **14 de forma automática**. La única regla excluida (gestión de proveedores no registrados) fue descartada intencionalmente.

| Categoría | Reglas | Cumplidas |
|---|:---:|:---:|
| Estructura y asignación | 3 | ✅ 3 |
| Límites financieros | 2 | ✅ 2 |
| Definición de gasto | 2 | ✅ 2 |
| Tiempos de legalización | 3 | ✅ 3 |
| Soporte y trazabilidad | 2 | ✅ 2 |
| Proveedores no registrados | 1 | ⏸️ Excluida |
| NIT obligatorio | 1 | ✅ 1 |
| Observaciones y excepciones | 2 | ✅ 2 |
| **Total** | **16** | **14 ✅ · 1 ⏸️** |

---

## ¿Quién puede hacer qué?

El sistema maneja **tres roles** con permisos diferenciados:

| | Residente | Aprobador | Administrador |
|---|:---:|:---:|:---:|
| Enviar facturas por WhatsApp | ✅ | — | — |
| Ver y revisar facturas | — | ✅ | ✅ |
| Aprobar facturas normales | — | ✅ | ✅ |
| Aprobar facturas observadas (irregulares) | — | ❌ | ✅ |
| Crear cajas menores | — | — | ✅ |
| Crear cajas con excepción al tope | — | — | ✅ con justificación |
| Cerrar, editar y eliminar cajas | — | — | ✅ |
| Consultar auditoría | — | ✅ | ✅ |

---

## Detalle de cada regla

### 1. Estructura y asignación de la Caja Menor

#### ✅ Cada caja está vinculada a un residente, proyecto y centro de costo

Al abrir una caja menor, el sistema **exige obligatoriamente** que se indique:
- Al menos un residente responsable
- El nombre del proyecto
- El centro de costo

No es posible crear una caja sin estos tres datos.

#### ✅ No se puede abrir una caja nueva si la anterior no está legalizada

Antes de abrir una nueva caja, el sistema verifica:
1. Que el residente **no tenga otra caja abierta o bloqueada**.
2. Que sus **cajas cerradas anteriores no tengan facturas pendientes** de revisar.

Si alguna condición no se cumple, el sistema muestra un mensaje claro indicando qué caja debe legalizarse primero.

#### ✅ La asignación de residentes es inmutable

Una vez que la caja tiene al menos una factura registrada, **no se pueden cambiar los residentes asignados**. Esto garantiza que la responsabilidad quede fija desde el primer movimiento. Solo se permite reasignar si la caja fue creada por error y aún no tiene movimientos.

---

### 2. Límites financieros

#### ✅ Tope máximo de $1.000.000 por caja

El sistema impide crear cajas que superen **un millón de pesos** ($1.000.000 COP).

#### ✅ Excepciones al tope con justificación

Si un administrador necesita crear una caja por un monto mayor, puede hacerlo bajo estas condiciones:
- Solo un usuario con rol de **administrador** puede hacerlo.
- Debe escribir una **justificación** de al menos 10 caracteres.
- La excepción queda registrada en el **registro de auditoría** con el nombre del administrador, la justificación y la fecha.

Un aprobador o residente **nunca** puede crear cajas por encima del tope.

---

### 3. Categorización de gastos

#### ✅ Clasificación automática por inteligencia artificial

Cuando un residente envía la foto de una factura, el sistema de IA clasifica automáticamente el tipo de gasto en una de estas categorías:

| Categoría | Ejemplos |
|---|---|
| Combustible | Gasolina, ACPM, gas vehicular |
| Transporte | Taxis, Uber, fletes |
| Peajes | Peajes de carreteras |
| Parqueaderos | Estacionamientos |
| Materiales | Ferretería, insumos de obra |
| Consumibles | Papelería, aseo, útiles |
| Alimentación | Restaurantes, cafeterías |
| Otro | Cualquier gasto no clasificado |

La categoría queda visible para el aprobador en el panel de revisión.

#### ✅ Gastos de alimentación requieren aprobación especial

Cuando la IA detecta que una factura corresponde a **alimentación**, el sistema la marca automáticamente como **"Observada"** y solo un administrador puede aprobarla. Un aprobador regular no tiene permiso para legalizar este tipo de gasto.

---

### 4. Tiempos y alertas

#### ✅ Detección de reporte tardío

Si un residente reporta una factura **más de 24 horas después** de la fecha de compra, el sistema la marca como:
- **Reporte tardío** — visible con un indicador naranja en el panel.
- **Requiere aprobación de administrador** — se envía a la bandeja de observadas.

#### ✅ Alertas de consumo al 75%, 80% y 90%

El sistema muestra alertas visuales progresivas cuando el saldo de una caja se agota:

| Consumo | Alerta |
|---|---|
| **75%** | 🟡 Amarilla — _"Revisar caja y preparar legalización"_ |
| **80%** | 🟠 Naranja — _"Iniciar preparación de legalización"_ |
| **90%** | 🔴 Roja — _"Fondos casi agotados — prepare legalización"_ |

Estas alertas aparecen tanto en la lista general de cajas como en el detalle de cada caja.

#### ✅ Bloqueo automático por vencimiento de plazo

Cada caja tiene un **plazo máximo de 7 días**. Si no se cierra dentro de ese plazo:

1. El sistema la bloquea automáticamente (estado "Bloqueada").
2. **No se pueden aprobar** más facturas en esa caja.
3. Se muestra un banner rojo indicando que un administrador debe intervenir.
4. Un administrador puede cerrarla manualmente para proceder con la legalización.

El semáforo de plazo es visible en todo momento:
- 🟢 Verde — Más de 3 días restantes
- 🟡 Amarillo — 2 a 3 días restantes
- 🟠 Naranja — Último día
- 🔴 Rojo — Vencida / Bloqueada

---

### 5. Calidad del soporte contable

#### ✅ Extracción automática de datos con IA

El sistema usa inteligencia artificial (Google Gemini) para extraer automáticamente de cada factura:
- Nombre del proveedor
- NIT (identificación tributaria)
- Número de factura
- Fecha
- Subtotal, IVA y total
- Productos o servicios facturados
- Categoría de gasto

Además, la IA calcula un **puntaje de confianza** de 0% a 100% que indica qué tan legible y completa es la factura.

#### ✅ Soportes débiles requieren aprobación de administrador

Cuando una factura tiene problemas de calidad, el sistema la envía automáticamente a la bandeja de **"Observadas"**. Los criterios son:

| Problema | Consecuencia |
|---|---|
| Sin NIT del proveedor | Confianza ≤ 10%, requiere admin |
| Confianza menor al 60% | Requiere admin |
| Categoría restringida (alimentación) | Requiere admin |
| Reporte tardío (> 24 horas) | Requiere admin |

En todos los casos, solo un **administrador** puede aprobar la factura, y debe dejar un **comentario escrito** justificando la excepción.

---

### 6. Proveedores no registrados

#### ⏸️ Regla no implementada

La gestión de proveedores no registrados (límites de facturación por proveedor, alertas por uso recurrente y verificación de seguridad social) no fue incluida en esta versión por decisión del equipo.

---

### 7. NIT obligatorio

#### ✅ El NIT es el dato más importante de la factura

El sistema aplica las siguientes medidas cuando una factura **no tiene NIT**:

1. La confianza automática baja a un máximo del **10%**, sin importar la calidad del resto de la factura.
2. La factura se marca como **"Observada"** (no entra a la cola normal de pendientes).
3. Solo un **administrador** puede aprobarla.
4. El administrador debe dejar un **comentario** explicando por qué aprueba sin NIT.
5. Todo queda registrado en el **registro de auditoría**.

En el panel, la factura muestra una alerta roja: _"⚠️ Sin NIT — requiere aprobación de admin con justificación"_.

---

### 8. Trazabilidad y gestión de excepciones

#### ✅ Registro completo de auditoría

**Toda acción** en el sistema queda registrada con:
- Quién la hizo (nombre, rol)
- Cuándo (fecha y hora exacta)
- Qué hizo (crear, editar, aprobar, rechazar, eliminar, cerrar)
- Qué cambió (datos antes y después del cambio)

El registro es consultable desde el panel por administradores y aprobadores.

Acciones que se auditan:
- Inicios de sesión exitosos y fallidos
- Creación, edición y eliminación de cajas
- Apertura y cierre de cajas
- Aprobación y rechazo de facturas
- Cambios manuales a datos de factura durante la aprobación
- Excepciones al tope de $1.000.000

#### ✅ Bandeja de excepciones (facturas observadas)

Las facturas que no cumplen alguna política no se mezclan con las normales. El sistema las separa en una **bandeja dedicada** llamada "Observadas", con las siguientes características:

- **Tab independiente** en el panel de facturas, con color violeta para distinguirlas.
- Solo son visibles y aprobables por **administradores**.
- Cada factura muestra claramente **por qué fue observada** (sin NIT, confianza baja, alimentación, reporte tardío).
- Al aprobar, el administrador **debe** dejar un comentario que justifique la excepción.
- La decisión queda registrada con fecha, usuario y motivo.

---

## Indicadores clave del sistema

| Indicador | Valor |
|---|---|
| Reglas automatizadas | 14 de 15 |
| Canales de entrada | WhatsApp + Panel web |
| Extracción de datos | Automática (IA Google Gemini) |
| Categorización de gastos | Automática (8 categorías) |
| Roles de acceso | 3 (Residente, Aprobador, Admin) |
| Niveles de alerta financiera | 3 (75%, 80%, 90%) |
| Plazo máximo por caja | 7 días (bloqueo automático) |
| Tope máximo estándar | $1.000.000 COP |
| Autenticación | Google OAuth (sin contraseñas) |
| Registro de auditoría | Completo (todas las acciones) |

---

*Documento generado automáticamente. Para consultas técnicas, referirse al informe técnico detallado.*
