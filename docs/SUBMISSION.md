# Firexp — Checklist de entrega (Devpost)

Alineado con los **requisitos oficiales** de amazonappdev2026.devpost.com.
Leyenda: `[x]` hecho · `[~]` parcial/borrador · `[ ]` pendiente.

**Deadline oficial: 23 oct 2026 · 12:00 pm PDT.**
El formulario rellenable está en Devpost (tras registro): https://amazonappdev2026.devpost.com/ → "Enter a submission".

Borradores redactados (listos para pegar): ver `docs/submission/`.

---

## Requisitos oficiales (obligatorios)
- [~] **Project Description** — qué hace y cómo funciona → borrador en `docs/submission/description.md`.
- [~] **GitHub Repo** — código + assets + instrucciones. **Público con licencia OSS** (LICENSE ya está) **o** privado compartido con `testing@devpost.com` + equipo Amazon. (Repo aún no publicado.)
- [ ] **Demo Video** — < 3 min, YouTube/Vimeo, público, en inglés. Guion en la sección B.
- [~] **Product Feedback** — obligatorio por **cada** herramienta/API/SDK → borrador en `docs/submission/product-feedback.md`.
- [x] **Track + mini challenges** — Track **Fire TV**; mini challenges **AWS Builder** + **Open Source**.
- [~] **Pre-existing work disclosure** — qué se construyó dentro de la ventana → borrador en `docs/submission/pre-existing-work.md` (faltan fechas reales).

## Opcionales (bonus)
- [~] **Friction logs** (hasta 10% bonus) → borrador en `docs/submission/friction-logs.md`.
- [~] **Feature requests** → borrador en `docs/submission/feature-requests.md`.

## Criterios de jurado (sin pesos publicados)
Tech Implementation · Design · Potential Impact · Quality of Idea.

---

## A · Contenido — episodio demo `(objetivo 6 oct)`
- [~] Catálogo con varios ítems (3 series) · cuestionario/flags/uploads funcionan con clips de prueba distintos por rama.
- [ ] Episodio demo **producido**: guion 4 capítulos, 3 finales, 1 pre + 2 during, causa→efecto visible.
- [~] Validación "sin decisiones falsas" (`findInconsequentialDecisions=0`) — herramienta lista; correr contra el episodio real.
- [ ] Clips sin marcas/música de terceros · encoding H.264 1080p `+faststart` AAC.
- [ ] Subir a S3 vía dashboard (que salga en el video) · textos con Bedrock capturados.
- [x] Segundo episodio "stub" (catálogo no tiene un único ítem).

## B · Video demo `(objetivo 13 oct grabar · 16 oct subir)`
- [ ] Grabar en Fire TV (físico o simulador) — **debe verse el dispositivo/Fire OS**.
- [ ] Mínimo 3 teléfonos en cámara; captura vía scrcpy (no cámara a la pantalla).
- [ ] Voz en off inglés + subtítulos quemados · sin música/logos con copyright.
- [ ] Guion 0:00–3:00 (ver más abajo) · tomas de respaldo del tally en vivo.
- [ ] Público (no "no listado") · verificar embebido en Devpost.

## C · Formulario Devpost `(borrador 17 oct · envío 21 oct)`
- [ ] Registrarse y abrir el submission form.
- [~] Pegar Project Description (borrador listo).
- [~] Pegar Product Feedback por herramienta (borrador listo).
- [x] Seleccionar Track Fire TV + AWS Builder + Open Source.
- [~] Pegar friction logs + feature requests (borradores listos).
- [ ] Imagen de portada 16:9 sin marcas de terceros.
- [ ] Enlace al video + verificar que carga.

## D · Repo listo para revisión
- [x] **LICENSE** MIT en la raíz.
- [x] **README en inglés** (+ `README.es.md`).
- [x] **`.env.example`** por app.
- [x] **MySQL fuera** del compose.
- [x] **`npm run dev`** único.
- [x] **CI** GitHub Actions (falta apuntar el badge al repo real y verificar verde).
- [ ] **APK** en GitHub Releases (instalable sin Android Studio).
- [ ] Sección **"What we built during the hackathon"** con fechas.
- [ ] Sección **"AWS integration"** (respaldo de AWS Builder — qué servicio hace qué).
- [ ] Check de **secretos** en el historial (`git log -p | grep -i aws_secret`).
- [ ] **Open Source**: publicar `@fire-stick/story-graph` en npm o abrir un PR (con URL).
- [ ] "Run in 5 minutes" probado en máquina limpia por otra persona.

