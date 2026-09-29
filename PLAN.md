# Plan: Sistema de gestión para consultorios odontológicos (multi-tenant)

## 0. Instrucciones para Claude Code

- Trabajá **una fase a la vez**, en el orden de la sección 5. No avances a la siguiente hasta cumplir los criterios de aceptación de la actual.
- Antes de escribir código en cada fase: proponé un plan corto y listá los archivos que vas a crear o modificar. Las decisiones de la sección 11 ya están cerradas; si surge una decisión nueva que no esté ahí, preguntá antes de asumir.
- Si algo es ambiguo, preguntá. No inventes reglas de negocio.
- Commits chicos y descriptivos (Conventional Commits). Un PR/commit lógico por tarea.
- Todo cambio de esquema va en una migración versionada. Nunca modifiques la base a mano.
- Cada tabla con datos de negocio **debe** tener `clinica_id`, RLS habilitado y un test de aislamiento entre tenants.
- Datos de salud: nunca loguear datos personales ni clínicos. Nunca borrado físico de datos clínicos.

## 1. Contexto del producto

App web para que una odontóloga gestione turnos, fichas de pacientes e historia clínica. Primera usuaria: la novia del desarrollador. **Desde el diseño debe ser multi-tenant** para que otros odontólogos y clínicas la usen a futuro.

- Mercado: Argentina (zona horaria `America/Argentina/Buenos_Aires`, obras sociales y prepagas, WhatsApp como canal principal con pacientes).
- Uso: celular/tablet entre paciente y paciente, y desktop para carga y administración.
- Principio rector: **simplicidad**. Crear un turno debe llevar 3 clics o menos.
- Qué NO se construye todavía: billing/planes, panel super-admin, white label, app nativa, offline completo.

## 2. Stack (decisiones cerradas)

| Capa | Tecnología |
|---|---|
| Frontend | Next.js (App Router) + TypeScript, PWA, Tailwind + shadcn/ui, TanStack Query, Serwist |
| Backend | Node + TypeScript + Express, Zod, Vitest |
| ORM / migraciones | Drizzle + drizzle-kit (policies RLS en migraciones SQL) |
| Base de datos | Supabase Postgres (conexión vía pooler, modo transaction) |
| Auth | Supabase Auth con sesión en cookies httpOnly (`@supabase/ssr`); el backend valida el JWT |
| Archivos | Supabase Storage con URLs firmadas generadas por el backend |
| Colas / jobs | Redis + BullMQ (proceso `worker` separado) |
| WhatsApp | Fase inicial: link `wa.me` con mensaje prearmado. Luego: WhatsApp Cloud API oficial de Meta, integración directa |
| Emails | Resend |
| Errores | Sentry |
| Hosting front | Vercel |
| Hosting API + worker + Redis | Dokploy en VPS propio (contenedores Docker), deploy con GitHub Actions + GHCR |
| Monorepo | pnpm workspaces |

## 3. Arquitectura

```
[Front: Next.js PWA] → [Backend: Express API] → [Supabase Postgres]
                              ↓
                      [Redis + BullMQ worker] → WhatsApp / emails / PDFs
```

- El front **solo consume la API**. Sin lógica de negocio ni acceso directo a la base.
- API y worker comparten código, corren como dos procesos (dos contenedores) distintos.
- **Sesión**: con cookies httpOnly el navegador no puede leer el JWT, así que el front llama a la API a través de un proxy del lado servidor de Next.js (route handlers o rewrites). Ese proxy lee la sesión de la cookie y reenvía a la API `Authorization: Bearer <jwt>` y `X-Clinica-Id`. La API nunca se expone al navegador con credenciales propias.

### Estructura del repo

```
/apps/web            Next.js (PWA)
/apps/api            Express: src/api (rutas, servicios) y src/worker (procesadores BullMQ)
/packages/db         Esquema Drizzle, migraciones, policies RLS, seeds, tipos
/packages/shared     Schemas Zod, tipos y constantes compartidos front/back
/docs                Decisiones de arquitectura (ADR) y notas
```

## 4. Multi-tenancy y seguridad

### 4.1 Aislamiento por RLS

- Una sola base. Todas las tablas de negocio llevan `clinica_id uuid not null`.
- El backend NO usa el rol dueño de las tablas ni un rol con `BYPASSRLS`. Crear un rol de aplicación (`app_user`) sin privilegios de superusuario y con `FORCE ROW LEVEL SECURITY` en las tablas.
- En **cada request autenticado**: abrir transacción y ejecutar `select set_config('app.clinica_id', $1, true)` (equivalente a `SET LOCAL`). Las policies leen `current_setting('app.clinica_id', true)::uuid`.
- Implementar un helper único (`withTenant(clinicaId, fn)`) que sea la **única** forma de acceder a la base desde los servicios. Prohibir queries fuera de ese helper (salvo migraciones y jobs de sistema explícitos).
- Segunda capa: filtrar por `clinica_id` también en el código de los servicios.
- Con el pooler en modo transaction, usar siempre `set_config(..., true)` dentro de una transacción explícita; nunca `SET` de sesión.

