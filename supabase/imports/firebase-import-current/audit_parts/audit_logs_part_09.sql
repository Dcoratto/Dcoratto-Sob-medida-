insert into public.audit_logs (id, user_id, user_email, user_name, action, module, target_id, old_value, new_value, created_at)
values
  ('BsccnumumPWuGxF7XrnS', 'JPSHn4Zeq4RhmdQO313pIW4mVJH2', 'brian_takiya77@outlook.com', 'brian_takiya77', 'change_user_permission', 'admin', 'VlN44VojjDaGp2AVF398Gc3btiD3', 'false'::jsonb, 'true'::jsonb, '2026-05-20T13:30:09.238Z'::timestamptz)

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

