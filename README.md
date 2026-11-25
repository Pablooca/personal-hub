# Personal Hub — Life OS

Centro de mando personal y privado: **agenda, proyectos, estudios, finanzas, running y Pokémon competitivo** en un solo sitio.
React + TypeScript en el frontend y **Supabase** (PostgreSQL + Auth + Row Level Security) como backend. Se puede desplegar gratis en Vercel o Cloudflare Pages.

> **Pruébala sin cuenta:** en la pantalla de acceso pulsa **«Probar demo interactiva»**. El modo demo carga datos ficticios en `localStorage` y no hace ninguna petición a la base de datos.

---

## Funcionalidades

| Módulo | Qué hace |
| --- | --- |
| **Resumen** | Agenda de hoy con checklist, próximos 7 días, proyectos activos con su progreso, finanzas del mes, **tasa de ahorro acumulada del año** y captura rápida de tareas y gastos. |
| **Agenda** | Vistas de mes y semana (rejilla horaria, fila de «todo el día» y línea de «ahora»), categorías por colores con filtro (incluidas **Vacaciones** y **Festivo**) y checklist del día. **Eventos repetidos**: eliges días de la semana y un rango (p. ej. L–J 8:00–17:30) y se crean de golpe como una serie, que luego puedes editar o borrar entera. Los **festivos oficiales** del BOE (nacionales, Andalucía y C. Valenciana) se muestran siempre en el calendario. Al crear una serie solo se saltan los que afectan a su categoría (**Máster** → nacionales + C. Valenciana; **resto**, incluido Trabajo → nacionales + Andalucía, configurable), y en su lugar se añade un evento «Festivo». |
| **Proyectos** | Cartera de proyectos en tarjetas o lista, con filtros por estado y área. Cada proyecto tiene su propia página con descripción, fechas de inicio y fin, cronograma, subtareas (cada una con estado, prioridad, fechas de inicio y fin y descripción), progreso (manual o calculado a partir de las subtareas), notas técnicas y enlace al repositorio. |
| **Tareas** | Kanban (Por hacer · En curso · En revisión · Hecho) con las subtareas de todos los proyectos más tareas sueltas de **Trabajo** y **Personal**. Filtros por categoría o proyecto, arrastrar y soltar, clave de Jira opcional (escribe `PLAT-142 Título` y se separa sola) y registro de horas desde cada tarjeta. |
| **Estudios** | **Programas** (p. ej. Máster) → **asignaturas** con créditos ECTS. Cada asignatura tiene su **evaluación**: entregas y exámenes, cada uno con su % de la nota, su nota y su fecha y hora, con la nota actual, la media hasta ahora, **qué necesitas sacar en lo que queda** para tu objetivo y nota oficial opcional. Los programas muestran la **media ponderada por ECTS** y los créditos aprobados. **Apuntes en PDF** (hasta 50 MB) por tema, guardados en almacenamiento privado. Las entregas y los exámenes pueden añadirse a la Agenda y avisan por Telegram (ver más abajo). |
| **Horas** | Diario de trabajo: qué hiciste cada día, cuántas horas y en qué issue de Jira. Resalta los días laborables sin registrar, calcula el total por issue y genera una **hoja de horas issue × día** que puedes copiar o exportar a CSV para imputar en Jira a final de mes. |
| **Finanzas** | Registro rápido de ingresos, gastos y ahorro, **varias cuentas bancarias con una cuenta principal**, saldo por cuenta y patrimonio, **categorías propias**, KPIs del mes, tasa de ahorro anual, evolución de 12 meses, movimientos filtrables con exportación a CSV y bandeja **«Por revisar»** para los pagos de Apple Pay sin categoría. |
| **Running & Race Prep** | **Carrera objetivo** (10K, media, maratón o personalizada) con ritmo objetivo automático. **Planning semanal** con editor rápido (copiar y repetir semanas) o importación CSV/JSON, y registro de entrenamientos (distancia, tiempo o ritmo, FC, RPE). **Toda sesión tiene calentamiento, bloque principal y enfriamiento**: bloques con repeticiones, recuperación y objetivo por serie o por km (`5 min cal + 4x30s cortas rec 30s + 5-6x800 en 4:30 rec 3 min + 5 min enf`), **repeticiones en colina** (subida, recuperación y bajada), plantillas reutilizables y tiempo de cada serie. El semáforo **«¿Voy bien preparado?»** combina adherencia y volumen, proyección de marca con Riegel (`T2 = T1 · (D2/D1)^1.06`) y cumplimiento de sesiones clave, con alertas de ritmo y fatiga. |
| **Pokémon Competitive** | **Torneos** TCG y VGC ronda a ronda (suizo y Top Cut con su propio formato BO1/BO3, que siempre se pregunta), dado y turno de salida, rivales TCG por **iconos de arquetipo** (o «Otro» con 1–2 Pokémon) y constructor VGC de hasta 4 Pokémon. **Calculadora Play! Pokémon** (rondas oficiales, puntos de corte y simulador de abandonos en vivo), **biblioteca de mazos** (60 cartas, PTCGL/Limitless), **equipos VGC** (Showdown/Pokepaste, EVs o Stat Points) y **estadísticas** con matriz de emparejamientos. |
| **Copia y sin conexión** | Exportar e importar JSON (todo, solo Pokémon o solo Running; importar nunca borra). Con sesión iniciada, una copia local abre la app al instante y los cambios hechos sin cobertura se envían en orden al recuperar la red. |
| **Apple Pay** | Una Edge Function de Supabase recibe cada pago hecho con Apple Pay desde un Atajo de iPhone y lo registra como gasto, categorizado automáticamente. |

