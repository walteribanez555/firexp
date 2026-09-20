# Firexp — Narrativa interactiva ramificada para Fire TV

Cuatro personas en un sofá. La serie llega a una bifurcación y cada "¿qué harías *tú*?" se queda
callado en la cabeza de una sola persona. Todo intento previo fue individual — Bandersnatch le da
un mando a una persona; X-Ray informa a quien sostiene el teléfono pero no le da poder y no
involucra a los demás. **Firexp lo invierte: la sala decide, y nadie mira una pantalla que no sea la TV.**

> Twitch enseñó a las audiencias a decidir juntas. X-Ray le enseñó a Amazon que la segunda pantalla
> pertenece a la sala. **Firexp es la serie donde la sala vota desde sus teléfonos y la TV nunca se rompe.**

### Qué hace

1. La Fire TV muestra un episodio; aparece un **QR** — cada espectador abre una web en el teléfono, sin instalar.
2. Un **cuestionario** corto fija el perfil de la sala (flags numéricos).
3. Mientras la historia corre, las decisiones aparecen **solo en los teléfonos**; se **vota** (tally en vivo, revocable hasta que cierra el timer).
4. La **TV nunca muestra UI de decisión** — reproduce video continuo y corta en silencio a la rama que eligió la sala. Distintas salas llegan a distintos finales, y luego: "tu sala eligió A · 62% de las salas eligió B" + un recap de **Bedrock/Nova**.

**Track:** Fire TV (Fire OS / Android) · **Mini challenges:** AWS Builder (Bedrock) · Open Source

---

## 1. Concepto (lógica de negocio)

Un episodio no es un video lineal: es un **grafo** de clips (variantes) conectados por decisiones.
El público construye su versión de la historia:

1. **Cuestionario inicial** → fija un perfil (flags numéricos).
2. Durante la reproducción aparecen **decisiones** que se votan desde el teléfono.
3. Cada decisión **muta los flags**, y los flags **eligen qué clip se reproduce** a continuación.
4. El árbol de condiciones lleva a **distintos finales**.

> En una frase: *el cuestionario perfila, cada decisión muta flags, los flags eligen el clip, y el
> árbol de condiciones lleva a distintos finales — la TV es el reproductor/cerebro y el teléfono es
> el control de decisiones.*

---

## 2. Cómo lo construimos (arquitectura)

```
                 ┌───────────────── DynamoDB ─────────────────┐
                 │   series · episodes (grafo) · prompt-cache  │
                 └───────────────────▲─────────────────────────┘
                                     │
        ┌──────────────┐   HTTP {data}│        ┌──────────────────┐
        │ content-api  │◀─────────────┘        │ prompt-generator │  (Bedrock)
        │ (stateless)  │  S3 presign/multipart │   (stateless)    │
        └──────▲───────┘        │              └──────────────────┘
   CONTENT_API │                ▼
        ┌──────┴───────┐    ┌───────┐        ┌─────────────────────┐
        │    RELAY     │    │  S3   │──CDN──▶│  CloudFront (video) │
        │ WS + estático│    └───────┘        └─────────────────────┘
        │  /videos /phone
        └───▲───────▲──┘
   WebSocket│       │HTTP + WS
     ┌──────┴──┐  ┌─┴────────┐
     │ fire-hack│  │  phone   │  (web, sin instalar)
     │   (TV)   │  │ (físico) │
     └──────────┘  └──────────┘
```

| Componente | Tipo | Rol |
|---|---|---|
| **fire-hack** (Android/Kotlin/Compose) | app TV | El "director": reproduce (ExoPlayer), corre el `StoryEngine`, abre decisiones, tabula votos, elige la rama. |
| **phone** (`apps/phone/web`, TS+Vite) | web servida por el relay | El espectador escanea un QR, responde el cuestionario y **vota**. Sin instalar. |
| **relay** (Hono + `ws`) | tiempo real | Reenvía mensajes por sala, sirve el phone y el media (`/videos`,`/images`), proxifica el catálogo. **Sin lógica de negocio.** |
| **content-api** (Hono) | stateless | Fuente de verdad del contenido sobre **DynamoDB**; presigned URLs (single/multipart) para subir a **S3**. |
| **content-dashboard** (React + shadcn) | CMS | Crea series/episodios, edita el **flujo** (React Flow) y sube videos por variante. |
| **prompt-generator** (Hono/Lambda) | stateless | Genera los textos de decisión con **Bedrock**, con caché en DynamoDB. |
| **packages/types** | librería | Contratos compartidos (`@fire-stick/types`) entre relay, phone, content-api y (espejo) la TV. |

