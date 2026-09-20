# @fire-stick/types

Contratos TypeScript compartidos para el sistema de narrativa ramificada. Fuente única de verdad para todos los mensajes WebSocket y el esquema del grafo de historia.

Consumido por `apps/fire-tv`, `apps/relay` y `apps/phone`.

---

## Instalación (dentro del monorepo)

Ya enlazado vía npm workspaces. No se necesita paso de instalación.

```ts
import type { GestureMsg, StoryGraph, LogEntry } from '@fire-stick/types';
```

---

## Mensajes WebSocket

### `GestureMsg` — Teléfono → Relay → TV

```ts
interface GestureMsg {
  type: 'gesture';
  room: string;
  viewer: number;
  action: Action;
  confidence: number;  // 0–1, mínimo 0.7 para contar como voto válido
  ts: number;          // Date.now() en el teléfono
}
```

### `JoinMsg` — Teléfono → Relay (al conectar)

```ts
interface JoinMsg {
  type: 'join';
  room: string;
}
```

Manejado al momento de la conexión vía el query param `?room=`. Los `join` duplicados se ignoran.

### `AssignedMsg` — Relay → Teléfono

```ts
interface AssignedMsg {
  type: 'assigned';
  viewer: number;  // slot numérico (1, 2, 3…)
  color: string;   // color hex para el punto de este espectador en el overlay del TV
}
```

### `WindowOpenMsg` — TV → Teléfonos

```ts
interface WindowOpenMsg {
  type: 'window_open';
  options: Action[];   // acciones válidas para este punto de decisión
  duration: number;    // ms que la ventana permanece abierta
}
```

Los teléfonos resetean su flag `emitted` al recibir este mensaje.

### `WindowClosedMsg` — TV → Teléfonos

```ts
interface WindowClosedMsg {
  type: 'window_closed';
  chosen: Action | 'default';  // 'default' = empate o sin votos
}
```

---

## Tipo `Action`

```ts
type Action =
  | 'hands_up'
  | 'crouch'
  | 'lean_forward'
  | 'cover_eyes'
  | 'point_left'
  | 'point_right'
  | 'stand_up';
```

---

## Tipos de historia

El modelo no es un árbol sino **acumulación de banderas**. Cada decisión muta banderas numéricas, y cada capítulo elige su variante evaluando esas banderas.

### `Flags` y `FlagSet`

```ts
type Flags   = Record<string, number>;       // estado mutable: { violento: 1, confiado: -1 }
type FlagSet = Record<string, string|number>; // mutación: { "violento": "+1", "confiado": 0 }
```

`FlagSet`: valores en string son relativos (`"+1"`, `"-1"`); números son absolutos.

### `StoryVariant`

```ts
interface StoryVariant {
  in: number;    // tiempo de inicio en el MP4 concatenado (segundos)
  out: number;   // tiempo de fin (segundos)
  when: string;  // condición evaluada contra Flags, o "default"
  tag?: string;  // etiqueta para la biblioteca (ej. "confrontacion")
}
```

**Sintaxis de `when`:** `"flag >= N"`, `"flag <= N"`, `"flag > N"`, `"flag < N"`, `"flag == N"`. Combina con `&&`. La última variante de cada capítulo **debe** ser `"default"`.

### `DecisionOption` y `DecisionDefault`

```ts
interface DecisionOption {
  gesture: Action;
  label: string;
  set: FlagSet;  // banderas a mutar si esta opción gana
}

interface DecisionDefault {
  set: FlagSet;  // banderas a mutar si nadie gana (empate o vacío)
}
```

### `ChapterDecision`

```ts
interface ChapterDecision {
  at: number;        // segundos desde el inicio del archivo cuando se abre la ventana
  window: number;    // duración de la ventana de decisión (ms)
  prompt?: string;   // texto que se muestra en el overlay
  options: DecisionOption[];
  default: DecisionDefault;  // obligatorio — nunca dejar el demo congelado
}
```

### `StoryChapter`

```ts
interface StoryChapter {
  id: string;
  title: string;
  variants: StoryVariant[];  // evaluadas en orden; gana la primera cuyo when es true
  decision?: ChapterDecision;  // omitir en capítulos finales
}
```

### `StoryGraph`

```ts
interface StoryGraph {
  video: string;     // nombre del archivo MP4 concatenado
  title: string;
  flags: Flags;      // valores iniciales de todas las banderas
  chapters: StoryChapter[];
}
```

---

## Tipos de la biblioteca de historias

### `LogEntry`

Registro de una decisión dentro de una sesión:

```ts
interface LogEntry {
  chapter: string;
  votes: VoteRecord[];
  chosen: Action | 'default';
  margin: number;              // diferencia entre primer y segundo lugar (0 = empate)
  flagsAfter: Flags;           // estado de banderas después de aplicar esta decisión
  variantPlayed: string;       // tag de la variante que se reprodujo
  ts: number;
}

interface VoteRecord {
  viewer: number;
  action: Action;
}
```

### `RoomSession`

Estado completo de una sala, persistido por el relay:

```ts
interface RoomSession {
  id: string;
  title: string;               // título de la historia para mostrar en la biblioteca
  flags: Flags;                // estado actual de las banderas
  log: LogEntry[];
  closedAt?: string;           // ISO string, cuando la historia termina
  inheritedFrom?: string;      // id de la sesión de la que se heredaron las banderas
}
```

---

## Tipos union

```ts
type PhoneMsg = GestureMsg | JoinMsg;
type TvMsg    = WindowOpenMsg | WindowClosedMsg;
type RelayMsg = AssignedMsg;
type AnyMsg   = PhoneMsg | TvMsg | RelayMsg;
```

Úsalos como discriminated unions con `switch (msg.type)`.

---

## Build

```bash
npm run build       # tsc → dist/
npm run dev         # tsc --watch
npm run check-types # type-check sin emitir
```

La salida en `dist/` incluye `.js`, `.d.ts` y `.d.ts.map`.
