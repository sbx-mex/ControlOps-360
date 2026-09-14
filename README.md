# Control Ops 360°

Multiherramienta local de tienda. Uno o varios XLSM activan sólo sus módulos. CeCo fijo, cruces tbl, tarjetas Max & Min, tendencia, Pedido WOE, ensamble por media hora, normalizados, horneo, ranking y auditoría. Excel y PDF pertenecen al menú activo.

## Actualización V5

Reemplaza los archivos conservando las carpetas del ZIP. No incluye XLSM, ventas ni inventarios de tienda. Las cinco tbl se integran como parámetros versionados en `assets/parameters.mjs`; pueden actualizarse cargando sus XLSX originales por estructura.

La lógica y las limitaciones están en **Acerca de**. Tapas automáticas, historial entre sesiones, venta por empleado y descuentos completos quedan para la siguiente versión. Code Brew y Lay Out siguen siendo proyectos externos.

### Pedido WOE V5.4

`Pedido WOE` ahora guía al usuario en cuatro pasos: programar el ciclo, agregar pedidos en tránsito, contar la existencia física y exportar. La fecha de captura inicia con el día local actual; el porcentaje de uso pendiente se calcula automáticamente y ya no se muestra como filtro.

Los PDF SAP de pedidos en tránsito se leen localmente en el navegador. Cada remisión conserva su orden y fecha; el cruce prioriza SAP y DIA, bloquea contradicciones y sólo descuenta tránsito que cae dentro de la cobertura. La pantalla ya no muestra `Base de vasos` ni los cuatro indicadores técnicos de la versión anterior.

Las exportaciones de Excel y PDF están orientadas a operación: incluyen identificación SAP/DIA, descripción, existencia, tránsito por remisión, cantidad final y los cruces que requieren revisión. Ningún archivo operativo se envía fuera del navegador.

### Ensamble V5.5

`Ensamble` usa las 12 filas validadas de la tbl con `Ensamble = Si` y las consolida en 6 nombres unificados. La columna `Ingrediente ensamble` quedó agregada al parámetro embebido con contenido en las 12 filas aplicables. Los filtros de semana y día aceptan selección múltiple. El motor promedia los días realmente observados en cada intervalo de 30 minutos, separa devoluciones y redondea hacia arriba únicamente para formar el plan operativo.

La pantalla guía al usuario en tres pasos, muestra el promedio exacto debajo de cada cantidad sugerida y destaca la franja de mayor carga. La guía de ingredientes convierte el plan del día en rebanadas y gramos; `Panini Pavo` permanece identificado como producto empaquetado.

Excel entrega `Plan media hora`, `Ingredientes` y `Trazabilidad`. El PDF genera una tabla operativa por franja y una segunda sección visual de recetas. Los filtros y los cálculos permanecen limitados a esta pestaña.

## Pruebas

```bash
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
python scripts/auditar_ensamble.py
python scripts/auditar_pedido_woe.py
python scripts/compatibilidad_xlsm.py motor.xlsm parametro.xlsx
```

Para revisión local: `python -m http.server 8000`, después abrir `http://localhost:8000` con Chrome o Edge actualizado. En GitHub Pages, publicar desde la raíz del repositorio.

No se ejecutan macros ni conexiones. Actualiza y guarda el Excel antes de cargarlo. Los datos operativos sólo permanecen en memoria durante la sesión. No hay envíos de archivos ni dependencias de CDN.
