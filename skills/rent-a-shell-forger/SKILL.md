---
name: rent-a-shell-forger
description: Convierte esta compu (macOS primero; también Windows y Linux) en un Forger de Rent a Shell. Instala y configura el gateway que conecta un robot (ESP32) y una webcam, cobra en USDC sobre Solana, abre un túnel público y publica el shell en el catálogo del hub. Usar cuando la persona dice "quiero ser Forger", "publicar mi robot en Rent a Shell", "conectar mi ESP32 a Rent a Shell", "levantar el gateway" o "por qué mi shell no aparece en el hub".
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
- **macOS es la plataforma principal.** Al final hay una sección con las diferencias para Windows y Linux.

## 1. Requisitos (macOS)

Con Homebrew (si no está: brew.sh):
```bash
brew install node pnpm ffmpeg mediamtx cloudflared git
```
Verificá con `node -v` (22+), `ffmpeg -version`, `mediamtx --version` y `cloudflared --version`.

## 2. Bajar el gateway

```bash
git clone https://github.com/francoperez/rent-a-shell.git   # [a confirmar: URL pública del repo]
cd rent-a-shell
pnpm install
cp apps/gateway/.env.example apps/gateway/.env.local
```

## 3. Robot y cámara

**ESP32.** El robot tiene que estar prendido y en la misma red WiFi que la Mac.
```bash
pnpm forger:find-esp32
```
Imprime `http://<ip>` de cada shell que responde. En macOS 15+ la primera vez aparece el aviso "Terminal quiere encontrar dispositivos en la red local": hay que **permitirlo**, o no encuentra nada. Si se negó, se habilita en Configuración del Sistema → Privacidad y seguridad → Red local → Terminal.

Si no aparece ningún shell:
- Pedile la IP a la persona (la muestra el monitor serie del firmware o el router).
- Revisá que el router no tenga activado el aislamiento de clientes.

Verificá con `curl http://<ip>/state`, que tiene que traer `ok:true` y `angles`.

**Cámara.**
```bash
pnpm forger:cameras
```
Imprime las cámaras con su índice. Usá el índice como `CAMERA` (la integrada suele ser `0`; una USB o el iPhone por Continuidad aparecen aparte).
- La primera vez que ffmpeg abre la cámara, macOS pide permiso para la **Terminal** (o la app de terminal que se use) y la persona tiene que aceptarlo. Si se negó: Configuración del Sistema → Privacidad y seguridad → Cámara → activar la terminal.
- Sin webcam a mano se puede probar todo con `CAMERA=test` (señal de prueba).

## 4. Configuración (`apps/gateway/.env.local`)

Preguntá a la persona:
- **Address de Solana** donde cobra: `SOLANA_PAY_TO`, la pública (Phantom → copiar dirección).
- **Nombre del shell** (`SHELL_NAME`), **id** sin espacios y único en el catálogo (`SHELL_ID`) y **ubicación** (`SHELL_LOCATION`).
- **Nombre como Forger** (`FORGER_NAME`) y un **contacto** opcional para pedidos (`FORGER_CONTACT`).
- **Red:** `SOLANA_NETWORK=devnet` para probar o `mainnet` para cobrar en serio.

Completá sin preguntar:
```
SESSION_SECRET=<openssl rand -hex 32>
FORGER_TOKEN=<openssl rand -hex 24>
ESP32_URL=<paso 3>
CAMERA=<paso 3>
RAILS=solana-x402,solana-pay
HUB_URL=<URL del hub de Rent a Shell>      # [a confirmar: URL pública del hub]
```
No pongas `PUBLIC_URL`: lo asigna el túnel en cada arranque.

**Escrow (recomendado).** Con operador, los pagos de personas quedan en escrow hasta que termina la sesión, y si el robot se cae se reembolsan solos.
```bash
pnpm --filter @ras/rails-solana -s operator-key
```
Queda escrita en `.env.local` y el comando imprime solo la address. Pedile a la persona que le mande ~0,05 SOL para fees (en devnet sale de faucet.solana.com).

## 5. Arrancar (confirmar el túnel antes)

```bash
pnpm forger
```
Un solo proceso levanta MediaMTX, la cámara, el túnel de Cloudflare, el gateway con la URL pública del túnel y el registro en el hub. Además:
- Si algo se cae, lo reinicia.
- Si el túnel cambia de URL, reinicia el gateway y se re-registra.
- En macOS mantiene la Mac despierta mientras corre (con `caffeinate`).
- La URL pública queda en `apps/gateway/data/public-url.txt`.

