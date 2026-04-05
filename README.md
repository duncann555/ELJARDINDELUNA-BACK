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

Y mantienes ademas el dominio estable de Vercel:

- `https://eljardindeluna-frontend.vercel.app`

Por eso el backend queda preparado para usar el dominio propio como `FRONTEND_URL` y conservar `vercel.app` dentro de `CORS_ORIGINS` para compatibilidad con previews.

Si luego conectas tu dominio propio, lo ideal seria:

- Frontend: `https://www.eljardindeluna.ar`
- Backend/API: `https://api.eljardindeluna.ar`

No es obligatorio usar `api`, pero es la opcion mas limpia para separar frontend y backend.

## Variables de entorno

### Obligatorias para que el servicio arranque en produccion

- `MONGODB`
- `SECRETJWT`

### Recomendadas en produccion

- `FRONTEND_URL`
- `ADMIN_EMAIL`

### Necesarias segun funcionalidad

- `MP_ACCESS_TOKEN`
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`
- `MAIL_USER`
- `MAIL_PASS`

### Recomendadas para Render

- `NODE_ENV=production`
- `FRONTEND_URL=https://www.eljardindeluna.ar`
- `CORS_ORIGINS=https://www.eljardindeluna.ar,https://eljardindeluna.ar,https://eljardindeluna-frontend.vercel.app`
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

## Frontend y CORS

Para tu caso, en Render deberias dejar como minimo:

```bash
FRONTEND_URL=https://www.eljardindeluna.ar
CORS_ORIGINS=https://www.eljardindeluna.ar,https://eljardindeluna.ar,https://eljardindeluna-frontend.vercel.app
ALLOW_REQUESTS_WITHOUT_ORIGIN=false
```

Las requests sin header `Origin`, como acceso directo al backend, health checks o webhooks, no se bloquean.

Con esto:

- el reset de contraseÃ±a vuelve al frontend real que hoy esta online
- Mercado Pago arma sus `back_urls` con tu frontend real
- CORS acepta el dominio actual de Vercel y deja listo el dominio propio

## Cuando actives el dominio propio

Si en Render falta `FRONTEND_URL` o se carga una URL local como `http://localhost:5173`, el backend ahora usa por defecto:

```bash
https://eljardindeluna-frontend.vercel.app
```

Si falta `ADMIN_EMAIL`, el backend arranca igual, pero no podra excluir automaticamente la cuenta admin del listado de usuarios.

Cuando `https://www.eljardindeluna.ar` ya apunte efectivamente a Vercel, conviene actualizar en Render:

```bash
FRONTEND_URL=https://www.eljardindeluna.ar
CORS_ORIGINS=https://www.eljardindeluna.ar,https://eljardindeluna.ar,https://eljardindeluna-frontend.vercel.app
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
