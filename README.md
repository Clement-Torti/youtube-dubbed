# YouTube Dubbing & Translate

Extensión de navegador que traduce los subtítulos de un vídeo de YouTube y los dobla con voz sintética.

La voz siempre habla a una velocidad fija (1x por defecto, ajustable en pasos de 0.05x). Es el vídeo el que adapta su velocidad, y se pausa brevemente si hace falta, para que el doblaje y la imagen estén siempre sincronizados.

| Carpeta | Navegador |
|---|---|
| [`chrome/`](chrome) | Chrome (ordenador) |
| [`firefox/`](firefox) | Firefox para Android y ordenador, incluida la versión móvil de YouTube. Instrucciones en su [README](firefox/README.md). |

## Instalación en Chrome

1. Abre `chrome://extensions` y activa el **modo desarrollador**.
2. Pulsa **Cargar descomprimida** y elige la carpeta `chrome/`.
3. Abre un vídeo con subtítulos y pulsa el icono del altavoz en la barra del reproductor.

## Servicios usados (gratuitos, sin clave)

- **Subtítulos:** las pistas de subtítulos del propio vídeo.
- **Traducción:** la traducción automática de subtítulos de YouTube por defecto, con Google Translate como alternativa.
- **Voz:** voces neuronales de Microsoft Edge si están disponibles; si no, la voz de Google Translate.

## Diagnóstico

Todo lo que hace la extensión aparece en la consola de la página con el prefijo `[AutoDub]`.
