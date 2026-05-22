import {addDoc, collection, serverTimestamp} from './firestore';
import {AuthUser} from './auth';
import {db} from './firestore';
import {AccessUser} from '../types';

export const logAuditEvent = async ({
  user,
  action,
  module,
  targetId,
  oldValue,
  newValue,
}: {
  user?: AccessUser | AuthUser | null;
  action: string;
  module: string;
  targetId: string;
  oldValue?: unknown;
  newValue?: unknown;
}) => {
  if (!user) return;
  await addDoc(collection(db, 'auditLogs'), {
    userId: 'uid' in user ?user.uid : ('id' in user ? user.id : ''),
    userEmail: user.email || '',
    userName: 'nome' in user ?user.nome : user.user_metadata?.name || user.email || 'Usuário',
    action,
    module,
    targetId,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    createdAt: serverTimestamp(),
  }).catch(() => undefined);
};
