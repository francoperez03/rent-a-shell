# 07 · Proyecto A sobre el mismo núcleo

El Proyecto A (`../../../proyecto-a-hardware-rental/README.md`) apunta a personas que quieren practicar Physical AI sin armar hardware. Usa las mismas piezas que Rent a Shell.

## Qué comparte

| Pieza | Igual en los dos |
|---|---|
| Robot | El Tucu, misma ficha |
| Gateway | mismas sesiones, mismo candado, mismo corte |
| Cámara | mismo HLS |
| Pagos | mismos rieles en Solana |

## Qué cambia

| | Rent a Shell | Proyecto A |
|---|---|---|
| Quién alquila | agente | persona aprendiendo |
| Riel por defecto | x402 en USDC | Solana Pay en USDC |
| Interfaz principal | MCP y `llms.txt` | consola web |
| Copy del hero | "Un cuerpo para tu agente" `[INPUT]` | "Un laboratorio de Physical AI que cobra en tu moneda" (sugerido por la evaluación) |

## Cómo se presenta

Una sola entrega con dos puertas en el sitio: "para personas" (QR de Solana Pay) y "para agentes" (x402). Pagar en moneda local con un on-ramp fiat queda como idea futura: entraría como otro riel detrás de `PaymentRail`.

## Fuera de alcance por ahora

- Marketplace con varios hosts: va como slide (es lo que más arranque en frío tiene).
- Subir firmware o código arbitrario al robot: reemplazado por comandos de alto nivel (`joint`, `dance`). Es lo que más riesgo de romper la demo tenía.
- Escrow on-chain: v1 paga directo al dueño.
