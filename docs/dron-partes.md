# Forger dron · partes y plan de armado

Dron chico brushed 1S para publicar como shell. Vuela con una XIAO ESP32S3 Plus y un MPU6050; una ESP32-CAM aparte transmite video al gateway para visión de movimiento (la visión corre en el Mac). Sin ESC: un MOSFET por motor con PWM desde la XIAO. Sin flujo óptico ni sensor de altura en esta versión.

Firmware: ESP-Drone (port de ESP-FLY a XIAO S3, clonado en `~/repos/job/stables/Co-Create_ESP-FLY`). Eléctrica brushed: ESP-DRONE (`~/repos/job/stables/ESP-DRONE`). Frame estilo ESP-FLY (cabeza octogonal cerrada con tapa y brazos de doble pata, del plano gratis del frame de PVC de ESP-FLY) escalado a los 8520: `hardware/dron/frame.py` genera `frame.stl`, `cover.stl` y `frame.FCStd`; vista en `hardware/dron/frame.png`.

## Componentes

| # | Componente | Cant. | Rol | Estado |
|---|---|---|---|---|
| 1 | XIAO ESP32S3 Plus (16 MB flash) | 1 | controlador de vuelo | tengo |
| 2 | MPU6050 (GY-521) | 1 | giroscopio + acelerómetro, I2C | tengo |
| 3 | Motores 8520 8,5 x 20 mm con hélice, 3 CW + 3 CCW | 4 (+2) | propulsión | tengo |
| 4 | ESP32-CAM AI-Thinker (ESP-32S) + OV3660 | 1 | nodo de video WiFi, pines cortados al ras | tengo |
| 5 | LiPo 1S 752540 25C ~550 mAh, sin PCM | 2 | energía, rotación | tengo 1 · comprar 1 |
| 6 | MOSFET AO3400 SOT-23 (o SI2302) | 4 (+2) | llave de cada motor | comprar |
| 7 | Diodo Schottky SS14 (o 1N5819) | 4 (+2) | flyback en paralelo a cada motor | comprar |
| 8 | Resistencia 100 Ω | 4 (+2) | pin a gate | comprar |
| 9 | Resistencia 10 kΩ | 4 (+2) | gate a GND | comprar |
| 10 | Capacitor electrolítico 100 a 220 µF 6,3 V | 1 (+1) | filtro en VBAT | comprar |
| 11 | Regulador LDO AP2112K 3,3 V 600 mA | 1 | alimenta la CAM desde la LiPo | comprar |
| 12 | Capacitor 100 µF (o 10 µF cerámico) | 1 | salida del AP2112K | comprar |
| 13 | Cargador TP4056 USB-C | 3 (pack) | carga 1S | comprar |
| 14 | Conector PH2.0 macho con cable | 2 | batería a dron | comprar |
| 15 | Adaptador USB-serie 3,3 V (CP2102 / FTDI) o base ESP32-CAM-MB | 1 | programar la CAM | comprar |
| 16 | Placa perforada ~3 x 5 cm | 1 | etapa de potencia | comprar |
| 17 | Frame y tapa impresos (`frame.stl`, `cover.stl`) | 1 | estructura | imprimir |
| 18 | Cinta doble faz de espuma 1 mm | – | MPU6050, XIAO, CAM | comprar |
| 19 | Precintos chicos | 2 | batería | comprar |
| 20 | Cable AWG 28 siliconado rojo/negro, estaño 0,6 mm, flux, termocontraíble 2 mm | – | cableado | comprar |
| – | Soldador, tester, pinza de punta, alicate de corte | – | herramientas | si no hay |

Opcional, después: PMW3901 (flujo óptico), VL53L0X o BMP280 (altura), buzzer, LEDs, interruptor de corte de motores.

## Pinout (XIAO ESP32S3 Plus)

Es el pinout original de ESP-FLY: el firmware compila sin tocar.

