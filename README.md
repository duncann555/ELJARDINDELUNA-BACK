# El Jardin de Luna Backend

Backend en Express preparado para ejecutarse en local y desplegarse en Render.

## Local

```bash
npm install
npm run dev
```

Servidor local: `http://localhost:3001`

## Deploy en Render

El repo ya queda listo para desplegarlo como **Web Service** de Render.

### Opcion 1: usando `render.yaml`

Este repo incluye [`render.yaml`](./render.yaml), con:

- runtime Node
- `buildCommand: npm install`
- `startCommand: npm start`
- `healthCheckPath: /api/health`
- variables publicas iniciales para produccion

Solo necesitas completar en Render las variables secretas marcadas con `sync: false`.

### Opcion 2: configuracion manual

Si prefieres crear el servicio desde el panel:

- Environment: `Node`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

## Frontend actual y dominio recomendado

Hoy tu frontend productivo principal esta publicado en:

- `https://www.eljardindeluna.ar`

El backend queda preparado para usar el dominio propio como `FRONTEND_URL`.

Si luego conectas tu dominio propio, lo ideal seria:

- Frontend: `https://www.eljardindeluna.ar`
- Backend/API: `https://api.eljardindeluna.ar`

No es obligatorio usar `api`, pero es la opcion mas limpia para separar frontend y backend.

## Variables de entorno

### Obligatorias para que el servicio arranque en produccion

- `MONGODB`
- `SECRETJWT`
- `ADMIN_PASSWORD`
- `MP_ACCESS_TOKEN` con credencial productiva `APP_USR-...`
- `MP_ENVIRONMENT=production`

### Recomendadas en produccion

- `FRONTEND_URL`
- `ADMIN_EMAIL`
- `ADMIN_TOKEN_EXPIRES_IN=30m`

### Necesarias segun funcionalidad

- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `MAIL_USER`
- `MAIL_PASS`

### Recomendadas para Render

- `NODE_ENV=production`
- `FRONTEND_URL=https://www.eljardindeluna.ar`
- `BACKEND_PUBLIC_URL=https://tu-backend-real.onrender.com`
- `ADMIN_PASSWORD=<tu password admin en Render>`
- `ADMIN_TOKEN_EXPIRES_IN=30m`
- `MP_ENVIRONMENT=production`
- `MP_ACCESS_TOKEN=APP_USR-...`
- `CORS_ORIGINS=https://www.eljardindeluna.ar,https://eljardindeluna.ar`
- `ALLOW_REQUESTS_WITHOUT_ORIGIN=false`
- `FIXED_SHIPPING_COST=15000`

### Variables opcionales

- `JWT_EXPIRES_IN`
- `JSON_BODY_LIMIT`
- `FORM_BODY_LIMIT`
- `API_RATE_LIMIT_WINDOW_MS`
- `API_RATE_LIMIT_MAX`
- `AUTH_RATE_LIMIT_MAX`
- `PAYMENT_RATE_LIMIT_MAX`
- `SHIPPING_RATE_LIMIT_MAX`
- `PASSWORD_RESET_TOKEN_TTL_MINUTES`
- `PASSWORD_RESET_STORE_NAME`
- `MP_WEBHOOK_URL`
- `MP_NOTIFICATION_URL`
- `MP_SUCCESS_URL`
- `MP_FAILURE_URL`
- `MP_PENDING_URL`
- `MP_SELLER_EMAIL`

`MP_WEBHOOK_URL` o `MP_NOTIFICATION_URL`, si se configuran en produccion, deben apuntar al backend publico con HTTPS. No uses localhost para webhooks productivos.

`MP_SUCCESS_URL`, `MP_FAILURE_URL` y `MP_PENDING_URL` son opcionales. Si no se configuran, el backend usa `FRONTEND_URL` y arma:

```bash
${FRONTEND_URL}/pago/success
${FRONTEND_URL}/pago/failure
${FRONTEND_URL}/pago/pending
```

En produccion esas URLs deben ser HTTPS y no pueden apuntar a localhost.

## Mercado Pago en sandbox/desarrollo

Para probar Checkout Pro sin cuentas reales:

