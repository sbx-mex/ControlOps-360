# Integración de los Excel reales

La V1 está preparada para conectar los libros cuando se agreguen. No se incluyeron datos operativos ni se asumieron nombres definitivos a partir de las capturas.

## Archivos necesarios

1. Gestión Inventario 2.0.
2. Histórico Inventario.
3. Max & Min 2.0.
4. Peak Hour 2.0.
5. Reporte Bebida & Alimento con sus tres pestañas.
6. Auditoría Tienda con las transacciones a validar.

## Por cada archivo se debe confirmar

- Nombre real del archivo y si es `.xlsx` o `.xlsm`.
- Tabla que recibe la actualización o resultado de Power Query.
- Columnas exactas y tipo de dato.
- Celda o columna que identifica CeCo, fecha, semana y periodo.
- Macro actual, si existe, y qué tabla modifica.
- Si la conexión requiere una ruta local absoluta.
- Conteo de control antes y después de actualizar.

## Secuencia recomendada de integración

1. Ejecutar `scripts/auditar_fuentes.py` contra una copia de los libros.
2. Corregir el mapa en `config/conexiones.local.json`.
3. Cambiar rangos por Tablas de Excel con nombre donde sea necesario.
4. Importar `vba/ControlOps360.bas` y `vba/ThisWorkbook.bas` en una copia `.xlsm`.
5. Probar primero un solo CeCo y dos corridas idénticas.
6. Confirmar que la segunda corrida agrega cero filas al histórico.
7. Comparar los totales de cada salida contra el archivo original.
8. Habilitar `VeryHidden` únicamente después de aprobar la conciliación.

## Criterio de aceptación

La integración se considera lista cuando cinco corridas consecutivas terminan sin duplicados, las fuentes conservan el mismo hash/tamaño después del proceso y los totales reconciliados coinciden con los reportes originales.

