-- Seed data: 1 league, 12 owners, 1 meeting year
-- Run after init.sql

-- Insert league
insert into leagues (id, name) values
  ('a0000000-0000-0000-0000-000000000001', 'TGIF Dynasty League');

-- Insert 12 owners (Virginia Founders = commissioner)
insert into owners (league_id, display_name, email, team_name, role) values
  ('a0000000-0000-0000-0000-000000000001', 'Commissioner', null, 'Virginia Founders', 'commissioner'),
  ('a0000000-0000-0000-0000-000000000001', 'Owner 2', null, 'Team Alpha', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', 'Owner 3', null, 'Team Bravo', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', 'Owner 4', null, 'Team Charlie', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', 'Owner 5', null, 'Team Delta', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', 'Owner 6', null, 'Team Echo', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', 'Owner 7', null, 'Team Foxtrot', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', 'Owner 8', null, 'Team Golf', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', 'Owner 9', null, 'Team Hotel', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', 'Owner 10', null, 'Team India', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', 'Owner 11', null, 'Team Juliet', 'owner'),
  ('a0000000-0000-0000-0000-000000000001', 'Owner 12', null, 'Team Kilo', 'owner');

-- Create a meeting for current year
insert into meetings (league_id, club_year, status) values
  ('a0000000-0000-0000-0000-000000000001', extract(year from now())::int, 'draft');
