CREATE TABLE users (
  id         SERIAL PRIMARY KEY,
  username   TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE rooms (
  id         SERIAL PRIMARY KEY,
  name       TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id         BIGSERIAL PRIMARY KEY,
  room_id    INT    NOT NULL REFERENCES rooms(id),
  user_id    INT    NOT NULL REFERENCES users(id),
  body       TEXT   NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_room_id ON messages (room_id, id DESC);

INSERT INTO rooms (name) VALUES ('general');