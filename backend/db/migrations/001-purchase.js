// CREATE TABLE purchases (
//   id          SERIAL PRIMARY KEY,
//   seller_name VARCHAR(255) NOT NULL,
//   category    VARCHAR(50)  NOT NULL CHECK (category IN ('stock', 'production')),
//   quantity    INTEGER      NOT NULL,
//   price       NUMERIC(10, 2) NOT NULL,
//   date        DATE         NOT NULL DEFAULT CURRENT_DATE,
//   notes       TEXT,
//   created_at  TIMESTAMP    DEFAULT NOW(),
//   updated_at  TIMESTAMP    DEFAULT NOW()
// );
