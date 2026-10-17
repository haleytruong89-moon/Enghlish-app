import { learnerFolder } from "./rules";
import type { FileStorage } from "./types";

/**
 * Delete every stored file of ONE child: the folder `{family}/{learner}/` of the private bucket `english-work`.
 *
 * Why this is separate from english.eng_purge_learner(): the purge function removes database rows only. Stored objects live in
 * Supabase Storage, outside the database (and outside pg_dump), so whoever purges a child must also call this. Order does not matter
 * (the folder name is built from ids, not read from the files table). Returns how many objects were removed.
 * Files in the family's `shared/` folder belong to no child and are never touched here.
 */
export async function deleteLearnerFolder(storage: FileStorage, familyId: string, learnerId: string): Promise<number> {
  return storage.removeFolder(learnerFolder(familyId, learnerId));
}
