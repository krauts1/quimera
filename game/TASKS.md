# TASKS.md — QUIMERA, del greybox al submit

Una tarea = un prompt al agente = un resultado verificable. En orden; no empezar
una hasta que el check de la anterior pase. Regla de trabajo: `npm test` y
`npm run dev` después de cada cambio significativo.

Formato: `☐ Check:` = criterio de aceptación **pendiente**; al cumplirse se cambia
a `✅` y la tarea se mueve a "Hecho" con fecha. `🔨` = en curso. Este archivo se
actualiza en el mismo momento en que se avanza una tarea. Los checks de sensación
(playtest) los cierra Luis, no el agente.

Calendario OFICIAL (blog.axieinfinity.com, verificado 3 sep):
- **7 sep: CIERRA EL REGISTRO** (Sky Mavis Account, una entrada por builder) ⚠️
- **8–21 sep: Round 1** (prototipo) → submit a más tardar el 21
- 29 sep: anuncio de 8 finalistas · 4–31 oct: Round 2 (juego completo) · 5 nov: final
Todo lo anterior al 8 sep se declara como trabajo previo en `DISCLOSURES.md`.
Criterios Round 1: **Axie Core 35% · Gameplay 25% · Product vision 20% ·
Feasibility 10% · Prototype/documentation 10%** (3 jueces independientes, con
screening previo de elegibilidad y seguridad).

## Hecho

**T0. Motor + greybox jugable** ✅ (2 sep)
- Motor puro (rng, oleadas, partes/sinergias/devorar, sim 60 Hz completa), 26
  tests verdes, typecheck y build limpios. Greybox: Quimera real del mixer,
  presas cápsula, HUD, esquiva, 4 ataques, arrancar/devorar, muerte y restart.

**T8. Spike: injertos visibles** ✅ (2 sep)
- Respuesta: **SÍ** — `mixer.create({descriptor})` acepta descriptores
  arbitrarios y `decodeGenes()` da el de cualquier Axie. Costo: rebuild async
  ~100–300 ms. Documentado en design doc §8. → T9a implementado, T9b descartado.

## Pivote de core (2 sep, tarde — decisión de Luis)

**T-EVO. La Quimera nace simple y evoluciona cazando** 🔨 *(código + balance ✅;
sensación pendiente de playtest)*
- Nace solo con boca; cuerno/cola/dorso vacíos (HUD punteado). Arrancar: ranura
  vacía = EQUIPAR (desbloquea la habilidad) · mismo grupo = ASIMILAR (tu parte
  sube nivel, +15%/nivel, tope 3; L2 cambia el modelo) · grupo distinto =
  CAMBIAR. Bot de balance actualizado (llenar > sinergia > asimilar).
- ✅ Check (objetivo): re-balance pase 3 — victoria 27% bueno · 15% medio ·
  5% casual; muerte mediana 6/8/9 (design doc §7.5).
- ☐ Check (sensación): los primeros 3 arrancones se sienten como subidas de
  poder; asimilar se entiende.

**T-HUIDA. La caza invertida** 🔨 *(2 sep noche, decisión de Luis: las presas
huyen; código + tests + balance hechos; sensación pendiente)*
- Presas huyen de la Quimera (3.2 u/s, se deslizan por el borde); pelean solo
  encimadas (≤2.4 u), acorraladas, o **vengando a un caído** (≤9 u → 6 s de furia,
  +40% daño). El Alfa nunca huye: te caza (daño ×1.8, velocidad ×1.25). Huyendo
  corren mirando lejos.
- ✅ Check (objetivo): curva pase 4 — victoria 78/60/17% (bueno/medio/casual),
  duración ~4.5 min (en objetivo). Sesgo del bot documentado en §7.5: NO seguir
  tuneando contra el bot; calibrar con humanos en T13.
- ☐ Check (sensación): perseguir se siente cacería (la esquiva como zarpazo);
  cosechar rodeado da miedo; el Alfa impone.

**T-TOUCH. Controles táctiles** 🔨 *(implementado; feedback ronda 1 de Luis:
"no tan fluidos" → pase de fluidez aplicado, re-probar)*
- Joystick virtual (mitad izquierda), auto-apuntado a la presa activa más
  cercana, chips del HUD = botones de ataque, botón ESQUIVA, botón DEVORAR en el
  panel de cosecha (mantener), tap en pantalla de muerte/victoria = renacer,
  viewport sin zoom.
- Pase de fluidez (2 sep, tras feedback): interpolación de render entre ticks
  (el motor va a 60 Hz; en pantallas de 120 Hz se veía a tirones), cámara con
  amortiguación exponencial, giro del personaje suavizado (14 rad/s), curva de
  respuesta del joystick (zona muerta 12%, velocidad máx. al 65% de palanca).
- Feedback ronda 1 también pidió: la Quimera no debe MOSTRAR partes que no
  tiene → hecho: nace con solo cuerpo/ojos/orejas/boca en el rig (el
  plan-builder acepta descriptores incompletos) y cada arrancón se ve aparecer.
- Ronda 2 de feedback ("complicado atacar, no se lee el desplazamiento"):
  el cuerpo ahora mira hacia donde CAMINAS (adiós moonwalk) y solo hace snap al
  objetivo al presionar un ataque o al estar quieto; marcador flotante sobre el
  objetivo del auto-apuntado (alcance 7 u); ataques en cluster 2×2 sobre el botón
  de esquiva (zona del pulgar derecho); hint de teclado oculto en táctil.
- Ronda 3 de feedback (2-3 sep: "no encontraba axies", "no es claro cómo
  arrancar"): **radar** en la esquina superior derecha (arena completa: puntos
  por clase, ámbar = derribada cosechable, aro rojo = Alfa, blanco = tú) y
  **cosecha de un toque** en táctil (tocar una parte/DEVORAR arranca el canal y
  corre solo; se cancela al atacar, esquivar o alejarse; chips más grandes,
  texto "toca" en vez de "mantén").
- Ronda 4 (3 sep: "las partes no se ven en la Quimera", "apuntar sigue raro"):
  el clonado ahora HORNEA la matriz de mundo (posición/escala del esqueleto de
  la presa) y cada parte se centra y ajusta a 0.8 u en su anclaje — antes
  quedaban fuera de lugar o microscópicas; y **zarpazo**: atacar abalanza 0.8 u
  hacia donde encaras (motor, con test) — apuntar en táctil ya no exige
  precisión y de rebote dejó el balance en objetivo (52/28/0%, pase 5 en §7.5).
- ☐ Check: un run completo jugable en el teléfono sin teclado, fluido.

## D2 — sensación de combate

**T1. Legibilidad del golpe enemigo** 🔨 *(2 sep: código + checks objetivos listos;
solo falta el veredicto de sensación de Luis)*
- Wind-up visible antes del golpe de la presa (0.3 s de telegraph: se agacha /
  cambia de color) y knockback corto al conectar cualquier golpe (ambos lados).
  Separación entre presas para que no se apilen en un punto.
