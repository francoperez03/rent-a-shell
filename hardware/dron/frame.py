# Frame del dron: X quad 85 mm, brushed 8520, XIAO ESP32S3 Plus + ESP32-CAM.
# Correr:  FreeCADCmd frame.py   -> escribe frame.stl al lado.
# Todo en mm. Cambiar números acá, no en el código.

WHEELBASE   = 85.0   # diagonal motor a motor
MOTOR_D     = 8.5    # 8520
MOTOR_TOL   = 0.15   # holgura radial de la copa (ajustar según impresora)
CUP_H       = 8.0    # cuánto motor queda abrazado
CUP_WALL    = 1.2
ARM_W       = 4.0
ARM_H       = 3.0
PLATE_L     = 72.0   # largo del cuerpo (eje Y, adelante = +Y)
PLATE_W     = 28.0
PLATE_T     = 1.2
CORNER_R    = 4.0
BAT         = (25.0, 40.0, 7.5)   # 752540: ancho, largo, alto (va debajo)
STRAP_SLOT  = (3.0, 12.0)         # ranuras para precinto / velcro
FLOW_WINDOW = 9.0    # ventana para un PMW3901 futuro (no va en v1; no pesa, se deja)
M2_HOLE_D   = 2.2

import math, FreeCAD, Part, Mesh, os

def rounded_plate(L, W, T, r):
    s = Part.makeBox(L - 2*r, W, T, FreeCAD.Vector(r, 0, 0))
    s = s.fuse(Part.makeBox(L, W - 2*r, T, FreeCAD.Vector(0, r, 0)))
    for x in (r, L - r):
        for y in (r, W - r):
            s = s.fuse(Part.makeCylinder(r, T, FreeCAD.Vector(x, y, 0)))
    return s.translate(FreeCAD.Vector(-L/2, -W/2, 0))

plate = rounded_plate(PLATE_W, PLATE_L, PLATE_T, CORNER_R)  # ancho en X, largo en Y

half = WHEELBASE / 2 / math.sqrt(2)   # motores en (±half, ±half)
body = plate
for sx in (1, -1):
    for sy in (1, -1):
        cx, cy = sx*half, sy*half
        length = math.hypot(cx, cy)
        arm = Part.makeBox(length, ARM_W, ARM_H, FreeCAD.Vector(0, -ARM_W/2, 0))
        arm.rotate(FreeCAD.Vector(0, 0, 0), FreeCAD.Vector(0, 0, 1), math.degrees(math.atan2(cy, cx)))
        # dentro del cuerpo el brazo queda a ras de la placa, para que las placas apoyen planas
        arm = arm.cut(rounded_plate(PLATE_W, PLATE_L, ARM_H, CORNER_R).translate(FreeCAD.Vector(0, 0, PLATE_T)))
        body = body.fuse(arm)
        r_in = MOTOR_D/2 + MOTOR_TOL
        cup = Part.makeCylinder(r_in + CUP_WALL, CUP_H, FreeCAD.Vector(cx, cy, 0))
        cup = cup.cut(Part.makeCylinder(r_in, CUP_H, FreeCAD.Vector(cx, cy, 0)))
        cup = cup.cut(Part.makeBox(2.0, 20, CUP_H, FreeCAD.Vector(cx - 1.0, cy - 20 if sy < 0 else cy, 0)))  # ranura para los cables
        body = body.fuse(cup)

# Ventana del flujo óptico, atrás del centro (la batería va bajo el centro)
body = body.cut(Part.makeBox(FLOW_WINDOW, FLOW_WINDOW, PLATE_T, FreeCAD.Vector(-FLOW_WINDOW/2, -PLATE_L/2 + 4, 0)))
# Ranuras para el precinto de la batería, a ambos lados del centro
for y in (-BAT[1]/2 + 6, BAT[1]/2 - 6):
    for x in (-PLATE_W/2 + 3, PLATE_W/2 - 3 - STRAP_SLOT[0]):
        body = body.cut(Part.makeBox(STRAP_SLOT[0], STRAP_SLOT[1], PLATE_T, FreeCAD.Vector(x, y - STRAP_SLOT[1]/2, 0)))
# Agujeros M2 para la tapa, en las esquinas
for x in (-PLATE_W/2 + 3, PLATE_W/2 - 3):
    for y in (-PLATE_L/2 + 3, PLATE_L/2 - 3):
        body = body.cut(Part.makeCylinder(M2_HOLE_D/2, PLATE_T, FreeCAD.Vector(x, y, 0)))

out = os.path.join(os.path.dirname(os.path.abspath(__file__)), "frame.stl")
doc = FreeCAD.newDocument("frame")
obj = doc.addObject("Part::Feature", "frame"); obj.Shape = body
Mesh.export([obj], out)
doc.saveAs(out.replace(".stl", ".FCStd"))
v = body.Volume / 1000.0
print(f"frame.stl listo: {v:.2f} cm3, ~{v*1.24:.1f} g en PLA, bbox {body.BoundBox.XLength:.0f} x {body.BoundBox.YLength:.0f} x {body.BoundBox.ZLength:.0f} mm")
assert body.isValid() and body.Volume > 0, "sólido inválido"
