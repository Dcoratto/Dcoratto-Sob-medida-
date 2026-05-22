insert into public.fixture_catalog (id, name, category, brand, model, width, depth, height, diameter, image_url, manual_url, manual_file_name, notes, active, created_at, updated_at)
values
  ('Tu5A2EBuNAmD78BsIXxK', 'Tanque de Encaixe Hera 34 L em Aço Inox Polido', 'cooktop', 'Tramontina', null, 50, 40, 0, 0, null, null, 'MANUAL  .png', null, true, '2026-05-21T12:25:37.724Z'::timestamptz, '2026-05-21T12:25:37.724Z'::timestamptz),
  ('JG1sQ412qYsyGzwW7ciT', 'Lixeira Pia Cozinha Embutir 3l InoxCor Escovado', 'popUpTower', 'FRONTEL', null, 0, 0, 0, 13.3, null, null, 'MANUAL.png', null, true, '2026-05-21T12:30:48.245Z'::timestamptz, '2026-05-21T12:30:48.245Z'::timestamptz),
  ('zvTE755mW6AotvgWG9YB', 'Cuba Cozinha Gourmet Inox Escovado 304 Completa Prata', 'sink', 'Brinovar', 'CBQ5040PRA', 50, 40, 20, 0, null, null, 'MANUAL.png', null, true, '2026-05-19T16:36:51.579Z'::timestamptz, '2026-05-19T16:36:51.579Z'::timestamptz),
  ('C4LNqEsAftmQ3wXm2pYk', 'Cuba Gourmet para Cozinha Aço Inox 304', 'cooktop', 'Borari', null, 60, 42, 0, 0, null, null, 'MANUAL.png', null, true, '2026-05-21T12:21:43.433Z'::timestamptz, '2026-05-21T12:21:43.433Z'::timestamptz),
  ('cVdqn0ICeg9Yzrd0IMUf', 'Tanque Aço Inox Acetinado Com Válvula', 'cooktop', 'Br Cubas', null, 50, 40, 0, 0, null, null, 'MANUAL.png', null, true, '2026-05-21T12:23:50.942Z'::timestamptz, '2026-05-21T12:23:50.942Z'::timestamptz),
  ('wQlDPKt1VaeCbOEy4sJY', 'Cooktop de Indução 4 Bocas com Painel Touch', 'cooktop', 'Eos', 'Preto 7200w Eci04ep3 220v', 59, 52, 5.8, 0, null, null, 'MANUAL.png', null, true, '2026-05-19T16:31:40.312Z'::timestamptz, '2026-05-19T16:31:40.312Z'::timestamptz),
  ('30yzRUFx9GUoU909HqXh', 'Tanque de Encaixe Hera Compact 25 L em Aço Inox Polido', 'cooktop', 'Tramontina', null, 40, 40, 0, 0, null, null, 'MANUAL  .png', null, true, '2026-05-21T12:27:27.796Z'::timestamptz, '2026-05-21T12:27:27.796Z'::timestamptz),
  ('tqU9h6NH3hbr8AJxp2Pr', 'Cuba de Embutir Quadrada Slim Branco', 'sink', 'Deca', 'L.31030', 30, 30, 20, 0, null, null, 'MANUAL.png', null, true, '2026-05-19T16:41:56.204Z'::timestamptz, '2026-05-19T16:41:56.204Z'::timestamptz),
  ('vQDPCkYDZEojosQS9hwO', 'Torre Tomada Retrátil Multiplug Embutir Organizadora Usb Hub', 'popUpTower', null, null, 0, 0, 0, 6, null, null, 'MANUAL.png', 'ESPECIFICAÇÕES TÉCNICAS: - Aterramento: Padrão - Tensão: 110-250V (bivolt) - Potência: 2500W - Corrente: 10A - USB: 2.1A - Entradas: 3 Tomadas / 1 USB / 1 Tipo-C - Materiais: Alumínio anodizado e plástico - Conexões: Solda - Comprimento do Cabo: 1.7M', true, '2026-05-21T12:29:26.383Z'::timestamptz, '2026-05-21T12:29:26.383Z'::timestamptz)
on conflict (id) do update set
  name = excluded.name,
  category = excluded.category,
  brand = excluded.brand,
  model = excluded.model,
  width = excluded.width,
  depth = excluded.depth,
  height = excluded.height,
  diameter = excluded.diameter,
  image_url = excluded.image_url,
  manual_url = excluded.manual_url,
  manual_file_name = excluded.manual_file_name,
  notes = excluded.notes,
  active = excluded.active,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
