---
name: rent-a-shell-forger
description: Convierte esta compu en un Forger de Rent a Shell. Instala y configura el gateway que conecta un robot (ESP32) y una webcam, cobra en USDC sobre Solana, abre un túnel público y publica el shell en el catálogo del hub. Usar cuando la persona dice "quiero ser Forger", "publicar mi robot en Rent a Shell", "conectar mi ESP32 a Rent a Shell", "levantar el gateway" o "por qué mi shell no aparece en el hub".
---

# Rent a Shell · Forger

Un **Forger** arma un robot, lo publica en Rent a Shell y cobra por cada minuto que alguien (una persona o un agente de IA) lo usa. Esta skill deja la compu del Forger funcionando como **gateway**: un proceso de Node que vive al lado del robot y hace de puente entre internet y el hardware.

```
webcam ──> MediaMTX (ffmpeg publica RTSP, sirve HLS)──┐
ESP32 (WiFi local) <── gateway (node :8787) <─────────┤── túnel público ──> sitio, agentes, hub
                         · cobra (x402 y Solana Pay + escrow)
                         · sesiones, cola, corte seguro, MCP, llms.txt
```

Trabajá en orden y **verificá cada paso antes de seguir**. Al final corré el doctor. Hablale a la persona en su idioma y con pasos cortos; preguntá solo lo que no podés detectar.

## Reglas

- **Nunca pidas ni escribas en ningún lado la clave privada de la wallet principal del Forger.** Para cobrar alcanza su **address** pública (`SOLANA_PAY_TO`).
- La única clave que se genera acá es la del **operador del escrow**. Es una wallet nueva que solo puede liberar o reembolsar pagos. Se escribe directo en `apps/gateway/.env.local` y no se muestra en el chat.
- `.env.local` nunca va a git (ya está en `.gitignore`).
- Antes de abrir un túnel público, confirmá con la persona: expone el gateway a internet.

## 1. Requisitos

Detectá el sistema operativo y chequeá:

| Herramienta | Para qué | Instalar |
|---|---|---|
| Node 22+ y pnpm | gateway | nodejs.org, `npm i -g pnpm` (o `corepack enable`) |
| git | bajar el código | |
| ffmpeg | capturar la webcam | Mac: `brew install ffmpeg` · Windows: `winget install Gyan.FFmpeg` · Linux: `apt install ffmpeg` |
| MediaMTX | servir la cámara (RTSP y HLS) | Mac: `brew install mediamtx` · Windows/Linux: binario de github.com/bluenviron/mediamtx/releases |
| cloudflared | túnel público | Mac: `brew install cloudflared` · Windows: `winget install Cloudflare.cloudflared` · Linux: paquete oficial |

Instalá lo que falte, con el permiso de la persona.

## 2. Bajar el gateway

```bash
git clone https://github.com/francoperez/rent-a-shell.git   # [a confirmar: URL pública del repo]
cd rent-a-shell && pnpm install
cp apps/gateway/.env.example apps/gateway/.env.local
```

## 3. Robot y cámara

**ESP32.** El robot tiene que estar prendido y en la misma red WiFi que la compu.

```bash
pnpm forger:find-esp32      # imprime http://<ip> de cada shell que responde /state
```

Si aparece uno, usá esa URL como `ESP32_URL`. Si no aparece, pedile la IP a la persona (la muestra el monitor serie del firmware o el router). Verificá con `curl <ESP32_URL>/state`, que tiene que traer `ok:true` y `angles`. Sin ESP32 a mano se puede probar con el robot simulado: `pnpm mock` y `ESP32_URL=http://localhost:8080`.

**Cámara.**
1. Arrancá MediaMTX con la config del repo (`mediamtx scripts/forger/mediamtx.yml`), que deja el RTSP en `:8554` y el HLS en `:8888` y acepta cualquier path. La config por defecto de algunas instalaciones rechaza paths nuevos con `400 Bad Request`.
2. Publicá la webcam en el path `<SHELL_ID>` (por defecto `el-tucu`).
3. Dejá los dos procesos corriendo.

- Mac:
  ```bash
  mediamtx scripts/forger/mediamtx.yml &
  ffmpeg -f avfoundation -list_devices true -i ""          # elegí el índice de la cámara
  ffmpeg -f avfoundation -framerate 30 -video_size 1280x720 -i "0" \
    -c:v libx264 -preset ultrafast -tune zerolatency -g 30 -f rtsp rtsp://localhost:8554/el-tucu
  ```
  La primera vez macOS pide permiso de cámara para la terminal: la persona tiene que aceptarlo.
- Windows (PowerShell):
  ```powershell
  .\mediamtx.exe scripts\forger\mediamtx.yml
  ffmpeg -list_devices true -f dshow -i dummy               # copiá el nombre exacto de la cámara
  ffmpeg -f dshow -i video="NOMBRE DE LA CAMARA" -c:v libx264 -preset ultrafast -tune zerolatency -g 30 -f rtsp rtsp://localhost:8554/el-tucu
  ```
- Linux: `-f v4l2 -i /dev/video0` en lugar de avfoundation/dshow.

