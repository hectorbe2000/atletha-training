-- =====================================================================
--  Las columnas que guardan "quién registró esto" apuntaban a usuarios sin
--  regla de borrado, o sea RESTRICT: bastaba con que un usuario hubiera
--  registrado una medición, un pago o una rutina para que ya no se lo
--  pudiera eliminar nunca.
--
--  Lo detectó la prueba de humo al no poder limpiar sus propios datos, pero
--  el problema es de producción: dar de baja definitiva a alguien fallaba.
--
--  La atribución es información secundaria: si el usuario desaparece, el
--  registro se conserva y el "quién" queda en NULL.
-- =====================================================================

ALTER TABLE mediciones  DROP CONSTRAINT IF EXISTS mediciones_registrado_por_fkey;
ALTER TABLE mediciones  ADD  CONSTRAINT mediciones_registrado_por_fkey
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE membresias  DROP CONSTRAINT IF EXISTS membresias_registrado_por_fkey;
ALTER TABLE membresias  ADD  CONSTRAINT membresias_registrado_por_fkey
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE pagos       DROP CONSTRAINT IF EXISTS pagos_registrado_por_fkey;
ALTER TABLE pagos       ADD  CONSTRAINT pagos_registrado_por_fkey
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE asistencias DROP CONSTRAINT IF EXISTS asistencias_registrado_por_fkey;
ALTER TABLE asistencias ADD  CONSTRAINT asistencias_registrado_por_fkey
  FOREIGN KEY (registrado_por) REFERENCES usuarios(id) ON DELETE SET NULL;

ALTER TABLE rutinas     DROP CONSTRAINT IF EXISTS rutinas_creado_por_fkey;
ALTER TABLE rutinas     ADD  CONSTRAINT rutinas_creado_por_fkey
  FOREIGN KEY (creado_por) REFERENCES usuarios(id) ON DELETE SET NULL;
