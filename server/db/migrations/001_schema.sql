-- =====================================================================
--  Sistema de Gimnasio — esquema base
--  PostgreSQL 16
--  El corredor (db/migrate.js) envuelve cada archivo en su transaccion.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- unaccent() es STABLE; se necesita una envoltura IMMUTABLE para indexar.
CREATE OR REPLACE FUNCTION f_unaccent(text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS
$$ SELECT public.unaccent('public.unaccent', $1) $$;

-- ---------------------------------------------------------------------
--  Tipos
-- ---------------------------------------------------------------------
CREATE TYPE rol_usuario      AS ENUM ('ADMIN', 'SOCIO');
CREATE TYPE estado_membresia AS ENUM ('VIGENTE', 'VENCIDA', 'CANCELADA');
CREATE TYPE metodo_pago      AS ENUM ('EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'QR', 'OTRO');
CREATE TYPE sexo_persona     AS ENUM ('M', 'F', 'OTRO');
CREATE TYPE tipo_termino     AS ENUM ('BODY_PART', 'EQUIPO', 'MUSCULO');

-- Mantiene actualizado_en en cada UPDATE.
CREATE OR REPLACE FUNCTION fn_tocar_actualizado_en()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.actualizado_en := now();
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------
--  Usuarios y socios
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
  id                     serial PRIMARY KEY,
  documento              varchar(15)  NOT NULL UNIQUE,   -- cedula: es el usuario de login
  password_hash          text         NOT NULL,
  rol                    rol_usuario  NOT NULL DEFAULT 'SOCIO',
  nombre                 varchar(80)  NOT NULL,
  apellido               varchar(80)  NOT NULL,
  email                  varchar(120),
  telefono               varchar(30),
  activo                 boolean      NOT NULL DEFAULT true,
  debe_cambiar_password  boolean      NOT NULL DEFAULT true,
  ultimo_acceso          timestamptz,
  creado_en              timestamptz  NOT NULL DEFAULT now(),
  actualizado_en         timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT ck_usuarios_documento CHECK (documento ~ '^[0-9]{4,15}$'),
  CONSTRAINT ck_usuarios_email     CHECK (email IS NULL OR email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$')
);
CREATE INDEX ix_usuarios_rol ON usuarios (rol) WHERE activo;
CREATE TRIGGER tg_usuarios_upd BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION fn_tocar_actualizado_en();

CREATE SEQUENCE seq_codigo_socio START 1;

CREATE TABLE socios (
  id                      serial PRIMARY KEY,
  usuario_id              integer     NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
  codigo                  varchar(12) NOT NULL UNIQUE
                            DEFAULT 'S-' || lpad(nextval('seq_codigo_socio')::text, 5, '0'),
  fecha_nacimiento        date,
  sexo                    sexo_persona,
  direccion               text,
  contacto_emergencia     varchar(120),
  telefono_emergencia     varchar(30),
  observaciones_medicas   text,
  objetivo                varchar(120),
  foto_url                text,
  fecha_ingreso           date        NOT NULL DEFAULT current_date,
  creado_en               timestamptz NOT NULL DEFAULT now(),
  actualizado_en          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_socios_nacimiento CHECK (fecha_nacimiento IS NULL OR fecha_nacimiento < current_date)
);
CREATE TRIGGER tg_socios_upd BEFORE UPDATE ON socios
  FOR EACH ROW EXECUTE FUNCTION fn_tocar_actualizado_en();

-- ---------------------------------------------------------------------
--  Planes, membresias y pagos
-- ---------------------------------------------------------------------
CREATE TABLE planes (
  id            serial PRIMARY KEY,
  nombre        varchar(60)    NOT NULL UNIQUE,
  descripcion   text,
  duracion_dias integer        NOT NULL CHECK (duracion_dias > 0),
  precio        numeric(12, 2) NOT NULL CHECK (precio >= 0),
  activo        boolean        NOT NULL DEFAULT true,
  creado_en     timestamptz    NOT NULL DEFAULT now()
);

CREATE TABLE membresias (
  id              serial PRIMARY KEY,
  socio_id        integer          NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  plan_id         integer          NOT NULL REFERENCES planes(id),
  fecha_inicio    date             NOT NULL,
  fecha_fin       date             NOT NULL,
  precio          numeric(12, 2)   NOT NULL CHECK (precio >= 0),
  estado          estado_membresia NOT NULL DEFAULT 'VIGENTE',
  observacion     text,
  registrado_por  integer          REFERENCES usuarios(id),
  creado_en       timestamptz      NOT NULL DEFAULT now(),
  CONSTRAINT ck_membresias_rango CHECK (fecha_fin >= fecha_inicio)
);
-- Un socio no puede tener dos periodos activos superpuestos.
ALTER TABLE membresias ADD CONSTRAINT ex_membresias_sin_solape
  EXCLUDE USING gist (
    socio_id WITH =,
    daterange(fecha_inicio, fecha_fin, '[]') WITH &&
  ) WHERE (estado <> 'CANCELADA');
CREATE INDEX ix_membresias_socio_fin ON membresias (socio_id, fecha_fin DESC);
CREATE INDEX ix_membresias_vencimiento ON membresias (fecha_fin) WHERE estado = 'VIGENTE';

CREATE TABLE pagos (
  id             serial PRIMARY KEY,
  socio_id       integer        NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  membresia_id   integer        REFERENCES membresias(id) ON DELETE SET NULL,
  monto          numeric(12, 2) NOT NULL CHECK (monto > 0),
  metodo         metodo_pago    NOT NULL DEFAULT 'EFECTIVO',
  fecha_pago     timestamptz    NOT NULL DEFAULT now(),
  comprobante    varchar(40),
  observacion    text,
  registrado_por integer        REFERENCES usuarios(id),
  creado_en      timestamptz    NOT NULL DEFAULT now()
);
CREATE INDEX ix_pagos_socio_fecha ON pagos (socio_id, fecha_pago DESC);
CREATE INDEX ix_pagos_fecha ON pagos (fecha_pago DESC);

-- ---------------------------------------------------------------------
--  Catalogo de ejercicios (dataset)
-- ---------------------------------------------------------------------
CREATE TABLE terminos (
  tipo       tipo_termino NOT NULL,
  valor      varchar(60)  NOT NULL,   -- valor original en ingles del dataset
  etiqueta   varchar(80)  NOT NULL,   -- etiqueta mostrada en la UI (es)
  orden      smallint     NOT NULL DEFAULT 100,
  PRIMARY KEY (tipo, valor)
);

CREATE TABLE ejercicios (
  id                    serial PRIMARY KEY,
  codigo                char(4)     NOT NULL UNIQUE,
  nombre                varchar(160) NOT NULL,
  categoria             varchar(40) NOT NULL,
  body_part             varchar(40) NOT NULL,
  equipo                varchar(60) NOT NULL,
  grupo_muscular        varchar(60) NOT NULL,
  musculo_objetivo      varchar(60) NOT NULL,
  musculos_secundarios  text[]      NOT NULL DEFAULT '{}',
  media_id              varchar(40),
  imagen                text        NOT NULL,
  gif                   text        NOT NULL,
  atribucion            text,
  creado_en             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_ejercicios_codigo CHECK (codigo ~ '^[0-9]{4}$')
);
CREATE INDEX ix_ejercicios_body_part ON ejercicios (body_part);
CREATE INDEX ix_ejercicios_equipo    ON ejercicios (equipo);
CREATE INDEX ix_ejercicios_objetivo  ON ejercicios (musculo_objetivo);
CREATE INDEX ix_ejercicios_nombre_trgm
  ON ejercicios USING gin (f_unaccent(lower(nombre)) gin_trgm_ops);

CREATE TABLE ejercicio_instrucciones (
  ejercicio_id integer NOT NULL REFERENCES ejercicios(id) ON DELETE CASCADE,
  idioma       char(2) NOT NULL,
  texto        text    NOT NULL,
  pasos        text[]  NOT NULL DEFAULT '{}',
  PRIMARY KEY (ejercicio_id, idioma)
);

-- ---------------------------------------------------------------------
--  Rutinas asignadas por el administrador
-- ---------------------------------------------------------------------
CREATE TABLE rutinas (
  id              serial PRIMARY KEY,
  socio_id        integer     NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  nombre          varchar(100) NOT NULL,
  descripcion     text,
  objetivo        varchar(80),
  dias_por_semana smallint    CHECK (dias_por_semana BETWEEN 1 AND 7),
  fecha_inicio    date        NOT NULL DEFAULT current_date,
  fecha_fin       date,
  activa          boolean     NOT NULL DEFAULT true,
  creado_por      integer     REFERENCES usuarios(id),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  actualizado_en  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ck_rutinas_rango CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio)
);
CREATE INDEX ix_rutinas_socio ON rutinas (socio_id) WHERE activa;
CREATE TRIGGER tg_rutinas_upd BEFORE UPDATE ON rutinas
  FOR EACH ROW EXECUTE FUNCTION fn_tocar_actualizado_en();

CREATE TABLE rutina_dias (
  id        serial PRIMARY KEY,
  rutina_id integer     NOT NULL REFERENCES rutinas(id) ON DELETE CASCADE,
  orden     smallint    NOT NULL,
  etiqueta  varchar(60) NOT NULL,
  nota      text,
  UNIQUE (rutina_id, orden)
);

CREATE TABLE rutina_ejercicios (
  id            serial PRIMARY KEY,
  rutina_dia_id integer     NOT NULL REFERENCES rutina_dias(id) ON DELETE CASCADE,
  ejercicio_id  integer     NOT NULL REFERENCES ejercicios(id),
  orden         smallint    NOT NULL,
  series        smallint    NOT NULL DEFAULT 3 CHECK (series > 0),
  repeticiones  varchar(20) NOT NULL DEFAULT '10',
  peso_sugerido numeric(6, 2),
  descanso_seg  smallint    DEFAULT 60 CHECK (descanso_seg >= 0),
  nota          text,
  UNIQUE (rutina_dia_id, orden)
);
CREATE INDEX ix_rutina_ejercicios_dia ON rutina_ejercicios (rutina_dia_id);

-- ---------------------------------------------------------------------
--  Entrenamiento registrado por el socio
-- ---------------------------------------------------------------------
CREATE TABLE sesiones (
  id            serial PRIMARY KEY,
  socio_id      integer     NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  rutina_dia_id integer     REFERENCES rutina_dias(id) ON DELETE SET NULL,
  fecha         date        NOT NULL DEFAULT current_date,
  inicio        timestamptz NOT NULL DEFAULT now(),
  fin           timestamptz,
  notas         text,
  finalizada    boolean     NOT NULL DEFAULT false,
  CONSTRAINT ck_sesiones_rango CHECK (fin IS NULL OR fin >= inicio)
);
CREATE INDEX ix_sesiones_socio_fecha ON sesiones (socio_id, fecha DESC);

CREATE TABLE series_registradas (
  id            serial PRIMARY KEY,
  sesion_id     integer  NOT NULL REFERENCES sesiones(id) ON DELETE CASCADE,
  ejercicio_id  integer  NOT NULL REFERENCES ejercicios(id),
  numero_serie  smallint NOT NULL CHECK (numero_serie > 0),
  repeticiones  smallint CHECK (repeticiones >= 0),
  peso          numeric(6, 2) CHECK (peso >= 0),
  rpe           smallint CHECK (rpe BETWEEN 1 AND 10),
  completada    boolean  NOT NULL DEFAULT true,
  UNIQUE (sesion_id, ejercicio_id, numero_serie)
);
CREATE INDEX ix_series_ejercicio ON series_registradas (ejercicio_id);

-- ---------------------------------------------------------------------
--  Asistencia y favoritos
-- ---------------------------------------------------------------------
CREATE TABLE asistencias (
  id             serial PRIMARY KEY,
  socio_id       integer     NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  fecha          date        NOT NULL DEFAULT current_date,
  hora_entrada   timestamptz NOT NULL DEFAULT now(),
  registrado_por integer     REFERENCES usuarios(id),
  UNIQUE (socio_id, fecha)
);
CREATE INDEX ix_asistencias_fecha ON asistencias (fecha DESC);

CREATE TABLE favoritos (
  socio_id     integer     NOT NULL REFERENCES socios(id) ON DELETE CASCADE,
  ejercicio_id integer     NOT NULL REFERENCES ejercicios(id) ON DELETE CASCADE,
  creado_en    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (socio_id, ejercicio_id)
);

-- ---------------------------------------------------------------------
--  Vistas y rutinas de mantenimiento
-- ---------------------------------------------------------------------

-- Estado de membresia de cada socio, con la ultima membresia no cancelada.
CREATE VIEW v_socios_estado AS
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
  END AS estado
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

-- Volumen (kg levantados) por sesion, base de los graficos de progreso.
CREATE VIEW v_volumen_sesion AS
SELECT
  se.id       AS sesion_id,
  se.socio_id,
  se.fecha,
  count(DISTINCT sr.ejercicio_id)                        AS ejercicios,
  count(*) FILTER (WHERE sr.completada)                  AS series_completadas,
  coalesce(sum(sr.repeticiones) FILTER (WHERE sr.completada), 0)                  AS repeticiones,
  coalesce(sum(sr.repeticiones * sr.peso) FILTER (WHERE sr.completada), 0)::numeric(12,2) AS volumen_kg
FROM sesiones se
LEFT JOIN series_registradas sr ON sr.sesion_id = se.id
GROUP BY se.id, se.socio_id, se.fecha;

-- Marca como VENCIDA toda membresia cuyo periodo ya paso. Idempotente.
CREATE OR REPLACE FUNCTION fn_actualizar_membresias_vencidas()
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE afectadas integer;
BEGIN
  UPDATE membresias
     SET estado = 'VENCIDA'
   WHERE estado = 'VIGENTE'
     AND fecha_fin < current_date;
  GET DIAGNOSTICS afectadas = ROW_COUNT;
  RETURN afectadas;
END $$;