Los festivos y los días de vacaciones tampoco cuentan como «sin registrar» en **Horas**.

También incluye: modo claro/oscuro, barra lateral colapsable en escritorio, navegación inferior en móvil (con las zonas seguras del iPhone), interfaz optimista con rollback y sincronización en tiempo real entre dispositivos.

## Stack

- **React 19 + Vite + TypeScript** (modo estricto)
- **Tailwind CSS v4** con tokens de diseño en variables CSS, y las fuentes `Plus Jakarta Sans` + `JetBrains Mono`
- **lucide-react** para los iconos
- **@supabase/supabase-js**: Auth (email + contraseña), PostgREST y Realtime
- **Supabase Edge Functions** (Deno) para el webhook de Apple Pay

## Arquitectura

```
src/
├── App.tsx                 # máquina de estados de sesión: loading → login | supabase | demo
├── data/
│   ├── repository.ts       # interfaz Repository + implementaciones Supabase y Local (demo)
│   ├── hybrid.ts           # copia local + cola de cambios sin conexión sobre Supabase
│   ├── pokemon/            # especies, metajuego y datos de Champions (generados con scripts/)
│   └── demoSeed.ts         # datos sintéticos generados en relación con «hoy»
├── state/                  # DataProvider (CRUD optimista + realtime), tema y toasts
├── lib/                    # tipos, fechas, finanzas, categorías, formato (es-ES)
├── components/             # Shell, Login, EventModal, primitivas de UI
└── views/
    ├── Overview.tsx · Calendar.tsx · Projects.tsx · ProjectDetail.tsx · Tasks.tsx · Hours.tsx
    ├── pokemon/            # torneos, calculadora, mazos, equipos, estadísticas
    ├── running/            # preparación, planning, entrenamientos
    └── finance/            # FinanceView, Ledger, TxForms, Manage (cuentas y categorías)
supabase/
├── schema.sql              # tablas, restricciones, índices, RLS, RPC y realtime (idempotente)
└── functions/apple-pay-webhook/
    ├── index.ts            # handler HTTP: auth, validación, cuenta, deduplicado, inserción
    └── normalize.ts        # funciones puras: importe, fecha y reglas de categoría
```

La interfaz solo habla con un `Repository`. El modo demo y la base de datos real comparten todos los componentes; lo único que cambia es la implementación que se inyecta.

### Modelo de datos

`events` · `projects` · `project_tasks` · `transactions` · `categories` · `accounts` · `work_logs` · `study_programs` · `study_subjects` · `study_assessments` · `study_files` · `tcg_decks` · `vgc_teams` · `tournaments` · `tournament_rounds` · `race_goals` · `run_plan` · `runs` · `run_workouts`

- `project_tasks` alimenta el Kanban de tareas: o pertenece a un proyecto (`project_id`) o es una tarea suelta con `category` (`work` / `personal`). `status` e `is_done` se mantienen sincronizados mediante un trigger.
- `events.series_id` agrupa los eventos creados con «Repetir»; `events.all_day` marca los de todo el día.
- Los festivos oficiales están en [`src/lib/holidays.ts`](src/lib/holidays.ts), extraídos de las resoluciones del BOE (BOE-A-2025-21667 para 2026 y BOE-A-2026-21254 para 2027). Para otros años se calculan los nacionales fijos más el Viernes Santo. Los festivos locales de tu municipio se añaden como eventos «Festivo».
- `work_logs` guarda cada entrada del diario de horas (`date`, `hours`, `description`, `jira_key`, `task_id` opcional).

