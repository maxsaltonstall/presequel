CREATE TABLE logs AS
  SELECT * FROM read_parquet('${CONTENT_ROOT}/chapters/11-catalog/data/logs.parquet');
CREATE TABLE spans AS
  SELECT * FROM read_parquet('${CONTENT_ROOT}/chapters/11-catalog/data/spans.parquet');
CREATE TABLE services (
  service_name VARCHAR,
  team         VARCHAR,
  tier         INTEGER,
  registered_at DATE
);
INSERT INTO services VALUES
  ('auth-svc',            'platform',      1, DATE '2018-03-14'),
  ('api-gateway',         'platform',      1, DATE '2018-03-14'),
  ('chrono-archive',      'core',          1, DATE '2015-09-01'),
  ('chrono-ledger',       'core',          1, DATE '2015-09-01'),
  ('metrics-collector',   'observability', 2, DATE '2020-06-22'),
  ('payment-svc',         'billing',       2, DATE '2019-11-07'),
  ('notification-svc',    'comms',         2, DATE '2020-01-15'),
  ('reporting-svc',       'analytics',     3, DATE '2021-04-18'),
  ('scheduler',           'platform',      2, DATE '2020-08-03'),
  ('config-svc',          'platform',      2, DATE '2019-05-12'),
  ('export-svc',          'data',          3, DATE '2022-02-28'),
  ('intake-api',          'data',          3, DATE '2022-07-19');
