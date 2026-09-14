# Actualización Top Bebidas & Alimentos + Esfuerzo Operativo

Versión 5.5.0. Copia el contenido del ZIP en la raíz de `ControlOps-360` y conserva la estructura de carpetas.

## Qué cambia

- Selección múltiple de semanas, días y canales en Top Bebidas & Alimentos.
- Resumen visible del filtro activo y búsqueda de productos.
- Producto líder, promedio diario, concentración Top 5 y día con mayor demanda.
- Ranking con barras de participación y encabezado fijo.
- Nuevo módulo independiente Esfuerzo Operativo.
- Selector USD / UPT, fórmula pedagógica y denominadores visibles.
- Grupos exactos del proyecto de referencia: Cake Pop's, Galletas, Dona G&G y Pan de Muerto.
- USD = unidades de impulso / días operativos.
- UPT = unidades de impulso / transacciones × 100.
- UPT por día vencido con transacciones reales del motor.
- Base propia por tienda usando hasta cuatro días anteriores del mismo día de semana.
- Impacto expresado como unidades necesarias para alcanzar la base propia, sin meta genérica.
- Exportación Excel y PDF con grupos, semanas y días comparables.
- Diseño responsivo para escritorio, tableta y móvil.

## Archivos funcionales

- `assets/operations.mjs`: cálculos, agrupaciones y exportación.
- `assets/ui.mjs`: filtros múltiples, lectura visual y nuevo módulo.
- `assets/styles.css`: jerarquía visual y adaptación responsiva.
- `index.html`: número de versión visible.

Los archivos dentro de `tests/` documentan y validan la nueva lógica. No se incluyen motores, Excel ni datos de tienda.
