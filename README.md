# ControlOps 360

Control ejecutivo local para tienda. Carga uno o varios libros; el motor reconoce tablas por columnas, no por nombre del archivo, y despliega un menú solo con los análisis disponibles.

## Módulos

- `Normalizados.xlsm`: venta, ticket, UPT, Peak Hour y vaso de Bebida Alta Caliente.
- `Auditoria_Tienda.xlsm`: negativos, voids y pagos.
- `Max & Min.xlsm`: uso acumulado hasta 21 días y Pedido editable.
- `WOE_CMS_Motor.xlsx`: códigos, empaque y aplicabilidad Compostable/No compostable.
- `tbl_parametro_horneo.xlsx`: descongelación, horneo, temperatura y máximo por charola.

Los XLSM operativos se leen desde pestañas `_ac`. Los XLSX solo se aceptan cuando su estructura corresponde a un parámetro conocido. Al combinar motores, todos deben pertenecer al mismo CeCo. Pedido bloquea artículos incompatibles o sin equivalencia WOE.

## Validación

```bash
python scripts/compatibilidad_xlsm.py archivo.xlsm parametro.xlsx
python -m unittest discover -s tests -v
node --test tests/*.test.mjs
```

Aplicación: [https://sbx-mex.github.io/ControlOps-360/](https://sbx-mex.github.io/ControlOps-360/)

Versión actual: `4.0.0`.
