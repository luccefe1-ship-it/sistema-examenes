# Notas de traspaso

Documento para retomar el trabajo en una conversación nueva.
Última actualización: 5 de agosto de 2026 (caché del banco).

---

## Qué es esto

Plataforma web para preparar oposiciones de Justicia (Tramitación y Gestión Procesal).
Sitio estático + funciones serverless en Vercel, con Firebase (Auth, Firestore, Storage).

- Repo: `luccefe1-ship-it/sistema-examenes`
- Producción: https://sistema-examenes-rho.vercel.app
- Proyecto Firebase: `plataforma-examenes-f2df9`
- Hay una app Flutter aparte (`luccefe1-ship-it/app-movil-sistema-examenes`) que **no se toca**: Luciano trabaja solo la web.

Usuarios reales ahora mismo: Luciano y Sandra. Dos cuentas más están muertas desde septiembre de 2025.

---

## Variables de entorno en Vercel

| Variable | Para qué |
|---|---|
| `ANTHROPIC_API_KEY` | Clave principal de Claude |
| `ANTHROPIC_API_KEY_2` | Se usa cuando se agota la primera |
| `FIREBASE_SERVICE_ACCOUNT` | JSON de cuenta de servicio, para escribir desde el servidor |
| `GOOGLE_TTS_API_KEY` | Text-to-Speech de Google |

---

## Endpoints

Todos exigen sesión: verifican el ID token de Firebase (`api/_auth.js`) y llevan un
freno de 120 llamadas/hora por usuario.

| Endpoint | Qué hace | Modelo |
|---|---|---|
| `api/procesar-preguntas.js` | Convierte cualquier texto con preguntas al formato de la plataforma | **Gemini Flash (gratis)** |
| `api/explicacion.js` | Explicación de una pregunta | Claude |
| `api/generar-preguntas-ia.js` | Inventa preguntas desde el tema digital | Claude |
| `api/asistente.js` | Chat de ayuda sobre la plataforma | Claude |
| `api/tts.js` | Texto a audio | Claude |
| `api/preguntas-rival.js` | Preguntas del rival en multijugador | Claude |

Módulos internos (Vercel ignora los que empiezan por `_`): `_gemini.js`, `_claude.js`,
`_auth.js`, `_consumo.js`, `_manual.js`, `_interfaz.js`.

Subir preguntas usa el cupo gratuito de Google y **no gasta saldo de Anthropic**. Requiere la
variable `GEMINI_API_KEY`. Ver `api/LEEME.md`.

---

## Decisiones importantes y por qué

**El prompt del sistema se arma siempre en el servidor.** Si el navegador pudiera
mandar texto libre, el endpoint sería una pasarela gratuita a Claude. Dos
excepciones acotadas: `generar-preguntas-ia`, que recibe fragmentos del temario
y lleva topes de 60.000 caracteres y 10 preguntas por petición; y `asistente`,
que recibe el inventario de la pantalla saneado por `_interfaz.js` (solo
etiquetas cortas, ver la sección del asistente).

**El avatar del rival viaja dentro del documento de la sala.** Las reglas de
Firestore impiden leer el perfil de otro usuario, así que no hay forma de mirar su
avatar en su ficha.

**El consumo lo escribe el servidor, nunca el cliente.** Un libro de cuentas que
pueda editar el interesado no sirve de nada. Colecciones `consumoApi` (una entrada
por llamada) y `consumoResumen` (acumulado por usuario), ambas de solo lectura
desde el navegador.

**Los subrayados se guardan como fragmentos de texto, no como HTML.** Antes se
volcaba el `innerHTML` entero del panel, un documento por pregunta. Con el
documento maquetado eso reventaría el límite de 1 MiB de Firestore.

**El avatar se cachea en `localStorage`.** Sin eso parpadeaba medio segundo en cada
navegación mientras respondía Firestore.

**No se guarda el HTML del tema digital en Firestore.** El Tema 1 genera 196 KB de
HTML; se renderiza al vuelo desde Storage con `docx-preview`.

---

## Costes de IA

Precios comprobados en agosto de 2026 (tabla en `api/_consumo.js`, **revisar si
Anthropic los cambia**): Opus 5 a 5/25 $ por millón, Sonnet 5 a 3/15 $, Haiku 4.5 a 1/5 $.

Medido con datos reales: un test IA de 15 preguntas ≈ **0,25 $**; uno de 50 ≈ **0,80 $**.
Cada pregunta al asistente ≈ 0,02 $.

Los modelos están en una constante al principio de cada endpoint. Bajar a
`claude-sonnet-5` divide el coste por cinco.

---

## Caché del banco de preguntas (`js/cache-temas.js`)

Vive en **IndexedDB**, no en `sessionStorage`: el banco serializado pasa de largo
el límite de ~5 MB y el `setItem` fallaba siempre, así que la caché estaba muerta.
Persiste entre sesiones del navegador y caduca a las **12 horas**.

