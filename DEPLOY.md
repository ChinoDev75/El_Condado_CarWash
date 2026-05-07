# Deploy en Render

## Backend

Configura el servicio como `Web Service` con:

- Root directory: `server`
- Build command: `npm install && npm run build`
- Start command: `npm start`
- Health check path: `/`

Variables obligatorias:

```env
NODE_ENV=production
MONGODB_URI=tu_uri_de_mongodb_atlas
JWT_SECRET=un_valor_privado_de_32_caracteres_o_mas
JWT_EXPIRES_IN=7d
CLIENT_URL=https://tu-frontend.onrender.com
CORS_ORIGIN=https://tu-frontend.onrender.com
BUSINESS_TIME_ZONE=America/Guatemala
BUSINESS_UTC_OFFSET=-06:00
RECURRENTE_WEBHOOK_SECRET=un_valor_privado_para_webhooks
```

En MongoDB Atlas revisa:

- Database Access: el usuario del `MONGODB_URI` debe tener permiso de lectura/escritura.
- Network Access: agrega `0.0.0.0/0` para permitir conexiones desde Render, o agrega las IPs salientes de tu servicio si usas una configuracion fija.
- El `MONGODB_URI` en Render debe ser el URI de Atlas, no `mongodb://localhost:27017/carwash`.

Puedes revisar el estado del backend en:

```text
https://tu-backend.onrender.com/api/health
```

Si MongoDB no conecta, respondera `503` con el estado de la base.

Variables para pagos con tarjeta:

```env
RECURRENTE_PUBLIC_KEY=tu_public_key
RECURRENTE_SECRET_KEY=tu_secret_key
RECURRENTE_PASS_FEE=true
```

## Frontend

Configura el servicio como `Static Site` con:

- Root directory: `client`
- Build command: `npm install && npm run build`
- Publish directory: `dist`

Variable del frontend:

```env
VITE_API_URL=https://tu-backend.onrender.com/api
```

Despues de crear ambos servicios, actualiza `CLIENT_URL` y `CORS_ORIGIN` en el backend con la URL real del frontend.
