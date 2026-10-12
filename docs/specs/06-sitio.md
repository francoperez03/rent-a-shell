# 06 · Sitio

Sitio público en Vercel. Una persona entra, ve el robot en vivo, elige, paga desde cualquier lado y lo controla. Un agente encuentra todo lo que necesita en `/agents` y `/llms.txt`.

## Stack

Igual a las réplicas de landing-research, para reusar el motion-kit sin fricción:

| Pieza | Versión |
|---|---|
| Vite | 5.4 |
| React | 18.3.1 |
| TypeScript | 5.5.4 |
| Tailwind | 3.4.6 |
| gsap | ^3.13.0 (ScrollTrigger) |
| lenis | ^1.3.23 |
| three + @react-three/fiber | ^0.186.0 + ^8.18.0 (v9 exige React 19 y deja la página en blanco) |
| hls.js | 1.7.3 (igual que El Tucu) |
| wagmi + viem | wagmi 2, viem ^2.51; chains desde `GET /api/rails`, ninguna fija en el código |
| clsx | |

Motion-kit: copiar `~/repos/job/Crisol/packages/motion-kit/src` a `apps/web/src/motion/` (no se publica como paquete). Catálogo de recetas en `Crisol/packages/motion-kit/CATALOG.md`.

`/llms.txt` en un sitio Vite: archivo estático generado en el build desde `GET /api/shells`, o rewrite de Vercel al gateway. `[a verificar]` cuál conviene; el rewrite mantiene el estado en vivo.

## Páginas

| Ruta | Para quién | Qué tiene |
|---|---|---|
| `/` | todos | hero con el robot en vivo, cómo funciona, para personas, para agentes, shells disponibles, cierre |
| `/shells` | personas | catálogo (hoy un shell, diseñado para varios) |
| `/shells/:id` | personas | ficha, video, cola, elegir bloques y riel |
| `/checkout/:intent` | personas | pago por wallet o Ripio, estado en vivo hasta `paid` |
| `/session` | quien pagó | consola de control |
| `/agents` | agentes y devs | endpoints, MCP, ejemplo con `@x402/fetch`, link a `llms.txt` |

## Taste

Síntesis de las corridas de landing-research (`Crisol/docs/landing/research/{maneva,offbrand,uplink}` y los análisis de linear, paisanos y studio34). Patrón común: una familia tipográfica dominante, peso 400 a 500, tracking negativo; contraste por tamaño; mono uppercase para metadatos; base monocroma con un solo acento; algún loop chico siempre vivo; nada rebota.

| Decisión | Valor | De dónde |
|---|---|---|
| Fondo | navy `#0B0919` | uplink |
| Texto | `#F5F5F7` | uplink |
| Acento único | azul `#014FFE` (CTA, foco, selección) | uplink |
| Estado "live" | verde `#61FF00`, solo en pills de estado y el punto de "EN VIVO" | uplink |
| Estados del shell | online verde, busy azul, offline gris `#6B6B75`, error `#ffc337` | código de color fijo reusado en todo el sitio (studio34); amarillo de error de maneva |
| Display | una grotesca con tracking −0.04em a −0.05em, peso 400, de 100 a 200 px en el hero `[INPUT]` fuente (candidatas: Geist, Inter Display) | maneva, uplink |
| Funcional | 15 a 16 px, misma familia o Helvetica Neue | uplink |
| HUD | mono uppercase 11 a 13 px (Geist Mono) para labels tipo `EL TUCU · ONLINE · 23 MS` | maneva |
| Secciones | numeradas tipo manual (`0.1 ROBOT`, `0.2 PAGO`, `0.3 AGENTES`) | linear |
| Curva de estado | `cubic-bezier(.38,.005,.215,1)` en 0,6 s | uplink |
| Reveals por tiempo | expo.out 1,2 s | maneva |
| Lo atado al scroll | `ease: none` | todas |

## Motion por sección

