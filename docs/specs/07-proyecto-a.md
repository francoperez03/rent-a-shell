# 07 · Proyecto A sobre el mismo núcleo

El Proyecto A (`../../../proyecto-a-hardware-rental/README.md`) apunta a personas que quieren practicar Physical AI sin armar hardware. Usa las mismas piezas que Rent a Shell.

## Qué comparte

| Pieza | Igual en los dos |
|---|---|
| Robot | El Tucu, misma ficha |
| Gateway | mismas sesiones, mismo candado, mismo corte |
| Cámara | mismo HLS |
| Pagos | mismos tres rieles |

## Qué cambia

| | Rent a Shell | Proyecto A |
|---|---|---|
| Quién alquila | agente | persona aprendiendo |
| Riel por defecto | x402 en USDC | Ripio en wARS (o wallet) |
| Interfaz principal | MCP y `llms.txt` | consola web |
| Copy del hero | "Un cuerpo para tu agente" `[INPUT]` | "Un laboratorio de Physical AI que cobra en tu moneda" (sugerido por la evaluación) |
| Track principal | Build with buy | Stable Agents LATAM |

## Cómo se presenta en la hackathon

Una sola entrega con dos puertas en el sitio: "para personas" y "para agentes". El flujo de pago de persona en wARS cubre el track LATAM; el de agente por x402 cubre Build with buy.

## Fuera de alcance para la hackathon

- Marketplace con varios hosts: va como slide (es lo que más arranque en frío tiene).
- Subir firmware o código arbitrario al robot: reemplazado por comandos de alto nivel (`joint`, `dance`). Es lo que más riesgo de romper la demo tenía.
- Escrow on-chain: v1 paga directo al dueño.
