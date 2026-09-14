# Mejora puntual · Voids / Auditoría

Este paquete deja **un solo flujo de Auditoría: Voids**. Elimina la navegación separada de Negativas y concentra la revisión en tickets anulados, su contexto y su desglose.

## Lectura para auditoría

| Señal | Interpretación visual |
|---|---|
| Motivo inicia con `v` | **Foco** de Void |
| Motivo `Otros` | **Foco** que requiere validar contexto |
| Motivo inicia con `r` | **Reopen**; explica lo ocurrido al reabrir el cheque |
| Orden negativa vinculada | **Riesgo** dentro del ticket Void |

La herramienta presenta hechos para revisión y no concluye fraude.

## Navegación

- Filtros de selección múltiple: **Semanas, Días, Motivos y Partners**.
- Cada ticket aparece una sola vez en la tabla principal.
- El botón **Ver ticket** abre el detalle sin cambiar de módulo.
- Se muestran fecha y hora exactas de cierre, ticket, partner, puesto, motivo, importe, forma de pago y productos anulados.
- La tabla **Concentración por partner** compara tickets, focos, Reopen, órdenes negativas e importe.

## Archivos compatibles

La lógica acepta cualquiera de estas fuentes y sus copias renombradas:

- `Motor_01_Auditoria_Transacciones.xlsm`: cruza `void_ac`, `ticket_ac`, `pagos_ac`, `vta_producto_base` y `empleado_base`.
- `Auditoria_Tienda.xlsm`: lee directamente `Base_Void` y evita duplicar los registros de `Historico_Void`.

En `Auditoria_Tienda.xlsm`, los productos repetidos por el cruce del Excel se consolidan como productos únicos dentro del ticket; el total del ticket no se suma por cada producto.

## Aplicación

Descomprima el ZIP sobre la raíz de la versión actual de `ControlOps-360`, respetando las rutas y reemplazando los archivos indicados. El paquete no contiene información operativa de ninguna tienda.
