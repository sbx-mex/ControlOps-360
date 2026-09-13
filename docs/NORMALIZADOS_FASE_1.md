# Normalizados — fase 1

## Diagnóstico del libro real

Archivo revisado: `Reporte Normalizado_v2.xlsm`.

- Tamaño de referencia: 1.44 MB sin datos históricos significativos.
- Cinco conexiones Power Query: `Cruce_Producto`, `Detalle_CB`, `Detalle_vaso`, `Regla_normalizado_vaso` y `Reglas_Normalizado`.
- Dos bases móviles: `Detalle_CB` con 17 columnas y `detallevaso` con 26 columnas.
- Dos históricos: `historicocb` y `historicovaso`.
- Dos tablas de reglas: `Tabla5` y `reglavaso`.
- Cinco tablas dinámicas alimentan `Tamanos`, `Vaso&Tapa` y `Crema Batida`.

## División aprobada

### 1. `Normalizados_Extractor.xlsm`

Se ejecuta en el back de tienda.

- Conecta con SQL local.
- Recupera hasta 20 días.
- Valida que todos los registros correspondan al mismo `IDTienda`.
- Genera las tablas `Detalle_CB` y `detallevaso`.
- No conserva históricos ni tablas dinámicas.

### 2. `Normalizados_Historico.xlsx`

- Conserva `historicocb` y `historicovaso`.
- No contiene credenciales ni conexiones SQL.
- Recibe sólo registros nuevos después de validar las llaves.
- Debe dividir `historicovaso` por periodo antes de acercarse al límite de filas de Excel.

### 3. `Normalizados_Reporte.xlsm`

- Contiene `Tamanos`, `Vaso&Tapa` y `Crema Batida`.
- Consulta el histórico y los archivos de reglas.
- No consulta directamente `localhost`.
- Mantiene las tablas dinámicas y fórmulas de presentación.

### 4. Reglas externas

- `tbl_normalizado_crema.xlsx`
- `tbl_normalizado_vaso.xlsx`

Las reglas pueden actualizarse sin reemplazar el histórico ni el reporte.

## Detección en GitHub Pages

El navegador no puede recorrer automáticamente carpetas privadas del equipo. El gerente selecciona uno o varios archivos mediante **Cargar Excel**. La aplicación:

1. Lee localmente el nombre, las hojas y las tablas.
2. Reconoce el módulo Normalizados.
3. Indica qué componente fue cargado y cuál falta.
4. No transmite datos de tienda a GitHub.

## Contrato mínimo

| Componente | Identificación |
| --- | --- |
| Reporte actual | Nombre que contenga `Reporte Normalizado` |
| Base crema | Hoja `base_cb`, tabla `Detalle_CB` |
| Histórico crema | Hoja `historico_cb`, tabla `historicocb` |
| Base vaso | Hoja `base_vaso`, tabla `detallevaso` |
| Histórico vaso | Hoja `historico_vaso`, tabla `historicovaso` |
| Reglas crema | Archivo `tbl_normalizado_crema.xlsx` |
| Reglas vaso | Archivo `tbl_normalizado_vaso.xlsx` |

## Seguridad

- Los Excel operativos, datos, históricos, rutas locales y credenciales no se versionan.
- GitHub conserva únicamente código, contratos, documentación y pruebas.
- La lectura del Excel en la aplicación web ocurre en el navegador y sin conexiones de red.
