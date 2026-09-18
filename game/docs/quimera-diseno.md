# QUIMERA — Design doc

> **Estado de este documento.** Reconstrucción escrita el 2 sep 2026. La sesión
> original de office-hours (2 sep, 3 iteraciones de revisión adversarial) no se
> guardó como archivo; esto recupera sus decisiones desde el README, DISCLOSURES,
> `src/engine/constants.ts` y la memoria de la sesión. Cada valor está etiquetado:
> **[decidido]** salió de la sesión de diseño; **[provisional]** se inventó para el
> greybox y debe tunearse con la suite. Si aparece el doc original, manda él.

## 1. Fantasía y premisa

Eres la **Quimera** del lore de Lunacia: el monstruo cosido de partes robadas.
Cazas Axies, los derribas, y sobre el cuerpo caído eliges: **arrancarle una parte**
(y volverte otro monstruo) o **devorarlo** (y seguir vivo). El juego es esa
decisión, repetida bajo presión.

- Género: action roguelike 3D de oleadas, en browser. **[decidido]**
- Sin wallet, sin cuenta, sin backend, sin fetch en runtime. **[decidido]**
- Cero gore: las partes se desprenden como energía estilizada. **[decidido]**
- La Quimera es un **rig REAL de Axie con vestido de monstruo** **[decidido por
  Luis 4 sep, tras ver a la competencia usando el arte del toolkit como
  protagonista — reemplaza al ser amorfo del 2-3 sep]**: nace incompleta (solo
  boca/ojos/orejas — un Axie mutilado), y cada parte absorbida **reconstruye el
  rig con la parte real en su socket correcto** (cirugía de descriptores, la
  técnica del T9a original). Monstruosidad por vestido: aura violeta que
  respira, luz propia con latido, anillo de contacto (los tres se tiñen del
  color de tu sinergia), escala ×1.12. Con "Caza con tu Axie", TU Axie es el
  personaje en pantalla mutando con cada absorción.
- Implementación: las mallas de la parte se clonan del cuerpo de la presa al
  arrancarla (materiales del mixer intactos; los GLB de partes no tienen
  esqueleto) y **la presa pierde la parte a la vista**. La Quimera nace solo con
  la boca (robada a su Axie base) + ojos/orejas decorativos. Sin rig = sin
  rebuilds asíncronos; animación 100% procedural (pulso al atacar, estiramiento
  al esquivar, masa que respira).

## 2. Loop central

```
oleada → combate → derribo (ventana 3 s) → arrancar O devorar → sinergias → oleada+1
```

1. Entran presas por goteo (máx. 7 en campo; 7 + jugador = presupuesto de 8 criaturas). **[decidido]**
2. **La caza está invertida** **[decidido por Luis, 2 sep noche]**: las presas
   **huyen** de la Quimera (más lentas que tú: la esquiva es tu zarpazo) y pelean
   solo si las alcanzas (≤2.4 u), si quedan acorraladas contra el borde, o para
   **vengar a un caído** (derribo → presas a ≤9 u pelean 6 s con furia, +40% de
   daño). El **Alfa nunca huye: te caza** (velocidad ×1.25, daño ×1.8). El
   peligro vive en cosechar rodeado y en los Alfas.
3. Al llegar a 0 HP la presa **cae derribada**: 3 segundos de ventana de cosecha.
   Si expira, se disuelve sin recompensa. **[decidido]**
4. Sobre la presa derribada, mantener F:
   - **Devorar**: cura 35% del HP máx. + 5% por cada parte pasiva (ojos/orejas)
     que la presa conserve. Única curación del juego: no hay regeneración. **[decidido]**
   - **Arrancar**: toma una de sus 4 partes activas. La presa la pierde
     (devorarla después cura igual: las pasivas no se arrancan). **[decidido]**
     El destino depende de tu ranura equivalente **[decidido por Luis, 2 sep tarde]**:
     - **Vacía → EQUIPAR**: desbloquea esa habilidad (la Quimera nace solo con boca).
     - **Ocupada, mismo grupo de clase → ASIMILAR**: conservas TU parte y sube de
       nivel (+15% daño/nivel, tope 3; el nivel 2 cambia el modelo 3D).
     - **Ocupada, grupo distinto → CAMBIAR**: sidegrade (clase/sabor/sinergia).
5. Tensión de diseño: arrancar es progresión, devorar es supervivencia. La misma
   presa no puede darte todo.