### 4.2 Auth y roles

- El backend valida el JWT de Supabase (verificar con la clave/JWKS del proyecto según la configuración vigente; consultar la doc actual de Supabase).
- Tabla de membresías: un usuario pertenece a una o más clínicas con un rol. La clínica activa llega en el header `X-Clinica-Id` (un solo dominio para todas las clínicas) y se valida contra las membresías del usuario en **cada** request: si no tiene membresía activa en esa clínica, 403. Si el usuario tiene una sola clínica, el front la selecciona automáticamente; si tiene varias, muestra un selector. Más adelante se puede migrar a subdominio por clínica cambiando solo cómo se obtiene el dato; la validación contra membresías es la misma.
- Roles iniciales: `admin`, `profesional`, `recepcion`. Matriz de permisos centralizada en un solo archivo, aplicada por middleware.
  - `profesional`: ve su agenda y sus pacientes/historia clínica.
  - `recepcion`: agenda y datos administrativos del paciente, **sin** acceso a evoluciones clínicas.
  - `admin`: todo lo de la clínica, gestión de usuarios y configuración.

### 4.3 Datos sensibles y cumplimiento

- Datos de salud = datos sensibles (Ley 25.326). Cifrado en tránsito (TLS) y en reposo (el de Supabase), backups con PITR activado.
- **Soft delete** en todo dato clínico (`deleted_at`). Sin borrado físico.
- **Evoluciones clínicas append-only**: no se editan; una corrección genera una nueva versión que referencia la anterior.
- **Audit log** de accesos y modificaciones a historia clínica (quién, qué, cuándo, desde qué clínica).
- Conservación: no existe borrado físico de datos clínicos (soft delete + append-only). Los aspectos legales y regulatorios se gestionan fuera de este plan.
- Sin datos personales ni clínicos en logs, Sentry ni mensajes de error. Configurar el scrubbing de Sentry.
- Archivos (radiografías, fotos): bucket privado, ruta `clinica_id/paciente_id/...`, acceso solo por URL firmada de corta duración.

## 5. Fases de implementación

### Fase 0: Setup del proyecto

**Tareas**
- Inicializar monorepo pnpm con `apps/web`, `apps/api`, `packages/db`, `packages/shared`.
- TypeScript estricto compartido, ESLint, Prettier, Vitest.
- Scripts raíz: `dev`, `build`, `test`, `lint`, `db:migrate`, `db:seed`.
- Docker Compose local solo para Redis (la base es Supabase; usar un proyecto de desarrollo o el stack local de Supabase CLI).
- CI en GitHub Actions: lint, typecheck, tests.
- `.env.example` (ver sección 7) y validación de variables de entorno con Zod al iniciar.

**Aceptación**
- `pnpm install && pnpm dev` levanta web y API.
- CI en verde en un PR de prueba.

### Fase 1: Base de datos, RLS y auth

**Tareas**
- Esquema inicial (sección 6): `clinicas`, `membresias`, `profesionales`, `sedes`, `pacientes`, `tipos_tratamiento`, `turnos`, `audit_log`.
- Rol `app_user`, RLS + `FORCE ROW LEVEL SECURITY` y policies por `clinica_id` en todas las tablas de negocio.
- Helper `withTenant`.
- Middleware de auth (validación JWT), resolución de clínica activa y rol, y middleware de permisos.
- Seed: una clínica demo con 1 admin, 1 profesional y algunos pacientes.

**Aceptación**
- Test automatizado: un usuario de la clínica A **no puede leer ni escribir** datos de la clínica B por ningún endpoint ni query.
- Un request sin `set_config` no devuelve filas de tablas con RLS.
- Login funciona de punta a punta (front → Supabase Auth → API).

### Fase 2: Pacientes

**Tareas**
- CRUD de pacientes (API + UI): datos personales, contacto (celular para WhatsApp), cobertura (obra social/prepaga, plan, nº de afiliado), antecedentes médicos y alergias.
- Búsqueda rápida por nombre, apellido, DNI y teléfono.
- Vista de ficha: datos + historial de turnos.
- Soft delete y registro en audit log.

**Aceptación**
- Buscar y abrir una ficha desde el celular en 2 pasos.
- Roles respetados (recepción no ve campos clínicos).
- Tests de servicio y de aislamiento.

### Fase 3: Agenda y turnos

