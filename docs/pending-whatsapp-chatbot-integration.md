# Integración Chatbot WhatsApp — Requerimientos e Implicaciones

> Documento de planificación técnica y de producto.
> Contexto: integrar un canal de pedidos vía WhatsApp que consuma el mismo contrato de API que usa `ui-storefront`.

---

## 1. Casos de uso

### 1.1 Cliente final (ordering bot)
El cliente escribe al número de WhatsApp del restaurante y puede:
- Ver los menús disponibles
- Explorar productos por categoría
- Agregar ítems a un carrito conversacional
- Confirmar el pedido con método de pago
- Recibir número de orden y resumen

Este caso replica exactamente lo que hace `ui-storefront` (kiosk web), pero a través de mensajes de texto. El backend no cambia — el bot consume los mismos endpoints de `/v1/kiosk/:slug/*`.

### 1.2 Manager / notificaciones (futuro)
- El manager recibe un mensaje de WhatsApp cuando llega un pedido nuevo
- Puede cambiar el estado de un pedido respondiendo con comandos simples
- Recibe un resumen de ventas al cerrar caja

Este caso requiere autenticación (el manager tiene un número registrado) y acceso a los endpoints de `/v1/` protegidos. Se puede considerar en una segunda fase.

---

## 2. Cómo funciona WhatsApp Business API

### Arquitectura general

```
Cliente WhatsApp → Meta servidores → Webhook (nuestro servidor) → api-core
api-core → Webhook → Meta servidores → Cliente WhatsApp
```

Meta actúa como intermediario. Nuestro servidor recibe los mensajes entrantes vía HTTP POST (webhook) y envía mensajes salientes haciendo llamadas a la API de Meta o al proveedor BSP.

### La regla de las 24 horas (crítica para el flujo de pedidos)

WhatsApp distingue dos tipos de mensajes:

| Tipo | Cuándo se puede usar | Costo |
|------|----------------------|-------|
| **Mensajes de sesión** (free-form) | Dentro de las 24h desde el último mensaje del cliente | Gratis o muy bajo |
| **Mensajes de plantilla** (templates) | En cualquier momento, pero deben estar pre-aprobados por Meta | Pago por conversación |

**Implicación directa para el bot de pedidos:** si el cliente inicia la conversación, el bot tiene 24 horas para completar el flujo libremente. Si el cliente abandona y vuelve pasadas las 24h, el bot necesita una plantilla aprobada para re-iniciar. Para el caso de restaurantes esto no suele ser un problema — los pedidos se completan en minutos.

### Templates (plantillas aprobadas)

Los templates son mensajes pre-aprobados por Meta que el negocio puede enviar en cualquier momento. Se usan para:
- Confirmación de pedido: *"Tu pedido #42 fue recibido. Total: $500."*
- Cambio de precio: *"El precio de {{producto}} cambió a ${{nuevo_precio}}. ¿Deseas actualizar tu pedido?"*
- Estado del pedido: *"Tu pedido #42 está siendo preparado."*
- Reapertura de conversación pasadas 24h

**Proceso de aprobación:**
1. Se crea el template en Meta Business Manager
2. Meta revisa (generalmente entre 1 hora y 2 días hábiles)
3. Una vez aprobado, está disponible para enviar

**Limitaciones de templates:**
- Solo texto (con variables) y botones de respuesta rápida
- No se puede mandar HTML ni formato rico
- Si el template es rechazado, hay que reformularlo y re-submitear

---

## 3. Proveedores (BSP — Business Solution Providers)

### Opción A — Meta Cloud API (directo)

Meta ofrece acceso directo a la WhatsApp Business Platform sin necesidad de un BSP.

**Ventajas:**
- Sin markup de terceros — se paga directamente a Meta
- Acceso completo a todas las funcionalidades
- Sin lock-in a un proveedor externo

**Desventajas:**
- Setup más técnico (verificación de negocio, configuración manual de webhook, gestión de tokens)
- Soporte técnico limitado — solo documentación y comunidad
- Requiere cuenta Meta Business verificada

**Costo:**
- La API en sí es gratuita (no hay costo de plataforma)
- Se paga por conversaciones (ver sección de costos)
- Número de teléfono: se puede usar un número propio o comprar uno virtual (~$1-3/mes en servicios como Twilio para el número, sin usar su API)

---

### Opción B — Twilio WhatsApp API ✅ (seleccionada)

Twilio actúa como intermediario certificado (BSP) entre nuestra aplicación y Meta. Simplifica el setup considerablemente.

**Ventajas:**
- SDK oficial para Node.js bien documentado
- Sandbox gratis para desarrollo (número compartido, sin aprobación de Meta)
- Gestión de webhooks simplificada con validación de firma
- Dashboard visual para monitorear mensajes
- Soporte técnico dedicado

