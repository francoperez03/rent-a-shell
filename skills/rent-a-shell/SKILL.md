---
name: rent-a-shell
description: Alquila hardware real (robots y shells de Rent a Shell) por minutos para probar código de robótica en el mundo físico. Paga en USDC sobre Solana con x402, corre un plan de movimientos, mide ángulos reales y corriente, saca fotos y devuelve un reporte. Usar cuando la persona dice "probá esto en un robot real", "validá estos ángulos en hardware", "cuánta corriente consume este movimiento", "alquilá un brazo", "Rent a Shell" o quiere comparar una simulación contra hardware.
---

# Rent a Shell · alquilar hardware real

Rent a Shell tiene un catálogo de **shells**: robots reales (hoy brazos de 4 ejes con ESP32) que publican **Forgers** y que se alquilan por bloques de 5 minutos. Esta skill sirve para que el código que escribís con la persona se pruebe en hardware real en lugar de quedarse en el simulador: pagás un bloque, corrés un plan, medís y volvés con datos.

Qué se mide hoy en cada shell: ángulo real de cada articulación (y si el pedido se recortó por rango seguro), si sigue en movimiento, la corriente total del bus de servos en mA (si el shell tiene el sensor `current_ma`) y una foto de cámara por paso.

## Reglas

- **Plata real.** Antes de pagar, mostrale a la persona el shell, cuántos bloques y el precio total, y esperá un sí explícito. Ese monto es el `--max-usd` y nunca lo subas sin preguntar.
- La wallet del agente vive en `~/.rent-a-shell/wallet.json`. **Nunca muestres ni copies el secreto**: solo la address.
- Usá el rango seguro de la ficha. El gateway recorta lo que se pasa, pero es mejor planear dentro del rango.
- Si un paso falla o el shell queda offline, no reintentes pagando otra vez sin preguntar. Cuando el shell se cae, el pago por Solana Pay con escrow se reembolsa solo; por x402 hay que avisarle al Forger.

## 1. Instalar el cliente (una vez)

macOS / Linux:
```bash
mkdir -p ~/.rent-a-shell && cd ~/.rent-a-shell
curl -fsSL <HUB_URL>/skills/rent/rent.mjs -o rent.mjs
npm init -y >/dev/null && npm i @x402/fetch@2.27.0 @x402/core@2.27.0 @x402/svm@2.27.0 @solana/kit@^6
```
Windows (PowerShell, con `curl.exe`):
```powershell
mkdir $HOME\.rent-a-shell -Force; cd $HOME\.rent-a-shell
curl.exe -fsSL <HUB_URL>/skills/rent/rent.mjs -o rent.mjs
npm init -y | Out-Null; npm i @x402/fetch@2.27.0 @x402/core@2.27.0 @x402/svm@2.27.0 @solana/kit@^6
```
Necesita Node 22+. `<HUB_URL>`: `[a confirmar: URL pública del hub]`. Todos los comandos siguientes se corren dentro de `~/.rent-a-shell`.

## 2. Wallet del agente

```bash
node rent.mjs wallet
```
Crea la wallet la primera vez e imprime la address. Para pagar solo necesita **USDC** en la red del shell, sin SOL: el fee lo paga el facilitator de x402. Pedile a la persona que la fondee:
- devnet: faucet.circle.com → Solana Devnet → la address;
- mainnet: cualquier wallet o exchange que mande USDC en Solana.

## 3. Elegir el shell

```bash
node rent.mjs catalog --hub <HUB_URL>
node rent.mjs info --gateway <gateway del shell>
```
`info` trae la ficha (articulaciones y rango seguro, HOME, rutinas, sensores, precio, Forger), la cola y el estado actual. Si está `busy`, el alquiler queda en cola y arranca cuando se libera (el cliente espera solo).

Alternativa sin cliente: el hub y cada gateway exponen `llms.txt` y MCP (`claude mcp add --transport http rent-a-shell <HUB_URL>/mcp`) para explorar el catálogo. El pago se hace igual con este cliente.

## 4. Escribir el plan

Traducí lo que la persona quiere probar a un `plan.json` (lista de pasos):

```json
[
  {"frame": "inicio"},
  {"joint": "base", "angle": 130},
  {"joint": "shoulder", "angle": 110},
  {"joint": "elbow", "angle": 70},
  {"wait": 300},
  {"frame": "alcance"},
  {"joint": "grip", "angle": 100},
  {"dance": "saludo"},
  {"stop": true}
]
```

| Paso | Qué hace | Qué devuelve |
|---|---|---|
| `{"joint","angle"}` | mueve y espera hasta que llega (máx. 4 s) | ángulo aceptado, si se recortó, ángulo medido, si llegó, ms, pico de mA |
| `{"dance"}` | corre una rutina de la ficha | duración, pico de mA |
| `{"wait"}` | espera (máx. 30 s) | |
| `{"frame"}` | foto de la cámara (con `--frames`) | ruta del JPG |
| `{"stop"}` | frena en el lugar | |

Calculá cuántos bloques hacen falta: un bloque son 5 minutos y un movimiento tarda alrededor de 1 s. Casi todo entra en 1 bloque.

## 5. Correr (con el sí de la persona)

```bash
node rent.mjs run --gateway <gateway> --shell <id> --plan plan.json --blocks 1 --max-usd <monto aprobado> --frames fotos --out reporte.json
```
El cliente lee el 402 y, si el monto supera `--max-usd`, no paga. Si no lo supera, paga por x402, espera turno, ejecuta el plan, **cierra la sesión** (el shell vuelve a HOME) y deja el reporte en `reporte.json`. El progreso sale por stderr.

## 6. Leer el reporte y contestar

`reporte.json` tiene:
- `payment` con la tx en el explorer;
- `summary` (movimientos, cuántos llegaron, cuántos se recortaron y el pico de mA);
- `steps` paso a paso.

Contale a la persona en concreto:
- qué llegó y qué no (ángulo pedido contra medido, recortes por rango);
- los consumos (pico de mA por movimiento: sirven para dimensionar la fuente o detectar un servo forzado);
- las fotos (mostralas si la persona las quiere ver);
- el costo y la tx.

Si el resultado contradice la simulación, proponé el ajuste en el código y, si la persona quiere, otra corrida.

## Problemas comunes

| Mensaje | Qué pasa | Qué hacer |
|---|---|---|
| `invalid_exact_svm_transaction_simulation_failed` o `insufficient` | la wallet no tiene USDC en esa red | fondearla (paso 2) y revisar devnet o mainnet |
| `El 402 pide USD X y el tope es…` | cuesta más de lo aprobado | preguntar a la persona |
| `sesión vencida` en pasos | el plan dura más que los bloques | más bloques o un plan más corto |
| `robot_offline` / 503 | el shell se cayó | avisar; con escrow el reembolso es automático |
| `rate_limited` | más de 10 comandos por segundo | sumar `wait` entre pasos |