---

## Guion del video (0:00–3:00)

**Reglas de relato (obligatorias):**
- **NADA de "arquitectura" antes del minuto 2.** El diagrama y el stack solo aparecen en la sección de "How we built it", pasado 2:00.
- **Los primeros 45s Y los últimos 30s son Fire TV** (la sala, la TV, los teléfonos, el corte de rama). La nube va **en el medio** como soporte, nunca como protagonista.
- Se lidera con la **tensión humana** (cuatro en el sofá, la decisión atrapada en una cabeza), luego el **producto**, y solo después el **cómo**.

| Tiempo | Qué se ve | Qué se dice |
|---|---|---|
| 0:00–0:20 | Sala, 4 personas, Fire TV, QR (Fire TV protagonista) | "Four on a couch. The show hits a fork — and every 'what would *you* do?' dies in one person's head." |
| 0:20–0:45 | Split TV+teléfono: escanean, cuestionario, `episode_start` (Fire TV protagonista) | "No app to install. The whole room becomes the controller — and nobody looks away from the TV." |
| 0:45–1:30 | Decisión: tally moviéndose, alguien cambia su voto a 3 s, cierre → la TV corta de rama sin corte | "The TV never breaks immersion. The decision lives in your hand." |
| 1:30–1:55 | Final + Library: "your room chose A · 62% of rooms chose B" + recap de Bedrock/Nova | "Every room gets its own cut. And its own reason to replay." |
| 1:55–2:25 | CMS: React Flow, simulador de flags, warning de decisión sin consecuencia, upload a S3 | "Creators build the graph, not the versions." |
| 2:25–2:45 | **Recién aquí:** arquitectura 10 s + tests de paridad TS/Kotlin (nube = soporte) | "TV is the brain; the relay is dumb. Kotlin on Fire OS, DynamoDB, S3+CloudFront, Bedrock/Nova, all CDK." |
| 2:45–3:00 | **Vuelta a Fire TV:** la sala reacciona a su final + repo/licencia/tracks | "Twitch taught audiences to decide together. Firexp is the show where the room votes — and the TV never breaks." |

### Checklist de Story-headers (Devpost + video)
El relato debe recorrer, en este orden, tanto en la descripción como en el video:
- [ ] **Inspiration** — la escena del sofá; toda interactividad previa (Bandersnatch, second-screen, X-Ray) es individual; Firexp invierte: la sala decide.
- [ ] **What it does** — QR → cuestionario → votan → la TV nunca muestra UI de decisión → "62% of rooms" + recap Bedrock/Nova.
- [ ] **How we built it** — engine puro compartido (`story-graph`), TV = cerebro (`StoryEngine` en el dispositivo), relay tonto, AWS. **El diagrama va AQUÍ, no antes.**
- [ ] **Challenges we ran into** — reloj de referencia phone-to-phone; decisiones "during" que encajan en toda variante; rodar con continuidad para que los cortes de rama no salten.
- [ ] **What's next** — remote-as-backup-voter, votos por Twitch chat, listing en Appstore.
- [ ] Sin la palabra "arquitectura"/"architecture" antes de "How we built it".

---

## Calendario
| Semana | Foco |
|---|---|
| 21–27 sep | Técnicas B1–B3 (hechas); guion + mapa de flags; consulta a Devpost |
| 28 sep–4 oct | B4–B7; clips; cuestionario y textos con Bedrock |
| 5–11 oct | Contenido cargado + episodio jugable; Open Source npm/PR; README EN (hecho) |
| 12–16 oct | Grabar video (13), subir (16); friction logs + feedback |
| 17–21 oct | Formulario completo, revisión, **envío 21** |
| 22–23 oct | Solo correcciones |
