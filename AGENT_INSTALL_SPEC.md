# 🤖 AGENT INSTALL SPEC: PROTOCOLO DE DESPLIEGUE AUTÓNOMO
**Sistema:** QP Commercial Engine (AI WhatsApp Setter, Ghost CRM & Lead Generator)  
**Destinatario:** Cualquier Agente de IA (Claude Code, Cursor, Antigravity, Copilot, ChatGPT Desktop)  
**Misión:** Configurar, personalizar y desplegar el sistema en la máquina del usuario de forma 100% autónoma y guiada.

---

## 🧭 1. IDENTIDAD Y DIRECTIVAS PARA EL AGENTE INSTALADOR

> [!IMPORTANT]
> **TÚ ERES EL INGENIERO DEVOPS DE ESTE PROYECTO.**  
> Tu objetivo es que el usuario humano **no tenga que tocar código ni configurar archivos manualmente**.  
> Sigue rigurosamente las 5 fases de este protocolo. Si encuentras un error o falta una herramienta, resuélvelo tú mismo o guía al usuario con instrucciones de 1 sola línea.

---

## 🔍 FASE 1: AUTODIAGNÓSTICO DEL ENTORNO

Antes de iniciar, verifica el entorno ejecutando los siguientes chequeos silenciosos:

1. **Verificar Docker:**
   ```bash
   docker --version && docker compose version
   ```
   * *Si Docker está instalado y activo:* Procede por la vía estándar de contenedores (Recomendada).
   * *Si Docker no está instalado:*  
     * **En Windows:** Ejecuta `winget install Docker.DockerDesktop` o dile al usuario: *"Por favor descarga e inicia Docker Desktop desde https://docker.com"*.
     * **En Mac:** `brew install --cask docker`
     * **En Linux:** `sudo apt-get install docker.io docker-compose-plugin -y`
   * *Vía Alternativa (Node.js sin Docker):* Si el usuario prefiere no usar Docker, verifica `node -v` (requiere Node >= 18) y usa la base de datos fallback local en `./storage`.

2. **Verificar Disponibilidad del Puerto 3100:**
   * Si el puerto `3100` está ocupado, cambia automáticamente el puerto en el archivo `.env` a `3101` o `3102`.

---

## 🗣️ FASE 2: DIÁLOGO INTERACTIVO CON EL USUARIO (EL SELECTOR B2B vs B2C)

Hazle al usuario exactamente estas **4 preguntas breves** en un solo mensaje amigable:

```text
¡Hola! Soy tu agente de instalación de QP Commercial Engine 🚀. 
Voy a dejar tu sistema listo en 3 minutos. Solo respóndeme estas breves preguntas:

1. ¿Cuál es el nombre de tu empresa o negocio?
2. ¿A quién le vendes principalmente?
   [A] A personas comunes (B2C): Clínicas, tiendas de ropa, inmobiliarias, restaurantes, cursos, servicios estéticos.
   [B] A otras empresas o profesionales (B2B): Mayoristas, distribuidores, proveedores de insumos, estudios contables/abogados, consultoría.
3. ¿Cuál es tu número de WhatsApp para recibir alertas de ventas? (con código de país, ej. 51987654321).
4. ¿Tienes una API Key de OpenRouter o OpenAI para la inteligencia artificial? 
   (Si no tienes, solo dime "no tengo" y te digo cómo sacarla gratis en 30 segundos).
```

---

## ⚙️ FASE 3: GENERACIÓN AUTÓNOMA DEL ARCHIVO `.env`

Con las respuestas del usuario, **crea el archivo `.env` en la raíz del proyecto** respetando las siguientes reglas de negocio:

### Si el usuario eligió B2C (Personas comunes):
* Activa el modo **AI Setter Inbound 24/7** y optimización para Meta Ads.
* Asigna un blueprint predeterminado:
  * Si es salud/estética/dental: `INITIAL_NICHE=clinicas_salud`
  * Si es inmobiliaria: `INITIAL_NICHE=inmobiliarias`
  * Si es tienda/comercio general: `INITIAL_NICHE=clinicas_salud` (sirve de base setter con catálogo)

