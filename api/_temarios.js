// ============================================================
//  /api/_temarios.js
//  EL TEMARIO OFICIAL de los tres cuerpos, tal y como lo publica el
//  anexo VI de la Orden PJC/1549/2025 (BOE-A-2025-27053, BOE de 30
//  de diciembre de 2025).
//
//  >>> AQUÍ NO ENTRA NADA DE LO QUE EL USUARIO SUBA A LA PLATAFORMA.
//  Los temas de "Mis Temas" son material de estudio propio y sirven
//  para hacer tests; el aviso de reformas se da SIEMPRE contra el
//  programa oficial, que es lo que entra en el examen. Mezclar las
//  dos cosas fue un error: un aviso tiene que poder leerse como
//  "han tocado el tema 23 del programa", no como "han tocado un PDF
//  que subiste en marzo".
//
//  Los títulos están copiados literalmente del BOE. Si se cambia la
//  convocatoria hay que regenerarlos del anexo nuevo.
//
//  Los archivos que empiezan por "_" no son endpoints.
// ============================================================

const GESTION = [
    { numero: 1, titulo: 'La Constitución española de 1978: Estructura y contenido. Las atribuciones de la Corona. Las Cortes Generales: Composición, atribuciones y funcionamiento. La elaboración de las leyes. El Tribunal Constitucional. Composición y funciones.' },
    { numero: 2, titulo: 'Derecho de igualdad y no discriminación por razón de género: especial referencia a la Ley Orgánica 3/2007, para la Igualdad Efectiva de Mujeres y Hombres. La Ley Orgánica 1/2004, de Medidas de Protección Integral contra la Violencia de Género. Antecedentes. Objeto y principios rectores. Medidas de sensibilización, prevención y detección. Derechos de las mujeres víctimas de la violencia de género. Tutela institucional. La Ley 15/2022, de 12 de julio, integral para la igualdad de trato y la no discriminación. La Ley 4/2023, de 28 de febrero, para la igualdad real y efectiva de las personas trans y para la garantía de los derechos de las personas LGTBI.' },
    { numero: 3, titulo: 'El Gobierno y la Administración. El Presidente del Gobierno. El Consejo de Ministros. Organización administrativa española: Ministros, Secretarios de Estado, Subsecretarios y Directores Generales. La Administración periférica del Estado. Los Delegados de Gobierno en la Comunidad Autónoma y los Subdelegados de Gobierno. La Secretaría de Estado de Justicia: Principales competencias.' },
    { numero: 4, titulo: 'Organización territorial del Estado en la Constitución. El Estado de las Autonomías. Las Comunidades Autónomas: Su constitución y competencias. Los Estatutos de Autonomía. La Administración Local. La provincia y el municipio.' },
    { numero: 5, titulo: 'La Unión Europea. Competencias de la UE. Instituciones y órganos de la Unión Europea: El Parlamento Europeo, el Consejo Europeo, el Consejo de la Unión Europea, la Comisión Europea, el Tribunal de Justicia de la Unión Europea, el Tribunal de Cuentas.' },
    { numero: 6, titulo: 'El Poder Judicial. El Consejo General del Poder Judicial: composición y funciones. La jurisdicción: Jueces y Magistrados: Funciones y competencias. La independencia judicial. El Ministerio Fiscal: Organización y funciones. Sistemas de acceso a las carreras judicial y fiscal.' },
    { numero: 7, titulo: 'Examen de la organización y competencia del Tribunal Supremo, de la Audiencia Nacional, de los Tribunales Superiores y de las Audiencias Provinciales.' },
    { numero: 8, titulo: 'De los Tribunales de Instancia y del Tribunal Central de Instancia. Examen de la organización y competencia de los Tribunales de Instancia: Sección Única, Secciones Civil, De Instrucción, De Familia, Infancia y Capacidad, De lo Mercantil, De Violencia sobre la Mujer, De Violencia contra la Infancia y la Adolescencia, De lo Penal, De Menores, De Vigilancia Penitenciaria, De lo Contencioso-Administrativo y De lo Social. La Sección de lo Mercantil del Tribunal de Instancia de Alicante: Tribunal de Marca de la Unión Europea.' },
    { numero: 9, titulo: 'La Justicia de Paz. El Juez o Jueza de Paz, la Oficina de Justicia en el Municipio y las Agrupaciones de Oficinas de Justicia: Organización y competencias, elección del Juez o Jueza de Paz, la Secretaría de las Oficinas de Justicia. La justicia de paz en el ámbito de la cooperación jurisdiccional y en los procesos civiles y penales. Sistema de recursos contra las resoluciones dictadas por los Jueces o Juezas de Paz.' },
    { numero: 10, titulo: 'La carta de Derechos de los Ciudadanos ante la Justicia. Derechos de información, de atención y gestión, de identificación de actuaciones y funcionarios, derechos lingüísticos. Derechos frente a los profesionales que asisten y representan al ciudadano: Abogados, Procuradores, Graduados Sociales. El Derecho a la Justicia Gratuita en la Carta de Derechos. El plan de Transparencia Judicial.' },
    { numero: 11, titulo: 'La modernización de la oficina judicial. Nuevo modelo de organización judicial: La eficiencia organizativa del Servicio Público de Justicia para la implantación de los Tribunales de Instancia y las Oficinas de Justicia en los municipios: su regulación en la Ley Orgánica del Poder Judicial. La administración de justicia y las nuevas tecnologías. Código de Conducta para usuarios de equipos y sistemas informáticos al servicio de la Administración de Justicia. El expediente digital y la presentación telemática de escritos y documentos. La firma digital, el correo electrónico. Incidencia de la legislación de protección de datos en el uso de las aplicaciones informáticas.' },
    { numero: 12, titulo: 'El Letrado de la Administración de Justicia en la Ley Orgánica del Poder Judicial: funciones y competencias. Ordenación del cuerpo superior jurídico de Letrados de la Administración de Justicia: Secretario de Gobierno y Secretarios Coordinadores.' },
    { numero: 13, titulo: 'Cuerpos de Funcionarios al servicio de la Administración de Justicia. Cuerpos Generales y Cuerpos Especiales: Definición y Cuerpos que los integran. Cuerpos Especiales: El Cuerpo de Médicos Forenses: Funciones.' },
    { numero: 14, titulo: 'Los Cuerpos Generales (I): Funciones. Formas de acceso. Promoción interna. Adquisición y pérdida de la condición de funcionarios. La rehabilitación. Derechos, deberes e incompatibilidades. Jornada y horarios. Vacaciones, permisos, días y licencias.' },
    { numero: 15, titulo: 'Los Cuerpos Generales (II): Situaciones administrativas. Ordenación de la actividad profesional. Provisión de puestos de trabajo. Régimen disciplinario.' },
    { numero: 16, titulo: 'Libertad sindical: El Sindicato en la Constitución Española. Elecciones sindicales según la Ley de órganos de representación y el Estatuto Básico del Empleado Público. El derecho de huelga. Salud y prevención de riesgos laborales.' },
    { numero: 17, titulo: 'Cuestiones generales sobre el proceso civil: Las partes en el proceso civil: Capacidad procesal y capacidad para ser parte. Pluralidad de partes. Litisconsorcio activo y pasivo, su tratamiento procesal.' },
    { numero: 18, titulo: 'La representación y sus clases. Legitimación en el proceso civil. Asistencia letrada y representación procesal, estatuto jurídico, derechos y deberes. Intervención no preceptiva de estos profesionales. La intervención en los procesos civiles del Ministerio Fiscal y del Abogado del Estado.' },
    { numero: 19, titulo: 'Jurisdicción y competencia. Acumulación de acciones y de procedimientos, concepto. La tramitación de las cuestiones de jurisdicción y competencia. La competencia de los Tribunales Civiles: Objetiva, funcional y territorial, los fueros legales disponibles e indisponibles. Concepto y tramitación.' },
    { numero: 20, titulo: 'Los actos procesales. Requisitos de los actos procesales: a) lugar; b) tiempo: Términos y plazos: Cómputo de los plazos; c) forma (consideración de la lengua oficial). Defectos de los actos: Nulidad, anulabilidad, irregularidad; subsanación de defectos.' },
    { numero: 21, titulo: 'Las resoluciones de los órganos judiciales. Clases de resoluciones judiciales: Contenido y características. Las resoluciones de los órganos judiciales colegiados. Las resoluciones del Letrado de la Administración de Justicia.' },
    { numero: 22, titulo: 'Los actos de comunicación con otros Tribunales y Autoridades: Oficios y mandamientos. El auxilio judicial: los exhortos y los mandamientos en el proceso penal. Cooperación jurídica internacional: las comisiones rogatorias.' },
    { numero: 23, titulo: 'Actos de comunicación a las partes y otros intervinientes en el proceso: Notificaciones, requerimientos, citaciones y emplazamientos. Notificaciones, citaciones y mandamientos en el proceso penal. Formas de notificación y nuevas tecnologías.' },
    { numero: 24, titulo: 'Conceptos de archivo judicial y de documentación judicial en relación con la legislación vigente en materia de archivos judiciales. Formas de remisión de documentación judicial y relaciones documentales. Nuevas tecnologías en los archivos judiciales de gestión. Las juntas de expurgo de la documentación judicial.' },
    { numero: 25, titulo: 'Los procedimientos declarativos en la Ley de Enjuiciamiento Civil 1/2000: Diligencias preparatorias, diligencias preliminares. Averiguación de hechos, aseguramiento y práctica anticipada de la prueba. Medios adecuados de solución de controversias en vía no jurisdiccional.' },
    { numero: 26, titulo: 'Juicio ordinario. Procesos que se sustancian por los trámites del juicio declarativo ordinario. La demanda y su objeto, documentos que deben acompañarla. La contestación a la demanda y otras actitudes del demandado: la rebeldía. Problemas derivados de la ampliación de la demanda y la reconvención. Audiencia previa. Vista de juicio. Diligencias finales. Terminación del procedimiento por medio de sentencia, auto o decreto, aspectos formales de estas resoluciones. Allanamiento, desistimiento, transacción, satisfacción extraprocesal.' },
    { numero: 27, titulo: 'El juicio verbal. Procesos que se sustancian por el trámite del juicio verbal. Clases de demandas. Admisión y traslado de la demanda y citación para la vista. Inasistencia de las partes a la vista. Desarrollo de la vista. Recursos frente a las resoluciones interlocutorias. Juicios verbales de carácter plenario y sumario. El verbal de desahucio. El precario. El juicio sobre tutela posesoria. La tutela de derechos reales inscritos. El juicio de alimentos. La rectificación de hechos. El juicio verbal en materias de compraventas a plazos y arrendamientos financieros.' },
    { numero: 28, titulo: 'Procesos especiales: Procedimientos para la división judicial de patrimonios: A) De la división de la herencia. B) Procedimiento para la liquidación del régimen económico matrimonial.' },
    { numero: 29, titulo: 'Procesos especiales: El proceso monitorio. Concepto y características. Casos en que procede. Competencia. Procedimiento: petición inicial y documentos. Admisión. Requerimiento de pago y posibles conductas del demandado. La transformación del procedimiento. La cosa juzgada. El proceso monitorio europeo. El juicio cambiario. Concepto y características. Naturaleza. Casos en que procede. Competencia. Procedimiento. La sentencia sobre la oposición y su eficacia.' },
    { numero: 30, titulo: 'Los procesos matrimoniales y sus clases. Competencia. Procedimientos: a) nulidad, separación y divorcio contenciosos; b) separación o divorcio de mutuo acuerdo. Referencia a las crisis de las uniones estables de pareja. Medidas Provisionales. Medidas definitivas. Ejecución forzosa de los pronunciamientos sobre medidas. Los procesos especiales: Características comunes. Los procesos sobre la adopción de medidas judiciales de apoyo a personas con discapacidad: competencia y legitimación; pruebas preceptivas en primera y en segunda instancia; la sentencia; la revisión de las medidas de apoyo judicialmente adoptadas.' },
    { numero: 31, titulo: 'Procedimientos de jurisdicción voluntaria: la Ley 15/2015, de 2 de julio, de la Jurisdicción Voluntaria. Disposiciones generales y normas comunes en materia de tramitación de los expedientes de jurisdicción voluntaria. Expedientes de jurisdicción voluntaria en materia de personas. Expedientes en materia de familia. Expedientes relativos al Derecho sucesorio. Expedientes relativos al Derecho de obligaciones. Expedientes relativos a los derechos reales. Expedientes de subastas voluntarias. Expedientes en materia mercantil. La conciliación.' },
    { numero: 32, titulo: 'Los recursos. Concepto. Clases de recursos. Efectos de los recursos y de su desistimiento. El depósito para recurrir. Los recursos de reposición y de revisión. El recurso de queja. El recurso de apelación. Apelación y segunda instancia; el derecho a la segunda instancia. Resoluciones contra las que procede apelación. Sustanciación del recurso. Oposición a la apelación e impugnación de la sentencia. La prueba en la apelación.' },
    { numero: 33, titulo: 'El recurso de casación. Características. Resoluciones recurribles. Motivos de recurso. Objeto y efectos del recurso. Competencia. Procedimiento. Medios de rescisión de las sentencias firmes. La audiencia al demandado rebelde. La revisión de las sentencias firmes.' },
    { numero: 34, titulo: 'La ejecución forzosa. El papel del Letrado de la Administración de Justicia en la ejecución. El título ejecutivo y sus clases: Judiciales y no judiciales; españoles y extranjeros. Ejecución de resoluciones extranjeras. Breve referencia al Título Ejecutivo Europeo. La demanda ejecutiva. Tribunal competente. Orden general de ejecución y despacho de la ejecución. Acumulación de ejecuciones. Oposición a la ejecución. Suspensión de la ejecución. Ejecución provisional. Concepto y naturaleza. Presupuestos. Despacho de la ejecución. Oposición a la ejecución provisional. Revocación o confirmación de la sentencia provisionalmente ejecutada.' },
    { numero: 35, titulo: 'Ejecución dineraria. Supuestos en que procede. Integración del título. Requerimiento de pago. Embargo de bienes. Reembargo. Tercería de dominio.' },
    { numero: 36, titulo: 'El procedimiento de apremio. Valoración de los bienes embargados. La subasta de los bienes trabados. Alternativas a la subasta judicial: El convenio de realización y la realización por persona o entidad especializada. La administración para pago. Tercería de mejor derecho. Especialidades de la ejecución sobre bienes hipotecados, pignorados o con garantía real.' },
    { numero: 37, titulo: 'Ejecuciones no dinerarias. Ejecuciones de dar, de hacer y de no hacer. Determinación de frutos y rentas. Liquidación de daños y perjuicios. Ejecución de sentencias que llevan aparejada la entrega de la posesión de un inmueble, especial referencia a las sentencias de ejecución de desahucios.' },
    { numero: 38, titulo: 'Las medidas cautelares: Concepto. Tipos de medidas cautelares. Tramitación con audiencia y sin audiencia al demandado. Oposición a las medidas cautelares. Ejecución de las medidas cautelares. Caución y caución sustitutoria.' },
    { numero: 39, titulo: 'Costas y gastos procesales. La condena en costas. La tasación de costas. La impugnación de las costas. Los intereses y su liquidación. La tasa judicial. Pagos, depósitos y consignaciones judiciales. Ingresos en el Tesoro Público. La Asistencia Jurídica Gratuita.' },
    { numero: 40, titulo: 'El Registro Civil: legislación vigente. Naturaleza, contenido y competencias. Derechos y deberes ante el Registro Civil y principios de funcionamiento. Estructura del Registro Civil. Las Oficinas del Registro Civil: Oficina Central, Oficinas Generales y Oficinas Consulares y sus funciones.' },
    { numero: 41, titulo: 'Los asientos registrales y sus clases: reglas generales para su práctica, inscripciones, anotaciones registrales y cancelaciones. Hechos y actos inscribibles en el Registro Civil: Inscripción de nacimiento y filiación; inscripciones relativas al matrimonio; inscripción del fallecimiento. Otras inscripciones.' },
    { numero: 42, titulo: 'Publicidad del Registro Civil: medios de publicidad. Las certificaciones y sus clases. Datos con publicidad restringida y acceso a asientos con datos especialmente protegidos. Régimen de recursos frente a decisiones adoptadas en materia de registro civil. Los procedimientos registrales: reglas generales para su tramitación y legitimación para promoverlos. Rectificación de los asientos del Registro Civil: rectificación judicial y rectificación por procedimiento registral. Las declaraciones con valor de simple presunción. Normas sobre derecho internacional privado.' },
    { numero: 43, titulo: 'El sistema procesal penal de la Ley de Enjuiciamiento Criminal: Principio del juez imparcial, separación de instrucción y enjuiciamiento. Principios del proceso penal. Competencia objetiva y funcional. Justicia restaurativa. Aforamientos y privilegios procesales. Inmunidad de jurisdicción. La competencia territorial. La inhibición de oficio y a instancia de parte; cuestiones de competencia territorial.' },
    { numero: 44, titulo: 'Las partes en el proceso penal: Ministerio Fiscal; acusador particular; perjudicado y acción popular; acusador privado. El ejercicio de la acción penal: de oficio o a instancia de parte. Denuncia; querella; atestado. Extinción de la acción penal: especial referencia a la renuncia. El ejercicio de la acción civil: el actor civil. El ofrecimiento de acciones. Extinción de la acción civil. El investigado o encausado. La rebeldía. El responsable civil. Representación y defensa de las partes. Defensa de oficio y beneficio de justicia gratuita.' },
    { numero: 45, titulo: 'El Sumario: Incoación del proceso. Las actuaciones de la Policía Judicial. Comprobación del delito: Cuerpo del delito. Identificación del presunto delincuente. La inspección ocular. Declaraciones testificales. Prueba pericial y su valor. Prueba documental. Piezas de convicción.' },
    { numero: 46, titulo: 'Las medidas cautelares personales en el proceso penal. La citación judicial. La detención. La prisión provisional. La libertad provisional. Las fianzas en el proceso penal. Medidas limitadoras de derechos fundamentales: Pruebas biológicas; entrada y registro en lugar cerrado; intervención de comunicaciones postales, telegráficas, telefónicas e informáticas. Especial mención a las entregas controladas y a la figura del agente encubierto.' },
    { numero: 47, titulo: 'El denominado período intermedio; auto de conclusión del sumario; eventual revocación del auto y nuevas diligencias y resoluciones. El sobreseimiento y sus clases. El auto de apertura del juicio oral. Los artículos de previo pronunciamiento. Las calificaciones provisionales de las partes. Conformidad del acusado.' },
    { numero: 48, titulo: 'La prueba en el proceso penal. Medios de prueba. Proposición, admisión o denegación; prueba anticipada; proposición en el acto del juicio; prueba acordada «ex officio». El juicio oral. La suspensión del juicio oral: causas y consecuencias.' },
    { numero: 49, titulo: 'El procedimiento abreviado: Información de derechos, prueba anticipada. Conclusión de la fase instructora, la conformidad por reconocimiento de hechos. La fase de juicio oral: Admisión de pruebas, señalamiento del juicio e información a la víctima. Celebración del juicio oral, especialidades. La sentencia; especialidades: a) sentencia oral; b) conformidad de las partes sobre la firmeza inicial de la sentencia; c) principio acusatorio, d) notificación. Los recursos contra las resoluciones procesales en el ámbito del procedimiento abreviado: a) Los recursos contra las resoluciones judiciales b) Los recursos contra las resoluciones del Letrado de la Administración de Justicia. Ejecución de sentencias.' },
    { numero: 50, titulo: 'Procedimiento para el enjuiciamiento rápido de determinados delitos: Ámbito de aplicación. Actuaciones de la Policía Judicial. Diligencias urgentes ante el servicio de guardia; instrucción y conclusión. Preparación y desarrollo del juicio oral. Sentencia.' },
    { numero: 51, titulo: 'El proceso ante el Tribunal del Jurado. Competencia. Composición y constitución del Jurado: Estatuto jurídico de los jurados; su selección. La fase de instrucción y la fase intermedia. La fase de juicio oral: trámites precedentes: Designación del Magistrado-Ponente; cuestiones previas; auto de hechos justiciables; celebración del juicio oral: La vista; suspensión del juicio oral. Posible disolución del Jurado: sus causas. El veredicto: Determinación del objeto del veredicto, deliberación y veredicto; instrucción a los jurados; deliberación y votación; acta. Sentencia.' },
    { numero: 52, titulo: 'La tutela judicial ante los Tribunales de Instancia –Secciones de violencia sobre la mujer–. Especialidades procesales. Pérdida de la competencia cuando se produzcan actos de violencia sobre la mujer. Medidas judiciales de protección y de seguridad de las víctimas. La tutela judicial ante los Tribunales de Instancia –Secciones de Violencia contra la Infancia y la Adolescencia–.' },
    { numero: 53, titulo: 'El procedimiento de Responsabilidad Penal del Menor. Principios reguladores. Las fases del procedimiento. Sentencia y régimen de recursos. Principios generales en la ejecución de las medidas.' },
    { numero: 54, titulo: 'Tramitación del juicio sobre delitos leves. Convocatoria de la vista de juicio sobre delitos leves. Sistema de recursos a las sentencias dictadas en juicios sobre delitos leves. La ejecución de la sentencia de delitos leves: Aspectos penales y civiles.' },
    { numero: 55, titulo: 'Régimen general de recursos en el proceso penal. Los recursos no devolutivos: Reforma y súplica. Recursos devolutivos: La apelación en el proceso ordinario y en el procedimiento abreviado; El recurso de queja contra la inadmisión de otro recurso y como sustitutivo de la apelación. El recurso de casación penal. La revisión penal. El recurso de rescisión de la sentencia dictada contra reos ausentes. Los recursos contra las resoluciones del Letrado de la Administración de Justicia.' },
    { numero: 56, titulo: 'La ejecución de sentencias penales. Los Tribunales sentenciadores; el Tribunal de Instancia –Sección de Vigilancia Penitenciaria– y Administración Penitenciaria: Sus respectivas funciones. Recursos contra las resoluciones de la Administración Penitenciaria y de los Tribunales de Instancia –Sección de Vigilancia Penitenciaria–. Tasación de costas. La ejecución civil en el proceso penal.' },
    { numero: 57, titulo: 'Breve referencia del recurso contencioso-administrativo. Organización de la jurisdicción contenciosa-administrativa.' },
    { numero: 58, titulo: 'Recurso contencioso-administrativo: Capacidad procesal, legitimación, representación y defensa. Actos impugnables.' },
    { numero: 59, titulo: 'Recurso contencioso-administrativo: Diligencias preliminares. Interposición del recurso y reclamación del expediente. Emplazamiento de los demandados y admisión del recurso.' },
    { numero: 60, titulo: 'Recurso contencioso-administrativo: Demanda y contestación. Alegaciones previas. Prueba. Vista y conclusiones. Sentencias. Otros medios de terminación del procedimiento.' },
    { numero: 61, titulo: 'El procedimiento abreviado en el ámbito contencioso-administrativo.' },
    { numero: 62, titulo: 'Los recursos en el proceso contencioso administrativo. Los recursos contra las resoluciones del Letrado de la Administración de Justicia.' },
    { numero: 63, titulo: 'Procedimientos especiales: Procedimientos para la protección de los derechos fundamentales de las personas. Cuestión de ilegalidad. Procedimientos en los casos de suspensión administrativa previa de acuerdos.' },
    { numero: 64, titulo: 'Disposiciones comunes a los procedimientos contencioso-administrativos: Plazos. Medidas cautelares. Incidentes e invalidez de actos procesales. costas procesales. Ejecución de sentencias.' },
    { numero: 65, titulo: 'El proceso laboral: Principios que lo informan. Competencia objetiva y territorial. Cuestiones de competencia. Representación y defensa en el procedimiento laboral. Fondo de Garantía Salarial. Justicia gratuita.' },
    { numero: 66, titulo: 'La evitación del proceso: Conciliación previa y reclamación administrativa previa. El proceso ordinario: Demanda, conciliación y juicio. Recursos: de suplicación y de casación, con referencia al recurso de casación para la unificación de doctrina; disposiciones comunes a los recursos de suplicación y casación.' },
    { numero: 67, titulo: 'Procesos especiales: Despidos, Seguridad Social, Conflictos Colectivos, Impugnación de los convenios colectivos. Tutela de derechos fundamentales.' },
    { numero: 68, titulo: 'El Concurso de acreedores. Concepto de concurso sus clases, la competencia objetiva y territorial. El administrador concursal. Aspectos procesales: Procedimiento ordinario. Las secciones del concurso; el incidente concursal. Los recursos. El preconcurso: presupuestos, Efectos de la comunicación de apertura de negociaciones sobre acciones y procedimientos ejecutivos y procedimiento de homologación. El procedimiento especial para microempresas: ámbito de aplicación y reglas procesales especiales del procedimiento.' }
];

