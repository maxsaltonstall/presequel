CREATE TABLE logs AS
  SELECT * FROM read_parquet('${CONTENT_ROOT}/chapters/07-static/data/logs.parquet');
