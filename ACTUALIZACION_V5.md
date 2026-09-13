# Control Ops 360° · Actualización V5

## Aplicar

1. Crea una rama desde `main` en `sbx-mex/ControlOps-360`.
2. Copia el contenido del ZIP a la raíz, conservando `assets/`, `scripts/`, `tests/` y `.github/`. Reemplaza únicamente los archivos incluidos; no borres otros archivos.
3. Abre el PR y espera el workflow **Validar motores**. Publica después de comprobar la carga y las exportaciones en Chrome o Edge.

Base auditada: `75c12a32fe407b138d11991c22079094e9f8b09d`. Si `main` cambió desde esa base, revisa el diff del PR antes de integrar. `UPDATE_MANIFEST.json` contiene las rutas y huellas del paquete; no es necesario publicarlo.

## Incluido

- Cinco tbl versionadas y actualizables por estructura: alimentos, compostable, vaso, crema y horneo. Rechazo de claves ambiguas, encabezados repetidos y reglas inválidas. `Alimento` y `#Alimento` se leen por separado.
- Carga individual o conjunta; CeCo fijo, confirmación breve y actualización sin duplicar las fechas incluidas. Los XLSM operativos no se incluyen.
- Max & Min con tarjetas editables, Pick Pack y conversiones de piezas; tendencia por semana/día; Pedido WOE con cobertura y bloqueo por CeCo.
- Peak Hour con 48 medias horas; Normalizados y cruce de vasos contra uso del mismo periodo; previsión de horneo; ranking y auditoría de órdenes negativas.
- Exportación Excel/PDF por menú; métodos y límites en **Acerca de**.

## Validación de esta entrega

| Control local | Resultado |
| --- | --- |
| Motor, cruces, pedidos y exportadores JavaScript | 50 pruebas aprobadas |
| Compatibilidad Python e integridad del sitio | 18 pruebas aprobadas |
| Combinaciones no vacías de los tres motores suministrados | 7 aprobadas, incluida recarga |
| Descompresión e integridad CRC de los ocho archivos suministrados | 47 secciones XML verificadas |
| Exportación XLSX | Abierta y comprobada con openpyxl |
| PDF de tablas y tarjetas | Abierto, paginado y revisado visualmente |
| Interacción y carga en navegador | Pendiente: el entorno bloqueó el acceso local |
| GitHub Actions de V5 | Pendiente de subir estos cambios; no se afirma estado verde remoto |

Las pruebas de cálculo real usan extracciones locales de las tablas. No sustituyen la prueba de carga de extremo a extremo en navegador. Ningún resultado operativo real se incorpora al paquete.

## Próxima etapa

Validar visualmente con una tienda antes del despliegue general. Esta V5 es una integración por etapas, no una réplica completa de todos los proyectos originales. Tapas necesitan una regla explícita; venta por empleado y descuentos completos esperan el motor actualizado. La bitácora actual proyecta demanda y captura existencias horneadas; el registro de cada evento de horneo queda pendiente. El histórico operativo acumula sólo durante la sesión. Code Brew y Lay Out son accesos externos sin transferencia de archivos.
