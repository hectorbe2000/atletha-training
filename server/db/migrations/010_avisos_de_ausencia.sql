-- =====================================================================
--  Aviso al socio que dejo de venir.
--
--  El panel avisaba de los vencimientos, pero para cuando alguien aparece
--  en esa lista ya decidio no volver. El que se va no avisa: deja de venir
--  tres semanas antes de que se le venza y despues no renueva, y hasta
--  ahora era invisible porque figura AL_DIA.
--
--  Va en su propia columna y no en `ultimo_aviso_en`: son dos
--  conversaciones distintas y haberle escrito por una no tiene que tapar
--  la otra.
-- =====================================================================

ALTER TABLE socios ADD COLUMN IF NOT EXISTS ultimo_aviso_ausencia_en timestamptz;

COMMENT ON COLUMN socios.ultimo_aviso_ausencia_en IS
  'Cuando se le escribio por dejar de venir. Evita repetirle el mismo mensaje al dia siguiente.';

-- La consulta de ausentes pregunta por la ultima asistencia de cada socio.
CREATE INDEX IF NOT EXISTS ix_asistencias_socio_fecha ON asistencias (socio_id, fecha DESC);
