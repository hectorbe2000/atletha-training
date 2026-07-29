-- =====================================================================
--  Plantillas de rutina.
--
--  Armar cada rutina desde cero lleva diez minutos. Con plantillas el admin
--  elige una, elige el socio y la asigna: la plantilla se copia entera a una
--  rutina nueva y desde ahí se ajusta por socio sin tocar el original.
--
--  Son la misma estructura que una rutina pero sin dueño.
-- =====================================================================

CREATE TABLE IF NOT EXISTS plantillas (
  id              serial PRIMARY KEY,
  nombre          varchar(100) NOT NULL UNIQUE,
  descripcion     text,
  objetivo        varchar(80),
  nivel           varchar(20) CHECK (nivel IN ('PRINCIPIANTE', 'INTERMEDIO', 'AVANZADO')),
  activa          boolean     NOT NULL DEFAULT true,
  creado_por      integer     REFERENCES usuarios(id) ON DELETE SET NULL,
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER tg_plantillas_upd BEFORE UPDATE ON plantillas
  FOR EACH ROW EXECUTE FUNCTION fn_tocar_actualizado_en();

CREATE TABLE IF NOT EXISTS plantilla_dias (
  id           serial PRIMARY KEY,
  plantilla_id integer     NOT NULL REFERENCES plantillas(id) ON DELETE CASCADE,
  orden        smallint    NOT NULL,
  etiqueta     varchar(60) NOT NULL,
  nota         text,
  UNIQUE (plantilla_id, orden)
);

CREATE TABLE IF NOT EXISTS plantilla_ejercicios (
  id                serial PRIMARY KEY,
  plantilla_dia_id  integer     NOT NULL REFERENCES plantilla_dias(id) ON DELETE CASCADE,
  ejercicio_id      integer     NOT NULL REFERENCES ejercicios(id),
  orden             smallint    NOT NULL,
  series            smallint    NOT NULL DEFAULT 3 CHECK (series > 0),
  repeticiones      varchar(20) NOT NULL DEFAULT '10',
  descanso_seg      smallint    DEFAULT 60 CHECK (descanso_seg >= 0),
  nota              text,
  UNIQUE (plantilla_dia_id, orden)
);

CREATE INDEX IF NOT EXISTS ix_plantilla_ejercicios_dia ON plantilla_ejercicios (plantilla_dia_id);

-- ---------------------------------------------------------------------
--  Copia una plantilla a una rutina nueva del socio.
--
--  Va en la base y no en la API porque es una copia de tres niveles: hacerla
--  en JavaScript serían N+1 consultas y podría quedar a medias si algo falla
--  en el medio. Acá es atómica.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_asignar_plantilla(
  p_plantilla_id integer,
  p_socio_id     integer,
  p_creado_por   integer,
  p_nombre       text DEFAULT NULL
) RETURNS integer LANGUAGE plpgsql AS $$
DECLARE
  v_rutina_id integer;
  v_plantilla plantillas%ROWTYPE;
BEGIN
  SELECT * INTO v_plantilla FROM plantillas WHERE id = p_plantilla_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'La plantilla % no existe', p_plantilla_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM socios WHERE id = p_socio_id) THEN
    RAISE EXCEPTION 'El socio % no existe', p_socio_id;
  END IF;

  INSERT INTO rutinas (socio_id, nombre, descripcion, objetivo, dias_por_semana,
                       origen, creado_por)
  VALUES (
    p_socio_id,
    coalesce(p_nombre, v_plantilla.nombre),
    v_plantilla.descripcion,
    v_plantilla.objetivo,
    (SELECT count(*) FROM plantilla_dias WHERE plantilla_id = p_plantilla_id),
    'PROFE',
    p_creado_por
  )
  RETURNING id INTO v_rutina_id;

  -- Días y ejercicios en dos INSERT ... SELECT, conservando el orden.
  WITH dias_nuevos AS (
    INSERT INTO rutina_dias (rutina_id, orden, etiqueta, nota)
    SELECT v_rutina_id, pd.orden, pd.etiqueta, pd.nota
      FROM plantilla_dias pd
     WHERE pd.plantilla_id = p_plantilla_id
     ORDER BY pd.orden
    RETURNING id, orden
  )
  INSERT INTO rutina_ejercicios
    (rutina_dia_id, ejercicio_id, orden, series, repeticiones, descanso_seg, nota)
  SELECT dn.id, pe.ejercicio_id, pe.orden, pe.series, pe.repeticiones, pe.descanso_seg, pe.nota
    FROM plantilla_dias pd
    JOIN dias_nuevos dn        ON dn.orden = pd.orden
    JOIN plantilla_ejercicios pe ON pe.plantilla_dia_id = pd.id
   WHERE pd.plantilla_id = p_plantilla_id;

  RETURN v_rutina_id;
END $$;
