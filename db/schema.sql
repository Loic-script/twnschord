-- Schéma de TwinsChord. Rejouable sans risque : tout est en IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,          -- toujours enregistré en minuscules
  name          TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,                 -- scrypt, jamais le mot de passe en clair
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,                 -- SHA-256 du jeton placé dans le cookie
  user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);

CREATE TABLE IF NOT EXISTS analyses (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id    BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  duration   REAL NOT NULL,
  tempo      REAL NOT NULL,
  key_tonic  SMALLINT NOT NULL,
  key_mode   TEXT NOT NULL,
  data       JSONB NOT NULL,                   -- l'analyse complète (temps, accords, mélodie)
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analyses_user_created_idx ON analyses (user_id, created_at DESC);