6. El canal de cosecha (0.8 s) **no se cancela por recibir daño** — tragar bajo
   fuego cuesta la vida que pierdes mientras. Sí lo cancelan: moverte, esquivar,
   o que el cuerpo se disuelva. **[simulado 2 sep — sin esto, curarse bajo
   presión era inviable]**

## 2.4 Progresión que se siente [decidido por Luis 3 sep: "no siento progresión"]

1. **LA MUDA**: al limpiar una oleada (y cosechar sus cuerpos en paz — el
   intermedio no corre hasta que eliges), el mundo se detiene y eliges **1 de 3
   mutaciones** permanentes del run (8 en el pool: SED, FURIA, PIEL, VORAZ,
   ZARPA, REFLEJOS, CARROÑERA, CAZADORA — acumulables). La historia: la Quimera
   muda de piel con cada victoria.
2. **Identidad MECÁNICA por clase** (absorber cambia cómo juegas, no un número):
   aquatic = conectar RESETEA tu esquiva (build de movilidad) · beast = azota
   (empujón doble) · bird = alcance ×1.55 · plant = drena 22% · reptile =
   derribos ×1.8 (build de cosecha) · bug = híbrido rápido (cd ×0.85).
3. **El ratchet ya no se cancela**: escalado separado — HP de presas +5%/oleada
   (matas cada vez MÁS rápido: sientes el poder), daño +16%/oleada (los errores
   cuestan cada vez más: sientes la tensión). Reemplaza el +10% parejo
   [decidido] que anulaba la progresión.
4. **El objetivo tiene cara**: el ALFA PRIMORDIAL te despedazó — recuperas tu
   cuerpo cazando, y lo devoras en la oleada 9 (el anuncio final lleva su nombre).

## 2.5 Las tres metas (por qué juegas y por qué vuelves) [decidido por Luis 3 sep]

1. **Este run**: sobrevivir las 9 oleadas ("OLEADA N / 9" visible) y ganar la
   final de doble Alfa.
2. **Entre runs**: el PUNTAJE (derribos, cosecha, Alfas, victoria) contra tu
   RÉCORD persistente — runs de ~4 min, renacer instantáneo: one-more-run.
3. **Largo plazo**: el BESTIARIO — cada parte real de Axie que absorbes queda
   registrada para siempre; completarlo es el hook de colección. Es también el
   aporte a Axie: el juego enseña las partes/clases reales del universo
   cazándolas, sin wallet — un embudo de descubrimiento.

## 3. Partes, clases y sinergias

- 6 ranuras: 4 **activas** (boca, cuerno, cola, dorso) = habilidades; 2 **pasivas**
  (ojos, orejas) = solo valor de devorar (por ahora). **[decidido]**
- 6 clases en 3 grupos canónicos: beast+bug / aquatic+bird / plant+reptile. **[decidido]**
- **Sinergia**: ≥3 de las 4 activas del mismo grupo → +25% de daño. **[decidido]**
- **4 habilidades base × delta de clase**: la ranura define la habilidad (identidad,
  animación); la clase de la parte la modifica (sabor). **[decidido]** Deltas
  concretos **[provisional]**:

| Clase | Delta |
|---|---|
| beast | +25% daño |
| bug | +10% daño, −10% cooldown |
| aquatic | −25% cooldown |
| bird | +35% alcance |
| plant | roba vida 15% del daño |
| reptile | sus derribos duran +50% |

- Habilidades base **[simulado 2 sep]**: boca = mordida rápida (10 dmg, 0.5 s, arco 80°),
  cuerno = cornada pesada (26, 1.4 s, 55°), cola = barrido (15, 0.9 s, 170°),
  dorso = nova (22, 2.4 s, 360°).

## 4. Presas y oleadas

- Total por oleada = 3 + (oleada − 1); en campo nunca más de 7; el resto entra
  por goteo conforme caen. **[decidido]**
- Stats escalan +10% por oleada. **[decidido]**
- **Alfa** cada 3 oleadas: el contra-cazador — nunca huye, te persigue
  (HP ×2.2, daño ×1.8, velocidad ×1.25 **[simulado 2 sep]**). Su botín: partes
  activas a nivel 2. **[decidido; números del pase 4]**
- **Personalidad de huida por clase [decidido por Luis 3 sep, valores
  provisionales]**: aquatic es la más rápida (×1.3) · bird zigzaguea · bug corre
  en arranques y pausas · plant es lenta pero se hace bola (−28% daño recibido) ·
  beast se planta a pelear antes (rango ×1.8) · reptile NO huye: acecha inmóvil
  mirándote y su mordida de emboscada duele ×1.5. Cazar deja de ser perseguir
  bolitas: es leer a la presa antes de saltar.