**Desventajas:**
- Markup sobre las tarifas de Meta (~$0.005 por mensaje adicional de Twilio)
- Dependencia de un proveedor adicional
- Transición a producción requiere igual la aprobación de Meta (Twilio la gestiona, pero agrega tiempo)

**Costo Twilio (además de las tarifas de Meta):**
- Mensajes entrantes: ~$0.005 por mensaje
- Mensajes salientes: ~$0.005 por mensaje
- Sin costo fijo mensual de plataforma (pay-as-you-go)
- Número de WhatsApp en producción: ~$15/mes (número de Twilio habilitado para WhatsApp)

---

### Opción C — 360dialog

BSP europeo con precios competitivos y acceso directo a la Cloud API de Meta.

**Costo:** €49/mes por número de teléfono (incluye soporte y acceso a API). Puede ser costoso para un solo restaurante pero tiene sentido si se ofrece como SaaS multi-tenant (un número por cliente).

---

### Opción D — Baileys (no recomendada para producción)

Biblioteca Node.js que simula WhatsApp Web. Gratis, sin necesidad de aprobación.

**Por qué NO usar en producción:**
- No es oficial — Meta puede banear el número en cualquier momento sin previo aviso
- No escala (un proceso por número de teléfono)
- No soporta templates oficiales
- Viola los términos de servicio de WhatsApp

---

## 4. Costos de Meta (independiente del BSP)

Meta cobra por conversación (ventana de 24 horas), no por mensaje individual.

### Tipos de conversación

| Tipo | Quién inicia | Ejemplo | Costo aprox. LATAM |
|------|-------------|---------|---------------------|
| **Service** | Cliente | Cliente escribe "hola quiero pedir" | $0.00 – $0.006 |
| **Utility** | Negocio | Confirmación de pedido, cambio de estado | $0.008 – $0.012 |
| **Authentication** | Negocio | OTP, verificación | $0.008 – $0.012 |
| **Marketing** | Negocio | Promos, menú del día | $0.020 – $0.030 |

> Los precios varían por país. Argentina está en el rango LATAM medio.

### Tier gratuito

Meta otorga **1,000 conversaciones gratuitas por mes** (tipo service/user-initiated) para toda cuenta de WhatsApp Business.

### Ejemplo de costo real para un restaurante mediano

Supuesto: 500 pedidos/mes, cada pedido = 1 conversación service (iniciada por el cliente) + 1 mensaje de confirmación utility.

| Concepto | Cantidad | Costo unitario | Total/mes |
|----------|----------|----------------|-----------|
| Conversaciones service (primeras 1,000 gratis) | 500 | $0.00 | $0.00 |
| Confirmaciones utility (templates) | 500 | $0.010 | $5.00 |
| Twilio markup por mensaje (est. 5 msg/pedido) | 2,500 msg | $0.005 | $12.50 |
| Número Twilio WhatsApp | 1 | $15.00/mes | $15.00 |
| **Total estimado** | | | **~$32.50/mes** |

> Para un restaurante con más de 1,000 pedidos/mes las conversaciones service empiezan a costar ~$0.004-0.006 c/u.

---

## 5. Requerimientos técnicos

### 5.1 Para empezar (desarrollo / sandbox)

- [ ] Cuenta Twilio (gratuita para comenzar)
- [ ] Unirse al sandbox de Twilio WhatsApp (número compartido `+1 415 523 8886`)
- [ ] URL pública para el webhook — en desarrollo se puede usar `ngrok` o `localtunnel`
- [ ] Node.js + TypeScript (ya disponible en el proyecto)

### 5.2 Para producción

- [ ] Cuenta **Meta Business Manager** verificada (requiere documentación del negocio: nombre, dirección, sitio web)
- [ ] **Número de teléfono dedicado** para WhatsApp — no puede ser un número personal que ya tenga WhatsApp instalado. Opciones:
  - Número nuevo de SIM física (~$5 en Argentina)
  - Número virtual de Twilio (~$15/mes para número WhatsApp-habilitado)
  - Número virtual local en el país del restaurante
- [ ] Aprobación de **al menos 2-3 templates** antes de lanzar:
  - Confirmación de pedido
  - Notificación de cambio de precio
  - Mensaje de bienvenida (reapertura de 24h)
- [ ] Dominio con HTTPS para el webhook (ya disponible si se despliega el `api-core`)
- [ ] **Verificación de negocio Meta**: puede tardar entre 2 días y 2 semanas dependiendo de la documentación. Es el paso más lento de todo el proceso.

### 5.3 Componentes a desarrollar (app `ui-whatsapp-chatbot`)

```
ui-whatsapp-chatbot/
├── src/
│   ├── index.ts              — servidor HTTP (Fastify/Express) que recibe webhooks de Twilio
│   ├── twilio.ts             — wrapper SDK Twilio: enviar mensajes, validar firma del webhook
│   ├── api-client.ts         — consume los endpoints de api-core (mismo contrato que ui-storefront)
│   ├── conversation.ts       — máquina de estados por número de teléfono
│   └── templates.ts          — definición de los templates aprobados y sus variables
```

