# Frame del dron estilo ESP-FLY (Max Imagination), escalado a 8520 + XIAO ESP32S3 Plus + MPU6050 + ESP32-CAM.
# Base: el plano gratis del frame de PVC de ESP-FLY (cabeza octogonal cerrada con tapa, brazos de doble pata).
# Correr:  freecadcmd frame.py   -> escribe frame.stl (cuerpo), cover.stl (tapa) y frame.FCStd al lado.
# Todo en mm. Cambiar números acá, no en el código. Frente = +Y.

WHEELBASE  = 85.0    # diagonal motor a motor: 60 mm entre vecinos, hélices de 55 mm con 5 mm de aire
MOTOR_D    = 8.5     # 8520
MOTOR_TOL  = 0.15    # holgura radial de la copa (ajustar según impresora)
CUP_H      = 8.0     # cuánto motor queda abrazado; la copa no tiene fondo: los cables salen por abajo
CUP_WALL   = 1.2
COLLAR     = (1.0, 1.5)  # anillo más ancho arriba de la copa: ancho extra, alto
ARM_W      = 2.5     # cada una de las dos patas del brazo
ARM_H      = 4.0
HEAD_IN    = (26.0, 42.0, 9.0)   # interior de la cabeza: XIAO (21 x 17.8) adelante y MPU6050 (21 x 16) atrás, en línea
WALL       = 1.2
FLOOR      = 1.2
CHAMFER    = 5.0     # esquinas de la cabeza a 45°
USB_WIN    = (10.0, 5.0, 1.0)    # ventana del USB-C de la XIAO en la pared del frente: ancho, alto, altura desde el piso
WIRE_HOLE  = 3.0     # pasacables hacia cada motor, en cada chaflán
STRAP_SLOT = (2.5, 10.0)         # ranuras del precinto de la batería (752540 cuelga debajo del piso)
COVER_T    = 1.2
LIP        = (1.0, 2.0, 0.15)    # pestaña de calce de la tapa: espesor, alto, holgura con la pared
CAM_CABLE  = (6.0, 3.0)          # agujero en la tapa para el cable de 3,3 V de la ESP32-CAM (va pegada arriba)
PLA        = 1.24    # g/cm3

import math, FreeCAD, Part, Mesh, os
V = FreeCAD.Vector

def octagon(W, L, c, H, z=0.0):
    """Prisma octogonal: rectángulo W (X) x L (Y) con esquinas a 45° de cateto c, centrado en el origen."""
    w, l = W / 2, L / 2
    pts = [V(-w + c, -l, z), V(w - c, -l, z), V(w, -l + c, z), V(w, l - c, z),
           V(w - c, l, z), V(-w + c, l, z), V(-w, l - c, z), V(-w, -l + c, z)]
    return Part.Face(Part.makePolygon(pts + [pts[0]])).extrude(V(0, 0, H))

def bar(p, q, w, h):
    """Barra de ancho w y alto h desde p hasta q (en el plano XY, z de 0 a h)."""
    d = q - p
    b = Part.makeBox(d.Length, w, h, V(0, -w / 2, 0))
    b.rotate(V(0, 0, 0), V(0, 0, 1), math.degrees(math.atan2(d.y, d.x)))
    return b.translate(p)

Win, Lin, Hin = HEAD_IN
Wout, Lout, Hout = Win + 2 * WALL, Lin + 2 * WALL, FLOOR + Hin
inner = octagon(Win, Lin, CHAMFER - WALL * (math.sqrt(2) - 1), Hin + 1, FLOOR)  # pared pareja también en los chaflanes
head = octagon(Wout, Lout, CHAMFER, Hout).cut(inner)

half = WHEELBASE / 2 / math.sqrt(2)   # motores en (±half, ±half)
r_in = MOTOR_D / 2 + MOTOR_TOL
body = head
for sx in (1, -1):
    for sy in (1, -1):
        m = V(sx * half, sy * half, 0)
        # dos patas desde los extremos del chaflán de esa esquina hasta el motor
        for p in (V(sx * (Wout / 2 - CHAMFER), sy * Lout / 2, 0), V(sx * Wout / 2, sy * (Lout / 2 - CHAMFER), 0)):
            body = body.fuse(bar(p, m, ARM_W, ARM_H).cut(inner))
        cup = Part.makeCylinder(r_in + CUP_WALL, CUP_H, m)
        cup = cup.fuse(Part.makeCylinder(r_in + CUP_WALL + COLLAR[0], COLLAR[1], m + V(0, 0, CUP_H - COLLAR[1])))
        body = body.fuse(cup).cut(Part.makeCylinder(r_in, CUP_H, m))
        # pasacables en el chaflán, a la altura del piso
        c = V(sx * (Wout / 2 - CHAMFER / 2), sy * (Lout / 2 - CHAMFER / 2), FLOOR + WIRE_HOLE / 2)
        body = body.cut(Part.makeCylinder(WIRE_HOLE / 2, 6, c - V(sx, sy, 0).normalize() * 3, V(sx, sy, 0)))

# USB-C de la XIAO al frente
body = body.cut(Part.makeBox(USB_WIN[0], 4 * WALL, USB_WIN[1], V(-USB_WIN[0] / 2, Lout / 2 - 2 * WALL, FLOOR + USB_WIN[2])))
# ranuras del precinto de la batería, a los costados del piso
for y in (-Lin / 2 + 8, Lin / 2 - 8):
    for x in (-Win / 2 + 1, Win / 2 - 1 - STRAP_SLOT[0]):
        body = body.cut(Part.makeBox(STRAP_SLOT[0], STRAP_SLOT[1], FLOOR, V(x, y - STRAP_SLOT[1] / 2, 0)))

# Tapa: placa octogonal + pestaña que calza a presión dentro de la cabeza. Se imprime con la pestaña hacia arriba.
lw, lh, lt = LIP
lip_c = CHAMFER - (WALL + lt) * (math.sqrt(2) - 1)
lip = octagon(Win - 2 * lt, Lin - 2 * lt, lip_c, lh, COVER_T)
lip = lip.cut(octagon(Win - 2 * (lt + lw), Lin - 2 * (lt + lw), lip_c - lw * (math.sqrt(2) - 1), lh, COVER_T))
cover = octagon(Wout, Lout, CHAMFER, COVER_T).fuse(lip)
cover = cover.cut(Part.makeBox(CAM_CABLE[0], CAM_CABLE[1], COVER_T, V(-CAM_CABLE[0] / 2, -Lin / 2 + 3, 0)))

here = os.path.dirname(os.path.abspath(__file__))
doc = FreeCAD.newDocument("frame")
for name, shape in (("frame", body), ("cover", cover)):
    shape = shape.removeSplitter()
    assert shape.isValid() and shape.Volume > 0, f"{name}: sólido inválido"
    obj = doc.addObject("Part::Feature", name)
    obj.Shape = shape
    Mesh.export([obj], os.path.join(here, f"{name}.stl"))
    v = shape.Volume / 1000.0
    bb = shape.BoundBox
    print(f"{name}.stl listo: {v:.2f} cm3, ~{v * PLA:.1f} g en PLA, bbox {bb.XLength:.0f} x {bb.YLength:.0f} x {bb.ZLength:.0f} mm")
doc.saveAs(os.path.join(here, "frame.FCStd"))