**Tareas**
- Modelo de turnos: profesional, sillón/consultorio, paciente, tipo de tratamiento, inicio/fin, estado (`pendiente`, `confirmado`, `atendido`, `ausente`, `cancelado`), notas.
- Duración por tipo de tratamiento (configurable por clínica).
- Validación de solapamiento por profesional y por sillón (a nivel servicio **y** con constraint de exclusión en Postgres).
- Bloqueos de horario (almuerzo, vacaciones, congresos) y horarios de atención por profesional.
- UI: vista día (mobile por defecto) y semana (desktop), drag & drop para mover turnos, creación rápida.
- Todas las fechas en `timestamptz` (UTC en base), mostradas en `America/Argentina/Buenos_Aires`.

**Aceptación**
- Crear un turno en 3 clics o menos.
- Imposible crear turnos solapados aunque haya dos requests concurrentes (test de concurrencia).
- Mover un turno se siente instantáneo (actualización optimista con rollback en error).

### Fase 4: Recordatorios por WhatsApp

**Tareas (4a, sin infra de mensajería)**
- Botón "Enviar recordatorio" en cada turno: abre `wa.me/<numero>?text=...` con mensaje prearmado desde una plantilla configurable por clínica.
- Registrar en `recordatorios` cuándo se envió.

**Tareas (4b, automatizado)**
- Cola BullMQ + worker: job repetible que busca turnos que necesitan recordatorio (24 a 48 hs antes) y encola envíos.
- Integración directa con la WhatsApp Cloud API de Meta (detrás de una interfaz `MessagingProvider` para poder cambiar de proveedor más adelante). Requiere cuenta de negocio verificada, número y plantillas aprobadas en Meta; el trámite tarda días, conviene iniciarlo antes de esta fase.
- Confirmación/reprogramación desde la respuesta del paciente (webhook → actualiza estado del turno).
- Reintentos con backoff, idempotencia (no enviar dos veces el mismo recordatorio), log de resultado.
- Configuración de WhatsApp **por clínica** (cada tenant con su número/credenciales, cifradas en base).

**Aceptación**
- 4a: el recordatorio se abre listo para enviar en un clic.
- 4b: un turno a 24 hs recibe exactamente un recordatorio; si el worker se reinicia no se duplica; el estado se actualiza al responder.

### Fase 5: Evoluciones clínicas y archivos

**Tareas**
- Evoluciones por consulta (append-only con versionado), vinculadas al turno y al paciente.
- Subida de archivos (radiografías, fotos, estudios) a Supabase Storage vía URL firmada; metadatos en tabla `archivos`.
- Visor simple de imágenes en la ficha.
- Audit log de lectura y escritura de evoluciones.

**Aceptación**
- No se puede editar ni borrar una evolución; solo agregar una versión nueva.
- Un archivo de la clínica A no es accesible desde la clínica B ni sin URL firmada vigente.

### Fase 6: Odontograma

**Tareas**
- Componente SVG propio, táctil y responsive: 32 dientes permanentes (y opción de temporales), por diente y por cara.
- Registro de estados (caries, obturación, corona, ausencia, endodoncia, implante, etc.) con **historial por fecha** (append-only).
- Interacción: en celular, tap en el diente y panel inferior; en desktop, click con panel lateral.
- Catálogo de estados/hallazgos configurable por clínica.

**Aceptación**
- Se puede registrar un hallazgo en 3 taps desde el celular.
- Se puede ver el estado del odontograma en una fecha pasada.

### Fase 7: PWA, hardening y deploy

**Tareas**
- PWA instalable (manifest, iconos, Serwist). Cache offline solo de la agenda del día en modo lectura.
- Rate limiting (Redis), headers de seguridad, CORS estricto.
- Sentry en front, API y worker, con scrubbing de datos personales.
- Deploy: front en Vercel. API y worker como dos aplicaciones en Dokploy (un `Dockerfile` por proceso, imágenes en GHCR, deploy automático desde GitHub Actions). Variables de entorno por ambiente.
- Redis como servicio en Dokploy: con contraseña, **sin exposición pública** (solo red interna), persistencia habilitada (AOF) y `maxmemory-policy noeviction` (requerido por BullMQ). Volumen incluido en el backup del VPS.
- HTTPS y dominio de la API vía el proxy de Dokploy (Traefik).
- Backups: PITR activado en Supabase y procedimiento de restauración documentado.
- Health checks y logs estructurados sin datos sensibles.

**Aceptación**
- La app se instala en el celular y abre la agenda del día sin conexión (solo lectura).
- Restauración de backup probada al menos una vez en un ambiente de prueba.

## 6. Modelo de datos inicial

Todas las tablas de negocio: `id uuid`, `clinica_id`, `created_at`, `updated_at`, `deleted_at` (soft delete donde aplique).

