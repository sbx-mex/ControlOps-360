# Control Ops 360°

Multiherramienta local de tienda. Uno o varios XLSM activan sólo sus módulos. CeCo fijo, cruces tbl, tarjetas Max & Min, tendencia, Pedido WOE, 48 medias horas, normalizados, horneo, ranking y auditoría. Excel y PDF pertenecen al menú activo.

## Actualización V5

Reemplaza los archivos conservando las carpetas del ZIP. No incluye XLSM, ventas ni inventarios de tienda. Las cinco tbl se integran como parámetros versionados en `assets/parameters.mjs`; pueden actualizarse cargando sus XLSX originales por estructura.

La lógica y las limitaciones están en **Acerca de**. Tapas automáticas, historial entre sesiones, venta por empleado y descuentos completos quedan para la siguiente versión. Code Brew y Lay Out siguen siendo proyectos externos.

## Pruebas

```bash
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
python scripts/compatibilidad_xlsm.py motor.xlsm parametro.xlsx
```

Para revisión local: `python -m http.server 8000`, después abrir `http://localhost:8000` con Chrome o Edge actualizado. En GitHub Pages, publicar desde la raíz del repositorio.

No se ejecutan macros ni conexiones. Actualiza y guarda el Excel antes de cargarlo. Los datos operativos sólo permanecen en memoria durante la sesión. No hay envíos de archivos ni dependencias de CDN.
