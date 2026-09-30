# Pendientes de OdontoTrust

Estado al 2026-09-30. Este documento junta **todo lo que falta** para terminar la plataforma, ordenado por quién tiene que actuar. El plan completo está en `PLAN.md`; los criterios de aceptación de cada fase están en su sección 5.

## Dónde estamos

| Fase | Estado |
|---|---|
| 0. Setup del monorepo | Hecha (falta ver el CI en verde en GitHub) |
| 1. Base de datos, RLS y auth | Hecha |
| 2. Pacientes | Hecha |
| 3. Agenda y turnos | Hecha (falta probarla en pantalla real) |
| 4a. Recordatorios con link de WhatsApp | Hecha |
| 4b. Recordatorios automáticos | **Sin empezar** (espera una decisión tuya) |
| 5. Evoluciones clínicas y archivos | **Sin empezar** |
| 6. Odontograma | **Sin empezar** |
| 7. PWA, hardening y deploy | **Sin empezar** |
| Gestión de usuarios (fuera de las fases) | Hecha |

Tests: 139 pasan. `pnpm test:local` corre toda la suite en ~11 s contra un Postgres descartable en Docker; el CI usa un Postgres como servicio.

## Orden sugerido

1. **Probar la app en el navegador y en el celular** y anotar lo que se sienta mal (sección 3). Es lo más urgente: solo verifiqué por HTTP.
2. **Arrancar el trámite de WhatsApp Business en Meta** (corre en paralelo, tarda días).
3. **Fase 5** (historia clínica y archivos): es lo que más necesita una odontóloga.
4. **Fase 7, parte de deploy y seguridad**: sin esto solo corre en tu computadora.
5. **Fase 6** (odontograma).
6. **Fase 4b**, cuando Meta esté aprobado y confirmes el modelo de WhatsApp.
7. En paralelo a lo anterior: README, tests E2E, "Olvidé mi contraseña", Resend (sección 5).

---

## 1. Decisiones tuyas (bloquean trabajo)

- [ ] **Modelo de WhatsApp para la Fase 4b.** Propuesta pendiente de confirmar: un solo número tuyo para todas las clínicas, con conteo de mensajes por clínica para poder cobrarles.
  - A favor: un solo trámite con Meta, plantillas aprobadas una vez, sin credenciales por clínica.
  - En contra: el paciente ve tu número y no el del consultorio; si Meta baja la calidad del número se caen todas las clínicas a la vez; los límites de envío son compartidos.
  - Recomendación: modelo híbrido (número de plataforma por defecto y la interfaz `MessagingProvider` lista para que una clínica use el suyo).
  - Esto **reemplaza** lo que dice `PLAN.md` en 4b ("configuración de WhatsApp por clínica"), así que hay que actualizar el plan.
- [ ] **Confirmar con Meta si permite este uso** (un negocio enviando en nombre de terceros con su propio número) antes de cobrar por los mensajes. Yo no puedo asegurarlo.
- [ ] **Agenda del profesional.** Hoy un profesional ve por defecto su agenda, pero puede ver la de todos con el selector. El plan dice "ve su agenda". ¿Se restringe también en el servidor?
- [ ] **Pacientes del profesional.** El plan dice que el profesional ve "sus pacientes". Hoy ve todos los de la clínica. ¿Se restringe?
- [ ] **Reglas que asumí y hay que confirmar:**
  - Borrar un paciente: solo `admin` y `profesional` (no `recepcion`).
  - Una sola cobertura (obra social) por paciente.
  - Un turno puede no tener sillón.
  - Sin horarios cargados, un profesional no tiene restricción de horario.

## 2. Cosas que tenés que hacer vos

