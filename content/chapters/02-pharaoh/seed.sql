-- Chapter 2: The Pharaoh's Grain Audit
-- Granary records from Menkaure's reign, years 1-12.
-- Spread across three royal silos: Giza, Memphis, Saqqara.
-- One anomalous entry: an overseer named "Hemiunu" in year 9 with
-- an unusually small delivery. Menkaure senses something is off.

CREATE TABLE granary (
  id         INTEGER,
  overseer   VARCHAR,
  year       INTEGER,
  amount     INTEGER,
  silo       VARCHAR
);

INSERT INTO granary VALUES
  -- Year 1 (establishing reign)
  (1,  'Weni',         1,  2400, 'Giza'),
  (2,  'Imhotep',      1,  1800, 'Memphis'),
  (3,  'Rahotep',      1,  2100, 'Saqqara'),
  (4,  'Weni',         1,  2600, 'Giza'),
  (5,  'Meryet',       1,  1500, 'Memphis'),
  -- Year 2
  (6,  'Weni',         2,  2700, 'Giza'),
  (7,  'Kagemni',      2,  2200, 'Memphis'),
  (8,  'Imhotep',      2,  2000, 'Memphis'),
  (9,  'Rahotep',      2,  2400, 'Saqqara'),
  (10, 'Akhethotep',   2,  1900, 'Saqqara'),
  -- Year 3
  (11, 'Weni',         3,  3100, 'Giza'),
  (12, 'Kagemni',      3,  2600, 'Memphis'),
  (13, 'Meryet',       3,  1800, 'Memphis'),
  (14, 'Rahotep',      3,  2800, 'Saqqara'),
  (15, 'Mereruka',     3,  2100, 'Giza'),
  -- Year 4
  (16, 'Weni',         4,  2900, 'Giza'),
  (17, 'Imhotep',      4,  2300, 'Memphis'),
  (18, 'Akhethotep',   4,  2000, 'Saqqara'),
  (19, 'Meryet',       4,  1700, 'Memphis'),
  (20, 'Rahotep',      4,  2500, 'Saqqara'),
  -- Year 5
  (21, 'Mereruka',     5,  3200, 'Giza'),
  (22, 'Weni',         5,  2800, 'Giza'),
  (23, 'Kagemni',      5,  2400, 'Memphis'),
  (24, 'Imhotep',      5,  2100, 'Memphis'),
  (25, 'Rahotep',      5,  2700, 'Saqqara'),
  -- Year 6
  (26, 'Weni',         6,  3000, 'Giza'),
  (27, 'Meryet',       6,  1900, 'Memphis'),
  (28, 'Akhethotep',   6,  2200, 'Saqqara'),
  (29, 'Mereruka',     6,  3100, 'Giza'),
  (30, 'Rahotep',      6,  2600, 'Saqqara'),
  -- Year 7
  (31, 'Weni',         7,  2850, 'Giza'),
  (32, 'Kagemni',      7,  2400, 'Memphis'),
  (33, 'Imhotep',      7,  2000, 'Memphis'),
  (34, 'Meryet',       7,  1650, 'Memphis'),
  (35, 'Akhethotep',   7,  1850, 'Saqqara'),
  -- Year 8
  (36, 'Weni',         8,  3300, 'Giza'),
  (37, 'Mereruka',     8,  2900, 'Giza'),
  (38, 'Kagemni',      8,  2500, 'Memphis'),
  (39, 'Rahotep',      8,  2750, 'Saqqara'),
  (40, 'Akhethotep',   8,  2100, 'Saqqara'),
  -- Year 9 — THE ANOMALY LIVES HERE
  (41, 'Weni',         9,  3100, 'Giza'),
  (42, 'Mereruka',     9,  3050, 'Giza'),
  (43, 'Kagemni',      9,  2400, 'Memphis'),
  (44, 'Hemiunu',      9,   420, 'Giza'),
  (45, 'Rahotep',      9,  2700, 'Saqqara'),
  (46, 'Meryet',       9,  1800, 'Memphis'),
  -- Year 10
  (47, 'Weni',        10,  3200, 'Giza'),
  (48, 'Mereruka',    10,  2950, 'Giza'),
  (49, 'Imhotep',     10,  2300, 'Memphis'),
  (50, 'Kagemni',     10,  2500, 'Memphis'),
  (51, 'Rahotep',     10,  2800, 'Saqqara'),
  -- Year 11
  (52, 'Weni',        11,  3000, 'Giza'),
  (53, 'Akhethotep',  11,  2200, 'Saqqara'),
  (54, 'Meryet',      11,  1750, 'Memphis'),
  (55, 'Mereruka',    11,  3100, 'Giza'),
  (56, 'Rahotep',     11,  2650, 'Saqqara'),
  -- Year 12
  (57, 'Weni',        12,  3400, 'Giza'),
  (58, 'Imhotep',     12,  2400, 'Memphis'),
  (59, 'Kagemni',     12,  2600, 'Memphis'),
  (60, 'Rahotep',     12,  2850, 'Saqqara');
