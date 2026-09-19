# Historial consolidado

## 7.2.0 · Peak Hour operativo y edición rápida

- Oculta en Max & Min el bloque redundante de alcance, uso y selección.
- Redondea el uso diario de Pedido WOE a una decimal y permite avanzar con `Enter` entre productos.
- Separa Peak Hour en AM `00:00–14:00` y PM `14:00–23:59`.
- Muestra únicamente medias horas con actividad mayor a cero.
- Retira Órdenes, Bloque, Impulso y la tarjeta “Meta rápida”.
- Integra Tareas de Ciclo con frecuencias de 30, 20, 12 y 8 minutos tomadas del asistente XLSM.
- Añade un generador Python reproducible, pruebas de umbrales y validaciones de interfaz/exportación.

## 7.1.0 · Puerta verde e interfaz enfocada

- Corrige la causa del fallo de GitHub Actions: un `ZIP_MANIFEST.sha256` extraído se estaba empaquetando y después se generaba por segunda vez.
- Convierte el generador Python en idempotente: siempre excluye manifiestos anteriores y valida rutas sin distinción de mayúsculas antes de escribir el ZIP.
- Agrega una regresión específica para impedir que el manifiesto duplicado vuelva a romper la puerta de calidad.
- Reduce ruido visual al guardar tablas secundarias dentro de detalles opcionales en Tendencia, Peak Hour y Auditoría.
- Marca la pestaña activa para lectores de pantalla y centra automáticamente la navegación horizontal en móvil.
- Mantiene intactos los filtros múltiples, accesos directos, ayuda contextual y Esfuerzo Operativo integrado de la versión 7.0.0.

## 7.0.0 · Interfaz rápida y Esfuerzo integrado

- Reduce texto, espacios y controles repetidos en todas las pestañas para acelerar la validación visual.
- Agrega ayuda contextual simplificada desde el icono `i` superior.
- Mantiene abiertos los filtros múltiples durante la selección y permite salir con `Listo`, Escape o clic exterior.
- Integra Esfuerzo Operativo dentro de Top Bebidas & Alimentos y limita el cálculo a Cake Pop y Dona G&G.
- Retira Esfuerzo Operativo del menú principal sin perder sus exportaciones.
- Incorpora accesos directos a Lay Out 2.0 y Code Brew con el CeCo actual en la URL y en un contexto local compartido.
- Amplía las pruebas de integridad para proteger la nueva navegación, los filtros y los accesos directos.

## 6.5.0 · Pedido WOE con identidad segura

- Remasteriza la programación del pedido con días activos, lista de fechas disponibles y selección rápida del siguiente pedido.
- Retira de la lista cualquier fecha que ya esté cubierta por un PDF en tránsito y mueve la selección a la siguiente fecha libre.
- Compara la identidad del PDF con el CeCo y nombre de la tienda cargada desde los Motores; confirma cada lectura aprobada y rechaza la ajena sin incorporarla.
- Permite ajustar y restaurar el uso diario por producto sin alterar la base histórica.
- Incluye en PDF y Excel el uso diario aplicado y conserva la cantidad final a pedir.
- Amplía la auditoría Python y las pruebas JavaScript con Luna Parc, Galerías Perinorte, tienda ajena, fechas miércoles/sábado y tránsito duplicado.

## 6.4.0 · Proveedor y sesión recuperable

- Añade a Pedido WOE un selector directo para `DIA`, `Maquila | Café Sirena` y `Lala | Comercializadora Lácteos`.
- Separa por proveedor los productos, los PDF en tránsito y la exportación para evitar cruces accidentales.
- Conserva en IndexedDB los Motores ya procesados y recupera la tienda después de actualizar o reabrir la página.
- Muestra el estado de guardado en el encabezado y solicita almacenamiento persistente cuando el navegador lo permite.
- Sustituye “Cambiar tienda” por un reinicio confirmado que borra únicamente los datos locales de Control Ops y recarga una sesión limpia.
- Amplía la puerta verde con contratos de proveedor, persistencia, borrado y clonación estructurada.

## 6.3.0 · Pedido WOE directo e intuitivo

- Fija la fecha de captura al día actual y elimina su edición manual.
- Renombra la decisión principal a “¿Para cuándo es el pedido?”.
- Muestra la próxima fecha real únicamente en los días de recepción activados.
- Convierte el progreso en navegación rápida y enfoca las actividades en programar, agregar tránsito, contar y descargar.
- Añade validaciones de interfaz para impedir que estas mejoras se pierdan en futuras actualizaciones.

## 6.2.1 · Filtros rápidos y puerta verde

- Cierra cada filtro múltiple al seleccionar para que el resultado quede visible de inmediato.
- Añade búsqueda en listas largas, apertura exclusiva, cierre exterior y tecla Escape.
- Sincroniza pruebas, auditor, versión y documentación con la interfaz mínima para recuperar la puerta verde.
- Evita que un ID de empleado reutilizado bloquee Motor_01; el ticket queda sin atribución automática.
- Mantiene sólo las herramientas disponibles y la carga principal identificada en verde.

## 6.1.0 · Gestión 360° trazable

- Añade Resumen 360°, Finanzas, Alcance y calidad, y Fuentes cargadas sin duplicar las pantallas operativas.
- Corrige la selección de Motores: deduplica sólo por CeCo, tipo y periodo, y conserva periodos distintos.
- Expone archivos seleccionados, omitidos y bloqueados con motivo, periodo, CeCo y hora de lectura.
- Carga parámetros, lector Excel, exportador y tránsito sólo cuando se necesitan; Python protege el presupuesto inicial.
- Amplía la evidencia de cruces con cardinalidad, entradas, coincidencias, duplicados, salidas y diferencias.
- Incorpora 15 escenarios 360° de regresión para cobertura, CeCo, duplicados, periodos, consistencia y volumen.

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