const TRAMITACION = [
    { numero: 1, titulo: 'La Constitución española de 1978: Estructura y contenido. Las atribuciones de la Corona. Las Cortes Generales: Composición, atribuciones y funcionamiento. La elaboración de las leyes. El Tribunal Constitucional. Composición y funciones.' },
    { numero: 2, titulo: 'Derecho de igualdad y no discriminación por razón de género: especial referencia a la Ley Orgánica 3/2007, para la Igualdad Efectiva de Mujeres y Hombres. La Ley Orgánica 1/2004, de Medidas de Protección Integral contra la Violencia de Género. Antecedentes. Objeto y principios rectores. Medidas de sensibilización, prevención y detección. Derechos de las mujeres víctimas de la violencia de género. Tutela institucional. Ley 15/2022, de 12 de julio, integral para la igualdad de trato y la no discriminación. La Ley 4/2023, de 28 de febrero, para la igualdad real y efectiva de las personas trans y para la garantía de los derechos de las personas LGTBI.' },
    { numero: 3, titulo: 'El Gobierno y la Administración. El Presidente del Gobierno. El Consejo de Ministros. Organización administrativa española: Ministros, Secretarios de Estado, Subsecretarios y Directores Generales. La Administración periférica del Estado. Los Delegados de Gobierno en la Comunidad Autónoma y los Subdelegados de Gobierno. La Secretaria de Estado de Justicia: Principales competencias.' },
    { numero: 4, titulo: 'Organización territorial del Estado en la Constitución. El Estado de las Autonomías. Las Comunidades Autónomas: Su constitución y competencias. Los Estatutos de Autonomía. La Administración Local. La provincia y el municipio.' },
    { numero: 5, titulo: 'La Unión Europea. Competencias de la UE. Instituciones y órganos de la Unión Europea: el Parlamento Europeo, el Consejo Europeo, el Consejo de la Unión Europea, la Comisión Europea, el Tribunal de Justicia de la Unión Europea, el Tribunal de Cuentas.' },
    { numero: 6, titulo: 'El Poder Judicial. El Consejo General del Poder Judicial: composición y funciones. La jurisdicción: Jueces y Magistrados: Funciones y competencias. La independencia judicial. El Ministerio Fiscal: Organización y funciones. Sistemas de acceso a las carreras judicial y fiscal.' },
    { numero: 7, titulo: 'Examen de la organización y competencia del Tribunal Supremo, de la Audiencia Nacional, de los Tribunales Superiores y de las Audiencias Provinciales.' },
    { numero: 8, titulo: 'De los Tribunales de Instancia y del Tribunal Central de Instancia. Examen de la organización y competencia de los Tribunales de Instancia: Sección Única, Secciones Civil, De Instrucción, De Familia, Infancia y Capacidad, De lo Mercantil, De Violencia sobre la Mujer, De Violencia contra la Infancia y la Adolescencia, De lo Penal, De Menores, De Vigilancia Penitenciaria, De lo Contencioso-Administrativo y De lo Social. La Sección de lo Mercantil del Tribunal de Instancia de Alicante: Tribunal de Marca de la Unión Europea. Los jueces o juezas de Paz, Oficina de Justicia en el Municipio, las Agrupaciones de Oficinas de Justicia: Organización y competencias, elección del Juez o Jueza de Paz, la Secretaría de las Oficinas de Justicia.' },
    { numero: 9, titulo: 'La carta de Derechos de los Ciudadanos ante la Justicia. Derechos de información, de atención y gestión, de identificación de actuaciones y funcionarios, derechos lingüísticos. Derechos frente a los profesionales que asisten y representan al ciudadano: Abogados, Procuradores, Graduados Sociales. El Derecho a la Justicia Gratuita en la Carta de Derechos. El plan de Transparencia Judicial.' },
    { numero: 10, titulo: 'La modernización de la oficina judicial. Nuevo modelo de organización judicial: La eficiencia organizativa del Servicio Público de Justicia para la implantación de los Tribunales de Instancia y las Oficinas de Justicia en los municipios: su regulación en la Ley Orgánica del Poder Judicial. La administración de justicia y las nuevas tecnologías. Código de Conducta para usuarios de equipos y sistemas informáticos al servicio de la Administración de Justicia. El expediente digital y la presentación telemática de escritos y documentos. La firma digital, el correo electrónico. Incidencia de la legislación de protección de datos en el uso de las aplicaciones informáticas.' },
    { numero: 11, titulo: 'El Letrado de la Administración de Justicia en la Ley Orgánica del Poder Judicial: funciones y competencias. Ordenación del cuerpo superior jurídico de Letrados de la Administración de Justicia: Secretario de Gobierno y Secretarios Coordinadores.' },
    { numero: 12, titulo: 'Cuerpos de Funcionarios al servicio de la Administración de Justicia. Cuerpos Generales y Cuerpos Especiales: Definición y Cuerpos que los integran. Cuerpos Especiales: El Cuerpo de Médicos Forenses: Funciones.' },
    { numero: 13, titulo: 'Los Cuerpos Generales (I): Funciones. Formas de acceso. Promoción interna. Adquisición y pérdida de la condición de funcionarios. La rehabilitación. Derechos, deberes e incompatibilidades. Jornada y horarios. Vacaciones, permisos y licencias.' },
    { numero: 14, titulo: 'Los Cuerpos Generales (II): Situaciones administrativas. Ordenación de la actividad profesional. Provisión de puestos de trabajo. Régimen disciplinario.' },
    { numero: 15, titulo: 'Libertad sindical: El Sindicato en la Constitución Española. Elecciones sindicales según la Ley de órganos de representación y el Estatuto Básico del Empleado Público. El derecho de huelga. Salud y prevención de riesgos laborales.' },
    { numero: 16, titulo: 'Medios adecuados de solución de controversias en vía no jurisdiccional. Los procedimientos declarativos en la Ley de Enjuiciamiento Civil: juicio ordinario y verbal.' },
    { numero: 17, titulo: 'Los procedimientos de ejecución en la Ley de Enjuiciamiento Civil. Clases de ejecución: disposiciones generales de cada una de ellas. Especial referencia a la libranza de mandamientos, efectividad de los embargos acordados en el decreto acordando medidas ejecutivas concretas para llevar a cabo lo dispuesto por la orden general de ejecución y en los decretos de mejora, averiguación patrimonial, preparación procesal de la vía de apremio de muebles e inmuebles, actas de celebración de subastas y trámite de depósito judicial. Las medidas cautelares.' },
    { numero: 18, titulo: 'Procesos especiales en la Ley de Enjuiciamiento Civil. Especial consideración a los procesos matrimoniales y al proceso monitorio. El requerimiento de pago en el procedimiento monitorio. El juicio cambiario.' },
    { numero: 19, titulo: 'La jurisdicción voluntaria: Naturaleza y clases de procedimientos. Especial referencia a los actos de conciliación.' },
    { numero: 20, titulo: 'Los procedimientos penales en la Ley de Enjuiciamiento Criminal; ordinario, abreviado y de jurado. Breve referencia al procedimiento restaurativo.' },
    { numero: 21, titulo: 'Procedimiento de juicio sobre delitos leves. Juicios Rápidos. La ejecución en el proceso penal, con especial referencia a la ejecución de los delitos leves. La pieza de responsabilidad civil en el proceso penal.' },
    { numero: 22, titulo: 'Recurso contencioso-administrativo. Procedimientos ordinarios, abreviados y especiales.' },
    { numero: 23, titulo: 'El proceso laboral. Procedimiento ordinario. Procedimiento por despido. Procesos de seguridad social.' },
    { numero: 24, titulo: 'Recursos. Cuestiones generales sobre el derecho al recurso. El depósito para recurrir. Los recursos en el ámbito civil: Reposición, revisión contra resoluciones del Letrado de la Administración de Justicia, queja, apelación y casación. Los recursos en el procedimiento penal: reforma, apelación, queja, recurso de casación y el recurso de revisión de sentencias firmes. Los recursos contra las resoluciones del Letrado de la Administración de Justicia.' },
    { numero: 25, titulo: 'Los actos procesales. Requisitos de los actos procesales: a) lugar; b) tiempo: Términos y plazos: Cómputo de los plazos; c) forma (consideración de la lengua oficial). Defectos de los actos: Nulidad, anulabilidad, irregularidad; subsanación de defectos.' },
    { numero: 26, titulo: 'Las resoluciones de los órganos judiciales. Clases de resoluciones judiciales: Contenido y características. Las resoluciones de los órganos judiciales colegiados. Las resoluciones del Letrado de la Administración de Justicia.' },
    { numero: 27, titulo: 'Los actos de comunicación con otros Tribunales y Autoridades: oficios y mandamientos. El auxilio judicial: los exhortos y los mandamientos en el proceso penal. Cooperación jurídica internacional: las comisiones rogatorias.' },
    { numero: 28, titulo: 'Actos de comunicación a las partes y otros intervinientes en el proceso: notificaciones, requerimientos, citaciones y emplazamientos. Notificaciones, citaciones y mandamientos en el proceso penal. Formas de notificación y nuevas tecnologías.' },
    { numero: 29, titulo: 'El Registro Civil. Estructura del Registro Civil. las Oficinas del Registro Civil: Oficina Central, Oficinas Generales y Oficinas Consulares y sus funciones. Hechos y actos inscribibles en el Registro Civil.' },
    { numero: 30, titulo: 'Las inscripciones: Inscripción de nacimiento y filiación; inscripciones relativas al matrimonio; inscripción del fallecimiento. Otras inscripciones. Certificaciones. Expedientes del Registro Civil.' },
    { numero: 31, titulo: 'Conceptos de archivo judicial y de documentación judicial en relación con la legislación vigente en materia de archivos judiciales. Formas de remisión de documentación judicial y relaciones documentales. Nuevas tecnologías en los archivos judiciales de gestión. Las juntas de expurgo de la documentación judicial.' },
    { numero: 32, titulo: 'Informática básica: conceptos fundamentales sobre el hardware y el software. Sistemas de almacenamiento de datos. Sistemas operativos. Nociones básicas de seguridad informática.' },
    { numero: 33, titulo: 'Introducción al sistema operativo: el entorno Windows. Fundamentos. Trabajo en el entorno gráfico de Windows: ventanas, iconos, menús contextuales, cuadros de diálogo. El escritorio y sus elementos. El menú inicio.' },
    { numero: 34, titulo: 'El explorador de Windows. Gestión de carpetas y archivos. Operaciones de búsqueda. Herramientas «Este equipo» y «Acceso rápido». Accesorios. Herramientas del sistema.' },
    { numero: 35, titulo: 'Procesadores de texto: Word 365. Principales funciones y utilidades. Creación y estructuración del documento. Gestión, grabación, recuperación e impresión de ficheros. Personalización del entorno de trabajo.' },
    { numero: 36, titulo: 'Correo electrónico: Outlook 365. Conceptos elementales y funcionamiento. El entorno de trabajo. Enviar, recibir, responder y reenviar mensajes. Creación de mensajes. Reglas de mensaje. Libreta de direcciones.' },
    { numero: 37, titulo: 'La Red Internet: origen, evolución y estado actual. Conceptos elementales sobre protocolos y servicios en Internet. Funcionalidades básicas de los navegadores web.' }
];

