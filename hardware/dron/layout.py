# Disposición de componentes sobre el frame, para verificar que entran (no se imprime).
# Correr dentro de FreeCAD (consola Python o freecad-mcp) con frame.FCStd abierto,
# o headless:  freecadcmd layout.py  -> escribe layout.FCStd
import FreeCAD, Part, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
doc = FreeCAD.ActiveDocument or FreeCAD.openDocument(os.path.join(HERE, "frame.FCStd"))
for o in list(doc.Objects):
    if o.Name != "frame": doc.removeObject(o.Name)
T = 1.2; half = 85/2/math.sqrt(2)
GUI = FreeCAD.GuiUp

def box(name, L, W, H, x, y, z, color):
    o = doc.addObject("Part::Feature", name)
    o.Shape = Part.makeBox(L, W, H, FreeCAD.Vector(x - L/2, y - W/2, z))
    if GUI: o.ViewObject.ShapeColor = color; o.ViewObject.Transparency = 30
    return o

# arriba de la placa, de atrás (-Y) a adelante (+Y)
box("MPU6050",    21,   16,   3,   0, -19, T, (0.2, 0.8, 0.3))
box("XIAO",       21,   17.8, 4,   0,   0, T, (0.2, 0.5, 0.9))
box("ESP32_CAM",  40.5, 27,   4.5, 0,  23, T, (0.9, 0.3, 0.3))   # atravesada; sobresale 6 mm por lado sobre los brazos
box("lente",       8,    8,   6,   0,  33, T + 4.5, (0.1, 0.1, 0.1))
box("AP2112K",     6,    6,   2,  17,  10, T, (0.9, 0.7, 0.2))
# abajo de la placa
box("bateria_752540", 25, 40, 7.5, 0,  0, -7.5, (0.9, 0.6, 0.1))
box("placa_potencia", 24, 20, 4,   0, 26, -4,   (0.6, 0.6, 0.6))
# motores y hélices
for i, (sx, sy) in enumerate([(1, 1), (1, -1), (-1, -1), (-1, 1)]):
    m = doc.addObject("Part::Feature", f"motor{i+1}")
    m.Shape = Part.makeCylinder(4.25, 20, FreeCAD.Vector(sx*half, sy*half, 0))
    p = doc.addObject("Part::Feature", f"helice{i+1}")
    p.Shape = Part.makeCylinder(27.5, 1, FreeCAD.Vector(sx*half, sy*half, 20))
    if GUI: p.ViewObject.Transparency = 70
doc.recompute()

# chequeos: todo lo de arriba dentro del largo de la placa y por debajo de las hélices
tops = [doc.getObject(n).Shape.BoundBox for n in ("MPU6050", "XIAO", "ESP32_CAM", "lente")]
assert min(b.YMin for b in tops) > -36 and max(b.YMax for b in tops) < 38, "componentes fuera de la placa"
assert max(b.ZMax for b in tops) < 20, "componentes chocan con las hélices"
print("layout ok")
if not GUI:
    doc.saveAs(os.path.join(HERE, "layout.FCStd"))
