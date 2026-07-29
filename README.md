# Sistema de Gimnasio

Gestión de socios, cobros y rutinas, con una guía de 1.324 ejercicios (GIF + instrucciones
en 10 idiomas) tomada del dataset que está en la carpeta hermana `exercises-dataset-main/`.

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
npm run prueba            # 84 verificaciones de punta a punta; limpia lo que crea
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
│   ├── scripts/
│   │   ├── import-ejercicios.js
│   │   ├── crear-admin.js
│   │   ├── datos-demo.js
│   │   └── prueba-humo.js
│   └── src/
│       ├── config.js  db.js  http.js  index.js
│       ├── middleware/auth.js
│       └── rutas/              auth · socios · planes · ejercicios · rutinas ·
│                               entrenamiento · dashboard
├── client/                     React + Vite + Tailwind
│   └── src/
│       ├── api.js  auth.jsx  hooks.js
│       ├── componentes/        Layout · CardEjercicio · graficos · ui
│       └── paginas/            socio/ y admin/
└── prototipos/                 exploración de diseño de la card del catálogo
```

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

El flujo del socio es incremental, no hay que planificar la semana antes de empezar: en el
catálogo, cada ejercicio tiene un **+** que abre el selector de rutina y día. Si todavía no
tiene ninguna rutina propia, el mismo modal la crea con ese ejercicio adentro.

**El peso y las medidas son del socio, no de la sesión.** `mediciones` guarda peso, grasa y
seis circunferencias, una fila por día (si se corrige, se pisa la del día). La altura vive en
`socios.altura_cm` porque es un dato de la persona. La vista `v_mediciones` calcula el IMC,
su categoría y la variación contra la medición anterior y contra la primera — todo en la
base, no en el frontend. Se ve en Progreso (socio) y en la ficha (administrador).

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

**La pantalla de Ingreso es la que vive abierta en el mostrador.** Se escribe la cédula,
Enter, y en letras grandes aparece quién es y si puede pasar; la asistencia queda registrada
en la misma acción y el foco vuelve solo al campo para el siguiente. A un socio vencido
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

**El login es la cédula.** Al crear un socio, su contraseña inicial es su propia cédula y
el sistema lo obliga a cambiarla la primera vez que entra. El admin puede reiniciarla desde
la ficha del socio.

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

Las 1.324 animaciones y miniaturas son propiedad de [Gym visual](https://gymvisual.com/) y
llegan desde el dataset de la carpeta hermana. Revisá `exercises-dataset-main/LICENSE` y
`NOTICE.md` antes de publicar este sistema fuera de la red del gimnasio.
