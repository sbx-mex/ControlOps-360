CONTROL OPS 360 - FASE 1 NORMALIZADOS

1. En Excel cree una consulta en blanco llamada normalizados_base.
2. Pegue el contenido de Consulta_normalizados_base.txt en Editor avanzado.
3. Cargue el resultado en la tabla tblNormalizadosBase.
4. No cree conexiones SQL separadas para Detalle_CB, Detalle_vaso ni Cruce_Producto.
5. Las reglas tblReglaCrema y tblReglaVaso son catálogos locales.
6. El histórico tblNormalizadosAC debe ser alimentado por el motor externo sin duplicar.

Llave recomendada (fuera del extractor): IDTienda + Ticket + SecTrans + SecDtl + Id + IDProducto.
