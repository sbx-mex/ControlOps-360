# Mejora puntual · pestaña Normalizados

Este paquete modifica únicamente la lógica, la interfaz y las pruebas de **Normalizados**. No incluye motores operativos ni archivos de otras herramientas.

## Qué queda listo

- Cuatro vistas: **Resumen**, **Vasos y tapas**, **FHW** y **Crema batida**.
- Los filtros de **Semanas**, **Días** y **Canales** permiten selección múltiple y afectan las cuatro vistas.
- Todas las vistas conservan al menos una tabla comparativa.
- Se eliminan las tarjetas anteriores de Bebidas en vaso, FHW y Devoluciones.
- FHW se presenta como indicador ejecutivo con un decimal.
- Se distingue una bebida preparada de un RTD o un adicional usando categoría, subcategoría y nombre.

## Reglas de bebida

| Ejemplo | Resultado |
|---|---|
| Pumpkin Latte | Vaso caliente |
| Hel PumpkinLatte | Vaso helado |
| Pumpkin F | Vaso helado / Frappuccino |
| NuezPcanaCr LatH | Vaso helado |
| Pumpkin Cream F | Vaso helado / Frappuccino |
| CF Pumpkin CB | Adicional; no consume vaso |
| Aranchiatta, Agua Evian, Agua Coco | RTD; no consumen vaso |

La subcategoría confirma primero que el producto sea una bebida preparada. Las marcas `Hel`, `LatH` y `F` sólo definen la presentación después de esa validación. Así, un RTD nunca genera vaso por coincidencia de nombre.

## Definición de FHW

El numerador considera únicamente `Vaso Vidrio N`, `Vaso Vidrio` y `Taza Bebida Cal` cuando:

1. el canal es **Starbucks Coffee**;
2. existe una bebida preparada en el mismo ticket;
3. la fecha y hora coinciden exactamente.

El denominador es el total de bebidas preparadas del canal Starbucks Coffee en el filtro activo. Delivery, Drive Thru y agregadores no aplican.

`FHW % = FHW emparejado / bebidas Starbucks Coffee × 100`

El resultado se muestra con una decimal; por ejemplo, `1,158 / 9,631 = 12.0%`.

## Cargar y actualizar el motor de reglas

El archivo listo para cargar es:

`parametros/tbl_normalizado_vaso_actualizado.xlsx`

Para futuras cargas, ejecute desde la raíz del proyecto:

```bash
python scripts/actualizar_tbl_normalizado_vaso.py \
  --operativo "Motor_03_Detalle_Productos.xlsm" \
  --catalogo "parametros/tbl_normalizado_vaso_actualizado.xlsx" \
  --salida "parametros/tbl_normalizado_vaso_siguiente.xlsx" \
  --reporte "parametros/auditoria_reglas_normalizados.csv"
```

El actualizador lee directamente `detalleventa_ac` y `producto_base`, conserva las reglas existentes, agrega reglas seguras, corrige conflictos explícitos y deja una auditoría CSV. La cantidad detectada depende del motor cargado; no está fijada en 63.

## Aplicación

Descomprima el ZIP sobre una copia del repositorio respetando las rutas. Después cargue el motor operativo y la `tbl` actualizada en la aplicación.
