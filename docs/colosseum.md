# Rent a Shell · submission para Colosseum

## Nombre

Rent a Shell

## One-liner

Robots reales que un agente de IA alquila por bloques de cinco minutos y paga solo, en USDC sobre Solana.

## Problema

Los agentes de IA ya escriben código de robótica, pero no tienen cómo probarlo en hardware real. Comprar un brazo, armarlo y mantenerlo no escala, y los simuladores no muestran el servo que llega dos grados corto. Del otro lado, quien tiene un robot no tiene cómo cobrar por usarlo sin estar presente.

## Solución

Un gateway pone un robot real detrás de una API con sesiones por tiempo. El agente lee `llms.txt` o el MCP, paga un bloque por x402, recibe un token y manda comandos mientras mira la cámara. Al vencer, el robot vuelve solo a HOME y queda libre para el siguiente. Las personas alquilan el mismo robot desde el navegador, pagando con un QR de Solana Pay. El dueño cobra directo en su wallet, sin intervenir.

## Por qué Solana

- **x402 sin gas para el agente**: el agente firma una transferencia de USDC y el facilitator la envía y paga el fee. Con una wallet que solo tiene USDC alcanza.
- **Solana Pay** para personas: un QR con `reference` por sesión. Se confirma buscando esa cuenta, sin contrato ni montos raros.
- **Confirmación en segundos y fees de centavos**: permiten cobrar bloques de USD 1 y abrir la sesión apenas llega el pago.

## Demo

Un agente prueba su código de robótica en hardware real:

1. Lee `llms.txt` y ve El Tucu (brazo de 4 ejes con cámara en vivo), USD 1 por 5 minutos.
2. Paga 1 bloque por x402 en USDC y recibe el token de sesión.
3. Corre su secuencia de movimientos sobre el brazo real.
4. Mide si cada articulación llegó al ángulo pedido.
5. Devuelve el reporte con la tx en Solscan. El brazo vuelve a HOME.

En paralelo, una persona escanea el QR con Phantom y toma el control desde la consola web.

## Estado

- Gateway con sesiones, cola FIFO, corte automático a HOME, rate limit, MCP, `llms.txt` y agent card. Tests en verde.
- Riel `solana-x402`: 402 real en devnet con USDC y fee payer del facilitator; el agente de ejemplo firma y el facilitator simula la tx.
- Riel `solana-pay`: intent con `reference`, QR en el checkout y confirmación por `getSignaturesForAddress`.
- Sitio: landing, checkout con QR, consola con cámara y guía para agentes.
- Robot: El Tucu (ESP32 + 4 servos) funcionando en eventos; el ESP32 queda en red local detrás del gateway.

## Roadmap

- Más shells: rover y cámara móvil con la misma ficha.
- Marketplace multi-host: cualquiera publica su robot, con un programa de escrow en Solana que libera el pago al terminar bien la sesión.
- Reputación por shell (uptime, sesiones completadas) visible para los agentes.

## Referencia y competencia

- **CrowdBrain** (Grand Prize de Colosseum) valida el espacio de robótica con incentivos on-chain. Rent a Shell apunta al mismo mundo desde el lado de la demanda: agentes que necesitan cuerpos y pagan por uso.
- **paybot** (ETHGlobal): pago x402 para controlar un robot con webcam. Rent a Shell suma sesiones por tiempo, cola, corte seguro, MCP y pago para personas.