```bash
NODE_ENV=development
MP_ENVIRONMENT=sandbox
MP_ACCESS_TOKEN=TEST-...
FRONTEND_URL=http://localhost:5173
```

Usa siempre cuentas de prueba creadas desde Mercado Pago: un vendedor de prueba para generar el token `TEST-...` y un comprador de prueba distinto para pagar desde Checkout Pro. No inicies sesion ni pagues con una cuenta real cuando estas usando sandbox.

En sandbox el backend usa `sandbox_init_point` cuando Mercado Pago lo devuelve. Los logs solo muestran si el token empieza con `TEST-` o `APP_USR-`; nunca se imprime el token completo.

## Mercado Pago en produccion

El checkout productivo requiere:

```bash
MP_ENVIRONMENT=production
MP_ACCESS_TOKEN=APP_USR-...
FRONTEND_URL=https://www.eljardindeluna.ar
BACKEND_PUBLIC_URL=https://tu-backend-real.onrender.com
```

El backend rechaza credenciales `TEST-` en produccion y solo devuelve `init_point`. No se debe reutilizar un link viejo de Mercado Pago. Para probar produccion, usa una cuenta compradora real distinta de la cuenta vendedora. Para sandbox, usa comprador y vendedor de prueba, sin mezclar con cuentas reales.

Si configuras `MP_SELLER_EMAIL`, el backend bloquea el checkout cuando el usuario autenticado tiene el mismo email que la cuenta vendedora. Mercado Pago tambien puede rechazar el pago si, dentro de Checkout Pro, intentas pagar con la misma cuenta que cobra.

## Frontend y CORS

Para tu caso, en Render deberias dejar como minimo:

```bash
FRONTEND_URL=https://www.eljardindeluna.ar
CORS_ORIGINS=https://www.eljardindeluna.ar,https://eljardindeluna.ar
ALLOW_REQUESTS_WITHOUT_ORIGIN=false
```

Las requests sin header `Origin`, como acceso directo al backend, health checks o webhooks, no se bloquean.

Con esto:

- el reset de contraseÃ±a vuelve al frontend real que hoy esta online
- Mercado Pago arma sus `back_urls` con tu frontend real
- CORS acepta el dominio oficial de la tienda
- En produccion no pruebes pagandote con la misma cuenta Mercado Pago del vendedor. Para una prueba real usa otra cuenta compradora real. Para sandbox se usan comprador y vendedor de prueba, sin mezclar con cuentas reales.

## Cuando actives el dominio propio

Si en Render falta `FRONTEND_URL` o se carga una URL local como `http://localhost:5173`, el backend ahora usa por defecto:

```bash
https://www.eljardindeluna.ar
```

Si falta `ADMIN_EMAIL`, el backend arranca igual, pero no podra excluir automaticamente la cuenta admin del listado de usuarios.

Si cambias `ADMIN_PASSWORD` en local, solo afecta al backend local. En Render tenes que actualizar `ADMIN_PASSWORD` desde Environment Variables y luego reiniciar o redeployar el servicio. Los tokens admin quedan ligados a la version vigente de `ADMIN_PASSWORD`, asi que al reiniciar con una nueva password las sesiones admin anteriores dejan de ser validas.

Cuando `https://www.eljardindeluna.ar` ya apunte efectivamente a Vercel, conviene actualizar en Render:

```bash
FRONTEND_URL=https://www.eljardindeluna.ar
CORS_ORIGINS=https://www.eljardindeluna.ar,https://eljardindeluna.ar
```

Asi mantienes compatibilidad con el dominio nuevo sin romper el dominio estable de Vercel.

## Salud del servicio

Render puede usar este endpoint para el health check:

- `GET /api/health`

Ese endpoint responde sin depender de MongoDB ni de `Origin`, para que Render no marque el servicio como caido por CORS.

## Seguridad aplicada

- `PORT` se toma desde Render y el servidor escucha en `0.0.0.0`
- el backend valida variables criticas en produccion al arrancar
- `trust proxy` esta habilitado para funcionar correctamente detras de Render
- CORS queda controlado por `FRONTEND_URL` y `CORS_ORIGINS`
- los headers de seguridad siguen activos en produccion

## Verificacion rapida

- Base API: `/api`
- Healthcheck: `/api/health`
- Productos: `/api/productos`
