# El Jardín de Luna — backend

API mínima para la tienda pública El Jardín de Luna. Permite consultar el
catálogo, comprar como invitado con Mercado Pago Checkout Pro, consultar el
estado de un pedido mediante una referencia protegida y administrar productos y
pedidos con una única cuenta administrativa.

No hay cuentas de compradores, perfiles, favoritos, carritos persistidos,
Firebase, recuperación de contraseñas, transferencias manuales ni servicios de
envío externos.

## Tecnologías y requisitos

- Node.js 24 y npm 11.
- Express 5.
- MongoDB Atlas o un replica set compatible con transacciones.
- Mongoose 9.
- Mercado Pago SDK 3.
- JWT y bcrypt para el administrador.
- Cloudinary y Multer sólo para la carga administrativa de imágenes existente.

## Instalación y ejecución

```bash
npm ci
Copy-Item .env.example .env
```

En Linux o macOS, reemplazar `Copy-Item` por `cp`.

Completar las variables obligatorias, generar `ADMIN_PASSWORD_HASH` con
`npm run admin:hash-password` y recién entonces ejecutar:

```bash
npm run dev
```

El inicio valida el entorno, conecta MongoDB y recién después escucha en
`PORT`. El comando de producción es:

```bash
npm start
```

Scripts disponibles:

| Comando | Uso |
| --- | --- |
| `npm start` | Inicia el servidor. |
| `npm run dev` | Carga `.env` y reinicia al cambiar archivos. |
| `npm run check` | Comprueba la sintaxis de todos los archivos JavaScript. |
| `npm test` | Ejecuta las pruebas nativas de Node. |
| `npm run admin:hash-password` | Solicita una contraseña sin mostrarla y genera su hash bcrypt. |
| `npm run migrate:canonical:dry` | Preflight de migración; no escribe. |
| `npm run migrate:canonical:apply` | Aplica la migración después de un preflight completo. |

## Variables de entorno

`.env` está ignorado por Git. `.env.example` contiene todas y sólo las
variables utilizadas:

| Variable | Descripción |
| --- | --- |
| `PORT` | Puerto HTTP. Predeterminado: `3001`. |
| `NODE_ENV` | `development`, `test` o `production`. |
| `MONGODB_URI` | URI de MongoDB. Obligatoria. |
| `FRONTEND_URL` | URL HTTPS pública usada para los retornos de Mercado Pago. |
| `CORS_ORIGINS` | Orígenes adicionales separados por comas. |
| `BACKEND_PUBLIC_URL` | URL HTTPS pública usada por el webhook de Mercado Pago. |
| `MERCADO_PAGO_MODE` | `sandbox` o `production`. |
| `MERCADO_PAGO_ACCESS_TOKEN` | Access token; puede omitirse en desarrollo si no se prueba checkout. |
| `MERCADO_PAGO_WEBHOOK_SECRET` | Clave secreta del webhook; se configura junto con el access token. |
| `JWT_SECRET` | Secreto de al menos 32 caracteres. |
| `ADMIN_EMAIL` | Correo exacto del único administrador. |
| `ADMIN_PASSWORD_HASH` | Hash bcrypt, nunca la contraseña. |
| `ADMIN_TOKEN_EXPIRES_IN` | Entre 5 minutos y 1 hora; ejemplo: `30m`. |
| `SHIPPING_COST` | Costo de envío a domicilio en ARS, con hasta dos decimales. |
| `CLOUDINARY_CLOUD_NAME` | Opcional; las tres variables Cloudinary se configuran juntas. |
| `CLOUDINARY_API_KEY` | Opcional. |
| `CLOUDINARY_API_SECRET` | Opcional y secreta. |

Al configurar Mercado Pago, `FRONTEND_URL` y `BACKEND_PUBLIC_URL` deben ser
HTTPS públicas incluso si Node se ejecuta localmente. `localhost` se agrega sólo
a `CORS_ORIGINS`. Para probar una aplicación que aún no está publicada se
necesita un túnel HTTPS o un entorno de staging; Mercado Pago rechaza dominios
locales en `back_urls` y no puede enviar webhooks hacia ellos.

