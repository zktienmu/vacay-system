-- Migration 007: Seed asana_user_gid for existing employees
-- Mapping based on Asana workspace users in Dinngo (68481685522246)
-- Please verify names match your employees table before running.

UPDATE employees SET asana_user_gid = '742685226638403'    WHERE LOWER(name) LIKE '%albert%';
UPDATE employees SET asana_user_gid = '1110340852872290'   WHERE LOWER(name) LIKE '%andy%';
UPDATE employees SET asana_user_gid = '695542997741101'    WHERE LOWER(name) LIKE '%ben%';
UPDATE employees SET asana_user_gid = '1202209919789564'   WHERE LOWER(name) LIKE '%bob%';
UPDATE employees SET asana_user_gid = '68481532773362'     WHERE LOWER(name) LIKE '%hsuanting%';
UPDATE employees SET asana_user_gid = '1152774090232539'   WHERE LOWER(name) LIKE '%javan%';
UPDATE employees SET asana_user_gid = '1115909411072267'   WHERE LOWER(name) LIKE '%jay%';
UPDATE employees SET asana_user_gid = '1201497010494735'   WHERE LOWER(name) LIKE '%jeff%';
UPDATE employees SET asana_user_gid = '1208089281611330'   WHERE LOWER(name) LIKE '%olivia%';
UPDATE employees SET asana_user_gid = '1208424403903025'   WHERE LOWER(name) LIKE '%rabby%';
UPDATE employees SET asana_user_gid = '1115903880278422'   WHERE LOWER(name) LIKE '%zd%';
