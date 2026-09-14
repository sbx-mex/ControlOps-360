# Seguridad y confidencialidad

Control Ops 360° opera con privacidad desde diseño: los Excel y PDF se leen dentro del navegador y no se transfieren a esta página, a los proyectos conectados ni a servicios externos.

## Controles obligatorios

- CSP sin conexiones salientes, formularios, marcos ni contenido remoto.
- Dependencias Python fijadas por versión y SHA-256.
- GitHub Actions fijadas a commits completos y con permisos de sólo lectura.
- Límites de cantidad y tamaño antes de leer Excel o PDF.
- Cruce de CeCo, SAP y DIA con bloqueo ante contradicciones.
- Selección automática del motor con fecha interna y cobertura más recientes.
- Exportación con validación de contenido, nombre seguro, límite de tamaño y marca confidencial.
- ZIP determinista sin enlaces, rutas relativas inseguras, bases operativas ni archivos sensibles; cada archivo se verifica contra `ZIP_MANIFEST.sha256`.

## No publicar

- Excel, CSV o históricos reales de tienda.
- Ventas, inventarios, transacciones, colaboradores o CeCo asociados con resultados.
- Exportaciones generadas a partir de información operativa.
- Tokens, credenciales, correos, rutas personales o llaves privadas.

Los ajustes manuales pueden permanecer en el almacenamiento local del navegador por CeCo. En un equipo compartido, usa un perfil controlado y limpia los datos del sitio al terminar.

## Reporte responsable

No abras un issue público con información operativa. Retira el contenido mediante un PR de saneamiento y avisa al administrador por un canal corporativo autorizado.

CONFIDENCIAL · USO OPERATIVO INTERNO
