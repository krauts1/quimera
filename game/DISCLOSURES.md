# DISCLOSURES — QUIMERA (Axie Vibeathon 2026)

Mantener al día con cada cosa que se agregue. Regla del jam: declarar deps, assets,
IA y trabajo previo. Nunca commitear API keys.

## Dependencias

- `three@0.178.0` — MIT.
- `@jaatster/threejs-axie-mixer3d-public` (commit `812f0ee`) — toolkit oficial del
  Vibeathon (alpha pública). No es open source: uso limitado a Vibeathon y programas
  aprobados por Sky Mavis (ver su RIGHTS.md). Su pack de assets (5,821 archivos
  sellados, 588 MB) se copia a `public/assets/axie/` en build y NO se redistribuye
  en este repo. El deploy del juego sirve un subconjunto podado (~65 MB: solo los
  60 Axies sembrados y sus animaciones, calculado con `scripts/prune-assets.mjs`)
  como parte de la entrada al Vibeathon, conforme al uso permitido del toolkit.
- `vite`, `vitest`, `typescript`, `@types/three`, `@types/node` — dev-time,
  licencias propias (MIT/Apache).
- `esbuild` (MIT, ya incluido como dependencia de vite) — usado directo en
  `npm run balance` para compilar la suite de balance headless. Dev-time.

## Assets

- Cuerpos, partes, texturas, shaders y animaciones de Axie: del pack del toolkit
  (arriba). Propiedad de Sky Mavis / licenciantes de Axie.
- `public/data/axies.json`: 60 Axies reales (id, clase, genes, partes) sembrados
  vía el gateway GraphQL público de Axie durante el desarrollo de un proyecto
  previo (ver Trabajo previo). Datos de personajes, no assets binarios.
- Función opt-in "Caza con tu Axie": si el jugador escribe un ID en el título,
  el juego consulta el gateway GraphQL público (`graphql-gateway.axieinfinity.com`)
  UNA vez para obtener clase/genes/partes de ese Axie (dato público; sin wallet,
  sin cuenta, sin firma). Por defecto no hay ninguna llamada de red en juego.
- Audio: SFX y música generativa sintetizados en runtime con WebAudio
  (`src/audio.ts`), código propio. Sistema de overrides por archivo
  (`public/audio/*.ogg|mp3`) con fallback procedural: si se agregan archivos de
  audio (p. ej. packs CC0 de Kenney, o audio oficial del Builder Kit si lo
  incluye), se listarán aquí uno por uno con su fuente y licencia. Al día de
  hoy: la carpeta no existe — 100% procedural.

## Uso de IA

- Juego desarrollado con **Claude Code** (Anthropic) como asistente principal:
  diseño (sesión de office-hours con revisión adversarial), código, tests y
  documentación. Dirección creativa y decisiones: Luis Enrique Hernández.

## Trabajo previo (pre-existing work)

- **Spikes de la semana 2–7 sep 2026** (previos a la apertura del Round 1, 8 sep):
  evaluación del toolkit mixer 3D (página de estrés) y este scaffold. Declarados
  como trabajo previo conforme a §4 de las reglas.
- **Lunacia Front** (proyecto descartado del mismo autor, ago–sep 2026): de ahí se
  reutiliza únicamente `public/data/axies.json` (los 60 Axies sembrados). Código
  reutilizado: ninguno hasta ahora — si se copia algo, se listará aquí archivo por
  archivo.
