insert into public.condominiums (id, name, city, address_mode, allowed_weekdays, work_start_hour, work_end_hour, block_national_holidays, block_city_holidays, notes, created_at, updated_at)
values
  ('QINoeIcx40lbFcdoHfFE', 'Aruã Ecopark Lagos', 'Mogi Das Cruzes', 'lot', '[0,1,2,3,4]'::jsonb, '08:00', '17:00', true, true, null, timezone('utc', now()), timezone('utc', now())),
  ('loBkEedr4HsiFG7aQbih', 'Aruã', 'Mogi Das Cruzes', 'lot', '[0,1,2,3,4]'::jsonb, '08:00', '17:00', true, true, null, timezone('utc', now()), timezone('utc', now())),
  ('q50vj4T1sLvH4bolhvms', 'Aruã Brisas II', 'Mogi Das Cruzes', 'lot', '[0,1,2,3,4]'::jsonb, '08:00', '17:00', true, true, null, timezone('utc', now()), timezone('utc', now())),
  ('b3K2Xqo2kemKp7VHwFsU', 'Condomínio Real Park II', 'Mogi Das Cruzes', 'lot', '[0,1,2,3,4]'::jsonb, '08:00', '17:00', true, true, null, timezone('utc', now()), timezone('utc', now())),
  ('FRCi7OrqxPs5ErNVi6Gw', 'Parque Firenze', 'São Paulo', 'street', '[0,1,2,3,4]'::jsonb, '08:00', '17:00', true, true, null, timezone('utc', now()), timezone('utc', now())),
  ('1sMGeff5ctb4agqnmMwt', 'Treviso', 'São Paulo', 'street', '[0,1,2,3,4]'::jsonb, '08:00', '17:00', true, true, null, timezone('utc', now()), timezone('utc', now())),
  ('aJB6QPCWmiCMGlSMkn7W', 'Linea Home Resort', 'São Paulo', 'street', '[0,1,2,3,4]'::jsonb, '08:00', '17:00', true, true, null, timezone('utc', now()), timezone('utc', now())),
  ('h8UiN8Un5ip3VgoUMTEl', 'Aruã Ecopark Lagos II', 'Mogi das Cruzes', 'lot', '[0,1,2,3,4]'::jsonb, '08:00', '17:00', true, true, null, timezone('utc', now()), timezone('utc', now())),
  ('Yu5GaSapNZ2Ti5xwkXJc', 'Monterrey Ville', 'Mogi Das Cruzes', 'lot', '[0,1,2,3,4]'::jsonb, '08:00', '17:00', true, true, null, timezone('utc', now()), timezone('utc', now())),
  ('lVQdhuAHfipDlWyWPVt9', 'Residencial Terra do sol', 'Suzano', 'street', '[0,1,2,3,4]'::jsonb, '08:00', '17:00', true, true, null, timezone('utc', now()), timezone('utc', now()))
on conflict (id) do update set
  name = excluded.name,
  city = excluded.city,
  address_mode = excluded.address_mode,
  allowed_weekdays = excluded.allowed_weekdays,
  work_start_hour = excluded.work_start_hour,
  work_end_hour = excluded.work_end_hour,
  block_national_holidays = excluded.block_national_holidays,
  block_city_holidays = excluded.block_city_holidays,
  notes = excluded.notes,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
