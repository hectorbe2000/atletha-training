# Atletha Training — sistema de gestión

Gestión de socios, cobros y rutinas del gimnasio, con una guía de 1.324 ejercicios
(GIF + instrucciones en 10 idiomas).

Dos tipos de usuario:

- **Socio** — entra con su número de cédula. Ve su membresía, el catálogo de ejercicios,
  las rutinas que le armó el profe, registra sus entrenamientos y mira su progreso.
- **Administrador** — da de alta socios, cobra y renueva membresías, arma rutinas,
  registra asistencias y ve el panel con los números del día.

---

## Puesta en marcha

Requiere **Node ≥ 18** (probado con 20.19.0) y **PostgreSQL 16** corriendo.

```bash
cd gym
npm run instalar          # dependencias de server/ y client/
cp .env.example .env      # completar credenciales de PostgreSQL
npm run migrar            # crea el esquema (idempotente)
npm run importar          # carga los 1324 ejercicios + 13240 instrucciones
npm run crear:admin -- --documento 1234567 --nombre Ana --apellido López
npm run plantillas        # 3 plantillas de rutina para arrancar (opcional)
```

Sin `--password`, el script genera una aleatoria y la imprime una sola vez.

### Uso diario en el gimnasio

```bash
npm run build             # compila el frontend (solo cuando cambia el código)
npm start                 # un solo proceso sirve API + web + imágenes
```

Queda en `http://localhost:4100` y en `http://<ip-de-la-PC>:4100` — los socios entran
desde el celular conectados al WiFi del gimnasio. La IP la imprime el servidor al arrancar.

> **Firewall de Windows:** la primera vez hay que permitir el puerto para que otros
> equipos de la red lleguen:
> ```powershell
> New-NetFirewallRule -DisplayName "Gimnasio" -Direction Inbound -LocalPort 4100 -Protocol TCP -Action Allow
> ```

### Desarrollo

Dos terminales:

```bash
npm run api               # Express con recarga automática, puerto 4100
npm run web               # Vite, puerto 5173, con proxy a la API
```

### Datos de prueba

```bash
npm run demo              # 8 socios en los 4 estados de membresía, con rutinas,
                          # 35 entrenamientos y asistencias de 10 semanas
npm run demo:borrar       # los elimina (todos tienen cédula 88xxxxx)
```

Los socios de demo entran con su cédula y la contraseña `demo1234`.

### Prueba de humo

Con el servidor levantado:

```bash
npm run prueba            # 119 verificaciones de punta a punta; limpia lo que crea
```

---

## Respaldo de la base

**Esto es lo más importante de todo el README.** Si se rompe el disco de la PC del
gimnasio, sin respaldo perdés socios, pagos e historial de entrenamientos.

```bash
npm run respaldar                     # copia comprimida a gym/respaldos/
npm run respaldar -- --destino D:\    # a un pendrive u otra unidad
npm run respaldos                     # lista las copias que hay
```

Usa `pg_dump` en formato comprimido y conserva las últimas 30 copias, borrando las más
viejas. Una copia de la base completa pesa unos 2,4 MB.

> Un respaldo en el mismo disco **no te salva de que se rompa el disco**. Apuntá
> `--destino` a un pendrive, a otra máquina de la red o a una carpeta de Drive/OneDrive.

### Automatizarlo

Una vez por día a las 23:00, con PowerShell **como administrador**:

```powershell
schtasks /Create /SC DAILY /ST 23:00 /TN "Respaldo Gimnasio" `
  /TR "cmd /c cd /d C:\Users\Claud\Videos\exercises-dataset-main\gym && npm run respaldar" /F
