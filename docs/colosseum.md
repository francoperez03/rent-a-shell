# Rent a Shell · submission para Colosseum

## Nombre

Rent a Shell

## One-liner

Hardware real por minutos para que equipos chicos y sus agentes de IA prueben y construyan soluciones físicas sin comprar ni instalar equipos. Se paga en USDC sobre Solana.

## Tesis

Con la IA, un equipo chico ya puede construir soluciones con hardware: el agente escribe el firmware, el control y la integración. El cuello de botella pasó a ser el acceso. Un equipo bootstrapped, o sin perfiles que instalen y mantengan equipos, se queda en el simulador y nunca toca el mundo real. Rent a Shell les da hardware real por request: alquilan, prueban, miden e iteran. Ahorran tiempo de desarrollo y plata, y el dueño del hardware monetiza horas ociosas.

## Problema

Los equipos chicos ya escriben, con ayuda de agentes de IA, el código de soluciones con hardware, pero no tienen dónde probarlo en hardware real. Comprar el equipo, armarlo y mantenerlo exige plata y perfiles que un equipo bootstrapped no tiene, y los simuladores no muestran el servo que llega dos grados corto. Del otro lado, quien sabe armar hardware no tiene cómo cobrar por ese trabajo más allá de venderlo una vez.

## Solución

Un gateway pone un robot real detrás de una API con sesiones por tiempo. El agente lee `llms.txt` o el MCP, paga un bloque por x402, recibe un token y manda comandos mientras mira la cámara. Al vencer, el robot vuelve solo a HOME y queda libre para el siguiente. Las personas alquilan el mismo robot desde el navegador, pagando con un QR de Solana Pay. El dueño cobra directo en su wallet, sin intervenir.

## Shellsmiths: quién pone el hardware

El catálogo lo construyen los **Shellsmiths**: makers, labs y talleres que arman un shell, lo publican con su ficha (capacidades, rangos, sensores, precio) y lo mantienen online. Cobran por cada minuto de uso directo en su wallet, y pueden ofrecer personalizaciones (un sensor extra, un efector distinto, otro montaje) a los clientes que las pidan. El catálogo crece como un marketplace: cada Shellsmith suma el hardware que conoce y la plataforma pone sesiones, pagos, cola y corte seguro.

Hoy hay un Shellsmith (el equipo, con El Tucu). La ficha ya lleva el Shellsmith y si acepta personalizaciones, y `llms.txt` lo expone a los agentes.

## Cuánto ahorra

Tener El Tucu propio cuesta unos USD 45 en partes, 14 días de espera y 10 h de armado y calibración (detalle en [`costos.md`](costos.md)). Alquilado: USD 1 por 5 minutos, desde hoy. Las partes equivalen a ≈ 3,75 h de uso, y una iteración (subir la rutina, correrla, medir) entra en un bloque de USD 1. El primer test pasa del día 15 al día 1. La diferencia crece con hardware caro, que es lo que suman los Shellsmiths.

## Por qué Solana

Solana es la infraestructura sobre la que operan los agentes: descubren el shell, pagan, prueban y se verifican sin cuenta ni tarjeta y sin un humano en el medio.

- **Agentes que se prueban a sí mismos**: un agente que escribió un controlador lo corre en hardware real, mide (posición alcanzada y, con un sensor de corriente en el shell, los mA que consume cada servo al moverse) y corrige su propio código. Cada iteración es un pago de USD 1, y eso solo cierra con fees de fracciones de centavo y confirmación en segundos.

- **x402 sin gas para el agente**: el agente firma una transferencia de USDC y el facilitator la envía y paga el fee. Con una wallet que solo tiene USDC alcanza.
- **Solana Pay** para personas: un QR con `reference` por sesión. Se confirma buscando esa cuenta, sin contrato ni montos raros.
- **Confirmación en segundos y fees de centavos**: permiten cobrar bloques de USD 1 y abrir la sesión apenas llega el pago.
- **Pago global sin intermediarios**: un equipo en cualquier país paga en USDC, y el Shellsmith cobra directo en su wallet.

## Demo

Un agente prueba su código de robótica en hardware real:

1. Lee `llms.txt` y ve El Tucu (brazo de 4 ejes con cámara en vivo), USD 1 por 5 minutos.
2. Paga 1 bloque por x402 en USDC y recibe el token de sesión.
3. Corre su secuencia de movimientos sobre el brazo real.
4. Mide si cada articulación llegó al ángulo pedido.
5. Devuelve el reporte con la tx en Solscan. El brazo vuelve a HOME.
6. Cierre del video: "esta prueba costó USD 1 y 5 minutos; armar el brazo, USD 45 y dos semanas".

En paralelo, una persona escanea el QR con Phantom y toma el control desde la consola web.

## Estado

- Gateway con sesiones, cola FIFO, corte automático a HOME, rate limit, MCP, `llms.txt` y agent card. Tests en verde.
- Riel `solana-x402`: 402 real en devnet con USDC y fee payer del facilitator; el agente de ejemplo firma y el facilitator simula la tx.
- Riel `solana-pay`: intent con `reference`, QR en el checkout y confirmación por `getSignaturesForAddress`.
- Sitio: landing, checkout con QR, consola con cámara y guía para agentes.
- Robot: El Tucu (ESP32 + 4 servos) funcionando en eventos; el ESP32 queda en red local detrás del gateway.

## Roadmap

- Sensor de corriente (INA219) en El Tucu: los agentes miden consumo por servo además de posición.
- Onboarding de Shellsmiths: publicar un shell con su ficha, un kit de gateway y pago directo a su wallet (`payTo` por shell).
- Escrow en Solana: el pago se libera al Shellsmith cuando la sesión termina bien, y se reembolsa si el shell se cae.
- Más shells: rover, cámara móvil, bancos de sensores.
- Reputación por shell (uptime, sesiones completadas) visible para los agentes.

## Referencia y competencia

- **CrowdBrain** (Grand Prize de Colosseum) valida el espacio de robótica con incentivos on-chain. Rent a Shell apunta al mismo mundo desde otro lado: equipos y agentes que necesitan probar en hardware real y pagan por uso.
- **Renesas Lab on the Cloud** y labs remotos académicos (FPGAs) validan la demanda de hardware real por web, pero cada fabricante muestra solo sus placas. Rent a Shell es neutral, multi-Shellsmith y pensado para agentes.
- **paybot** (ETHGlobal): pago x402 para controlar un robot con webcam. Rent a Shell suma sesiones por tiempo, cola, corte seguro, MCP y pago para personas.
