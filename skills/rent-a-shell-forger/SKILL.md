---
name: rent-a-shell-forger
description: Convierte esta compu (Windows, macOS o Linux) en un Forger de Rent a Shell. Instala y configura el gateway que conecta un robot (ESP32) y una webcam, cobra en USDC sobre Solana, abre un túnel público y publica el shell en el catálogo del hub. Usar cuando la persona dice "quiero ser Forger", "publicar mi robot en Rent a Shell", "conectar mi ESP32 a Rent a Shell", "levantar el gateway" o "por qué mi shell no aparece en el hub".
---

# Rent a Shell · Forger

Un **Forger** arma un robot, lo publica en Rent a Shell y cobra por cada minuto que alguien (una persona o un agente de IA) lo usa. Esta skill deja la compu del Forger funcionando como **gateway**: un proceso de Node que vive al lado del robot y hace de puente entre internet y el hardware.

```
webcam ─ ffmpeg ─> MediaMTX ─┐
ESP32 (WiFi local) <─────────┼── gateway (node :8787) ── túnel ──> sitio, agentes, hub
                             │    cobra en USDC (x402 y Solana Pay con escrow),
                             │    sesiones, cola, corte seguro, MCP, llms.txt
        pnpm forger  ────────┘    (un solo proceso levanta y vigila todo)
```

Trabajá en orden y **verificá cada paso antes de seguir**. Al final corré el doctor. Hablale a la persona en su idioma y con pasos cortos; preguntá solo lo que no podés detectar.

## Reglas

- **Nunca pidas ni escribas la clave privada de la wallet principal del Forger.** Para cobrar alcanza su **address** pública (`SOLANA_PAY_TO`).
- La única clave que se genera acá es la del **operador del escrow**. Es una wallet nueva que solo puede liberar o reembolsar pagos. El script la escribe directo en `.env.local` y nunca la muestra.
- `.env.local` nunca va a git.
- Antes de abrir el túnel público, confirmá con la persona: expone el gateway a internet.
- **Windows es la plataforma principal.** Usá PowerShell y los comandos de cada paso. En PowerShell, `curl` es un alias de otra cosa: usá `curl.exe`.

## 1. Requisitos

| Herramienta | Windows (PowerShell) | macOS | Linux |
|---|---|---|---|
| Node 22+ | `winget install OpenJS.NodeJS.LTS` | `brew install node` | nodesource |
| pnpm | `npm i -g pnpm` | idem | idem |
| git | `winget install Git.Git` | `xcode-select --install` | `apt install git` |
| ffmpeg | `winget install Gyan.FFmpeg` | `brew install ffmpeg` | `apt install ffmpeg` |
| MediaMTX | zip de github.com/bluenviron/mediamtx/releases (windows_amd64), descomprimir y poner la carpeta en el PATH o en `MEDIAMTX_PATH` | `brew install mediamtx` | binario de releases |
| cloudflared | `winget install Cloudflare.cloudflared` | `brew install cloudflared` | paquete oficial |

Después de instalar con winget, **abrí una terminal nueva** para que tome el PATH. Verificá con `node -v`, `ffmpeg -version`, `mediamtx --version` y `cloudflared --version`.

## 2. Bajar el gateway

```powershell
git clone https://github.com/francoperez/rent-a-shell.git   # [a confirmar: URL pública del repo]
cd rent-a-shell
pnpm install
Copy-Item apps\gateway\.env.example apps\gateway\.env.local   # macOS/Linux: cp
```

## 3. Robot y cámara

**ESP32.** El robot tiene que estar prendido y en la misma red WiFi que la compu.
```powershell
pnpm forger:find-esp32
```
Imprime `http://<ip>` de cada shell que responde. Si no aparece ninguno:
- Pedile la IP a la persona (la muestra el monitor serie del firmware o el router).
- Revisá que la compu no esté en una red "Pública" de Windows ni con el aislamiento de clientes del router activado.

Verificá con `curl.exe http://<ip>/state`, que tiene que traer `ok:true` y `angles`.

**Cámara.**
```powershell
pnpm forger:cameras
```
- Windows: copiá el **nombre exacto** que imprime (ej. `HD Pro Webcam C920`).
- macOS: el índice. macOS pide permiso de cámara para la terminal la primera vez, y la persona tiene que aceptarlo.
- Linux: `/dev/videoN`.

Sin webcam a mano se puede probar todo con `CAMERA=test` (señal de prueba).

## 4. Configuración (`apps/gateway/.env.local`)