Verificá: `ffmpeg -rtsp_transport tcp -i rtsp://localhost:8554/el-tucu -frames:v 1 /tmp/frame.jpg` tiene que generar una foto, y `curl -I http://localhost:8888/el-tucu/index.m3u8` tiene que dar 200.

## 4. Configuración (`apps/gateway/.env.local`)

Preguntá a la persona:
- **Address de Solana** donde quiere cobrar. Va en `SOLANA_PAY_TO` y alcanza con la pública (Phantom → copiar dirección).
- **Nombre del shell** (`SHELL_NAME`), **id** sin espacios (`SHELL_ID`, el mismo que el path de la cámara) y **ubicación** (`SHELL_LOCATION`).
- **Nombre como Forger** (`FORGER_NAME`) y un **contacto** opcional para pedidos de personalización (`FORGER_CONTACT`).
- **Red:** `devnet` para probar o `mainnet` para cobrar en serio (`SOLANA_NETWORK`).

Completá sin preguntar:
```
SESSION_SECRET=<openssl rand -hex 32>
FORGER_TOKEN=<openssl rand -hex 24>
ESP32_URL=<paso 3>
RTSP_URL=rtsp://localhost:8554/<SHELL_ID>
HLS_UPSTREAM=http://localhost:8888
RAILS=solana-x402,solana-pay
HUB_URL=<URL del hub de Rent a Shell>      # [a confirmar: URL pública del hub]
```

**Escrow (recomendado).** Con operador, los pagos de personas quedan en escrow hasta que termina la sesión: si el robot se cae, se reembolsan solos.
1. Generá la wallet del operador. Queda escrita en `.env.local` y el comando imprime solo la address:
   ```bash
   pnpm --filter @ras/rails-solana -s operator-key
   ```
2. Pedile a la persona que le mande ~0,05 SOL a esa address, que pagan las fees de liberar y reembolsar. En devnet sale de faucet.solana.com.

Sin operador, Solana Pay cobra directo a `SOLANA_PAY_TO`, sin escrow.

## 5. Arrancar el gateway

```bash
pnpm gateway
```
Verificá `curl localhost:8787/api/health` y `curl localhost:8787/api/shells`, y que la ficha muestre `camera.hls` apuntando a `/live/<SHELL_ID>/index.m3u8`.

## 6. Túnel público (confirmar antes con la persona)

```bash
cloudflared tunnel --url http://localhost:8787
```
Copiá la URL `https://…trycloudflare.com` que imprime. Ponela en `PUBLIC_URL` y **reiniciá el gateway**: la ficha, el video y los links de pago se arman con esa URL.

El túnel rápido cambia de URL cada vez que arranca. Para algo estable, usá un túnel con nombre de Cloudflare (requiere cuenta y dominio) o Tailscale Funnel (`tailscale funnel 8787`).

## 7. Publicar en el hub

```bash
curl -X POST "$HUB_URL/api/forgers" -H 'content-type: application/json' -d "{\"gateway\":\"$PUBLIC_URL\"}"
```
Responde `201` con los ids de los shells. Desde ese momento el shell aparece en el catálogo, en el `llms.txt` del hub y en su MCP.

## 8. Verificar todo

```bash
pnpm forger:doctor
```
Tiene que terminar en "Todo listo". Cada línea con ✗ dice qué arreglar. Para una prueba real de cobro, seguí `docs/plans/PLAN.md` (buyer con USDC devnet).

## 9. Dejarlo corriendo

Los cuatro procesos (MediaMTX, ffmpeg, gateway y túnel) tienen que sobrevivir a reinicios. La opción más simple es pm2:

```bash
npm i -g pm2
pm2 start "mediamtx scripts/forger/mediamtx.yml" --name camara-server
pm2 start "ffmpeg <args del paso 3>" --name camara
pm2 start "pnpm gateway" --name gateway
pm2 start "cloudflared tunnel --url http://localhost:8787" --name tunel   # con túnel rápido la URL cambia: preferí uno con nombre
pm2 save && pm2 startup
```

## Operación diaria

- **Pedidos de personalización:** `curl localhost:8787/api/forger/requests -H "Authorization: Bearer $FORGER_TOKEN"`.
- **Cobros:** llegan a `SOLANA_PAY_TO`. Por x402, directo; por Solana Pay con escrow, el 90% al terminar cada sesión.
- **Robot caído:** si queda offline más de 2 minutos con una sesión paga, el gateway corta la sesión y reembolsa.

## Problemas comunes

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| `find-esp32` no encuentra nada | otra red o AP aislado | misma red WiFi; algunos routers aíslan clientes (desactivar "AP isolation") |
| frame vacío | ffmpeg no publica | revisá el path (= `SHELL_ID`) y el permiso de cámara |
| HLS 404 en `/live` | falta `HLS_UPSTREAM` o MediaMTX caído | `HLS_UPSTREAM=http://localhost:8888`, reiniciar el gateway |
| hub marca offline | cambió la URL del túnel | actualizar `PUBLIC_URL`, reiniciar el gateway y volver a registrar |
| Solana Pay no abre la wallet | `PUBLIC_URL` no es https | los transaction requests exigen https: usá el túnel |