- ✅ Check (objetivo, automatizado en `sim.test.ts`): esquivar reaccionando al
  telegraph = cero daño en 20 s vs. bot pasivo que sí recibe golpes ("a propósito,
  no por suerte"); en oleada 9 ninguna pareja de presas activas queda a <0.6 u
  durante 900 ticks (no se apilan).
- ☐ Check (sensación): jugar 3 runs y confirmar que el telegraph se lee y el
  knockback se siente bien. → pasa a T2 (tuning) con ese feedback.

**T2. Primer pase de tuning** 🔨 *(2 sep: tuning por simulación hecho; falta
confirmación de sensación)*
- Ajustar velocidades/cooldowns/daños en `constants.ts`. Herramienta nueva:
  `npm run balance` (bot jugador en 3 perfiles × 60 runs sembrados — semilla de T13).
- ✅ Check (objetivo): curva de muerte mediana casual/medio/bueno = 6/6/8 oleadas
  (objetivo: 3–5 / 4–6 / 6–9). Detalle en design doc §7.5. Bug corregido de paso:
  la esquiva diagonal era 29% más corta por doble normalización.
- ☐ Check (sensación): jugar y confirmar "posible y tenso; morir es culpa propia".
  Punto a vigilar: ¿las oleadas se sienten muy cortas? (bot bueno ~90 s/run).

## D3 — la cosecha es el juego

**T3. UI de cosecha sobre la presa derribada** 🔨 *(2 sep: implementada; falta
veredicto de claridad en playtest)*
- Prompt sobre el cuerpo caído: sus 4 partes activas (color de clase + ranura),
  F mantiene = devorar, click/tecla en parte = arrancar. Anillo de progreso del
  canal. Retirar el mapeo provisional 1–4.
- Implementado: panel anclado al cuerpo (solo al alcance) con chips de las partes
  restantes en color de clase, "mantén click = ARRANCAR (injerta)" / "mantén F =
  DEVORAR (cura)", anillo cónico de progreso del canal y barra ámbar con la
  ventana de derribo restante. Mapeo 1–4 eliminado (README actualizado).
- Evolucionó en T-TOUCH ronda 3: en táctil es cosecha de UN TOQUE (canal
  pegajoso), botón DEVORAR, chips grandes.
- ☐ Check: Sin leer el README, se entiende qué se gana al arrancar vs devorar.

**T4. HUD de build** 🔨 *(2 sep: implementado; falta veredicto visual en playtest)*
- Las 4 ranuras de la Quimera visibles (color de clase); indicador de sinergia
  encendido al llegar a 3 del mismo grupo.
- Implementado: fila inferior central con las 4 ranuras (color de clase de la
  parte actual + tecla + relleno de cooldown); al injertar, el chip hace pop y
  cambia de color al instante; con 3 del mismo grupo, los chips del grupo brillan
  y el rótulo SINERGIA se enciende en el color del grupo dominante.
- ☐ Check: Arrancar una parte cambia el HUD al instante; activar sinergia se nota sin
  explicación.

## D4 — presas de verdad

**T5. Presas con render del mixer** 🔨 *(2 sep: implementado; falta medir fps en
la laptop — abrir con `?fps`)*
- Pool desde `public/data/axies.json` (cache por genes; presupuesto: 7 en campo).
  Idle/walk; derribo = pose tumbada o tinte gris. Alfa: escala + tinte.
- Implementado: Axies reales elegidos por clase del arquetipo (round-robin sobre
  los 60), cápsula como placeholder mientras el mixer carga, pool de instancias
  reutilizadas entre presas y entre runs (tope 12 en total). Estado legible sin
  tocar materiales del mixer: anillo bajo cada presa (color de clase que se apaga
  con el hp → rojo en telegraph → ámbar derribada → flash blanco al golpe).
  Derribo = tumbada de lado. Alfa: escala 1.5 + anillo grande. Contador de FPS
  con `?fps` en la URL.
- ☐ Check: Una oleada completa con Axies reales mantiene 60 fps en la laptop de
  desarrollo; si no, volver a cápsulas para las lejanas.

## D5 — identidad de las habilidades + checkpoint

**T6. Animaciones y sabor por ranura** ✅→ **parcialmente superseded por
T-AMORFO** (la Quimera ya no tiene rig: sus anims de ataque por ranura murieron
con él; el ataque es pulso procedural del núcleo)
- Sobrevive: flash de arco por ranura (forma = ranura, color = clase de la
  parte), robo de vida plant / devorar en verde, alcance bird en el arco, y del
  lado de las presas los clips reales del pack (`Default.Walk`, `Default.Stun`
  para derribadas). El hallazgo del pack (no hay anims por parte) quedó en
  design doc §7.
- ☐ Check (reducido): con el sonido apagado y sin HUD, el arco de cada ranura
  se distingue (forma + color).

**T7. CHECKPOINT de recorte (fin D5)** ✅ (3 sep — decisión provisional del
agente por instrucción de Luis: "dale sin miedo, iteramos al final")
- **Decisión: NO se recorta nada.** El loop completo funciona de punta a punta
  (título → cacería invertida → derribo → arrancar/asimilar/devorar → sinergia →
  Alfas → oleada final → victoria/muerte → renacer), en desktop y táctil, con
  audio, validado por 45 tests + 6 pases de balance + 4 rondas de feedback de
  Luis en móvil. Ningún sistema del core cojea; los pendientes son de entrega
  (deploy/video/submit), no de juego. Se reabre solo si el playtest final
  (T-PLAYTEST) encuentra algo roto.

## D6 — la Quimera se ve monstruo

**T9a. Injertos en el rig** ✅→ **superseded por T-AMORFO** (2 sep noche)
- La versión "cirugía de descriptor + rebuild del rig" funcionó, pero Luis pidió
  Quimera amorfa. Sobrevive del trabajo: presas = Axies reales (catálogo/pool) y
  el conocimiento del plan-builder.

**T-AMORFO. La Quimera es un ser amorfo** 🔨 *(2 sep noche: implementado; falta
veredicto visual de Luis)*
- Núcleo icosaedro oscuro con respiración por vértice, ojos emisivos asimétricos,
  anclajes caóticos por ranura (dorso a media panza, cuerno de hombro, orejas
  fuera de lugar). Al arrancar, las mallas de la parte se **clonan del cuerpo de
  la presa** (que la pierde a la vista) y se montan con pop; asimilar escala la
  parte (+14%/nivel). Ataque = pulso squash del núcleo; esquiva = estiramiento.
  Fallback si la presa aún es cápsula: cristal del color de clase. Renacer =
  desnuda otra vez. Bonus: sin rebuilds async del rig (fluidez).
- ☐ Check (judge-check): arrancar produce un cambio visible e inconfundible en
  el personaje; el "ser hecho de partes robadas" se lee de inmediato.

## D7 — arco del run

**T10. Cierre del run + Alfa con pool** 🔨 *(2 sep: implementado y validado en
sim; falta veredicto de sensación)*
- Implementado: oleada 9 = FINAL con doble Alfa; limpiarla = victoria ("LUNACIA
  ES TUYA", el build queda visible en el HUD inferior). Pool Alfa versión mínima:
  sus partes activas son nivel 2 (+25% daño injertadas, GLB L2 distinto). Regla
  nueva de cosecha: el canal aguanta daño (ver design doc §2.5).
- ✅ Check (objetivo, `npm run balance`): victoria 35% bueno · 5% medio · 0%
  casual; muerte mediana 6/7/9. Registro en design doc §7.5 pase 2.
- ☐ Check (sensación): un run completo tiene principio y final; la victoria se
  siente ganada.

## D8 — envoltura

**T11. Title screen + audio** 🔨 *(2 sep: implementado; falta escucharlo)*
- Implementado: pantalla de título ("QUIMERA — Caza. Arranca. Devora." +
  controles; el click desbloquea el AudioContext y arranca el mundo). 9 SFX
  sintetizados con WebAudio en runtime (`src/audio.ts`, cero assets): golpe,
  telegraph, derribo, arrancar, devorar, sinergia, daño, muerte, victoria.
  DISCLOSURES actualizado (ya no se usan jsfxr/Kenney).
- ☐ Check: Del link al juego en un click; cada acción del loop suena distinto.

## D9 — deploy

**T12. Vercel** 🔨 *(2 sep: el riesgo técnico está resuelto; falta el deploy real
— requiere cuenta de Vercel de Luis)*
- Resuelto el problema de los 588 MB: `scripts/prune-assets.mjs` usa el
  plan-builder determinista del propio toolkit para calcular el subconjunto
  exacto (60 axies × niveles 1 y 2, materiales→texturas resueltos por id, y
  TODAS las animaciones de sus 5 cuerpos — el runtime carga eager ambos sets,
  full y lite; filtrar payloads "de armas" rompe con "invalid magic header")
  → **179 MB**. `npm run build:deploy` produce `dist/` autocontenido (205 MB,
  sin sourcemaps). Intento fallido documentado: recortar el set lite de
  animaciones (−46 MB) rompe el boot — el ensamblador carga AMBOS diccionarios
  sin importar animationSet. Los payloads de animación NO se recortan.
- Pasos restantes (Luis): 1) `npm run build:deploy` 2) verificar local con
  `npm run preview` (¡los Axies deben verse texturizados — si algo sale gris,
  el podado dejó fuera una textura!) 3) `vercel deploy dist` (o arrastrar
  `dist/` a Vercel). 4) revisar RIGHTS.md del toolkit: hospedar el subconjunto
  para la entrada del Vibeathon debe estar cubierto por su licencia.
