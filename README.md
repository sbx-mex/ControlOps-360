# Control Ops 360°

Multiherramienta operativa de Starbucks que procesa motores Excel en el navegador, valida sus cruces y activa únicamente las herramientas compatibles con la tienda.

## Qué integra la versión 6

- Inventario: Max & Min, Tendencia de uso y Pedido WOE con tránsito PDF local.
- Operación: Peak Hour, Normalizados, Ensamble, Horneo, Top y Esfuerzo Operativo.
- Control: Auditoría de Voids por ticket, partner, puesto, motivo y riesgo vinculado.
- Exportación: Excel y PDF del módulo activo, con pie de confidencialidad uniforme.
- Navegación: herramientas agrupadas, centro de mando y accesos visuales a [Code Brew](https://sbx-mex.github.io/CodeBrew_Merch/) y [Lay Out 2.0](https://sbx-mex.github.io/Lay-Out_2.0/).

Los parámetros de referencia están versionados en `assets/parameters.mjs`. El repositorio y el ZIP no contienen ventas, inventarios, transacciones ni libros operativos.

## Puerta de actualización

Python valida estructura, seguridad, tablas de cruce, interfaz, exportaciones y continuidad entre pestañas:

```bash
python -m unittest discover -s tests -v
python scripts/auditar_proyecto.py --json
node --test tests/*.test.mjs
node tests/generar_exportacion_max_min.mjs /tmp/max_min_validacion.xlsx
python scripts/validar_exportacion_max_min.py /tmp/max_min_validacion.xlsx
```

El ZIP reproducible se crea y se vuelve a auditar con:

```bash
python scripts/crear_zip_seguro.py /tmp/ControlOps-360-v6.0.0.zip
python scripts/auditar_proyecto.py --zip /tmp/ControlOps-360-v6.0.0.zip --json
```

Para revisar la interfaz localmente:

```bash
python -m http.server 8000
```

Abre `http://localhost:8000`. No se ejecutan macros, conexiones de Excel, analítica ni llamadas de red desde la aplicación.

CONFIDENCIAL · USO OPERATIVO INTERNO
Diseñador por Jorge Alcantar Aguiar & Enrique César Flores