**La regla que no se puede romper: toda escritura llama a `invalidarCacheTemas()`.**
Antes había ~15 copias del mismo bloque de invalidación, y un flag `cacheSucio`
que solo limpiaba `sessionStorage` sin tocar la copia en memoria. Por eso una
pregunta borrada seguía apareciendo en el buscador y en Test Aleatorio hasta que
caducaba. Ahora hay un único punto de invalidación; si añades una escritura
nueva, llámalo.

Detalles que parecen manías pero no lo son:

- La invalidación marca en memoria de forma **síncrona**. El borrado en
  IndexedDB es asíncrono y nadie lo espera, así que sin esa marca una recarga
  lanzada justo después podría adelantarse al borrado y servir lo viejo.
- Hay un **contador de época**: si invalidas mientras una lectura está en vuelo,
  esa respuesta se pinta pero no se persiste, porque ya nació obsoleta.
- Al leer se valida `usuarioId`, versión de esquema y antigüedad. IndexedDB es
  del origen, no de la pestaña: sin eso dos cuentas en el mismo navegador se
  verían el banco la una a la otra.
- Las fechas se convierten al guardar y se reconstruyen al leer, porque los
  `Timestamp` de Firestore pierden `.toDate()` al pasar por el clonado.
- Nada lanza nunca. Sin IndexedDB (incógnito, cuota llena) todo sigue leyendo de
  Firebase.

**Lo que NO usa la caché, a propósito:** las preguntas que se responden de
verdad. `tests-pregunta.js`, `tests-oral.js`, `Multijugador.js` y
`ranking-fallos.js` leen siempre de Firestore, así que un test nunca puede
servir una pregunta ya borrada. La caché solo alimenta listados y contadores.

Como la invalidación automática solo ve lo que se edita **en la web**, hay un
botón **"🔄 Recargar banco"** en el Banco de Preguntas para cuando se haya
tocado algo desde la app móvil u otro ordenador.

Pruebas: `npm test` (necesita `npm install` una vez). Cubre borrado, carreras de
invalidación, aislamiento entre usuarios, caducidad, caché corrupta y ausencia
de IndexedDB. No toca Firebase ni datos reales.

---

## Filtro de preguntas repetidas de la IA

`js/preguntas-repetidas.js` compara por CONTENIDO, no por texto: dos enunciados
distintos con la misma respuesta correcta preguntan lo mismo.

Al generar un test IA (`empezarTestIA` en `tests.js`) el filtro se siembra con:

- **Veto por texto exacto** contra *todas* las preguntas del banco. Es un Set,
  así que mirar ahí es inmediato aunque haya 10.000.
- **Huellas** de las preguntas ya existentes de los temas elegidos, para la
  comparación a fondo (pilla reformulaciones, no solo copias literales).
- **Una sola lista de huellas compartida entre temas**, para que en un mix el
  tema A y el tema B no cuelen la misma pregunta cada uno por su lado.

Además se le manda a Claude una muestra aleatoria de 15 enunciados que ya
existen en ese tema más los 10 últimos generados (el servidor recorta a 25).
Avisar cuesta unos cientos de tokens; generar preguntas que luego se tiran
cuesta más.

Pruebas en `pruebas/repetidas.prueba.mjs`, incluida una que comprueba que el
comportamiento antiguo sí dejaba colar el duplicado.

**Rondas de relleno.** Si al descartar repetidas faltan preguntas, se insiste
hasta `IA_MAX_RONDAS_RELLENO` (3) veces, pidiendo 2 de más por lote para
absorber las que se caigan. Dos frenos para no encadenar llamadas:

- el tope de rondas
- un tema del que una ronda no saca NADA nuevo se marca agotado y deja de
  pedírsele; si se agotan todos, se corta

Peor caso con 3 temas: 9 llamadas extra. Si aun así falta, se avisa con un
`alert` breve antes de empezar y el test arranca con las que haya. Si sobran
(por pedir de más) se recorta al número pedido, pero el sobrante se guarda
igualmente en el banco al terminar: ya está pagado.

---

## Asistente: dónde se documenta la plataforma

**Si añades una función a la web, descríbela en `api/_manual.js`.** Es el único
sitio. `api/asistente.js` ya no lleva el texto dentro; lo monta a partir de ahí.

Es un `.js` y no un `.md` porque Vercel solo empaqueta en la función los
archivos que alguien hace `require`: un `.md` suelto podría no llegar al
servidor y el asistente se quedaría sin manual.

**Además el asistente ve lo que hay en pantalla.** El widget recoge las
etiquetas visibles de botones, pestañas y encabezados de la página y las manda
con la pregunta. Así reconoce un botón nuevo aunque nadie lo haya documentado
todavía; antes negaba que existiera (pasó con "Recargar banco").

Esto es la única parte del prompt que viene del navegador, así que está muy
acotada en `api/_interfaz.js`: solo etiquetas, 60 como mucho, 60 caracteres
cada una, 1.500 en total, sin saltos de línea ni `<` ni `>`, y en un bloque
marcado como datos no fiables. En ese hueco no caben instrucciones útiles para
secuestrar el modelo. Hay pruebas de intento de fuga en
`pruebas/interfaz.prueba.mjs`.

Cuesta unos 150 tokens de entrada por mensaje, del orden de 0,001 $.

