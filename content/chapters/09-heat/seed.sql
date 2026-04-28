SET VARIABLE ch9_anchor = TIMESTAMP '2026-04-26 12:00:00';
CREATE TABLE metrics AS
  SELECT * FROM read_parquet('${CONTENT_ROOT}/chapters/09-heat/data/metrics.parquet');
