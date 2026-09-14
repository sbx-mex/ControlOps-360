# Actualización Pedido WOE · V5.4

## Qué cambia para la tienda

La pestaña se convirtió en un flujo guiado de cuatro pasos:

1. **Programa:** la fecha de captura inicia con el día actual y la próxima entrega define la cobertura.
2. **Agrega tránsito:** permite cargar uno o varios PDF SAP sin mezclar remisiones ni fechas.
3. **Cuenta:** el usuario captura únicamente la existencia física; el sistema descuenta automáticamente el tránsito aplicable.
4. **Exporta:** Excel y PDF muestran los datos operativos que sirven para revisar y ejecutar el pedido.

Se retiraron de esta vista el filtro **Uso pendiente hoy**, el filtro **Base de vasos** y los indicadores **Referencia de uso**, **SAP/DIA validados**, **Artículos en pedido** y **No aplican / sin cruce**. La normalización comparable continúa en el motor, sin exponer una decisión técnica al usuario.

## Reglas de cruce

- Se normalizan los códigos SAP y DIA sin perder ceros significativos.
- Un cruce por ambos códigos debe apuntar al mismo artículo; si se contradicen, la línea se bloquea.
- Un pedido puede contener varias líneas y se pueden cargar varias remisiones para la misma fecha.
- Se rechazan PDF repetidos, números de pedido repetidos, fechas anteriores a la captura y renglones incompletos.
- Las cajas se convierten a la unidad operativa con el empaque WOE; una unidad incompatible se marca para revisión.
- Sólo se descuenta el tránsito cuya entrega está entre la fecha de captura y el fin de la cobertura.
- Los artículos sin cruce vigente o sin unidad compatible nunca generan una cantidad automática.

## Exportaciones

El Excel genera una hoja principal de pedido, una hoja de pedidos en tránsito y, cuando corresponde, una hoja de cruces por revisar. El PDF usa formato carta horizontal, repite las columnas SAP/DIA y descripción al dividir muchas remisiones y conserva encabezado, periodo y paginación.

## Verificación

Ejecuta desde la raíz:

```bash
node --test tests/*.test.mjs
python -m unittest discover -s tests -p 'test_*.py'
python scripts/auditar_pedido_woe.py
```

El auditor específico cubre fechas, SAP, DIA, contradicciones, duplicados, unidades, varias remisiones, límites de cobertura, filtros retirados y componentes de exportación.
