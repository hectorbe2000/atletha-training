-- =====================================================================
--  Catalogos: etiquetas en espanol para los valores del dataset (ingles)
--  y planes de membresia iniciales.
--  Idempotente: se puede volver a ejecutar sin duplicar.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Zonas del cuerpo (10 valores reales del dataset)
-- ---------------------------------------------------------------------
INSERT INTO terminos (tipo, valor, etiqueta, orden) VALUES
  ('BODY_PART', 'chest',       'Pecho',        10),
  ('BODY_PART', 'back',        'Espalda',      20),
  ('BODY_PART', 'shoulders',   'Hombros',      30),
  ('BODY_PART', 'upper arms',  'Brazos',       40),
  ('BODY_PART', 'lower arms',  'Antebrazos',   50),
  ('BODY_PART', 'waist',       'Abdomen',      60),
  ('BODY_PART', 'upper legs',  'Piernas',      70),
  ('BODY_PART', 'lower legs',  'Pantorrillas', 80),
  ('BODY_PART', 'neck',        'Cuello',       90),
  ('BODY_PART', 'cardio',      'Cardio',      100)
ON CONFLICT (tipo, valor) DO UPDATE SET etiqueta = EXCLUDED.etiqueta, orden = EXCLUDED.orden;

-- ---------------------------------------------------------------------
--  Equipamiento (28 valores reales del dataset)
-- ---------------------------------------------------------------------
INSERT INTO terminos (tipo, valor, etiqueta, orden) VALUES
  ('EQUIPO', 'body weight',           'Peso corporal',          10),
  ('EQUIPO', 'dumbbell',              'Mancuerna',              20),
  ('EQUIPO', 'barbell',               'Barra',                  30),
  ('EQUIPO', 'olympic barbell',       'Barra olimpica',         40),
  ('EQUIPO', 'ez barbell',            'Barra Z',                50),
  ('EQUIPO', 'trap bar',              'Barra hexagonal',        60),
  ('EQUIPO', 'cable',                 'Poleas',                 70),
  ('EQUIPO', 'leverage machine',      'Maquina de palanca',     80),
  ('EQUIPO', 'smith machine',         'Maquina Smith',          90),
  ('EQUIPO', 'hammer',                'Maquina Hammer',        100),
  ('EQUIPO', 'sled machine',          'Trineo',                110),
  ('EQUIPO', 'kettlebell',            'Kettlebell',            120),
  ('EQUIPO', 'medicine ball',         'Balon medicinal',       130),
  ('EQUIPO', 'stability ball',        'Pelota de estabilidad', 140),
  ('EQUIPO', 'bosu ball',             'Bosu',                  150),
  ('EQUIPO', 'band',                  'Banda',                 160),
  ('EQUIPO', 'resistance band',       'Banda elastica',        170),
  ('EQUIPO', 'rope',                  'Cuerda',                180),
  ('EQUIPO', 'roller',                'Rodillo',               190),
  ('EQUIPO', 'wheel roller',          'Rueda abdominal',       200),
  ('EQUIPO', 'weighted',              'Con lastre',            210),
  ('EQUIPO', 'assisted',              'Asistido',              220),
  ('EQUIPO', 'tire',                  'Neumatico',             230),
  ('EQUIPO', 'stationary bike',       'Bicicleta fija',        240),
  ('EQUIPO', 'elliptical machine',    'Eliptica',              250),
  ('EQUIPO', 'stepmill machine',      'Escaladora',            260),
  ('EQUIPO', 'skierg machine',        'SkiErg',                270),
  ('EQUIPO', 'upper body ergometer',  'Ergometro de brazos',   280)
ON CONFLICT (tipo, valor) DO UPDATE SET etiqueta = EXCLUDED.etiqueta, orden = EXCLUDED.orden;