| Función | GPIO |
|---|---|
| Motor 1 (FR, delantero derecho) | 7 |
| Motor 2 (RR, trasero derecho) | 4 |
| Motor 3 (RL, trasero izquierdo) | 3 |
| Motor 4 (FL, delantero izquierdo) | 1 |
| I2C SDA / SCL (MPU6050) | 5 / 6 |
| MPU6050 INT | 8 |
| ADC batería | 10 (interno de la Plus, sin divisor) |
| Libres | 2, 43, 44, 38 a 42, 11 a 13 |

Sentido de giro (Quad-X, vista desde arriba, frente = +Y del frame): FR y RL antihorario (CCW), RR y FL horario (CW). Cada hélice según el sentido de su motor.

## Esquema eléctrico

```
LiPo + ──┬── XIAO BAT+                      (la XIAO regula a 3,3 V y alimenta el MPU6050)
         ├── AP2112K IN ── OUT ── CAM 3V3     (100 µF en OUT)
         ├── [100-220 µF] ── GND
         └── Motor(+) x4
Motor(-) ── Drain AO3400 ; Source ── GND
XIAO GPIO ── 100 Ω ── Gate ; Gate ── 10 kΩ ── GND
SS14 en paralelo al motor (cátodo a Motor+, ánodo a Motor-)
GND común en un solo punto: LiPo-, XIAO BAT-, CAM GND, Source x4, capacitor
MPU6050: VCC 3V3, GND, SDA 5, SCL 6, INT 8, AD0 a GND
```

La CAM no tiene cable de datos con la XIAO: comparte batería y GND, y habla sola por WiFi con el gateway. Su regulador propio (AMS1117) necesita más de 4,5 V, por eso se alimenta por el pin 3V3 con el AP2112K. No colgarla del 3V3 de la XIAO.

## Plan de armado

### Fase 0 · Banco, antes de soldar
1. XIAO por USB-C: compilar y flashear ESP-Drone desde `Co-Create_ESP-FLY/Firmware/esp-drone` (ESP-IDF, target esp32s3, `sdkconfig.defaults.esp32s3`). Verificar que arranca y levanta el AP WiFi.
2. MPU6050 en protoboard a la XIAO (5 / 6 / 8). Verificar en el log que detecta el IMU y entrega ángulos.
3. ESP32-CAM: flashear `CameraWebServer` con el adaptador serie (IO0 a GND mientras graba, luego RST). Verificar `http://<ip>/stream` a 320x240 desde el Mac.
4. Imprimir `frame.stl` (la cabeza boca arriba) y `cover.stl` (con la pestaña hacia arriba): PETG o PLA, 0,2 mm, 3 perímetros, 30 % relleno, sin soportes. La tapa calza a presión; si queda floja o no entra, ajustar la holgura de `LIP` en `frame.py`. Probar que un 8520 entra justo en la copa; si no, ajustar `MOTOR_TOL` en `frame.py` y regenerar:
   `/Applications/FreeCAD.app/Contents/Resources/bin/freecadcmd hardware/dron/frame.py`

### Fase 1 · Etapa de potencia
1. Soldar en la perforada 4 x (AO3400 + 100 Ω + 10 kΩ), con un pad común de GND y uno de VBAT. Capacitor de 100 a 220 µF entre VBAT y GND. Diodo SS14 en los cables de cada motor.
2. Un motor sin hélice en cada canal. PWM desde la XIAO a 7, 4, 3, 1: cada GPIO mueve su motor y solo ese. Confirmar el sentido de cada motor.
3. Medir con el tester la corriente de un motor a fondo (esperado 1 a 2 A).

