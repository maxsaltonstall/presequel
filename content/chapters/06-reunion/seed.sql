-- Chapter 6 seed: Chrono Consulting's master ledger.
-- Three tables — clients, engagements, era_records — that together let
-- the player JOIN their way to Hemiunu's full footprint across history.

CREATE TABLE chrono_clients (
  client_id      INT PRIMARY KEY,
  name           TEXT NOT NULL,
  home_era       TEXT,
  status         TEXT NOT NULL
);

INSERT INTO chrono_clients VALUES
  ( 1, 'Pharaoh Menkaure',          'Old Kingdom Egypt',     'archived'),
  ( 2, 'Marcus Aurelius Quintus',   'Roman Empire, 165 CE',  'flagged'),
  ( 3, 'Lugalbanda Stylus',         'Sumer, 2400 BCE',       'flagged'),
  ( 4, 'Wei Bingxue',               'Han Dynasty',           'archived'),
  ( 5, 'Sir Edmund Pelham',         'Tudor England, 1567',   'flagged'),
  ( 6, 'Lorenzo Vespucci',          'Florence, 1487',        'archived'),
  ( 7, 'Aroha Te Kahu',             'Aotearoa, 1620',        'active'),
  ( 8, 'Beatrice Coxley',           '19th c. railroad',      'flagged'),
  ( 9, 'Olusegun Akande',           'Songhai Empire',        'archived'),
  (10, 'Hemiunu',                   'Old Kingdom Egypt',     'flagged'),
  (11, 'Oldrich',                   '1347 Prague',           'archived'),
  (12, 'Cornelius Grayson',         '1890 New York',         'archived'),
  (13, 'Gladys Vance',              '1920s Chicago',         'archived'),
  (14, 'Ji-eun Park',               'Joseon Dynasty',        'active'),
  (15, 'Carol',                     'Chrono HQ',             'active');

CREATE TABLE chrono_engagements (
  engagement_id  INT PRIMARY KEY,
  client_id      INT NOT NULL,
  era            TEXT NOT NULL,
  year           INT NOT NULL,
  anomaly_note   TEXT
);

INSERT INTO chrono_engagements VALUES
  -- Hemiunu's 5 engagements (one per prior chapter + Chrono HQ).
  ( 1, 10, 'Old Kingdom Egypt',  -2519, 'Anomalous overseer mark on small grain delivery'),
  ( 2, 10, '1347 Prague',         1347, 'Tavern patron, weekly visits all year'),
  ( 3, 10, '1890 New York',       1890, 'Census entry with no borough recorded'),
  ( 4, 10, '1927 Chicago',        1927, 'Speakeasy patron, name initially illegible'),
  ( 5, 10, 'Chrono HQ',           2026, 'Unauthorized access to time-portal infrastructure'),
  -- 4 decoy anomalies (other flagged clients, none named Hemiunu).
  ( 6,  3, 'Sumer, 2400 BCE',    -2400, 'Tablet year-on-year totals do not reconcile'),
  ( 7,  2, 'Roman Empire',         165, 'Payment in counterfeit silver denarii'),
  ( 8,  5, 'Tudor England',       1567, 'Missing inventory of monastic plate'),
  ( 9,  8, '19th c. railroad',    1872, 'Temporal-displacement claim, unverifiable'),
  -- 21 normal engagements (anomaly_note IS NULL).
  (10,  1, 'Old Kingdom Egypt',  -2530, NULL),
  (11,  1, 'Old Kingdom Egypt',  -2515, NULL),
  (12, 11, '1347 Prague',         1346, NULL),
  (13, 11, '1347 Prague',         1348, NULL),
  (14, 12, '1890 New York',       1889, NULL),
  (15, 12, '1890 New York',       1891, NULL),
  (16, 13, '1920s Chicago',       1925, NULL),
  (17, 13, '1920s Chicago',       1928, NULL),
  (18,  4, 'Han Dynasty',          200, NULL),
  (19,  6, 'Florence',            1485, NULL),
  (20,  6, 'Florence',            1490, NULL),
  (21,  7, 'Aotearoa',            1620, NULL),
  (22,  9, 'Songhai Empire',      1500, NULL),
  (23,  9, 'Songhai Empire',      1520, NULL),
  (24, 14, 'Joseon Dynasty',      1700, NULL),
  (25, 14, 'Joseon Dynasty',      1720, NULL),
  (26, 15, 'Chrono HQ',           2024, NULL),
  (27, 15, 'Chrono HQ',           2025, NULL),
  (28,  4, 'Han Dynasty',          210, NULL),
  (29,  2, 'Roman Empire',         170, NULL),
  (30,  5, 'Tudor England',       1570, NULL);

