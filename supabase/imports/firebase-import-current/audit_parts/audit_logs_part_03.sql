insert into public.audit_logs (id, user_id, user_email, user_name, action, module, target_id, old_value, new_value, created_at)
values
  ('G1D6T9D14fiSWRxzgUwn', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'delete_user_access', 'admin', 'E687XiV5FNhbdBQCVLeU5X9zRZl1', '{"uid":"E687XiV5FNhbdBQCVLeU5X9zRZl1","email":"dogrecords4m@gmail.com","createdAt":{"__type":"timestamp","iso":"2026-05-13T18:14:00.296Z","seconds":1778696040,"nanoseconds":296000000},"updatedAt":{"__type":"timestamp","iso":"2026-05-13T18:14:00.296Z","seconds":1778696040,"nanoseconds":296000000},"permissions":{"admin":{"excluirUsuarios":false,"visualizarUsuarios":false,"alterarPermissoes":false},"producao":{"alterarEtapa":false,"conferirMedidas":false,"visualizar":true,"finalizarProducao":false},"historico":{"visualizar":true},"cliente":{"visualizar":true,"editarDados":true,"alterarEtapa":true,"anexarArquivos":true,"avaliarFuncionarios":false},"materiais":{"visualizar":true,"editar":false},"relatorios":{"visualizar":false,"verFaturamento":false,"verProdutividade":false,"exportar":false},"medicao":{"criar":true,"visualizar":true,"editar":true},"estoque":{"editar":false,"movimentar":false,"excluir":false,"visualizar":false,"adicionar":false},"projeto":{"criar":true,"editar":true,"visualizar":true,"aprovar":false},"orcamento":{"criar":true,"editar":true,"excluir":false,"visualizar":true,"aprovar":false},"liberacao":{"visualizar":false,"aprovar":false,"reprovar":false},"dashboard":{"visualizar":true}},"blocked":false,"role":"vendedor","name":"DOG","nome":"DOG"}'::jsonb, null, '2026-05-13T18:14:23.654Z'::timestamptz),
  ('rvQXmjvPYVvvxwjOhTTt', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'zSxmWGUnKvc8XO4gyyoA630ypq22', 'false'::jsonb, 'true'::jsonb, '2026-05-20T13:31:01.057Z'::timestamptz),
  ('QO88fFb1doGGkgYNHCca', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'a7HNZZyjLtZ9vwK2quKJzaCKaf73', 'false'::jsonb, 'true'::jsonb, '2026-05-13T16:33:56.108Z'::timestamptz),
  ('s3TD2E06gmtYItB0B35Y', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'oMgxor0aUPUPVrNNK1Q5E4hLjC63', 'false'::jsonb, 'true'::jsonb, '2026-05-12T20:40:28.656Z'::timestamptz),
  ('56WAKnDPOOxY76v3eCra', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_role', 'admin', 'oMgxor0aUPUPVrNNK1Q5E4hLjC63', '"liberacao"'::jsonb, '"vendedor"'::jsonb, '2026-05-12T20:39:38.690Z'::timestamptz),
  ('SkRSVWPIVKaW4YImA34n', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'oMgxor0aUPUPVrNNK1Q5E4hLjC63', 'false'::jsonb, 'true'::jsonb, '2026-05-12T20:39:53.676Z'::timestamptz),
  ('F4K9ohsVI3cQWjzz46Sg', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'VlN44VojjDaGp2AVF398Gc3btiD3', 'false'::jsonb, 'true'::jsonb, '2026-05-20T13:29:59.134Z'::timestamptz),
  ('GSa4J2W9R3Cer9TNkdTZ', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'a7HNZZyjLtZ9vwK2quKJzaCKaf73', 'false'::jsonb, 'true'::jsonb, '2026-05-13T16:33:49.288Z'::timestamptz),
  ('ZGCKVDgGt9EkBmKREjL1', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'oMgxor0aUPUPVrNNK1Q5E4hLjC63', 'false'::jsonb, 'true'::jsonb, '2026-05-12T20:40:08.858Z'::timestamptz),
  ('oU7M2DXXPcMpDGgiUVMg', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'VlN44VojjDaGp2AVF398Gc3btiD3', 'false'::jsonb, 'true'::jsonb, '2026-05-20T13:30:13.317Z'::timestamptz),
  ('E8vtE7NvO6XEDhhcDbLj', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'teaHQJYhs6YKcqKbuAj7Jli96sI2', 'false'::jsonb, 'true'::jsonb, '2026-05-20T13:29:15.479Z'::timestamptz),
  ('wWZvezMgTqptJhPy2HTo', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'VlN44VojjDaGp2AVF398Gc3btiD3', 'true'::jsonb, 'false'::jsonb, '2026-05-20T13:30:03.577Z'::timestamptz),
  ('YJVt8S4DcjIgWS8M35Q6', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'a7HNZZyjLtZ9vwK2quKJzaCKaf73', 'false'::jsonb, 'true'::jsonb, '2026-05-20T13:31:34.737Z'::timestamptz),
  ('RLAh5xLD7n6XsXxUdKzZ', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'oMgxor0aUPUPVrNNK1Q5E4hLjC63', 'true'::jsonb, 'false'::jsonb, '2026-05-12T20:39:57.538Z'::timestamptz),
  ('0HhNJvBya83gHecanCdp', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_role', 'admin', 'a7HNZZyjLtZ9vwK2quKJzaCKaf73', '"administrativo"'::jsonb, '"vendedor"'::jsonb, '2026-05-20T13:31:26.378Z'::timestamptz),
  ('x6ITgo1ZpKUOI2zfXcOE', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'oMgxor0aUPUPVrNNK1Q5E4hLjC63', 'false'::jsonb, 'true'::jsonb, '2026-05-20T13:30:47.058Z'::timestamptz),
  ('lf3XxbscPQDf6khjTlx0', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'oMgxor0aUPUPVrNNK1Q5E4hLjC63', 'false'::jsonb, 'true'::jsonb, '2026-05-12T20:41:35.048Z'::timestamptz),
  ('uhLXlF4uhRrW7RZFgGxq', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_role', 'admin', 'oMgxor0aUPUPVrNNK1Q5E4hLjC63', '"coordenador"'::jsonb, '"vendedor"'::jsonb, '2026-05-12T20:43:03.317Z'::timestamptz),
  ('4R5zWO7cJhjJg9lArHYd', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_role', 'admin', 'teaHQJYhs6YKcqKbuAj7Jli96sI2', '"vendedor"'::jsonb, '"administrativo"'::jsonb, '2026-05-18T17:42:21.386Z'::timestamptz),
  ('U6blXwGhMAp4xVCgwTQw', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'oMgxor0aUPUPVrNNK1Q5E4hLjC63', 'false'::jsonb, 'true'::jsonb, '2026-05-12T20:42:26.265Z'::timestamptz)

on conflict (id) do update set
  user_id = excluded.user_id,
  user_email = excluded.user_email,
  user_name = excluded.user_name,
  action = excluded.action,
  module = excluded.module,
  target_id = excluded.target_id,
  old_value = excluded.old_value,
  new_value = excluded.new_value,
  created_at = excluded.created_at;