-- ---------------------------------------------------------------------
--  Musculos: union de los valores de target (19) y muscle_group (29)
-- ---------------------------------------------------------------------
INSERT INTO terminos (tipo, valor, etiqueta, orden) VALUES
  ('MUSCULO', 'pectorals',             'Pectorales',                  10),
  ('MUSCULO', 'chest',                 'Pecho',                       11),
  ('MUSCULO', 'serratus anterior',     'Serrato anterior',            12),
  ('MUSCULO', 'lats',                  'Dorsales',                    20),
  ('MUSCULO', 'latissimus dorsi',      'Dorsal ancho',                21),
  ('MUSCULO', 'upper back',            'Espalda alta',                22),
  ('MUSCULO', 'lower back',            'Espalda baja',                23),
  ('MUSCULO', 'rhomboids',             'Romboides',                   24),
  ('MUSCULO', 'traps',                 'Trapecios',                   25),
  ('MUSCULO', 'trapezius',             'Trapecio',                    26),
  ('MUSCULO', 'spine',                 'Columna',                     27),
  ('MUSCULO', 'delts',                 'Deltoides',                   30),
  ('MUSCULO', 'deltoids',              'Deltoides',                   31),
  ('MUSCULO', 'shoulders',             'Hombros',                     32),
  ('MUSCULO', 'rotator cuff',          'Manguito rotador',            33),
  ('MUSCULO', 'levator scapulae',      'Elevador de la escapula',     34),
  ('MUSCULO', 'biceps',                'Biceps',                      40),
  ('MUSCULO', 'triceps',               'Triceps',                     41),
  ('MUSCULO', 'forearms',              'Antebrazos',                  42),
  ('MUSCULO', 'wrist extensors',       'Extensores de muneca',        43),
  ('MUSCULO', 'wrist flexors',         'Flexores de muneca',          44),
  ('MUSCULO', 'wrists',                'Munecas',                     45),
  ('MUSCULO', 'hands',                 'Manos',                       46),
  ('MUSCULO', 'abs',                   'Abdominales',                 50),
  ('MUSCULO', 'abdominals',            'Abdominales',                 51),
  ('MUSCULO', 'obliques',              'Oblicuos',                    52),
  ('MUSCULO', 'core',                  'Core',                        53),
  ('MUSCULO', 'quads',                 'Cuadriceps',                  60),
  ('MUSCULO', 'quadriceps',            'Cuadriceps',                  61),
  ('MUSCULO', 'hamstrings',            'Isquiotibiales',              62),
  ('MUSCULO', 'glutes',                'Gluteos',                     63),
  ('MUSCULO', 'adductors',             'Aductores',                   64),
  ('MUSCULO', 'abductors',             'Abductores',                  65),
  ('MUSCULO', 'hip flexors',           'Flexores de cadera',          66),
  ('MUSCULO', 'calves',                'Pantorrillas',                70),
  ('MUSCULO', 'soleus',                'Soleo',                       71),
  ('MUSCULO', 'ankles',                'Tobillos',                    72),
  ('MUSCULO', 'ankle stabilizers',     'Estabilizadores del tobillo', 73),
  ('MUSCULO', 'cardiovascular system', 'Sistema cardiovascular',      80)
ON CONFLICT (tipo, valor) DO UPDATE SET etiqueta = EXCLUDED.etiqueta, orden = EXCLUDED.orden;

-- ---------------------------------------------------------------------
--  Planes de membresia (precios de ejemplo en Gs. — ajustar al gimnasio)
-- ---------------------------------------------------------------------
INSERT INTO planes (nombre, descripcion, duracion_dias, precio) VALUES
  ('Pase diario', 'Acceso por un dia',                        1,   25000),
  ('Mensual',     'Acceso libre por 30 dias',                30,  150000),
  ('Trimestral',  'Acceso libre por 3 meses',                90,  400000),
  ('Semestral',   'Acceso libre por 6 meses',               180,  750000),
  ('Anual',       'Acceso libre por 12 meses',              365, 1400000)
ON CONFLICT (nombre) DO NOTHING;
