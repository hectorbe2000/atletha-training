-- =====================================================================
--  Sinónimos de búsqueda.
--
--  La etiqueta que se muestra es una sola ("Pantorrillas"), pero el socio
--  escribe la que usa en el gimnasio ("gemelos"). Sin esto, buscar "gemelos"
--  devolvía 8 resultados de ~50.
--
--  Para agregar más: UPDATE terminos SET sinonimos = sinonimos || '{palabra}'
--  WHERE tipo = '...' AND valor = '...';
-- =====================================================================

ALTER TABLE terminos ADD COLUMN IF NOT EXISTS sinonimos text[] NOT NULL DEFAULT '{}';

-- ---------------------------------------------------------------------
--  Músculos
-- ---------------------------------------------------------------------
UPDATE terminos SET sinonimos = s.lista FROM (VALUES
  ('calves',                '{gemelos,gemelo,pantorrilla,soleo}'::text[]),
  ('soleus',                '{gemelos,soleo}'),
  ('glutes',                '{gluteos,cola,cadera,pompis}'),
  ('hamstrings',            '{femoral,femorales,isquios,isquiotibial}'),
  ('quads',                 '{cuadriceps,cuadricep,muslo,muslos,pierna}'),
  ('quadriceps',            '{cuadriceps,muslo,muslos,pierna}'),
  ('lats',                  '{dorsal,dorsal ancho,espalda,lats,alas}'),
  ('latissimus dorsi',      '{dorsal,dorsales,espalda,alas}'),
  ('pectorals',             '{pecho,pectoral,pectorales,pechos}'),
  ('chest',                 '{pectoral,pectorales,pecho}'),
  ('delts',                 '{hombro,hombros,deltoide}'),
  ('deltoids',              '{hombro,hombros,deltoide}'),
  ('abs',                   '{abdomen,abdominal,abs,core,panza,cuadritos}'),
  ('abdominals',            '{abdomen,abs,core,panza}'),
  ('obliques',              '{oblicuo,cintura,flancos}'),
  ('traps',                 '{trapecio,cuello}'),
  ('trapezius',             '{trapecios,cuello}'),
  ('biceps',                '{bicep,biceps,brazo}'),
  ('triceps',               '{tricep,triceps,brazo}'),
  ('forearms',              '{antebrazo,antebrazos,muneca}'),
  ('upper back',            '{espalda,espalda alta,dorsal}'),
  ('lower back',            '{lumbar,lumbares,espalda baja,cintura}'),
  ('spine',                 '{lumbar,columna,espalda}'),
  ('adductors',             '{aductor,aductores,muslo interno}'),
  ('abductors',             '{abductor,abductores,cadera}'),
  ('cardiovascular system', '{cardio,aerobico,resistencia,corazon}')
) AS s(valor, lista)
WHERE terminos.tipo = 'MUSCULO' AND terminos.valor = s.valor;

-- ---------------------------------------------------------------------
--  Zonas del cuerpo
-- ---------------------------------------------------------------------
UPDATE terminos SET sinonimos = s.lista FROM (VALUES
  ('chest',      '{pectoral,pectorales,pechos}'::text[]),
  ('back',       '{dorsal,dorsales,lumbar,espaldas}'),
  ('shoulders',  '{hombro,deltoides,deltoide}'),
  ('upper arms', '{brazo,biceps,triceps}'),
  ('lower arms', '{antebrazo,muneca,munecas}'),
  ('waist',      '{abdomen,abdominales,abs,core,cintura,oblicuos,panza}'),
  ('upper legs', '{pierna,cuadriceps,femoral,isquiotibiales,gluteos,muslo}'),
  ('lower legs', '{gemelos,pantorrilla,soleo,tobillo}'),
  ('neck',       '{cervical,trapecio}'),
  ('cardio',     '{aerobico,resistencia,quemar,cinta,bicicleta}')
) AS s(valor, lista)
WHERE terminos.tipo = 'BODY_PART' AND terminos.valor = s.valor;

-- ---------------------------------------------------------------------
--  Equipamiento
-- ---------------------------------------------------------------------
UPDATE terminos SET sinonimos = s.lista FROM (VALUES
  ('smith machine',    '{smith,multipower,jaula}'::text[]),
  ('cable',            '{cables,poleas,polea,cruce}'),
  ('dumbbell',         '{mancuernas,pesas,pesa,manuelas}'),
  ('barbell',          '{barras,pesa libre}'),
  ('olympic barbell',  '{barra olimpica,barras}'),
  ('ez barbell',       '{barra z,barra w,zeta}'),
  ('body weight',      '{sin equipo,calistenia,peso del cuerpo,libre}'),
  ('resistance band',  '{banda,liga,ligas,elastico,gomas}'),
  ('band',             '{liga,ligas,elastico,gomas}'),
  ('leverage machine', '{maquina,maquinas,aparato}'),
  ('kettlebell',       '{pesa rusa,rusa}'),
  ('stability ball',   '{pelota,pelota suiza,fitball,esferodinamia}'),
  ('medicine ball',    '{balon,pelota medicinal}'),
  ('wheel roller',     '{rueda,rueda abdominal,ab wheel}'),
  ('assisted',         '{asistido,con ayuda,ayuda}'),
  ('stationary bike',  '{bici,bicicleta,spinning}'),
  ('elliptical machine','{eliptica,orbitrek}')
) AS s(valor, lista)
WHERE terminos.tipo = 'EQUIPO' AND terminos.valor = s.valor;

-- Índice para que la búsqueda por sinónimo no recorra toda la tabla.
CREATE INDEX IF NOT EXISTS ix_terminos_sinonimos ON terminos USING gin (sinonimos);
