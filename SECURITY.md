# Seguridad y manejo de datos

Este repositorio público conserva únicamente motores, pruebas y documentación técnica. La aplicación procesa los archivos localmente.

## No publicar

- Archivos reales de inventario, ventas, transacciones o colaboradores.
- Históricos generados por una tienda.
- CeCo asociado con resultados operativos reales.
- Rutas personales, correos, tokens, contraseñas o cadenas de conexión.
- Libros `.xlsm`, `.xlsx` o archivos tabulares provenientes de la operación.

El `.gitignore` y el workflow bloquean todos los formatos Excel y CSV sin excepciones.

La aplicación valida la estructura y lee únicamente la fuente `_ac`. La política CSP bloquea conexiones salientes; no se utiliza `fetch`, `XMLHttpRequest`, analítica ni servicios de terceros.

## Reporte responsable

Si se detecta información sensible, no abrir un issue público con capturas o datos. Retirar el contenido mediante un PR de saneamiento y notificar al administrador del repositorio por un canal corporativo autorizado.
