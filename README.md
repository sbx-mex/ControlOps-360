# Control Ops 360°

Multiherramienta operativa de Starbucks que procesa motores Excel en el navegador, valida sus cruces y activa únicamente las herramientas compatibles con la tienda.

## Motores y manual · versión 7.5.0

El botón **Motores y manual** está disponible antes y después de cargar datos. Ofrece tres plantillas XLSM originales y el manual PDF; las descargas son locales al proyecto y no agregan servicios externos. Las plantillas se entregan sin registros operativos, con macros y Power Query conservados. Pueden mostrar un CeCo de referencia: verifica el de tu tienda al terminar la actualización.

1. Descarga una vez y crea la carpeta **Control Ops 360 · tu CeCo** en la computadora de Back.
2. Con Excel cerrado: clic derecho en cada archivo → **Propiedades → Desbloquear → Aplicar**, si Windows muestra la opción.
3. Abre cada archivo en Excel de escritorio de Back y pulsa **ACTUALIZAR TODO en la portada del motor**. Ese botón acumula el histórico; no lo sustituyas por la actualización genérica de conexiones de Excel.
4. Espera **Actualización terminada**, confirma el mismo CeCo, registros y fechas, guarda y espera la sincronización de OneDrive si lo usas.
5. Carga los Excel guardados desde el celular de tienda u otro equipo autorizado. El portal no ejecuta macros ni se conecta al SQL de Back.

Las consultas de tickets, Voids, pagos y detalle de venta incluyen una ventana de 20 días; otras fuentes dependen de la disponibilidad de Back. Conserva y actualiza los mismos archivos para acumular historia sin duplicados. Una descarga inicial no recupera el histórico; un cambio de CeCo reinicia el acumulado. La guía incluye tres comprobaciones manuales antes de cargar. No sustituyen las validaciones automáticas del portal. Una plantilla original sin actualizar se rechaza con instrucciones para prepararla.

La revisión Python comprueba integridad ZIP, SHA-256 de cada descarga, 21 tablas, ausencia de registros operativos, presencia de macros/consultas y enlaces con nombres correctos. La lista permitida contiene únicamente los tres XLSM originales; cualquier archivo operativo adicional o una plantilla modificada hace fallar la auditoría. Las consultas SQL y los botones VBA requieren una prueba real en Excel de Back: las comprobaciones estáticas no ejecutan esa conexión.

## Funciones conservadas

- Resumen 360°: muestra sólo las herramientas habilitadas y agrega accesos directos a Lay Out 2.0 y Code Brew con el CeCo actual en URL y contexto local compartido.
- Interfaz rápida: menos texto, jerarquía visual compacta, acciones visibles y ayuda contextual desde el icono `i` de cada pestaña.
- Navegación enfocada: el módulo activo queda identificado y los comparativos secundarios permanecen cerrados hasta solicitarlos.
- Inventario: Max & Min, Tendencia de uso y Pedido WOE con fecha actual fija, recepciones fechadas y tránsito PDF local.
- Operación: Peak Hour, Normalizados, Ensamble y Horneo.
- Indicadores: Top Bebidas & Alimentos integra Esfuerzo Operativo exclusivamente para Cake Pop y Dona G&G.
- Control: Auditoría de Voids por ticket, partner, puesto, motivo y riesgo vinculado.

### Auditoría de Void por cheque

Carga Motor 1 y Motor 2 externos. En **Voids · Auditoría**, cada cheque aparece una vez y puede abrirse para ver todas sus líneas de `void_ac`, incluidos modificadores con importe cero. La clasificación usa el total negativo de `ticket_ac` para **Void exclusivo**. Una línea negativa con total de ticket positivo es **Riesgo de borrado**; cuando `ticket_ac` no incluye ese cheque, un neto positivo de `pagos_ac` muestra el mismo riesgo como **inferencia por pagos**, identificada en pantalla y en Excel. Sin total o pago concluyente figura **Sin cierre verificado**. Un motivo que inicia con `r` agrega **Ticket reabierto** de forma independiente.

Motor 2 aporta uso y stock, pero no líneas de venta ni totales de ticket. El desglose es la evidencia Void disponible en Motor 1, no una reproducción íntegra del recibo. Se puede cotejar el motor sin modificar los XLSM:

```bash
python scripts/auditar_void_motor.py Motor_01_Auditoria_Transacciones.xlsm Motor_02_Uso_Stock.xlsm
```
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

Los parámetros de referencia están versionados en `assets/parameters.mjs`. El repositorio y el ZIP no contienen registros de ventas, inventarios o transacciones. Sólo se permiten las tres plantillas originales verificadas de `downloads/motores/`.

## Aplicar el ZIP de actualización

Extrae el ZIP y reemplaza sus archivos en la raíz de `sbx-mex/ControlOps-360`, conservando las carpetas `assets`, `downloads`, `scripts`, `tests` y `.github`, además de `.gitignore`. El resto del proyecto se conserva. Incluye las modificaciones del workflow para que la puerta Python permita sólo las plantillas originales vacías. La actualización parte de `146434035f4614d4f1045c867727bcb1fddc2501`.

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
python scripts/crear_zip_seguro.py /tmp/ControlOps-360-v7.5.0.zip
python scripts/auditar_proyecto.py --zip /tmp/ControlOps-360-v7.5.0.zip --json
```

El generador excluye cualquier `ZIP_MANIFEST.sha256` de una entrega anterior y crea exactamente uno nuevo. Por ello puede ejecutarse repetidamente sin duplicar rutas.

Para revisar la interfaz localmente:

```bash
python -m http.server 8000
```

Abre `http://localhost:8000`. No se ejecutan macros, conexiones de Excel, analítica ni llamadas de red desde la aplicación.

CONFIDENCIAL · USO OPERATIVO INTERNO
Diseñador por Jorge Alcantar Aguiar & Enrique César Flores
