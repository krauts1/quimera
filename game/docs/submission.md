# Submission — Axie Vibeathon 2026, Round 1 (borrador)

Checklist oficial de entrega (blog del Vibeathon) con lo que ya hay y lo que falta.
Textos en inglés porque los jueces son internacionales; ajustar tono a gusto.

## Título
**QUIMERA**

## One-line pitch
> You are the Chimera of Lunacia: hunt fleeing Axies, tear off their REAL parts
> and graft them onto your own real Axie rig — become the monster they whisper about.

## Short description
> QUIMERA is a browser action-roguelike where the hunt is inverted: Axies run
> from YOU. The Primordial Alpha tore you apart — you respawn as a real Axie rig
> with nothing but a mouth, and rebuild yourself by hunting. Knock prey down and
> choose: tear off a part (their real 3D part visibly grafts onto your body and
> the prey visibly loses it) or devour them to survive. Journey across three
> territories, duel telegraphed Guardian bosses, trigger perfect dodges in slow
> motion, unleash class ultimates, mutate at every molt — and devour the
> Primordial at the end. A rare GOLDEN prey is a jackpot; a prey that escapes
> you twice comes back SCARRED and remembers you. Desktop & mobile, no wallet,
> no account, loads in one click.

## Full description (puntos a cubrir; redactar corrido al enviar)
- El loop: caza invertida → derribo (ventana de cosecha) → ARRANCAR (equipar /
  asimilar niveles / cambiar build) o DEVORAR (única curación) → sinergia de
  grupos → APEX 4/4 (tu grupo te teme) → LA MUDA (1 de 3 mutaciones por oleada)
  → contratos de caza → Primordial final.
- El viaje: 3 territorios con bioma propio (suelo, rocas, decoración, luz, clases
  de presa, clima de meteoritos) y transición cinemática entre ellos.
- Jefes Guardianes con patrones telegrafiados (carga en línea, rugido, crash
  contra rocas = aturdido, exhausto = ventana de crítico); el Primordial llama
  meteoritos sobre ti.
- Estados legibles sin números: aturdido, dormido, exhausto, crítico, esquiva
  PERFECTA con cámara lenta.
- Drama emergente: presa DORADA (2%, jackpot), NÉMESIS estilo Shadow of Mordor
  (la presa que se te escapa dos veces vuelve cicatrizada, entre runs), el
  Primordial se OYE antes de verse y te habla cada vez que mueres.
- Motor determinista puro (60 Hz, rng sembrado, 66 tests) + suite de balance
  headless (bot jugador × 3 perfiles × 60 runs sembrados, 9 pases documentados).
- Táctil de primera clase: joystick, zarpazo magnético, cosecha de un toque,
  radar, órbita 360°, zoom. Tutorial de un minuto que se enseña jugando.

## Axie Core connection (35% del score — el corazón del pitch)
- **Las partes SON el juego**: cada presa es uno de 60 Axies reales (genes +
  partes reales, sembrados del gateway GraphQL). Al arrancar una parte, tu rig
  REAL de Axie (toolkit oficial mixer 3D) se reconstruye con ella vía cirugía de
  descriptores — y la presa la pierde a la vista. El protagonista ES un Axie.
- Sistema de clases canónico: 6 clases, 3 grupos (beast/aquatic/plant), sinergia
  por grupo, deltas de sabor por clase en cada habilidad.
- Niveles de parte (asimilación L1→L3; el pack trae GLBs L2 distintos — el botín
  Alfa se ve diferente).
- Lore: la Quimera de Lunacia, cosida de partes robadas. Cero gore.

## AI tools used
- **Claude Code (Anthropic)** como constructor principal: diseño (sesión de
  office-hours con revisión adversarial), motor, render, tests, suite de
  balance, documentación. Dirección creativa y decisiones: Luis Enrique Hernández.
- Detalle completo en `DISCLOSURES.md`.