- Las presas **encarnan Axies reales** de `axies.json` (clase, genes y sus 6
  partes reales; el render usa sus genes). **[implementado 2 sep]** El generador
  sintético (ranura en el grupo del arquetipo con peso 0.7 **[decidido]**) queda
  como fallback cuando no hay catálogo (tests, suite de balance).
- Run objetivo: 6–9 oleadas (~4–6 min). Referencia de balance, no regla dura. **[decidido]**
- Cómo termina un run ganado: **abierto** (ver §8).

## 5. Jugador

- HP 100, sin regeneración pasiva. **[decidido]**
- Esquiva con i-frames toda su duración (0.25 s, cooldown 0.9 s **[provisional]**).
- **La Quimera nace casi vacía: solo su mordida.** Cuerno, cola y dorso se cazan.
  Los primeros tres arrancones son los grandes momentos de poder del early game.
  **[decidido por Luis, 2 sep tarde — reemplaza al loadout inicial mixto]**
- Controles: WASD mover · cursor apunta · Space esquiva · LMB boca · RMB cuerno ·
  E cola · Q dorso · F (mantener) cosechar · R reiniciar. **[decidido]**
  (Greybox actual: 1–4 arranca por ranura; el diseño final unifica en F + UI radial.)

## 6. Invariantes técnicos

1. `src/engine/` es **puro**: sin Three, DOM ni I/O; sin `Math.random` ni `Date`.
   Tick fijo 60 Hz; rng sembrado inyectado. El render consume estado, nunca lo produce.
2. **Tests primero**: `src/engine/*.test.ts` son la spec.
3. **Constantes solo en `constants.ts`**; si cambias una, di cuál y por qué.
4. Axies desde `public/data/axies.json` (sembrado en dev). **Amendado 3 sep
   (decisión de Luis, por valor de ecosistema):** UNA excepción opt-in — si el
   jugador escribe el ID de su Axie en el título, se consulta el gateway GraphQL
   público (dato público, sin wallet/cuenta/firma) y su Axie se vuelve la base
   de la Quimera. Por defecto el juego sigue 100% local.
5. Assets de Axie solo del pack sellado del toolkit (`npm run copy-axie-assets`);
   no se redistribuyen en el repo.
6. `DISCLOSURES.md` al día con cada dep/asset/IA/trabajo previo.

## 7. Dirección visual y de audio

- Escena lunar nocturna: luna enorme emisiva, niebla, arena circular. **[decidido]**
- Quimera: **ser amorfo** (ver §1) — núcleo que respira + partes robadas en
  anclajes caóticos. **[decidido por Luis, 2 sep noche]**
- Presas: Axies reales del mixer, con anillo de estado en el suelo (clase/hp →
  telegraph rojo → derribo ámbar). Huyendo corren mirando lejos. **[implementado]**
- Partes al desprenderse: energía estilizada, sin gore. **[decidido]**
- Audio: SFX sintetizados con WebAudio en runtime, sin assets. **[implementado 2 sep]**
- **Restricción del toolkit (verificada 2 sep):** el mixer 3D no trae animaciones
  por parte del cuerpo; su set es corporal (`Action.AttackHead/AttackCombo/
  AttackRange/RunAttack`, `Default.Idle/Walk/Run/Stun/Dead`, y sets por arma).
  La identidad de ranura se comunica con: anim corporal asignada por ranura +
  forma del arco + color de clase. `Default.Stun` = pose de derribo. Las armas
  (`Sword.*`, etc. + GLBs en `weapons/`) quedan como opción de sabor para Alfas.
- Sin números en pantalla salvo el contador de oleada: vida como barra, vida de
  presas como oscurecimiento del cuerpo. **[provisional — heredado de la
  sensibilidad del proyecto anterior, revisar]**

## 7.5 Registro de tuning

Etiquetas: [provisional] = a ojo · [simulado] = tuneado con la suite de balance
headless (`npm run balance`: bot jugador en 3 perfiles de habilidad, 60 runs
sembrados c/u) · [medido] = confirmado además por playtest humano.

**Pase 1 (2 sep 2026).** Baseline a ojo era rotísimo de fácil: hasta el bot torpe
llegaba a oleada 12 (kiteo infinito por knockback + mordida, presas de papel).
Cambios: HP presa 40→70, daño contacto 8→14, velocidad presa 3.2→3.8, mordida
12→10, y las presas resisten el empujón (knockback recibido 9→5; el del jugador
queda en 9). Curva resultante (mediana de oleada de muerte): casual 6 · medio 6 ·
bueno 8.

