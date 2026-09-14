# SOP: Onboarding e Instalación de Infraestructura Privada para Clientes (Zero Leakage VPS)

**Documento Operativo Oficial · The Quant Partners**  
**Versión:** 1.0 (Producción 2026)  
**Objetivo:** Desplegar una infraestructura privada de conversión en WhatsApp para un cliente nuevo en menos de 5 minutos, con base de datos local dedicada, AI Setter en 5 segundos, round-robin a vendedores, integración a Meta CAPI y Portal de Solo Lectura.

---

## 1. Precios y Condiciones Comerciales Recomendadas

| Concepto | Perú (PEN / USD) | USA Latina (USD) | Modalidad |
| :--- | :--- | :--- | :--- |
| **Fee de Instalación e Implementación** | S/. 1,800 – S/. 2,800 PEN (~$480 – $750 USD) | $1,200 – $2,000 USD | One-time Setup |
| **Fee de Soporte & Gestión Continua** | S/. 1,200 – S/. 1,800 PEN/mes (~$320 – $480 USD/mes) | $800 – $1,200 USD/mes | Retainer Mensual / Anual |
| **Fee de Transferencia Tecnológica & Handover** | $2,000 – $3,000 USD | $3,500 – $5,000 USD | One-time Enterprise |
| **Póliza de Soporte L3 (Para Handover)** | $200 USD/mes ($1,800 USD/año) | $300 USD/mes ($2,500 USD/año) | Anual recurrente |

---

## 2. Checklist de Requisitos que se solicitan al Cliente

Envía este mensaje al cliente o a su gerente tras cerrar la venta:

> *"¡Hola [Nombre]! Para dejar activa tu infraestructura de IA en WhatsApp en tu propio servidor hoy mismo, solo requerimos 4 datos:"*
> 1. **Acceso al VPS:** IP pública, usuario (`root`) y contraseña de su servidor (\$4-\$6/mes en Hetzner o DigitalOcean con Ubuntu 22.04 / 24.04). *(O si prefieren, nosotros se lo creamos a su nombre).*
> 2. **WhatsApp del Gerente:** Celular que recibirá los reportes y alertas de ventas.
> 3. **Equipo Comercial:** Nombres y celulares de los vendedores que atenderán los prospectos calificados.
> 4. **Meta Ads (Opcional):** ID de Dataset/Pixel de Meta Ads y Token de Conversiones API (CAPI).

---

## 3. Procedimiento de Aprovisionamiento (60 Segundos)

### Método A: Directamente por WhatsApp con Hermes C2
Escribe desde tu número (`51902105668`) al bot de WhatsApp:
```text
/provision "Clínica Sonrisas" clinicas_salud 51999888777 "Dr. Carlos:51911122233,Dra. Maria:51944455566"
```
Hermes te responderá en 2 segundos con el comando de instalación listo.

### Método B: Por Consola Master Hub (CLI)
```bash
npx qp-outreach provision \
  --name="Clínica Sonrisas" \
  --niche="clinicas_salud" \
  --admin="51999888777" \
  --reps="Dr. Carlos:51911122233,Dra. Maria:51944455566" \
  --deploy="vps"
```

### Nichos preconfigurados disponibles (`niche`):
- `clinicas_salud`: Clínicas dentales, estéticas, centros médicos.
- `inmobiliarias`: Agencias, constructoras y corredores.
- `estudios_abogados`: Inmigración, corporativo, litigios.
- `construccion_b2b`: Proveedores y contratistas.
- `custom`: Para configuración a medida.

---

## 4. Despliegue en el Servidor del Cliente (120 Segundos)

1. Conéctate al VPS virgen del cliente por SSH:
   ```bash
   ssh root@IP_DEL_VPS
   ```
2. Ejecuta el comando de 1 línea generado:
   ```bash
   curl -sSL https://gateway-production-2264.up.railway.app/api/install/<clientId>/<clientPin> | bash
   ```
3. El script ejecuta automáticamente:
   - Instalación de Docker y Docker Compose.
   - Creación de entorno `/opt/qp-outreach-<clientId>`.
   - Generación de base de datos PostgreSQL local dedicada.
   - Configuración de variables `.env.production` con **Zero Leakage** (cero claves de Kenneth).
   - Levantamiento del stack completo de Docker.

---

## 5. Vinculación de WhatsApp y Entrega del Portal

1. **Escanear WhatsApp (30 segundos):**
   - Entra a `http://IP_DEL_VPS:3100/dashboard` con el PIN maestro generado.
   - Pídele al cliente que escanee el código QR desde su WhatsApp Business.
   - En 5 segundos el estado cambia a `🟢 WhatsApp Conectado`.

2. **Entrega del Portal Live View (Solo Lectura):**
   - Comparte al cliente el enlace:
     `http://IP_DEL_VPS:3100/portal`
   - El cliente podrá ver en vivo sus métricas de leads, calificados, citas agendadas y ventas sin riesgo de alterar nada técnico.

3. **Prueba de Fuego (Lead Test):**
   - Envía un mensaje de prueba al número del cliente simulando un lead de Meta Ads.
   - Comprueba que la IA responde en <5 segundos, hace el triaje, transfiere al vendedor por Round-Robin y se silencia.
   - Registra una venta de prueba enviando `/won <teléfono> <monto>` y verifica la transmisión a Meta CAPI.
