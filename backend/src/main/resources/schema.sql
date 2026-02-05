-- DROP TABLE IF EXISTS cameras;

CREATE TABLE IF NOT EXISTS cameras (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    stream_path VARCHAR(1024),
    location VARCHAR(255),
    nvr_id VARCHAR(255),
    channel INT,
    stream_uri VARCHAR(2048),
    profile_token VARCHAR(512),
    status VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS user_locations (
    user_id VARCHAR(255) NOT NULL,
    location VARCHAR(255) NOT NULL,
    CONSTRAINT fk_user_locations_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS nvrs (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    location VARCHAR(255),
    ip VARCHAR(255),
    port VARCHAR(255),
    username VARCHAR(255),
    password VARCHAR(255),
    type VARCHAR(255),
    channels INT DEFAULT 32,
    onvif_port VARCHAR(255),
    onvif_username VARCHAR(255),
    onvif_password VARCHAR(255)
);

CREATE TABLE IF NOT EXISTS user_audit (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    action VARCHAR(50) NOT NULL,
    location VARCHAR(255),
    nvr_id VARCHAR(255),
    timestamp TIMESTAMP NOT NULL,
    ip_address VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS user_assigned_cameras (
    user_id VARCHAR(255) NOT NULL,
    camera_id VARCHAR(255) NOT NULL,
    CONSTRAINT fk_user_assigned_cameras_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

INSERT INTO users (id, username, password, role) VALUES ('1', 'admin', 'admin', 'ADMIN') ON CONFLICT (username) DO UPDATE SET role = EXCLUDED.role, password = EXCLUDED.password;
