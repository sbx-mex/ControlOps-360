# ControlOps 360

Motor web para analizar archivos operativos `.xlsm` directamente en el navegador. Los libros permanecen en el dispositivo y nunca se modifican.

Aplicación: [https://sbx-mex.github.io/ControlOps-360/](https://sbx-mex.github.io/ControlOps-360/)

## Flujo

1. Cada tienda actualiza su archivo habitual.
2. Carga uno o varios `.xlsm`.
3. El motor valida la estructura de columnas sin depender del nombre del archivo.
4. Dentro de cada libro compatible, lee únicamente la pestaña terminada en `_ac`.
5. Consolida las filas usando la llave `IDTienda + Ticket + SecTrans + SecDtl + Id + IDProducto`.
6. Omite duplicados y muestra resumen, excepciones, productos, horas, modos de orden y una muestra de registros.

Los nombres descargados por el navegador, como `Normalizados (1).xlsm`, no afectan la detección. Una copia idéntica ya cargada se rechaza por contenido; archivos distintos con filas repetidas se consolidan sin duplicarlas.

## Estructura compatible

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
node --test tests/engine.test.mjs
node --check assets/app.js
```

El workflow de GitHub bloquea archivos Excel/CSV y restos de la versión de propuesta. El repositorio conserva únicamente código, pruebas, documentación mínima y el motor público.
