-- =====================================================================
--  Nombre de usuario para entrar.
--
--  El socio entra con su cédula y así está bien: es el número que sabe de
--  memoria y el que tiene en el bolsillo. Pero el mostrador es una cuenta
--  compartida del gimnasio, no la de una persona, y pedirle una cédula a una
--  cuenta que se llama "Atletha" no tiene sentido.
--
--  La columna es opcional: quien no tenga nombre de usuario sigue entrando
--  con la cédula, como hasta ahora. Nadie queda afuera por este cambio.
-- =====================================================================

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS nombre_usuario varchar(40);

COMMENT ON COLUMN usuarios.nombre_usuario IS
  'Alternativa a la cédula para entrar. NULL en los socios, que usan su documento.';

-- Único sin distinguir mayúsculas: "Atletha" y "atletha" son el mismo.
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_nombre_usuario
  ON usuarios (lower(nombre_usuario))
  WHERE nombre_usuario IS NOT NULL;

-- Tiene que arrancar con letra: si fuera todo números se confundiría con una
-- cédula y no se sabría contra cuál de las dos cosas comparar.
DO $$ BEGIN
  ALTER TABLE usuarios ADD CONSTRAINT ck_usuarios_nombre_usuario
    CHECK (nombre_usuario IS NULL OR nombre_usuario ~ '^[A-Za-z][A-Za-z0-9._-]{2,39}$');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
