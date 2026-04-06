import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

const normalizePrivateKey = (value) =>
  typeof value === "string" ? value.replace(/\\n/g, "\n").trim() : "";

const getFirebaseConfig = () => {
  const projectId = String(process.env.FIREBASE_PROJECT_ID || "").trim();
  const clientEmail = String(process.env.FIREBASE_CLIENT_EMAIL || "").trim();
  const privateKey = normalizePrivateKey(process.env.FIREBASE_PRIVATE_KEY);

  if (!projectId) {
    const error = new Error(
      "La autenticacion social no esta configurada en el servidor.",
    );
    error.statusCode = 500;
    throw error;
  }

  return {
    projectId,
    clientEmail,
    privateKey,
  };
};

const hasFirebaseServiceAccountCredentials = ({ clientEmail, privateKey }) =>
  Boolean(clientEmail && privateKey);

const getFirebaseAdminApp = () => {
  if (getApps().length > 0) {
    return getApps()[0];
  }

  const { projectId, clientEmail, privateKey } = getFirebaseConfig();

  if (hasFirebaseServiceAccountCredentials({ clientEmail, privateKey })) {
    return initializeApp({
      credential: cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  }

  return initializeApp({ projectId });
};

export const verifyFirebaseIdToken = async (idToken) => {
  const firebaseConfig = getFirebaseConfig();
  const auth = getAuth(getFirebaseAdminApp());
  const normalizedIdToken = String(idToken || "").trim();

  if (hasFirebaseServiceAccountCredentials(firebaseConfig)) {
    return auth.verifyIdToken(normalizedIdToken, true);
  }

  return auth.verifyIdToken(normalizedIdToken);
};
