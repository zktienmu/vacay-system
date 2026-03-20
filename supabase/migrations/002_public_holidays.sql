-- Public holidays table
CREATE TABLE public_holidays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  year INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_public_holidays_date ON public_holidays (date);
CREATE INDEX idx_public_holidays_year ON public_holidays (year);

-- Enable RLS
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;

-- RLS policies: everyone can read, admins write (enforced at app level via service_role)
CREATE POLICY "public_holidays_select" ON public_holidays FOR SELECT USING (true);
CREATE POLICY "public_holidays_insert" ON public_holidays FOR INSERT WITH CHECK (true);
CREATE POLICY "public_holidays_update" ON public_holidays FOR UPDATE USING (true);
CREATE POLICY "public_holidays_delete" ON public_holidays FOR DELETE USING (true);

-- Apply updated_at trigger
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public_holidays
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Seed Taiwan 2026 public holidays
INSERT INTO public_holidays (date, name, description, year) VALUES
  ('2026-01-01', '元旦', '中華民國開國紀念日', 2026),
  ('2026-01-02', '元旦補假', '元旦補假', 2026),
  ('2026-02-15', '農曆除夕', '農曆春節', 2026),
  ('2026-02-16', '農曆新年初一', '農曆春節', 2026),
  ('2026-02-17', '農曆新年初二', '農曆春節', 2026),
  ('2026-02-18', '農曆新年初三', '農曆春節', 2026),
  ('2026-02-19', '農曆春節補假', '農曆春節補假', 2026),
  ('2026-02-20', '農曆春節補假', '農曆春節補假', 2026),
  ('2026-02-28', '228和平紀念日', '二二八和平紀念日', 2026),
  ('2026-04-04', '兒童節', '兒童節', 2026),
  ('2026-04-05', '清明節', '清明節', 2026),
  ('2026-04-06', '清明節補假', '清明節補假', 2026),
  ('2026-05-01', '勞動節', '勞動節', 2026),
  ('2026-05-31', '端午節', '端午節', 2026),
  ('2026-10-06', '中秋節', '中秋節', 2026),
  ('2026-10-10', '國慶日', '中華民國國慶日', 2026);
