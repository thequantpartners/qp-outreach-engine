# AGENTS.md: QP Outreach Engine (Headless AI Gateway & MCP Server)

## 1. Identidad y Misión del Sistema
- **Nombre:** `QP Outreach Engine`
- **Rol:** Gateway Centralizado Headless de WhatsApp, Scraping de Prospección B2B y Servidor MCP Nativo.
- **Ecosistema:** The Quant Partners (Kenneth & Smith).
- **Destinatarios:** Todos los Agentes de Inteligencia Artificial (ej. **Antigravity**, **Cursor**, **Claude Desktop**, **Smith** en `licitaciones-qp`, **Smith** en `lar-engine`, etc.).

---

## 2. Conexión como Servidor MCP (Model Context Protocol)

Cualquier IA puede conectarse a este microservicio mediante el estándar oficial MCP sin escribir código HTTP.

### 2.1. Conexión Remota en Railway (Transporte SSE)
Agrega esto a tu configuración MCP (`.cursor/mcp.json`, `claude_desktop_config.json`, etc.):
```json
{
  "mcpServers": {
    "qp-outreach": {
      "url": "https://qp-outreach-engine.up.railway.app/sse"
    }
  }
}
```

### 2.2. Conexión Local en Desarrollo (Transporte Stdio)
```json
{
  "mcpServers": {
    "qp-outreach": {
      "command": "node",
      "args": ["c:/Users/Ken Ryzen/Documents/proyectos-sass/qp-outreach-engine/bin/qp-outreach.js", "mcp"]
    }
  }
}
```

---

## 2.3. Protocolo Obligatorio para IAs: Creación de Campañas (Modo Co-Piloto Proactivo)
> [!IMPORTANT]
> **REGLA PARA CUALQUIER AGENTE DE IA (Antigravity, Cursor, Smith, Claude):**  
> La IA debe actuar como un estratega proactivo que **ahorra tiempo a Kenneth**.  
> En lugar de abrumarlo con un cuestionario largo, la IA **solo le pide lo esencial (Paso 1)** y se encarga del **trabajo pesado de redacción y estrategia (Paso 2)**:
>
> ### Paso 1: Lo único que la IA le pregunta a Kenneth (Las 3 Variables Clave)
> 1. **Nicho / A quién va dirigida:** (ej. *"Estudios de abogados en Lima"*).
> 2. **Servicio y entregable:** ¿Qué solución les ofrecemos y qué reciben?
> 3. **Política de precios:** ¿Hay un precio fijo que deba decir el bot, o se transfiere a Kenneth para cotización a la medida?
>
> ### Paso 2: La IA genera de forma autónoma la propuesta completa:
> Tomando esos 3 datos, la IA formula y le presenta a Kenneth en un solo mensaje:
> - **Queries de Apify sugeridas:** 3 a 4 términos de búsqueda óptimos en Google Maps (ej. *"estudios de abogados san isidro"*, *"abogados corporativos miraflores"*).
> - **Mecanismo de cierre:** `HUMAN_TAKEOVER` hacia Kenneth (`51902105668`).
> - **Plantilla de Prospección:** Redactada con técnica de permiso en 2 pasos, sin links, personalizada.
> - **Prompt del Bot:** Incluyendo las 3 objeciones típicas del nicho, respuestas recomendadas y reglas anti-alucinación.
>
> ### Paso 3: Validación rápida
> Kenneth solo revisa la propuesta, da su visto bueno (*"Listo, ejecútala"*) o pide un ajuste puntual, y recién ahí la IA llama a `launch_campaign`.

---

## 3. Catálogo de Herramientas MCP para IAs

