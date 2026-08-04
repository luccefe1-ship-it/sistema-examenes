# Notas de traspaso

Documento para retomar el trabajo en una conversación nueva.
Última actualización: 5 de agosto de 2026.

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

| Endpoint | Qué hace |
|---|---|
| `api/procesar-preguntas.js` | Convierte un Word de academia en preguntas |
| `api/explicacion.js` | Explicación de una pregunta |
| `api/generar-preguntas-ia.js` | Inventa preguntas desde el tema digital |
| `api/asistente.js` | Chat de ayuda sobre la plataforma |
| `api/tts.js` | Texto a audio |
| `api/preguntas-rival.js` | Preguntas del rival en multijugador |

Módulos internos (Vercel ignora los que empiezan por `_`): `_claude.js`, `_auth.js`, `_consumo.js`.

---

## Decisiones importantes y por qué

**El prompt del sistema se arma siempre en el servidor.** Si el navegador pudiera
mandar texto libre, el endpoint sería una pasarela gratuita a Claude. La única
excepción es `generar-preguntas-ia`, que recibe fragmentos del temario; por eso
lleva topes de 60.000 caracteres y 10 preguntas por petición.

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

---

## Pendiente

**Caché de temas desactivada.** La consola avisa de `sessionStorage lleno
(demasiadas preguntas)`: con 9.813 preguntas no cabe, así que cada carga del banco
va entera a Firebase. Afecta a velocidad y a cuota de lectura. Sin empezar.

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

**Verificar el arreglo de repetidas.** El filtro y el reparto sin solapes están
puestos pero no probados en producción con un test real.

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
- Al borrar un tema se limpian sus preguntas de `preguntasFalladas` y
  `preguntasDominadas`; el ranking cruza contra las preguntas vivas.
