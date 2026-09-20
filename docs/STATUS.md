# Firexp — Estado del proyecto

Snapshot del estado real y del progreso contra los planes (`ROADMAP.md`, `SUBMISSION.md`).
Leyenda: ✅ hecho · 🟡 parcial · ⬜ pendiente.

_Última actualización: sesión de ejecución multi‑agente (Wave 1 + Wave 2 completas)._

---

## 1. Estado actual — qué funciona hoy

**Demo jugable de punta a punta, verificada en el emulador Fire TV:**
catálogo (DynamoDB) → QR → lobby con progreso de cuestionario → `episode_start` →
la TV reproduce video real y ramifica por votos → distintos finales → `story_end`.

- **TV** reproduce **solo video** (sin UI de decisión), con **contenido distinto por rama**
  (Jellyfish / Big Buck Bunny / Sintel / Sample) y **fallback sin negro** ante clips incompatibles.
- **Decisiones en el teléfono**: tally en vivo, voto revocable, "% de salas eligió X".
- **Backend**: content‑api sobre **DynamoDB** (series/episodes/sessions), relay con `RoomState`,
  media self‑hosted (`/videos`, `/images`), S3/CloudFront + Bedrock como infra (IaC, sin desplegar).

**Corriendo en local:** DynamoDB Local · content‑api (dynamo) · relay. Arranque: `npm run dev`.

---

## 2. Sistema base implementado (capa por capa)

| Capa | Estado |
|---|---|
| **TV (fire-hack)** — StoryEngine autónomo, ExoPlayer, catálogo con thumbnails de fondo, QR con IP separada (emulador vs físico), sin mock, multiformato + fallback, precarga | ✅ |
| **phone** — web sin instalar, cuestionario, decisión (limpia, sin emojis), Library | ✅ |
| **relay** — WS por sala, sirve phone + media, proxy de catálogo/stats, `RoomState`/host/tally/late‑join/zod/ping‑pong | ✅ |
| **content-api** — CRUD series/episodios sobre DynamoDB, presign S3 (single/multipart), sessions/stats/recap, validación 422 | ✅ |
| **content-dashboard** — React+shadcn, editor de flujo (React Flow), simulador con story‑graph, uploads, tema Firexp light/dark | ✅ |
| **prompt-generator** — Bedrock + caché DynamoDB (Lambda) | ✅ |
| **packages/types** — contratos + schemas zod | ✅ |
| **packages/story-graph** — motor puro + AST + validación (72 tests) | ✅ |
| **infra/cdk** — DynamoDB (series/episodes/sessions/prompts) + S3 + CloudFront(OAC) + Bedrock IAM + Lambda + HTTP API (dos stacks) | ✅ (no desplegado) |

---

## 3. Roadmap técnico (Parte B)

| # | Tarea | Estado | Nota |
|---|---|---|---|
| **B1** | `packages/story-graph` puro + AST + fixtures | ✅ | 72 tests; paridad Kotlin por fixtures = ⬜ (falta el test JUnit espejo) |
| **B2** | relay `RoomState` + reloj de referencia + zod | ✅ | host, late‑join sync, ping/pong, safeParse |
| **B3** | DynamoDB `sessions` (AGG atómico) + `/stats` | ✅ | tabla + GSI + proxy en relay; verificado |
| **B4** | TV `PreloadManager` + fallback sin negro | 🟡 | fallback ✅; se **mantuvo** el preload por CacheWriter (no `DefaultPreloadManager`); migración `tv.material3` del catálogo ⬜ |
| **B5** | phone reconexión + vibración + wake‑lock | 🟡 | phone ✅; **dedup de `viewerId` en el relay** ⬜ (el phone lo envía, el relay lo ignora) |
| **B6** | Bedrock salida estructurada + recap | 🟡 | recap ✅ (Bedrock + fallback); tool‑use del prompt‑generator ya existía; caché por `hash(prompt+modelo+schema)` ⬜ |
| **B7** | Limpieza: MySQL fuera, `dev` único, CI, LICENSE, README EN, `.env.example` | ✅ | `dev.sh`/CI validados por sintaxis, no ejecutados en largo |