const AUXILIO = [
    { numero: 1, titulo: 'La Constitución española de 1978: Estructura y contenido. Las atribuciones de la Corona. Las Cortes Generales: Composición, atribuciones y funcionamiento. La elaboración de las leyes. El Tribunal Constitucional. Composición y funciones.' },
    { numero: 2, titulo: 'Derecho de igualdad y no discriminación por razón de género: especial referencia a la Ley Orgánica 3/2007, para la Igualdad Efectiva de Mujeres y Hombres. La Ley Orgánica 1/2004, de Medidas de Protección Integral contra la Violencia de Género. Antecedentes. Objeto y principios rectores. Medidas de sensibilización, prevención y detección. Derechos de las mujeres víctimas de la violencia de género. Tutela institucional. Ley 15/2022, de 12 de julio, integral para la igualdad de trato y la no discriminación. La Ley 4/2023, de 28 de febrero, para la igualdad real y efectiva de las personas trans y para la garantía de los derechos de las personas LGTBI.' },
    { numero: 3, titulo: 'El Gobierno y la Administración. El Presidente del Gobierno. El Consejo de Ministros. Organización administrativa española: Ministros, Secretarios de Estado, Subsecretarios y Directores Generales. La Administración periférica del Estado. Los Delegados de Gobierno en la Comunidad Autónoma y los Subdelegados de Gobierno. La Secretaria de Estado de Justicia: Principales competencias.' },
    { numero: 4, titulo: 'Organización territorial del Estado en la Constitución. Las Comunidades Autónomas: Su constitución y competencias. Los Estatutos de Autonomía. La Administración Local. La provincia y el municipio.' },
    { numero: 5, titulo: 'La Unión Europea. Competencias de la Unión Europea. Instituciones y órganos de la Unión Europea: el Parlamento Europeo, el Consejo Europeo, el Consejo de la Unión Europea, la Comisión Europea, el Tribunal de Justicia de la Unión Europea y el Tribunal de Cuentas.' },
    { numero: 6, titulo: 'El Poder Judicial. El Consejo General del Poder Judicial: composición y funciones. La jurisdicción: Jueces y Magistrados. La independencia judicial. El Ministerio Fiscal: Organización y funciones.' },
    { numero: 7, titulo: 'Organización y competencia del Tribunal Supremo, de la Audiencia Nacional, de los Tribunales Superiores de Justicia y de las Audiencias Provinciales.' },
    { numero: 8, titulo: 'De los Tribunales de Instancia y del Tribunal Central de Instancia. Organización y competencia de los Tribunales de Instancia: Sección Única, Secciones Civil, De Instrucción, De Familia, Infancia y Capacidad, De lo Mercantil, De Violencia sobre la Mujer, De Violencia contra la Infancia y la Adolescencia, De lo Penal, De Menores, De Vigilancia Penitenciaria, De lo Contencioso-Administrativo y De lo Social. La Sección de lo Mercantil del Tribunal de Instancia de Alicante: Tribunal de Marca de la Unión Europea. Los jueces o juezas de Paz, Oficina de Justicia en el Municipio, las Agrupaciones de Oficinas de Justicia: Organización y competencias, elección del Juez o Jueza de Paz, la Secretaría de las Oficinas de Justicia.' },
    { numero: 9, titulo: 'La carta de Derechos de los Ciudadanos ante la Justicia. Derechos de información, de atención y gestión, de identificación de actuaciones y funcionarios, derechos lingüísticos. Derechos frente a los profesionales que asisten y representan al ciudadano: Abogados, Procuradores, Graduados Sociales. El Derecho a la Justicia Gratuita.' },
    { numero: 10, titulo: 'La modernización de la oficina judicial: Nuevo modelo de organización judicial. La eficiencia organizativa del Servicio Público de Justicia para la implantación de los Tribunales de Instancia y las Oficinas de Justicia en los municipios: su regulación en la Ley Orgánica del Poder Judicial. La Administración de justicia y las nuevas tecnologías: Presentación de escritos y documentos por vía telemática. Concepto de expediente digital y firma digital. La Videoconferencia. Incidencia de la legislación de protección de datos en el uso de las aplicaciones informáticas.' },
    { numero: 11, titulo: 'El Letrado de la Administración de Justicia en la Ley Orgánica del Poder Judicial: funciones y competencias. Ordenación del cuerpo superior jurídico de Letrados de la Administración de Justicia: Secretario de Gobierno y Secretarios Coordinadores.' },
    { numero: 12, titulo: 'Cuerpos de Funcionarios al servicio de la Administración de Justicia. Cuerpos Generales y Cuerpos Especiales: Definición y Cuerpos que los integran. Cuerpos Especiales: El Cuerpo de Médicos Forenses: Funciones.' },
    { numero: 13, titulo: 'Los Cuerpos Generales (I): Funciones. Formas de acceso. Promoción interna. Adquisición y pérdida de la condición de funcionario. La rehabilitación. Derechos, deberes e incompatibilidades. Jornada y horarios. Vacaciones, permisos y licencias.' },
    { numero: 14, titulo: 'Los Cuerpos Generales (II): Situaciones administrativas. Ordenación de la actividad profesional. Provisión de puestos de trabajo. Régimen disciplinario.' },
    { numero: 15, titulo: 'Libertad sindical. El Sindicato en la Constitución Española. Elecciones sindicales según la Ley de órganos de representación y el Estatuto Básico del Empleado Público. El derecho de huelga. Salud y prevención de riesgos laborales.' },
    { numero: 16, titulo: 'Los procedimientos declarativos en la Ley de Enjuiciamiento Civil 1/2000: juicio ordinario; juicio verbal; procedimientos especiales. Nociones generales de los procesos especiales en la Ley de Enjuiciamiento Civil. Especial consideración a los procesos matrimoniales y al procedimiento monitorio; el requerimiento de pago en el juicio monitorio. Medios adecuados de solución de controversias en vía no jurisdiccional. Nociones generales de jurisdicción voluntaria.' },
    { numero: 17, titulo: 'Los procedimientos de ejecución en la Ley de Enjuiciamiento Civil. La ejecución dineraria, no dineraria y supuestos especiales: nociones básicas Las medidas cautelares. Diligencia de embargo, diligencia de lanzamiento, remociones y depósitos judiciales.' },
    { numero: 18, titulo: 'Los procedimientos penales en la Ley de Enjuiciamiento Criminal: ordinario, abreviado, juicio sobre delitos leves y de jurado. Especial mención a los Juicios Rápidos. Breve referencia al procedimiento restaurativo.' },
    { numero: 19, titulo: 'Los procedimientos contencioso-administrativos: ordinario, abreviado y especiales.' },
    { numero: 20, titulo: 'El proceso laboral. Procedimiento ordinario. Procedimiento por despido. Procesos de seguridad social.' },
    { numero: 21, titulo: 'Los actos procesales. Requisitos de los actos procesales: a) lugar; b) tiempo: Términos y plazos: Cómputo de los plazos; c) forma (consideración de la lengua oficial). Defectos de los actos: Nulidad, anulabilidad, irregularidad; subsanación de defectos.' },
    { numero: 22, titulo: 'Las resoluciones de los órganos judiciales. Clases de resoluciones judiciales: Contenido y características. Las resoluciones de los órganos judiciales colegiados. Las resoluciones del Letrado de la Administración de Justicia.' },
    { numero: 23, titulo: 'Los actos de comunicación con otros Tribunales y Autoridades: oficios y mandamientos. El auxilio judicial: los exhortos y los mandamientos en el proceso penal. Cooperación jurídica internacional: las comisiones rogatorias.' },
    { numero: 24, titulo: 'Actos de comunicación a las partes y otros intervinientes en el proceso: notificaciones, requerimientos, citaciones y emplazamientos. Notificaciones, citaciones y mandamientos en el proceso penal. Formas de notificación y nuevas tecnologías.' },
    { numero: 25, titulo: 'El Registro Civil. Estructura del Registro Civil. Las Oficinas del Registro Civil: Oficina Central, Oficinas Generales y Oficinas Consulares y sus funciones. Hechos y actos inscribibles en el Registro Civil. Las inscripciones: Inscripción de nacimiento y filiación; inscripciones relativas al matrimonio; inscripción del fallecimiento. Otras inscripciones. Certificaciones. Expedientes del Registro Civil.' },
    { numero: 26, titulo: 'Conceptos de archivo judicial y de documentación judicial en relación con la legislación vigente en materia de archivos judiciales. Formas de remisión de documentación judicial y relaciones documentales. Nuevas tecnologías en los archivos judiciales de gestión. Las juntas de expurgo de la documentación judicial.' }
];

