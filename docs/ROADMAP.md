# Firexp — Roadmap

Dos capas de mejora, complementarias:
- **Parte A · Producto** — el *qué* (features inspiradas en referentes del género).
- **Parte B · Fundamentos técnicos** — el *cómo* (arquitectura que hace A robusto y demostrable).

Comparten infraestructura: `packages/story-graph`, `RoomState` en el relay y la tabla `sessions`.

**Orden recomendado:** B#1 → B#2 → B#3 (fundamentos) habilitan A#1–A#3 (features que lucen en demo).
**A#4** (validación de decisiones falsas) es prioridad absoluta: separa "reproductor ramificado" de "plataforma".

---

# Parte A · Backlog de producto

### A0 · Base compartida (habilita A1–A3)
- [ ] DynamoDB: persistir cada `log_entry` en `sessions` (ver B#3).
- [ ] content-api: agregados `GET /episodes/:id/stats` (% por opción).
- [ ] types/relay: contrato de ventana con `tally` + voto revocable.

### A1 · Tally en vivo + voto revocable + cuenta regresiva  ·  *Twitch/Jackbox · 2–3 d*
Hace que la demo con varios teléfonos se sienta viva.
- [ ] relay: broadcast del `tally` a la sala en cada `vote`.
- [ ] phone: contador de votos en vivo + cuenta regresiva visible.
- [ ] phone: **voto revocable** hasta el cierre (re‑tap cambia el voto).
- [ ] phone: "última llamada" a 3s → `navigator.vibrate()`.

### A2 · Host + lobby + rol audiencia  ·  *Jackbox · 1–2 d*
Cierra el hueco del cuestionario multi‑viewer con una regla de una frase.
- [ ] relay: primer teléfono = **host (VIP)** (start/skip/pause).
- [ ] phone: nombre/avatar por viewer + pantalla de lobby.
- [ ] engine: quien entra tras `episode_start` = **audiencia** (vota, no re‑perfila flags).
- [ ] relay: expiración de sala tras N min sin TV.

### A3 · "% de salas eligió X" + grafo con tu ruta  ·  *Telltale · 1–2 d (usa A0)*
Rejugabilidad + argumento de impacto.
- [ ] phone: al cerrar ventana → "tu sala eligió A · el 62% de las salas eligió B".
- [ ] phone (Library/What‑if): grafo del episodio con tu ruta iluminada y ramas no vistas atenuadas.

### A4 · Validación de "decisiones falsas" en el CMS  ·  *Kinoautomat · 1 d*  ⭐
El diferencial ante un jurado que conoce Eko.
- [ ] dashboard (flow): marcar decisiones cuyos `set` no afectan ningún `when` río abajo.
- [ ] usar el análisis estático de `packages/story-graph` (`findInconsequentialDecisions`).

### A5 · Dead‑ends con retroceso  ·  *Bandersnatch · 1 d*
Más sesión sin más video.
- [ ] types/CMS: distinguir `ending: true` (cierra sesión) vs `deadEnd: true` (retrocede).
- [ ] StoryEngine: dead‑end → "volver a la última decisión" sin resetear flags.
- [ ] dashboard: nodo dead‑end en el editor de flujo.

### A6 · Perfil de espectador en Library  ·  *Kahoot · 0.5 d*
Algo personal para llevarse; casi gratis.
- [ ] phone (Votes → perfil): "votaste violento 80% · tu sala 50/50"; badge "rebelde".
- [ ] relay: `viewer` en cada voto del `log_entry` (para coincidencia con la mayoría).

### A7 · Analytics de rama para creadores  ·  *Eko · 2–3 d*
Argumento de Impacto (si el pitch lidera con el cliente creador).
- [ ] content-api: viewers/sesión, drop‑off por capítulo, distribución de votos, finales alcanzados.
- [ ] dashboard: vista de analytics (usa `sessions`).

### A8 · Contexto pasivo tipo X‑Ray  ·  *Prime Video · 1 d*
"X‑Ray te informa; Firexp te da el control."
- [ ] phone (entre decisiones): personaje en pantalla + la flag en juego; metadata ligera en `watching`.

---

# Parte B · Fundamentos técnicos

### B1 · `packages/story-graph` puro + AST + fixtures  ·  *3 d*
Habilita: validación CMS, simulador, tests, Open Source. **El cambio que más rinde.**
- [ ] `packages/story-graph` (TS, sin I/O): `evaluateWhen`, `selectVariant`, `applySet`, `resolveVotes`, `findShadowedVariants`, `findInconsequentialDecisions`, `reachableEndings`.
- [ ] Condiciones `when`: **string → AST JSON** (`{ all: [{flag,op,value}] }`); el dashboard muestra la forma legible.
- [ ] Consumidores: content-api (**422** al guardar inválido), dashboard (simulador + warnings), tests.
- [ ] **Paridad TS↔Kotlin** por `fixtures/*.json` (`{graph,flags,votes,expected}`) → vitest + JUnit del `StoryEngine`.
- [ ] Tipos Kotlin **generados** (zod → JSON Schema → quicktype), no espejo manual.
- [ ] Publicar `@fire-stick/story-graph` (npm + README) → **Open Source**.

### B2 · Relay con memoria (sigue tonto)  ·  *2 d*
Habilita: tally, host/lobby, entrada tardía.
- [ ] `RoomState = { hostViewerId, phase, lastWatching, openWindow?{decision,closesAt,tally}, viewers }`.
- [ ] En `assigned`: reenviar `lastWatching` + `openWindow` → entrada tardía sin tocar la TV.
- [ ] Validar cada mensaje entrante con **zod `safeParse`** (descartar + loguear).
- [ ] **Reloj de referencia = relay**: ping/pong (3 muestras, mediana) → offset; `closesAt` en tiempo del relay.
- [ ] `log_entry`/`story_end` → relay reenvía por HTTP a content-api (`POST /sessions/:id/decisions`); la TV nunca habla con DynamoDB.
- [ ] Nube (opcional, **no antes del video**): API GW WebSocket + Lambda + tabla de conexiones.

### B3 · DynamoDB `sessions` con contadores atómicos  ·  *1.5 d*
Habilita: "% eligió X", grafo con tu ruta, analytics.
- [ ] `firexp-sessions` single-table: `META`, `DECISION#<ch>#<dec>`, `AGG#<episodeId>#<decisionId>/OPTION#<optionId>` con `UpdateItem ADD count :1` en la misma escritura.
- [ ] GSI `byEpisode` (`episodeId → startedAt`).
- [ ] `GET /episodes/:id/stats` → query de `AGG#` (no scan).

### B4 · TV — dos cambios quirúrgicos  ·  *1.5 d*
Robustez visible en demo.
- [ ] **Media3 `PreloadManager`** (≥1.3) en vez de caché manual: ranking por probabilidad (variante que va ganando el tally) + liberación automática.
- [ ] Transición sin corte: `addMediaItem` + `seekToNext` (no nuevo `MediaSource`); MP4 con `+faststart` (sin HLS).
- [ ] Catálogo con `androidx.tv.material3` (foco/D‑pad) — migrar solo esa pantalla si el resto es Compose genérico.
- [ ] Fallback en `onPlayerError`: `selectVariant(flags, variants sin la fallida)` → default → siguiente capítulo. Nunca negro.

### B5 · Phone — reconexión y feedback físico  ·  *1 d*
Demo sin fallos con 3 teléfonos.
- [ ] `viewerId` en `sessionStorage` + reconexión con backoff; el relay reconoce el id.
- [ ] `navigator.vibrate` (3s + cierre) + **Wake Lock API** (pantalla no se apaga).
- [ ] Store mínimo (nanostores/zustand vanilla), sin React (arranque rápido tras el QR).
- [ ] **Web Share API** para el perfil de espectador.

### B6 · Bedrock — salida estructurada  ·  *1.5 d*
AWS Builder defendible.
- [ ] **Converse API con tool-use / JSON schema** → `options[]` como `{label,set}` validado contra `packages/types`.
- [ ] Modelo pequeño (Nova Lite / Haiku) — es autoría, no runtime.
- [ ] Caché DynamoDB con clave = `hash(prompt + modelo + versión de schema)`.
- [ ] **Recap final** de la ruta de la sala (3 frases desde `log_entry`) → único toque de IA al espectador.

### B7 · Limpieza que el jurado nota  ·  *0.5 d*
- [ ] Quitar **MySQL** de `docker-compose.yml` (nadie lo usa).
- [ ] **`npm run dev` único** en la raíz (turbo/concurrently): DynamoDB Local + content-api + relay + dashboard.
- [ ] **CI GitHub Actions**: `vitest` (story-graph + fixtures) + `./gradlew test` (paridad). Badge en README.

---

## No tocar
Hono · DynamoDB · S3/CloudFront · CDK · React Flow — bien elegidos; cambiarlos no mueve ningún criterio.

## Estimación
~11 días para 2–3 personas → deja ~2 semanas para contenido + video (lo que realmente puntúa).
