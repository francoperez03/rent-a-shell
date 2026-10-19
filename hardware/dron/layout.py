# Disposición de componentes sobre el frame, para verificar que entran (no se imprime).
# Correr dentro de FreeCAD (consola Python o freecad-mcp) con frame.FCStd abierto,
# o headless:  freecadcmd layout.py  -> escribe layout.FCStd
import FreeCAD, Part, math, os
HERE = os.path.dirname(os.path.abspath(__file__))
doc = FreeCAD.ActiveDocument or FreeCAD.openDocument(os.path.join(HERE, "frame.FCStd"))
for o in list(doc.Objects):
    if o.Name not in ("frame", "cover"): doc.removeObject(o.Name)
GUI = FreeCAD.GuiUp
# mismas medidas que frame.py
WHEELBASE, FLOOR, WALL, HEAD_IN, COVER_T = 85.0, 1.2, 1.2, (26.0, 42.0, 9.0), 1.2
Win, Lin, Hin = HEAD_IN
H = FLOOR + Hin
half = WHEELBASE / 2 / math.sqrt(2)
PROP_R, PROP_Z = 27.5, 20.0   # hélice de 55 mm arriba del 8520 (20 mm de motor desde la base de la copa)

# la tapa va dada vuelta sobre la cabeza: la pestaña entra, la placa queda arriba
cover = doc.getObject("cover")
cover.Placement = FreeCAD.Placement(FreeCAD.Vector(0, 0, H + COVER_T), FreeCAD.Rotation(FreeCAD.Vector(1, 0, 0), 180))

def box(name, L, W, Ht, x, y, z, color):
    o = doc.addObject("Part::Feature", name)
    o.Shape = Part.makeBox(L, W, Ht, FreeCAD.Vector(x - L/2, y - W/2, z))
    if GUI: o.ViewObject.ShapeColor = color; o.ViewObject.Transparency = 30
    return o

# adentro de la cabeza, en línea: MPU6050 atrás, XIAO adelante con el USB-C contra la ventana del frente
inside = [
    box("MPU6050", 21, 16,   3, 0, -Lin/2 + 8 + 0.5,  FLOOR, (0.2, 0.8, 0.3)),
    box("XIAO",    21, 17.8, 5, 0,  Lin/2 - 8.9,      FLOOR, (0.2, 0.5, 0.9)),
]
# arriba de la tapa, pegada con doble faz; abajo, la batería con precinto y la etapa de potencia
top = H + COVER_T
above = [
    box("ESP32_CAM", 27, 40.5, 4.5, 0, 0, top, (0.9, 0.3, 0.3)),
    box("lente",      8,  8,   6,   0, 14, top + 4.5, (0.1, 0.1, 0.1)),
]
box("bateria_752540", 25, 40, 7.5, 0, 0, -7.5, (0.9, 0.6, 0.1))
box("placa_potencia", 24, 20, 4,   0, 0, -11.5, (0.6, 0.6, 0.6))
motors = [(sx * half, sy * half) for sx, sy in [(1, 1), (1, -1), (-1, -1), (-1, 1)]]
for i, (mx, my) in enumerate(motors):
    m = doc.addObject("Part::Feature", f"motor{i+1}")
    m.Shape = Part.makeCylinder(4.25, 20, FreeCAD.Vector(mx, my, 0))
    p = doc.addObject("Part::Feature", f"helice{i+1}")
    p.Shape = Part.makeCylinder(PROP_R, 1, FreeCAD.Vector(mx, my, PROP_Z))
    if GUI: p.ViewObject.Transparency = 70
doc.recompute()

# chequeos
for o in inside:
    b = o.Shape.BoundBox
    assert -Win/2 <= b.XMin and b.XMax <= Win/2 and -Lin/2 <= b.YMin and b.YMax <= Lin/2, f"{o.Name} no entra en la cabeza"
    assert b.ZMax <= H - 2.0, f"{o.Name} choca con la pestaña de la tapa"
for o in above:
    b = o.Shape.BoundBox
    assert abs(b.XMin) <= Win/2 + WALL and abs(b.YMin) <= Lin/2 + WALL + 0.5, f"{o.Name} sobresale de la tapa"
    # lo que esté bajo el disco de alguna hélice tiene que quedar por debajo de ella
    for mx, my in motors:
        dx = max(b.XMin - mx, 0, mx - b.XMax); dy = max(b.YMin - my, 0, my - b.YMax)
        if math.hypot(dx, dy) < PROP_R: assert b.ZMax < PROP_Z, f"{o.Name} choca con una hélice"
assert half * 2 > 2 * PROP_R, "las hélices vecinas se tocan"
print("layout ok")
if not GUI:
    doc.saveAs(os.path.join(HERE, "layout.FCStd"))
