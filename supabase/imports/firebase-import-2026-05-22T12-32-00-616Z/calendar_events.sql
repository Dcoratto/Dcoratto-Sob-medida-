insert into public.calendar_events (id, title, description, date, date_key, client_id, client_name, city, event_time, created_by_uid, created_by_name, source_type, status, supplier, material_name, purchase_group_id, created_at, updated_at)
values
  ('NMngwQx3db1SR9FOz3tz', 'INSTALAÇÃO DA RODABE E FURAÇÃO DA TORRE DE TOMADA', 'INSTALAR RODABASE (DEIXAR RECUADO 10cm)
FURAR O PONTO DE TORRE DE TOMADA', '2026-05-26T16:00:00.000Z'::timestamptz, '2026-05-26', 'gEWmiJYzWgWREB5AWXRa', 'CARLOS CESAR ROMEIRO DA COSTA', 'São Paulo', '13:00', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'Brian Takiya', null, null, null, null, null, '2026-05-20T14:59:07.418Z'::timestamptz, '2026-05-20T15:38:48.134Z'::timestamptz),
  ('v271deaNkXHebwMFZP7o', 'MEDIÇÃO DE RODABASE', 'MEDIR RODABASE', '2026-05-20T20:00:00.000Z'::timestamptz, '2026-05-20', 'gEWmiJYzWgWREB5AWXRa', 'CARLOS CESAR ROMEIRO DA COSTA', 'São Paulo', '17:00', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'Brian Takiya', null, null, null, null, null, '2026-05-20T14:57:55.377Z'::timestamptz, '2026-05-20T14:57:55.377Z'::timestamptz),
  ('HJEu5kNmEhA1OQHJutWl', 'MONTAGEM', 'MEDIR BOX
MEDIR JANELA', '2026-05-29T18:00:00.000Z'::timestamptz, '2026-05-29', 'sDWIU7p2isgURnkQsUkC', 'BRUNO NEVES DOS SANTOS', 'São Paulo', '15:00', 'VlN44VojjDaGp2AVF398Gc3btiD3', 'fabioduarte232', null, null, null, null, null, '2026-05-21T12:57:00.806Z'::timestamptz, '2026-05-21T12:57:00.806Z'::timestamptz),
  ('tVizW4AHv08XDXu9rfuT', 'FURAÇÃO COOKTOP E TORNEIRA', 'Colar/Fixar cuba 
Fazer furo para torneira na pedra da churrasqueira
Fazer furação para o cooktop', '2026-05-26T12:00:00.000Z'::timestamptz, '2026-05-26', 'qwSnpzidNlTx1mmZ2g6J', 'ERICK IGNACIO RODRIGUES', 'São Paulo', '09:00', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'Brian Takiya', null, null, null, null, null, '2026-05-19T20:34:02.989Z'::timestamptz, '2026-05-19T20:34:02.989Z'::timestamptz)
on conflict (id) do update set
  title = excluded.title,
  description = excluded.description,
  date = excluded.date,
  date_key = excluded.date_key,
  client_id = excluded.client_id,
  client_name = excluded.client_name,
  city = excluded.city,
  event_time = excluded.event_time,
  created_by_uid = excluded.created_by_uid,
  created_by_name = excluded.created_by_name,
  source_type = excluded.source_type,
  status = excluded.status,
  supplier = excluded.supplier,
  material_name = excluded.material_name,
  purchase_group_id = excluded.purchase_group_id,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
