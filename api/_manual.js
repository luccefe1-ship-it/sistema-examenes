// ============================================================
//  /api/_manual.js
//
//  >>> ESTE ES EL SITIO DONDE SE DOCUMENTA LA PLATAFORMA. <<<
//
//  Si añades una función nueva a la web, descríbela aquí y el
//  asistente la sabrá explicar. No hay que tocar asistente.js.
//
//  Por qué un .js y no un .md: Vercel solo empaqueta en la función
//  los archivos que alguien hace `require`. Un .md suelto en el repo
//  puede no llegar al servidor y el asistente se quedaría mudo.
//  El nombre empieza por "_" para que Vercel no lo tome por endpoint.
//
//  Escríbelo en lenguaje normal, como si se lo contaras a alguien.
//  No hace falta ningún formato especial.
// ============================================================

const MANUAL = `PANTALLA DE INICIO
Cinco accesos: Hacer Test, Mis Temas, Mis Apuntes, Multijugador y Mis Audios. Abajo, Mi Progreso, para registrar el avance diario. Arriba a la derecha, Mi Perfil y Cerrar Sesión. En la portada se ve también el contador de consumo de IA.

MIS TEMAS (Banco de Preguntas)
- Se organizan en temas y subtemas. Cada tema guarda sus preguntas tipo test con cuatro opciones.
- "Subir Preguntas" convierte preguntas en el formato de la plataforma automáticamente con IA. Hay una sola caja: se arrastra el Word de la academia o se pega el texto directamente, en el formato que sea (un PDF copiado, apuntes, un correo). No hay que pasar por ninguna herramienta externa antes ni dejar el texto de una forma concreta. Detecta cuál es la respuesta correcta por la cita legal que la academia añade al final, por marcas como asteriscos o negritas, o por el solucionario si lo hay. Si en el original no viene señalada, la deduce y avisa en un panel amarillo para que la revises antes de asignarla. Esta función no consume saldo de IA: usa el cupo gratuito diario de Google. Si algún día se agota, avisa y se reinicia esa misma noche.
- Cada tema admite un "Tema Digital": el temario en Word o PDF. Sirve para dos cosas: consultarlo mientras estudias y generar tests con IA a partir de él.
- El botón "Ver tema digital subido" abre el documento maquetado a pantalla completa.
- Desde Acciones se crean subtemas, se importa, se exporta, se marca un tema como oficial o se vacía.
- El buscador de arriba busca por el principio del enunciado entre todas las preguntas del banco, estén o no desplegadas en pantalla.
- "Detectar Repetidas" busca preguntas duplicadas dentro del banco y permite borrar las que sobren.
- "Recargar banco" vuelve a leer las preguntas desde el servidor. La web guarda una copia local del banco para que cargue rápido y se actualiza sola cuando editas algo desde la propia web. Este botón hace falta solo si has creado o cambiado preguntas desde otro sitio, por ejemplo desde otro ordenador, y quieres verlas aquí sin esperar.
- Los temas se pueden reordenar arrastrándolos.

HACER TEST
- Origen de las preguntas: "Preguntas subidas" (tu banco) o "Preguntas IA" (inventadas al momento a partir del tema digital).
- Modos: Modelo oficial (todas juntas, como un examen real), Pregunta a Pregunta (con corrección instantánea) y Test Oral (por voz, manos libres).
- Se elige número de preguntas y duración.
- Filtros combinables: solo preguntas nuevas, solo falladas, solo oficiales.
- Con Preguntas IA solo está disponible Pregunta a Pregunta, hasta 50 preguntas, sin filtros, y el tema debe tener tema digital subido. Al terminar puedes guardar las preguntas generadas en una subcarpeta del tema.
- Se pueden elegir varios temas a la vez y la IA reparte las preguntas entre ellos.
- Las preguntas IA se comprueban contra las que ya tienes para no repetir ninguna, ni entre ellas ni con tu banco. Si de un tema no se pueden sacar más preguntas nuevas sin repetir, el test avisa antes de empezar y sale con menos preguntas de las pedidas.

DURANTE EL TEST
Cada pregunta tiene un panel de explicación con tres pestañas: Tema Digital (el temario, donde puedes buscar y subrayar), Explicación (generada con IA o escrita por ti) y Tarjeta (imágenes que adjuntes). Los subrayados se guardan y reaparecen la próxima vez.
En el buscador del temario, al buscar una palabra se resaltan todas sus apariciones y aparecen dos flechas con un contador tipo 3/12 para ir saltando de una a otra. La que estás mirando se pinta en naranja y las demás en verde. También sirve pulsar Intro para ir a la siguiente y Mayúsculas+Intro para la anterior.
Las preguntas llevan una etiqueta con las veces que las has fallado antes.

RESULTADOS
- Se guarda cada test con su nota. La penalización por fallo es de un cuarto de acierto, según la fórmula oficial del BOE.
- Compara tu nota con las notas de corte reales de la convocatoria.
- Las falladas van al Test de Repaso. Al acertarlas de nuevo salen de ahí.
- El Ranking de Fallos ordena las preguntas por veces falladas.

MI OPOSICIÓN
- Pantalla que reúne todo lo de la convocatoria. Se entra desde la portada, en "Mi Oposición". Tiene tres pestañas.
- Arriba del todo, los días que faltan para el examen y tres cifras: temas a revisar, preguntas a corregir y avisos sin leer. Las que están en rojo piden hacer algo.
- Cada usuario elige su cuerpo la primera vez que entra (Gestión o Tramitación) y se guarda en su perfil, así que Luciano ve sus datos y Sandra los suyos. Se cambia pulsando el nombre del cuerpo en la cabecera morada.
- Pestaña "Qué revisar": busca en los temas digitales subidos y en las preguntas del banco el vocabulario que la Ley Orgánica 1/2025 dejó atrás ("Juzgado de Primera Instancia", "Secretario Judicial"...) y enseña el párrafo exacto donde aparece y por qué se sustituye ahora. No corrige ni borra nada: solo señala, porque hay casos en que el término antiguo es correcto. Si un tema digital se subió sin texto extraíble, avisa de que hay que volver a subirlo.
- Pestaña "Mi convocatoria": cómo es el examen (ejercicios, preguntas, tiempo, puntos y nota mínima), plazas, titulación exigida, el calendario oficial con su referencia del BOE y los temas del programa que han cambiado o son nuevos respecto a la convocatoria anterior.
- Pestaña "Avisos del BOE": lo que se publica cada día y afecta al temario. Se filtran por tipo y se marcan como leídos, de uno en uno o todos de golpe.
- No consume saldo de IA: los datos son del portal de datos abiertos del BOE y el resumen usa el cupo gratuito de Google.

OTRAS SECCIONES
- Mis Apuntes: apuntes propios organizados por temas.
- Multijugador: partidas contra otro estudiante, cada uno responde preguntas del banco del rival.
- Mis Audios: sube un Word y lo convierte en audio para escucharlo.
- Mi Progreso: registro diario de páginas y tests, con objetivos semanales.
- Mi Perfil: avatar, cambio de contraseña y consumo de IA acumulado.`;

module.exports = { MANUAL };