---

## 4. Backlog de producto (Parte A)

| # | Tarea | Estado | Nota |
|---|---|---|---|
| **A0** | Base: sessions + `/stats` + contrato de tally | ✅ | — |
| **A1** | Tally en vivo + voto revocable + cuenta regresiva | ✅ | verificado (dos viewers votando) |
| **A2** | Host + lobby + rol audiencia | 🟡 | host ✅ + lobby ✅ + late‑join ✅; **modo audiencia con peso/regla explícita** ⬜; controles de host (start/skip/pause) ⬜ |
| **A3** | "% de salas eligió X" + grafo con tu ruta | 🟡 | "% de salas" en el phone ✅; **grafo con ruta iluminada en Library** ⬜ |
| **A4** | Validación de "decisiones falsas" en el CMS | ✅ | badges "No consequence"/shadowed + 422 |
| **A5** | Dead‑ends con retroceso | ⬜ | requiere tipo de nodo + retroceso en StoryEngine |
| **A6** | Perfil de espectador en Library | ⬜ | los votos se registran; falta la vista de perfil |
| **A7** | Analytics de rama para creadores | ⬜ | datos ya en `sessions` + GSI `byEpisode`; falta la vista |
| **A8** | Contexto pasivo tipo X‑Ray | ⬜ | — |

---

## 5. Entrega / hackathon (`SUBMISSION.md`)

| Bloque | Estado | Nota |
|---|---|---|
| **A · Contenido** (guion, clips, encoding) | 🟡 | hay **clips de prueba distintos** cableados por rama; falta el **episodio demo producido** (guion propio, 3 finales, encoding faststart) |
| **B · Video demo** (<3 min, inglés) | ⬜ | requiere grabar con Fire TV + 3 teléfonos |
| **C · Devpost** (formulario, feedback por herramienta, portada) | ⬜ | requiere cuenta + consulta a Devpost |
| **D · Repo listo** | 🟡 | LICENSE ✅ · README EN ✅ · `.env.example` ✅ · CI ✅ · MySQL fuera ✅ · `npm run dev` ✅ · **APK en Releases** ⬜ · "What we built (fechas)" ⬜ · "AWS integration" diagrama ⬜ · check de secretos en historial ⬜ · **Open Source npm/PR** ⬜ |

---

## 6. Deuda técnica / notas menores

- **No desplegado en AWS**: todo corre local (DynamoDB Local, relay, content‑api). El deploy (CDK — dos stacks) está listo pero requiere tu OK y habilitar acceso a modelos Bedrock en consola.
- **relay = local** (WebSocket) en dev. Ya existe `FirexpRelayStack` (CDK, no desplegado): **dev = 1 task Fargate con IP pública, sin ALB ni NAT** (~$9/mes, se localiza con `infra/scripts/relay-ip.sh`); **prod = ALB + NAT + task privada** (~$57/mes). La decisión dev↔prod está documentada en `infra/cdk/README.md`.
- **IP LAN por DHCP**: `Config.RELAY_HOST/PHONE_HOST` se editan a mano si cambia la IP (recomendado reservar IP en el router).
- phone/CSS usa un token `--dim` no definido en su `:root` (cae a color heredado) — cosmético.
- Los clips 1080p@60 exceden el decoder por software del emulador (ahora con fallback **no crashea**).
- `docker compose` levanta solo `dynamodb-local` (MySQL removido).

---

## 7. Próximos pasos sugeridos (orden de impacto)

1. **A3** grafo con tu ruta en Library + **A6** perfil de espectador (baratos, alto valor de demo; datos ya existen).
2. **A2** modo audiencia + controles de host (cierra la regla multi‑viewer).
3. **A7** vista de analytics para creadores (argumento de impacto ante el jurado).
4. **Contenido** (bloque A de submission) — el episodio demo real es el cuello de botella para el video.
5. Publicar `@fire-stick/story-graph` en npm (Open Source) + consulta a Devpost.
