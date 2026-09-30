import { doc, deleteDoc } from './firestore';
import { db } from './firestore';

const isForeignKeyViolation = (error: unknown) => {
  const code = String((error as {code?: unknown})?.code || '');
  const message = String((error as {message?: unknown})?.message || error || '').toLowerCase();
  return code === '23503' || message.includes('violates foreign key constraint');
};

export async function deleteRecordDoc(collectionName: string, id: string) {
  if (!collectionName || !id) {
    window.alert('Não foi possível excluir: registro inválido.');
    return false;
  }

  try {
    const ref = doc(db, collectionName, id);
    await deleteDoc(ref);
    return true;
  } catch (error) {
    console.error('Erro ao excluir registro:', error);
    if (collectionName === 'clients' && isForeignKeyViolation(error)) {
      window.alert('Este cliente possui registros vinculados e não pode ser excluído definitivamente sem preservar ou revisar o histórico.');
      return false;
    }
    window.alert('Não foi possível excluir agora. Tente novamente em alguns instantes.');
    return false;
  }
}

export const deleteFirestoreDoc = deleteRecordDoc;