Generar el hash administrativo:

```bash
npm run admin:hash-password
```

Copiar únicamente el resultado `$2...` a `ADMIN_PASSWORD_HASH`.

## Arquitectura

```text
index.js
src/
  app.js
  constants/
  controllers/
  helpers/
  middlewares/
  models/
  routes/
  server/
  services/
scripts/
test/
```

- Las rutas definen el contrato HTTP.
- Los controladores coordinan entrada y respuesta.
- Los servicios contienen catálogo, checkout, pagos, pedidos e inventario.
- Los modelos validan documentos de MongoDB.
- Los middlewares centralizan JWT, validación, límites, CORS y errores.

Todas las respuestas exitosas usan `{ "data": ... }`. Los errores usan:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Revisá los datos ingresados.",
    "fields": {}
  }
}
```

Los errores internos y stack traces nunca se devuelven al cliente.

## Modelos

### Producto

El contrato canónico contiene:

`name`, `slug`, `botanicalName`, `category`, `description`, `presentation`,
`ingredients`, `warnings`, `price`, `stock`, `images`, `active`, `createdAt` y
`updatedAt`.

Nombre, categoría, descripción, precio y stock son obligatorios. El slug es
único. Precio y stock no pueden ser negativos; stock es entero. Se aceptan hasta
ocho URLs HTTP/HTTPS de imagen.

Los campos históricos en español se leen temporalmente para no romper
documentos reales, pero las escrituras nuevas usan sólo el contrato canónico.
La API pública sólo devuelve productos explícitamente
activos y omite documentos históricos incompletos.

### Pedido

Guarda:

- `numero`, `externalReference`, clave de idempotencia y fingerprint.
- `cliente`: nombre, apellido, teléfono y correo.
- `entrega`: método, provincia, localidad, código postal, dirección y notas.
- `productos`: ObjectId, nombre y precio congelados, cantidad y subtotal.
- subtotal, envío, descuento histórico y total.
- estado de pago y estado operativo.
- proveedor, preferencia, pago y datos de auditoría de Mercado Pago.
- `stockState` y fechas de procesamiento para impedir movimientos duplicados.
- indicadores `requiresReview` y `reviewReason` para anomalías financieras.

Cambiar luego un producto no altera el nombre ni el precio histórico del pedido.
Los campos antiguos sólo se conservan para leer y migrar datos reales.

## API pública

| Método | Ruta | Descripción |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness básica, sin datos sensibles. |
| `GET` | `/api/checkout/configuracion` | Costo de entrega calculado por el backend. |
| `GET` | `/api/productos` | Productos activos. |
| `GET` | `/api/productos/:identifier` | Detalle por slug o ObjectId. |
| `POST` | `/api/checkout/mercadopago` | Crea el pedido invitado y la preferencia. |
| `GET` | `/api/pedidos/:numero/estado` | Estado público con `X-Order-Token`. |
| `POST` | `/api/pagos/mercadopago/webhook` | Webhook firmado de Mercado Pago. |

El checkout requiere `Idempotency-Key` de 16 a 200 caracteres. El cuerpo
aceptado es:

```json
{
  "cliente": {
    "nombre": "Ana",
    "apellido": "Pérez",
    "telefono": "3815551234",
    "email": "ana@example.com"
  },
  "entrega": {
    "metodo": "domicilio",
    "provincia": "Tucumán",
    "localidad": "Yerba Buena",
    "codigoPostal": "4107",
    "direccion": "Luna 123",
    "aclaraciones": ""
  },
  "productos": [
    {
      "productoId": "64f1c2a9633f88d5c6f12345",
      "cantidad": 2
    }
  ]
}
```

`entrega.metodo` admite `domicilio` o `retiro`. Para retiro, los campos de
dirección se guardan vacíos. Precios, nombres, subtotales, envío, total, stock y
estados enviados por el cliente se ignoran porque no forman parte del contrato.

La respuesta incluye el número del pedido, la URL de Checkout Pro, `expiresAt`
y `orderToken`. El frontend debe conservar el número y el token para consultar
el estado; el token no debe publicarse en una URL. Una preferencia vence a los
30 minutos; después de ese plazo debe iniciarse un checkout nuevo con otra
clave de idempotencia.

## API administrativa

`POST /api/admin/login` recibe correo y contraseña. Las demás rutas requieren:

```http
Authorization: Bearer <jwt>
```

| Método | Ruta | Descripción |
| --- | --- | --- |
| `POST` | `/api/admin/login` | Inicia la sesión administrativa. |
| `GET` | `/api/admin/sesion` | Valida y devuelve la sesión. |
| `GET` | `/api/admin/productos` | Lista activos e inactivos. |
| `GET` | `/api/admin/productos/:id` | Obtiene un producto. |
| `POST` | `/api/admin/productos` | Crea un producto. |
| `PUT` | `/api/admin/productos/:id` | Reemplaza campos editables explícitos. |
| `PATCH` | `/api/admin/productos/:id/active` | Muestra u oculta un producto. |
| `GET` | `/api/admin/pedidos` | Lista pedidos. |
| `GET` | `/api/admin/pedidos/:id` | Obtiene un pedido completo. |
| `PATCH` | `/api/admin/pedidos/:id/estado` | Actualiza el estado operativo permitido. |

No hay eliminación física de productos ni pedidos. Ocultar y cancelar conserva
el historial. Las ediciones de producto usan una lista explícita de campos y
protegen el stock contra una escritura concurrente del webhook.

## Flujo de compra, pago y stock

1. El backend valida comprador, entrega, carrito e idempotencia.
2. Agrupa IDs repetidos y consulta todos los productos en MongoDB.
3. Rechaza productos inexistentes, ocultos, corruptos o con stock insuficiente.
4. Congela nombre y precio, calcula subtotal, envío y total.
5. Crea el pedido pendiente sin modificar stock.
6. Crea o reutiliza una única preferencia de Mercado Pago.
7. La URL de éxito sólo redirige; nunca aprueba el pedido.
8. El webhook valida HMAC y antigüedad de la firma.
9. El backend consulta el pago en Mercado Pago y verifica referencia, importe,
   moneda y preferencia.
10. Una transacción de MongoDB descuenta stock con `$gte` y `$inc`, y marca el
    pedido como procesado en la misma operación.

Un webhook repetido encuentra el stock ya comprometido y no vuelve a
descontarlo. Si al aprobarse el pago ya no hay stock, el pedido se cancela y
queda marcado para revisión y reembolso. Un reembolso restaura stock una sola
vez mientras el pedido no haya sido enviado o entregado; después de despacho
queda marcado para revisión manual.

La implementación no reserva ni descuenta inventario al abrir el checkout. Un
pedido con `requiresReview` no puede avanzar hacia preparación o despacho; el
administrador sólo puede mantener su estado o cancelarlo hasta conciliar el
pago.

## Mercado Pago

La preferencia usa únicamente snapshots calculados por el servidor,
`external_reference`, `back_urls`, `notification_url`, una vigencia de 30
minutos e idempotencia del SDK.

El webhook:

- exige `x-signature` y `x-request-id`;
- rechaza firmas vencidas;
- consulta `/v1/payments/:id` con el access token;
- comprueba la pertenencia a la preferencia;
- procesa aprobaciones y reembolsos idempotentemente.
- devuelve un error reintentable si un pago con referencia propia llega antes
  de que el pedido pueda encontrarse.

Para sandbox se admiten credenciales de prueba. No se incluyen tokens reales.
Una prueba completa requiere vendedor y comprador de prueba distintos, una URL
pública y el secreto configurado en “Tus integraciones”.

## Imágenes

Los administradores pueden enviar una URL en `images` o un único archivo
multipart en el campo `image`. Los archivos admitidos son JPG, PNG, WebP y AVIF
de hasta 2 MB. También se limitan campos y partes multipart. El total máximo es
ocho imágenes; si ya existen ocho, la API exige quitar una URL antes de aceptar
un archivo nuevo y nunca trunca la lista silenciosamente.

Si Cloudinary no está configurado, las URLs siguen funcionando y la carga de
archivos responde `503`. El backend no elimina imágenes históricas ni reemplaza
el proveedor.

## CORS y seguridad

Sólo se aceptan los orígenes exactos de `FRONTEND_URL` y `CORS_ORIGINS`.
Agregar explícitamente localhost, el dominio Vercel y los dominios productivos
que correspondan. Solicitudes sin `Origin`, como webhooks o herramientas de
servidor, se permiten; esto no evita JWT ni firma del webhook.

La API incluye:

- JSON limitado a 100 KB y multipart acotado.
- headers de seguridad y HSTS sobre HTTPS en producción.
- rate limiting global, de login, checkout y consulta de pedido.
- JWT HS256 con issuer, audience, subject, expiración y versión del hash.
- comparación bcrypt y respuestas administrativas `no-store`.
- validación de ObjectId, payloads filtrados y errores centralizados.

## Datos históricos y migración

El runtime conserva compatibilidad de lectura con productos y pedidos
anteriores. El script de migración convierte esos documentos a campos
canónicos, preserva importes y snapshots históricos y detecta datos faltantes o
identificadores duplicados antes de escribir.

Primero:

```bash
npm run migrate:canonical:dry
```

Resolver todos los avisos y hacer un respaldo. Sólo después:

```bash
npm run migrate:canonical:apply
```

La migración no se ejecuta al iniciar ni borra colecciones. El backfill se
realiza en una transacción y recién después crea los índices únicos, para que
valores legacy vacíos no bloqueen la conversión. Contiene mapeos de métodos
históricos de entrega y pago únicamente para conservar pedidos existentes;
esos métodos no tienen endpoints activos.

## Pruebas

```bash
npm ci
npm run check
npm test
npm audit --omit=dev
```

La suite cubre contratos HTTP, CORS, validación de checkout, catálogo,
autenticación y autorización administrativa, alta, consulta, edición y
visibilidad de productos, pedidos,
snapshots y totales, idempotencia de preferencia/webhook, firma, movimientos de
stock, compatibilidad histórica y preflight de migración.

Sin credenciales válidas no se pueden afirmar como probados MongoDB Atlas,
Mercado Pago ni Cloudinary reales.

Mercado Pago se mantiene en 3.2.1 porque la rama 2.12 arrastra una vulnerabilidad
moderada en `uuid`; `npm audit` sólo ofrece la versión 3 corregida.

## Render

`render.yaml` usa `npm ci`, `npm start`, `/api/health` y desactiva despliegues
automáticos. Las variables `sync: false` deben cargarse manualmente en Render;
el blueprint no contiene secretos. Verificar también que `CORS_ORIGINS` incluya
el dominio Vercel real si no coincide con el dominio personalizado.

No ejecutar la migración como `preDeployCommand` hasta haber revisado su dry
run y contar con respaldo.

## Compatibilidad conocida con el frontend hermano

El frontend encontrado en `../ELJARDINDELUNA-FRONT` tiene cambios locales sin
commit y todavía consume el contrato antiguo: respuestas sin `data`, campos en
español, `/usuarios`, rutas antiguas de productos/pagos, transferencias y tipos
de envío eliminados. También calcula un envío distinto y no guarda
`orderToken`.

El backend no reintroduce esas funciones obsoletas. Para integrar ambos
repositorios, el frontend debe adoptar los endpoints y DTO de este README,
enviar `Idempotency-Key`, consumir `/api/checkout/configuracion` y usar
únicamente `Authorization` para el administrador.