| Herramienta MCP | Categoría | Descripción |
| :--- | :---: | :--- |
| `launch_campaign` | Campañas | **(Principal)** Dispara una campaña: oferta, queries de Apify, plantilla con permiso en 2 pasos, prompt del bot y delay anti-ban. |
| `list_campaigns` | Campañas | Lista todas las campañas/servicios registrados (queries, estado activo/inactivo, plantilla, cierre). |
| `get_campaign` | Campañas | Ficha técnica completa y métricas específicas de conversión de una campaña por `service_id`. |
| `update_campaign` | Campañas | Modifica campos de una campaña (nombre, plantilla, prompt, queries, cierre) sin re-raspar ni borrar leads. |
| `toggle_campaign` | Campañas | Pausa (`active: false`) o reanuda (`active: true`) una campaña específica por su ID. |
| `delete_campaign` | Campañas | Elimina una campaña por su ID (`service_id`) o todas las existentes pasando `service_id: "all"`. |
| `list_leads` | Leads | Filtra prospectos por estado (`DISCOVERED`, `OUTREACH_SENT`, `REPLIED`, `QUALIFIED`, `CLOSED_WON`, `HUMAN_TAKEOVER`). |
| `update_lead_status` | Leads | Actualiza manualmente el estado comercial de un prospecto por su número de teléfono. |
| `delete_leads` | Leads | Elimina prospectos según filtros (`service_id`, `status`, `phone` o `all: true`). |
| `import_leads` | Leads | Ingesta masiva de prospectos (bases de OSCE, SEACE, Sunat, CSVs) con sanitización telefónica y deduplicación. |
| `send_document` | Leads | Despacha un PDF o documento nativo por WhatsApp a cualquier prospecto. |
| `get_chat_history` | Leads | Lee la transcripción completa de la conversación de WhatsApp con un prospecto. |
| `send_whatsapp_message` | Leads | Envío manual inmediato a cualquier número (silencia a la IA en Human Takeover). |
| `toggle_human_takeover` | Leads | Pausa (`active: true`) o reanuda (`active: false`) el bot de IA para un lead. |
| `trigger_scraping` | Scraping | Ejecuta scraping en Apify ad-hoc para un término y ciudad con deduplicación en PostgreSQL. |
| `outreach_status` | Sistema | Verifica conexión de WhatsApp, salud del servicio, métricas globales del embudo y pipeline. |
| `get_whatsapp_qr` | Sistema | Obtiene el código QR actual de WhatsApp si la sesión requiere escaneo. |
| `configure_settings` | Sistema | Ajusta delays anti-ban (min/max), límite diario, horarios, webhook de desconexión y teléfono admin. |
| `list_fleet_clients` | Master Hub | **(Master)** Lista todos los clientes y nodos satélite aprovisionados, estado de WhatsApp, leads y dashboard URLs. |
| `provision_client` | Master Hub | **(Master)** Aprovisiona una nueva infraestructura satélite en 60s desde una plantilla de nicho o custom. |
| `clone_client` | Master Hub | **(Master)** Duplica la configuración y prompts de un cliente existente para uno nuevo en 1 clic. |
| `list_niche_blueprints` | Master Hub | **(Master)** Lista las plantillas predefinidas por nicho (Inmobiliarias, Clínicas, Abogados, Construcción). |
| `get_fleet_health` | Master Hub | **(Master)** Métricas consolidadas de salud de toda la flota de clientes. |

### Ejemplo de Invocación MCP para `launch_campaign`:
```json
{
  "service_id": "agentes-ia-clinicas",
  "service_name": "Agentes de Ventas con IA para Clínicas",
  "search_queries": ["clinicas esteticas lima", "centros odontologicos surco"],
  "target_locations": ["Lima, Peru"],
  "max_leads": 30,
  "outreach_template": "Buenas tardes al equipo de {{name}}.\n\nLe escribe Kenneth de The Quant Partners.\n\nEstuvimos revisando sus canales y detectamos una oportunidad inmediata para implementar un agente de atención y agendamiento con IA en WhatsApp para triplicar la conversión de pacientes.\n\n¿Me permite compartirle un video de 3 minutos con la arquitectura?",
  "ai_sales_instructions": "Eres Kenneth de The Quant Partners. Hablas con administradores de clínicas con tono consultivo, respetuoso y profesional. Respuestas breves (máximo 2 a 3 oraciones). Si están interesados, comparte el link de reunión: https://cal.com/kenneth-qp/agentes-ia.",
  "closing_type": "MEETING_LINK",
  "closing_payload": {
    "meetingUrl": "https://cal.com/kenneth-qp/agentes-ia"
  },
  "delay_seconds": 210
}
```

---

## 4. Uso Mediante CLI (Línea de Comandos)

Cualquier agente con capacidad de terminal puede ejecutar los comandos de `qp-outreach`:

```bash
# Ver estado del engine y métricas
npx qp-outreach status

# Iniciar campaña con scraping y prospección
npx qp-outreach launch --name="Agentes IA" --query="inmobiliarias miraflores" --max=25

# Listar prospectos
npx qp-outreach leads --status=REPLIED

# Leer conversación con un lead
npx qp-outreach chat 51987654321

# Enviar mensaje manual (silencia la IA)
npx qp-outreach send 51987654321 "Buenas tardes, ¿a qué hora podemos reunirnos?"

# Alternar control humano
npx qp-outreach takeover 51987654321 on
```

---

## 5. Endpoints REST API (Para Agentes Satélite sin MCP)

### 5.1. Headers Obligatorios
```http
x-api-key: YOUR_API_SECRET_KEY
```
o
```http
Authorization: Bearer YOUR_API_SECRET_KEY
```
```json
{
  "query": "distribuidora de equipos medicos lima",
  "location": "Lima, Peru",
  "maxResults": 15,
  "countryCode": "pe",
  "scrapeContacts": true
}
```
- **Respuesta:**
```json
{
  "success": true,
  "query": "distribuidora de equipos medicos lima",
  "totalFound": 15,
  "leads": [
    {
      "title": "Inforday Soluciones Integrales",
      "phone": "+51 973 825 496",
      "phoneClean": "51973825496",
      "website": "https://www.inforday.com.pe/",
      "address": "Jr. Huallaga 160, Lima"
    }
  ]
}
```

---

### 4.3. Envío Individual Inmediato (Transaccional)
Para responder a una interacción iniciada por un usuario o enviar una alerta directa.