## Ecosystem fit — cómo embona en la dinámica de Axie
- **Para el holder**: "Hunt as YOUR Axie" — escribe el ID de tu Axie (dato
  público, cero wallet) y tu Quimera nace de él: su boca real es tu arma
  inicial, el HUD lo nombra, y tu resultado es SUYO ("mi Axie #123 conquistó
  Lunacia" es shareable). Tu NFT gana un lugar donde existir fuera de Origins.
- **Para el recién llegado**: embudo de descubrimiento — aprendes partes,
  clases y el triángulo de grupos (la intuición de armar equipos de Origins)
  cazando, no leyendo. El Bestiario convierte el catálogo real de partes en la
  progresión del juego.
- **Para el ecosistema**: cada parte del Bestiario es una parte real con nombre
  real — puente natural al marketplace (Round 2: link "ver Axies con esta
  parte"; leaderboard por Axie).

## Axie Core roadmap — AXP, competitivo, multijugador, tokens (respuestas de 7 sep)

**AXP**: Sky Mavis tiene el programa de builders aprobados que permite a juegos
de terceros OTORGAR AXP real al Axie del jugador (vía su AXP API; lo usan
juegos del ecosistema). QUIMERA es fit perfecto: "Hunt as YOUR Axie" ya vincula
el run a un Axie real por ID — en R2, cada cacería completada otorga AXP a ESE
Axie (login social con Ronin Waypoint, sin seed phrases). Hoy, sin backend, el
juego ya siembra el hábito: **cada Axie acumula su historia local** (nº de
cacerías y récord propio, visible al adoptarlo y al terminar cada run).

**Competitivo**: nuestra ventaja técnica es que el motor es 100% determinista
(tick fijo, rng sembrado, cero Math.random) — un run se puede REPRODUCIR desde
la semilla + la traza de inputs. Eso habilita leaderboards **verificables**
(el servidor re-simula la traza y valida el puntaje: anti-cheat real, no
promesa). Hoy ya existe la **CACERÍA DEL DÍA**: semilla derivada de la fecha,
la misma luna para todo el mundo, botón COMPARTIR con el tag del día — el
competitivo comunitario funciona desde Round 1 sin servidor (compara récords
en Discord/X). R2: leaderboard global diario + por-Axie ("el Axie #123 es el
mejor cazador de Lunacia esta semana").

**Multijugador**: async primero, que es lo honesto y lo que el motor ya
soporta — (a) fantasmas: corre contra la repetición del run de tu amigo en la
diaria; (b) **némesis compartida**: la presa que escapó de tu amigo aparece
CICATRIZADA en tu mundo (el sistema némesis ya existe; compartirla es un
intercambio de IDs). Tiempo real solo si R3+ lo amerita.

**Tokens/economía**: sin promesas de tokenomics — el valor al ecosistema es
tráfico y utilidad: el Bestiario ya enlaza cada parte absorbida al
**marketplace real** (descubres una parte cazando → ves los Axies en venta que
la tienen), y el share por run hace marketing orgánico de Axies concretos.
Cualquier recompensa on-chain (cosméticos, torneos con entrada) se haría solo
dentro de los programas aprobados de Sky Mavis.

## Product vision (20% — para el full description y el pitch de Round 2)
**La luna abierta (R2, dirección de Luis, 8 sep):** los tres territorios de hoy
son la semilla de una Lunacia EXPLORABLE — el jugador recorre la luna
libremente entre cacerías: **guaridas-cueva** donde viven los Guardianes (hoy
sus intros de letterbox; mañana, entrar a su cueva a cazarlos), **herramientas
de expedición** encontradas en el terreno (armas improvisadas de restos
lunares que aceleran la caza), **Axies especiales en las sombras** (hoy: la
DORADA, la CICATRIZADA y las dormidas de la Cicatriz — mañana: variantes que
solo aparecen en rincones oscuros del mapa abierto), y **vehículos rescatables**
— el transbordador estrellado y el rover explorador que HOY ya existen como
restos en el mapa se vuelven reparables y montables para cruzar la luna. El
prototipo actual mantiene la arena porque la densidad de caza y la curva
medida son la experiencia de 5 minutos que un jam exige; la luna abierta es la
evolución natural con más tiempo.

Además (R2): runs con semilla diaria y leaderboard global VERIFICABLE
(re-simulación de trazas); pasillos jugables entre territorios; crianza/fusión
de entradas del Bestiario; pool de partes Alfa únicas con habilidades propias;
pasivas (ojos/orejas) con efectos; capturar una presa como compañera de
manada; leaderboard por Axie ("mi #123 conquistó Lunacia").

## Checklist de materiales
- [x] **Registro con Sky Mavis Account** ✓ (hecho, 3 sep)
- [x] Título + one-line pitch + descripciones (este doc)
- [ ] Thumbnail + imagen del juego (captura buena de la Quimera con partes +
      una de la arena con manada; Luis)
- [ ] Link jugable que abra en pestaña nueva (deploy T12)
- [x] Instrucciones de controles (README + en pantalla + título)
- [ ] **Link de repositorio (puede ser privado)** — ⚠️ el proyecto AÚN NO ES
      REPO GIT: `git init` + push a GitHub privado (`.gitignore` ya preparado:
      excluye `public/assets/axie/` por RIGHTS.md, `node_modules`, `dist`)
- [ ] Video demo fallback (guion en `docs/video-guion.md`; Luis graba)
- [x] AI tools + conexión Axie Core (este doc + DISCLOSURES.md)