| Tabla | Campos principales |
|---|---|
| `clinicas` | nombre, cuit (opcional), zona_horaria, configuración (JSON: plantillas de recordatorio, membrete, etc.) |
| `membresias` | user_id (Supabase Auth), clinica_id, rol (`admin`/`profesional`/`recepcion`), activo |
| `profesionales` | membresia_id (nullable), nombre, matrícula, especialidad, color en agenda, horarios de atención |
| `sedes` | nombre, dirección; con `sillones` (nombre, sede_id) |
| `pacientes` | nombre, apellido, dni, fecha_nacimiento, celular, email, domicilio, antecedentes, alergias, notas |
| `coberturas` | paciente_id, obra_social/prepaga, plan, nro_afiliado |
| `tipos_tratamiento` | nombre, duración_minutos, precio_base (opcional), activo |
| `turnos` | paciente_id, profesional_id, sillon_id, tipo_tratamiento_id, inicio, fin, estado, notas; constraint de exclusión anti-solapamiento |
| `bloqueos` | profesional_id (nullable), inicio, fin, motivo |
| `recordatorios` | turno_id, canal, estado, enviado_at, error, idempotency_key |
| `evoluciones` | paciente_id, turno_id (nullable), profesional_id, contenido, version, reemplaza_a (nullable); append-only |
| `odontograma_registros` | paciente_id, diente, cara, estado, fecha, evolucion_id (nullable); append-only |
| `archivos` | paciente_id, tipo, storage_path, mime, tamaño, subido_por |
| `audit_log` | user_id, clinica_id, entidad, entidad_id, accion, timestamp, metadata (sin datos clínicos) |

Fase posterior: `presupuestos` / `planes_tratamiento`, `pagos` / `cuenta_corriente`, `recetas`, `consentimientos`, `lista_espera`.

## 7. Variables de entorno

```
# Comunes
NODE_ENV=
SENTRY_DSN=

# API / worker
DATABASE_URL=                 # rol app_user, vía pooler (transaction mode)
DATABASE_URL_MIGRATIONS=      # conexión directa, solo para migraciones
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=    # solo backend, nunca en el front
SUPABASE_JWT_SECRET=          # o JWKS URL, según la configuración vigente
REDIS_URL=
RESEND_API_KEY=
WHATSAPP_ENCRYPTION_KEY=      # para cifrar credenciales por clínica
CORS_ALLOWED_ORIGINS=

# Web
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=
```

## 8. Convenciones

- TypeScript estricto. Sin `any` salvo justificación comentada.
- Validación de entrada y salida con Zod; los schemas viven en `packages/shared`.
- API REST bajo `/api/v1`, paginación por cursor, errores con formato uniforme (`code`, `message`), sin filtrar detalles internos.
- Capas en la API: ruta → servicio → repositorio. Los servicios no conocen Express.
- Nombres de dominio en español (`pacientes`, `turnos`), código y comentarios técnicos en inglés o español, pero consistentes.
- Fechas: `timestamptz` en base, ISO 8601 en la API, conversión a zona horaria de la clínica solo en la capa de presentación.
- Dinero (fase posterior): enteros en centavos, nunca floats.

## 9. Testing

- **Obligatorio**: tests de aislamiento entre tenants para cada tabla y cada endpoint que toque datos de negocio (usuario de A intentando leer/escribir datos de B).
- Tests de servicio con Vitest y base de test real (no mocks de la base para RLS).
- Test de concurrencia para turnos solapados.
- Tests de idempotencia de recordatorios y reintentos del worker.
- E2E con Playwright para 3 flujos críticos: crear turno, crear paciente, enviar recordatorio.

## 10. Fuera de alcance del MVP

Tareas legales y regulatorias (T&C, política de privacidad, contratos, inscripciones), billing y planes de suscripción, panel super-admin, white label, app nativa, offline completo, facturación electrónica ARCA, liquidación a obras sociales, reserva online pública, inventario de insumos, reportes avanzados.

## 11. Decisiones cerradas

| Tema | Decisión |
|---|---|
| Hosting API + worker + Redis | Dokploy en VPS propio, un contenedor por proceso, imágenes en GHCR |
| WhatsApp automatizado (Fase 4b) | WhatsApp Cloud API directo de Meta; antes, `wa.me` con mensaje prearmado (Fase 4a) |
| Obras sociales en el MVP | Solo datos de afiliación (obra social/prepaga, plan, nº de afiliado); sin códigos de prestación ni autorizaciones |
| Sesión front ↔ API | Cookies httpOnly con `@supabase/ssr`; proxy del lado servidor de Next.js reenvía el JWT a la API |
| Clínica activa | Header `X-Clinica-Id` en un solo dominio, validado contra membresías; subdominio por clínica queda para el futuro |
| Tareas legales | Fuera del plan |