### 5.4 Máquina de estados de la conversación

```
IDLE
  → (cliente escribe) → BROWSING_MENUS

BROWSING_MENUS
  → (elige menú) → BROWSING_ITEMS
  → "carrito" → CART_REVIEW

BROWSING_ITEMS
  → (elige producto) → ADDING_TO_CART
  → "volver" → BROWSING_MENUS

ADDING_TO_CART
  → (confirma) → BROWSING_ITEMS (seguir agregando)
  → "pagar" → CHECKOUT

CART_REVIEW
  → "confirmar" → CHECKOUT
  → "vaciar" → BROWSING_MENUS

CHECKOUT
  → (elige método de pago) → CONFIRMING

CONFIRMING
  → POST /orders con expectedTotal
  → 201 OK → ORDER_CONFIRMED
  → 400 precio cambió → PRICE_CHANGED → CHECKOUT (re-confirmar)

ORDER_CONFIRMED
  → (timer) → IDLE
```

**Storage de estado:** en memoria (Map<phoneNumber, ConversationState>) para MVP. En producción debería ser Redis para sobrevivir reinicios del proceso.

---

## 6. Implicaciones para la arquitectura actual

### Lo que NO cambia
- `api-core` — cero cambios. El bot consume los mismos endpoints públicos del kiosk
- `ui-dashboard` — cero cambios
- `ui-storefront` — cero cambios

### Lo que se agrega
- Nuevo app `apps/ui-whatsapp-chatbot` — proceso Node.js independiente
- Variables de entorno nuevas en el deploy:
  - `TWILIO_ACCOUNT_SID`
  - `TWILIO_AUTH_TOKEN`
  - `TWILIO_WHATSAPP_FROM` (ej: `whatsapp:+14155238886`)
  - `API_CORE_URL`

### Consideraciones de deploy
El chatbot necesita estar disponible 24/7 con una URL HTTPS pública (el webhook de Twilio). Puede correr en el mismo VPS que `api-core` en un puerto distinto, detrás del mismo reverse proxy (nginx/caddy).

---

## 7. Limitaciones conocidas

| Limitación | Descripción | Mitigación |
|------------|-------------|------------|
| **Sin imágenes en el flujo principal** | WhatsApp permite enviar imágenes pero complica el flujo conversacional (no hay "galería") | Enviar imagen + texto del producto cuando el usuario pregunta por uno específico |
| **Solo texto en templates** | Los templates aprobados no soportan HTML ni markdown rico | Diseñar mensajes claros con emojis para compensar |
| **Tasa de envío** | Cuentas nuevas: 250 conversaciones/día. Sube con el tiempo y verificación | No es un problema para el MVP de 1-2 restaurantes |
| **Sin carrito visual** | El cliente no ve un carrito gráfico — solo texto | Resumir el carrito periódicamente con formato claro |
| **Timeout de sesión** | Si el cliente no responde en 24h, se necesita template para retomar | Limpiar estado de conversación en inactividad prolongada |
| **Un número por restaurante** | Cada restaurante necesita su propio número de WhatsApp | Multiplexar por slug en el webhook si se quiere un número único (más complejo) |

---

## 8. Proceso de onboarding para un restaurante (estimado)

```
Semana 1
├── Configurar cuenta Meta Business Manager del restaurante
├── Registrar número de teléfono dedicado
└── Iniciar proceso de verificación de negocio en Meta

Semana 2
├── (mientras se verifica) Desarrollar y testear el bot en sandbox Twilio
├── Crear y enviar templates para aprobación
└── Configurar webhook en producción

Semana 3
├── Verificación Meta completada (optimista) o pendiente (pesimista)
├── Activar número en producción con Twilio
└── QA del flujo completo con número real
```

> El paso más imprevisible es la verificación de Meta. Con documentación completa puede ser 2-3 días; sin ella puede extenderse semanas.

---

## 9. Resumen de decisiones a tomar

| Decisión | Opciones | Recomendación |
|----------|----------|---------------|
| Provider BSP | Meta directo / Twilio / 360dialog | **Twilio** para el MVP por velocidad de desarrollo |
| ¿Un número por restaurante o uno centralizado? | Un número por restaurante (más simple) / número compartido con slug-routing (más complejo) | **Un número por restaurante** para el MVP |
| ¿Incluye el chatbot para managers? | Solo clientes (fase 1) / Clientes + managers (fase 2) | **Solo clientes en fase 1** |
| ¿Templates se gestionan por restaurante o globales? | Globales (todos los restaurantes usan los mismos templates) | **Globales** — los templates son por cuenta Twilio, no por restaurante |
| Storage de estado de conversación | En memoria / Redis | **En memoria** para MVP, **Redis** cuando haya más de 1 proceso |