- [ ] **Verificar que el CI quede en verde** en GitHub (el workflow ya tiene un Postgres como servicio). Con eso se cierra la aceptación de la Fase 0.
- [ ] **Iniciar el trámite de WhatsApp Business en Meta** (cuenta de negocio verificada, número y plantillas aprobadas).
- [ ] **Resetear la contraseña de la base de Supabase** (la pegaste en el chat) y actualizar `DATABASE_URL_MIGRATIONS` y `DATABASE_URL` en el `.env`.
- [ ] **Actualizar `.env.example`** (no pude editarlo por tu regla de permisos):
  - quitar `SUPABASE_JWT_SECRET` (ya no se usa: se valida con JWKS),
  - agregar `API_URL=http://localhost:4000`, `APP_USER_PASSWORD=`, `WEB_URL=http://localhost:3000`, `RESEND_API_KEY=` y `EMAIL_FROM=`.
- [ ] **Docker Desktop abierto** para correr `pnpm test:local` y, más adelante, Redis para la Fase 4b.
- [ ] Recordar que `pnpm db:seed` **cambia la contraseña de los usuarios demo** en cada corrida y la imprime al final.
- [ ] Para producción: cargar `SUPABASE_SERVICE_ROLE_KEY` y `WEB_URL` como variables de entorno de la API (nunca en Vercel).

## 3. Sin verificar en pantalla real

Probé todo esto con tests y con sesiones reales contra la API, pero **nunca en un navegador**:

- [ ] Agenda: crear un turno en **3 clics o menos** tocando un horario vacío.
- [ ] Agenda: **drag & drop** en desktop y "mantener apretado" en celular; que el movimiento se sienta instantáneo y vuelva atrás si el servidor lo rechaza.
- [ ] Agenda: vista semana en desktop, franjas fuera de horario sombreadas, bloqueos rayados.
- [ ] Recordatorio: que el botón abra WhatsApp con el mensaje listo (celular y navegador; ojo con bloqueadores de ventanas).
- [ ] Pacientes: **buscar y abrir una ficha en 2 pasos** desde el celular.
- [ ] Usuarios: invitar → abrir el link en otra ventana privada → botón "Continuar" → elegir contraseña → entrar.
- [ ] Un usuario con **más de una clínica** (selector de clínica): implementado, nunca probado con datos reales.
- [ ] `docker compose up redis` y que el worker conecte (Fase 0).

## 4. Fases que faltan

### Fase 4b: recordatorios automáticos
Depende de la decisión de la sección 1.
- [ ] Cola BullMQ + proceso `worker` con un job repetible que busque turnos a 24–48 h.
- [ ] Interfaz `MessagingProvider` con un proveedor simulado para probar sin Meta, y luego el real (WhatsApp Cloud API).
- [ ] Plantillas de Meta aprobadas (los recordatorios son mensajes iniciados por el negocio, exigen plantilla).
- [ ] Idempotencia (un turno recibe **un solo** recordatorio aunque el worker se reinicie), reintentos con backoff y registro del resultado. La tabla `recordatorios` ya existe con `idempotency_key`.
- [ ] Webhook de respuestas que actualiza el estado del turno. Con un número compartido, usar **botones de respuesta rápida que lleven el ID del turno** en vez de adivinar por teléfono.
- [ ] **Conteo de mensajes por clínica** (para poder cobrar). La facturación en sí sigue fuera del MVP.
- [ ] Tests de idempotencia y de reintentos (requieren Redis).
- [ ] Aceptación: un turno a 24 h recibe exactamente un recordatorio; el estado se actualiza al responder.

### Fase 5: evoluciones clínicas y archivos
- [ ] Tabla `evoluciones` **append-only** con versionado (una corrección crea una versión nueva que referencia la anterior); sin edición ni borrado.
- [ ] Tabla `archivos` y subida a Supabase Storage con bucket privado, ruta `clinica_id/paciente_id/...` y **URLs firmadas de corta duración** generadas por el backend.
- [ ] Visor simple de imágenes en la ficha.
- [ ] Audit log de **lectura y escritura** de evoluciones.
- [ ] Permisos: `recepcion` sin acceso a evoluciones (ya está en la matriz como `clinico:*`).
- [ ] Aceptación: no se puede editar ni borrar una evolución; un archivo de la clínica A no es accesible desde B ni sin URL vigente.