### Si el usuario eligió B2B (Empresas):
* Activa el modo **Prospección Activa + AI Setter**.
* Asigna:
  * Si es consultoría/servicios/abogados: `INITIAL_NICHE=estudios_abogados`
  * Si es construcción/proveedor/mayorista: `INITIAL_NICHE=construccion_b2b`

### Estructura exacta a escribir en `.env`:
```env
# Configuración Generada Automáticamente por el Agente Instalador
PORT=3100
API_SECRET_KEY=qp_live_key_{RANDOM_HEX_16}
STORAGE_DIR=./storage
DEFAULT_DRIP_DELAY_SECONDS=210

# Identidad y Modo Satélite
COMPANY_NAME="{RESPUESTA_NOMBRE_EMPRESA}"
ADMIN_WHATSAPP_PHONE={RESPUESTA_TELEFONO_LIMPIO}
MODE=client
INITIAL_NICHE={NICHE_SELECCIONADO}
STANDALONE_MODE=true

# Motor de Inteligencia Artificial
OPENROUTER_API_KEY={RESPUESTA_OPENROUTER_KEY}
OPENROUTER_MODEL=google/gemini-2.5-flash

# Base de datos (Usada por Docker Compose)
POSTGRES_DB=qp_outreach
POSTGRES_USER=qp_user
POSTGRES_PASSWORD=qp_secure_pass_2026
DATABASE_URL=postgres://qp_user:qp_secure_pass_2026@postgres:5432/qp_outreach
```

*(Si el usuario no proporcionó API Key de OpenRouter, guíalo a https://openrouter.ai/keys donde puede recargar \$5 USD que rinden más de 50,000 mensajes).*

---

## 🚀 FASE 4: DESPLIEGUE Y COMPILACIÓN

Una vez generado el archivo `.env`, ejecuta de forma autónoma el despliegue:

### Vía Principal (Docker Compose):
```bash
docker compose up -d --build
```

### Vía Alternativa (En caso de que el usuario no use Docker):
```bash
npm install
npm run build
npm run start
```

### Verificación de Salud (Health Check):
Espera 10 segundos y comprueba que el servidor esté respondiendo:
```bash
curl -s http://localhost:3100/api/status || node -e "fetch('http://localhost:3100/api/status').then(r=>r.json()).then(console.log)"
```

---

## 🎉 FASE 5: ENTREGA FINAL AL USUARIO

Cuando el sistema esté arriba, responde al usuario con este mensaje de felicitación y entrega:

```text
✨ ¡Tu sistema comercial está completamente instalado y operando! 🚀

📍 PANEL DE CONTROL: Abre tu navegador en:
👉 http://localhost:3100/dashboard

📱 CONECTAR TU WHATSAPP (Último paso de 30 segundos):
1. En el panel que se acaba de abrir, haz clic en el botón verde de "WhatsApp" (o ve a Configuración).
2. Te aparecerá un Código QR en pantalla.
3. Abre WhatsApp en tu celular > Dispositivos Vinculados > Vincular un Dispositivo.
4. Escanea el código QR de tu pantalla.

¡Listo! A partir de este momento, tu Agente de IA está atendiendo 24/7 en tu WhatsApp y tu panel está listo para prospectar o recibir prospectos.
```

---

## 🛠️ MATRIZ DE AUTOCORRECCIÓN DE ERRORES (SELF-HEALING)

Si durante la instalación ocurre alguno de estos errores, el Agente debe corregirlo automáticamente:

| Error Detectado | Causa Común | Solución Automática del Agente |
| :--- | :--- | :--- |
| `bind: address already in use 3100` | Puerto 3100 ocupado por otra app | Modificar `PORT=3101` en `.env` y en `docker-compose.yml` en la línea de mapeo `ports: - "3101:3100"`. |
| `Cannot connect to the Docker daemon` | Docker Desktop está cerrado | Dile al usuario: *"Por favor abre la aplicación Docker Desktop en tu computadora y espera 15 segundos a que la ballenita se ponga verde"*. |
| `Prisma/Postgres connection error` | El contenedor de base de datos demoró en iniciar | Ejecutar `docker compose restart engine` tras verificar que el contenedor postgres esté en estado `healthy`. |
| `EADDRINUSE` o falta de permisos en storage | Permisos de carpeta en Linux/Mac | Ejecutar `mkdir -p storage && chmod -R 777 storage`. |
