# Seguridad y confidencialidad

Control Ops 360° opera con privacidad desde diseño: los Excel y PDF se leen dentro del navegador y no se transfieren a esta página, a los proyectos conectados ni a servicios externos.

## Controles obligatorios

- CSP sin conexiones salientes, formularios, marcos ni contenido remoto.
- Dependencias Python fijadas por versión y SHA-256.
- GitHub Actions fijadas a commits completos y con permisos de sólo lectura.
- Límites de cantidad y tamaño antes de leer Excel o PDF.
- Cruce de CeCo, SAP y DIA con bloqueo ante contradicciones.
- PDF de tránsito validado contra la identidad de los Motores: CeCo exacto cuando está disponible y nombre similar verificable como respaldo; un conflicto o ausencia de identidad bloquea la incorporación.
- Aislamiento por CeCo y selección determinística por tipo y periodo; toda omisión queda justificada.
- Caché acotada por SHA-256 y carga diferida de componentes pesados.
- Sesión recuperable en IndexedDB: conserva únicamente la representación procesada de los Motores dentro del mismo navegador y la reemplaza en una transacción local.
- Reinicio confirmado: `Reiniciar datos` borra la sesión recuperable y los ajustes de Control Ops antes de recargar una pantalla limpia.
- Exportación con validación de contenido, nombre seguro, límite de tamaño y marca confidencial.
- ZIP determinista sin enlaces, rutas relativas inseguras, bases operativas ni archivos sensibles; cada archivo se verifica contra `ZIP_MANIFEST.sha256`.

## No publicar

- Excel, CSV o históricos reales de tienda.
- Ventas, inventarios, transacciones, colaboradores o CeCo asociados con resultados.
- Exportaciones generadas a partir de información operativa.
- Tokens, credenciales, correos, rutas personales o llaves privadas.

Los Motores procesados, ajustes manuales y PDF de tránsito pueden permanecer en el almacenamiento local del navegador por CeCo. En un equipo compartido, usa un perfil controlado y pulsa `Reiniciar datos` al terminar. Esta acción no elimina los Excel o PDF originales del dispositivo.

## Reporte responsable

No abras un issue público con información operativa. Retira el contenido mediante un PR de saneamiento y avisa al administrador por un canal corporativo autorizado.

CONFIDENCIAL · USO OPERATIVO INTERNO
