// Lista de canciones: cada una vive en songs/<nombre>.js y aparece en el desplegable en este orden.
// Para añadir una: crea songs/<nombre>.js (copia uno que ya exista) y añade aquí su nombre.
// El nombre del archivo tiene que ser igual que su `id`.
//
// Formato de cada canción (SONGS.push({...})):
//   tab: pega el tab ASCII (estilo Ultimate Guitar). La app saca sola el ritmo (cada nota separada
//     por 2 guiones = una casilla), el acorde de cada medio compás y los dedos de las dos manos.
//     Si el tab tiene barras invertidas (slides "\"), usa String.raw`...` para que no se pierdan.
//   bpm: tempo en pulsos · slotsPerBeat: casillas del tab por pulso (2 = corcheas, 4 = semicorcheas)
//   fingers (opcional): corrige los dedos de un acorde, p. ej. { 'x,5,7,6,7,x': [0,1,3,2,4,0] }
//     (clave = trastes de 6ª a 1ª separados por comas)
//   tuning (opcional): afinación de 6ª a 1ª si no es la estándar, p. ej. 'D A D F# B E'
//   grid (opcional): para tabs que no agrupan las notas por tiempos, cada `charsPerSlot` caracteres
//     son una casilla: { charsPerSlot: 2, slotsPerMeasure: 12, window: 6 }
window.SONGS = window.SONGS || [];
window.SONG_FILES = [
  'hisoyakani',
  'for-lovers',
  'out-getting-ribs',
];