---

## 3. Modelo de datos

```
Series → Episodes → Chapters → { Variants, Decisions }
```

- **Flags** — contadores numéricos (`violent`, `confident`, `united`, …). Arrancan del cuestionario
  y mutan con cada decisión (`"+1"`/`"-1"` = relativo, número = absoluto).
- **Variant** — un clip de video por rama: `{ in, out, when, tag, videoUrl }`. `when` es una
  condición sobre flags (`violent >= 1`, `confident <= -2 && united >= 1`). **La última variante es
  siempre `when: "default"`.**
- **Decision** — `phase: "pre"` (antes del capítulo) o `"during"` (a un timestamp `at`), con
  `options: [{ gesture, label, set }]` (donde `set` muta flags) y un `default` si nadie vota.

Selección de variante: se evalúa `when` **de arriba a abajo; gana la primera** que cumple (si
ninguna, `default`).

---

## 4. Flujo end-to-end

```
TV: catálogo (DynamoDB) → seleccionas episodio → muestra QR (IP LAN del relay)
Teléfono: escanea QR → se une a la sala (WebSocket) → cuestionario
   → POST /rooms/:code/questionnaire → relay aplica flags → broadcast "episode_start"
TV: StoryEngine arranca → reproduce la variante del cap. 1 (ExoPlayer)
   → en cada decisión: envía "window_open" SOLO al teléfono (no hay overlay en la TV)
Teléfono: muestra la decisión → vota ("vote")
TV: tabula votos → resuelve (mayoría; empate/sin votos = default) → aplica flags
   → "window_closed" + "log_entry" → elige y reproduce la siguiente variante
     (precargada → sin buffering) ... repite hasta el final → "story_end"
Teléfono: Library (Journey / Votes / What-if)
```

**Principio de diseño:** el relay es tonto, **la TV es el cerebro**, y **la TV no muestra UI de
decisión** — solo video continuo; toda la decisión vive en el teléfono ("todo por detrás").

### Contrato de mensajes (WebSocket)
| Dirección | `type` | Uso |
|---|---|---|
| teléfono → relay → TV | `vote` | El espectador eligió una opción |
| TV → relay → teléfonos | `window_open` / `window_closed` | Abre/cierra una decisión |
| TV → relay → teléfonos | `watching` | Capítulo/variante en reproducción |
| TV → relay | `log_entry` / `story_end` | Persistir decisión / fin |
| relay → sala | `assigned` / `viewer_left` | Alta/baja de un viewer (la TV entra con `role=tv`, no cuenta como viewer) |
| relay → todos | `episode_start` | Cuestionario listo → `{ chapterId, flags }` |

---

## 5. Gestión de contenido (CMS)

- En el **dashboard** creas serie/episodio (número de episodio **automático y único** por serie) y
  en el **editor de flujo** (React Flow) modelas capítulos → variantes → decisiones con sus
  condiciones de flags; un panel de **simular flags** resalta el camino que se reproduciría.
- **Subida de video** por variante: `POST /uploads/presign` (o `multipart/*` para archivos grandes)
  → `PUT` directo a **S3** → se guarda `videoUrl` (servido por **CloudFront**).
- Todo persiste en **DynamoDB**; relay/TV lo consumen con el mismo contrato `{data}`.

---

## 6. Rendimiento y robustez (TV)

- **Precarga**: mientras reproduce un capítulo, prefetch de las variantes del **siguiente**
  (caché de medios ExoPlayer) → cortes de rama sin buffering.
- **Multiformato**: fallback de decoder + manejo de error de reproducción — un clip incompatible no
  rompe la historia (la rama se ve en negro, el motor sigue).
- **Sin datos mock**: el catálogo muestra solo contenido real; si el backend no responde queda
  vacío (nunca series falsas). El relay tiene fallback a JSON local para el catálogo.

---

## 7. Despliegue (topología)

