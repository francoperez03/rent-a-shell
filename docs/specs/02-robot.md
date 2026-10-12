# 02 · Robot: El Tucu como shell #1

Se usa el brazo de las BNB Builder Sessions **tal cual está programado**. Fuente de verdad: `~/repos/job/eventos/bnb-builder-session/agentes/robot-a/SPEC.md` §4.4 y `apps/firmware/README.md`. Si algo de acá contradice esos archivos, mandan ellos.

## Hardware

- ESP32 + 4 servos SG90: base, hombro (`shoulder`), codo (`elbow`), pinza (`grip`).
- Firmware ESP-IDF 5.5.3, WiFi STA en el router propio con IP fija.
- Fuente de 5 V con tierra común y capacitor en la línea de 5 V.
- Webcam USB en la Legion apuntando al brazo.

## API del firmware (sin cambios)

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| GET | `/state` | | `{ok, moving, rutina, angles:{base,shoulder,elbow,grip}, uptime_ms}` |
| POST | `/dance` | `{rutina: "robot" \| "lento" \| "saludo" \| "recta"}` | `{ok, duration_ms}` o `409` si ya se mueve |
| POST | `/joint` | `{joint, angle}` | `{ok, joint, angle, clamped, limits}`, `409` si baila, `400` si inválido |
| POST | `/stop` | | `{ok, angles}`, siempre aceptado |

- HOME `{base:90, shoulder:90, elbow:90, grip:70}`.
- Velocidad máxima 2° cada 20 ms.
- Rangos hasta calibrar: base 20 a 160, hombro 50 a 130, codo 50 a 130, pinza 40 a 110. `[a verificar]` contra la calibración final en `robot-a/apps/firmware`.
- El firmware recorta al rango seguro: el gateway no necesita repetir los límites, pero los publica en la ficha.
- Las rutinas viven en `apps/firmware/main/dance.c` y `apps/mock/dance.mjs` (`robot`, `lento`, `saludo`, `recta`).

## Comandos expuestos en una sesión

El gateway traduce comandos de sesión a la API del firmware. Allowlist cerrada:

| Comando de sesión | Llamada al ESP32 | Regla |
|---|---|---|
| `joint {joint, angle}` | `POST /joint` | requiere sesión vigente |
| `dance {rutina}` | `POST /dance` | requiere sesión vigente, rutina de la lista |
| `stop` | `POST /stop` | requiere sesión vigente; el gateway también lo llama solo al vencer |
| `state` | `GET /state` | público, sin sesión (alimenta el HUD del sitio) |

Al vencer o cerrar la sesión el gateway hace `POST /stop` y después `POST /joint` a cada articulación para volver a HOME.

## Ficha legible por máquinas

La sirve el gateway en `GET /api/shells` y la usan el sitio, `llms.txt` y el MCP. Tipos en `packages/shell-spec`.

```json
{
  "id": "el-tucu",
  "name": "El Tucu",
  "kind": "arm-4dof",
  "location": "Salta, AR",
  "status": "online",
  "camera": { "hls": "https://<url-legion>/live/tucu/index.m3u8", "frame": "https://<url-legion>/api/shells/el-tucu/frame" },
  "joints": {
    "base": [20, 160], "shoulder": [50, 130], "elbow": [50, 130], "grip": [40, 110]
  },
  "home": { "base": 90, "shoulder": 90, "elbow": 90, "grip": 70 },
  "routines": ["robot", "lento", "saludo", "recta"],
  "pricing": { "block_minutes": 5, "usd": "1.00" }
}
```

`status`: `online`, `busy` (sesión activa), `offline` (no responde `/state` o no hay video). Precio de ejemplo en USD, `[INPUT]` precio final. La ficha no dice cómo se paga: los medios de pago salen de `GET /api/rails` (`08-rieles-adaptador.md`), así cambiar de infra no toca la ficha.

## Desarrollo sin brazo

`robot-a/apps/mock` tiene la misma API y las mismas rutinas que el firmware (`check-tables.mjs` falla si difieren).

```bash
cd ~/repos/job/eventos/bnb-builder-session/agentes/robot-a
pnpm --filter mock start          # escucha en http://localhost:8080
ESP32_URL=http://localhost:8080   # en el gateway
```

## Riesgos del robot

| Riesgo | Mitigación |
|---|---|
| Un SG90 se recalienta con sesiones seguidas | pausa de 1 minuto en HOME entre sesiones; `[a verificar]` cuántas sesiones aguanta en un ensayo |
| WiFi del evento | router propio, IP reservada |
| La fuente no da corriente con 4 servos | medir antes, `[INPUT]` amperes de la fuente |
| Se cae en plena demo | video de respaldo grabado en F7 |