---

## Buscador del documento

`js/busqueda-navegacion.js` lleva las flechas ▲▼ y el contador (3/12) del
buscador del panel de explicación. Intro busca y luego salta a la siguiente,
Mayús+Intro a la anterior. La coincidencia activa se pinta en naranja.

Está separado de `documento-subrayable.js` porque aquel arrastra Firebase por su
cadena de imports y esto es lógica pura sobre el DOM que se puede probar sin
navegador. `documento-subrayable.js` lo reexporta, así que quien ya importaba de
allí no cambia nada.

El Intro se engancha **una vez por delegación** en `document`, no al montar cada
panel: los buscadores se pintan desde tres sitios y dos comparten los mismos
ids, así que hacerlo en cada montaje duplicaba listeners o se olvidaba en alguno.

---

## Lo que se hizo en la última sesión

- Visor de temas digitales a pantalla completa (Word maquetado con `docx-preview`, PDF en iframe)
- Panel de explicación con el documento maquetado, subrayados y búsqueda sobre el DOM
- Modo **Preguntas IA**: genera tests desde el tema digital, solo temas padre, hasta 50 preguntas
- Protección de todos los endpoints con verificación de token
- Contador de consumo por usuario, visible en Mi Perfil y en la portada
- Reglas de Firestore cerradas (ver `firestore.rules`, hay que pegarlas a mano en la consola)
- Se sacaron de Firestore la clave de Google TTS y unas claves de Anthropic que llevaban ahí desde una migración anterior
- Recuperación de contraseña por correo, con página propia en `accion.html`
- Avatares SVG propios (`js/avatar.js`), usados como asistente y en el multijugador
- Asistente flotante en todas las páginas; el texto "¿Te ayudo?" solo en la portada
- Multijugador: avatares, cartel de turno, procedencia de la pregunta, repaso de falladas
- Detector de preguntas repetidas de la IA (`js/preguntas-repetidas.js`)
- Caché del banco reescrita sobre IndexedDB (ver sección propia más arriba)
- `.gitignore` creado: el repo no tenía y `node_modules` se iba a colar

---

## Pendiente

**URL de acción de Firebase.** Falla al guardar en la consola de Firebase con
"Se produjo un error mientras se actualizaba la URL de acción", incluso con el
dominio ya autorizado. La página `accion.html` existe y funciona; solo falta que
Firebase apunte a ella. Mientras tanto se usa la pantalla de Google, ya en español.

**PDF con texto vacío.** `tests.html` configuraba `pdfjsLib` sin cargar la
librería, así que los PDF subidos antes de ese arreglo tienen `textoExtraido`
vacío y no dan contexto a las explicaciones. Habría que reprocesarlos o resubirlos.

**Sistema de pagos.** Solo analizado, nada implementado. Ojo con esto:
- No existen cuentas de Claude por usuario; el saldo sería un número en tu base de datos
- Los términos comerciales de Anthropic **prohíben revender acceso a la API**. Hay que
  venderlo como créditos de plataforma, no como euros de API
- Siguiente paso acordado: medir el consumo real unas semanas antes de poner precio

**Verificar el filtro de repetidas en producción.** Se encontró y arregló el
fallo real: el filtro solo comparaba contra lo generado en la misma tanda y del
mismo tema, así que la IA podía devolver una pregunta que ya estaba en el banco
(salía con su badge de "Fallada") o la misma pregunta por dos temas del mix.
Ahora compara contra el banco (texto exacto en todo el banco, comparación a
fondo en los temas elegidos) y comparte una sola lista de huellas entre temas.
Además se le manda a Claude una muestra de lo que ya existe para que no lo
genere. Probado con `npm test`, falta verlo en un test real.

---

## Cosas que conviene saber antes de tocar

- `node --check` solo valida sintaxis. Una variable inexistente pasa el check y
  revienta en producción: ya ocurrió con `cuerpo is not defined` en
  `generar-preguntas-ia.js`. **Hay que probar los endpoints ejecutándolos** con las
  dependencias simuladas.
- El repo usa CRLF. `git status` marca muchos archivos como modificados sin serlo;
  comprobar con `git diff --ignore-all-space`.
- `firestore.rules` está en el repo pero Firebase **no lo lee de ahí**: hay que
  pegarlo en la consola y publicar.
- Las páginas cargan `js/asistente-widget.js`, que se inyecta solo. No hay que
  escribir el HTML del asistente en cada página.
- La penalización por fallo es **un cuarto** de acierto, no un tercio. Fórmula del BOE.
- Si escribes en `temas`, llama a `invalidarCacheTemas()`. Siempre.
- Las 9.813 preguntas **no son 9.813 documentos**: van dentro del array
  `preguntas` de cada documento de `temas`. Firestore cobra por documento, así
  que una carga completa son tantas lecturas como temas haya (decenas). Lo que
  se gana con la caché es velocidad y ancho de banda, no cuota.
- Al borrar un tema se limpian sus preguntas de `preguntasFalladas` y
  `preguntasDominadas`; el ranking cruza contra las preguntas vivas.