- **Método:** `POST /api/send`
- **Payload:**
```json
{
  "to": "51987654321",
  "message": "Buenas tardes, Ing. Willy. Le comparto el dictamen pericial prometido..."
}
```
- **Respuesta:**
```json
{
  "success": true,
  "to": "51987654321",
  "jid": "51987654321@s.whatsapp.net",
  "timestamp": "2026-09-05T20:25:00.000Z"
}
```

---

### 4.4. Disparar Campaña Escalonada Anti-Ban (Drip Campaign)
El motor toma la lista de prospectos y envía **1 mensaje cada N segundos** (default: 210 segundos / 3.5 min) emulando ritmo humano. La petición retorna inmediatamente en 200ms y el proceso continúa en segundo plano.

- **Método:** `POST /api/campaign`
- **Payload:**
```json
{
  "name": "Outreach Salud Piura - Lote 1",
  "delaySeconds": 210,
  "template": "Buenas tardes, un gusto saludarlos.\n\nLe escribe Kenneth de Licitaciones QP al equipo de {{name}}.\n\nRevisamos las bases del concurso de EsSalud Piura (CP-03) de S/. 2.85M en mantenimiento biomédico y detectamos 2 penalidades operativas severas del 5% de la UIT.\n\nPreparamos un dictamen en PDF de 3 páginas para su área técnica; ¿me permite compartírselo por aquí?",
  "leads": [
    {
      "name": "ROMAN MEDICAL SAC",
      "phone": "51925213683"
    },
    {
      "name": "Kendal Import",
      "phone": "51969781627"
    }
  ]
}
```
- **Respuesta:**
```json
{
  "campaignId": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "name": "Outreach Salud Piura - Lote 1",
  "totalLeads": 2,
  "status": "RUNNING",
  "estimatedDurationMinutes": 7,
  "createdAt": "2026-09-05T20:25:00.000Z"
}
```

---

### 4.5. Consultar Estado de Campaña
- **Método:** `GET /api/campaign/:id`
- **Respuesta:**
```json
{
  "id": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "name": "Outreach Salud Piura - Lote 1",
  "status": "COMPLETED",
  "totalLeads": 2,
  "sentCount": 2,
  "failedCount": 0,
  "logs": [
    "[19:22:58] Enviado con éxito a ROMAN MEDICAL SAC (51925213683)",
    "[19:26:28] Enviado con éxito a Kendal Import (51969781627)",
    "Campaña finalizada exitosamente: 2 enviados, 0 fallidos."
  ]
}
```

---

## 5. Reglas de Oro Innegociables para Agentes de IA (Anti-Baneo)

1. **La Técnica del Permiso en 2 Pasos:**
   - Queda estrictamente prohibido que un agente envíe enlaces web (`http://...` o `https://...`) en el **primer mensaje en frío**.
   - El primer mensaje debe ser corto (máximo 4 párrafos breves), respetuoso, consultivo y terminar con una pregunta pidiendo autorización para compartir el valor: *"¿Me permite compartírselo por aquí para que lo revisen?"*.
   - El enlace de valor (PDF, video Loom o landing) **solo se envía tras la respuesta afirmativa** del destinatario.

2. **Cadencia Humana Obligatoria:**
   - El parámetro `delaySeconds` nunca debe ser inferior a **180 segundos (3 minutos)** para números fríos.
   - Envíos ráfaga (en milisegundos) están prohibidos para evitar detección algorítmica de Meta.

3. **Verificación de Existencia de Cuenta:**
   - El motor ejecuta automáticamente `sock.onWhatsApp()` antes de transmitir. Si el número no existe o es fijo, la solicitud es rechazada limpiamente sin quebrar el socket.

---

## 6. Ejemplos de Implementación en Código

### Ejemplo para Smith en `licitaciones-qp`:
```typescript
async function enviarAlertaProspecto(empresa: string, telefono: string) {
  const GATEWAY_URL = process.env.OUTREACH_GATEWAY_URL || 'http://localhost:3100';
  const API_KEY = process.env.OUTREACH_API_KEY!;

  await fetch(`${GATEWAY_URL}/api/send`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: telefono,
      message: `Buenas tardes. Le escribe Kenneth de Licitaciones QP al equipo de ${empresa}...`
    })
  });
}
```

### Ejemplo para Smith en `lar-engine` (High-Ticket B2B Conversion):
```typescript
async function notificarLeadCalificado(coachPhone: string, leadData: any) {
  const GATEWAY_URL = process.env.OUTREACH_GATEWAY_URL || 'http://localhost:3100';
  const API_KEY = process.env.OUTREACH_API_KEY!;

  await fetch(`${GATEWAY_URL}/api/send`, {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      to: coachPhone,
      message: `🚨 *NUEVO LEAD CALIFICADO LAR*\n\nNombre: ${leadData.name}\nFacturación: S/. ${leadData.revenue}\nPresupuesto: S/. 3,000+`
    })
  });
}
```