Sin túnel (para probar en la red local): `TUNNEL=none`. Con una URL fija (túnel con nombre o Tailscale Funnel): poné `PUBLIC_URL=https://...` y `TUNNEL=none`.

## 6. Verificar todo

En otra pestaña de la terminal:
```bash
pnpm forger:doctor
```
Tiene que terminar en "Todo listo". Cada línea con ✗ (crítico) o ! (aviso) dice qué arreglar. Para una prueba real de cobro, seguí `docs/plans/PLAN.md` (buyer con USDC devnet).

## 7. Que arranque solo (macOS)

El permiso de cámara de macOS es de la **Terminal**. Por eso lo más confiable es que el arranque automático abra la Terminal:
1. Creá `~/RentAShellForger.command`:
   ```bash
   cat > ~/RentAShellForger.command <<EOF
   #!/bin/zsh
   cd "$(pwd)" && pnpm forger
   EOF
   chmod +x ~/RentAShellForger.command
   ```
2. Configuración del Sistema → General → Ítems de inicio → **+** → elegir `RentAShellForger.command`.

Para que la Mac siga atendiendo:
- Configuración del Sistema → Batería/Energía: "Evitar el reposo automático cuando la pantalla está apagada" (con el cargador enchufado).
- Con la tapa cerrada, una MacBook se duerme salvo que tenga monitor externo: mejor dejarla abierta con el brillo al mínimo.
- Si la Mac tiene contraseña al arrancar, activar el inicio de sesión automático o dejarla con la sesión abierta.

Evitá pm2 o `launchd` para este caso: corren fuera de la Terminal y macOS suele negarles la cámara sin mostrar el aviso.

## Operación diaria

- **Pedidos de personalización:** `curl http://localhost:8787/api/forger/requests -H "Authorization: Bearer <FORGER_TOKEN>"`.
- **Cobros:** llegan a `SOLANA_PAY_TO`. Por x402, directo; por Solana Pay con escrow, el 90% al terminar cada sesión.
- **Robot caído:** si queda offline más de 2 minutos con una sesión paga, el gateway corta la sesión y reembolsa.

## Problemas comunes

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| `find-esp32` no encuentra nada | permiso de red local negado, otra red o AP isolation | Privacidad y seguridad → Red local → Terminal; misma WiFi |
| `[camara]` se reinicia en loop | permiso de cámara negado, índice mal o cámara en uso | Privacidad y seguridad → Cámara; `pnpm forger:cameras`; cerrar FaceTime/Zoom |
| `Selected framerate … is not supported` | la cámara no da 30 fps en ese tamaño | `CAMERA_FPS=15` o `CAMERA_SIZE=1280x720` |
| `mediamtx` con `400 Bad Request` | config por defecto de Homebrew | ya se usa `scripts/forger/mediamtx.yml`; no lances otro mediamtx aparte |
| hub marca offline | el túnel cayó o cambió | mirar el log de `pnpm forger`: se re-registra solo |
| `shell_id_taken` (409) al registrar | otro Forger usa ese `SHELL_ID` | elegir otro id |
| Solana Pay no abre la wallet | `PUBLIC_URL` sin https | usar el túnel (los transaction requests exigen https) |

## Windows y Linux

El código es el mismo y `pnpm forger` funciona igual. Cambia esto:
- **Windows (PowerShell):**
  - instalar con `winget install OpenJS.NodeJS.LTS Git.Git Gyan.FFmpeg Cloudflare.cloudflared`; MediaMTX sale del zip de releases (`MEDIAMTX_PATH` si no está en el PATH);
  - `curl.exe` en lugar de `curl` y `Copy-Item` en lugar de `cp`;
  - los secretos con `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`;
  - `CAMERA` es el **nombre exacto** que imprime `pnpm forger:cameras` (dshow);
  - editar `.env.local` con un editor y no con redirecciones de PowerShell (escriben UTF-16);
  - el arranque automático va como tarea programada (`Register-ScheduledTask` con `node scripts\forger\run.mjs` al iniciar sesión);
  - el aviso del firewall se puede denegar.
- **Linux:** `CAMERA=/dev/videoN` y arranque con systemd o pm2.