- ☐ Check: El link abre en una máquina ajena, un run completo, restart incluido.

## D10–11 — balance y pulido

**T13. Suite de balance headless** 🔨 *(la suite existe desde T2 y ya corrió
6 pases; lo que falta es la calibración humana)*
- Hecho: `npm run balance` (bot en 3 perfiles × 60 runs sembrados), 6 pases de
  tuning registrados en design doc §7.5. Curva vigente (pase 6, con zarpazo
  magnético): victoria 68% bueno · 32% medio · 5% casual — deliberadamente
  generosa para jam (jueces deben ver el arco completo en 2–3 runs).
- ☐ Check (final): con el playtest de Luis como referencia humana, confirmar o
  ajustar la curva; los valores confirmados pasan a [medido] en el design doc.

**T14. Pulido + video fallback** 🔨 *(3 sep: guion listo; grabación es de Luis)*
- Guion y lista de tomas en `docs/video-guion.md` (la toma clave: el injerto —
  la parte apareciendo en la masa mientras a la presa le falta).
- Pulido agregado (3 sep): anuncio central "OLEADA N / OLEADA FINAL" con SFX al
  arrancar cada oleada; pantalla de título con instrucciones táctiles en móvil.
- ☐ Check: Video subido y linkeado en README.

**T-ARTE. Pase visual con three.js** 🔨 *(3 sep, tras feedback "piso negro, no
se ve nada, la quimera es rara"; regla de Luis: todo lo artístico con three.js,
sin assets externos)*
- Suelo lunar con textura procedural (CanvasTexture: cráteres y manchas — da
  paralaje y el movimiento por fin se lee), 26 rocas low-poly como referencias
  espaciales, 400 estrellas, luz general +40%, niebla y fondo azulados, borde de
  arena visible. Quimera con presencia: núcleo violeta emisivo, aura translúcida
  que respira, PointLight propia que ilumina el suelo y presas cercanas (con
  latido), anillo de contacto en el piso.
- ☐ Check: en el teléfono se ve DÓNDE estás y hacia dónde te mueves; la Quimera
  se lee como criatura de energía, no como bola rara.

**T-MAPA. Contenido del mapa: rocas, meteoritos, la Tierra** 🔨 *(3 sep, idea de
Luis; código + tests + balance hechos; sensación pendiente)*
- **Rocas-obstáculo** (motor): 9 rocas por semilla determinista, con colisión
  (jugador y presas deslizan por el borde) — esquinas nuevas para acorralar.
  Render: rocas grandes en su posición exacta, algunas con cristal lunar.
- **Meteoritos** (motor): cada ~8 s telegrafía un círculo rojo 1.3 s y cae —
  daña a la Quimera (18, esquivable con i-frames), DERRIBA presas en el radio
  (45) = peligro y oportunidad de cosecha. Render: anillo pulsante, roca cayendo,
  onda expansiva, shake de cámara, 2 SFX, aviso en el radar.
- **Cielo**: la Tierra en el horizonte (textura procedural: océanos, continentes,
  nubes, casquetes + atmósfera; rota lento), estrellas fugaces ocasionales.
- ✅ Check (objetivo): 48 tests (rocas bloquean, meteoro daña/derriba, mapas
  deterministas por semilla); balance re-medido con rocas+meteoros: 50/23/5%
  (bueno/medio/casual) — en objetivo.
- ☐ Check (sensación): el mapa se siente lugar, no plancha; el meteorito se lee
  y esquivarlo/aprovecharlo es divertido.