/* ============================================================
   QUÉ LEYES ENTRAN EN CADA TEMA

   El programa oficial no cita las leyes una por una: dice "Los actos
   de comunicación judicial" y da por sabido que eso es la LEC. Aquí
   se hace explícito ese salto con reglas de palabras clave sobre el
   título oficial del tema.

   POR QUÉ ASÍ Y NO A MANO TEMA POR TEMA: son 131 temas entre los
   tres cuerpos, y una tabla escrita a mano se queda vieja en cuanto
   cambia la convocatoria. Con reglas, al cambiar el anexo basta con
   regenerar los títulos.

   Es una aproximación, y falla por exceso más que por defecto: mejor
   que un tema vigile una ley de más (sale un aviso que se descarta)
   a que vigile una de menos (no sale y no te enteras).
   ============================================================ */

const CE          = 'BOE-A-1978-31229';
const LOTC        = 'BOE-A-1979-23709';
const LOPJ        = 'BOE-A-1985-12666';
const LDPJ        = 'BOE-A-1988-29622';
const EOMF        = 'BOE-A-1982-837';
const LEC         = 'BOE-A-2000-323';
const LECRIM      = 'BOE-A-1882-6036';
const CP          = 'BOE-A-1995-25444';
const CC          = 'BOE-A-1889-4763';
const LJCA        = 'BOE-A-1998-16718';
const LJS         = 'BOE-A-2011-15936';
const LJV         = 'BOE-A-2015-7391';
const LRC         = 'BOE-A-2011-12628';
const LPAC        = 'BOE-A-2015-10565';
const LRJSP       = 'BOE-A-2015-10566';
const LEY_GOBIERNO= 'BOE-A-1997-25336';
const LBRL        = 'BOE-A-1985-5392';
const EBEP        = 'BOE-A-2015-11719';
const REGL_INGRESO= 'BOE-A-2005-21264';
const REGL_LAJ    = 'BOE-A-2006-839';
const LO_EFICIENCIA = 'BOE-A-2025-76';
const RDL_DIGITAL = 'BOE-A-2023-25758';
const LEXNET      = 'BOE-A-2015-12999';
const LEY_TIC     = 'BOE-A-2011-11605';
const LOPD        = 'BOE-A-2018-16673';
const TRANSPARENCIA = 'BOE-A-2013-12887';
const LO_IGUALDAD = 'BOE-A-2007-6115';
const LO_VIOLENCIA= 'BOE-A-2004-21760';
const LEY_TRATO   = 'BOE-A-2022-11589';
const LEY_TRANS   = 'BOE-A-2023-5366';
const CONCURSAL   = 'BOE-A-2020-4859';
const LO_MENORES  = 'BOE-A-2000-641';
const LO_JURADO   = 'BOE-A-1995-12095';
const LO_PENITENCIARIA = 'BOE-A-1979-23708';
const LAJG        = 'BOE-A-1996-750';
const LEY_TASAS   = 'BOE-A-2012-14301';
const COOP_INTL   = 'BOE-A-2015-8564';
const LPH         = 'BOE-A-1960-10906';
const LOLS        = 'BOE-A-1985-16660';
const RDL_HUELGA  = 'BOE-A-1977-6061';
const LPRL        = 'BOE-A-1995-24292';
const LO_DEFENSA  = 'BOE-A-2024-23630';

