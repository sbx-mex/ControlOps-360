# Control Ops 360°

Multiherramienta operativa de Starbucks que procesa motores Excel en el navegador, valida sus cruces y activa únicamente las herramientas compatibles con la tienda.

## Qué integra la versión 6.2.1

- Resumen 360°: muestra únicamente las herramientas habilitadas por los Motores cargados.
- Inventario: Max & Min, Tendencia de uso y Pedido WOE con tránsito PDF local.
- Operación: Peak Hour, Normalizados, Ensamble, Horneo, Top y Esfuerzo Operativo.
- Control: Auditoría de Voids por ticket, partner, puesto, motivo y riesgo vinculado.
- Exportación: Excel y PDF del módulo activo, con pie de confidencialidad uniforme.
- Filtros: selección de un toque, cierre automático, búsqueda en listas largas y cierre con Escape o clic exterior.

Cada Motor operativo debe identificar un único CeCo. La selección compara archivos equivalentes por `CeCo + tipo + periodo`, conserva la versión más reciente y mantiene periodos distintos. Si Motor_01 reutiliza un ID para personas diferentes, la auditoría conserva el ticket como `Partner no identificado` en vez de bloquear la carga o atribuirlo a la persona equivocada.

Los módulos de parámetros, lectura Excel, exportación y tránsito se cargan bajo demanda. La puerta Python mide el grafo inicial y evita que una actualización vuelva a cargar esos componentes antes de necesitarlos.

Los parámetros de referencia están versionados en `assets/parameters.mjs`. El repositorio y el ZIP no contienen ventas, inventarios, transacciones ni libros operativos.

## Puerta de actualización

Python valida estructura, seguridad, tablas de cruce, interfaz, exportaciones y continuidad entre pestañas:

```bash
python -m unittest discover -s tests -v
python scripts/auditar_proyecto.py --json
python scripts/auditar_rendimiento.py --json
node --test tests/*.test.mjs
node tests/generar_exportacion_max_min.mjs /tmp/max_min_validacion.xlsx
python scripts/validar_exportacion_max_min.py /tmp/max_min_validacion.xlsx
```

El ZIP reproducible se crea y se vuelve a auditar con:

```bash
python scripts/crear_zip_seguro.py /tmp/ControlOps-360-v6.2.1.zip
python scripts/auditar_proyecto.py --zip /tmp/ControlOps-360-v6.2.1.zip --json
```

Para revisar la interfaz localmente:

```bash
python -m http.server 8000
```

Abre `http://localhost:8000`. No se ejecutan macros, conexiones de Excel, analítica ni llamadas de red desde la aplicación.

CONFIDENCIAL · USO OPERATIVO INTERNO
Diseñador por Jorge Alcantar Aguiar & Enrique César Flores
