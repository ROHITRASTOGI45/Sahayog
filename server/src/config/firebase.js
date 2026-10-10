import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getMessaging as getAdminMessaging } from "firebase-admin/messaging";
import fs from "fs";

let firebaseApp;
const getCredential = () => {
  const path = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (path) {
    if (!fs.existsSync(path)) throw new Error(`Firebase service account not found: ${path}`);
    return cert(JSON.parse(fs.readFileSync(path, "utf8")));
  }
  return applicationDefault();
};
export const getFirebaseApp = () => {
  if (firebaseApp) return firebaseApp;
  firebaseApp = getApps().length ? getApps()[0] : initializeApp({ credential: getCredential() });
  return firebaseApp;
};
export const getMessaging = () => getAdminMessaging(getFirebaseApp());