/* Cada regla: si el título del tema contiene alguna de las pistas,
   ese tema estudia esas normas. Las pistas van sin acentos y en
   minúsculas porque así se comparan. */
const REGLAS = [
    { pistas: ['constitucion espanola', 'corona', 'cortes generales', 'elaboracion de las leyes'], normas: [CE] },
    { pistas: ['tribunal constitucional'], normas: [CE, LOTC] },
    { pistas: ['organizacion territorial', 'comunidades autonomas', 'estatutos de autonomia'], normas: [CE] },
    { pistas: ['administracion local', 'la provincia y el municipio'], normas: [LBRL] },
    { pistas: ['el gobierno y la administracion', 'consejo de ministros', 'presidente del gobierno'], normas: [LEY_GOBIERNO, LRJSP] },
    { pistas: ['procedimiento administrativo'], normas: [LPAC, LRJSP] },

    { pistas: ['poder judicial', 'consejo general del poder judicial', 'independencia judicial', 'carrera judicial'], normas: [LOPJ, CE] },
    { pistas: ['ministerio fiscal'], normas: [EOMF, LOPJ] },
    { pistas: ['tribunal supremo', 'audiencia nacional', 'tribunales superiores', 'audiencias provinciales'], normas: [LOPJ, LDPJ] },
    { pistas: ['tribunales de instancia', 'tribunal de instancia', 'tribunal central de instancia'], normas: [LOPJ, LO_EFICIENCIA] },
    { pistas: ['justicia de paz', 'oficina de justicia en el municipio', 'juez o jueza de paz'], normas: [LOPJ, LO_EFICIENCIA] },
    { pistas: ['oficina judicial', 'oficina fiscal', 'eficiencia organizativa', 'servicio publico de justicia'], normas: [LOPJ, LO_EFICIENCIA, RDL_DIGITAL] },
    { pistas: ['letrados de la administracion de justicia', 'letrado de la administracion de justicia'], normas: [LOPJ, REGL_LAJ] },
    { pistas: ['cuerpos de funcionarios', 'cuerpos generales', 'cuerpos especiales', 'medicos forenses'], normas: [LOPJ, REGL_INGRESO] },
    { pistas: ['ingreso en los cuerpos', 'promocion interna', 'provision de puestos', 'situaciones administrativas'], normas: [LOPJ, REGL_INGRESO, EBEP] },
    { pistas: ['derechos, deberes', 'jornada', 'vacaciones', 'permisos', 'licencias', 'regimen disciplinario', 'retributivo'], normas: [LOPJ, EBEP] },
    { pistas: ['libertad sindical', 'sindicato', 'elecciones sindicales', 'derecho de huelga'], normas: [LOLS, RDL_HUELGA, EBEP, CE] },
    { pistas: ['riesgos laborales', 'salud laboral'], normas: [LPRL] },

    { pistas: ['carta de derechos de los ciudadanos', 'transparencia'], normas: [TRANSPARENCIA] },
    { pistas: ['proteccion de datos'], normas: [LOPD, LOPJ] },
    { pistas: ['nuevas tecnologias', 'expediente digital', 'presentacion telematica', 'videoconferencia', 'firma digital', 'lexnet', 'informatic'], normas: [RDL_DIGITAL, LEXNET, LEY_TIC, LOPJ] },

    { pistas: ['igualdad efectiva', 'no discriminacion', 'violencia de genero', 'personas trans', 'lgtbi'], normas: [LO_IGUALDAD, LO_VIOLENCIA, LEY_TRATO, LEY_TRANS] },

    { pistas: ['partes en el proceso civil', 'representacion procesal', 'defensa tecnica', 'abogados y procuradores'], normas: [LEC, LO_DEFENSA] },
    { pistas: ['jurisdiccion y competencia', 'acumulacion de acciones'], normas: [LEC, LOPJ] },
    { pistas: ['actuaciones judiciales', 'resoluciones judiciales', 'nulidad de', 'vistas', 'comparecencias'], normas: [LEC, LOPJ] },
    { pistas: ['actos de comunicacion', 'notificaciones', 'citaciones', 'emplazamientos', 'exhortos', 'auxilio judicial'], normas: [LEC, LECRIM, LOPJ] },
    { pistas: ['cooperacion juridica internacional'], normas: [COOP_INTL, LEC] },
    { pistas: ['fe publica judicial', 'documentacion de las actuaciones'], normas: [LOPJ, LEC] },
    { pistas: ['procedimientos declarativos', 'juicio ordinario', 'juicio verbal', 'diligencias preliminares', 'prueba', 'rebeldia'], normas: [LEC] },
    { pistas: ['division de la herencia', 'liquidacion del regimen economico'], normas: [LEC, CC] },
    { pistas: ['proceso monitorio', 'juicio cambiario'], normas: [LEC, LPH] },
    { pistas: ['procesos matrimoniales', 'filiacion', 'medidas judiciales de apoyo'], normas: [LEC, CC] },
    { pistas: ['jurisdiccion voluntaria', 'conciliacion'], normas: [LJV] },
    { pistas: ['recurso de reposicion', 'recurso de queja', 'apelacion', 'casacion', 'revision de sentencias'], normas: [LEC, LECRIM] },
    { pistas: ['titulos ejecutivos', 'ejecucion provisional', 'ejecucion dineraria', 'apremio', 'embargo', 'tercería', 'terceria', 'ejecucion no dineraria'], normas: [LEC] },
    { pistas: ['medidas cautelares'], normas: [LEC] },
    { pistas: ['condena en costas', 'tasacion de costas', 'tasas', 'deposito', 'consignacion'], normas: [LEC, LEY_TASAS, LAJG] },
    { pistas: ['justicia gratuita'], normas: [LAJG] },
    { pistas: ['propiedad horizontal'], normas: [LPH] },

    { pistas: ['registro civil'], normas: [LRC] },

    { pistas: ['proceso penal', 'competencia. cuestiones de competencia', 'accion civil y penal', 'denuncia', 'querella', 'policia judicial', 'sumario', 'instruccion sumarial', 'detencion', 'prision provisional', 'libertad provisional', 'fianzas', 'sobreseimiento', 'juicio oral', 'procedimiento abreviado', 'juicios rapidos', 'delitos leves', 'ejecucion en el proceso penal'], normas: [LECRIM, CP] },
    { pistas: ['tribunal del jurado'], normas: [LO_JURADO, LECRIM] },
    { pistas: ['responsabilidad penal de los menores', 'de menores'], normas: [LO_MENORES] },
    { pistas: ['vigilancia penitenciaria', 'penitenciari'], normas: [LO_PENITENCIARIA, LECRIM] },

    { pistas: ['contencioso-administrativo', 'contencioso administrativo'], normas: [LJCA] },
    { pistas: ['proceso laboral', 'jurisdiccion social', 'despido', 'seguridad social', 'conflictos colectivos', 'impugnacion de convenios', 'fogasa'], normas: [LJS] },

    { pistas: ['concurso de acreedores', 'administrador concursal', 'preconcurso', 'microempresas'], normas: [CONCURSAL] },

    { pistas: ['archivo judicial', 'documentacion judicial', 'expurgo'], normas: [LOPJ] },
    { pistas: ['union europea'], normas: [] }
];

