import { doc, deleteDoc } from "firebase/firestore";
import { db } from "./firebase";

export async function deleteFirestoreDoc(collectionName: string, id: string) {
  console.log("Tentando excluir:", { collectionName, id });

  if (!collectionName || !id) {
    console.error("Coleção ou ID inválido", { collectionName, id });
    alert("Erro: coleção ou ID inválido.");
    return false;
  }

  try {
    const ref = doc(db, collectionName, id);
    console.log("Ref para excluir:", ref.path);

    await deleteDoc(ref);

    console.log("Documento excluído com sucesso:", ref.path);
    alert("Excluído com sucesso.");
    return true;
  } catch (error: any) {
    console.error("ERRO REAL AO EXCLUIR:", error);
    alert("Erro ao excluir: " + (error?.message || JSON.stringify(error)));
    return false;
  }
}
