-- =====================================================================
--  1. Rutinas propias del socio
--
--  Hasta acá todas las rutinas las armaba el administrador. Ahora el socio
--  puede armarse las suyas desde el catálogo. Se distinguen por origen: las
--  del profe el socio las ve pero no las toca; las propias son suyas.
--
--  2. Mediciones corporales
--
--  El sistema medía kilos levantados pero no el cuerpo del socio, que es
--  justamente lo que le importa a quien entrena para bajar de peso.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Rutinas: quién la armó
-- ---------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE origen_rutina AS ENUM ('PROFE', 'SOCIO');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE rutinas ADD COLUMN IF NOT EXISTS origen origen_rutina NOT NULL DEFAULT 'PROFE';

-- Lo ya cargado lo armó el administrador.
UPDATE rutinas SET origen = 'PROFE' WHERE origen IS NULL;

COMMENT ON COLUMN rutinas.origen IS
  'PROFE: la asignó el administrador, el socio no puede editarla. SOCIO: se la armó el socio.';

-- ---------------------------------------------------------------------
--  Altura: es un dato de la persona, no de cada medición
-- ---------------------------------------------------------------------
ALTER TABLE socios ADD COLUMN IF NOT EXISTS altura_cm smallint
  CONSTRAINT ck_socios_altura CHECK (altura_cm IS NULL OR altura_cm BETWEEN 80 AND 260);

-- ---------------------------------------------------------------------
--  Mediciones
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mediciones (
  id             serial PRIMARY KEY,
  socio_id       integer     NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  fecha          date        NOT NULL DEFAULT current_date,
  peso_kg        numeric(5, 2) CHECK (peso_kg > 0 AND peso_kg < 500),
  grasa_pct      numeric(4, 1) CHECK (grasa_pct > 0 AND grasa_pct < 80),
  cuello_cm      numeric(5, 1) CHECK (cuello_cm > 0),
  pecho_cm       numeric(5, 1) CHECK (pecho_cm > 0),
  cintura_cm     numeric(5, 1) CHECK (cintura_cm > 0),
  cadera_cm      numeric(5, 1) CHECK (cadera_cm > 0),
  brazo_cm       numeric(5, 1) CHECK (brazo_cm > 0),
  muslo_cm       numeric(5, 1) CHECK (muslo_cm > 0),
  notas          text,
  registrado_por integer     REFERENCES usuarios(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  -- Una medición por día: si se corrige, se pisa la del día.
  UNIQUE (socio_id, fecha),
  -- Una fila sin ningún número no sirve de nada.
  CONSTRAINT ck_mediciones_algun_dato CHECK (
    num_nonnulls(peso_kg, grasa_pct, cuello_cm, pecho_cm, cintura_cm,
                 cadera_cm, brazo_cm, muslo_cm) > 0
  )
);

CREATE INDEX IF NOT EXISTS ix_mediciones_socio_fecha ON mediciones (socio_id, fecha DESC);

-- ---------------------------------------------------------------------
--  Vista: cada medición con su IMC y la variación contra la anterior
--  y contra la primera. Todo el cálculo vive acá, no en el frontend.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_mediciones AS
SELECT
  m.*,
  s.altura_cm,
  CASE
    WHEN m.peso_kg IS NOT NULL AND s.altura_cm IS NOT NULL
    THEN round(m.peso_kg / power(s.altura_cm / 100.0, 2), 1)
  END AS imc,
  CASE
    WHEN m.peso_kg IS NULL OR s.altura_cm IS NULL THEN NULL
    WHEN m.peso_kg / power(s.altura_cm / 100.0, 2) < 18.5 THEN 'BAJO'
    WHEN m.peso_kg / power(s.altura_cm / 100.0, 2) < 25   THEN 'NORMAL'
    WHEN m.peso_kg / power(s.altura_cm / 100.0, 2) < 30   THEN 'SOBREPESO'
    ELSE 'OBESIDAD'
  END AS categoria_imc,
  round(
    m.peso_kg - lag(m.peso_kg) OVER (PARTITION BY m.socio_id ORDER BY m.fecha), 2
  ) AS variacion_kg,
  round(
    m.peso_kg - first_value(m.peso_kg) OVER (
      PARTITION BY m.socio_id ORDER BY m.fecha
      ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING
    ), 2
  ) AS variacion_total_kg
FROM mediciones m
JOIN socios s ON s.id = m.socio_id;