- Los importes siempre son positivos y el `type` indica el signo: `income` (ingreso), `expense` (gasto) o `investment` (en la interfaz aparece como **Ahorro**).
- Un movimiento de **Ahorro** es una transferencia desde la cuenta principal hacia la cuenta en la que se registra.
- **Tasa de ahorro** = (ingresos − gastos) / ingresos. Lo que mueves a ahorro cuenta como ahorrado.
- **Saldo inicial:** para traer lo que ya tenías, registra un *Ingreso* con categoría `Saldo inicial` el **31/12** del año anterior en cada cuenta. Suma al saldo de la cuenta, pero no cuenta como ingreso, así que no altera la tasa de ahorro.

## Puesta en marcha

### 1. Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. En **SQL Editor**, pega [`supabase/schema.sql`](supabase/schema.sql) y ejecútalo. Es idempotente: vuelve a ejecutarlo cada vez que se actualice el esquema.
3. En **Authentication → Users → Add user → Create new user**, crea tu usuario con email y contraseña, marcando *Auto Confirm User*. Si solo vas a usarla tú, puedes desactivar el registro público en **Authentication → Providers → Email**.

### 2. Desarrollo local

```bash
cp .env.example .env      # rellena la URL del proyecto y la anon key
npm install
npm run dev               # http://localhost:5173
```

| Variable | Dónde encontrarla |
| --- | --- |
| `VITE_SUPABASE_URL` | Project Settings → API → Project URL (`https://<ref>.supabase.co`, **sin** `/rest/v1`) |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → clave `anon` `public` |

Si faltan las variables, la app compila igualmente pero solo ofrece el modo demo.

### 3. Despliegue

- **Vercel:** importa el repositorio (preset Vite) y añade las dos variables. `vercel.json` ya redirige las rutas a la SPA.
- **Cloudflare Pages:** comando de build `npm run build`, directorio de salida `dist`, y añade las dos variables. `public/_redirects` se encarga del enrutado de la SPA.
- **GitHub Pages:** el workflow [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) compila y publica en cada push a `main`.
  1. En **Settings → Pages**, elige como fuente **GitHub Actions**.
  2. En **Settings → Secrets and variables → Actions**, crea `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. Si no existen, se publica solo el modo demo.
  3. El `base` de Vite se calcula solo: `/<repo>/`. En local se puede forzar con `VITE_BASE_PATH`.

> En cualquier despliegue público, desactiva el registro de usuarios en Supabase (**Authentication → Providers → Email → Allow new users to sign up**). Si no, cualquiera podría crearse una cuenta con tu anon key y guardar datos en tu proyecto, aunque RLS le impediría ver los tuyos.

---

## Apple Pay → registro automático de gastos

Cada vez que pagas con Apple Pay, una **automatización personal** de la app Atajos envía el importe, el comercio y la tarjeta a la Edge Function `apple-pay-webhook`. La función:

1. Valida la cabecera `Authorization: Bearer <APPLE_PAY_WEBHOOK_SECRET>` con una comparación de tiempo constante. Si no coincide, responde `401`.
2. Normaliza el importe (`"14,50 €"`, `"1.234,56 €"`, `"14.50"`…) y la fecha (ISO, `22/11/2026`, `22 nov 2026`… y, si no se entiende, usa la fecha de hoy en `Europe/Madrid`).
3. Categoriza el gasto por palabras clave del comercio. Ejemplos: `MERCADONA` → Supermercado, `RENFE`/`UBER` → Transporte, `AMAZON` → Compras. Si ninguna regla coincide, lo marca como `uncategorized`. Las reglas están en [`normalize.ts`](supabase/functions/apple-pay-webhook/normalize.ts) y se pueden ampliar.
4. Elige la cuenta: la que coincida con el nombre de la tarjeta; si no hay ninguna, tu **cuenta principal**; y si tampoco existe, el nombre de la tarjeta.
5. Descarta los duplicados (mismo importe, comercio y fecha en los últimos 2 minutos), inserta el gasto en `transactions` y devuelve:

```json
{ "ok": true, "message": "Registrado: 14,50 € en MERCADONA (Supermercado)" }
```

Los pagos sin categoría aparecen en **Finanzas** con el badge **«Por revisar»**. Se pueden categorizar en un clic desde la propia tabla, o pulsando la fila para editar el concepto.

### Tests

```bash
npm run test:webhook   # node:test sobre supabase/functions/tests/ (webhook + Telegram; también: deno test)
```

### Despliegue de la función (Supabase CLI)

```bash
# 0. Instala la CLI e inicia sesión
brew install supabase/tap/supabase
supabase login