**Pase 2 (2 sep 2026, con victoria en oleada 9).** El muro: bueno ganaba 5–7%.
Diagnóstico en dos capas: (a) regla de greybox mía —el daño cancelaba el canal de
cosecha— hacía inviable curarse bajo presión: **eliminada; el canal aguanta daño**
(el costo de tragar bajo fuego es la vida que pierdes mientras). (b) la atrición
tardía sobraba una vez que el anti-kiteo lo hace el knockback resistido: HP presa
70→60, daño contacto 14→12. Además Alfa 2.5/1.5→2.2/1.35 y botín nivel 2
0.15→**0.25** (el power-ramp hacia la final pasa por cazar Alfas). Resultado
(60 runs/perfil): victoria **35% bueno · 5% medio · 0% casual**; muerte mediana
6/7/9. En objetivo.
**Pase 3 (2 sep 2026, tarde — con el core "nace simple").** El pivote (nacer solo
con boca + asimilación por niveles) disparó la rampa: el bot arranca ~13 veces por
run y medio ganaba 40%. Ajustes: bono por nivel 0.25→**0.15** (la asimilación ya
es la rampa principal) y daño de contacto 12→**14** (castiga no esquivar; palanca
sensible a habilidad). Resultado: victoria **27% bueno · 15% medio · 5% casual**;
muerte mediana 6/8/9. En objetivo (bueno humano > bot).
**Pase 4 (2 sep 2026, noche — con la caza invertida).** Presas que huyen
colapsaron el peligro (victoria 85–100% en todos los perfiles) pero arreglaron
la duración (~4.5–4.8 min, en objetivo). Peligro restaurado donde vive la
fantasía: **venganza de manada** (derribo → presas a ≤9 u pelean 6 s con +40%
daño) y **Alfa contra-cazador** (daño ×1.8, velocidad ×1.25). Curva: victoria
**78% bueno · 60% medio · 17% casual**, muerte mediana 7–9.
**Sesgo conocido:** el bot caza con foco y puntería perfectos (≈13 arrancones/run,
todo a nivel 3) — sobreestima al humano. NO seguir tuneando contra el bot:
calibrar con playtest humano en T13. La duración ya está en objetivo; el punto
abierto de oleadas cortas quedó resuelto por la caza invertida.

**Pase 6 (3 sep 2026 — zarpazo magnético).** El zarpazo evolucionó a magnético:
al atacar, la presa dentro del cono de encare (±60°, hasta 1.7+2.2 u) atrae el
giro y el cierre exacto hasta alcance — tocar atacar = golpear, en táctil y
desktop. La puntería quedó automatizada para bot y humano por igual (el bot ya
es proxy válido en precisión, no en reflejos: su esquiva 0.9 sigue siendo
sobrehumana). Contacto 14→16 para compensar. Curva: **68% bueno · 32% medio ·
5% casual** — deliberadamente generosa: es un jam, los jueces deben poder ver el
arco completo (llegar a la final) en 2–3 runs.

**Pase 5 (3 sep 2026 — zarpazo).** Atacar abalanza 0.8 u hacia donde encaras
(`ATTACK_LUNGE_DISTANCE`): arregla el apuntado táctil (cierra la distancia que el
auto-apuntado no comunica) y de rebote balanceó el juego — el zarpazo te
compromete metiéndote al rango de pelea y de los vengadores. Curva: victoria
**52% bueno · 28% medio · 0% casual**, duración 2.7–4.3 min. La mejor hasta
ahora; bueno y casual EN objetivo, medio apenas arriba.

**Pase 9 (4 sep 2026 — los 5 robos aprobados por Luis).** [decidido] Entraron
NÉMESIS (Shadow of Mordor: 2 disoluciones sin cosecha entre runs → CICATRIZADA,
HP ×1.5, brava ×1.6, botín L2, +300; cosecharla borra la marca), PRESA DORADA
(2%, nunca pelea, botín L2, +500), APEX 4/4 (daño extra + tu grupo te teme),
rugido lejano del Primordial y sus 15 líneas de muerte. Dos lecciones medidas:
(a) la dorada con huida ×1.9 era **incazable** (6.1 > 5.0 del jugador) y ataraba
la oleada — el balance lo delató con 20-25 runs colgados del cap de tiempo; se
capeó su huida al 94% de la velocidad del jugador. (b) el paquete completo
inflaba el win de todos los perfiles ~+15-30pp (APEX mata más rápido y el miedo
apaga el daño entrante); se corrigió con tres palancas: el miedo apex se rompe
al acorralar (un animal aterrado y arrinconado muerde), APEX 0.5→**0.25**, y
daño por oleada 0.16→**0.22**. Curva final: victoria **92% bueno · 60% medio ·
35% casual**, cap 0 — de vuelta en la banda generosa-de-jam del pase 8.

