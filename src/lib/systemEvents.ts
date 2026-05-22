import {addDoc, collection, serverTimestamp} from './firestore';
import {db} from './firebase';
import {SystemEvent} from '../types';

export type SystemEventInput = Omit<SystemEvent, 'id' | 'createdAt'>;

export const logSystemEvent = async (event: SystemEventInput) => {
  try {
    await addDoc(collection(db, 'systemEvents'), {
      ...event,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error('Erro ao registrar evento do sistema:', error);
  }
};
