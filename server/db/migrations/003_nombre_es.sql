-- =====================================================================
--  Los nombres de los ejercicios en el dataset vienen SOLO en ingles
--  ("barbell bench press"); las instrucciones si estan traducidas.
--  Se agrega un nombre en espanol editable desde el panel del admin.
--  Mientras este vacio, la UI muestra el nombre original.
-- =====================================================================

ALTER TABLE ejercicios ADD COLUMN IF NOT EXISTS nombre_es varchar(160);

-- Nombre a mostrar: el traducido si existe, si no el del dataset.
CREATE OR REPLACE FUNCTION fn_nombre_ejercicio(nombre text, nombre_es text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS
$$ SELECT coalesce(nullif(btrim(nombre_es), ''), nombre) $$;

-- La busqueda tiene que encontrar tanto por el nombre original como por el traducido.
CREATE INDEX IF NOT EXISTS ix_ejercicios_nombre_es_trgm
  ON ejercicios USING gin (f_unaccent(lower(coalesce(nombre_es, ''))) gin_trgm_ops);
