# Guion del video · Rent a Shell (3 a 4 minutos)

Formato: cámara al frente para la intro y el cierre, captura de pantalla para las demos, con el brazo real en un recuadro (o la cámara del sitio, que ya lo muestra). Hablá en presente y corto. Lo que está entre corchetes es acción, lo demás se dice.

Antes de grabar: `pnpm forger` corriendo con el túnel, la URL cargada en Vercel, Phantom en devnet con USDC y SOL, la wallet del agente (`node rent.mjs wallet`) con 0.05 USDC o más, una terminal con Claude Code abierta en una carpeta vacía, y el robot en HOME.

---

## 1. Apertura (0:00 a 0:30) · cámara

Hola, soy Franco, desde Tucumán. Esto es Rent a Shell.

[Señalás el brazo, que está al lado tuyo.]

Este es El Tucu: un brazo de cuatro ejes sobre un ESP32, con cámara y medición de corriente. Está conectado a internet y se alquila por minuto. Cinco minutos cuestan cinco centavos de dólar, en USDC sobre Solana.

La idea es simple: hay equipos que escriben firmware con IA y no tienen hardware para probarlo. Y hay agentes que necesitan validar en el mundo físico. Rent a Shell les da un robot real, ahora, sin comprar nada.

Lo que vamos a ver: cómo lo alquila una persona desde la página, y cómo lo alquila un agente con una sola frase.

## 2. Qué es (0:30 a 1:00) · pantalla, landing

[Abrís rent-a-shell.vercel.app y bajás despacio.]

Cada robot publicado es un "shell". Lo publica un Forger, alguien que tiene hardware parado y corre un gateway al lado. El gateway expone la cámara, los sensores y los comandos. El sitio es la vitrina.

[Pasás por "How it works" y parás en "Two ways to use it".]

Dos formas de usarlo. A mano, con una wallet. O a través de tu agente, con una frase. Vamos con la primera.

## 3. Demo persona (1:00 a 2:00) · pantalla, página del shell

[Click en El Tucu. Se ve la cámara en vivo con el badge "Live" y los ángulos reales abajo.]

Esta es la ficha. Cámara en vivo, ángulos reales de cada articulación, rangos seguros, y qué cuesta tener uno versus alquilarlo: cuarenta y cinco dólares en partes y dos semanas de espera, contra cinco centavos ahora.

[Elegís 5 minutos, "Go to payment".]

Elijo cinco minutos y pago. Phantom me arma la transacción: el dinero va a un escrow en Solana, no a mi bolsillo todavía. Si el robot se cae a mitad de sesión, vuelve solo a la wallet del que pagó. Cuando la sesión termina, noventa por ciento al Forger y diez a la plataforma.

[Confirmás en Phantom. Aparece el tick, el hash y "Go to the lab".]

Pagado. Acá está la transacción en el explorer. Voy al laboratorio.

[Consola: movés base, después el gripper. Mirás a cámara real o al recuadro del brazo.]

Esto es el robot de verdad moviéndose. Los números son los ángulos que el servo alcanzó, no los que pedí. Si un servo queda dos grados corto, lo ves acá.

[Volvés a HOME o dejás que siga. Pasás a la terminal.]

## 4. Demo agente (2:00 a 3:15) · pantalla, terminal con Claude Code

Ahora lo mismo, pero sin tocar nada. Le hablo a mi agente.

[Pegás la frase, tal cual está en la landing.]

"Go to rent-a-shell.vercel.app, pick the shell, pay for 5 minutes, open the gripper and then ask me what to do next."

[Mientras el agente trabaja, narrás lo que va pasando en pantalla.]

El sitio publica un llms.txt con la URL del gateway y un cliente. El agente lo lee, ve el shell, y antes de gastar me muestra el precio y me pide que confirme.

[Confirmás con "sí".]

Paga con x402: el gateway responde 402, el agente firma la transferencia de USDC y un facilitador la sube a la cadena. El agente no necesita SOL ni cuenta en ningún lado.

[Se ve el comando del gripper y el resultado: ángulo real, tiempo restante.]

Abrió el gripper. Me dice el ángulo que midió y cuánto tiempo me queda. Y me pregunta qué más quiero hacer.

[Respondés: "mové la base a 130 y sacá una foto". Mostrás la foto que devuelve.]

Eso es un agente operando hardware real, pagando por su cuenta, con un humano al mando.

## 5. Cierre (3:15 a 3:45) · cámara

Lo que hay hoy: un shell real en Tucumán, pagos con Solana Pay y escrow para personas, x402 para agentes, un hub para listar más robots, y una skill para Claude Code. Todo abierto en GitHub.

Lo que sigue: más Forgers publicando sus robots, y la corriente en miliamperios por movimiento para que el reporte del agente diga cuánto consume cada gesto.

Si tenés un robot juntando polvo, publicalo. Si tenés código que nunca tocó un servo, probalo. Cinco minutos, cinco centavos.

Rent a Shell. Gracias.

---

## Notas de grabación

- Dejá que el agente pida confirmación en cámara: es el momento que muestra que el gasto está bajo control del humano.
- Si el túnel se reinició antes de grabar, redeployá Vercel con la URL nueva (la frase de la landing y el llms.txt la toman solos).
- El mA sale vacío hasta flashear el firmware con el INA219. Si no llega para el video, no lo nombres en la demo, solo en "lo que sigue".
- Tené el explorer de la transacción x402 listo para mostrar en un tab si querés reforzar que fue real.
