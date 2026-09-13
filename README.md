# ControlOps 360

Motor web para analizar archivos operativos `.xlsm` directamente en el navegador. Los libros permanecen en el dispositivo y nunca se modifican.

Aplicación: [https://sbx-mex.github.io/ControlOps-360/](https://sbx-mex.github.io/ControlOps-360/)

## Flujo

1. Cada tienda actualiza su archivo habitual.
2. Carga uno o varios `.xlsm`.
3. El motor valida la estructura de columnas sin depender del nombre del archivo.
4. Lee venta o uso desde tablas ubicadas en pestañas terminadas en `_ac`.
5. Enriquece el resultado con catálogos de producto, CeCo, presentación y compostabilidad contenidos en los libros cargados.
6. Entrega venta, órdenes, ticket, UPT, Peak Hour AM/PM, foco gerencial, producto, canal y uso acumulado de hasta 21 días.
7. Exporta el filtro visible como resumen Excel o PDF.

Los nombres descargados por el navegador, como `Normalizados (1).xlsm`, no afectan la detección. Una copia idéntica ya cargada se rechaza por contenido; archivos distintos con filas repetidas se consolidan sin duplicarlas.

## Motores compatibles

La pestaña `_ac` debe contener una Tabla de Excel con estas columnas:

- `IDTienda`
- `FechaHora`
- `Ticket`
- `SecTrans`
- `SecDtl`
- `Id`
- `IDProducto`
- `Cantidad`
- `Total`
- `CantidadAjustada`

También se aprovechan, cuando existen: `PrecioLista`, `NivelPrecio`, `ModoOrden`, `ModoOrdenDesc`, `IDEmpleado` e `IdTerminal`.

El motor Max & Min se detecta en una pestaña `_ac` por `IDTienda`, `Fecha`, `IDArticulo`, `NombreArticulo` y `UsoIdeal`. El mínimo diario es editable y el máximo usa la frecuencia validada: 2 pedidos `×5`, 3 `×4`, 4 `×3`, 5 `×2`.

## Prueba local de compatibilidad

```powershell
python scripts/compatibilidad_xlsm.py "C:\\Ruta\\Normalizados.xlsm"
```

Para revisar una carpeta completa:

```powershell
python scripts/compatibilidad_xlsm.py --fuentes "C:\\Ruta\\Archivos"
```

La prueba solo lee metadatos del contenedor Excel. No abre Excel, no ejecuta macros y no genera archivos de diagnóstico.

## Desarrollo

```bash
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
node --check assets/app.js
```

El workflow de GitHub bloquea archivos Excel/CSV y restos de la versión de propuesta. El repositorio conserva únicamente código, pruebas, documentación mínima y el motor público.
