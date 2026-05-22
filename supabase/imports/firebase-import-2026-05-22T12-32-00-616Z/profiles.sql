insert into public.profiles (id, auth_user_id, name, email, role, blocked, phone, photo_url, position, calendar_feed_token, created_at, updated_at)
values
  ('oQEE1LSKn3Rt4T9jUML4Ih4k2we2', null, 'Wellington Oliveira', 'welfernandes08@hotmail.com', 'user', false, null, null, null, null, null, null),
  ('ClKdFkNRd3VlAqX1BHEAV2YMEYs2', null, 'brian_takiya77', 'brian_takiya77@outlook.com', 'admin', false, null, null, null, null, null, null),
  ('a7HNZZyjLtZ9vwK2quKJzaCKaf73', null, 'vinny.iprisd', 'vinny.iprisd@gmail.com', 'user', false, null, null, null, '0ea6ce8eb30149f592d0ca73ed4bb112', null, null),
  ('E687XiV5FNhbdBQCVLeU5X9zRZl1', null, 'DOG', 'dogrecords4m@gmail.com', 'user', false, null, null, null, null, null, null),
  ('lr7O5vB69Zf5JuxgKkb5Q5ib1Am1', null, 'Jéssica Rodrigues Leite Benedito', 'jhessypresentes.s2@gmail.com', 'user', false, null, null, null, null, null, null),
  ('JPSHn4Zeq4RhmdQO313pIW4mVJH2', null, 'Brian Takiya', 'brian_takiya77@outlook.com', 'admin', false, '11961745136', null, 'Vendedor', '0ca3e041a3814689adec5c41c4606995', null, '2026-05-12T20:20:07.518Z'::timestamptz),
  ('VlN44VojjDaGp2AVF398Gc3btiD3', null, 'fabioduarte232', 'fabioduarte232@yahoo.com', 'user', false, null, null, null, '36c655d0435e4e518474233a22476af7', null, null),
  ('teaHQJYhs6YKcqKbuAj7Jli96sI2', null, 'brunocraftertb', 'brunocraftertb@gmail.com', 'user', false, null, null, null, null, null, null),
  ('oMgxor0aUPUPVrNNK1Q5E4hLjC63', null, 'Rafael Lucena', 'rafael.edf25@gmail.com', 'user', false, null, null, null, null, null, '2026-05-02T13:50:15.886Z'::timestamptz),
  ('zSxmWGUnKvc8XO4gyyoA630ypq22', null, 'rhhirakawa', 'rhhirakawa@gmail.com', 'user', false, null, null, null, '713779bab60648a5958868c6f909499d', null, null)
on conflict (id) do update set
  auth_user_id = excluded.auth_user_id,
  name = excluded.name,
  email = excluded.email,
  role = excluded.role,
  blocked = excluded.blocked,
  phone = excluded.phone,
  photo_url = excluded.photo_url,
  position = excluded.position,
  calendar_feed_token = excluded.calendar_feed_token,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