**Pase 10 (8 sep 2026 — LA LUNA ABIERTA).** [decidido por Luis: "vamos a
arriesgarnos, ejecuta el paquete completo"] El mundo pasó de arena r22 a luna
r88; las cacerías son MANADAS ancladas a lugares y la presa tiene **querencia**
(no abandona su territorio: arquea al llegar al límite — preserva la densidad
de caza local). Navegación por faro + radar local con flecha. Herramientas
(reliquia/vida/núcleo), rover montable ×1.9, cuevas-guarida de Guardianes.
Tres iteraciones de balance el mismo día: (a) meteoro cayendo siempre cerca
del jugador lo hacía letal (radio 16→23); (b) el borde de querencia se toca en
cada persecución y la presa se volteaba a pelear (cornered 5→3.2); (c) **el
hallazgo importante**: la querencia comprime a la manada y el radio de
venganza 9 cubría el territorio entero — cada derribo enfurecía a TODOS y el
enjambre fundía a casual (2% win). Venganza 9→5.5, hogar 15→17. Curva final:
**88% bueno · 48% medio · 22% casual, cap 0**, runs de 3-4.5 min. Lección:
en mundo abierto, la geometría social de la manada ES el balance.

**Pase 11 (9 sep 2026 — los 10 robos de retención).** [decidido] Entraron:
INSTINTO SALVAJE (revive único), SED DEL DEPREDADOR (derribo cura +4), FLUJO
DE CAZA (+15% velocidad al conectar), BOTÍN DEL GUARDIÁN (Alfa suelta
reliquia), PRESA MARCADA (bounty por manada), MUDA DORADA (12% doble), CAZA
VELOZ (<45 s = +100), REVANCHA (misma semilla mapa+rng), RACHA DE DÍAS y
GESTAS (8 medallas). El paquete regaló el run (55/88/98) → revive 0.4→0.3 y
daño/oleada 0.22→**0.32** ⇒ **35% casual · 77% medio · 98% bueno, cap 0**.
Se acepta generoso: la ventaja del bot medio/bueno es esquiva de consistencia
sobrehumana que el humano no replica; el humano de referencia (Luis) arbitra.

## 8. Preguntas abiertas (y respondidas)

- ~~**Cierre del run**~~ **Resuelto (2 sep):** oleada 9 = final con **doble Alfa**;
  limpiarla = victoria ("LUNACIA ES TUYA"). Morir en el mismo tick pisa la
  victoria. Implementado en el motor (`FINAL_WAVE`, fase `victory`).
- ~~**Pool exclusivo de partes Alfa**~~ **Resuelto (2 sep), versión mínima:** las
  partes activas de un Alfa son **nivel 2** (+25% daño al injertarlas, y el pack
  trae GLBs L2 distintos, así que también se ven diferentes). Un pool de partes
  únicas con deltas propios queda como extensión si sobra tiempo.
- ~~**Injertos visibles**~~ **Resuelto (2 sep): SÍ.** El spike T8 confirmó que
  `mixer.create({descriptor})` acepta descriptores arbitrarios y
  `mixer.decodeGenes()` da el descriptor de cualquier Axie → cirugía de
  descriptor: al arrancar, la Quimera se recompone con la parte real de la presa
  (T9a implementado; costo: un rebuild async de ~100–300 ms con el rig anterior
  visible mientras). El fallback T9b ya no hace falta.
- ~~**UI de cosecha**~~ **Resuelto (2 sep):** panel anclado al cuerpo con chips
  de las partes; mantener click = arrancar, mantener F = devorar.
- **Pasivas con efecto propio** (más allá del bono de devorar): fuera de scope
  salvo que sobre tiempo.
- **Shader de monstruo para la Quimera**: sigue pendiente (era T9b; ahora es
  puro sabor visual, opcional).

## 9. Qué se recorta si falta tiempo

Orden de recorte: shader de monstruo → pool exclusivo Alfa → presas con render
mixer (cápsulas se quedan) → audio.
**Nunca recortar**: la decisión arrancar/devorar, el loop de oleadas, reiniciar.
