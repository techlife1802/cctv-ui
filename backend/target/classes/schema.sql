CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS cameras (
    id BIGSERIAL PRIMARY KEY,
    name VARCHAR(255),
    location VARCHAR(255),
    nvr_name VARCHAR(255),
    status VARCHAR(255),
    thumbnail VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS nvrs (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    location VARCHAR(255),
    ip VARCHAR(255),
    port VARCHAR(255),
    username VARCHAR(255),
    password VARCHAR(255),
    status VARCHAR(255),
    type VARCHAR(255)
);

INSERT INTO users (id, username, password, role) VALUES ('1', 'admin', 'admin', 'admin') ON CONFLICT (username) DO NOTHING;
