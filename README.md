# ControlOps 360 — Inventario y Procesos

Propuesta V1 de un motor único para la gestión operativa de tienda. El proyecto integra conexiones de Excel sin modificar los libros fuente y prepara una sola experiencia de actualización, validación e histórico.

Repositorio: `sbx-mex/ControlOps-360`. Este proyecto es independiente y no requiere modificar proyectos existentes.

## Aplicación pública

Abrir: [https://sbx-mex.github.io/ControlOps-360/](https://sbx-mex.github.io/ControlOps-360/)

La interfaz analiza libros `.xlsx` y `.xlsm` directamente en el navegador, sin enviarlos a un servidor. Incluye una demostración, detección de módulos, vistas por pestaña, alertas de transacciones negativas y exportación de un diagnóstico sin valores operativos.

## Objetivo

- Conservar intacta la base móvil de inventario de 21 días.
- Actualizar todas las conexiones desde una sola portada.
- Acumular únicamente las tablas autorizadas, con llave única y sin duplicados.
- Detectar transacciones negativas y exponer excepciones para revisión.
- Unificar Inventario, Máx/Mín, Peak Hour y Bebida/Alimento.
- Mantener las hojas técnicas como `VeryHidden`; el usuario opera desde `PORTADA`.

## Módulos V1

| Módulo | Fuente propuesta | Resultado |
| --- | --- | --- |
| Auditoría Tienda | Transacciones locales | Alertas por cantidad o importe negativo |
| Histórico Inventario | Base de 21 días, solo lectura | Uso, merma, variación e histórico acumulado |
| Máx & Mín | Pick Pack / Unidad | Recomendación por empaque y número de pedidos |
| Peak Hour 2.0 | `Dashboard_PeakHour` / `Foco_PH` | Hora pico real, diferencia y periodo |
| Bebida & Alimento | Tres pestañas del reporte | `Reporte_Normalizado_v2` |

## Contenido del ZIP

- `ControlOps360_Propuesta_V1.xlsx`: maqueta ejecutiva y mapa del motor.
- `config/conexiones.example.json`: contrato de conexiones y tablas.
- `scripts/auditar_fuentes.py`: diagnóstico sin escritura sobre los Excel.
- `vba/ControlOps360.bas`: macro propuesta para refrescar, acumular y ocultar el motor.
- `vba/ThisWorkbook.bas`: apertura segura mostrando solo la portada.
- `docs/PROPUESTA_V1.md`: alcance, arquitectura y reglas.
- `docs/INTEGRACION_EXCEL_REAL.md`: datos necesarios para conectar los archivos reales.

## Prueba de diagnóstico

1. Copiar los Excel reales a una carpeta local, sin cambiar sus nombres todavía.
2. Ajustar `config/conexiones.example.json` y guardarlo como `config/conexiones.local.json`.
3. Ejecutar:

```powershell
python scripts/auditar_fuentes.py --config config/conexiones.local.json --fuentes "C:\Ruta\Excel" --salida diagnostico.json
```

El script solo lee metadatos del libro: hojas, tablas, coincidencias y archivos faltantes. No abre Excel, no ejecuta macros y no modifica ningún archivo.

## Estado V1

La arquitectura, contrato de datos, maqueta, auditor y módulos VBA están listos. Para la integración final se requieren los libros reales `.xlsx`/`.xlsm`, los nombres exactos de sus tablas y una corrida controlada en Excel de escritorio para validar Power Query y VBA.

## Crear el repositorio nuevo

1. Mantener los Excel operativos fuera del repositorio.
2. Usar `config/conexiones.example.json` como plantilla y guardar la versión local como `config/conexiones.local.json`.
3. Proponer cualquier cambio mediante una rama y Pull Request.
4. Ejecutar la validación incluida en `.github/workflows/validar-v1.yml` antes de integrar.
