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
│           └── rooms.module.ts       # Rutas: GET /rooms, GET /rooms/:id, GET /rooms/:id/whatif, POST /rooms
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
| `GET` | `/api/v1/rooms/:code/whatif?at=cap2&option=0` | Proyección de camino alternativo desde un capítulo |
| `POST` | `/api/v1/rooms` | Crea sala nueva; acepta `{ inherit: "K7P2" }` para continuar banderas de otra sesión |
| `GET` | `/phone/*` | Sirve el build estático de `apps/phone` |

### POST /api/v1/rooms — body

```json
{
  "code":    "K7P2",      // opcional, se genera si se omite
  "title":   "Historia",  // opcional
  "inherit": "PREV"       // opcional, hereda banderas de esa sesión (continuidad entre episodios)
}
```

### GET /api/v1/rooms/:code/whatif — body

El story graph debe enviarse en el body para que el relay pueda proyectar:

```json
{ "story": { /* StoryGraph completo */ } }
```

Devuelve `{ data: { projectedPath: ["Cap 2 — sigilo", "Cap 3 — final_b"] } }`.

---

## Protocolo WebSocket

Conecta con `ws://localhost:3001?room=K7P2`. Reemplaza `K7P2` con el código de sala de 4 caracteres que muestra la TV.

### Al conectar

El relay envía inmediatamente la asignación:

```json
{ "type": "assigned", "viewer": 1, "color": "#e74c3c" }
```

### Enviar un gesto

```json
{
  "type":       "gesture",
  "room":       "K7P2",
  "viewer":     1,
  "action":     "hands_up",
  "confidence": 0.91,
  "ts":         1757692800000
}
```

El relay reenvía esto a todos los demás clientes de la misma sala (incluida la app de Fire TV).

### Mensajes `join`

```json
{ "type": "join", "room": "K7P2" }
```

Manejados al momento de la conexión vía `?room=`. Los `join` duplicados se ignoran.

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

## Nota sobre HTTPS

El cliente del teléfono usa `getUserMedia` (cámara) y `DeviceMotion` (acelerómetro), que los navegadores bloquean sin HTTPS, excepto en `localhost`. Para pruebas en la red local con un dispositivo real, usa `mkcert`:

```bash
brew install mkcert
mkcert -install
mkcert localhost 192.168.1.x
```

Conecta los `.pem` resultantes en el `createServer` de `main.ts`.
