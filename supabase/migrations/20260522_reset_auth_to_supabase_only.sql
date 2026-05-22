create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_master_admin boolean := lower(coalesce(new.email, '')) = 'brian_takiya77@outlook.com';
begin
  insert into public.profiles (id, auth_user_id, name, email, role, blocked)
  values (
    new.id::text,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1), 'Usuario'),
    coalesce(new.email, ''),
    case when is_master_admin then 'admin' else 'user' end,
    false
  )
  on conflict (id) do update
  set auth_user_id = excluded.auth_user_id,
      name = excluded.name,
      email = excluded.email,
      role = excluded.role,
      blocked = false;

  insert into public.users (id, auth_user_id, nome, name, email, role, permissions, blocked)
  values (
    new.id::text,
    new.id,
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1), 'Usuario'),
    coalesce(new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, ''), '@', 1), 'Usuario'),
    coalesce(new.email, ''),
    case when is_master_admin then 'administrativo' else 'vendedor' end,
    case when is_master_admin then
      '{
        "dashboard":{"visualizar":true},
        "orcamento":{"visualizar":true,"criar":true,"editar":true,"excluir":true,"aprovar":true},
        "historico":{"visualizar":true},
        "materiais":{"visualizar":true,"editar":true},
        "estoque":{"visualizar":true,"adicionar":true,"editar":true,"excluir":true,"movimentar":true},
        "relatorios":{"visualizar":true,"exportar":true,"verFaturamento":true,"verProdutividade":true},
        "admin":{"visualizarUsuarios":true,"alterarPermissoes":true,"excluirUsuarios":true},
        "cliente":{"visualizar":true,"editarDados":true,"alterarEtapa":true,"anexarArquivos":true,"avaliarFuncionarios":true,"verValores":true},
        "medicao":{"visualizar":true,"criar":true,"editar":true},
        "projeto":{"visualizar":true,"criar":true,"editar":true,"aprovar":true},
        "producao":{"visualizar":true,"alterarEtapa":true,"conferirMedidas":true,"finalizarProducao":true},
        "liberacao":{"visualizar":true,"aprovar":true,"reprovar":true}
      }'::jsonb
    else
      '{}'::jsonb
    end,
    false
  )
  on conflict (id) do update
  set auth_user_id = excluded.auth_user_id,
      nome = excluded.nome,
      name = excluded.name,
      email = excluded.email,
      role = excluded.role,
      permissions = excluded.permissions,
      blocked = false;

  return new;
end;
$$;
