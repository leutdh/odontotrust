# Pendientes de OdontoTrust

Estado al 2026-09-29. Fases **0, 1, 2, 3 y 4a** terminadas y commiteadas. Este documento junta todo lo que falta, ordenado por quién tiene que actuar.

Referencias: el plan completo está en `PLAN.md`; los criterios de aceptación de cada fase están en su sección 5.

---

## 1. Decisiones tuyas (bloquean trabajo)

- [ ] **Modelo de WhatsApp para la Fase 4b.** Propuesta pendiente de confirmar: un solo número tuyo para todas las clínicas, con conteo de mensajes por clínica para poder cobrarles.
  - A favor: un solo trámite con Meta, plantillas aprobadas una vez, sin credenciales por clínica.
  - En contra: el paciente ve tu número y no el del consultorio; si Meta baja la calidad del número se caen todas las clínicas a la vez; los límites de envío son compartidos.
  - Recomendación: modelo híbrido (número de plataforma por defecto, y dejar la interfaz `MessagingProvider` lista para que una clínica use el suyo).
  - Esto **reemplaza** lo que dice `PLAN.md` en 4b ("configuración de WhatsApp por clínica"), así que hay que actualizar el plan.
- [ ] **Confirmar con Meta si permite este uso** (un negocio enviando en nombre de terceros con su propio número) antes de cobrar por los mensajes. Yo no puedo asegurarlo.
- [x] **CI con base de datos.** Resuelto: el workflow usa un Postgres como servicio (`DATABASE_URL_TEST`) y aplica las migraciones antes de correr los tests. Falta verlo en verde cuando exista el repo en GitHub.
- [ ] **Agenda del profesional.** Hoy un profesional ve por defecto su agenda, pero puede ver la de todos con el selector. El plan dice "ve su agenda". ¿Se restringe también en el servidor?
- [ ] **Pacientes del profesional.** El plan dice que el profesional ve "sus pacientes". Hoy ve todos los de la clínica. ¿Se restringe?
- [ ] **Reglas que asumí y hay que confirmar:**
  - Borrar un paciente: solo `admin` y `profesional` (no `recepcion`).
  - Una sola cobertura (obra social) por paciente.
  - Un turno puede no tener sillón.
  - Sin horarios cargados, un profesional no tiene restricción de horario.

## 2. Cosas que tenés que hacer vos

- [ ] **Crear el repositorio en GitHub** y hacer push (no hay remoto todavía). Con eso se cierra la aceptación de la Fase 0 ("CI en verde en un PR de prueba").
- [ ] **Iniciar el trámite de WhatsApp Business en Meta** (cuenta de negocio verificada, número y plantillas aprobadas). Tarda días, conviene arrancarlo ya.
- [ ] **Resetear la contraseña de la base de Supabase** (la pegaste en el chat) y actualizar `DATABASE_URL_MIGRATIONS` y `DATABASE_URL` en el `.env`.
- [ ] **Actualizar `.env.example`** (no pude editarlo por tu regla de permisos):
  - quitar `SUPABASE_JWT_SECRET` (ya no se usa: se valida con JWKS),
  - agregar `API_URL=http://localhost:4000` y `APP_USER_PASSWORD=`.
- [ ] **Docker Desktop corriendo** cuando se haga la 4b (Redis para las colas).
- [ ] **Probar en navegador y celular** lo que solo verifiqué por HTTP (ver sección 3).
- [ ] Recordar que `pnpm db:seed` **cambia la contraseña de los usuarios demo** en cada corrida. La última fue `<contraseña-demo>`.

## 3. Sin verificar en pantalla real

Probé todo esto con tests y con sesiones reales contra la API, pero **nunca en un navegador**:

