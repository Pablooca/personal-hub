# Personal Hub — Life OS

Centro de mando personal y privado: **agenda, proyectos y finanzas** en un solo sitio.
React + TypeScript en el frontend y **Supabase** (PostgreSQL + Auth + Row Level Security) como backend. Se puede desplegar gratis en Vercel o Cloudflare Pages.

> **Pruébala sin cuenta:** en la pantalla de acceso pulsa **«Probar demo interactiva»**. El modo demo carga datos ficticios en `localStorage` y no hace ninguna petición a la base de datos.

---

## Funcionalidades

| Módulo | Qué hace |
| --- | --- |
| **Resumen** | Agenda de hoy con checklist, próximos 7 días, proyectos activos con su progreso, finanzas del mes, **tasa de ahorro acumulada del año** y captura rápida de tareas y gastos. |
| **Agenda** | Vistas de mes y semana (rejilla horaria con solapamientos y línea de «ahora»), categorías por colores con filtro, crear/editar/eliminar eventos y checklist del día seleccionado. |
| **Proyectos** | Tablero Kanban (arrastrar y soltar) y vista de lista. Cada proyecto tiene su propia página con descripción, fechas de inicio y fin, cronograma, subtareas/hitos editables, progreso (manual o calculado a partir de las subtareas), notas técnicas y enlace al repositorio. |
| **Finanzas** | Registro rápido de ingresos, gastos y ahorro, **varias cuentas bancarias con una cuenta principal**, saldo por cuenta y patrimonio, **categorías propias**, KPIs del mes, tasa de ahorro anual, evolución de 12 meses, movimientos filtrables con exportación a CSV y bandeja **«Por revisar»** para los pagos de Apple Pay sin categoría. |
| **Apple Pay** | Una Edge Function de Supabase recibe cada pago hecho con Apple Pay desde un Atajo de iPhone y lo registra como gasto, categorizado automáticamente. |

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
│   └── demoSeed.ts         # datos sintéticos generados en relación con «hoy»
├── state/                  # DataProvider (CRUD optimista + realtime), tema y toasts
├── lib/                    # tipos, fechas, finanzas, categorías, formato (es-ES)
├── components/             # Shell, Login, EventModal, primitivas de UI
└── views/
    ├── Overview.tsx · Calendar.tsx · Projects.tsx · ProjectDetail.tsx
    └── finance/            # FinanceView, Ledger, TxForms, Manage (cuentas y categorías)
supabase/
├── schema.sql              # tablas, restricciones, índices, RLS, RPC y realtime (idempotente)
└── functions/apple-pay-webhook/
    ├── index.ts            # handler HTTP: auth, validación, cuenta, deduplicado, inserción
    └── normalize.ts        # funciones puras: importe, fecha y reglas de categoría
```

La interfaz solo habla con un `Repository`. El modo demo y la base de datos real comparten todos los componentes; lo único que cambia es la implementación que se inyecta.

### Modelo de datos

`events` · `projects` · `project_tasks` · `transactions` · `categories` · `accounts`

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
   - **Cuerpo de la solicitud:** `JSON`, con estos campos de tipo *Texto*:
     | Clave | Valor (variable mágica de *Entrada del atajo* / *Transacción*) |
     | --- | --- |
     | `amount` | **Importe** |
     | `merchant` | **Comercio** |
     | `card` | **Tarjeta o pase** (nombre de la tarjeta) |
     | `date` | **Fecha actual** → toca la variable → *Formato de fecha:* **ISO 8601** |
4. Añade **Obtener valor del diccionario** → clave `message` → del *Contenido de la URL*.
5. Añade **Mostrar notificación** con el *Valor del diccionario*.
6. Guarda. Haz un pago de prueba y comprueba que aparece en Finanzas.

> 💡 Si llamas a tus cuentas en la app igual que a tus tarjetas en Wallet (p. ej. «Visa Nómina»), cada pago se asignará a la cuenta correcta.

---

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

## Licencia

MIT
