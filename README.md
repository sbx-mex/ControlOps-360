# Control Ops 360°

Multiherramienta local de tienda. Uno o varios XLSM activan sólo sus módulos. CeCo fijo, cruces tbl, tarjetas Max & Min, tendencia, Pedido WOE, 48 medias horas, normalizados, horneo, ranking, Esfuerzo Operativo y auditoría. Excel y PDF pertenecen al menú activo.

## Actualización V5

Reemplaza los archivos conservando las carpetas del ZIP. No incluye XLSM, ventas ni inventarios de tienda. Las cinco tbl se integran como parámetros versionados en `assets/parameters.mjs`; pueden actualizarse cargando sus XLSX originales por estructura.

La lógica y las limitaciones están en **Acerca de**. Tapas automáticas, historial entre sesiones, venta por empleado y descuentos completos quedan para la siguiente versión. Code Brew y Lay Out siguen siendo proyectos externos.

### Top & Esfuerzo Operativo V5.5

`Top Bebidas & Alimentos` permite seleccionar varias semanas, días y canales a la vez. La pantalla confirma el universo activo, concentra los indicadores clave y agrega barras de participación para que el ranking pueda leerse sin recorrer primero toda la tabla. La búsqueda por producto recalcula unidades, mezcla y venta sobre los resultados visibles.

`Esfuerzo Operativo` es un módulo independiente basado en la metodología de `sbx-mex/Esfuerzo_Operativo`. Agrupa Cake Pop's, Galletas, Dona G&G y Pan de Muerto. `USD` significa unidades de impulso por día operativo y `UPT` significa unidades por cada 100 transacciones. Los dos indicadores se calculan como razón de totales y utilizan exactamente las mismas semanas, días y canales elegidos.

UPT se abre por día vencido con las transacciones reales del motor. Para cada fecha se construye una base propia con hasta cuatro fechas anteriores del mismo día de semana. El impacto indica las unidades adicionales que habrían permitido alcanzar ese ritmo histórico de la propia tienda; no se impone una meta genérica. Excel y PDF exportan esta lectura activa, su detalle diario y la reconciliación semanal.

### Pedido WOE V5.4

`Pedido WOE` ahora guía al usuario en cuatro pasos: programar el ciclo, agregar pedidos en tránsito, contar la existencia física y exportar. La fecha de captura inicia con el día local actual; el porcentaje de uso pendiente se calcula automáticamente y ya no se muestra como filtro.

Los PDF SAP de pedidos en tránsito se leen localmente en el navegador. Cada remisión conserva su orden y fecha; el cruce prioriza SAP y DIA, bloquea contradicciones y sólo descuenta tránsito que cae dentro de la cobertura. La pantalla ya no muestra `Base de vasos` ni los cuatro indicadores técnicos de la versión anterior.

Las exportaciones de Excel y PDF están orientadas a operación: incluyen identificación SAP/DIA, descripción, existencia, tránsito por remisión, cantidad final y los cruces que requieren revisión. Ningún archivo operativo se envía fuera del navegador.

## Pruebas

```bash
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
python scripts/auditar_pedido_woe.py
python scripts/compatibilidad_xlsm.py motor.xlsm parametro.xlsx
```

Para revisión local: `python -m http.server 8000`, después abrir `http://localhost:8000` con Chrome o Edge actualizado. En GitHub Pages, publicar desde la raíz del repositorio.

No se ejecutan macros ni conexiones. Actualiza y guarda el Excel antes de cargarlo. Los datos operativos sólo permanecen en memoria durante la sesión. No hay envíos de archivos ni dependencias de CDN.
