# NutriEdu Backend

API REST de NutriEdu construida con Node.js, Express y PostgreSQL. Centraliza autenticacion, restricciones alimentarias, recetas, planificador semanal, lista de compras, administracion y correos transaccionales.

## Tecnologias

- Node.js
- Express
- PostgreSQL
- pg
- bcrypt
- jsonwebtoken
- Resend
- dotenv
- cors

## Estructura

```txt
nutriedu-backend/
├── controllers/
│   ├── adminController.js
│   ├── plannerController.js
│   ├── recipeController.js
│   └── userController.js
├── database/
│   └── db.js
├── middleware/
│   └── verifyAdmin.js
├── routes/
│   ├── adminRoutes.js
│   ├── plannerRoutes.js
│   ├── recipeRoutes.js
│   └── userRoutes.js
├── services/
│   └── emailService.js
├── server.js
├── package.json
└── .env.example
```

## Instalacion

```bash
cd nutriedu-backend
npm install
cp .env.example .env
```

Completa `.env` con tus credenciales locales:

```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nutriedu
DB_USER=tu_usuario_postgres
DB_PASSWORD=tu_password_postgres
JWT_SECRET=tu_clave_secreta_jwt
FRONTEND_URL=http://localhost:5173
RESEND_API_KEY=re_tu_api_key
RESEND_FROM_EMAIL="NutriEdu <onboarding@resend.dev>"
```

Ejecuta el servidor:

```bash
node server.js
```

URL base local:

```txt
http://localhost:3000/api
```

## Variables de entorno

- `PORT`: puerto del servidor Express.
- `DB_HOST`: host de PostgreSQL.
- `DB_PORT`: puerto de PostgreSQL.
- `DB_NAME`: nombre de la base de datos.
- `DB_USER`: usuario de PostgreSQL.
- `DB_PASSWORD`: contrasena de PostgreSQL.
- `JWT_SECRET`: clave para firmar tokens JWT.
- `FRONTEND_URL`: URL usada para construir enlaces de recuperacion de contrasena.
- `RESEND_API_KEY`: API key de Resend.
- `RESEND_FROM_EMAIL`: remitente usado por Resend.

En desarrollo puedes usar `NutriEdu <onboarding@resend.dev>`. En produccion debes configurar un dominio verificado en Resend.

## Flujo de una peticion

1. `server.js` recibe la peticion.
2. Express la dirige al router correspondiente.
3. La ruta llama a un controlador.
4. El controlador valida datos y ejecuta la logica de negocio.
5. Si hace falta, consulta PostgreSQL mediante `pg`.
6. El backend responde en JSON.

## Autenticacion

El login genera un JWT con `jsonwebtoken`. El frontend guarda el token en `localStorage` y lo envia en el header `Authorization`.

Actualmente algunas verificaciones administrativas usan `x-user-id` desde el frontend. Una mejora pendiente importante es validar todos los endpoints privados con middleware JWT real.

## Correos con Resend

El servicio [services/emailService.js](services/emailService.js) envia:

- correo de bienvenida al registrar un usuario;
- correo de recuperacion de contrasena con enlace seguro.

La recuperacion de contrasena usa tokens aleatorios. El token real solo viaja en el correo; en base de datos se almacena un hash SHA-256 en `password_reset_tokens`.

## Endpoints

### Usuarios

#### `POST /api/users/register`

Registra un usuario y dispara el correo de bienvenida.

```json
{
  "nombre": "David",
  "email": "david@email.com",
  "password": "123456"
}
```

#### `POST /api/users/login`

Autentica al usuario.

```json
{
  "email": "david@email.com",
  "password": "123456"
}
```

#### `POST /api/users/forgot-password`

Solicita un correo de recuperacion.

```json
{
  "email": "david@email.com"
}
```

La respuesta es generica aunque el correo no exista, para no revelar cuentas registradas.

#### `POST /api/users/reset-password`

Cambia la contrasena usando el token del correo.

```json
{
  "token": "token_del_enlace",
  "password": "nueva123"
}
```

#### `GET /api/users/restrictions`

Lista todas las restricciones disponibles.

#### `GET /api/users/restrictions/:userId`

Obtiene las restricciones de un usuario.

#### `POST /api/users/restrictions`

Guarda las restricciones seleccionadas por un usuario.

```json
{
  "userId": 1,
  "restricciones": [1, 3, 5]
}
```

### Recetas

- `GET /api/recipes/:id`
- `GET /api/recipes/:id/ingredients`
- `GET /api/recipes/safe/:userId`
- `GET /api/recipes/recommended/:userId`
- `GET /api/recipes/search/:userId`
- `GET /api/recipes/check/:recipeId/:userId`

### Planificador

- `GET /api/planner/:userId`
- `POST /api/planner`
- `GET /api/planner/:userId/shopping-list`

### Administracion

Las rutas administrativas requieren usuario con rol `administrador`.

- `GET /api/admin/recipes`
- `POST /api/admin/recipes`
- `PUT /api/admin/recipes/:id`
- `DELETE /api/admin/recipes/:id`
- `GET /api/admin/ingredients`
- `POST /api/admin/ingredients`

## Base de datos

La conexion se define en [database/db.js](database/db.js). El modelo completo esta documentado en [../docs/bases_de_datos.md](../docs/bases_de_datos.md).

La tabla `password_reset_tokens` se crea automaticamente cuando se usa el flujo de recuperacion de contrasena.

## Verificacion rapida

```bash
node --check controllers/userController.js
node --check services/emailService.js
node --check routes/userRoutes.js
```

No hay suite de pruebas automatizadas configurada todavia.