| Sección | Técnica | Receta del kit |
|---|---|---|
| Preloader | contador 0 a 100 con salida diagonal 1 s expo.inOut, mientras conecta el HLS | `Preloader.tsx`, `curtainClip` |
| Hero | video en vivo de El Tucu a pantalla completa con labels HUD; título por caracteres con stagger 0,01; verbo que rota cada 5 s ("probá / mové / inspeccioná") | `useHeroChars`, `useTextCycle` |
| Cómo funciona | tres pasos (elegí → pagá → controlá) que se trazan con el scroll y avanzan solos cada 4 s | `useTrackDraw`, `useAutoAdvance` |
| Personas y agentes | dos columnas con reveal por palabra; el bloque de agentes muestra un `curl` y la respuesta 402 escribiéndose | `useWordReveal`, `WordsIn` |
| Shells | lista a la izquierda, video sticky a la derecha que cambia con el foco | `useFocusWindow`, `useReveals` (`.img-in`) |
| Números | sesiones, minutos alquilados, pagos on-chain, atados al scroll 1:1 (leídos de `/api/events`) | `useStatSlider` |
| Cierre | CTA azul con roll por carácter en hover | `Roll`, `ChipButton.tsx` |
| Global | smooth scroll en la landing | `useLenis` |

Rangos de scroll medidos a 1512×812: escalar por `vh()/812` (helpers `vh`, `absRange` del kit).

## Consola de sesión (`/session`)

Acá manda el registro de Linear: un producto vivo, sin scroll narrativo. **Sin Lenis, sin cursor custom, sin pins**: estorban al control en tiempo real.

```
┌──────────────────────────────────────────┬──────────────────┐
│                                          │ SESIÓN · 04:12   │
│        video HLS en vivo                 │ ● EN VIVO 2,8 s  │
│        (labels HUD de ángulos)           ├──────────────────┤
│                                          │ BASE      ──●──  │
│                                          │ HOMBRO    ─●───  │
│                                          │ CODO      ───●─  │
│                                          │ PINZA     ●────  │
│                                          ├──────────────────┤
│                                          │ robot lento      │
│                                          │ saludo recta     │
│                                          ├──────────────────┤
│                                          │ [   STOP   ]     │
└──────────────────────────────────────────┴──────────────────┘
```

- Sliders con los rangos de la ficha. Al soltar manda `joint`; mientras arrastra, coalesce cada 100 ms.
- Teclado: flechas para base y hombro, W/S codo, A/D pinza, espacio STOP (patrón `hackware/apps/platform/src/components/console/robot-console.tsx`).
- Loops vivos: reloj de sesión, atraso del video, puntos de "conectando…", ángulos reales desde `/state`.
- Transiciones de 0,6 s con la curva de uplink. STOP siempre visible y rojo sobre todo lo demás `[INPUT]` color de STOP.
- Al vencer: overlay "Sesión terminada · El Tucu vuelve a HOME" y CTA para otro bloque.

## Checkout

- Selector de riel armado con `GET /api/rails` (`08-rieles-adaptador.md`): una opción por manifiesto, sin rieles ni chains en el código del sitio. Sugiere por `navigator.language` contra `manifest.countries` (Ripio en AR, wallet en el resto). Siempre se pueden elegir todas.
- El paso de pago se dibuja según `instructions.kind` (`transfer`, `redirect`, `approval`). wagmi se configura con las chains de los manifiestos.
- Estado del pago en vivo (SSE `payment_seen`), con link a la tx en Celoscan.
- Componentes de partida: `paybot/apps/web` (`BotAccessGate`, `PaymentModal`, `PaymentStatusCard`, `CountdownTimer`), adaptados al taste.

## Accesibilidad y rendimiento

- `prefers-reduced-motion`: sin smooth scroll, reveals instantáneos (`reducedMotion` del kit).
- La consola funciona entera con teclado. Labels en todos los sliders.
- Responsive a 390 px: la consola apila video arriba y controles abajo.
- El video HLS arranca muteado y sin bloquear el render; si falla muestra el último frame (`/api/shells/:id/frame`).