```

Para comprobar que quedó programada: `schtasks /Query /TN "Respaldo Gimnasio"`.

### Restaurar

```bash
pg_restore -U postgres -d gym --clean --if-exists "ruta\del\respaldo.dump"
```

El propio script te imprime esta línea con la ruta completa cada vez que corre.
**Probá una restauración de vez en cuando**: un respaldo que nunca restauraste no es un
respaldo. Podés hacerlo sin riesgo contra una base descartable:

```bash
psql -U postgres -c "CREATE DATABASE gym_prueba;"
pg_restore -U postgres -d gym_prueba --no-owner "ruta\del\respaldo.dump"
psql -U postgres -d gym_prueba -c "select count(*) from socios;"
psql -U postgres -c "DROP DATABASE gym_prueba;"
```

---

## Estructura

```
gym/
├── server/                     API Express + PostgreSQL
│   ├── db/
│   │   ├── migrate.js          corredor de migraciones (tabla _migraciones)
│   │   └── migrations/         001 esquema · 002 catálogos · 003 nombre_es
│   ├── assets/logo.png         el que sale en el comprobante
│   ├── scripts/
│   │   ├── import-ejercicios.js
│   │   ├── crear-admin.js
│   │   ├── datos-demo.js
│   │   └── prueba-humo.js
│   └── src/
│       ├── config.js  db.js  http.js  index.js
│       ├── comprobante.js      el PDF del pago · planilla.js  el CSV para Excel
│       ├── middleware/auth.js
│       └── rutas/              auth · socios · planes · pagos · ejercicios ·
│                               rutinas · entrenamiento · dashboard
├── client/                     React + Vite + Tailwind
│   └── src/
│       ├── api.js  auth.jsx  hooks.js  marca.js
│       ├── componentes/        Layout · CardEjercicio · graficos · ui
│       └── paginas/            socio/ y admin/
└── media/                      fotos y GIF de los ejercicios (no van al repo)
    ├── images/  videos/        1324 de cada uno
    ├── exercises.json          solo para "npm run importar"
    └── LICENSE  NOTICE.md      atribución de las animaciones
