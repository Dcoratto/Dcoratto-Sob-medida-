insert into public.user_material_prices (id, user_id, material_id, material_variant_key, base_cost_per_m2, base_minimum_sale_per_m2, margin_percentage, price_per_m2, final_price_per_m2, created_at, updated_at)
values
  ('JPSHn4Zeq4RhmdQO313pIW4mVJH2_preto-absoluto|lamina ultracompacta|chapa||polido|laminatto', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'preto-absoluto', 'preto-absoluto|lamina ultracompacta|chapa||polido|laminatto', 20, 2.5, 79900, 2000, 2000, null, '2026-05-18T18:06:28.292Z'::timestamptz),
  ('oMgxor0aUPUPVrNNK1Q5E4hLjC63_pedra-01', 'oMgxor0aUPUPVrNNK1Q5E4hLjC63', 'pedra-01', null, 11.848060472500652, null, 200, 35.54418141750196, null, null, '2026-05-07T15:55:00.149Z'::timestamptz),
  ('JPSHn4Zeq4RhmdQO313pIW4mVJH2_pedra-branco-siena', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'pedra-branco-siena', null, 20.833333333333332, null, 300, 83.33333333333333, null, null, '2026-05-09T15:45:03.700Z'::timestamptz),
  ('JPSHn4Zeq4RhmdQO313pIW4mVJH2_pedra-4', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'pedra-4', null, 3693.8534278959814, null, 200, 11081.560283687944, null, null, '2026-05-06T20:44:00.051Z'::timestamptz),
  ('JPSHn4Zeq4RhmdQO313pIW4mVJH2_marmore-gris-armani', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'marmore-gris-armani', null, 250, null, 200, 750, null, null, '2026-05-09T15:44:57.094Z'::timestamptz),
  ('JPSHn4Zeq4RhmdQO313pIW4mVJH2_marmore-branco-parana', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'marmore-branco-parana', null, 36.666666666666664, 36.666666666666664, 2354.5454545454545, 900, 900, null, '2026-05-13T14:32:21.291Z'::timestamptz),
  ('JPSHn4Zeq4RhmdQO313pIW4mVJH2_pedra-01', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'pedra-01', null, 11.848060472500652, null, 100, 23.696120945001304, null, null, '2026-05-06T12:12:50.343Z'::timestamptz)
on conflict (id) do update set
  user_id = excluded.user_id,
  material_id = excluded.material_id,
  material_variant_key = excluded.material_variant_key,
  base_cost_per_m2 = excluded.base_cost_per_m2,
  base_minimum_sale_per_m2 = excluded.base_minimum_sale_per_m2,
  margin_percentage = excluded.margin_percentage,
  price_per_m2 = excluded.price_per_m2,
  final_price_per_m2 = excluded.final_price_per_m2,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
