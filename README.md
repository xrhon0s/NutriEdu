# Mi proyecto
## Backend

El backend de NutriEdu está desarrollado con Node.js y Express, y se encarga de gestionar la lógica principal del sistema, incluyendo autenticación de usuarios, registro, almacenamiento de restricciones alimentarias y consulta de recetas seguras o recomendadas.

### Tecnologías usadas

- Node.js
- Express
- PostgreSQL
- pg
- bcrypt
- jsonwebtoken
- dotenv
- cors

### Estructura del backend

```bash
controllers/
  recipeController.js
  userController.js
database/
  db.js
routes/
  recipeRoutes.js
  userRoutes.js
server.js

## Flujo general del backend

El backend de NutriEdu expone una API REST construida con Express. Su función es recibir solicitudes del frontend, validar datos, consultar la base de datos PostgreSQL y devolver respuestas en formato JSON.

### Flujo de una petición

1. El cliente envía una solicitud HTTP al servidor.
2. Express recibe la petición en `server.js`.
3. La petición se dirige al archivo de rutas correspondiente.
4. La ruta llama al controlador asociado.
5. El controlador ejecuta la lógica de negocio.
6. Si es necesario, se consulta la base de datos.
7. El servidor responde con datos JSON o con un mensaje de error.

---

## Configuración del servidor

El punto de entrada del backend es `server.js`.

### Responsabilidades principales

- cargar variables de entorno con `dotenv`
- inicializar Express
- habilitar CORS
- permitir el uso de JSON en las peticiones
- registrar las rutas principales del sistema

### Rutas base registradas

- `/api/users`
- `/api/recipes`

---

## Endpoints disponibles

### Usuarios

#### `POST /api/users/register`
Permite registrar un nuevo usuario en el sistema.

**Body esperado**
```json
{
  "nombre": "David",
  "email": "david@email.com",
  "password": "123456"
}

## Configuración del entorno

1. Clona el repositorio
2. Crea un archivo `.env` en la raíz del backend basado en `.env.example`
3. Completa tus credenciales de PostgreSQL

Ejemplo:

PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=nutriedu
DB_USER=tu_usuario
DB_PASSWORD=tu_password
JWT_SECRET=tu_clave_jwt

4. Instala dependencias:

npm install

5. Ejecuta el servidor:

node server.js