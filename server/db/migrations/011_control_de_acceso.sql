-- =====================================================================
--  Control de acceso por molinete biométrico.
--
--  Dos tablas:
--
--  1. socio_biometria — qué huella es de quién.
--     El lector guarda la plantilla de la huella adentro del equipo y hacia
--     afuera devuelve un identificador. Acá solo se guarda ESE identificador,
--     nunca la huella: es un dato biométrico y no tiene por qué estar en una
--     base que se respalda a un pendrive.
--
--  2. accesos — la bitácora de la puerta.
--     `asistencias` sigue siendo una fila por socio y día ("vino hoy"), que
--     es lo que alimenta el panel y el progreso. `accesos` es otra cosa: cada
--     intento, autorizado o no, con su motivo. Un socio vencido que apoya el
--     dedo tres veces deja tres filas acá y ninguna en asistencias.
-- =====================================================================

CREATE TABLE IF NOT EXISTS socio_biometria (
  id             serial PRIMARY KEY,
  socio_id       integer     NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  -- Lo que el equipo devuelve al reconocer un dedo. Se guarda como texto
  -- porque todavía no sabemos si es un número, un código o una cadena.
  biometria_id   varchar(64) NOT NULL,
  -- Un socio puede enrolar más de un dedo (el índice y el pulgar, por si se
  -- lastima uno). Cada dedo es una fila.
  etiqueta       varchar(40),
  activa         boolean     NOT NULL DEFAULT true,
  registrado_por integer     REFERENCES usuarios(id),
  creado_en      timestamptz NOT NULL DEFAULT now(),
  -- El mismo identificador no puede apuntar a dos socios: si pasara, la
  -- puerta le abriría a la persona equivocada.
  CONSTRAINT ux_biometria_id UNIQUE (biometria_id)
);

CREATE INDEX IF NOT EXISTS ix_biometria_socio ON socio_biometria (socio_id) WHERE activa;

COMMENT ON COLUMN socio_biometria.biometria_id IS
  'Identificador que devuelve el lector. NO es la huella: la plantilla queda en el equipo.';

-- ---------------------------------------------------------------------
--  Bitácora de la puerta
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS accesos (
  id            bigserial   PRIMARY KEY,
  -- Puede ser NULL: una huella desconocida también deja registro.
  socio_id      integer     REFERENCES socios(id) ON DELETE SET NULL,
  biometria_id  varchar(64),
  permitido     boolean     NOT NULL,
  motivo        varchar(32) NOT NULL,
  -- De dónde vino: el molinete, el mostrador, o el simulador durante pruebas.
  origen        varchar(24) NOT NULL DEFAULT 'MOLINETE',
  -- Cuando el administrador deja pasar a alguien vencido a propósito.
  forzado       boolean     NOT NULL DEFAULT false,
  -- Quién lo autorizó a mano, si aplica.
  registrado_por integer    REFERENCES usuarios(id),
  ocurrido_en   timestamptz NOT NULL DEFAULT now()
);

-- La consulta de siempre es "los últimos accesos", y la del panel es por día.
CREATE INDEX IF NOT EXISTS ix_accesos_fecha ON accesos (ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS ix_accesos_socio ON accesos (socio_id, ocurrido_en DESC);
-- Para responder "cuántos rechazos hubo hoy y por qué" sin recorrer todo.
CREATE INDEX IF NOT EXISTS ix_accesos_rechazos ON accesos (ocurrido_en DESC) WHERE NOT permitido;

COMMENT ON TABLE accesos IS
  'Cada intento en la puerta, autorizado o rechazado. asistencias es una fila por día; esto es el detalle.';
