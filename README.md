# Control Ops 360°

Multiherramienta operativa de Starbucks que procesa motores Excel en el navegador, valida sus cruces y activa únicamente las herramientas compatibles con la tienda.

## Qué integra la versión 7.4.0

- Resumen 360°: muestra sólo las herramientas habilitadas y agrega accesos directos a Lay Out 2.0 y Code Brew con el CeCo actual en URL y contexto local compartido.
- Interfaz rápida: menos texto, jerarquía visual compacta, acciones visibles y ayuda contextual desde el icono `i` de cada pestaña.
- Navegación enfocada: el módulo activo queda identificado y los comparativos secundarios permanecen cerrados hasta solicitarlos.
- Inventario: Max & Min, Tendencia de uso y Pedido WOE con fecha actual fija, recepciones fechadas y tránsito PDF local.
- Operación: Peak Hour, Normalizados, Ensamble y Horneo.
- Indicadores: Top Bebidas & Alimentos integra Esfuerzo Operativo exclusivamente para Cake Pop y Dona G&G.
- Control: Auditoría de Voids por ticket, partner, puesto, motivo y riesgo vinculado.
- Exportación: Excel y PDF del módulo activo, con pie de confidencialidad uniforme.
- Filtros: selección múltiple persistente, búsqueda en listas largas y salida clara con `Listo`, Escape o clic exterior.
- Pedido WOE: lista de próximas fechas reales según los días activos; una fecha desaparece cuando ya existe un PDF en tránsito y el botón `Usar siguiente` acelera la captura.
- Validación de tránsito: compara el CeCo y nombre disponibles en cada PDF contra la tienda de los Motores; confirma lo aprobado y rechaza sin incorporar cualquier identidad ajena o no verificable.
- Ajuste operativo: el uso diario puede modificarse o restaurarse por producto; el PDF y Excel finales conservan el uso aplicado y la cantidad a pedir.
- Edición rápida WOE: uso diario visible y guardado a una decimal; `Enter` avanza al siguiente producto.
- Max & Min: oculta el resumen redundante de alcance, uso y selección; mantiene filtros, tarjetas y exportación.
- Peak Hour: experiencia independiente con base `Promedio` prioritaria, comparativo semanal AM/PM, objetivo automático `+5` y captura de resultado real por tienda y fecha.
- PH Tendencia: filtro de día de la semana y comparación de hasta ocho fechas equivalentes; muestra cada media hora, el Peak AM/PM de cuatro medias horas consecutivas, diferencia contra la semana anterior y el principal foco de mejora.
- PDF Peak Hour: genera exactamente dos hojas carta horizontales; la primera conserva el comparativo AM/PM y la segunda concentra hasta 48 filas de `Time Period` en una sola página.
- Tarea de Ciclo: subpestaña independiente por día con `Time Period`, `TX`, `CS` y actividad editable; Python extrae y normaliza 52 actividades con frecuencias de 30, 20, 12 y 8 minutos.
- PDF Tarea de Ciclo: imprime hasta 48 periodos activos del día en una sola hoja carta horizontal.
- Proveedores: mantiene un flujo independiente para `DIA`, `Maquila | Café Sirena` y `Lala | Comercializadora Lácteos`.
- Sesión recuperable: después de validar los Motores, conserva localmente su representación procesada y reconstruye la tienda al actualizar o volver a abrir la página en el mismo navegador.
- Reinicio seguro: `Reiniciar datos` pide confirmación, borra la sesión, conteos, tránsito y ajustes locales de Control Ops, y vuelve a iniciar sin eliminar los Excel o PDF originales.

Cada Motor operativo debe identificar un único CeCo. La selección compara archivos equivalentes por `CeCo + tipo + periodo`, conserva la versión más reciente y mantiene periodos distintos. Si Motor_01 reutiliza un ID para personas diferentes, la auditoría conserva el ticket como `Partner no identificado` en vez de bloquear la carga o atribuirlo a la persona equivocada.

Los módulos de parámetros, lectura Excel, exportación y tránsito se cargan bajo demanda. La puerta Python mide el grafo inicial y evita que una actualización vuelva a cargar esos componentes antes de necesitarlos. La recuperación usa IndexedDB y solicita almacenamiento persistente cuando el navegador lo permite; no usa cookies ni conexiones de red.

Los parámetros de referencia están versionados en `assets/parameters.mjs`. El repositorio y el ZIP no contienen ventas, inventarios, transacciones ni libros operativos.

## Puerta de actualización

Python valida estructura, seguridad, tablas de cruce, interfaz, exportaciones y continuidad entre pestañas:

```bash
python -m unittest discover -s tests -v
python scripts/auditar_proyecto.py --json
python scripts/auditar_peak_hour.py --json
python scripts/auditar_rendimiento.py --json
node --test tests/*.test.mjs
node tests/generar_exportacion_max_min.mjs /tmp/max_min_validacion.xlsx
python scripts/validar_exportacion_max_min.py /tmp/max_min_validacion.xlsx
```

El ZIP reproducible se crea y se vuelve a auditar con:

```bash
python scripts/crear_zip_seguro.py /tmp/ControlOps-360-v7.4.0.zip
python scripts/auditar_proyecto.py --zip /tmp/ControlOps-360-v7.4.0.zip --json
```

El generador excluye cualquier `ZIP_MANIFEST.sha256` de una entrega anterior y crea exactamente uno nuevo. Por ello puede ejecutarse repetidamente sin duplicar rutas.

Para revisar la interfaz localmente:

```bash
python -m http.server 8000
```

Abre `http://localhost:8000`. No se ejecutan macros, conexiones de Excel, analítica ni llamadas de red desde la aplicación.

CONFIDENCIAL · USO OPERATIVO INTERNO
Diseñador por Jorge Alcantar Aguiar & Enrique César Flores
