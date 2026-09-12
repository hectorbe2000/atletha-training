-- =====================================================================
--  1. Cumpleaños a la vista en la puerta.
--
--     `fecha_nacimiento` ya se cargaba en el alta. Que el mostrador lo vea
--     cuando el socio entra es la diferencia entre saludarlo y no saludarlo.
--
--  2. Visitas y días de prueba.
--
--     Alguien que viene de visita o a probar el gimnasio no es socio, así que
--     no tiene huella ni membresía: hoy no había forma de dejarlo pasar ni de
--     saber después cuántos vinieron. Un día de prueba que se convierte en
--     socio es una venta, y para eso hay que tener el registro.
-- =====================================================================

-- ---------------------------------------------------------------------
--  Próximo cumpleaños
-- ---------------------------------------------------------------------

/*
 * Cuántos días faltan para el próximo cumpleaños.
 *
 * El día se recorta al último del mes para que el 29 de febrero no reviente
 * en un año no bisiesto: en esos años se cumple el 28.
 */
CREATE OR REPLACE FUNCTION fn_dia_del_anio(anio int, mes int, dia int)
RETURNS date LANGUAGE sql IMMUTABLE AS $$
  SELECT make_date(
           anio,
           mes,
           least(
             dia,
             extract(day FROM (make_date(anio, mes, 1) + interval '1 month - 1 day'))::int
           )
         )
$$;

CREATE OR REPLACE FUNCTION fn_proximo_cumple(nacimiento date)
RETURNS date LANGUAGE plpgsql STABLE AS $$
DECLARE
  candidato date;
  anio int := extract(year FROM current_date);
BEGIN
  IF nacimiento IS NULL THEN
    RETURN NULL;
  END IF;

  candidato := fn_dia_del_anio(
    anio,
    extract(month FROM nacimiento)::int,
    extract(day FROM nacimiento)::int
  );

  -- Si el de este año ya pasó, el que viene es el del año próximo.
  IF candidato < current_date THEN
    candidato := fn_dia_del_anio(
      anio + 1,
      extract(month FROM nacimiento)::int,
      extract(day FROM nacimiento)::int
    );
  END IF;

  RETURN candidato;
END $$;

-- ---------------------------------------------------------------------
--  La vista, con la fecha de nacimiento y los días que faltan
-- ---------------------------------------------------------------------
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
  END AS dias_desde_aviso,
  s.fecha_nacimiento,
  (fn_proximo_cumple(s.fecha_nacimiento) - current_date)::int AS dias_cumple
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

-- ---------------------------------------------------------------------
--  Visitas y días de prueba
-- ---------------------------------------------------------------------

-- Van en `accesos` y no en una tabla aparte: es un paso por la puerta, igual
-- que el de un socio, y así "quién entró hoy" se responde mirando un solo
-- lado. La fila queda con socio_id NULL y el nombre acá.
ALTER TABLE accesos ADD COLUMN IF NOT EXISTS visitante varchar(120);
ALTER TABLE accesos ADD COLUMN IF NOT EXISTS nota varchar(200);

COMMENT ON COLUMN accesos.visitante IS
  'Nombre de quien entró sin ser socio (visita o día de prueba). NULL si es socio.';