Preguntá a la persona:
- **Address de Solana** donde cobra: `SOLANA_PAY_TO`, la pública (Phantom → copiar dirección).
- **Nombre del shell** (`SHELL_NAME`), **id** sin espacios (`SHELL_ID`) y **ubicación** (`SHELL_LOCATION`).
- **Nombre como Forger** (`FORGER_NAME`) y un **contacto** opcional para pedidos (`FORGER_CONTACT`).
- **Red:** `SOLANA_NETWORK=devnet` para probar o `mainnet` para cobrar en serio.

Completá sin preguntar. Los secretos se generan con Node, porque Windows no trae openssl:
```
SESSION_SECRET=<node -e "console.log(require('crypto').randomBytes(32).toString('hex'))">
FORGER_TOKEN=<node -e "console.log(require('crypto').randomBytes(24).toString('hex'))">
ESP32_URL=<paso 3>
CAMERA=<paso 3>
RAILS=solana-x402,solana-pay
HUB_URL=<URL del hub de Rent a Shell>      # [a confirmar: URL pública del hub]
```
No pongas `PUBLIC_URL`: lo asigna el túnel en cada arranque. Editá el archivo con el editor y no con redirecciones de PowerShell, que escriben en UTF-16 y el gateway no lo lee.

**Escrow (recomendado).** Con operador, los pagos de personas quedan en escrow hasta que termina la sesión, y si el robot se cae se reembolsan solos.
```powershell
pnpm --filter @ras/rails-solana -s operator-key
```
Queda escrita en `.env.local` y el comando imprime solo la address. Pedile a la persona que le mande ~0,05 SOL para fees (en devnet sale de faucet.solana.com).

## 5. Arrancar (confirmar el túnel antes)

```powershell
pnpm forger
```
Un solo proceso levanta MediaMTX, la cámara, el túnel de Cloudflare, el gateway con la URL pública del túnel y el registro en el hub. Si algo se cae, lo reinicia. Si el túnel cambia de URL, reinicia el gateway y se re-registra. La URL pública queda en `apps/gateway/data/public-url.txt`.

Sin túnel (para probar en la red local): `TUNNEL=none`. Con una URL fija (túnel con nombre o Tailscale Funnel): poné `PUBLIC_URL=https://...` y `TUNNEL=none`.

Si Windows muestra el aviso del firewall para node o mediamtx, se puede **denegar**: todo pasa por el túnel y por localhost.

## 6. Verificar todo

En otra terminal:
```powershell
pnpm forger:doctor
```
Tiene que terminar en "Todo listo". Cada línea con ✗ (crítico) o ! (aviso) dice qué arreglar. Para una prueba real de cobro, seguí `docs/plans/PLAN.md` (buyer con USDC devnet).

## 7. Que arranque solo

- **Windows:** una tarea programada al iniciar sesión.
  ```powershell
  $repo = (Get-Location).Path
  $action = New-ScheduledTaskAction -Execute "node" -Argument "scripts\forger\run.mjs" -WorkingDirectory $repo
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  Register-ScheduledTask -TaskName "RentAShellForger" -Action $action -Trigger $trigger -RunLevel Limited
  ```
  Con la notebook como servidor, en Configuración → Energía hay que desactivar la suspensión con el cargador enchufado.
- **macOS/Linux:** `npm i -g pm2`, `pm2 start scripts/forger/run.mjs --name forger`, `pm2 save` y `pm2 startup`.

## Operación diaria

- **Pedidos de personalización:** `curl.exe http://localhost:8787/api/forger/requests -H "Authorization: Bearer <FORGER_TOKEN>"`.
- **Cobros:** llegan a `SOLANA_PAY_TO`. Por x402, directo; por Solana Pay con escrow, el 90% al terminar cada sesión.
- **Robot caído:** si queda offline más de 2 minutos con una sesión paga, el gateway corta la sesión y reembolsa.

## Problemas comunes

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| `find-esp32` no encuentra nada | otra red, red "Pública" de Windows o AP isolation | misma WiFi, red como "Privada", desactivar aislamiento en el router |
| `[camara] no arrancó` o se reinicia en loop | nombre de cámara mal o cámara en uso por otra app | `pnpm forger:cameras`, cerrar Zoom/Teams/Cámara; probar `CAMERA_SIZE=1280x720` |
| video negro en el navegador | formato de la webcam | ya se fuerza `yuv420p`; probar otra resolución con `CAMERA_SIZE` |
| `mediamtx` no arrancó (ENOENT) | no está en el PATH | `MEDIAMTX_PATH=C:\ruta\mediamtx.exe` en `.env.local` |
| hub marca offline | el túnel cayó o cambió | mirar el log de `pnpm forger`: se re-registra solo |
| Solana Pay no abre la wallet | `PUBLIC_URL` sin https | usar el túnel (los transaction requests exigen https) |