### Fase 2 · Montaje en el frame
1. Motores en las copas, a ras de la base; los cables salen por abajo de la copa y entran a la cabeza por el pasacables del chaflán. FR (+X,+Y), RR (+X,−Y), RL (−X,−Y), FL (−X,+Y).
2. Batería debajo de la cabeza con dos precintos por las ranuras del piso; la placa de potencia debajo de la batería, con espuma.
3. Adentro de la cabeza, en línea: MPU6050 atrás sobre cinta de espuma (eje X del GY-521 hacia el frente) y XIAO adelante con el USB-C en la ventana del frente. Tapa puesta y, arriba, la ESP32-CAM a lo largo con doble faz, lente hacia adelante; su cable de 3,3 V baja por el agujero de atrás de la tapa. AP2112K al costado de la CAM. Verificado en `hardware/dron/layout.py`.
4. Cables AWG 28 lo más cortos posible, GND en estrella.
5. Pesar: objetivo 60 g o menos con batería.

### Fase 3 · Primer vuelo
1. Sin hélices, con batería: la XIAO arranca, el MPU responde y los 4 motores responden desde la app ESP-Drone (celular al AP del dron). La XIAO no se reinicia al acelerar los 4.
2. Con hélices, en lugar cerrado y con red o caja: despegue a 10 cm, verificar que se nivela sola. Si corrige al revés, ajustar la orientación del IMU en el `sdkconfig`.
3. Tunear PID solo si oscila. Anotar valores acá.
4. Medir tiempo de vuelo real con una batería (esperado 4 a 6 min flotando).

### Fase 4 · Integración con el forger (se planifica cuando vuele)
1. Firmware XIAO: endpoint HTTP `/state` (ok, attitude, batería, moving) y comandos (`takeoff`, `land`, `hover`, `move`). El contrato de `packages/shell-spec` es de brazo: definir `kind: "drone"` y comandos propios.
2. Gateway: `ESP32_URL` apunta a la XIAO; la cámara pasa a ser el stream MJPEG de la CAM en lugar de la webcam (`scripts/forger/lib.mjs` arma el comando ffmpeg; aceptar una URL http).
3. Visión en el Mac: lee el stream de la CAM, decide, manda comandos a la XIAO. Primera versión: seguir un color o un AprilTag.

## Números

| Parte | g |
|---|---|
| XIAO ESP32S3 Plus | 4 |
| 4 motores 8520 + hélices | 22 |
| MPU6050 | 2 |
| ESP32-CAM sin pines | 6 |
| LiPo 752540 | 14 |
| Frame y tapa impresos | 8,7 |
| Potencia + cables | 4 |
| **Total** | **~60** |

Empuje: 4 x 8520 con hélice 55 mm, 100 a 140 g en total, relación 2:1. Flotando 3 a 4 A; a 25C la batería entrega hasta 13 A. Autonomía estimada 4 a 6 min.

## Referencias

- **Co-Create_ESP-FLY** (Seeed + Max Imagination): XIAO ESP32S3 + MPU6050 + 4 MOSFET + brushed 1S, 25 g, motores 615 en frame de 50 mm. Firmware ESP-Drone portado a la XIAO S3. Es la base del pinout y del firmware. El estilo del frame sale de su plano gratis del frame de PVC (cabeza de 23 x 23 mm, X de 45 mm, soportes de motor de 8 mm): https://drive.google.com/drive/folders/1Ya7lMM0XlYqmRiv70HhsszpMz4z6rZGp. Los STL oficiales son pagos en Cults3D.
- **ESP-DRONE** (barath0508): ESP-FC con Betaflight Configurator, control por ESP-NOW. Base del esquemático brushed (AO3400, 100 Ω, 10 kΩ, flyback, 100 a 220 µF en VBAT).
- La XIAO ESP32S3 Plus no acepta la placa de cámara de Seeed (su B2B es para Wio-SX1262) y la OV3660 paralela pide 14 GPIO: por eso la CAM va como segunda placa. Fuentes: wiki.seeedstudio.com/pt-br/xiao_esp32s3_getting_started · github.com/adafruit/circuitpython/pull/10701
