# Walkthrough: Integración Nativa Shalom, Flujo de Pagos & Onboarding 100% WhatsApp

Hemos completado la arquitectura integral soberana de **Shalom**, **Validación Humana de Pagos por WhatsApp** y la **Campaña de Live Shopping (TikTok Live / Instagram)** para todo el Perú.

---

## 1. Componentes Desarrollados

### 1.1. Módulo Logístico Soberano de Shalom (`src/logistics/`)
- [x] [`shalom_types.ts`](file:///c:/Users/Ken%20Ryzen/Documents/proyectos-sass/qp-outreach-engine/src/logistics/shalom_types.ts): Contratos de datos tipados y validados con Zod (`ShalomCredentials`, `ShalomSession`, `ShalomAgency`, `ShalomCreateOrderPayload`, `ShalomOrderResult`, `ShalomTrackingStatus`).
- [x] [`shalom_agencies.ts`](file:///c:/Users/Ken%20Ryzen/Documents/proyectos-sass/qp-outreach-engine/src/logistics/shalom_agencies.ts): Catálogo maestro de agencias de Shalom a nivel nacional (Gamarra, Grau, San Isidro, Trujillo, Arequipa, Cusco, Piura, etc.) con buscador de coincidencias heurístico por texto.
- [x] [`shalom_native_client.ts`](file:///c:/Users/Ken%20Ryzen/Documents/proyectos-sass/qp-outreach-engine/src/logistics/shalom_native_client.ts): 
  - Handshake y autenticación directa contra `pro.shalom.pe`.
  - **Candado de Idempotencia Interna (24h):** Evita la emisión duplicada de guías si el encargado envía `/guia` dos veces.
  - Consulta y rastreo oficial público de encomiendas.
- [x] [`shalom_chat_onboarding.ts`](file:///c:/Users/Ken%20Ryzen/Documents/proyectos-sass/qp-outreach-engine/src/logistics/shalom_chat_onboarding.ts): 
  - Parser conversacional en lenguaje natural y comando `/setup-shalom <email> <password> <agencia>`.
  - Handshake en tiempo real para verificar credenciales de Shalom Pro antes de guardarlas.
  - **Fail-safe de 2 intentos:** Tras 2 errores consecutivos de contraseña, transfiere automáticamente a soporte humano (`HUMAN_TAKEOVER`).

---

### 1.2. Protocolo de Aprobación de Pagos y Emisión de Guías (`src/hermes/hermes_c2.ts` & `src/whatsapp/nlp_router.ts`)
- **Aprobación / Rechazo de Pagos (Nivel 1 - Kenneth):**
  - Reconoce órdenes en lenguaje natural y comandos: `aprobar pago [tel]`, `rechazar pago [tel]`, `validar pago`, `pago aprobado`.
  - **Aprobación:** Actualiza el estado a `CLOSED_WON`, registra el pago verificado y dispara automáticamente el mensaje de bienvenida y solicitud de credenciales de Shalom Pro al WhatsApp del cliente.
  - **Rechazo:** Pasa a `HUMAN_TAKEOVER`, avisa cordialmente al cliente que Kenneth le hablará personalmente y silencia al bot.
- **Emisión de Guías Shalom (Nivel 2 - Dueño de Tienda):**
  - Comando `/guia [tel]` o en lenguaje natural (`guia`, `sacar guia`, `emitir guia`).
  - **Bifurcación Geográfica:**
    - **Lima / Callao:** Detecta despacho local por motorizado / contra-entrega y notifica la dirección sin gastar guía provincial.
    - **Provincias:** Emite la guía en Shalom Pro, guarda el N° de guía y rótulo PDF en Postgres, y envía la notificación con número y link de seguimiento al comprador por WhatsApp.

---

### 1.3. Detección Inteligente en Baileys (`src/whatsapp/baileys_engine.ts`)
- **Detección Temprana de Comprobantes:**
  - Cuando un lead envía una imagen o menciona palabras clave (`yape`, `plin`, `transferencia`, `comprobante`, `voucher`), el motor lo clasifica como `PAYMENT_PENDING`.
  - Responde al instante confirmando la recepción y reenviando la notificación y la imagen del comprobante a Kenneth a su WhatsApp privado (`51902105668`).
- **Detección Temprana de Onboarding:**
  - Si el cliente responde con sus datos de Shalom o usa `/setup-shalom`, el motor delega a `ShalomChatOnboarding` y confirma la conexión.

---

### 1.4. Campaña de Live Shopping Registrada en PostgreSQL
- [x] **Campaña:** `live-commerce-peru`
- [x] **Queries Apify:** Tiendas de ropa Gamarra, boutiques Miraflores, importaciones de tecnología, calzado y accesorios de moda en Lima.
- [x] **Plantilla:** Técnica del permiso en 2 pasos destacando la pérdida de pedidos por demora de respuesta y la solución de atención en 3s + emisión automática con Shalom.
- [x] **Script ejecutado:** `scripts/register_live_commerce_campaign.ts` corrió exitosamente contra la base de datos de Railway.

---

## 2. Sistema a Prueba de Errores: Circuit Breaker & Handoff Automático (`src/failover/`)

Inspirado en la robustez operativa de plataformas consolidadas como **Flujos Inteligentes**, se implementó el **`HandoffManager`**:

- [x] **Circuit Breaker con Timeout de 12s:** Envoltorio estricto con `Promise.race` sobre el motor de IA (`SetterEngine`). Si OpenRouter o Gemini tardan más de 12s o arrojan excepción (500, caída de red), el bot nunca se queda congelado:
  - Envía al instante el mensaje cálido: *"Un momento por favor 🙌, te comunico con un asesor en este mismo chat para ayudarte de inmediato con los detalles 🤝."*
  - Silencia a la IA pasando el lead a `HUMAN_TAKEOVER`.
  - Dispara la alerta con contexto al WhatsApp del administrador correspondiente.
- [x] **Triggers Conversacionales Inmediatos:**
  - **Solicitud de persona:** Detecta palabras como *"asesor"*, *"humano"*, *"persona"*, *"quiero hablar con alguien"*, etc.
  - **Detección de frustración:** Detecta frases como *"no me entiendes"*, *"estafa"*, *"reclamo"*, etc.
  - **Detector de bucles:** Si el prospecto envía la misma consulta dos veces seguidas, pasa a humano de inmediato.
- [x] **Arquitectura Dual-Mode (Master vs Servidor de Cliente en Railway/VPS):**
  - **En tu servidor Master (The Quant Partners):** La alerta ejecutiva va a tu WhatsApp personal (`51902105668`).
  - **En el servidor del cliente (Railway o VPS satélite):** La alerta se despacha automáticamente al WhatsApp del dueño de la tienda (`settings.adminWhatsAppPhone`) o a sus asesores de ventas (`settings.salesReps`), sin mezclar bases de datos ni clientes.
- [x] **Reactivación Híbrida del Bot:**
  - **Comandos de Control:** `/bot on [tel]` / `/ia on [tel]` (enciende la IA), `/bot off [tel]` (silencia la IA), `/bot status [tel]`.
  - **Auto-reactivación tras 24h:** Si el chat quedó en Takeover y pasan más de 24 horas de silencio, al llegar un nuevo mensaje de otro día el bot vuelve a atender automáticamente.

---

## 📊 Unificación del Reporte de Cierre y Corrección del Bug de Zona Horaria (UTC vs Lima)

### 🎯 Diagnóstico y Problemas Encontrados
1. **Doble Reporte Competidor a las 19:00:**
   - **Reporte 1:** `HERMES C2 · REPORTE DE CIERRE (7:00 PM)` (`src/hermes/hermes_c2.ts`) — El reporte oficial, multi-canal (WhatsApp Ghost CRM + Cold Emails Resend Cloud + Estado Operativo) con métricas reales (28 contactados, 20 respuestas).
   - **Reporte 2:** `REPORTE DIARIO DE PROSPECCIÓN QP` (`src/pipeline/autonomous_pipeline.ts`) — Un reporte legado paralelo que se disparaba en `AutonomousPipeline.tick()` al entrar en pausa nocturna.
2. **Bug de Rollover de Zona Horaria UTC:**
   - `AutonomousPipeline` y `ColdEmailScheduler` calculaban `today` con `new Date().toISOString().slice(0, 10)` (UTC).
   - A las 7:00 PM Lima (19:00 PET / UTC-5), en UTC ya eran las 00:00 del día siguiente (`2026-09-19`).
   - Por ende, consultaba la tabla `daily_activity` para el día 19 (que aún tenía 0 envíos y 0 respuestas), mostrando todo en 0.
   - Además, reseteaba el contador `sentTodayCount` a las 7:00 PM en lugar de la medianoche de Lima.
3. **Re-disparo en Reinicios / Redeploys Nocturnos:**
   - Cada vez que el contenedor se reiniciaba durante la noche (ej. a las 19:16 al desplegar), `this.dailyReportSentDay` en memoria iniciaba vacío, la hora era `>= 19`, y volvía a despachar el reporte duplicado en ceros.

### 🛠️ Solución Definitiva Implementada
1. **Unificación en Hermes C2:**
   - Se consolidó toda la telemetría en `HermesC2.dispatchEveningReport()` (7:00 PM), incorporando además las métricas consolidadas del Embudo Global (En Cola, En Seguimiento, Citas Agendadas).
   - Se eliminó `sendNightlyReport` de `AutonomousPipeline` para que **NUNCA** existan dos reportes compitiendo.
2. **Helper Oficial `getLimaDateStr()`:**
   - Se implementó `getLimaDateStr()` usando `Intl.DateTimeFormat('en-CA', { timeZone: 'America/Lima' })` tanto en `AutonomousPipeline` como en `ColdEmailScheduler`.
   - El reseteo de contadores diarios ahora ocurre a la medianoche real de Perú, no a las 7:00 PM.
3. **Cero Re-envíos en Reinicio:**
   - `HermesC2.initScheduler()` restringe el reporte al intervalo estricto `peruHour === 19 && peruMinute < 5 && !this.eveningReportSentToday`.
   - Cualquier reinicio posterior a las 19:05 jamás disparará un reporte tardío.

### 🚀 Despliegue en Producción (Coolify VPS `89.117.49.92`)
- **Commit:** `e9b9d3c` (`fix(reports): eliminate duplicate nightly report and fix Peru timezone rollover bug`)
- **Coolify Deployment:** #24 (`vcrd7z1ffowhdsoggcd69qfj`) -> `status: finished`
- **Contenedor:** `91f3cbc3248b` activo y verificado en vivo.
- **Gateway Live:** `https://gateway.thequantpartners.com/api/status` -> `isWhatsAppReady: true`, `uptimeSeconds: 55`.

---

## 4. Sincronización Nativa de Zoho Mail SMTP y Fallback Resend (Despliegue #25)

### 🎯 Diagnóstico y Causa Raíz
1. **Entrega de Correo Verificada:** El correo aprobado a **Clínica de Encías (`info@clinicadeencias.pe`)** fue entregado a las 10:20:07 AM PET vía Resend API (AWS SES `sa-east-1`, ID `01a0ba40-d7c2-730d-8e72-9e9c76b97c10`).
2. **Ausencia en "Enviados" de Zoho Mail:** Debido a que el motor priorizaba la API HTTP de Resend para evadir bloqueos de puertos, el correo nunca pasó por `smtp.zoho.com`. Por ende, el webmail de Zoho no tenía registro de la sesión y no guardó el mensaje en la carpeta "Enviados".

### 🛠️ Solución Implementada
1. **Prioridad 1 (Zoho SMTP - Puerto 587 STARTTLS):** Conexión directa y rápida a `smtp.zoho.com`. Todo correo aprobado se guarda automáticamente en la carpeta "Enviados" de `mail.zoho.com`.
2. **Prioridad 2 (Resend API Fallback + BCC):** Si Zoho SMTP falla por límite o corte de red, Resend despacha de inmediato e incluye `bcc: partners@thequantpartners.com` como respaldo en la bandeja de entrada.
3. **Alertas Transparentes en Hermes C2:** Informa si fue despachado vía Zoho Mail SMTP o Resend Cloud.

### 🚀 Despliegue en Producción (Coolify VPS `89.117.49.92`)
- **Commit:** `ec8b15d` (`fix(mailer): prioritize Zoho SMTP port 587 for native Sent folder sync and add Resend API fallback with BCC`)
- **Coolify Deployment:** #25 -> `status: finished`
- **Contenedor Activo:** `b90533de8825` verificado en vivo (`isWhatsAppReady: true`).
- **Pruebas en Contenedor:**
  - Envío directo Zoho SMTP (587): `✅ Guardado en Enviados de Zoho (MessageId: <91e75758-2df6-45a0-6d95-accd3dddf7a9@thequantpartners.com>)`.
  - Simulación de fallback Resend con BCC: `✅ Entregado vía Resend API con BCC a partners@thequantpartners.com`.
- **Dr. Manuel Sinchi (`+51 961 360 074`):** Confirmado recontacto a las 10:30:22 AM PET con oferta de pago único y adelanto de S/. 500 bajo `HUMAN_TAKEOVER`.