```

Todo lo que el sistema necesita está adentro de `gym/`. Antes las imágenes vivían en una
carpeta hermana —la del repositorio de donde salió el catálogo— y el servidor no arrancaba si
no la encontraba; ahora mover el sistema de PC es copiar una sola carpeta.

---

## Decisiones que conviene conocer

**Se instala como app en el celular.** Es una PWA: el socio entra desde el navegador, elige
"Agregar a pantalla de inicio" y queda con su ícono, a pantalla completa y sin la barra del
navegador. El *service worker* (`client/public/sw.js`) cachea la app y las miniaturas, pero
**nunca los datos**: mostrar una membresía vencida como vigente sería peor que no mostrar
nada. Los GIF tampoco se cachean, por peso.

**Las plantillas se copian, no se enlazan.** Armás una rutina base en Plantillas y la asignás
a cualquier socio en dos toques. Al asignarla, la función `fn_asignar_plantilla` copia días y
ejercicios a una rutina nueva dentro de una sola transacción; desde ahí son independientes,
así que ajustarle los pesos a alguien no le cambia la rutina a los demás, y editar la
plantilla no toca lo ya asignado.

**La foto del socio se achica en el navegador.** Se recorta cuadrada y se reduce a 512 px
antes de subirla: la foto de un celular pesa 3-5 MB y no tiene sentido mandar eso por el WiFi
del gimnasio ni instalar dependencias nativas de imagen en el servidor. Se guarda en
`gym/uploads/socios/` (ignorada por git) y al reemplazarla se borra la anterior. Donde más
sirve es en el mostrador: ver la cara evita que se presten la cédula.

**Hay dos clases de rutina y el sistema las distingue.** Las que arma el administrador
(`origen = 'PROFE'`) el socio las ve y las entrena, pero **no las puede editar**: si pudiera,
el profe no tendría forma de saber qué prescribió. Las que se arma el socio
(`origen = 'SOCIO'`) son suyas y las maneja entero. El administrador puede con las dos.

De quién es una rutina lo decide el servidor, no el cuerpo del pedido: el `socio_id` que viaja
en el `PUT` solo lo obedece un administrador. Para un socio se ignora y manda el dueño real,
porque si no podía mandar el `PUT` de su propia rutina con el id de otro y escribírsela en la
cuenta ajena.

El flujo del socio es incremental, no hay que planificar la semana antes de empezar: en el
catálogo, cada ejercicio tiene un **+** que abre el selector de rutina y día. Si todavía no
tiene ninguna rutina propia, el mismo modal la crea con ese ejercicio adentro.

**El peso y las medidas son del socio, no de la sesión.** `mediciones` guarda el peso y
seis circunferencias, una fila por día (si se corrige, se pisa la del día). La altura vive en
`socios.altura_cm` porque es un dato de la persona. La vista `v_mediciones` calcula el IMC,
su categoría y la variación contra la medición anterior y contra la primera — todo en la
base, no en el frontend. Se ve en Progreso (socio) y en la ficha (administrador).

La **grasa corporal** salió del formulario: el gimnasio no tiene con qué medirla y un campo que
nadie completa es ruido. La columna sigue en la base —tirarla obligaría a rehacer la
restricción y la vista, y se perdería lo ya cargado— pero la aplicación no la escribe ni la
muestra.

**El aviso de vencimiento sale por WhatsApp desde el navegador.** No hay API ni token de
Meta: el botón arma un enlace `wa.me` con el mensaje ya escrito y abre la app del celular o
WhatsApp Web en la PC; el administrador revisa el texto y toca enviar. Está en el panel
(listas de vencidos y por vencer), en el listado de socios, en la ficha y en la pantalla de
Ingreso cuando alguien no puede pasar.

El teléfono se normaliza a formato internacional aceptando lo que la gente escribe de verdad
(`0981 111 001`, `(0983) 456 789`, `+595 981 111 001`); si el número no da para ser un celular,
el botón queda deshabilitado y dice por qué. El código de país por defecto es `595` y está en
`client/src/whatsapp.js`, junto con **el nombre del gimnasio y las plantillas de los mensajes**
— cambialos ahí.

Al usar el botón se guarda la fecha en `socios.ultimo_aviso_en` y la lista muestra "avisado
hace 2 días". Sin eso, al día siguiente el mostrador vuelve a abrir la misma lista y le escribe
a los mismos.

**El panel muestra a los que dejaron de venir, no solo a los que deben.** Cuando un socio
aparece en "vencidos" ya decidió no volver: dejó de venir tres semanas antes y hasta ahora era
invisible porque figuraba `AL_DIA`. La lista **Dejaron de venir** son los que están al día y
pagando pero hace 10, 15, 21 o 30 días que no aparecen — se elige el corte en la misma
pantalla. Ordena por vencimiento: primero el que además está por vencérsele el plan.

El mensaje de WhatsApp es otro, a propósito: no le habla de plata —todavía está al día—, le
pregunta cómo anda. Se anota en `socios.ultimo_aviso_ausencia_en`, que es una columna aparte
de `ultimo_aviso_en`: son dos conversaciones distintas y haberle escrito por una no tiene que
tapar la otra.

**Los cumpleaños salen del dato que ya se cargaba.** `fecha_nacimiento` estaba en el alta y no
se usaba para nada. El panel muestra quién cumple hoy y en los próximos 7 días, con el botón
para saludar. El saludo no se registra: no hay riesgo de mandarlo dos veces. A los del 29 de
febrero se los saluda el 28 en los años que no son bisiestos.

**El comprobante de pago sale en PDF, con el logo.** Lleva los datos del gimnasio, el socio,
el plan, el período, el método de pago y el importe en números y en letras (`Son: Guaraníes
doscientos cincuenta mil`), que es lo que evita que a un 150.000 le agreguen un cero.

Se baja desde **tres** lugares, a propósito:

1. Apenas se termina de cobrar.
2. En la ficha del socio, uno por cada pago.
3. En el listado de socios, al lado del botón de WhatsApp: baja el del último cobro.

El tercero es el que importa: si en el mostrador se olvidaron de bajarlo en el momento, no hay
que rehacer nada ni entrar a buscar la ficha.

Se **descarga**, no se abre en una pestaña. Abrirla no era confiable: `window.open` después de
un `await` ya no cuenta como gesto del usuario y el bloqueador de emergentes se la comía, con
lo cual el botón parecía no hacer nada. Bajado sirve igual para imprimirlo y para adjuntarlo.

**El número de comprobante lo genera el sistema, no el mostrador.** Sale de `pagos.id`, que es
un `serial PRIMARY KEY`: nunca se repite, ni siquiera si se borra un pago, y no hay forma de
cargarlo a mano. Se muestra apenas se cobra (`Comprobante N.º 0000042`) y en el historial de
pagos de la ficha.

Antes el formulario de cobro tenía un campo "Comprobante" con el marcador *"N.º de recibo"*,
que invitaba a escribir a mano un número que el sistema ya generaba — y dos cobros podían
terminar con el mismo. Ahora ese campo se llama **N.º de operación**, es opcional, y solo
aparece cuando el método no es efectivo: es el número que da el banco o la billetera, para
cruzar con el extracto. **No se imprime** en el comprobante —es conciliación interna, no algo
que le sirva al socio— pero sale en la planilla de cobros.

> **No es una factura legal.** El propio PDF lo aclara en el pie. Es el papel que el socio se
> lleva, no un documento tributario.

Se arma con `pdfkit`, que es JavaScript puro: no hay que instalar nada nativo en la PC del
gimnasio. **Los datos que dejes vacíos no se imprimen**: mejor una línea menos que un
"Av. Ejemplo 123" de relleno en algo que ve el socio.

### Si cambia el nombre, la dirección o el logo

No hay un único lugar porque el comprobante lo arma el servidor, el título de la pestaña se
resuelve antes de que arranque React y el logo lo necesitan los dos lados:

| Qué | Dónde |
|---|---|
| Nombre, dirección y teléfono del comprobante | `GYM_NOMBRE`, `GYM_DIRECCION`, `GYM_TELEFONO` en `gym/.env` |
| Nombre en la app (barra superior, login, mensajes de WhatsApp) | `client/src/marca.js` |
| Título de la pestaña | `client/index.html` |
| Nombre de la app instalada en el celular | `client/public/manifest.webmanifest` |
| Logo del comprobante | `server/assets/logo.png` |
| Logo de la app | `client/public/logo.png` |
| Foto de fondo del login | `client/src/assets/fondo-login.jpg` |

Los íconos de la PWA (`icono-192.png`, `icono-512.png`, `icono-512-mask.png`) siguen siendo los
originales: para rehacerlos desde el logo hay que recortarlos a mano, el `maskable` con margen
para que el sistema no le coma los bordes al recortarlo en círculo.

**El login tiene la foto del gimnasio de fondo.** Se importa desde `src/` y no desde
`public/` para que Vite le ponga hash y la deje en `/assets/`, que es lo único que el service
worker cachea: así se baja una sola vez y no en cada visita. Encima lleva un velo oscuro, sin
el cual los focos rojos de la foto pelean con el formulario.

La imagen original era un PNG de 2 MB con el logo incrustado a la izquierda. Se recortó esa
franja —en el login el logo ya va en el centro, no hacen falta dos— y se pasó a JPG: quedó en
**166 KB**, doce veces más liviana, que sobre el WiFi del gimnasio es la diferencia entre que
la pantalla de entrada aparezca al toque o después de unos segundos en blanco.

> Donde el texto dice "el gimnasio" como sustantivo común —"las rutinas activas del gimnasio",
> "veces que pasaste por el gimnasio"— se deja así a propósito: reemplazarlo por el nombre
> propio queda forzado.

**Las planillas se bajan en CSV, no en .xlsx.** Excel las abre con doble clic igual y no hace
falta una dependencia para generar un formato binario que nadie va a editar a mano. Dos
detalles hacen que se abran bien y no como una sola columna ilegible: **BOM UTF-8** al
principio (si no, Excel muestra `MarÃ­a`) y **separador `;`** (en configuración regional
española la coma es el separador decimal).

- **Socios** — desde el listado. Baja todos, no la página que estás viendo, con plan, estado,
  vencimiento, última asistencia y asistencias del mes.
- **Cobros** — desde el panel, por rango de fechas; arranca en el primero del mes en curso.
  El monto va sin separador de miles y con coma decimal, así Excel lo toma como número y se
  puede sumar la columna, que es para lo que se baja.

**El control de acceso está armado, pero el molinete todavía no.** El sistema ya hace todo el
recorrido —huella → buscar socio → decidir → abrir o negar → registrar— contra un molinete
**simulado**. Lo único que falta es el módulo que habla con el equipo Actuar, y está aislado en
un solo archivo: `server/src/acceso/adaptadores/actuar.js`.

Ese archivo está deliberadamente vacío, con la lista de lo que hay que pedirle al fabricante.
No se inventaron comandos, ni velocidad de puerto, ni identificadores USB, ni el significado de
los 4 pines: un adaptador que parece terminado y no anda es peor que uno que avisa que falta, y
mandar bytes adivinados a un equipo que controla una puerta no es una opción.

Cuál se usa lo decide `MOLINETE` en `gym/.env`:

| valor | qué hace |
|---|---|
| `simulado` (por defecto) | sin hardware; la pantalla puede disparar lecturas de prueba |
| `actuar` | el equipo real, cuando su adaptador esté completo |
| `ninguno` | control de acceso apagado |

Si el molinete no arranca, **el resto del sistema sigue funcionando**: se ve el error en el
arranque y el mostrador registra ingresos a mano como siempre. Una puerta que no abre no puede
dejar al gimnasio sin poder cobrar. Y mientras el adaptador esté sin implementar, la orden de
apertura *lanza* en vez de fallar en silencio: es preferible que la puerta no abra y quede el
error registrado, a que el sistema crea que abrió cuando no abrió.

**La regla de quién pasa es una sola.** Vive en `server/src/acceso/decision.js` y la usan el
molinete y el mostrador. Es una función pura —recibe una fila de `v_socios_estado`, devuelve la
decisión— así que se prueba sin hardware y sin base. Antes estaba adentro del endpoint del
mostrador; si el molinete hubiera traído su propia copia, tarde o temprano una iba a decir que
sí y la otra que no para el mismo socio, y eso se discute con el socio parado en la puerta.

**La huella no se guarda acá.** La plantilla queda adentro del equipo; en `socio_biometria` solo
se anota el identificador que el lector devuelve y a qué socio corresponde. Un dato biométrico
no tiene por qué estar en una base que se respalda a un pendrive. Un mismo identificador no
puede apuntar a dos socios —lo impide la base— porque eso haría que la puerta le abra a la
persona equivocada.

**`asistencias` y `accesos` son cosas distintas.** `asistencias` es una fila por socio y día
("vino hoy") y es lo que alimenta el panel y el progreso. `accesos` es la bitácora de la puerta:
cada intento, autorizado o rechazado, con su motivo y de dónde vino. Un socio vencido que apoya
el dedo tres veces deja tres filas en `accesos` y ninguna en `asistencias`.

**La pantalla de Ingreso es la consola de la puerta.** Vive abierta todo el día en el mostrador
y hace dos cosas a la vez: muestra en vivo lo que pasa en el molinete —autorizados y
rechazados, con el motivo— y deja resolver a mano lo que el lector no pudo.

La búsqueda acepta **cédula o nombre**. Si son solo dígitos, entra derecho: Enter y la
asistencia queda registrada, que es el camino rápido de todos los días. Si tiene letras, busca
por nombre y muestra las coincidencias para elegir. Con un nombre **siempre** se muestra la
lista, aunque haya una sola coincidencia: registrar la entrada automáticamente por un nombre
parcial es la forma de marcarle la asistencia a la persona equivocada.

El cartel grande muestra lo último que pasó por el molinete, salvo que el mostrador esté
consultando algo a mano, en cuyo caso manda esa consulta hasta que se toque "Siguiente".

**Avisa del cumpleaños.** Si al socio le falta una semana o menos, el cartel lo muestra; el
día es el mismo mostrador el que lo saluda. Más lejos que eso no se muestra: un "faltan 247
días" no le sirve a nadie y le saca lugar a lo que sí importa. `fn_proximo_cumple` corre el
29 de febrero al 28 en los años que no son bisiestos.

**"Dejar pasar" es para el que no es socio.** Una visita o un día de prueba no tienen huella
ni membresía, así que el molinete nunca los va a dejar entrar solo: lo autoriza el
administrador desde el mostrador, con el nombre de la persona. Queda en `accesos` con
`socio_id` nulo y el nombre en `visitante`, para poder responder después cuántos días de
prueba se dieron —y cuántos terminaron en una venta, que es lo que hace que valga la pena
registrarlos. A un socio vencido
**no le registra la entrada automáticamente**: muestra el aviso en rojo con el botón para
cobrarle, y "Dejar pasar igual" queda como una decisión explícita del administrador (el
ingreso se guarda marcado como forzado).

**La búsqueda del catálogo entiende cómo habla la gente.** Además del nombre del ejercicio
busca en las etiquetas de zona, equipo y músculo, y en una tabla de sinónimos: "gemelos"
encuentra las 70 de Pantorrillas, "multipower" las de máquina Smith, "liga" las de banda
elástica, "calistenia" las 325 de peso corporal. Los sinónimos están en la migración
`004_sinonimos.sql`; para agregar uno:

```sql
UPDATE terminos SET sinonimos = sinonimos || '{la-palabra}'
 WHERE tipo = 'MUSCULO' AND valor = 'calves';