# 1. Genera un secreto largo y guárdalo (lo necesitarás en el Atajo)
openssl rand -hex 32

# 2. Configura los secretos de la función
#    <project-ref>: el subdominio de tu URL (https://<project-ref>.supabase.co)
#    OWNER_USER_ID: Authentication → Users → tu usuario → User UID
supabase secrets set --project-ref <project-ref> \
  APPLE_PAY_WEBHOOK_SECRET=<secreto-generado> \
  OWNER_USER_ID=<tu-user-uuid> \
  TIMEZONE=Europe/Madrid

#    (alternativa) cp supabase/functions/.env.example supabase/functions/.env, rellénalo y:
#    supabase secrets set --project-ref <project-ref> --env-file supabase/functions/.env

# 3. Despliega (sin verificación JWT: la función se autentica con su propio secreto)
supabase functions deploy apple-pay-webhook --no-verify-jwt --project-ref <project-ref>

# 4. Prueba
curl -X POST "https://<project-ref>.supabase.co/functions/v1/apple-pay-webhook" \
  -H "Authorization: Bearer <secreto-generado>" \
  -H "Content-Type: application/json" \
  -d '{"amount":"14,50 €","merchant":"MERCADONA","card":"Visa","date":""}'
```

`SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` las inyecta Supabase automáticamente en las Edge Functions. **No** las pongas en el `.env` del frontend.

### Configurar el Atajo en el iPhone

1. Abre **Atajos** → pestaña **Automatización** → **＋ / Nueva automatización**.
2. Elige **Transacción**.
   - **Cuando toque:** selecciona tus tarjetas de Wallet (y, si quieres, filtra por categorías o comercios).
   - Marca **Ejecutar inmediatamente** y desactiva *Notificar al ejecutarse*, porque ya mostrarás tu propia notificación.
   - Pulsa **Siguiente** → **Nueva automatización en blanco**.
3. Añade la acción **Obtener contenido de URL**:
   - **URL:** `https://<project-ref>.supabase.co/functions/v1/apple-pay-webhook`
   - Toca **Mostrar más** → **Método:** `POST`
   - **Encabezados:**
     - `Authorization` → `Bearer <secreto-generado>`
     - `Content-Type` → `application/json`
   - **Cuerpo de la solicitud:** `JSON`, con **una sola clave**:
     | Clave | Tipo | Valor |
     | --- | --- | --- |
     | `payload` | *Diccionario* (o *Texto*) | variable mágica **Entrada del atajo** |

     La función acepta lo que iOS mande en `payload`:
     - un objeto con claves en español o inglés (`Importe`/`Amount`, `Comercio`/`Merchant`, `Tarjeta o cartera`/`Card or Pass`, `Fecha`/`Date`…; sin distinguir mayúsculas ni tildes);
     - ese mismo objeto como texto JSON, si elegiste el tipo *Texto*;
     - una frase como `14,50 € en MERCADONA con DEBITO SMART`, `Pago de 14,50 € en MERCADONA` o `DEBITO SMART: 14,50 € en MERCADONA`.

     También sigue aceptando campos planos (`amount`, `merchant`, `card`, `date`), útiles para probar con `curl`.
4. Añade **Obtener valor del diccionario** → clave `message` → del *Contenido de la URL*.
5. Añade **Mostrar notificación** con el *Valor del diccionario*.
6. Guarda. Haz un pago de prueba y comprueba que aparece en Finanzas.
7. Para ver exactamente qué envió tu tarjeta (y cómo se interpretó):
   ```bash
   supabase functions logs apple-pay-webhook
   ```
   Cada petición autenticada registra `Incoming Apple Pay body: …` y `apple-pay-webhook: parsed {source, amount, merchant, card, date, category}`.

> 💡 Si llamas a tus cuentas en la app igual que a tus tarjetas en Wallet (p. ej. «Visa Nómina»), cada pago se asignará a la cuenta correcta.

---

