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

## 3. Verificación de Compilación y Calidad

- `npx tsx scripts/test_handoff_resilience.ts`: **100% tests pasados (humano, frustración, producto normal, bucle).**
- `npx tsc --noEmit`: **0 errores de compilación.**
- `npm run build`: **Compilación a JavaScript exitosa y blueprints sincronizados en `dist/`.**
- Base de datos: **Campaña `live-commerce-peru` activa y lista.**