CREATE TABLE era_records (
  record_id      INT PRIMARY KEY,
  engagement_id  INT NOT NULL,
  detail         TEXT NOT NULL,
  location       TEXT,
  payment        TEXT
);

INSERT INTO era_records VALUES
  -- Hemiunu's 5 records — the chapter's narrative payoff.
  ( 1,  1, 'Overseer''s mark on small grain delivery — 420 units, year 9 of Menkaure', 'Saqqara',         'old coin'),
  ( 2,  2, 'Tavern patron, 52 weekly Wednesday visits, never aged',                    'Mala Strana',     'old coin'),
  ( 3,  3, 'Census entry id 3000 — no borough, no occupation recorded',                'unknown',         'none'),
  ( 4,  4, 'Speakeasy patron, March 14, $34 tab, name initially illegible',            'Hemlock Room',    'unmarked bills'),
  ( 5,  5, 'Unauthorized access to time-portal infrastructure',                        'internal',        '—'),
  -- Decoy anomaly details.
  ( 6,  6, 'Granary tablets show grain balances drifting upward year-over-year',       'Ur',              'silver shekels'),
  ( 7,  7, 'Counterfeit denarii — copper core under silver wash',                      'Ostia',           'counterfeit denarii'),
  ( 8,  8, 'Inventory of plate from three monasteries went unrecorded post-dissolution','Suffolk',        'crown bond'),
  ( 9,  9, 'Surveyor claimed to have walked four miles ahead of the rail line',        'Wyoming territory','company scrip'),
  -- Normal engagement details.
  (10, 10, 'Royal granary capacity audit, prep for next harvest',                      'Memphis',         'gold ring-money'),
  (11, 11, 'Scribal training program for junior accountants',                          'Memphis',         'gold ring-money'),
  (12, 12, 'Tax records reconciliation pre-plague',                                    'Mala Strana',     'groschen'),
  (13, 13, 'Tax records reconciliation post-plague',                                   'Mala Strana',     'groschen'),
  (14, 14, 'Population projection for new ward planning',                              'Lower Manhattan', 'gold dollars'),
  (15, 15, 'Demographic follow-up survey for charitable outreach',                     'Five Points',     'gold dollars'),
  (16, 16, 'Legal advisory on supplier contracts',                                     'Loop',            'cashier''s checks'),
  (17, 17, 'Financial reconciliation for liquor procurement',                          'Loop',            'cashier''s checks'),
  (18, 18, 'Provincial tribute accounting',                                            'Chang''an',       'wuzhu coins'),
  (19, 19, 'Bookkeeping for cloth-merchant guild',                                     'Mercato Vecchio', 'florins'),
  (20, 20, 'Estate inventory for Vespucci heirs',                                      'Mercato Vecchio', 'florins'),
  (21, 21, 'Trade records for harakeke export',                                        'Tāmaki Makaurau', 'pounamu (in kind)'),
  (22, 22, 'Salt-trade ledger reconciliation',                                         'Timbuktu',        'gold dust'),
  (23, 23, 'Manuscript inventory at the Sankore library',                              'Timbuktu',        'gold dust'),
  (24, 24, 'Royal granary audit prep',                                                 'Hanseong',        'sangpyeong tongbo'),
  (25, 25, 'Court ledger reconciliation',                                              'Hanseong',        'sangpyeong tongbo'),
  (26, 26, 'Internal expense reconciliation, Q3',                                      'internal',        '—'),
  (27, 27, 'Time-portal fuel budget review',                                           'internal',        '—'),
  (28, 28, 'Imperial postal reconciliation',                                           'Chang''an',       'wuzhu coins'),
  (29, 29, 'Senatorial estate audit',                                                  'Ostia',           'silver denarii'),
  (30, 30, 'Court advisor expenses for the Privy Council',                             'London',          'sovereigns');