```

**La pantalla de entrenar cuenta el descanso.** Al marcar una serie arranca la cuenta
regresiva con los segundos que el profe cargó en la rutina, con un pitido al terminar y
botones de +15s y "Listo". No se reinicia si el socio solo está corrigiendo una serie ya
cargada, y no aparece después de la última serie de un ejercicio. Ahí la miniatura es la
animación, no una foto: se toca y se agranda.

**El mostrador entra con nombre de usuario; el socio, con su cédula.** El socio escribe el
número que sabe de memoria y tiene en el bolsillo. Pero el mostrador es una cuenta del
gimnasio, no de una persona: pedirle una cédula a una cuenta que se llama `Atletha` no tenía
sentido, y el encabezado decía el nombre de quien la creó en vez del nombre del negocio.

El campo del login acepta las dos cosas y el servidor las distingue solo, porque un nombre de
usuario tiene que empezar con letra. Quien no tenga nombre de usuario sigue entrando con su
cédula: nadie quedó afuera por el cambio, y el administrador puede usar cualquiera de las dos.

```bash
npm run admin:acceso -- --documento 1234567 --usuario Atletha --password ...
npm run admin:acceso -- --usuario Atletha --password otra-clave
```

Cambiar la contraseña por ahí cierra las sesiones abiertas de esa cuenta.

**El usuario es la cédula; la contraseña la pone el administrador.** En el alta hay un campo
de contraseña obligatorio (mínimo 6 caracteres, con botón para mostrarla mientras se la
dicta). El socio entra con esa y la conserva; puede cambiarla cuando quiera, no se le exige.
Si se la olvida, se le escribe una nueva desde la ficha.

Antes, si no se mandaba contraseña, la inicial era **la propia cédula**: un dato que está a la
vista en el mostrador y que se puede adivinar, así que la cuenta quedaba abierta para cualquiera
hasta que el socio entrara por primera vez. La cédula ya no es contraseña de nada.

El servidor no devuelve nunca la contraseña en la respuesta del alta ni del reinicio: la acaba
de escribir el administrador y no tiene por qué quedar dando vueltas.

> Queda `usuarios.debe_cambiar_password` y el guardia que la hace cumplir: ningún alta la
> activa, pero puede venir de un socio cargado antes de este cambio. Mientras esté prendida,
> ese token entra a `/api/auth` y a nada más. Eso lo decide **la API**, no la pantalla — antes
> lo frenaba solo un `<Navigate>` del frontend y el token servía igual por afuera.

**Cambiar o reiniciar la contraseña cierra las demás sesiones.** El token no se podía revocar:
dar de baja a un socio o reiniciarle la contraseña no lo sacaba, seguía entrando hasta que el
token expirara (12 h). Ahora cada petición relee de la base si la cuenta sigue activa y compara
la marca de sesión que el token lleva adentro contra `usuarios.tokens_validos_desde`.

La marca va como dato propio del token y **no** se deduce de su `iat`: `iat` viene en segundos
enteros, así que dos revocaciones dentro del mismo segundo son indistinguibles y el token que
había que matar sobrevivía. Comparando por igualdad no hay ventana. Al que cambia su
contraseña se le devuelve un token nuevo, así que no se cae de la app; los demás dispositivos
quedan afuera.

**El freno al login es por equipo y por cédula.** Dos limitadores: 20 intentos cada 10 minutos
por IP y 10 por cédula. En los dos **solo cuentan los fallos**: la fuerza bruta son intentos
fallidos, y contar los aciertos deja afuera al mostrador, que abre sesión varias veces al día. Con uno solo por IP alcanzaba con
cambiar de dispositivo para seguir probando contra la misma cuenta. Y el servidor **no** confía
en `X-Forwarded-For` (`trust proxy` en `false`): escucha directo en la LAN, así que ese header
lo pone quien quiera. Si algún día se pone un proxy real adelante, hay que volver a activarlo.

**Las renovaciones se encadenan.** Si el socio renueva antes de vencer, el período nuevo
arranca al día siguiente del vencimiento vigente: no se regalan ni se pierden días. Una
restricción de exclusión en PostgreSQL (`ex_membresias_sin_solape`) impide cargar dos
períodos superpuestos, incluso si alguien lo intenta por SQL directo.

**Los nombres de los ejercicios se traducen acá, no vienen del dataset.** El dataset trae
las instrucciones en 10 idiomas pero los nombres solo en inglés. `scripts/traducir-nombres.js`
los reconstruye en español y los guarda en `ejercicios.nombre_es`; la UI muestra ese nombre y
la búsqueda cubre los dos idiomas.

No es traducción palabra por palabra: los nombres son formulaicos
(`[equipo] [postura] [modificadores] [movimiento]`) y en español ese orden se invierte con el
equipo al final —`dumbbell incline bench press` → `Press de banca inclinado con mancuernas`—.
El diccionario está en `scripts/diccionario-ejercicios.js`, dividido en las tablas que
alimentan cada parte de esa reconstrucción, más los adjetivos marcados con `{o}{s}` para que
concuerden en género y número (`press inclinado` pero `apertura inclinada`).

Para corregir un término, editá la tabla que corresponda y volvé a correr `npm run traducir`.
Es idempotente y **respeta los nombres que hayas corregido a mano** desde el panel; para
pisarlos hay que pasar `--rehacer`. Los ajustes de uno en uno conviene hacerlos desde la ficha
del ejercicio, con sesión de admin.

Cobertura actual: **1.237 de 1.324 nombres traducidos por completo (93 %)**. Los ~87 restantes
salen en español pero con alguna palabra suelta sin diccionario, casi siempre nombres propios
que en el gimnasio se dicen igual (`Muscle-up`, `Turkish get-up`, `Body-up`).

**La card del catálogo muestra el GIF, no una foto.** Con los nombres en inglés, la
animación es el único identificador que el socio reconoce sin traducir nada. Para que eso no
funda un celular viejo, un `IntersectionObserver` carga la animación solo mientras la card
está en pantalla, y `prefers-reduced-motion` la reemplaza por la foto fija.

**Los gráficos usan una paleta validada.** Tres slots categóricos verificados contra la
superficie real de la app (separación para daltonismo, contraste y banda de luminosidad).
El lima de la marca nunca se usa en datos: es color de acción. Cada gráfico tiene su vista
de tabla, así que ningún valor depende de pasar el mouse por encima.

**El 1RM es una estimación.** Se calcula con la fórmula de Epley (`peso × (1 + reps ÷ 30)`),
no es un máximo real medido.

**El puerto es 4100, no 4000.** En esta PC ya hay otra aplicación en el 4000 y Windows
permite que dos procesos escuchen el mismo puerto, con lo cual las peticiones terminan en el
servidor equivocado. El servidor avisa al arrancar si detecta algo ya respondiendo.

---

## Licencia de las imágenes

Las 1.324 animaciones y miniaturas son propiedad de [Gym visual](https://gymvisual.com/).
La licencia y el aviso de atribución viven junto a los archivos, en `gym/media/LICENSE` y
`gym/media/NOTICE.md`: revisalos antes de publicar este sistema fuera de la red del gimnasio.

---

## Créditos

Sistema desarrollado por **Minga Software** para Atletha Training.

Las 1.324 animaciones y miniaturas del catálogo son propiedad de
[Gym visual](https://gymvisual.com/); ver la sección de licencia más arriba.
