-- =====================================================================
--  Fecha del último aviso de vencimiento.
--
--  Sin esto, el que atiende el mostrador no tiene forma de saber a quién ya
--  le escribió: al día siguiente vuelve a abrir la lista de "por vencer" y
--  les manda el mismo mensaje a los mismos. Se guarda al tocar el botón de
--  WhatsApp y la lista lo muestra ("avisado hace 2 días").
-- =====================================================================

ALTER TABLE socios ADD COLUMN IF NOT EXISTS ultimo_aviso_en timestamptz;

COMMENT ON COLUMN socios.ultimo_aviso_en IS
  'Cuándo se le avisó por última vez que su membresía vence o venció.';

-- La vista se recrea agregando la columna al final: CREATE OR REPLACE VIEW
-- solo admite sumar columnas después de las que ya existen.
CREATE OR REPLACE VIEW v_socios_estado AS
SELECT
  s.id                AS socio_id,
  s.codigo,
  u.id                AS usuario_id,
  u.documento,
  u.nombre,
  u.apellido,
  u.nombre || ' ' || u.apellido AS nombre_completo,
  u.telefono,
  u.email,
  u.activo,
  s.fecha_ingreso,
  s.objetivo,
  s.foto_url,
  m.id                AS membresia_id,
  p.nombre            AS plan,
  m.fecha_inicio,
  m.fecha_fin,
  (m.fecha_fin - current_date) AS dias_restantes,
  CASE
    WHEN m.id IS NULL                            THEN 'SIN_MEMBRESIA'
    WHEN m.fecha_fin < current_date              THEN 'VENCIDO'
    WHEN m.fecha_fin - current_date <= 7         THEN 'POR_VENCER'
    ELSE 'AL_DIA'
  END AS estado,
  s.ultimo_aviso_en,
  CASE
    WHEN s.ultimo_aviso_en IS NULL THEN NULL
    ELSE (current_date - s.ultimo_aviso_en::date)
  END AS dias_desde_aviso
FROM socios s
JOIN usuarios u ON u.id = s.usuario_id
LEFT JOIN LATERAL (
  SELECT mm.*
  FROM membresias mm
  WHERE mm.socio_id = s.id AND mm.estado <> 'CANCELADA'
  ORDER BY mm.fecha_fin DESC
  LIMIT 1
) m ON true
LEFT JOIN planes p ON p.id = m.plan_id;