- [ ] Agenda: crear un turno en **3 clics o menos** tocando un horario vacío.
- [ ] Agenda: **drag & drop** en desktop y "mantener apretado" en celular; que el movimiento se sienta instantáneo y vuelva atrás si el servidor lo rechaza.
- [ ] Agenda: vista semana en desktop, franjas fuera de horario sombreadas, bloqueos rayados.
- [ ] Recordatorio: que el botón abra WhatsApp con el mensaje listo (celular y navegador; ojo con bloqueadores de ventanas).
- [ ] Pacientes: **buscar y abrir una ficha en 2 pasos** desde el celular.
- [ ] Un usuario con **más de una clínica** (selector de clínica): implementado, nunca probado con datos reales.
- [ ] `docker compose up redis` y que el worker conecte (Fase 0; Docker no estaba corriendo).

## 4. Fases que faltan

### Fase 4b: recordatorios automáticos (sin empezar)
Depende de la decisión de la sección 1.
- [ ] Cola BullMQ + proceso `worker` con un job repetible que busque turnos a 24–48 h.
- [ ] Interfaz `MessagingProvider` con un proveedor simulado para probar sin Meta, y luego el real (WhatsApp Cloud API).
- [ ] Plantillas de Meta aprobadas (los recordatorios son mensajes iniciados por el negocio, exigen plantilla).
- [ ] Idempotencia (un turno recibe **un solo** recordatorio aunque el worker se reinicie), reintentos con backoff y registro del resultado. La tabla `recordatorios` ya existe con `idempotency_key`.
- [ ] Webhook de respuestas que actualiza el estado del turno. Con un número compartido, usar **botones de respuesta rápida que lleven el ID del turno** en vez de adivinar por teléfono.
- [ ] **Conteo de mensajes por clínica** (para poder cobrar). La facturación en sí sigue fuera del MVP.
- [ ] Tests de idempotencia y de reintentos (requieren Redis).
- [ ] Aceptación: un turno a 24 h recibe exactamente un recordatorio; el estado se actualiza al responder.

### Fase 5: evoluciones clínicas y archivos (sin empezar)
- [ ] Tabla `evoluciones` **append-only** con versionado (una corrección crea una versión nueva que referencia la anterior); sin edición ni borrado.
- [ ] Tabla `archivos` y subida a Supabase Storage con bucket privado, ruta `clinica_id/paciente_id/...` y **URLs firmadas de corta duración** generadas por el backend (esto usa por fin la `SUPABASE_SERVICE_ROLE_KEY` en la API).
- [ ] Visor simple de imágenes en la ficha.
- [ ] Audit log de **lectura y escritura** de evoluciones.
- [ ] Permisos: `recepcion` sin acceso a evoluciones (ya está en la matriz como `clinico:*`).
- [ ] Aceptación: no se puede editar ni borrar una evolución; un archivo de la clínica A no es accesible desde B ni sin URL vigente.

### Fase 6: odontograma (sin empezar)
- [ ] Componente SVG propio, táctil y responsive: 32 dientes permanentes (y opción de temporales), por diente y por cara.
- [ ] Registro de estados con **historial por fecha** (append-only), tabla `odontograma_registros`.
- [ ] Catálogo de estados/hallazgos configurable por clínica.
- [ ] Panel inferior en celular, lateral en desktop.
- [ ] Aceptación: registrar un hallazgo en 3 toques; ver el odontograma en una fecha pasada.

### Fase 7: PWA, hardening y deploy (sin empezar)
- [ ] PWA instalable con Serwist; cache offline **solo** de la agenda del día, en lectura.
- [ ] Rate limiting con Redis, headers de seguridad, CORS estricto.
- [ ] Sentry en front, API y worker, con scrubbing de datos personales.
- [ ] Dockerfile por proceso (API y worker), imágenes en GHCR, deploy automático desde GitHub Actions a Dokploy; front en Vercel.
- [ ] Redis en Dokploy: con contraseña, sin exposición pública, AOF y `maxmemory-policy noeviction`, volumen en el backup del VPS.
- [ ] HTTPS y dominio de la API vía Traefik; variables de entorno por ambiente.
- [ ] Backups: PITR activado en Supabase y **restauración probada al menos una vez** en un ambiente de prueba.
- [ ] Health checks y logs estructurados sin datos sensibles.

