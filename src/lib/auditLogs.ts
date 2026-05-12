import {addDoc, collection, serverTimestamp} from 'firebase/firestore';
import {User} from 'firebase/auth';
import {db} from './firebase';
import {AccessUser} from '../types';

export const logAuditEvent = async ({
  user,
  action,
  module,
  targetId,
  oldValue,
  newValue,
}: {
  user?: AccessUser | User | null;
  action: string;
  module: string;
  targetId: string;
  oldValue?: unknown;
  newValue?: unknown;
}) => {
  if (!user) return;
  await addDoc(collection(db, 'auditLogs'), {
    userId: 'uid' in user ?user.uid : '',
    userEmail: user.email || '',
    userName: 'nome' in user ?user.nome : user.displayName || user.email || 'Usuário',
    action,
    module,
    targetId,
    oldValue: oldValue ?? null,
    newValue: newValue ?? null,
    createdAt: serverTimestamp(),
  }).catch(() => undefined);
};
