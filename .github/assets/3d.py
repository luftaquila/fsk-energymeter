import FreeCAD
import FreeCADGui
import Part

FreeCADGui.showMainWindow = False

shape = Part.read("housing.stp")

doc = FreeCAD.newDocument("stp")
obj = doc.addObject("Part::Feature", "shape")
obj.Shape = shape
doc.recompute()

solids = sorted(shape.Solids, key=lambda s: s.Volume, reverse=True)

# export top 2 solids with largest volumes
for i, solid in enumerate(solids[:2]):
    solid_obj = doc.addObject("Part::Feature", f"solid_{i}")
    solid_obj.Shape = solid
    doc.recompute()
    Part.export([solid_obj], f"{'top' if i else 'bottom'}.stl")
    doc.removeObject(solid_obj.Name)

FreeCAD.closeDocument("stp")
