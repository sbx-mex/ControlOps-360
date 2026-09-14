# Historial consolidado

## 6.0.0 · Integración 360° estable

- Recupera en una sola base Pedido WOE, Ensamble, Top, Esfuerzo, Normalizados y Auditoría.
- Agrupa la navegación por Inventario, Operación y Control; elimina controles y textos repetidos.
- Integra visualmente Code Brew y Lay Out sin transferir información.
- Añade límites de carga, exportación protegida, CSP cerrada y pies confidenciales.
- Incorpora auditor y generador ZIP en Python para impedir entregas parciales.
- Elimina libros y CSV de apoyo del repositorio; los parámetros ya viven en el módulo versionado.

### Revisión de entregas registradas

No se conservan ZIP históricos porque podrían duplicar código o datos. Se reprodujo la prueba de cada actualización registrada antes de esta integración:

| Base | Python | JavaScript | Lectura |
|---|---|---|---|
| `7141bff` | Rojo | Verde | Auditoría reemplazó partes de Ensamble y Pedido WOE. |
| `2cdb8b8` | Rojo | Verde | Top y Esfuerzo quedaron visibles, pero faltaron contratos previos. |
| `7b904d1` | Verde | Verde | Ensamble completo. |
| `eebd9a0` | Verde | Verde | Ensamble completo. |
| `f3c8c16` | Rojo | Rojo | Peak sobrescribió integración previa. |
| `15f6550` | Rojo | Rojo | Peak sobrescribió integración previa. |
| `b365541` | Rojo | Rojo | Peak sobrescribió integración previa. |
| `a412891` | Verde | Verde | Pedido WOE estable. |
| `acfe52d` | Verde | Verde | Max & Min estable. |
| `7ed8251` | Verde | Verde | Max & Min estable. |
| `9f0e0c0` | Verde | Verde | Exportaciones Max & Min estables. |

La causa común fue reemplazar archivos completos para mejorar una pestaña. Desde 6.0.0, el auditor Python exige simultáneamente los diez módulos, sus reportes, los cruces WOE/Ensamble y el contrato de seguridad antes de empacar o aceptar una actualización.
