# QUIMERA

Entrada al **Axie Vibeathon 2026** (Round 1). El Alfa Primordial te despedazó:
renaces como un rig real de Axie con nada más que una boca, y te reconstruyes
cazando — cada parte que arrancas es una parte REAL de un Axie real, y tu
cuerpo se re-arma con ella a la vista.

Action roguelike 3D en browser. **Caza. Arranca. Conviértete.** Sin wallet, sin
cuenta, sin backend.

## El loop

- Las presas **huyen de ti** (tú eres el depredador); pelean si las alcanzas,
  si las acorralas, o para **vengar a un caído**. Los **Guardianes te cazan a
  ti** con patrones telegrafiados (carga en línea, rugido, exhausto = crítico).
- Derriba una presa y elige: **ARRANCAR** una parte (ranura vacía = desbloqueas
  la habilidad · mismo grupo de clase = tu parte sube de nivel · grupo distinto
  = cambio de build) o **DEVORAR** (única curación).
- 3 partes del mismo grupo = **SINERGIA**; las 4 = **APEX** (jackpot: más daño,
  el mundo satura y tu propio grupo te teme).
- El viaje cruza **3 territorios** (Los Prados → El Mar de Polvo → La Cicatriz),
  cada uno con su bioma, sus clases de presa, su clima y su música.
- **LA MUDA**: al limpiar cada oleada eliges 1 de 3 mutaciones. Contratos de
  caza por territorio = muda extra.
- Drama emergente: la **PRESA DORADA** (2%, jackpot), la **NÉMESIS** (la presa
  que se te disuelve sin cosechar dos veces vuelve CICATRIZADA y te recuerda,
  entre runs), la esquiva **PERFECTA** con cámara lenta, el **ULTIMATE** del
  dorso por clase.
- Devora al **Alfa Primordial** en la oleada 9 y Lunacia es tuya.
- Opcional: escribe el **ID de tu Axie** en el título y tu Quimera nace de él
  (dato público del gateway GraphQL; cero wallet, una sola llamada opt-in).

## Correr

```sh
npm install
npm run copy-axie-assets   # copia el pack sellado del mixer (588 MB) a public/assets/axie
npm run dev                # http://127.0.0.1:5173
```

`public/assets/axie/` no se versiona (ver RIGHTS.md del toolkit); se regenera
con el comando de arriba.

Deploy: `npm run build:deploy` produce `dist/` autocontenido (~205 MB: el pack
se poda al subconjunto que el juego usa con `scripts/prune-assets.mjs`; incluye
`vercel.json` con caché inmutable para los assets).
Probar en red local: `npx vite preview --host 0.0.0.0 --port 4173`.

## Controles

**Desktop:** WASD mover · el cursor **elige presa** (marcador + retícula; el
zarpazo magnético pone la precisión) · Space esquiva · LMB boca · RMB cuerno ·
E cola · Q dorso (ULTIMATE con la carga llena) · R reiniciar · B bestiario ·
rueda = zoom · arrastrar con click sostenido (o ←→) = órbita 360°. Cosecha:
**un click** en una parte del panel = absorber · click DEVORAR (o mantén F) =
curar.

**Táctil:** joystick virtual (mitad izquierda) · auto-apuntado con marcador ·
los chips del HUD atacan (con zarpazo magnético) · botón ESQUIVA · cosecha de
un toque · arrastrar en la mitad derecha = órbita · pellizco = zoom. Radar
arriba a la derecha.

La primera partida trae un **tutorial de un minuto** que se enseña jugando.

## Audio

SFX y música 100% procedurales (WebAudio): bus con compresor + reverb por
convolución, música generativa adaptativa con arreglo por territorio (arpa /
timbales / coro de formantes) y stinger orquestal de jefe. Cualquier sonido se
puede reemplazar soltando `public/audio/<nombre>.ogg|mp3` (lista de nombres en
`src/audio.ts`); `music.ogg` / `ambient.ogg` en loop apagan los generativos.

## Tests

```sh
npm test           # motor puro (Vitest, 66 tests): combate, estados, jefes, cosecha
npm run typecheck
npm run balance    # suite headless: bot jugador × 3 perfiles × 60 runs sembrados
```

El motor de juego (`src/engine/`) es puro: tick fijo 60 Hz, rng inyectado, sin
imports de Three/DOM. El render consume estado, nunca lo produce. La curva de
dificultad se tunea contra la suite de balance (9 pases documentados).

## Diseño y plan

- **`docs/quimera-diseno.md`** — design doc vivo (decisiones etiquetadas con
  [decidido]/[provisional]/[simulado] y registro de 9 pases de balance en §7.5).
- **`docs/submission.md`** — textos de la entrega (pitch, Axie Core, visión R2).
- **`TASKS.md`** — tablero de tareas del greybox al submit.
- **`docs/video-guion.md`** — guion del video fallback de 2 min.
- **`DISCLOSURES.md`** — dependencias, assets, uso de IA y trabajo previo.

Decisiones estructurales: protagonista = rig real de Axie reconstruido por
cirugía de descriptores (toolkit oficial mixer 3D); caza invertida; nace solo
con boca y evoluciona cazando; 4 habilidades base × delta de clase; evolución
como sidegrade (cambia la forma de jugar, no solo números); cero gore (las
partes se transfieren como esencia estilizada, sin sangre).
