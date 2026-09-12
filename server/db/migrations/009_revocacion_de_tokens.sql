-- =====================================================================
--  Revocacion de sesiones.
--
--  Hasta aca el JWT solo se verificaba por firma: dar de baja a un socio,
--  cambiarle la contrasena o reiniciarsela no lo sacaba del sistema, seguia
--  entrando con el token viejo hasta que expirara (12 h por defecto).
--
--  Con esta marca de tiempo, todo token emitido ANTES de ella deja de valer.
--  Se toca al cambiar la contrasena y al reiniciarla desde la ficha.
-- =====================================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tokens_validos_desde timestamptz;

COMMENT ON COLUMN usuarios.tokens_validos_desde IS
  'Todo JWT emitido antes de esta fecha se rechaza. NULL = no se revoco nunca.';