### Después del MVP (según el plan)
Presupuestos y planes de tratamiento, pagos y cuenta corriente, recetas, consentimientos, lista de espera. Fuera de alcance por ahora: billing y planes, panel super-admin, white label, app nativa, facturación electrónica, liquidación a obras sociales, reserva online pública.

## 5. Faltantes que no estaban en el plan de fases (detectados en el camino)

- [ ] **Gestión de usuarios y membresías.** El plan dice que `admin` gestiona usuarios, pero **no hay ni API ni pantalla** para invitar usuarios, asignarles rol o desactivarlos. Hoy las membresías se crean solo con el seed o a mano en la base.
- [ ] **Recuperación de contraseña** y cambio de contraseña desde la app.
- [ ] **README** con instrucciones de instalación, variables de entorno y scripts (hoy solo existe `PLAN.md`).
- [ ] **Tests E2E con Playwright** de los 3 flujos críticos que pide la sección 9 del plan: crear turno, crear paciente, enviar recordatorio. No hay ninguno.
- [ ] **Pantalla para consultar el audit log** (hoy se escribe pero no se puede ver).
- [ ] **Normalizar el celular al guardar** el paciente (hoy se limpia pero se guarda sin código de país, y se convierte a `+549…` recién al enviar). Un número sin código de área se rechaza al recordar.
- [ ] Zona horaria de la web: `format.ts` usa la constante de Argentina en la ficha del paciente en lugar de la zona de la clínica.

## 6. Deuda técnica y mejoras

- [x] **Tests de base lentos** (~7 min por la latencia hacia Supabase). Resuelto con un Postgres descartable en Docker: `pnpm test:local`. Ver la sección "Tests" del README cuando exista.
- [ ] Si más adelante hiciera falta acelerar más: juntar los dos `set_config` en una consulta y compartir la transacción entre la validación de membresía y el servicio (reduce viajes a la base también en producción; toca el núcleo de seguridad, por eso no se hizo).
- [ ] **Build de producción de la API** (`tsc -p tsconfig.build.json`) nunca se probó: los paquetes del workspace se importan como TypeScript. Probablemente haga falta empaquetar (tsup/esbuild) al armar los Dockerfiles.
- [ ] Agregar `.gitattributes` (`* text=auto eol=lf`) para acabar con los avisos de fin de línea (CRLF/LF) de git en Windows.
- [ ] Logs: hoy hay solo `console.log`/`console.error` mínimos, sin formato estructurado ni identificador de request.
- [ ] Supabase Auth: usuarios demo (`admin@` y `profesional@demo.odontotrust.test`) quedan creados en tu proyecto de desarrollo; borrarlos si el proyecto se reutiliza para algo real.
- [ ] El pooler de Supabase (Supavisor) cachea credenciales: tras cambiar la contraseña de `app_user` puede tardar 1–2 minutos en aceptarla.
- [ ] Agenda: la vista semana muestra un solo profesional a la vez; la vista día muestra varios lado a lado. Evaluar si hace falta otra combinación.
- [ ] Documentación de decisiones: solo existe un ADR mínimo en `docs/adr/`. Faltan ADR de RLS/`withTenant`, validación JWT con JWKS, manejo de zona horaria y el modelo de WhatsApp.

## 7. Orden sugerido

1. Crear el repo en GitHub, decidir el CI y cerrar la Fase 0 (CI verde).
2. Probar la agenda y los recordatorios en tu celular y anotarme lo que se sienta mal.
3. Decidir el modelo de WhatsApp y arrancar el trámite con Meta (corre en paralelo).
4. Gestión de usuarios, README y E2E (sección 5): bloquean tener a más gente usando el sistema.
5. Fase 4b (con proveedor simulado mientras Meta aprueba).
6. Fase 5, Fase 6 y, al final, Fase 7 (deploy).
