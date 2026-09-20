# relay

Relay WebSocket para el sistema de narrativa ramificada. Corre en la red local — sin nube en el loop de control.

Los teléfonos se conectan vía WebSocket y envían eventos de gesto. El relay reenvía cada mensaje a todos los demás miembros de la misma sala. La app de Fire TV conecta a la misma sala y recibe esos eventos. No procesa mensajes, no tiene lógica de negocio — solo broadcast y persistencia de sesión.

---

## Stack

- **Hono.js** — servidor HTTP (health, stats de salas, servir el cliente del teléfono)
- **ws** — servidor WebSocket adjunto al mismo puerto HTTP
- **@fire-stick/types** — contratos de mensajes y tipos de sesión (`GestureMsg`, `AssignedMsg`, `LogEntry`, etc.)

Sigue la misma estructura en capas que el resto del monorepo: `config/` → `common/` → `modules/`.

---

## Estructura

```
relay/
├── src/
│   ├── main.ts                       # Entrada: Hono serve() + WebSocketServer en el mismo puerto
│   ├── app.ts                        # Rutas Hono: /, health, /api/v1/rooms, /phone/*
│   ├── app.types.ts                  # AppEnv (vacío — sin variables de sesión)
│   ├── config/
│   │   ├── config.ts                 # Config singleton (puerto, CORS, log level)
│   │   ├── logger.ts                 # Logger con tags de contexto
│   │   ├── types.ts                  # Interface ILogger
│   │   └── index.ts
│   ├── common/
│   │   ├── exceptions/               # HttpException + subclases + handleException()
│   │   └── interfaces/               # IApiResponse, IApiErrorResponse
│   └── modules/
│       └── rooms/
│           ├── rooms.types.ts        # RoomClient, RoomState, RoomStats
│           ├── rooms.service.ts      # join / leave / broadcast / pushLog / whatIf / persist
│           └── rooms.module.ts       # Rutas: GET /rooms, GET /rooms/:code, POST /rooms, POST /rooms/:code/{whatif,questionnaire}
├── public/                           # Build de apps/phone servido en /phone/*
├── rooms/                            # Sesiones persistidas como JSON (generado en runtime)
├── esbuild.config.js
├── jest.config.js
├── eslint.config.js
├── tsconfig.json
├── tsconfig.test.json
├── .env.example
└── package.json
```

---

## Variables de entorno

Copia `.env.example` a `.env` y ajusta:

```env
NODE_ENV=development
PORT=3001
DEBUG=true
```

Para producción, agrega también:

```env
CORS_ORIGINS=https://tu-dominio.com
```

---

## Correr

```bash
# Desarrollo (watch mode)
npm run dev

# Build
npm run build

# Iniciar el build
npm start
```

---

## HTTP API

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/` | Ping — `{ service: "relay", status: "ok" }` |
| `GET` | `/api/v1/health` | Health check |
| `GET` | `/api/v1/rooms` | Stats de todas las salas (activas + cerradas en disco) |
| `GET` | `/api/v1/rooms/:code` | Stats + log completo de una sala |
| `POST` | `/api/v1/rooms/:code/whatif` | Proyección de camino alternativo (story graph en el body) |
| `POST` | `/api/v1/rooms/:code/questionnaire` | Recibe respuestas del cuestionario → aplica flags → broadcast `episode_start` |
| `POST` | `/api/v1/rooms` | Crea sala nueva; acepta `{ inherit: "K7P2" }` para continuar banderas de otra sesión |
| `GET` | `/health` · `/phone/*` · `/tv-sim/*` · `/videos/*` · `/images/*` | Health, web del teléfono, simulador de TV y media estática |

### POST /api/v1/rooms — body

```json
{
  "code":    "K7P2",      // opcional, se genera si se omite
  "title":   "Historia",  // opcional
  "inherit": "PREV"       // opcional, hereda banderas de esa sesión (continuidad entre episodios)
}
```

### POST /api/v1/rooms/:code/whatif — body

El story graph debe enviarse en el body para que el relay pueda proyectar:

```json
{ "story": { /* StoryGraph completo */ } }
```

Devuelve `{ data: { projectedPath: ["Cap 2 — sigilo", "Cap 3 — final_b"] } }`.

---

## Protocolo WebSocket

Conecta con `ws://localhost:3001?room=K7P2` (teléfono) o `?room=K7P2&role=tv`
(la TV; no cuenta como espectador). El relay valida cada mensaje con zod y es un
reenviador "tonto"; la lógica de decisión vive en la TV (StoryEngine).

### Al conectar (teléfono)

El relay asigna slot/color y hace catch‑up de entrada tardía:

```json
{ "type": "assigned", "viewer": 1, "color": "#e74c3c" }
```

### Mensajes (protocolo de votos)

| Dirección | `type` | Descripción |
|---|---|---|
| relay → sala | `episode_start` | cuestionario listo → `{ chapterId, flags }` |
| TV → relay → teléfonos | `window_open` / `window_closed` | abre/cierra ventana de decisión |
| teléfono → relay → TV | `vote` | un espectador eligió una opción (revocable) |
| relay → sala | `tally` | conteo de votos en vivo |
| TV → relay → teléfonos | `watching` | capítulo/variante en reproducción |
| relay → teléfono | `window_open_sync` | catch‑up de ventana abierta (entrada tardía) |
| TV → relay | `log_entry` / `story_end` | persistido en DynamoDB vía content‑api |
| ambos | `ping` / `pong` | el relay es el reloj de referencia |

Los esquemas viven en `@fire-stick/types` (`schemas.ts`). El `join` se maneja por
la query `?room=`; los duplicados se ignoran.

---

## Ciclo de vida de una sala

1. Se crea la primera vez que un cliente conecta con un código dado (o vía `POST /api/v1/rooms`).
2. Los espectadores reciben números (1, 2, 3…) y colores de una paleta fija.
3. Cuando el último cliente desconecta, la sala se elimina de memoria pero **su sesión persiste en disco** (`rooms/K7P2.json`).
4. Los códigos son case-insensitive (normalizados a mayúsculas internamente).

---

## Persistencia de sesiones

Las sesiones se guardan en `rooms/<CODE>.json` con escritura atómica:

```
rooms/
  K7P2.json     # sesión activa o cerrada
  index.json    # generado automáticamente por allStats()
```

Escritura atómica: `writeFileSync(tmp)` → `renameSync(tmp, dest)`. Nunca se corrompe el archivo si el proceso muere a medio demo.

El relay también carga sesiones desde disco en `allStats()` y `whatIf()`, por lo que el historial de sesiones anteriores está disponible aunque el proceso se haya reiniciado.

---

## Nota sobre HTTPS / `wss://`

El teléfono es solo votos + cuestionario (no usa cámara ni acelerómetro), así que
sirve por HTTP con `ws://` en dev (emulador / LAN). Para un despliegue público se
necesita **TLS** (`wss://` vía ACM + dominio, o un ALB con certificado); ver la
nota de "Development posture & cost trade-offs" en `infra/cdk/README.md`.
