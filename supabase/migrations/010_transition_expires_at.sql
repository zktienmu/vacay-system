-- Add per-employee override for transition period expiry date
ALTER TABLE employees ADD COLUMN transition_expires_at DATE;

-- ZD and Jay: extend transition period to 2026-04-30
UPDATE employees SET transition_expires_at = '2026-04-30'
WHERE name IN ('ZD', 'Jay');