## Notificaciones por Telegram

- **Cada gasto que entra por Apple Pay** → mensaje al instante, enviado por `apple-pay-webhook` tras registrarlo. Las importaciones y los gastos manuales no avisan.
- **Eventos con hora** → avisos **10 y 5 minutos antes** y **al terminar**.
- **Entregas de Estudios** (no marcadas como hechas ni calificadas) → avisos **1 día, 3 h, 1 h, 30 min y 5 min antes** (`DELIVERY_REMINDERS="1440,180,60,30,5"`).
- **Exámenes de Estudios** → avisos **1 mes, 2 semanas, 1 semana, 2 días, 1 día, 3 h y 1 h antes** (`EXAM_REMINDERS="43200,20160,10080,2880,1440,180,60"`). Si añades un examen con menos margen, el aviso que corresponda salta en ese momento con el tiempo real que queda. `pg_cron` llama cada minuto a la función `telegram-notify` y `notification_log` garantiza que cada aviso se envía una sola vez. Los eventos de todo el día no avisan.

Configuración (una vez):

1. En Telegram, habla con **@BotFather** → `/newbot` → guarda el *token*. Escribe cualquier cosa a tu bot nuevo.
2. Obtén tu *chat id* hablando con **@userinfobot**.
3. Guarda ambos como secretos de las funciones:
   ```bash
   supabase secrets set TELEGRAM_BOT_TOKEN=<token> TELEGRAM_CHAT_ID=<chat-id>
   ```
4. Despliega y conecta la base de datos (la URL y la clave compartida van en **Vault**, nunca en el repo):
   ```bash
   supabase functions deploy telegram-notify --no-verify-jwt
   openssl rand -hex 32                     # → <notify-secret>
   supabase secrets set NOTIFY_SECRET=<notify-secret>
   # SQL Editor:
   #   select vault.create_secret('https://<ref>.supabase.co/functions/v1/telegram-notify', 'telegram_notify_url');
   #   select vault.create_secret('<notify-secret>', 'telegram_notify_secret');
   ```
5. Ejecuta `supabase/schema.sql` (crea `notification_log` y la tarea de `pg_cron`). Prueba: `select public.notify_telegram('{"kind":"test"}');`

Opcional: `EVENT_REMINDERS="15,5"` y `DELIVERY_REMINDERS="1440,180,60,30,5"` cambian los minutos de aviso; `TIMEZONE` (por defecto `Europe/Madrid`).

## Modelo de seguridad

- **Row Level Security en todas las tablas.** Las políticas de `SELECT`, `INSERT`, `UPDATE` y `DELETE` exigen `auth.uid() = user_id`. `project_tasks` además comprueba que el proyecto padre sea del mismo usuario.
- La **anon key es pública por diseño**: va en el bundle de cualquier app de Supabase. Por sí sola no puede leer nada, porque todas las políticas están limitadas al rol `authenticated` y al propietario de cada fila.
- La **service-role key solo existe dentro de la Edge Function**, nunca en el frontend. Esa función solo escribe filas de `OWNER_USER_ID` y con columnas controladas por el servidor (`type = 'expense'`), protegida con un secreto compartido.
- `.env` y `.env.*` están en `.gitignore`. Solo se suben los `.env.example` vacíos.
- El modo demo no hace ninguna petición a Supabase.
- La exportación CSV neutraliza la inyección de fórmulas (prefijos `=`, `+`, `-`, `@`).

## Scripts

| Comando | |
| --- | --- |
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Comprobación de tipos (`tsc -b`) y build de producción |
| `npm run preview` | Sirve el build de producción en local |
| `npm run typecheck` | Solo comprobación de tipos |
| `npm test` | Tests unitarios (notas de Estudios, webhook de Apple Pay y mensajes de Telegram) |

## Datos de Pokémon

`node scripts/build-pokemon-data.mjs [SET] [FORMATO]` (p. ej. `DLR TEF-DLR`) regenera `src/data/pokemon/` con el metajuego de Limitless y la legalidad de Pokémon Champions según Pokémon Showdown. Ejecútalo cuando salga una expansión o cambie la regulación. Los sprites y las cartas se cargan desde Limitless y Showdown; no se guardan en el repositorio.

Rondas: *Play! Pokémon Tournament Rules Handbook* (mayo de 2026). CP: temporada 2027. Pokémon es una marca de Nintendo, Creatures y GAME FREAK; este proyecto no está afiliado.

## Licencia

MIT
