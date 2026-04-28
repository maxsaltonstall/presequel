SET VARIABLE ch8_anchor = TIMESTAMP '2026-04-26 11:00:00';
CREATE TABLE logs AS
  SELECT * FROM read_parquet('${CONTENT_ROOT}/chapters/08-when/data/logs.parquet');
