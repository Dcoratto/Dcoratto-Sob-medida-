import { doc, deleteDoc } from './firestore';
import { db } from './firestore';

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
    window.alert('Não foi possível excluir agora. Tente novamente em alguns instantes.');
    return false;
  }
}

export const deleteFirestoreDoc = deleteRecordDoc;

