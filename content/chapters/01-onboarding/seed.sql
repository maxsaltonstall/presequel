-- Chapter 1: Onboarding at Chrono Consulting
-- The firm's own client ledger. Player is auditing it as their first task.

CREATE TABLE clients (
  id            INTEGER,
  name          VARCHAR,     -- client's surname or title
  era           VARCHAR,     -- rough historical period
  engagement    VARCHAR,     -- what the firm did for them
  year_started  INTEGER,     -- year in client's native calendar
  status        VARCHAR      -- 'active', 'closed', 'archived'
);

INSERT INTO clients VALUES
  (1,  'Menkaure',        'Old Kingdom Egypt',   'Grain audit',             9,    'active'),
  (2,  'Vance',           '1927 Chicago',        'Ledger reconciliation',   1927, 'active'),
  (3,  'Grayson',         '1890 NYC',            'Census analytics',        1890, 'active'),
  (4,  'Oldrich',         '1347 Prague',         'Customer segmentation',   1347, 'active'),
  (5,  'Caesar',          '46 BCE Rome',         'Tax rolls',               708,  'closed'),
  (6,  'Jefferson',       '1801 Virginia',       'Correspondence index',    1801, 'closed'),
  (7,  'Ashurbanipal',    '650 BCE Assyria',     'Library catalog',         32,   'archived'),
  (8,  'Murasaki',        '1001 Heian',          'Court gossip graph',      1,    'archived'),
  (9,  'Curie',           '1903 Paris',          'Lab notebook transcribe', 1903, 'active'),
  (10, 'Turing',          '1942 Bletchley',      'Classified',              1942, 'archived'),
  (11, 'Ada',             '1843 London',         'Notes G analysis',        1843, 'closed'),
  (12, 'Huygens',         '1657 The Hague',      'Clock-maker accounts',    1657, 'closed'),
  (13, 'Hemiunu',         'Old Kingdom Egypt',   'Pyramid supply lists',    4,    'active'),
  (14, 'Medici',          '1470 Florence',       'Merchant ledger',         1470, 'closed'),
  (15, 'Nightingale',     '1855 Scutari',        'Mortality statistics',    1855, 'closed'),
  (16, 'Eratosthenes',    '240 BCE Alexandria',  'Star catalog',            36,   'archived'),
  (17, 'Franklin',        '1752 Philadelphia',   'Weather observations',    1752, 'closed'),
  (18, 'Bernoulli',       '1738 Basel',          'Gambling probabilities',  1738, 'closed'),
  (19, 'Lovelace',        '1843 London',         'Analytical engine memos', 1843, 'closed'),
  (20, '???',             '87000 ???',           '???',                     87000,'active');
