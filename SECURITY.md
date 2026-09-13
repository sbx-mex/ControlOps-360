# Seguridad y manejo de datos

Este repositorio público conserva motores, parámetros de cruce, pruebas y documentación técnica. La aplicación procesa los archivos localmente.

## No publicar

- Archivos reales de inventario, ventas, transacciones o colaboradores.
- Históricos generados por una tienda.
- CeCo asociado con resultados operativos reales.
- Rutas personales, correos, tokens, contraseñas o cadenas de conexión.
- Libros `.xlsm`, `.xlsx` o archivos tabulares provenientes de la operación.

El `.gitignore` y el workflow bloquean todos los formatos Excel y CSV sin excepciones.

La aplicación valida la estructura: hechos exclusivamente en `_ac`, catálogos de apoyo y parámetros `tbl` con claves únicas. Las cinco tbl suministradas y las referencias públicas WOE/CeCo se conservan como datos de referencia versionados en `assets/parameters.mjs`, nunca como resultados de venta o inventario.

Los libros nuevos se validan antes de incorporarlos. Otro CeCo, claves contradictorias, parámetros inválidos, ZIP dañado o descompresión excesiva bloquean ese archivo. Una política compostable desconocida o contradictoria impide pedir los artículos controlados.

La política CSP bloquea conexiones salientes; no se utiliza `fetch`, `XMLHttpRequest`, analítica ni servicios de terceros. No se ejecutan macros ni conexiones de Excel. Los enlaces a otros proyectos abren una página separada y no reciben los archivos.

Los datos operativos viven en memoria durante la sesión. Los mínimos y las capturas manuales se conservan en el almacenamiento del navegador por CeCo; no utilizar un equipo compartido sin control de acceso. Las exportaciones pueden contener información operativa: compartirlas sólo por canales autorizados.

## Reporte responsable

Si se detecta información sensible, no abrir un issue público con capturas o datos. Retirar el contenido mediante un PR de saneamiento y notificar al administrador del repositorio por un canal corporativo autorizado.