**T-PC. Apuntado y cosecha en desktop** 🔨 *(3 sep, tras feedback "en PC no es
claro cómo apuntar ni cómo absorber, no deja")*
- Diagnóstico: el imán elegía objetivo invisible (sin marcador en PC) y absorber
  exigía MANTENER click en un chip chico; click al cuerpo de la presa = ataque
  (que ignora derribadas) → "no deja".
- Fix: el cursor ahora SELECCIONA presa (radio de gracia 3.5 u, marcador visible
  también en PC + retícula en el suelo); cosecha de UN click en ambas
  plataformas (pegajosa); botón DEVORAR también en PC; el panel se traga sus
  clicks (clickearlo nunca dispara ataques); chips grandes en ambas; hints
  actualizados (pantalla, título, README).
- Ronda 6 (3 sep: "el arco sale al lado contrario", "brusco", "las partes no se
  fijan bien"): BUG del imán corregido — elegía la presa más CERCANA del cono,
  no la ALINEADA con el encare/marcador (ahora dot manda, distancia desempata;
  test nuevo); deslizamiento visual del zarpazo (~80 ms, felino en vez de
  teletransporte); montaje de partes con rotación limpia (la ponía la pose de la
  presa al morir) y material a doble cara (las partes de Axie son planas de una
  cara: de canto o por detrás eran invisibles).
- ☐ Check: en PC, elegir presa → zarpazo → absorber fluye sin leer nada.

**T-PULIDO. Cereza pre-submit** ✅ (3 sep — lote de alto valor/bajo costo)
- **Orbe de absorción**: al arrancar, la esencia (color de clase) vuela en arco
  de la presa a tu cuerpo y LA PARTE SE MONTA AL LLEGAR (el momento clave del
  juego ahora se ve); devorar lanza un orbe verde.
- **Ambiente sonoro**: drone lunar tenue en loop (WebAudio: senos desafinados
  55/55.6/110 Hz con respiración de ~22 s) — adiós al silencio vacío.
- **Cara pública del link**: title con lema, meta description, og:tags,
  theme-color y favicon SVG inline (la Quimera en 5 círculos y un zigzag).
- **Victoria con resumen**: "LUNACIA ES TUYA" muestra las 4 partes finales con
  color de clase y marcas de nivel.

**T-META. Meta clara + motivación** ✅ código / ☐ sensación (3 sep, tras la
pregunta de Luis: "¿cómo ganas? ¿qué lo hace adictivo? ¿cómo aporta a Axie?")
- **Meta visible (este run)**: contador "OLEADA N / 9" — ves acercarse la final;
  el título ya anunciaba "sobrevive a la oleada final".
- **Adicción (entre runs)**: PUNTAJE en el motor (derribo 25, Alfa +150, arrancar
  40, asimilar 60, devorar 10, oleada 100, victoria 1500 — [provisional]) con
  RÉCORD persistente (localStorage) y "RÉCORD NUEVO" en las pantallas de fin.
- **Largo plazo + aporte a Axie**: el BESTIARIO — cada parte real absorbida queda
  registrada para siempre ("bestiario 12/N", toast al estrenar parte). Completarlo
  = hook de colección, y es el embudo de descubrimiento del universo Axie:
  aprendes partes y clases reales cazándolas. (Refuerza Axie Core 35% y Vision 20%.)
- ☐ Check: tras 2 runs dan ganas del tercero (récord o bestiario tiran de ti).
- Ronda 2 (3 sep, "¿ya está adictivo?"): récord VISIBLE durante el run (dorado
  cuando lo vas superando); cada run genera OTRA LUNA (semilla de mapa aleatoria,
  rocas nuevas al renacer); la muerte también muestra el monstruo que eras; y la
  VITRINA del bestiario (tecla B / botón en título / desde la muerte): colección
  completa con descubiertas a color y huecos "???" que pican. Pausa el mundo.

**T-AV. Pase audiovisual 2** ✅ código / ☐ ojos y oídos de Luis (3 sep)
- Gráficos (three.js procedural): tone mapping ACES fílmico, domo de cielo con
  gradiente, viñeta de piso (profundidad), 130 motas de polvo lunar a la deriva
  (aditivas), cristales de roca que laten, blending aditivo en flashes/orbes/
  aura, estela de fuego del meteorito, y el núcleo de la Quimera SE TIÑE del
  color del grupo cuando enciendes sinergia.
- Música generativa adaptativa (WebAudio, cero assets): pads menores en ciclo
  Am→F→C→G + arpegio pentatónico con eco que CRECE con la oleada + pulso grave
  de cacería cuando hay Alfa activo o manada furiosa. Sobre el drone existente.
- ☐ Check: la escena se siente lugar con atmósfera; la música acompaña sin
  cansar y se intensifica cuando debe.

**T-HOLDER. "Caza con TU Axie"** ✅ código / ☐ probar con un ID real (3 sep,
tras la pregunta de Luis "¿en qué le beneficia a un holder?")
- Input opt-in en el título: escribes el ID de tu Axie → una consulta al gateway
  GraphQL público (sin wallet/cuenta/firma; casing normalizado en la frontera) →
  tu Axie se vuelve la BASE de la Quimera: su boca real es tu arma inicial, el
  HUD dice "QUIMERA DEL AXIE #N", las pantallas de fin lo nombran, y sus partes
  entran al Bestiario. El ID se recuerda (localStorage). Por defecto: 100% local.
- Invariante amendado en design doc §6.4; DISCLOSURES actualizado.
- ☐ Check: probar con un Axie ID real del marketplace; ver que la boca cambia y
  el tag aparece. (Escribir teclas en el input NO dispara acciones del juego.)

**T-PERSONALIDAD. Huida por clase + anatomía de la Quimera** ✅ código / ☐
sensación (3 sep, decisión de Luis)
- Personalidades: aquatic ×1.3 · bird zigzag · bug arranques/pausas · plant
  bola (−28% daño) · beast valiente (pelea a ×1.8) · reptile emboscadora
  (inmóvil, mordida ×1.5). Tests: zigzag, acecho, valentía, armadura (52 total).
- Anclajes ANATÓMICOS: cuerno→cabeza, dorso→espalda, cola→atrás, boca→frente.
- Balance pase 7 (con personalidades + contacto 17): victoria 68/42/12% — el bot
  granjea a las quietas con foco perfecto; el humano será mordido por emboscadas
  y jukeado por birds. Calibrar con playtest.
- ☐ Check: se nota QUÉ clase cazas por cómo huye; la Quimera se lee anatómica.

**T-PROGRESION. LA MUDA + identidad mecánica + ratchet real** ✅ código / ☐
sensación (3 sep, el feedback clave de Luis: "soso, sin progresión, sin objetivo")
- LA MUDA: fase nueva del motor — limpias la oleada, cosechas en paz (sin
  intermedio hasta terminar), el mundo se congela y eliges 1 de 3 mutaciones
  (pool de 8, acumulables, con cartas UI + teclas 1-3 + anuncio al elegir).
- Identidad mecánica por clase: aquatic resetea esquiva al conectar · beast
  azota ×2 · bird alcance 1.55 · plant drena 22% · reptile derribos ×1.8.
- Escalado separado HP +5% / DAÑO +16% por oleada (matas más rápido, los
  errores duelen más). Narrativa: el ALFA PRIMORDIAL como objetivo con cara
  (título + anuncio de oleada final).
- ✅ 54 tests (muda ofrece/congela/aplica, SED sube daño); balance pase 8:
  13/48/92% — el 92 del "bueno" es techo de bot (esquiva sobrehumana anula el
  escalado de daño); calibración final = playtest humano.
- ☐ Check: en un run se SIENTE crecer (matas más rápido en la 6 que en la 2,
  la muda emociona, y el moveset cambia con lo que absorbes).

**T-RIG. La Quimera vuelve al rig real (protagonista v3)** ✅ código / ☐ visto
bueno (4 sep, decisión de Luis tras ver a la competencia)
- El arte profesional del mixer como personaje: rig real que nace incompleto
  (solo boca/ojos/orejas) y se reconstruye con cada parte REAL absorbida en su
  socket correcto (cirugía de descriptores — resucitado del T9a). Recupera:
  animaciones reales (walk + ataque por ranura Action.*), botín Alfa L2 visible
  (GLB distinto), y "Caza con tu Axie" ahora significa TU AXIE EN PANTALLA.
  Vestido de monstruo conservado: aura + luz con latido + anillo, teñidos por
  sinergia; esquiva con estirón; escala ×1.12. La presa sigue perdiendo la parte
  a la vista. Se retira: blob, anclajes, tallos, clonado de mallas al jugador.
- ☐ Check: el personaje se ve nivel-competencia; el injerto en socket correcto
  mata todos los problemas de orientación de una vez.

**T-CACERIA. Tier 1 + Tier 2 + estados (el sueño grande)** ✅ código / ☐ el
playtest de Luis de mañana (4 sep, greenlight: "ejecutemos todo… necesito esos AXS")
- **TERRITORIOS**: la cacería es un viaje — LOS PRADOS (plant/bug/beast, meteoros
  raros) → EL MAR DE POLVO (aquatic/bird/bug, llueve fuego) → LA CICATRIZ
  (reptile/beast, oscuridad: tu aura es la luz, presas DORMIDAS). Paleta de
  terreno/niebla/luz por territorio, anuncio con nombre, presas del bioma.
- **JEFES**: los Alfas son Guardianes con patrones — CARGA telegrafiada en línea
  roja (esquívala; si se estrella contra una roca queda ATURDIDO; al terminar
  queda EXHAUSTO = ventana de crítico) y RUGIDO (enfurece a la manada + empuja).
  La oleada 9 es EL ALFA PRIMORDIAL único (HP ×3.6) que además LLAMA METEORITOS.
- **ESTADOS con señal**: ATURDIDO (anillo blanco parpadeante + anim Stun),
  DORMIDO (Zzz flotante, anillo apagado, despiertan al acercarte — '!'),
  EXHAUSTO (anillo dorado parpadeante), CRÍTICOS (×1.75, texto naranja flotante
  ¡CRÍTICO!, garantizado vs dormidas/exhaustos), ESQUIVA PERFECTA (ventana de 8
  ticks: aturde al atacante + crítico cargado + ¡PERFECTA! + CÁMARA LENTA 0.5 s).
- **ULTIMATE del dorso**: se carga cazando (gauge dorado en el chip DORSO);
  al liberar: RUGIDO/MAREA/ESPORAS/TORMENTA/PLAGA/PARÁLISIS según la clase —
  anuncio + onda + shake. El dorso ya no es un 4º golpe: es tu momento de película.
- **CONTRATOS de caza**: 1 por territorio (derriba 3 X / absorbe grupo Y / no
  devores / derriba con meteorito) visible bajo el HUD; cumplirlo = MUDA EXTRA.
- **DESBLOQUEOS**: llegar a un territorio lo abre como punto de inicio (título),
  con mudas de ventaja.
- ✅ 60 tests (perfecta, dormida-crítico, guardián-carga, ultimate, contrato,
  territorio, primordial). Balance: 25/55/93 — generoso adrede (jam) y el 93 es
  techo de bot; calibra el playtest humano.
- ☐ Check: el run se siente VIAJE con clímax; los estados se leen sin manual.

**T-ROBOS. Los 5 robos aprobados por Luis (4 sep: "aplica eso 1, 7, 3, 8 y 9")**
✅ código / ☐ su playtest de hoy
- **#1 NÉMESIS** [Shadow of Mordor]: la presa (Axie real del catálogo) que se te
  disuelve SIN cosechar 2 veces entre runs vuelve **CICATRIZADA** — HP ×1.5,
  pelea de lejos (×1.6), nunca duerme, partes L2, anillo rojo latiente, toast
  "☠ te recuerda", +300 pts al derribarla. Cosecharla = "☠ VENGANZA CUMPLIDA"
  y la marca se borra (si la vuelves a dejar disolverse, se re-cicatriza).
  Persistencia en `quimera.nemesis` (localStorage), el motor solo lee el flag.
- **#7 PRESA DORADA**: 2% de spawn, jamás pelea, huye rapidísimo pero SIEMPRE
  alcanzable (capeada al 94% de tu velocidad — con ×1.9 quedaba incazable y
  ataraba la oleada: cap del balance 20-25 runs, arreglado). Partes L2 + 500
  pts. Anuncio "✨ ¡PRESA DORADA!", campanillas, anillo de oro palpitante,
  chispas ✦ al correr, punto dorado en radar.
- **#3 APEX (4/4)** [Balatro]: sinergia completa = jackpot — +25% de daño extra
  apilado (1.5× total), aura ×1.4 + brillo ×1.7, etiqueta "★ APEX ★" dorada,
  anuncio + acorde + shake, y las presas de tu grupo dominante TE TEMEN (huyen
  siempre; acorraladas aún muerden; Alfas y némesis inmunes al miedo).
- **#8 RUGIDO LEJANO** [Alien Isolation]: el Primordial se oye antes de verse —
  rugido distante cada 55-105 s, más fuerte por territorio (+ microshake en la
  Cicatriz); calla en la oleada final (ya está aquí). Override `distantRoar.ogg`.
- **#9 EL PRIMORDIAL TE HABLA AL MORIR** [Hades]: 15 líneas en 3 niveles según
  qué tan lejos llegaste ("¿Eso es todo lo que juntaste?" → "…empiezas a
  preocuparme, remiendo."), en la pantalla de muerte.
- ✅ 66 tests (6 nuevos: apex ×2, dorada ×2, némesis ×2). **Pase 9 de balance**:
  el paquete inflaba el win (+30pp) → miedo apex roto al acorralar, APEX 0.5→
  0.25, daño/oleada 0.16→0.22 ⇒ casual 35 / medio 60 / bueno 92, cap 0.
- ☐ Check (Luis): la dorada emociona, la cicatrizada se siente personal, el
  APEX se siente jackpot, el rugido mete miedo, las líneas de muerte pican.

**T-FIX-PLAYTEST-1. Lo que vio Luis en su primer playtest (4 sep)** ✅ código / ☐ re-check
- **Cilindros en vez de Axies**: el tope `MAX_MIXER_PREYS` contaba instancias
  CREADAS en total y el pool es por-genes — tras ~12 axies distintos, toda
  presa nueva quedaba en cápsula para siempre. Fix: tope 16 sobre vivas+libres,
  DESALOJO de instancias libres de otros genes al toparse (sin dispose: los
  materiales del mixer son compartidos), y REINTENTO cada 0.9 s (máx 3) para
  cápsulas a la espera.
- **El cambio de mapa no se veía**: ahora el territorio se reviste ENTERO —
  textura de suelo propia (musgo+pasto / vetas de duna / grietas incandescentes),
  rocas-obstáculo con OTRA FORMA (peñascos / lajas apiladas / agujas torcidas),
  decoración esparcida (matas y flores brillantes / ondas de duna y huesos /
  grietas rojas y púas), cristales, aro y niebla tintados por bioma.
- **Transición de VIAJE** (idea de Luis, versión fundido): al cruzar, el mundo
  espera, funde a negro con "LA QUIMERA VIAJA…" mientras ella camina, en negro
  se cambia todo, aparece el nombre del territorio y amanece el nuevo bioma
  (2.8 s). El pasillo jugable queda anotado como idea R2.
- ☐ Check (Luis): ya no hay cilindros; el viaje se siente viaje.

**T-ESCALAR. "Todos los puntos en fuertes" (4 sep, directiva de Luis)** ✅ código / ☐ re-check
- **Tutorial del primer minuto** (el camino del juez): 5 pasos que avanzan con
  la acción real (muévete → persigue y ataca → derríbala → absorbe/devora →
  listo), variantes touch/desktop, una sola vez (`quimera.tutorial`), no sale
  si empiezas en territorio avanzado.
- **Audio escalado**: bus maestro con compresor + reverb por convolución
  (impulso generado, cero assets), pads de sierras desafinadas con filtro vivo,
  percusión adaptativa (kick+hat crecen con la oleada; con peligro, al doble),
  brillo alto cuando aprieta. Todo sigue detrás de los overrides por archivo.
- **Título cinematográfico**: logo con glow animado, tagline narrativa ("El
  Primordial te despedazó…"), 3 cards CAZA/ABSORBE/SOBREVIVE, CTA pulsante.
- **Deploy des-riesgado**: `vercel.json` con caché inmutable para `/assets`
  (revisitas instantáneas de los 179 MB), copiado a dist en build:deploy.
  ⚠️ Falta `npx vercel login` de Luis → luego `cd dist && npx vercel deploy --prod`.
- **Docs de submission actualizados**: pitch/descripciones con rig real,
  territorios, jefes, dorada/némesis/apex, 66 tests, 9 pases; visión R2
  (pasillos jugables, crianza, leaderboard por Axie). Guion del video reescrito
  beat por beat con las tomas nuevas (LA toma = el injerto en el rig real).
- ☐ Check (Luis): el tutorial no estorba y se entiende; la música nueva suena
  a juego, no a demo; el título da ganas de jugar.

**T-ORQUESTA. Música híbrida cinematográfica (4 sep: "¿orquesta?" → "dale")**
✅ código / ☐ el oído de Luis
- Decisión: síntesis pura no imita una orquesta real — se roban los GESTOS
  (timbales, coro, stabs, dinámica), no los timbres. Para orquesta real:
  `public/audio/music.ogg` (el override ya existe).
- **Timbales** (seno con caída de pitch + baqueta de ruido), **coro fantasmal**
  (sierras con vibrato por filtros de formantes "aah"), **stabs de cuerdas**
  (ensamble desafinado, ataque duro, filtro que cierra), **crescendo de
  platillo** al entrar el peligro.
- **Arreglo por territorio**: PRADOS arpa pastoral · MAR DE POLVO timbales en
  1 y 3 + redoble cada 4 compases · CICATRIZ coro en raíz y quinta sobre
  timbal-latido, arpa casi muda.
- **STINGER orquestal** al aparecer cada Alfa (platillo-crescendo → timbal +
  stab de metales → timbal grave). Override: `stinger.ogg`.
- ☐ Check (Luis): la Cicatriz con coro pone la piel chinita; el Mar suena a
  tambores de guerra; el stinger del Alfa asusta.

**T-JUICE. El pase de "se ve/se siente caro" (7 sep, tras la duda de Luis vs
la competencia bonita: la idea se queda, la percepción se escala)** ✅ código / ☐ ojos de Luis
- **Hit-stop**: el mundo se congela 40 ms al conectar (75 ms crítico, 100 ms
  derribo, 120 ms ultimate) — el truco #1 de game feel de Brawl Stars/Hades.
- **Partículas de impacto** (pool fijo de 320 Points aditivos, rebote en piso):
  esquirlas del color de clase al golpear, doradas al derribar, verdes al
  devorar, blancas en crítico/perfecta, explosión en meteorito y ultimate,
  **trail de chispas en la esquiva**.
- **Sombras reales** (sol direccional + PCFSoft 1024) para rocas/decoración y
  suelo receptor; **blob-shadows** bajo presas y Quimera (los shaders del mixer
  no soportan el pase de profundidad — radial falso, mismo anclaje visual).
- **Saturación APEX**: la exposición ACES sube 1.15→1.34 mientras dura el
  jackpot — el mundo entero se enciende contigo.
- ☐ Check (Luis): los golpes PESAN; el juego ya no se ve "flotante"; 60 fps se
  mantienen en móvil (probar `?fps`, sospechoso #1: sombras — bajar mapSize a
  512 si cae).

**T-BLINDAJE. QA + envoltura de entrega (7 sep, "que más que más")** ✅
- **Bug real cazado en QA headless**: sin WebGL el juego se colgaba en
  "despertando…" para siempre (THREE lanza al crear el contexto, a nivel de
  módulo). Ahora: mensaje claro "tu navegador no pudo crear WebGL — prueba
  Chrome/Edge/Safari". Verificado con captura en Chromium headless.
- **Pantalla de carga digna**: logo QUIMERA con glow + pulso + aviso "la
  primera visita descarga la luna — las siguientes son instantáneas" (junto
  con el caché inmutable de vercel.json, gestiona la expectativa del peso).
- **Últimas palabras del Primordial al VENCERLO** (5 líneas, simetría con las
  15 de muerte): "«No eras presa. Nunca fuiste presa.»"
- **README reescrito** al juego actual (requisito de entrega: instrucciones de
  correr; ahora también loop completo, territorios, robos, audio, controles).
- ⚠️ Sigue pendiente de Luis: `git init` + repo privado en GitHub (requisito),
  `npx vercel login` → deploy, thumbnail, video. Round 1 abre el 8 sep.

**T-POTENCIA. Segundo "qué más" (7 sep)** ✅ código / ☐ ojos de Luis
- **Celebración del injerto** (la toma del 35%): al llegar la esencia, texto
  "+CUERNO BEAST ★L2" del color de la clase, ráfaga de 22 chispas, onda anular
  y 0.28 s de cámara lenta. Cada absorción se siente GANADA.
- **La caída del Primordial**: derribarlo dispara 1.3 s de cámara lenta,
  shake, "EL PRIMORDIAL CAE", erupción de 40 chispas doradas y stinger.
- **COMPARTIR**: botón en muerte y victoria — copia (o share nativo móvil)
  "QUIMERA 🌙 ¡LUNACIA ES MÍA! con mi Axie #123 · 4820 pts · bestiario 18/74 +
  link". El loop social del holder, en un botón.
- **Modo foto (tecla H)**: esconde HUD/radar/paneles para thumbnail y tomas de
  video limpias.
- **Guardia de rendimiento**: 3 s bajo 42 fps → apaga sombras y baja
  pixelRatio solo (protege a jueces con teléfonos débiles).
- ☐ Check (Luis): el injerto se siente premio; el final del Primordial es
  clímax; el texto de compartir da orgullo.

**T-AXIECORE-2. Refuerzo de interacción con el ecosistema (7 sep, preguntas de
Luis: ¿AXP? ¿incentivos? ¿multijugador? ¿competitivo? ¿tokens?)** ✅ código / ☐ ojos de Luis
- **CACERÍA DEL DÍA** (botón en el título): mapa y rng salen de la fecha — la
  misma luna para todo el mundo hoy; siempre arranca en oleada 1 (cancha
  pareja); el COMPARTIR lleva el tag del día. Competitivo comunitario sin
  servidor, gracias al motor determinista.
- **Historia por Axie**: cada Axie adoptado acumula sus cacerías y su récord
  propio (`quimera.axiestats.<id>`), visible al adoptarlo en el título y en la
  pantalla final ("axie #123: cacería nº14, su récord 5820"). Es la semilla
  del gancho AXP de R2.
- **Bestiario → Marketplace**: cada parte absorbida es link a
  `app.axieinfinity.com/marketplace/axies/?part=<id>` — descubres partes
  cazando, las ves en Axies reales en venta. Tráfico al ecosistema HOY.
- **Roadmap escrito en submission.md**: AXP vía el programa de builders
  aprobados + Ronin Waypoint (R2); leaderboards VERIFICABLES por re-simulación
  de la traza de inputs (el determinismo como anti-cheat); multijugador async
  (fantasmas de la diaria, némesis compartida); tokens solo dentro de
  programas aprobados — cero promesas de tokenomics.
- ☐ Check (Luis): probar la diaria + el link del marketplace desde el
  Bestiario (verificar que el filtro `?part=` carga bien en el marketplace).

**T-COLMILLO. "¿Quedó lo de agarrar herramientas para matar más rápido?" (9
sep, Luis)** ✅ código / ☐ re-check
- Respuesta honesta: estaba a medias (la reliquia da mudas, algunas de daño) —
  el ARMA directa no existía. Ahora sí: **⚔ COLMILLO DE METEORO**, cuarta
  herramienta encontrable (gema roja): al pisarla, tus golpes hacen **×1.6 por
  22 s**. Anuncio en grande + hit-stop al agarrarla, y "· ⚔" junto a MANADA en
  el HUD mientras dura. 77 tests (daño ×1.6 verificado).
- ☐ Check (Luis): encontrar el colmillo cambia cómo juegas esos 22 s (buscas
  pelea) — esa es la señal de que el arma funciona.
- **v2 (mismo día, "yo me refería a bates, fierros")**: el arma ahora SE VE —
  tres fierros de chatarra lunar (TUBO DE LA ESTACIÓN, LLAVE DE MISIÓN, PUNTAL
  DEL CASCO) tirados en el suelo con halo rojo; al pisarlos la Quimera lo
  carga EN LA BOCA (perro con palo depredador), lo BLANDE en cada zarpazo
  (swing de 160 ms), y a los 22 s "se rompe de tanto madrazo" (toast + chispas
  grises). Mismo motor (×1.6); todo el teatro es render.

**T-CUERPOS. "¿No es raro que atravesemos los objetos?" (9 sep, Luis)** ✅ código / ☐ re-check
- Causa: solo las rocas del motor colisionaban; los landmarks eran del render
  (posiciones al azar) — fantasmas por diseño accidental.
- **Los props ahora son del MOTOR** (`sim.props`, deterministas por semilla):
  transbordador, antena, monolito, módulo, bandera, gran cráter y las 3
  guaridas — sus círculos entran al sistema de colisión (jugador, presas y
  CARGAS de jefe los respetan: estrellarse contra la propia cueva = aturdido).
- El render los viste donde el motor dice; los 3 restos existen SIEMPRE en la
  luna (geografía global, no por territorio). Sin roca-visual encima de props.
- **Paredes que resbalan**: `pushOut` rota el contacto ~6° — empujar de frente
  exacto ya no ancla a nadie (mató deadlocks de presas/jefes contra guaridas
  que colgaban 2-3 runs del balance, y de paso mejor feel para el jugador).
- Sin colisión (a propósito): pasto, púas, guijarros, cráteres caminables.
- Balance re-medido: 35 / 72 / 95, cap 0. 76 tests.
- ☐ Check (Luis): chocas con el transbordador/módulo/cuevas; nada se siente
  "pegajoso" al rozarlo.

**T-RELIEVE. "No siento que estemos en la luna, todo es plano" (9 sep, Luis)** ✅ código / ☐ re-check
- **La luna ONDULA**: función de altura determinista (`terrainY`, 3 octavas de
  ondas suaves, ±~1.5 u, longitudes 40-150 u) deforma el terreno JUGABLE — el
  motor sigue siendo 2D puro; la altura es 100% visual.
- **TODO se asienta en el relieve**: Quimera, presas, rocas, cráteres,
  decoración, landmarks, cuevas, gemas, rover, faro, huellas, guijarros, polvo,
  partículas (nacen y rebotan sobre la altura local), textos flotantes, anillos
  de efectos, marcador, retícula, línea de carga y aviso de meteorito.
- **La cámara respira con el terreno** (sube/baja 0.8× la altura local).
- ☐ Check (Luis): al caminar se SIENTEN las lomas; nada flota ni se entierra;
  60 fps se mantienen.

**T-LUNA-CON-DIENTES. "No veo cuevas ni especiales; viajar aburre" (9 sep,
Luis)** ✅ código / ☐ re-check
- **FERALES**: 35% de la fauna errante NO huye — te caza a 12 u (anillo naranja
  latiente + borde naranja en radar). Viajar entre manadas ya tiene emboscadas.
  Balance se auto-corrigió: medio 87→82, bueno 100→95 (37/82/95, cap 0).
- **DORADA GARANTIZADA**: cada territorio paga UNA dorada segura (el primer
  errante del territorio nace dorado, con su anuncio + ping en radar) — el
  jugador la CONOCE en vez de depender del 2%.
- **CUEVAS v2**: el doble de grandes, con montículo-cerro detrás, boca negra de
  3 u y **dos ojos rojos latiendo adentro** mientras su Guardián siga vivo (se
  apagan al superar su manada). El faro apunta a ellas en oleadas 3/6/9.
- **Cráteres v3 (geometría real)** + partículas redondas + Earthrise ya
  entregados en este mismo día.
- 76 tests (feral persigue; dorada garantizada por territorio).
- ☐ Check (Luis): un feral te emboscó y se sintió BIEN; encontraste la dorada;
  los ojos de la cueva dan miedito de lejos.

**T-FIX-PLAYTEST-3. Earthrise + cráteres con volumen + ataque coherente (9 sep,
Luis)** ✅ código / ☐ re-check
- **Earthrise**: Tierra ×2.4 (radio 22), baja sobre el horizonte, al doble de
  distancia; far plane 160→300 (también arregla clipping del domo al alejar).
- **Cráteres v2**: sombra interna DESPLAZADA (media luna = volumen), arco de
  borde iluminado hacia el sol + arco en sombra, manto de eyecta, micro-
  impactos; los grandes llevan **borde físico** (toro aplastado con rockMat)
  que proyecta sombra real.
- **Ataque "por la espalda"**: el arco salía hacia donde el MOTOR golpea
  (zarpazo magnético) mientras el modelo giraba suave 150 ms → parecía
  aleatorio. Fix: al atacar, el cuerpo da el LATIGAZO instantáneo hacia la
  dirección real del golpe — arco y cuerpo siempre alineados.
- ☐ Check (Luis): cráteres ya no chafas; el ataque siempre se ve "de frente".

**T-CIELO-INFINITO. "¿Por qué la Tierra está SOBRE la luna? jaja" (9 sep,
captura de Luis)** ✅
- Causa: la Tierra (y sol, halo, domo, estrellas) estaban clavados en
  coordenadas del MUNDO desde la era de la arena r22 — con la luna r120 podías
  caminar hasta pararte debajo del planeta.
- Fix: `skyGroup` — todo lo celeste vive en un grupo que sigue al jugador
  (posición = cámara en XZ): el cielo se ve idéntico desde cualquier punto de
  la luna y es INALCANZABLE, como debe ser un cielo. Las fugaces incluidas.

**T-ALUSION-LUNAR. "Más detalle al transbordador/rover + más alusiones a la
luna" (9 sep, Luis)** ✅ código / ☐ ojos de Luis
- **Transbordador detallado**: toberas quemadas dobles, cúpula de cabina
  metálica, SURCO de derrape de 9 u con escombros del casco regados, y baliza
  de emergencia roja que PARPADEA (desde hace años).
- **Rover detallado**: panel solar azul inclinado, antena de plato, dos faros,
  RTG trasero — y sombras propias.
- **Íconos lunares nuevos (uno por luna, posiciones por run)**: la BANDERA
  plantada (tiesa — no hay viento), el MÓDULO DE ATERRIZAJE (foil dorado, 4
  patas con zapatas) con 12 huellas de astronauta que se alejan… y no vuelven,
  y el GRAN CRÁTER de impacto (decal ×16 + anillo de 9 escombros).
- **Polvo de regolito** al correr (partículas grises bajas, sutiles).
- ☐ Check (Luis): los restos invitan a acercarse; la bandera y el módulo se
  encuentran explorando y cuentan historia sin texto.

**T-LUNA-VIVA. Feedback del playtest de la luna (9 sep, Luis: "sigue limitado,
sitios vacíos, casi no hay axies, las oleadas no tienen sentido, cámara")** ✅ código / ☐ re-check
- **Luna más grande**: radio 88 → 120 (~86% más área), terreno 640, 60 rocas,
  72 guijarros, decoración +30-40%, 16 herramientas.
- **CRÁTERES pintados** (30): tazón oscuro + borde que atrapa la luz + micro-
  impactos internos, por toda la luna.
- **HUELLAS en el polvo**: la Quimera deja pisadas alternadas que se asientan
  en ~8 s; el rover deja rodadas anchas dobles. (En la luna no hay viento.)
- **FAUNA SALVAJE**: 7 Axies errantes repartidos por la luna, se reponen solos
  — SIEMPRE hay algo que cazar de camino. No cuentan para la manada ni
  bloquean la muda; sí dan botín/score y pueden ser doradas o cicatrizadas.
- **Re-encuadre**: "OLEADA X/9" → "**MANADA X / 9**" y "LA GUARIDA FINAL"
  ("HERD X / 9" / "THE FINAL LAIR") — el lenguaje del viaje, no de la arena.
- **CÁMARA AUTO-SIGUE tu rumbo**: gira suavemente hacia donde te mueves; si
  giras a mano (arrastre/flechas/⟲⟳), tu mano manda con 2.5 s de gracia.
- Perf: los rigs del mixer solo se cargan a <38 u del jugador (la fauna lejana
  es cápsula tras la niebla; al acercarte se viste sola).
- **Pase 12**: la fauna rompió al BOT (perseguía errantes infinitos: cap 43-50
  runs sin terminar) → el bot ahora prioriza la MANADA como un humano que
  sigue el faro; la fauna-comida-gratis se cobró con daño/oleada 0.32→0.36 ⇒
  **casual 38 / medio 87 / bueno 100, cap 0** (generoso: la ventaja del bot
  alto es esquiva sobrehumana). 74 tests (fauna: repone y no cuenta oleada).
- ☐ Check (Luis): la luna se siente VIVA y sin vacíos; siempre hay caza; la
  cámara acompaña sin marear; los cráteres y huellas venden la luna.

**T-RETENCION. Los 10 robos de la crema y nata (9 sep, "investiga y ejecuta
las 10")** ✅ código / ☐ playtest de Luis
1. **INSTINTO SALVAJE** [Hades Death Defiance]: la primera muerte del run te
   revive al 30% con 1.6 s de invulnerabilidad — anuncio + slow-mo + estallido.
2. **SED DEL DEPREDADOR** [Doom]: cada derribo cura +4 — agredir es sobrevivir.
3. **FLUJO DE CAZA** [Dead Cells]: conectar da +15% velocidad por 0.9 s.
4. **BOTÍN DEL GUARDIÁN** [Diablo]: el Alfa caído suelta una RELIQUIA (muda
   extra) donde murió.
5. **PRESA MARCADA** [Hunt: Showdown]: 1 bounty por manada (corona dorada
   chica) — derribarla = +150 pts y +15% de ultimate.
6. **MUDA DORADA** [Slay the Spire / recompensa variable]: 12% de las mudas
   aplican DOBLE — anuncio ★ + campanillas.
7. **CAZA VELOZ**: limpiar la manada en <45 s = +100 (empuja al flow).
8. **REVANCHA**: botón dorado al morir — reintenta EXACTAMENTE la misma luna
   (misma semilla de mapa Y de rng). El gancho del "casi lo logro".
9. **RACHA DE DÍAS** [Wordle/Duolingo]: días consecutivos jugados, visible en
   el título (con perdón de un día al mostrar).
10. **GESTAS**: 8 medallas persistentes (primer injerto, apex, dorada,
    venganza, guardián, victoria, coleccionista, jinete lunar) con toast 🏅 y
    contador en el título.
- **Pase 11 de balance** (3 iteraciones): el paquete regalaba el run (55/88/98)
  → revive 40%→30% y daño/oleada 0.22→0.32 ⇒ **casual 35 / medio 77 / bueno
  98, cap 0** — generoso adrede: el bot medio/bueno esquiva con consistencia
  sobrehumana; el humano equivalente queda muy por debajo. Playtest arbitra.
- ✅ 73 tests (instinto salvaje 2-vidas, bounty score+ult, botín del guardián).

**T-LUNA-ABIERTA. "Vamos a arriesgarnos, ejecuta el paquete completo" (8 sep,
decisión de Luis — revierte la recomendación conservadora)** ✅ código / ☐ EL playtest
- **La luna es el mundo**: radio jugable 22 → 88 (~16× de área), terreno 440,
  42 rocas, decoración ×2, zoom-out hasta 3.1 para leer el viaje.
- **MANADAS como lugares**: 9 anclas deterministas por semilla en un camino
  con giros que se aleja del inicio (la 1ª a 13 u — acción inmediata); las
  presas spawnean alrededor de SU ancla.
- **QUERENCIA** (la clave que salva el diseño): la presa jamás abandona el
  territorio de su manada — al llegar al límite arquea rodeando su hogar.
  Cazable por intercepción; sin esto toda persecución era infinita.
- **Navegación**: FARO dorado (pilar de luz pulsante en la manada activa),
  radar LOCAL centrado en ti con flecha de borde hacia la manada lejana,
  toast "sigue la SEÑAL" cuando la siguiente manada está lejos.
- **HERRAMIENTAS encontrables** (12 por luna, de la semilla): RELIQUIA LUNAR
  (muda extra al pisarla), CRISTAL DE VIDA (+30), NÚCLEO DE PODER (+50% ult).
  Gemas flotantes con halo, rombos en el radar.
- **EL ROVER ES MONTABLE**: písalo en movimiento → velocidad ×1.9; atacar /
  esquivar / cosechar / recibir daño desmonta y lo aparca ahí. La Quimera
  viaja a bordo con las ruedas girando. Cuadrito blanco en radar.
- **CUEVAS-GUARIDA**: boca de cueva (colmillos + dintel + fauce negra) en las
  anclas de los Guardianes (oleadas 3, 6, 9), mirando al centro.
- Meteoritos ahora CAEN CERCA DEL JUGADOR (la luna entera ya no aplica).
- **Pase 10 de balance** (3 iteraciones): la luna abrió picos — meteoro
  siempre-encima (16→23), presa volteándose a pelear en el borde de querencia
  (cornered 5→3.2, umbral −0.8), y el asesino real: la querencia COMPRIME a
  la manada y venganza 9 enfurecía al territorio entero (→5.5, hogar 15→17).
  Curva final: **casual 22 / medio 48 / bueno 88, cap 0** (~3-4.5 min).
- ✅ 71 tests (5 nuevos: spawn-en-ancla, querencia acotada, pickup cura,
  reliquia→muda, rover monta/acelera/desmonta).
- ☐ Check (Luis): el viaje entre manadas EMOCIONA (no aburre); el faro se
  entiende solo; encontrar el rover es un momento; la reliquia se celebra;
  60 fps en móvil con el mundo grande (`?fps` — sospechoso: decoración ×2).

**T-LUNA. "¿Y si abrimos toda la luna?" (8 sep, Luis)** — decisión + ejecución parcial ✅
- **Decisión (recomendada por Claude, pendiente del OK final de Luis)**: NO
  romper la arena a 13 días del cierre — el motor entero razona sobre ella
  (spawns, huida/acorralar, meteoritos, victoria, 9 pases de balance). La luna
  abierta es EL juego de Round 2, no un parche de Round 1.
- **Lo que sí entró HOY de esa visión**: LANDMARKS por territorio —
  transbordador estrellado con musgo (Prados), rover explorador de 6 ruedas
  (Mar de Polvo), monolito antiguo con vetas incandescentes (Cicatriz). La
  luna cuenta su historia; capturas mucho más ricas.
- "Axies especiales en las sombras" ya existe (dorada/cicatrizada/dormidas) y
  así se pitchea.
- **Visión completa escrita en submission.md** (20% del score): luna abierta,
  cuevas-guarida de bosses, herramientas de expedición, vehículos rescatables
  (los restos de hoy se vuelven montables en R2).
- ☐ Check (Luis): encontrar los 3 landmarks jugando; ¿de acuerdo con arena
  ahora / luna abierta en R2?

**T-FONDO. Lo invisible que un juez sí sufre (8 sep, "qué te falta a ti")** ✅
- **Fuga de GPU arreglada**: cada cambio de territorio creaba geometrías de
  cristal nuevas sin disponer — ahora es una compartida escalada.
- **Audio se calla al cambiar de pestaña** (el rAF pausaba el juego pero
  WebAudio seguía sonando — molesto para un juez que tabea).
- **Pool precalentado durante el título**: los rigs del primer territorio se
  cargan mientras lees — el primer minuto del juez casi sin cápsulas.
- **La Cicatriz es NOCHE de verdad**: hemi 0.55→0.38, niebla a 44, y tu aura
  sube a 52 lúmenes con alcance 16 — tu luz ES la lámpara del territorio.
- **Corona del Guardián**: octaedro rojo flotante girando sobre cada Alfa —
  se distingue a cualquier distancia.
- **Tu récord en el título**: "TU RÉCORD 5820 · BESTIARIO 18" bajo el CTA.
- Con esto, mi backlog estructural queda VACÍO: lo que sigue depende del
  playtest de Luis, el `vercel login`, y la URL del filtro del marketplace.

**T-CINE. Tercer "qué más" — el pack de cine (7 sep)** ✅ código / ☐ ojos de Luis
- **Intro de jefe con letterbox**: al aparecer un Alfa, barras de cine + nombre
  ("GUARDIÁN DE LA CICATRIZ" / "EL ALFA PRIMORDIAL") + el stinger. 2.2 s.
- **RACHAS**: derribos encadenados en ventana de 4 s → "¡RACHA ×3!" dorado que
  crece; ×4+ suena campanillas. Premia el momentum sin tocar el motor.
- **Disolución**: la presa que expira sin cosecha se deshace en polvo gris
  (partículas) en vez de desaparecer de golpe.
- **Ping de DORADA en radar**: círculos dorados expandiéndose donde apareció
  (2.4 s) — ya no se escapa por no encontrarla.
- **Vida baja**: latido pum-pum cada 1.1 s + viñeta roja que respira bajo 30%
  de vida. La urgencia se siente sin números. Override: `heartbeat.ogg`.
- **Cinemática de victoria**: 1.8 s de órbita triunfal alrededor del monstruo
  antes de que aparezca el panel de "LUNACIA ES TUYA".
- ☐ Check (Luis): la intro del Guardián impone; la racha se siente arcade; el
  latido estresa (bien); la órbita de victoria remata el clímax.

**T-I18N. "El jurado no habla español" (7 sep, Luis)** ✅ código / ☐ ojos de Luis
- **Todo el juego es bilingüe**: auto-detección por navegador (es → español,
  resto → inglés) + botón de idioma en el título (persiste y recarga).
- Diccionario central `T` en main.ts: título, tutorial, HUD, cosecha, muda,
  bestiario, anuncios, toasts, contratos, territorios (THE MEADOWS / THE DUST
  SEA / THE SCAR), mutaciones (THIRST FOR POWER…), ultimates, 15 taunts + 5
  líneas de victoria del Primordial, compartir, modo foto, error WebGL.
- **El motor ya no dicta texto de UI**: los contratos se redactan en render
  desde sus campos (`contractText`), territorios/mutaciones se mapean por id.
- index.html (título, metas OG, pantalla de carga) en inglés — la primera
  impresión del juez.
- ☐ Check (Luis): pasar el juego completo en EN (botón del título) y ver que
  nada quede en español; tu experiencia en ES sigue intacta por defecto.

**T-FIX-MARKETPLACE. El deep-link `?part=` no filtra (7 sep, captura de Luis)** ✅ parcial
- El marketplace nuevo ignora `?part=` (97,182 = sin filtro) y Cloudflare
  bloquea probar formatos headless. Solución garantizada: tocar una parte del
  Bestiario COPIA su nombre y abre el marketplace — pégalo en el filtro Parts.
- ☐ Mejora pendiente: Luis aplica un filtro de Parts a mano en el marketplace
  y pega aquí la URL resultante → restauro el deep-link real.

**T-FIX-PLAYTEST-2. "Empezar en la Cicatriz arrancaba en los Prados" (7 sep,
visto por Luis)** ✅
- Causa: la sim se crea al cargar la página, ANTES de que el título deje
  elegir territorio/Axie; los botones solo cambiaban `startWave` y nadie
  reconstruía. Fix: despertar desde el título fuerza `pendingRestart` (la
  reconstrucción ya lee la elección actual). Además, empezar en territorio
  avanzado ya no muestra el tutorial.

## Compuerta final

**T-PLAYTEST. El playtest-veredicto de Luis** ☐ *(consolida TODOS los checks de
sensación pendientes arriba — un run largo en desktop + uno en móvil bastan)*
- Combate: telegraph legible, morir es culpa propia (T1/T2) · cosecha se entiende
  sin leer nada (T3) · HUD/sinergia se explican solos (T4) · 60 fps con `?fps`
  (T5) · arcos distinguibles (T6r) · los 3 primeros arrancones se sienten poder
  (T-EVO) · la cacería emociona y el Alfa impone (T-HUIDA) · el ser amorfo se lee
  y las partes se ven aparecer (T-AMORFO) · táctil fluido con zarpazo magnético
  (T-TOUCH) · la final se siente ganada (T10) · todo suena (T11) · la dificultad
  con humano de referencia confirma o ajusta la curva (T13).
- Al pasar: los ✅ se propagan a cada tarea y se mueven a "Hecho". Lo que falle,
  se itera puntual.

## D12 — freeze

**T15. Submit**
- `DISCLOSURES.md` final (repasar contra package.json y assets), README con
  instrucciones de correr, freeze de código, submit del link.
- ☐ Check: Enviado.

---

## Reglas permanentes

- Motor puro: cualquier feature nueva entra primero como test en `src/engine/`.
- Constantes solo en `constants.ts`; anotar [provisional]→[medido] en el design doc.
- `DISCLOSURES.md` se actualiza en el mismo commit que agrega la dependencia/asset.
- Si el loop completo no se siente bien en el checkpoint T7: **cortar scope, no
  agregar sistemas** (orden en design doc §9).
