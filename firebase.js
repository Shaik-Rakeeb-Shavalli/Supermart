import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  orderBy,
  limit,
  serverTimestamp,
} from "firebase/firestore";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID,
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

// ─── HELPER: strip undefined/null so Firestore doesn't reject ────────────────
const clean = (obj) =>
  Object.fromEntries(
    Object.entries(obj).filter(([, v]) => v !== undefined && v !== null)
  );

// ─── FIRESTORE HELPERS ────────────────────────────────────────────────────────

/** Get all documents from a collection */
export const fbGet = async (col, limitN = 500) => {
  try {
    const q = query(collection(db, col), orderBy("createdAt", "asc"), limit(limitN));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch {
    try {
      const snap = await getDocs(collection(db, col));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err2) {
      console.error("fbGet error:", err2);
      return [];
    }
  }
};

/** Insert a document. THROWS on failure so caller can handle. */
export const fbInsert = async (col, data) => {
  const payload = clean({ ...data, createdAt: serverTimestamp() });
  console.log("fbInsert →", col, payload);
  const ref = await addDoc(collection(db, col), payload); // will throw on error
  const result = [{ id: ref.id, ...data }];
  console.log("fbInsert ✅ id:", ref.id);
  return result;
};

/** Update a document by Firestore string id. THROWS on failure. */
export const fbUpdate = async (col, id, data) => {
  const payload = clean({ ...data, updatedAt: serverTimestamp() });
  console.log("fbUpdate →", col, id, payload);
  await updateDoc(doc(db, col, String(id)), payload); // will throw on error
  console.log("fbUpdate ✅");
  return true;
};

/** Delete a document by Firestore string id. THROWS on failure. */
export const fbDelete = async (col, id) => {
  console.log("fbDelete →", col, id);
  await deleteDoc(doc(db, col, String(id))); // will throw on error
  console.log("fbDelete ✅");
  return true;
};
