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
│   ├── profileController.js
│   ├── recipeController.js
│   └── userController.js
├── database/
│   └── db.js
├── middleware/
│   ├── verifyAdmin.js
│   └── verifyToken.js
├── routes/
│   ├── adminRoutes.js
│   ├── plannerRoutes.js
│   ├── profileRoutes.js
│   ├── recipeRoutes.js
│   └── userRoutes.js
├── migrations/
│   ├── 001_clinical_profile_foundation.sql
│   ├── ...
│   └── 006_in_app_notifications.sql
├── services/
│   ├── emailService.js
│   └── nutritionRuleService.js
├── scripts/
│   ├── clinicalProfileSmokeTest.js
│   └── runMigrations.js
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
VISION_PROVIDER=disabled
# VISION_PROVIDER=openai
# OPENAI_API_KEY=sk-proj-tu_api_key
# OPENAI_VISION_MODEL=gpt-5-mini
```

Para Supabase/produccion puedes usar `DATABASE_URL` en lugar de las variables `DB_*` locales:

```env
DATABASE_URL=postgresql://postgres.xxx:password@aws-0-region.pooler.supabase.com:6543/postgres
DB_SSL=true
```

Ejecuta el servidor:

```bash
node server.js
```

URL base local:

```txt
http://localhost:3000/api
```

## Prueba de integracion clinica

Con el backend local en ejecucion y la migracion clinica aplicada, ejecuta:

```bash
npm run test:clinical-smoke
```

La prueba crea un usuario temporal, obtiene un JWT mediante el login real, verifica todos los endpoints de perfil, evalua una receta y elimina los datos temporales al finalizar. Puedes usar `SMOKE_API_URL` si el backend no usa el puerto configurado en `.env`.

## Variables de entorno

- `PORT`: puerto del servidor Express.
- `DB_HOST`: host de PostgreSQL.
- `DB_PORT`: puerto de PostgreSQL.
- `DB_NAME`: nombre de la base de datos.
- `DB_USER`: usuario de PostgreSQL.
- `DB_PASSWORD`: contrasena de PostgreSQL.
- `DATABASE_URL`: cadena de conexion PostgreSQL para Supabase/produccion. Si existe, tiene prioridad sobre `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` y `DB_PASSWORD`.
- `DB_SSL`: controla SSL cuando se usa `DATABASE_URL`. En Supabase normalmente debe ser `true`.
- `JWT_SECRET`: clave para firmar tokens JWT.
- `FRONTEND_URL`: origen permitido por CORS y URL usada para construir enlaces de recuperacion de contrasena. Puede contener varios origenes separados por coma.
- `RESEND_API_KEY`: API key de Resend.
- `RESEND_FROM_EMAIL`: remitente usado por Resend.
- `VISION_PROVIDER`: `disabled` por defecto u `openai` para activar analisis real.
- `OPENAI_API_KEY`: credencial del servidor para el adaptador OpenAI; nunca debe enviarse a mobile.
- `OPENAI_VISION_MODEL`: modelo visual usado por el adaptador. Valor predeterminado: `gpt-5-mini`.

En desarrollo puedes usar `NutriEdu <onboarding@resend.dev>`. En Render escribe este valor sin comillas. En produccion publica debes configurar un dominio verificado en Resend.

## Flujo de una peticion

1. `server.js` recibe la peticion.
2. Express la dirige al router correspondiente.
3. La ruta llama a un controlador.
4. El controlador valida datos y ejecuta la logica de negocio.
5. Si hace falta, consulta PostgreSQL mediante `pg`.
6. El backend responde en JSON.

## Autenticacion

El login genera un JWT con `jsonwebtoken`. El frontend guarda el token en `localStorage` y lo envia en el header `Authorization`.

Los endpoints privados usan `verifyToken` para validar el JWT. En rutas de usuario, recetas y planificador, el backend usa `req.user.id` como fuente de identidad en lugar de confiar en IDs enviados desde el cliente.

Las rutas administrativas combinan `verifyToken` y `verifyAdmin`: primero se valida el JWT y luego se consulta el rol del usuario en base de datos.

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

Obtiene las restricciones del usuario autenticado. El `userId` de la ruta se conserva por compatibilidad con el frontend, pero el backend usa `req.user.id` desde el JWT.

#### `POST /api/users/restrictions`

Guarda las restricciones seleccionadas por el usuario autenticado.

```json
{
  "restricciones": [1, 3, 5]
}
```

#### `DELETE /api/users/account`

Elimina permanentemente la cuenta autenticada. Requiere la contrasena actual y confirmacion explicita:

```json
{
  "password": "contrasena actual",
  "confirmation": "DELETE_MY_ACCOUNT"
}
```

La eliminacion ocurre en una transaccion. Un administrador no puede eliminarse si es el ultimo administrador. Despues de eliminar la cuenta, `verifyToken` comprueba que el usuario aun exista y rechaza inmediatamente el JWT anterior.

### Recetas

- `GET /api/recipes/:id`
- `GET /api/recipes/:id/ingredients`
- `GET /api/recipes/safe/:userId`
- `GET /api/recipes/recommended/:userId`
- `GET /api/recipes/search/:userId`
- `GET /api/recipes/evaluate/:recipeId`
- `GET /api/recipes/check/:recipeId/:userId`

Las rutas de recetas requieren JWT. Las rutas que contienen `:userId` mantienen la forma historica de la API, pero la logica usa `req.user.id`.

El buscador acepta filtros como:

- `query`: busca por nombre o descripcion;
- `nivel_salud`: `muy_saludable`, `saludable` o `moderada`;
- `nivel_min`
- `nivel_max`
- `calorias_min`
- `calorias_max`
- `safe_only=true`: excluye recetas incompatibles con las restricciones del usuario autenticado.
- `paginated=true`: activa la respuesta paginada sin cambiar el contrato historico;
- `limit`: cantidad por pagina entre 1 y 50, con valor predeterminado 12;
- `offset`: posicion inicial no negativa, con valor predeterminado 0.

Sin `paginated=true`, el endpoint conserva el arreglo historico usado por el frontend web. Con paginacion devuelve `recipes` y `pagination`, incluyendo `nextOffset` y `hasMore`. Los filtros numericos se validan antes de consultar PostgreSQL y los resultados se ordenan de forma estable por nivel de salud, calorias, nombre e ID.

### Intake de imagenes de comida

#### `POST /api/food-analysis/intake`

Recibe una solicitud autenticada `multipart/form-data` con:

- `image`: un archivo JPEG, PNG, WebP, HEIC o HEIF de hasta 8 MB;
- `source`: `camera` o `library`;
- `capturedAt`: fecha ISO opcional.

El backend valida MIME, tamano y firma binaria. La imagen se procesa en memoria y se descarta al finalizar la solicitud.

```json
{
  "requestId": "uuid",
  "schemaVersion": "1.0",
  "status": "validated",
  "image": {
    "fileName": "meal.jpg",
    "mimeType": "image/jpeg",
    "sizeBytes": 245000,
    "source": "camera",
    "capturedAt": "2026-08-21T12:00:00.000Z"
  },
  "retention": {
    "retained": false,
    "reason": "Image storage is not configured"
  },
  "analysis": null,
  "nextStep": "vision_provider_required"
}
```

Este endpoint establece el contrato de transporte y validacion; no simula resultados de IA.

La incorporacion de Multer fue seguida por `npm audit fix` sin cambios mayores; la auditoria de dependencias de produccion finalizo con 0 vulnerabilidades conocidas.

#### `GET /api/food-analysis/status`

Informa si existe un proveedor visual configurado, sin exponer credenciales.

#### `POST /api/food-analysis/analyze`

Usa el mismo multipart del intake y exige adicionalmente:

- `consent=true`;
- `consentVersion=1.0`.

El adaptador OpenAI usa Responses API, entrada visual como data URL, salida JSON Schema estricta y `store: false`. La respuesta contiene plato, ingredientes, porcion, nutrientes aproximados, confianza e incertidumbres. Despues, NutriEdu evalua esa salida contra restricciones, objetivos, condiciones y metas del usuario.

#### `POST /api/food-analysis/review`

Recibe `{ requestId, analysis }` con las correcciones del usuario y vuelve a ejecutar el motor clinico sin reenviar ni necesitar la imagen.

Pruebas relacionadas:

```bash
npm run test:vision-contract
npm run test:clinical-smoke
```

`GET /api/recipes/evaluate/:recipeId` devuelve una evaluacion personalizada de la receta contra restricciones, objetivos, condiciones clinicas, metas nutricionales y reglas activas:

```json
{
  "recipe": {},
  "score": 88,
  "status": "suitable_with_adjustments",
  "unsafeIngredients": [],
  "alerts": [],
  "context": {
    "goals": ["lose_body_fat"],
    "conditions": ["hypertension"],
    "hasTargets": true
  }
}
```

Estados posibles:

- `suitable`
- `suitable_with_adjustments`
- `review_required`
- `not_suitable`

### Planificador

- `GET /api/planner/:userId`
- `POST /api/planner`
- `GET /api/planner/:userId/shopping-list`

Las rutas de planificador requieren JWT y usan `req.user.id`.

### Perfil avanzado

Las rutas de perfil avanzado requieren JWT y usan `req.user.id`.

- `GET /api/profile`
- `PUT /api/profile`
- `GET /api/profile/catalogs`
- `PUT /api/profile/goals`
- `PUT /api/profile/conditions`
- `PUT /api/profile/targets`

`GET /api/profile` devuelve el paquete completo del usuario autenticado:

```json
{
  "profile": null,
  "goals": [],
  "conditions": [],
  "targets": null
}
```

`GET /api/profile/catalogs` devuelve catalogos para construir formularios web o mobile:

```json
{
  "goals": [],
  "conditions": []
}
```

`PUT /api/profile` guarda datos antropometricos y de estilo de vida:

```json
{
  "fecha_nacimiento": "1998-05-10",
  "sexo": "masculino",
  "estatura_cm": 175,
  "peso_kg": 72,
  "nivel_actividad": "moderado",
  "condicion_fisica": "entrenamiento regular",
  "habitos_alimentarios": {
    "comidas_dia": 3
  },
  "preferencias_alimentarias": {
    "evita_picante": true
  },
  "notas": "Objetivo inicial de recomposicion corporal"
}
```

`PUT /api/profile/goals` acepta IDs o codes del catalogo:

```json
{
  "goals": ["gain_muscle", "general_health"]
}
```

`PUT /api/profile/conditions` acepta IDs o codes del catalogo. La fuente por defecto es `user`.

```json
{
  "conditions": ["hypertension"],
  "source": "user"
}
```

`PUT /api/profile/targets` guarda metas nutricionales manuales o calculadas:

```json
{
  "calories_min": 1800,
  "calories_max": 2200,
  "protein_min_g": 120,
  "sodium_max_mg": 1800,
  "calculation_source": "manual"
}
```

### Administracion

Las rutas administrativas requieren usuario con rol `administrador`.

- `GET /api/admin/recipes`
- `POST /api/admin/recipes`
- `PUT /api/admin/recipes/:id`
- `DELETE /api/admin/recipes/:id`
- `GET /api/admin/ingredients`
- `POST /api/admin/ingredients`
- `PUT /api/admin/ingredients/:id`
- `DELETE /api/admin/ingredients/:id`
- `GET /api/admin/overview`

`overview` devuelve un resumen operativo agregado: usuarios, cobertura de perfiles, volumen de catalogos, notificaciones sin leer, consumo y presupuesto de vision, proveedor configurado y estado del ledger de migraciones. No devuelve filas de usuarios, documentos clinicos, tokens ni secretos.

### Documentos medicos

`POST /api/medical-documents/intake` recibe un unico PDF, JPEG o PNG de hasta 10 MB mediante el campo multipart `document`.

Campos requeridos:

```txt
document
source=camera|file
documentType=prescription|lab_result|nutrition_order|medical_summary|other
consent=true
consentVersion=1.0
```

La ruta requiere JWT, valida MIME y firma binaria, procesa el archivo solo en memoria y responde con `retained: false`, `extraction: null` y `profileUpdated: false`. En esta etapa no existe extraccion por IA ni persistencia de documentos.

`POST /api/medical-documents/review` valida una extraccion estructurada y una lista `acceptedFindingIds`. Guarda los hallazgos estructurados para auditoria, nunca el archivo original, y responde siempre con `profileUpdated: false`.

La aplicacion al perfil se divide en dos pasos autenticados:

- `GET /api/medical-documents/reviews/:reviewId/preview` resuelve condiciones contra el catalogo y muestra valores actuales y propuestos;
- `POST /api/medical-documents/reviews/:reviewId/apply` exige `previewHash` y `confirmationVersion=1.0`, aplica dentro de una transaccion y registra la operacion.

Las condiciones se agregan sin borrar las existentes. Solo metas `per_day` pueden escribirse en `usuario_metas_nutricionales`. Medicamentos e indicaciones libres quedan auditados, pero no se fuerzan en campos que no existen.

El ciclo de vida y el historial usan:

- `GET /api/medical-documents/retention-policy` para consultar la politica activa;
- `GET /api/medical-documents/history` con `cursor` y `limit` opcionales;
- `GET /api/medical-documents/history/:reviewId` para detalle estructurado;
- `DELETE /api/medical-documents/history/:reviewId` para eliminar una revision no aplicada.

Las revisiones no aplicadas expiran despues de 30 dias. Una revision aplicada no puede eliminarse individualmente porque forma parte de la auditoria; se elimina mediante la cascada asociada al borrado de cuenta.

El contrato versionado vive en `services/medicalDocument/medicalDocumentSchema.js` y limita medicamentos, posibles condiciones, indicaciones alimentarias y metas nutricionales. Puede verificarse sin red:

```bash
npm run test:medical-document-schema
npm run test:medical-document-profile
```

## Notificaciones internas

La primera etapa no usa push ni genera costo externo. Mantiene una bandeja durable y preferencias por usuario:

- `GET /api/notifications?cursor=&limit=`: lista paginada y cantidad total sin leer;
- `PATCH /api/notifications/:notificationId/read`: marca una notificacion propia;
- `POST /api/notifications/read-all`: marca toda la bandeja como leida;
- `GET /api/notifications/preferences`: consulta categorias, zona horaria y horas silenciosas;
- `PUT /api/notifications/preferences`: actualiza preferencias validadas.

El registro crea una bienvenida y guardar el plan semanal genera un aviso. Estos eventos son secundarios: un fallo de notificaciones nunca revierte el registro ni el plan. Los textos no contienen datos clinicos y los destinos internos se resuelven desde una lista conocida en mobile.

## Base de datos

La conexion se define en [database/db.js](database/db.js). El modelo completo esta documentado en [../docs/bases_de_datos.md](../docs/bases_de_datos.md).

La tabla `password_reset_tokens` se crea automaticamente cuando se usa el flujo de recuperacion de contrasena.

La expansion clinica inicial vive en:

```txt
migrations/001_clinical_profile_foundation.sql
```

Esta migracion agrega:

- columnas nutricionales opcionales en `recetas`;
- `perfiles_usuario`;
- `objetivos_nutricionales`;
- `usuario_objetivos`;
- `condiciones_clinicas`;
- `usuario_condiciones`;
- `reglas_nutricionales`;
- `usuario_metas_nutricionales`.

Antes de habilitar un proveedor visual, ejecuta tambien:

```txt
migrations/002_vision_usage_limits.sql
```

La tabla `vision_analysis_usage` reserva presupuesto antes de cada llamada, registra tokens y costo estimado, y permite aplicar limites persistentes aunque el backend se reinicie.

Para habilitar revision persistente y aplicacion explicita de documentos medicos, ejecuta:

```txt
migrations/003_medical_document_audit.sql
```

Esta migracion crea `revisiones_documentos_medicos` y `aplicaciones_documentos_medicos`. Almacena JSON estructurado y cambios confirmados, pero no el PDF ni la imagen original.

El ciclo de retencion se agrega con:

```txt
migrations/004_medical_document_retention.sql
```

La limpieza de revisiones vencidas puede ejecutarse manualmente o desde un cron:

```bash
npm run cleanup:medical-reviews
```

La eliminacion integral de cuenta requiere:

```txt
migrations/005_account_deletion_cascades.sql
```

Esta migracion corrige `plan_semanal` y `usuario_restricciones` para usar `ON DELETE CASCADE`. Verifica todas las relaciones con:

```bash
npm run audit:user-deletion
```

La bandeja interna requiere:

```txt
migrations/006_in_app_notifications.sql
```

Esta migracion crea `notification_preferences` y `notifications`, ambas con eliminacion en cascada al borrar la cuenta. No configura push, tokens de dispositivo ni proveedores externos.

Los horarios configurables se agregan con:

```txt
migrations/007_notification_schedules.sql
```

Esta version conserva horarios para desayuno, almuerzo, cena, preparacion del plan y compras. Persistir el horario no concede permisos ni programa por si solo una notificacion del sistema.

### Ejecucion de migraciones

El runner usa una tabla `schema_migrations`, checksum SHA-256 y un advisory lock de PostgreSQL. Las versiones se indican de forma explicita para evitar ejecutar SQL accidentalmente sobre la base equivocada:

```bash
npm run migrate:status
npm run migrate -- 005 006
npm run migrate:baseline -- 005 006
```

`DATABASE_URL` selecciona Supabase o produccion; sin ella se usan las variables locales `DB_*`. El comando muestra host, puerto y base antes de ejecutar, sin imprimir credenciales.

El ledger se introdujo cuando `001` a `004` ya se habian aplicado manualmente en el entorno local. Por eso el estado indica si una migracion esta **registrada**, no si sus objetos pueden inferirse del esquema. El baseline actual comienza en `005`; no ejecutes `001` a `004` solo para llenar el ledger.

Si `005` y `006` fueron ejecutadas previamente desde Supabase SQL Editor, usa `migrate:baseline`. Este modo no vuelve a ejecutar las migraciones: primero comprueba las llaves foraneas con cascada, las tablas, columnas e indices esperados, y solo despues registra sus checksums. Si falta cualquier objeto, se detiene sin crear un registro falso.

Para mantener separadas las credenciales locales y de produccion, guarda temporalmente `DATABASE_URL` y `DB_SSL=true` en el archivo ignorado `.env.production.local` y ejecuta:

```bash
MIGRATION_ENV_FILE=.env.production.local npm run migrate:baseline -- 005 006
```

## Verificacion rapida

```bash
node --check controllers/userController.js
node --check controllers/profileController.js
node --check controllers/recipeController.js
node --check services/nutritionRuleService.js
node --check services/emailService.js
node --check routes/profileRoutes.js
node --check routes/recipeRoutes.js
node --check routes/userRoutes.js
node --check controllers/medicalDocumentController.js
node --check routes/medicalDocumentRoutes.js
```

Existen contratos automatizados para vision, limites de uso, esquema medico y cambios derivados de documentos, ademas del smoke autenticado `npm run test:clinical-smoke`.

## Despliegue en Render

Configuracion recomendada:

```txt
Root Directory: nutriedu-backend
Build Command: npm install
Start Command: npm start
```

Variables en Render:

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://...
DB_SSL=true
JWT_SECRET=clave_larga_y_secreta
FRONTEND_URL=https://tu-frontend.vercel.app
RESEND_API_KEY=re_tu_api_key
RESEND_FROM_EMAIL=NutriEdu <onboarding@resend.dev>
VISION_PROVIDER=disabled
# Para habilitar vision real:
# VISION_PROVIDER=openai
# OPENAI_API_KEY=sk-proj-tu_api_key
# OPENAI_VISION_MODEL=gpt-5-mini
VISION_DAILY_LIMIT_PER_USER=5
VISION_MONTHLY_BUDGET_USD=5
VISION_COST_RESERVE_USD=0.01
OPENAI_VISION_IMAGE_DETAIL=low
OPENAI_VISION_MAX_OUTPUT_TOKENS=1400
OPENAI_VISION_REASONING_EFFORT=minimal
OPENAI_VISION_INPUT_USD_PER_MILLION=0.25
OPENAI_VISION_OUTPUT_USD_PER_MILLION=2
```

`OPENAI_VISION_IMAGE_DETAIL=low` y `OPENAI_VISION_REASONING_EFFORT=minimal` reducen el costo inicial y son el punto de partida para calibracion. Las tarifas configuradas se usan solo para observabilidad y deben actualizarse cuando cambie el precio oficial del modelo. El presupuesto mensual se protege reservando `VISION_COST_RESERVE_USD` antes de cada llamada.

Para permitir frontend local y desplegado al mismo tiempo:

```env
FRONTEND_URL=http://localhost:5173,https://tu-frontend.vercel.app
```

Proyecto desarrollado por David Sanchez, Nerver Fernandez y Sebastian Marquez.
