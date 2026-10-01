# YouTube Dubbing & Translate: Firefox para Android

Versión para Firefox (Android y ordenador) de la extensión de Chrome que está en [`../chrome`](../chrome).

## Diferencias con la versión de Chrome

- Funciona también en **m.youtube.com** (la versión móvil de YouTube).
- En móvil, el botón es un círculo en la esquina superior izquierda del reproductor. El primer toque inicia el doblaje; los siguientes abren los ajustes, que aparecen como un panel desde abajo.
- **Tocar una palabra** muestra su traducción al francés, en lugar de pasar el ratón. El subtítulo se queda fijo mientras la traducción está abierta. Se cierra al tocar la misma palabra o cualquier otro sitio.
- Firefox apaga el sonido cuando la pantalla se bloquea o cambias de app, así que el doblaje solo funciona con el vídeo en pantalla.

## Instalación temporal por USB (para probar)

La extensión se instala mientras el Mac está conectado. Se borra al cerrar Firefox en el móvil.

1. **En el móvil:**
   1. Activa las opciones de desarrollador: *Ajustes → Información del teléfono →* toca 7 veces *Número de compilación*.
   2. En *Opciones de desarrollador*, activa **Depuración USB**.
   3. En Firefox: *Ajustes → Depuración remota vía USB* → activado.
2. Conecta el móvil al Mac y acepta el aviso "¿Permitir depuración USB?".
3. **En el Mac**, dentro de esta carpeta:

   ```sh
   adb devices   # debe aparecer tu móvil como "device"
   npx web-ext run -t firefox-android --adb-device <ID> --firefox-apk org.mozilla.firefox
   ```

   Usa `org.mozilla.firefox_beta` para Firefox Beta u `org.mozilla.fenix` para Nightly.
4. En el móvil, abre Firefox → menú ⋮ → *Extensiones* → **YouTube Dubbing & Translate**. Si aparece el botón **Allow access to YouTube**, tócalo. Después recarga YouTube.

## Instalación permanente

Firefox solo instala de forma permanente extensiones firmadas por Mozilla. Se puede firmar sin publicarla (canal *unlisted*):

1. Crea una cuenta en <https://addons.mozilla.org> y genera tus claves de API en *Herramientas → Gestionar claves de API*.
2. En esta carpeta:

   ```sh
   npx web-ext sign --channel=unlisted --api-key <CLAVE> --api-secret <SECRETO>
   ```

3. Se genera un archivo `.xpi` en `web-ext-artifacts/`. Pásalo al móvil y ábrelo con Firefox para instalarlo.
