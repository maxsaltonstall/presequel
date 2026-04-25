-- Chapter 4: The Robber Baron's Census
-- Loads ~3000 rows of synthetic 1890 NYC census data from a committed CSV.
-- One anomalous row (surname Hemiunu, id 3000) has null borough/occupation —
-- revealed by the aggregation puzzles.

CREATE TABLE census_1890 AS
  SELECT * FROM read_csv_auto('${CONTENT_ROOT}/chapters/04-census/census_1890.csv');
