# Actualización Ensamble V5.5

## Alcance aislado

Esta entrega agrega y mejora únicamente la pestaña **Ensamble** sobre la versión más reciente de `main`. No cambia los cálculos de Max & Min, Tendencia, Pedido WOE, Peak Hour, Normalizados, Horneo, Top ni Auditoría.

## Qué resuelve

- Filtro múltiple de semanas y filtro múltiple de días.
- Proyección por los 48 intervalos de 30 minutos del día.
- Promedio calculado sobre todos los días observados del filtro, incluso cuando un día no tuvo ensambles.
- Exclusión de devoluciones de la demanda positiva.
- Consolidación exclusiva de las 12 filas con `Ensamble = Si` en 6 productos unificados.
- Columna `Ingrediente ensamble` agregada al parámetro embebido y completa en las 12 filas aplicables.
- Cantidad operativa redondeada hacia arriba por producto y media hora, conservando visible el promedio exacto.
- Guía de ingredientes con rebanadas y gramos estimados; Panini Pavo se identifica como empaquetado.

## Cruce validado

| Nombre unificado | Productos fuente |
| --- | --- |
| Bagel Jamon &Queso | Bagel Pavo y Q |
| Baguette Clásica | Baguette Clásica; Part Bag Clásic |
| Baguette suprema | Baguette suprema; Part BaguetteSup |
| BaguetteEspañola | BaguetteEspañola; Part Bag Esp |
| Croissant Jamon &Queso | BS Croissant J/Q; CroInt QuesoPech; Map CroissantJam |
| Panini Pavo | Sand Pavo Panela; Part Swch PavPan |

## Exportación

- **Excel:** Plan media hora, Ingredientes y Trazabilidad.
- **PDF:** plan operativo por franja y guía visual de ingredientes.
- Ninguna exportación incorpora datos de otra pestaña.

## Validación reproducible

```bash
python scripts/auditar_ensamble.py
python scripts/actualizar_tbl_ensamble.py
node --test tests/*.test.mjs
python -m unittest discover -s tests -v
```

El auditor falla de forma cerrada si cambia el cruce de 12 productos, falta una receta, desaparece el filtro múltiple, se retira el cálculo de 48 franjas o se rompe la exportación dedicada.