function sinAcentos(texto) {
    return String(texto || '')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase();
}

/* Las normas de un tema, según su título oficial. */
function normasDelTema(titulo) {
    const limpio = sinAcentos(titulo);
    const encontradas = new Set();

    for (const regla of REGLAS) {
        if (regla.pistas.some(p => limpio.includes(p))) {
            regla.normas.forEach(id => encontradas.add(id));
        }
    }

    return [...encontradas];
}

const TEMARIOS = { gestion: GESTION, tramitacion: TRAMITACION, auxilio: AUXILIO };

/* ============================================================
   QUÉ TEMAS HAN CAMBIADO RESPECTO A LA CONVOCATORIA ANTERIOR

   Se comparan los enunciados oficiales palabra por palabra. No es
   un detalle menor: en Gestión cambian 15 de los 68, y algunos no
   son un retoque de redacción sino otro tema (el 8 pasó de los
   juzgados unipersonales a los Tribunales de Instancia).

   Se distingue entre cambio de fondo y retoque para no dar la misma
   voz de alarma a "el Consejo de Ministros de la UE" -> "el Consejo
   de la UE" que a un tema reescrito entero.
   ============================================================ */

const { temarioAnteriorDe, REFERENCIA } = require('./_temario-anterior');

function palabras(texto) {
    return sinAcentos(texto).replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean);
}

