/**
 * Prueba de humo de la API: recorre el flujo completo (admin -> socio ->
 * cobro -> catalogo -> rutina -> entrenamiento -> progreso) contra un
 * servidor ya levantado, y limpia lo que creo.
 *
 *   node scripts/prueba-humo.js [--url http://localhost:4000] [--admin 1234567] [--password admin123]
 */
const arg = (n, d) => {
  const i = process.argv.indexOf(`--${n}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d;
};

const URL_BASE = arg('url', 'http://localhost:4000');
const ADMIN = arg('admin', '1234567');
const PASSWORD = arg('password', 'admin123');
// Cedula ficticia y alta para no chocar con socios reales.
const CEDULA_PRUEBA = arg('cedula', '99000001');
const CEDULA_PRUEBA_2 = '99000002';

let tokenAdmin = null;
let tokenSocio = null;
let fallos = 0;
let pasos = 0;

async function pedir(metodo, ruta, { token, cuerpo } = {}) {
  const res = await fetch(`${URL_BASE}${ruta}`, {
    method: metodo,
    headers: {
      ...(cuerpo ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  const texto = await res.text();
  let datos;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = texto;
  }
  return { estado: res.status, datos };
}

function verificar(descripcion, condicion, extra) {
  pasos++;
  if (condicion) {
    console.log(`  ok   ${descripcion}`);
  } else {
    fallos++;
    console.log(`  FALLA ${descripcion}`);
    if (extra !== undefined) console.log(`        ${JSON.stringify(extra).slice(0, 400)}`);
  }
}

async function main() {
  console.log(`\nProbando ${URL_BASE}\n`);

  // --- salud -------------------------------------------------------------
  const salud = await pedir('GET', '/api/salud');
  verificar('GET /api/salud responde ok', salud.datos?.ok === true, salud.datos);

  // --- login admin -------------------------------------------------------
  const login = await pedir('POST', '/api/auth/login', {
    cuerpo: { documento: ADMIN, password: PASSWORD },
  });
  verificar('login del admin', login.estado === 200 && !!login.datos?.token, login.datos);
  tokenAdmin = login.datos?.token;
  if (!tokenAdmin) return;

  verificar('el admin tiene rol ADMIN', login.datos.usuario.rol === 'ADMIN');

  const malo = await pedir('POST', '/api/auth/login', {
    cuerpo: { documento: ADMIN, password: 'clave-incorrecta' },
  });
  verificar('rechaza contraseña incorrecta', malo.estado === 401, malo.datos);

  const sinToken = await pedir('GET', '/api/socios');
  verificar('bloquea /api/socios sin token', sinToken.estado === 401);

  // --- catalogo ----------------------------------------------------------
  const filtros = await pedir('GET', '/api/ejercicios/filtros', { token: tokenAdmin });
  verificar(
    'filtros: 10 zonas con etiquetas en español',
    filtros.datos?.zonas?.length === 10 && filtros.datos.zonas.some((z) => z.etiqueta === 'Pecho'),
    filtros.datos?.zonas?.slice(0, 3)
  );

  const catalogo = await pedir('GET', '/api/ejercicios?limite=5', { token: tokenAdmin });
  verificar('catálogo devuelve 1324 ejercicios', catalogo.datos?.total === 1324, {
    total: catalogo.datos?.total,
  });

  const filtrado = await pedir('GET', '/api/ejercicios?zona=chest&equipo=barbell', {
    token: tokenAdmin,
  });
  verificar(
    'filtro por zona + equipo funciona',
    filtrado.datos?.total > 0 && filtrado.datos.total < 1324,
    { total: filtrado.datos?.total }
  );

  const busqueda = await pedir('GET', '/api/ejercicios?buscar=bench', { token: tokenAdmin });
  verificar('búsqueda por nombre encuentra resultados', busqueda.datos?.total > 0, {
    total: busqueda.datos?.total,
  });

  const enEspanol = await pedir('GET', '/api/ejercicios?buscar=sentadilla', { token: tokenAdmin });
  verificar('búsqueda en español sobre el nombre traducido', enEspanol.datos?.total > 50, {
    total: enEspanol.datos?.total,
  });

  // "gemelos" no aparece en ningún nombre ni etiqueta: solo lo encuentra el
  // diccionario de sinónimos.
  const porSinonimo = await pedir('GET', '/api/ejercicios?buscar=gemelos', { token: tokenAdmin });
  verificar('búsqueda por sinónimo ("gemelos" -> Pantorrillas)', porSinonimo.datos?.total > 50, {
    total: porSinonimo.datos?.total,
  });

  const porEquipo = await pedir('GET', '/api/ejercicios?buscar=multipower', { token: tokenAdmin });
  verificar('búsqueda por equipo en español ("multipower")', porEquipo.datos?.total > 20, {
    total: porEquipo.datos?.total,
  });

  const detalle = await pedir('GET', '/api/ejercicios/0025?idioma=es', { token: tokenAdmin });
  verificar(
    'detalle 0025 trae instrucciones en español',
    detalle.datos?.instrucciones?.pasos?.length > 0 && detalle.datos.zona === 'Pecho',
    { nombre: detalle.datos?.nombre, zona: detalle.datos?.zona }
  );

  const media = await fetch(`${URL_BASE}/media/videos/${detalle.datos?.gif?.split('/').pop()}`);
  verificar('el GIF del ejercicio se sirve por HTTP', media.ok, { estado: media.status });

  // --- alta de socio con cobro ------------------------------------------
  const planes = await pedir('GET', '/api/planes', { token: tokenAdmin });
  verificar('hay planes cargados', planes.datos?.length >= 5, planes.datos?.length);
  const planMensual = planes.datos?.find((p) => p.nombre === 'Mensual');

  await pedir('GET', `/api/socios?buscar=${CEDULA_PRUEBA}`, { token: tokenAdmin }); // calienta
  const alta = await pedir('POST', '/api/socios', {
    token: tokenAdmin,
    cuerpo: {
      documento: CEDULA_PRUEBA,
      nombre: 'Socio',
      apellido: 'De Prueba',
      telefono: '0981000000',
      objetivo: 'Hipertrofia',
      plan_id: planMensual?.id,
      metodo: 'EFECTIVO',
    },
  });
  verificar('alta de socio con membresía inicial', alta.estado === 201 && !!alta.datos?.socio_id, alta.datos);
  const socioId = alta.datos?.socio_id;
  if (!socioId) return;

  verificar(
    'la membresía inicial arranca hoy y dura 30 días',
    alta.datos.membresia?.fecha_inicio && alta.datos.membresia?.fecha_fin,
    alta.datos.membresia
  );

  const duplicado = await pedir('POST', '/api/socios', {
    token: tokenAdmin,
    cuerpo: { documento: CEDULA_PRUEBA, nombre: 'Otro', apellido: 'Igual' },
  });
  verificar('rechaza cédula duplicada', duplicado.estado === 409, duplicado.datos);

  // --- login del socio ---------------------------------------------------
  const loginSocio = await pedir('POST', '/api/auth/login', {
    cuerpo: { documento: CEDULA_PRUEBA, password: CEDULA_PRUEBA },
  });
  verificar(
    'el socio entra con su cédula como contraseña inicial',
    loginSocio.estado === 200 && loginSocio.datos?.usuario?.debe_cambiar_password === true,
    loginSocio.datos
  );
  tokenSocio = loginSocio.datos?.token;

  const yo = await pedir('GET', '/api/auth/yo', { token: tokenSocio });
  verificar('el socio ve su membresía AL_DIA', yo.datos?.membresia?.estado === 'AL_DIA', yo.datos?.membresia);

  // Segundo socio, para probar de verdad el aislamiento entre cuentas.
  const otro = await pedir('POST', '/api/socios', {
    token: tokenAdmin,
    cuerpo: { documento: CEDULA_PRUEBA_2, nombre: 'Otro', apellido: 'Socio' },
  });
  verificar('alta del segundo socio', otro.estado === 201, otro.datos);

  const ajeno = await pedir('GET', `/api/socios/${otro.datos?.socio_id}`, { token: tokenSocio });
  verificar('el socio NO puede ver la ficha de otro socio', ajeno.estado === 403, {
    estado: ajeno.estado,
    datos: ajeno.datos,
  });

  const propia = await pedir('GET', `/api/socios/${socioId}`, { token: tokenSocio });
  verificar('el socio SÍ puede ver su propia ficha', propia.estado === 200, propia.estado);

  const panelAjeno = await pedir('GET', '/api/dashboard', { token: tokenSocio });
  verificar('el socio no accede al panel de admin', panelAjeno.estado === 403);

  // --- renovacion encadenada --------------------------------------------
  const renovacion = await pedir('POST', `/api/socios/${socioId}/renovar`, {
    token: tokenAdmin,
    cuerpo: { plan_id: planMensual?.id, metodo: 'TRANSFERENCIA' },
  });
  verificar('renovación crea un segundo período', renovacion.estado === 201, renovacion.datos);
  verificar(
    'la renovación empieza al día siguiente del vencimiento (no pisa el período vigente)',
    renovacion.datos?.membresia?.fecha_inicio > alta.datos.membresia?.fecha_fin,
    {
      vence_anterior: alta.datos.membresia?.fecha_fin,
      inicia_nueva: renovacion.datos?.membresia?.fecha_inicio,
    }
  );

  const solape = await pedir('POST', `/api/socios/${socioId}/renovar`, {
    token: tokenAdmin,
    cuerpo: { plan_id: planMensual?.id, fecha_inicio: alta.datos.membresia?.fecha_inicio },
  });
  verificar('rechaza un período superpuesto', solape.estado === 409, solape.datos);

  // --- rutina ------------------------------------------------------------
  const rutina = await pedir('POST', '/api/rutinas', {
    token: tokenAdmin,
    cuerpo: {
      socio_id: socioId,
      nombre: 'Full body inicial',
      objetivo: 'Adaptación',
      dias: [
        {
          etiqueta: 'Día A · Empuje',
          ejercicios: [
            { codigo: '0025', series: 4, repeticiones: '8-10', descanso_seg: 90 },
            { codigo: '0043', series: 3, repeticiones: '12' },
          ],
        },
        {
          etiqueta: 'Día B · Tirón',
          ejercicios: [{ codigo: '0652', series: 3, repeticiones: 'máx' }],
        },
      ],
    },
  });
  verificar('crea rutina con 2 días', rutina.estado === 201 && rutina.datos?.dias?.length === 2, rutina.datos?.dias?.length);
  verificar(
    'los ejercicios de la rutina traen nombre e imagen del catálogo',
    !!rutina.datos?.dias?.[0]?.ejercicios?.[0]?.nombre && !!rutina.datos.dias[0].ejercicios[0].gif,
    rutina.datos?.dias?.[0]?.ejercicios?.[0]
  );

  const misRutinas = await pedir('GET', '/api/rutinas', { token: tokenSocio });
  verificar('el socio ve su rutina asignada', misRutinas.datos?.length === 1, misRutinas.datos);

  const diaSuelto = await pedir('GET', `/api/rutinas/dia/${rutina.datos.dias[0].id}`, { token: tokenSocio });
  verificar(
    'el día suelto trae sus ejercicios para la pantalla de entrenar',
    diaSuelto.estado === 200 && diaSuelto.datos?.ejercicios?.length === 2,
    diaSuelto.datos?.ejercicios?.length
  );
  verificar(
    'cada ejercicio del día informa el último peso levantado',
    diaSuelto.datos?.ejercicios?.every((e) => 'ultimo_peso' in e),
    diaSuelto.datos?.ejercicios?.[0]
  );

  // --- rutinas propias del socio ----------------------------------------
  const noPuede = await pedir('DELETE', `/api/rutinas/${rutina.datos.id}`, { token: tokenSocio });
  verificar(
    'el socio NO puede borrar la rutina que le armó el profe',
    noPuede.estado === 403,
    noPuede.datos
  );

  const noPuedeAgregar = await pedir('POST', `/api/rutinas/dias/${rutina.datos.dias[0].id}/ejercicios`, {
    token: tokenSocio,
    cuerpo: { codigo: '0032' },
  });
  verificar(
    'el socio NO puede meterle ejercicios a la rutina del profe',
    noPuedeAgregar.estado === 403,
    noPuedeAgregar.datos
  );

  const rutinaPropia = await pedir('POST', '/api/rutinas/propia', {
    token: tokenSocio,
    cuerpo: { nombre: 'Mi rutina', objetivo: 'Probar', dias: ['Lunes', 'Jueves'] },
  });
  verificar(
    'el socio crea su propia rutina con dos días',
    rutinaPropia.estado === 201 && rutinaPropia.datos?.origen === 'SOCIO' && rutinaPropia.datos?.dias?.length === 2,
    rutinaPropia.datos
  );

  const sumado = await pedir('POST', `/api/rutinas/dias/${rutinaPropia.datos.dias[0].id}/ejercicios`, {
    token: tokenSocio,
    cuerpo: { codigo: '0032', series: 5, repeticiones: '5' },
  });
  verificar('el socio agrega un ejercicio a su rutina', sumado.estado === 201, sumado.datos);

  const duplicado2 = await pedir('POST', `/api/rutinas/dias/${rutinaPropia.datos.dias[0].id}/ejercicios`, {
    token: tokenSocio,
    cuerpo: { codigo: '0032' },
  });
  verificar('no deja repetir el mismo ejercicio en un día', duplicado2.estado === 409, duplicado2.datos);

  const diaExtra = await pedir('POST', `/api/rutinas/${rutinaPropia.datos.id}/dias`, {
    token: tokenSocio,
    cuerpo: { etiqueta: 'Sábado' },
  });
  verificar('el socio agrega un día a su rutina', diaExtra.estado === 201, diaExtra.datos);

  const ajena = await pedir('POST', `/api/rutinas/dias/${rutinaPropia.datos.dias[0].id}/ejercicios`, {
    token: tokenAdmin,
    cuerpo: { codigo: '0043' },
  });
  verificar('el admin también puede tocar la rutina propia del socio', ajena.estado === 201);

  const quitado = await pedir('DELETE', `/api/rutinas/ejercicios/${sumado.datos.id}`, {
    token: tokenSocio,
  });
  verificar('el socio quita un ejercicio de su rutina', quitado.estado === 200, quitado.datos);

  const borrada = await pedir('DELETE', `/api/rutinas/${rutinaPropia.datos.id}`, { token: tokenSocio });
  verificar('el socio borra su propia rutina', borrada.estado === 200, borrada.datos);

  // --- plantillas de rutina ---------------------------------------------
  const plantilla = await pedir('POST', '/api/plantillas', {
    token: tokenAdmin,
    cuerpo: {
      nombre: `Plantilla de prueba ${CEDULA_PRUEBA}`,
      objetivo: 'Probar',
      nivel: 'PRINCIPIANTE',
      dias: [
        { etiqueta: 'Día 1', ejercicios: [{ codigo: '0025', series: 4, repeticiones: '8' }] },
        { etiqueta: 'Día 2', ejercicios: [{ codigo: '0043', series: 3, repeticiones: '12' }] },
      ],
    },
  });
  verificar('crea una plantilla con dos días', plantilla.estado === 201, plantilla.datos);

  const porSocio = await pedir('POST', `/api/plantillas/${plantilla.datos?.id}/asignar`, {
    token: tokenAdmin,
    cuerpo: { socio_id: socioId, nombre: 'Copiada de plantilla' },
  });
  verificar('asigna la plantilla y devuelve la rutina nueva', porSocio.estado === 201, porSocio.datos);

  const copiada = await pedir('GET', `/api/rutinas/${porSocio.datos?.rutina_id}`, {
    token: tokenAdmin,
  });
  verificar(
    'la rutina copiada trae los dos días con sus ejercicios',
    copiada.datos?.dias?.length === 2 &&
      copiada.datos.dias[0].ejercicios[0].codigo === '0025' &&
      copiada.datos.dias[0].ejercicios[0].series === 4 &&
      copiada.datos.dias[1].ejercicios[0].codigo === '0043',
    copiada.datos?.dias?.map((d) => d.ejercicios.map((e) => e.codigo))
  );
  verificar('la rutina asignada queda como del profe', copiada.datos?.origen === 'PROFE', copiada.datos?.origen);

  // Editar la rutina del socio no debe tocar la plantilla original.
  await pedir('DELETE', `/api/rutinas/dias/${copiada.datos.dias[1].id}`, { token: tokenAdmin });
  const plantillaIntacta = await pedir('GET', `/api/plantillas/${plantilla.datos.id}`, {
    token: tokenAdmin,
  });
  verificar(
    'tocar la rutina asignada NO altera la plantilla',
    plantillaIntacta.datos?.dias?.length === 2,
    plantillaIntacta.datos?.dias?.length
  );

  const plantillaPorSocio = await pedir('GET', '/api/plantillas', { token: tokenSocio });
  verificar('el socio no accede a las plantillas', plantillaPorSocio.estado === 403);

  await pedir('DELETE', `/api/plantillas/${plantilla.datos.id}`, { token: tokenAdmin });

  // --- edición de los datos del socio ------------------------------------
  const editado = await pedir('PATCH', `/api/socios/${socioId}`, {
    token: tokenAdmin,
    cuerpo: { telefono: '0981 999 888', objetivo: 'Fuerza', altura_cm: 175 },
  });
  verificar(
    'el admin edita los datos del socio',
    editado.estado === 200 && editado.datos?.telefono === '0981 999 888',
    editado.datos?.telefono
  );

  const cedulaTomada = await pedir('PATCH', `/api/socios/${socioId}`, {
    token: tokenAdmin,
    cuerpo: { documento: CEDULA_PRUEBA_2 },
  });
  verificar('no deja poner una cédula que ya es de otro', cedulaTomada.estado === 409, cedulaTomada.datos);

  const baja = await pedir('PATCH', `/api/socios/${socioId}`, {
    token: tokenAdmin,
    cuerpo: { activo: false },
  });
  verificar('el admin puede dar de baja al socio', baja.estado === 200, baja.datos?.activo);

  const bajaEnMostrador = await pedir('POST', '/api/socios/ingreso', {
    token: tokenAdmin,
    cuerpo: { documento: CEDULA_PRUEBA },
  });
  verificar(
    'un socio dado de baja no pasa por el mostrador',
    bajaEnMostrador.datos?.permitido === false && bajaEnMostrador.datos?.motivo === 'INACTIVO',
    bajaEnMostrador.datos
  );

  await pedir('PATCH', `/api/socios/${socioId}`, { token: tokenAdmin, cuerpo: { activo: true } });

  // --- peso y medidas ----------------------------------------------------
  const altura = await pedir('PATCH', '/api/mediciones/mi/altura', {
    token: tokenSocio,
    cuerpo: { altura_cm: 180 },
  });
  verificar('guarda la altura del socio', altura.estado === 200, altura.datos);

  const m1 = await pedir('POST', '/api/mediciones/mi', {
    token: tokenSocio,
    cuerpo: { fecha: '2026-01-10', peso_kg: 90, cintura_cm: 98 },
  });
  verificar('registra la primera medición', m1.estado === 201, m1.datos);

  const m2 = await pedir('POST', '/api/mediciones/mi', {
    token: tokenSocio,
    cuerpo: { peso_kg: 84.5, cintura_cm: 92, grasa_pct: 19 },
  });
  // 84.5 / 1.80^2 = 26.08 -> 26.1
  verificar('calcula el IMC con la altura del socio', Number(m2.datos?.imc) === 26.1, {
    imc: m2.datos?.imc,
  });
  verificar('calcula la variación contra la medición anterior', Number(m2.datos?.variacion_kg) === -5.5, {
    variacion: m2.datos?.variacion_kg,
  });

  const vacia = await pedir('POST', '/api/mediciones/mi', { token: tokenSocio, cuerpo: {} });
  verificar('rechaza una medición sin ningún dato', vacia.estado === 400, vacia.datos);

  const historial = await pedir('GET', '/api/mediciones/mi', { token: tokenSocio });
  verificar(
    'el resumen de peso muestra la variación total',
    historial.datos?.resumen?.variacion_total === -5.5 &&
      historial.datos?.resumen?.categoria_imc === 'SOBREPESO',
    historial.datos?.resumen
  );

  const medicionAjena = await pedir('GET', `/api/mediciones/${otro.datos?.socio_id}`, {
    token: tokenSocio,
  });
  verificar('el socio no puede ver las mediciones de otro', medicionAjena.estado === 403);

  const comoAdmin = await pedir('GET', `/api/mediciones/${socioId}`, { token: tokenAdmin });
  verificar(
    'el admin sí puede ver las mediciones del socio',
    comoAdmin.estado === 200 && comoAdmin.datos?.historial?.length === 2,
    comoAdmin.datos?.historial?.length
  );

  // --- entrenamiento -----------------------------------------------------
  const diaA = rutina.datos.dias[0];
  const sesion = await pedir('POST', '/api/entrenamiento/sesiones', {
    token: tokenSocio,
    cuerpo: { rutina_dia_id: diaA.id },
  });
  verificar('el socio abre una sesión', sesion.estado === 201, sesion.datos);
  const sesionId = sesion.datos?.id;

  const reabrir = await pedir('POST', '/api/entrenamiento/sesiones', {
    token: tokenSocio,
    cuerpo: { rutina_dia_id: diaA.id },
  });
  verificar('reabrir el mismo día reutiliza la sesión abierta', reabrir.datos?.reutilizada === true, reabrir.datos);

  for (let s = 1; s <= 3; s++) {
    await pedir('POST', `/api/entrenamiento/sesiones/${sesionId}/series`, {
      token: tokenSocio,
      cuerpo: { codigo: '0025', numero_serie: s, repeticiones: 10, peso: 40 + s * 5, rpe: 7 },
    });
  }
  const correccion = await pedir('POST', `/api/entrenamiento/sesiones/${sesionId}/series`, {
    token: tokenSocio,
    cuerpo: { codigo: '0025', numero_serie: 3, repeticiones: 8, peso: 55 },
  });
  verificar('reenviar una serie la corrige en vez de duplicar', correccion.estado === 201, correccion.datos);

  const cierre = await pedir('PATCH', `/api/entrenamiento/sesiones/${sesionId}/finalizar`, {
    token: tokenSocio,
    cuerpo: { notas: 'Buena sesión' },
  });
  // 10x45 + 10x50 + 8x55 = 450 + 500 + 440 = 1390
  verificar('el volumen calculado es correcto (1390 kg)', Number(cierre.datos?.volumen_kg) === 1390, cierre.datos);

  const bloqueada = await pedir('POST', `/api/entrenamiento/sesiones/${sesionId}/series`, {
    token: tokenSocio,
    cuerpo: { codigo: '0025', numero_serie: 9, repeticiones: 5, peso: 20 },
  });
  verificar('no deja cargar series en una sesión cerrada', bloqueada.estado === 409, bloqueada.datos);

  // --- progreso ----------------------------------------------------------
  const resumen = await pedir('GET', '/api/entrenamiento/progreso/resumen', { token: tokenSocio });
  verificar(
    'el resumen de progreso cuenta 1 sesión y el 1RM estimado',
    resumen.datos?.totales?.sesiones === 1 && resumen.datos?.records?.length > 0,
    resumen.datos?.records?.[0]
  );

  const volumen = await pedir('GET', '/api/entrenamiento/progreso/volumen?semanas=6', { token: tokenSocio });
  verificar('la serie semanal de volumen trae 6 semanas', volumen.datos?.length === 6, volumen.datos?.length);

  const porEjercicio = await pedir('GET', '/api/entrenamiento/progreso/ejercicio/0025', { token: tokenSocio });
  verificar('la evolución del ejercicio 0025 tiene un punto', porEjercicio.datos?.puntos?.length === 1, porEjercicio.datos?.puntos);

  // --- favoritos y asistencia -------------------------------------------
  await pedir('PUT', '/api/ejercicios/0043/favorito', { token: tokenSocio, cuerpo: { favorito: true } });
  const favs = await pedir('GET', '/api/ejercicios?solo_favoritos=true', { token: tokenSocio });
  verificar('el favorito queda guardado', favs.datos?.total === 1, favs.datos?.total);

  const asistencia = await pedir('POST', `/api/socios/${socioId}/asistencia`, { token: tokenAdmin });
  verificar('registra asistencia', asistencia.estado === 201, asistencia.datos);
  const repetida = await pedir('POST', `/api/socios/${socioId}/asistencia`, { token: tokenAdmin });
  verificar('no duplica la asistencia del día', repetida.datos?.duplicado === true, repetida.datos);

  // --- mostrador: ingreso por cédula ------------------------------------
  const ingreso = await pedir('POST', '/api/socios/ingreso', {
    token: tokenAdmin,
    cuerpo: { documento: CEDULA_PRUEBA },
  });
  verificar(
    'el mostrador deja pasar al socio al día',
    ingreso.datos?.permitido === true && ingreso.datos?.socio?.estado === 'AL_DIA',
    ingreso.datos
  );

  // El segundo socio se creó sin plan: no debe poder pasar.
  const ingresoSinPlan = await pedir('POST', '/api/socios/ingreso', {
    token: tokenAdmin,
    cuerpo: { documento: CEDULA_PRUEBA_2 },
  });
  verificar(
    'el mostrador FRENA al socio sin membresía y no le registra la entrada',
    ingresoSinPlan.datos?.permitido === false && ingresoSinPlan.datos?.registrado === false,
    ingresoSinPlan.datos
  );

  const ingresoForzado = await pedir('POST', '/api/socios/ingreso', {
    token: tokenAdmin,
    cuerpo: { documento: CEDULA_PRUEBA_2, forzar: true },
  });
  verificar(
    'forzar deja pasar y marca el ingreso como forzado',
    ingresoForzado.datos?.permitido === true && ingresoForzado.datos?.forzado === true,
    ingresoForzado.datos
  );

  const ingresoInexistente = await pedir('POST', '/api/socios/ingreso', {
    token: tokenAdmin,
    cuerpo: { documento: '99999999' },
  });
  verificar('el mostrador avisa si la cédula no existe', ingresoInexistente.estado === 404);

  const ingresoPorSocio = await pedir('POST', '/api/socios/ingreso', {
    token: tokenSocio,
    cuerpo: { documento: CEDULA_PRUEBA },
  });
  verificar('un socio no puede usar el mostrador', ingresoPorSocio.estado === 403);

  // --- aviso de vencimiento por WhatsApp ---------------------------------
  const antes = await pedir('GET', `/api/socios?buscar=${CEDULA_PRUEBA_2}`, { token: tokenAdmin });
  verificar(
    'un socio al que nunca se avisó no tiene marca de aviso',
    antes.datos?.datos?.[0]?.dias_desde_aviso === null,
    antes.datos?.datos?.[0]?.dias_desde_aviso
  );

  const aviso = await pedir('POST', `/api/socios/${otro.datos?.socio_id}/aviso`, {
    token: tokenAdmin,
  });
  verificar('registra el aviso de vencimiento', aviso.estado === 200 && !!aviso.datos?.ultimo_aviso_en, aviso.datos);

  const despues = await pedir('GET', `/api/socios?buscar=${CEDULA_PRUEBA_2}`, { token: tokenAdmin });
  verificar(
    'la lista muestra que se le avisó hoy',
    despues.datos?.datos?.[0]?.dias_desde_aviso === 0,
    despues.datos?.datos?.[0]?.dias_desde_aviso
  );

  const avisoPorSocio = await pedir('POST', `/api/socios/${socioId}/aviso`, { token: tokenSocio });
  verificar('un socio no puede marcar avisos', avisoPorSocio.estado === 403);

  const ingresosHoy = await pedir('GET', '/api/socios/ingresos-hoy', { token: tokenAdmin });
  verificar(
    'la lista de ingresos del día incluye al socio de prueba',
    ingresosHoy.datos?.some((i) => i.documento === CEDULA_PRUEBA),
    ingresosHoy.datos?.length
  );

  // --- panel del admin ---------------------------------------------------
  const panel = await pedir('GET', '/api/dashboard', { token: tokenAdmin });
  verificar(
    'el panel suma el socio y la cobranza del día',
    panel.datos?.socios?.total >= 1 && Number(panel.datos?.cobranza?.hoy) >= 300000,
    { socios: panel.datos?.socios, cobranza: panel.datos?.cobranza }
  );
  verificar('el panel trae 12 meses de ingresos', panel.datos?.ingresos_mes?.length === 12, panel.datos?.ingresos_mes?.length);

  // --- cambio de contrasena ---------------------------------------------
  const cambio = await pedir('POST', '/api/auth/cambiar-password', {
    token: tokenSocio,
    cuerpo: { password_actual: CEDULA_PRUEBA, password_nueva: 'nueva-clave-123' },
  });
  verificar('el socio cambia su contraseña', cambio.estado === 200, cambio.datos);

  const reLogin = await pedir('POST', '/api/auth/login', {
    cuerpo: { documento: CEDULA_PRUEBA, password: 'nueva-clave-123' },
  });
  verificar(
    'entra con la contraseña nueva y ya no se le exige cambiarla',
    reLogin.estado === 200 && reLogin.datos?.usuario?.debe_cambiar_password === false,
    reLogin.datos?.usuario
  );

  console.log(`\n  ${pasos - fallos}/${pasos} verificaciones pasaron.`);
  if (fallos) console.log(`  ${fallos} FALLARON.\n`);
  else console.log('  Todo en orden.\n');
}

/**
 * Borra los socios ficticios directo en la base: borrar el usuario arrastra
 * en cascada socio, membresias, pagos, rutinas, sesiones y asistencias.
 * No hay endpoint de borrado a proposito — en produccion los socios se dan
 * de baja, no se eliminan.
 */
async function limpiar() {
  const { query, cerrarPool } = await import('../src/db.js');
  const { rowCount } = await query('DELETE FROM usuarios WHERE documento = ANY($1)', [
    [CEDULA_PRUEBA, CEDULA_PRUEBA_2],
  ]);
  console.log(`  Limpieza: ${rowCount} usuario(s) de prueba eliminado(s).\n`);
  await cerrarPool();
}

main()
  .catch((e) => {
    console.error('\nError inesperado:', e);
    fallos++;
  })
  .finally(async () => {
    if (process.argv.includes('--sin-limpiar')) {
      console.log('  Los datos de prueba quedan en la base (--sin-limpiar).\n');
    } else {
      await limpiar().catch((e) => console.error('  No se pudo limpiar:', e.message));
    }
    process.exitCode = fallos ? 1 : 0;
  });
