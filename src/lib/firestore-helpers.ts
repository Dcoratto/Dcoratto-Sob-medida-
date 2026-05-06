import { doc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

export async function deleteFirestoreDoc(collectionName: string, id: string) {
  if (!collectionName || !id) {
    window.alert("Não foi possível excluir: registro inválido.");
    return false;
  }

  try {
    const ref = doc(db, collectionName, id);
    await deleteDoc(ref);
    return true;
  } catch (error) {
    console.error("Erro ao excluir documento:", error);
    window.alert("Não foi possível excluir agora. Tente novamente em alguns instantes.");
    return false;
  }
}