/* Compara dos enunciados y devuelve qué ha cambiado, recortando lo
   que comparten al principio y al final: así se señala solo el trozo
   distinto en vez de pintar el tema entero. */
function compararEnunciados(antes, ahora) {
    const a = palabras(antes);
    const b = palabras(ahora);

    if (a.join(' ') === b.join(' ')) return null;

    let inicio = 0;
    while (inicio < a.length && inicio < b.length && a[inicio] === b[inicio]) inicio++;

    let fin = 0;
    while (fin < a.length - inicio && fin < b.length - inicio &&
           a[a.length - 1 - fin] === b[b.length - 1 - fin]) fin++;

    const quitadas = a.length - inicio - fin;
    const puestas = b.length - inicio - fin;

    /* Un retoque es un cambio corto dentro de un tema que sigue
       siendo el mismo. Si se toca un tercio del enunciado o más de
       veinte palabras, es otro tema. */
    const tocado = Math.max(quitadas, puestas);
    const fondo = tocado > 20 || tocado > b.length / 3;

    return {
        antes,
        ahora,
        desde: inicio,          // palabras que se mantienen al principio
        hasta: fin,             // palabras que se mantienen al final
        alcance: fondo ? 'fondo' : 'retoque'
    };
}

/* El temario de un cuerpo, con las leyes resueltas y el cambio
   respecto a la convocatoria anterior, si se sabe. */
function temarioDe(clave) {
    const temas = TEMARIOS[String(clave || '')] || [];
    const anterior = temarioAnteriorDe(clave);

    return temas.map(t => {
        let cambio = null;

        if (anterior) {
            const viejo = anterior.find(x => x.numero === t.numero);
            cambio = viejo
                ? compararEnunciados(viejo.titulo, t.titulo)
                : { antes: null, ahora: t.titulo, alcance: 'nuevo' };
        }

        return {
            numero: t.numero,
            titulo: t.titulo,
            normas: normasDelTema(t.titulo),
            cambio,
            /* null en cambio significa dos cosas distintas y hay que
               poder distinguirlas: "no ha cambiado" (hay comparación)
               o "no lo sé" (no tenemos el programa anterior). */
            comparado: !!anterior
        };
    });
}

module.exports = { TEMARIOS, temarioDe, normasDelTema, compararEnunciados, REFERENCIA_ANTERIOR: REFERENCIA };