| Servicio | Tipo | Destino |
|---|---|---|
| content-api, prompt-generator | stateless (HTTP) | **Lambda** (CDK `NodejsFunction`) |
| **relay** | **WebSocket / tiempo real** | **ECS Fargate** (Lambda no sirve WS persistente) |
| datos | — | **DynamoDB** |
| video | — | **S3 privado + CloudFront (OAC)** |
| phone | web | estático (servido por el relay) |
| dashboard (CMS) | web | **S3 privado + CloudFront (OAC)** |

Infra como código: **solo AWS CDK** (`infra/cdk`) — **cuatro stacks**: `FirexpContentStack`,
`FirexpAiStack`, `FirexpRelayStack` (relay en Fargate) y `FirexpDashboardStack`
(CMS en S3 + CloudFront, con `-c dashboard=true`).

**El despliegue es autónomo** — el Action `Deploy (CDK)` corre `cdk deploy --all`
(construye la imagen del relay con `fromAsset`, cablea las URLs), siembra DynamoDB,
habilita Bedrock y hostea el dashboard, sin pasos manuales. Ver [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md).

> **Dev vs prod / costo:** el setup desplegado es a propósito una postura de
> **desarrollo y ahorro de presupuesto** — el relay corre como **una sola task
> Fargate con IP pública, sin ALB ni NAT** (≈ $9/mes vs ≈ $57/mes), `ws://` plano
> y `CORS: *`. Son trade‑offs deliberados de costo/dev; el modo `prod` del relay
> añade ALB + NAT, y el endurecimiento de TLS/CORS debe aplicarse antes de un lanzamiento público.

---

## 8. Estructura del repo

```
apps/
  fire-hack/        TV — Android/Kotlin/Compose (StoryEngine, ExoPlayer)
  phone/            Web del espectador (servida por el relay)
  relay/            WebSocket + estático + proxy de catálogo
  content-api/      CRUD de contenido sobre DynamoDB + presign S3
  content-dashboard/ CMS React (series, editor de flujo, uploads)
  prompt-generator/ Servicio de prompts IA (Bedrock + caché DynamoDB)
packages/types/     @fire-stick/types (contratos compartidos)
infra/cdk/          CDK: DynamoDB, S3, CloudFront, Lambda, HTTP API, IAM Bedrock
docker-compose.yml  MySQL + DynamoDB Local (dev)
```

---

## 9. Correr en local

```bash
npm install

# 1. DynamoDB Local + tablas + seed
docker compose up -d dynamodb-local
cd apps/content-api && DYNAMODB_ENDPOINT=http://localhost:8000 AWS_REGION=us-east-1 \
  SERIES_TABLE=firexp-dev-series EPISODES_TABLE=firexp-dev-episodes npm run dynamo:init

# 2. content-api (fuente de verdad)
DYNAMODB_ENDPOINT=http://localhost:8000 AWS_REGION=us-east-1 \
  SERIES_TABLE=firexp-dev-series EPISODES_TABLE=firexp-dev-episodes PORT=3003 node dist/main.js

# 3. relay (tiempo real + sirve phone/videos)
cd apps/relay && CONTENT_API_URL=http://localhost:3003 PORT=3001 node dist/main.js  # base sin /api/v1

# 4. dashboard (opcional)
cd apps/content-dashboard && VITE_CONTENT_API_URL=http://localhost:3003/api/v1 npm run dev

# 5. TV: abrir apps/fire-hack en Android Studio → instalar en el emulador/dispositivo
```

**Config de red (`apps/fire-hack/.../Config.kt`):**
- Relay desplegado → `RELAY_CLOUD = http://<fargate-ip>:3001` (`bash infra/scripts/relay-ip.sh`).
- Dev local → `http://10.0.2.2:3001` (emulador) o la IP LAN de la máquina (dispositivo físico).
- `PHONE_HOST` = IP LAN siempre (para el QR del teléfono físico).
- TV y teléfono deben estar en la **misma WiFi**.

---

## 10. Checklist del hackathon

- [ ] Demo < 3 min (app en Fire TV / AVD)
- [ ] Repo público + licencia open source
- [ ] Descripción de qué hace y cómo funciona
- [ ] Mini challenge **AWS Builder** — Bedrock en `prompt-generator`
- [ ] Mini challenge **Open Source**