### Fase 6: odontograma
- [ ] Componente SVG propio, táctil y responsive: 32 dientes permanentes (y opción de temporales), por diente y por cara.
- [ ] Registro de estados con **historial por fecha** (append-only), tabla `odontograma_registros`.
- [ ] Catálogo de estados/hallazgos configurable por clínica.
- [ ] Panel inferior en celular, lateral en desktop.
- [ ] Aceptación: registrar un hallazgo en 3 toques; ver el odontograma en una fecha pasada.

### Fase 7: PWA, hardening y deploy
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

## 5. Faltantes que no estaban en el plan de fases

- [x] **Gestión de usuarios** (hecho): `/usuarios` para invitar con un link de un solo uso, cambiar rol, desactivar y reactivar. Siempre queda al menos un admin activo.
  - [ ] **Configurar Resend** (`RESEND_API_KEY` y `EMAIL_FROM`, con un dominio verificado) para que el link salga también por email. Mientras tanto el admin lo copia y lo manda por WhatsApp.
  - [ ] Las membresías creadas por el seed no tienen `email` guardado (se completa desde Supabase Auth al listar).
- [ ] **"Olvidé mi contraseña"** desde el login. El cambio estando logueado ya existe ("Mi contraseña"). Necesita endpoint público, envío de email y rate limiting (Fase 7).
- [ ] **README** con instrucciones de instalación, variables de entorno y scripts (hoy solo existe `PLAN.md`).
- [ ] **Tests E2E con Playwright** de los 3 flujos críticos que pide la sección 9 del plan: crear turno, crear paciente, enviar recordatorio. No hay ninguno.
- [ ] **Pantalla para consultar el audit log** (hoy se escribe pero no se puede ver).
- [ ] **Normalizar el celular al guardar** el paciente (hoy se limpia pero se guarda sin código de país, y se convierte a `+549…` recién al enviar). Un número sin código de área se rechaza al recordar.
- [ ] Zona horaria de la web: `format.ts` usa la constante de Argentina en la ficha del paciente en lugar de la zona de la clínica.

## 6. Deuda técnica y mejoras

- [x] **Tests de base lentos** (~7 min por la latencia hacia Supabase): resuelto con `pnpm test:local` (Postgres en Docker, ~11 s) y un Postgres como servicio en el CI.
- [ ] Si más adelante hiciera falta acelerar más: juntar los dos `set_config` en una consulta y compartir la transacción entre la validación de membresía y el servicio (reduce viajes a la base también en producción; toca el núcleo de seguridad, por eso no se hizo).
- [ ] **Build de producción de la API** (`tsc -p tsconfig.build.json`) nunca se probó: los paquetes del workspace se importan como TypeScript. Probablemente haga falta empaquetar (tsup/esbuild) al armar los Dockerfiles.
- [ ] Agregar `.gitattributes` (`* text=auto eol=lf`) para acabar con los avisos de fin de línea (CRLF/LF) de git en Windows.
- [ ] Logs: hoy hay solo `console.log`/`console.error` mínimos, sin formato estructurado ni identificador de request.
- [ ] Supabase Auth: los usuarios demo (`admin@` y `profesional@demo.odontotrust.test`) quedan creados en tu proyecto de desarrollo; borrarlos si el proyecto se reutiliza para algo real.
- [ ] El pooler de Supabase (Supavisor) cachea credenciales: tras cambiar la contraseña de `app_user` (por ejemplo al correr `pnpm db:migrate`) la API puede no arrancar durante 1–2 minutos. Reiniciarla.
- [ ] Agenda: la vista semana muestra un solo profesional a la vez; la vista día muestra varios lado a lado. Evaluar si hace falta otra combinación.
- [ ] Documentación de decisiones: solo existe un ADR mínimo en `docs/adr/`. Faltan ADR de RLS/`withTenant`, validación JWT con JWKS, manejo de zona horaria, invitaciones de usuarios y el modelo de WhatsApp.
- [ ] Claude Code: Bash falla a veces con "auto mode classifier gave no verdict" (problema transitorio del servicio). `.claude/settings.json` tiene reglas de permisos para comandos de solo lectura; puede hacer falta reiniciar la sesión para que las tome.
