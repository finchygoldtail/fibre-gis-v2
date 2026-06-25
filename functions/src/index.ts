import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";


type AppRole = "super_user" | "maintenance_user" | "build_user" | "survey_user";

const normaliseRole = (value: unknown): AppRole => {
  if (
    value === "super_user" ||
    value === "maintenance_user" ||
    value === "build_user" ||
    value === "survey_user"
  ) {
    return value;
  }

  return "survey_user";
};

const OWNER_EMAILS = new Set([
  "alistairlgrantham@gmail.com",
  "alistair.grantham@brsk.co.uk",
]);

const permissionsByRole: Record<AppRole, {
  survey: boolean;
  build: boolean;
  maintenance: boolean;
  manageUsers: boolean;
}> = {
  super_user: {
    survey: true,
    build: true,
    maintenance: true,
    manageUsers: true,
  },
  maintenance_user: {
    survey: false,
    build: false,
    maintenance: true,
    manageUsers: false,
  },
  build_user: {
    survey: true,
    build: true,
    maintenance: false,
    manageUsers: false,
  },
  survey_user: {
    survey: true,
    build: false,
    maintenance: false,
    manageUsers: false,
  },
};

export const createLoginUser = onCall(
  {
    region: "europe-west2",
    cors: true,
  },
  async (request) => {
    const callerUid = request.auth?.uid;

    if (!callerUid) {
      throw new HttpsError("unauthenticated", "You must be signed in.");
    }

    const businessId =
      typeof request.data?.businessId === "string" && request.data.businessId.trim()
        ? request.data.businessId.trim()
        : "fibre-gis-v2";

    const name =
      typeof request.data?.name === "string" ? request.data.name.trim() : "";

    const email =
      typeof request.data?.email === "string"
        ? request.data.email.trim().toLowerCase()
        : "";

    const password =
      typeof request.data?.password === "string" ? request.data.password : "";

    const role = normaliseRole(request.data?.role);

    if (!name || !email || !password) {
      throw new HttpsError("invalid-argument", "Missing required fields.");
    }

    if (password.length < 6) {
      throw new HttpsError(
        "invalid-argument",
        "Temporary password must be at least 6 characters.",
      );
    }

    const firestore = admin.firestore();
    const callerRecord = await admin.auth().getUser(callerUid);
    const callerEmail = String(callerRecord.email || "").trim().toLowerCase();

    const [callerDoc, rootCallerDoc, businessUsersSnapshot] = await Promise.all([
      firestore.doc(`businesses/${businessId}/users/${callerUid}`).get(),
      firestore.doc(`users/${callerUid}`).get(),
      firestore.collection(`businesses/${businessId}/users`).limit(1).get(),
    ]);

    const callerRole = normaliseRole(callerDoc.data()?.role);
    const rootCallerRole = normaliseRole(rootCallerDoc.data()?.role);
    const hasBusinessProfile = callerDoc.exists;
    const hasRootProfile = rootCallerDoc.exists;

    const isFirestoreSuperUser =
      (hasBusinessProfile && callerRole === "super_user") ||
      (hasRootProfile && rootCallerRole === "super_user");

    const isBootstrapOwner =
      OWNER_EMAILS.has(callerEmail) &&
      (businessUsersSnapshot.empty || !hasBusinessProfile || !hasRootProfile);

    if (!isFirestoreSuperUser && !isBootstrapOwner) {
      throw new HttpsError(
        "permission-denied",
        "Only Super Users can create logins.",
      );
    }

    if (isBootstrapOwner && !isFirestoreSuperUser) {
      const ownerPayload = {
        uid: callerUid,
        name: callerRecord.displayName || callerEmail || "Super User",
        email: callerEmail,
        role: "super_user" as AppRole,
        permissions: permissionsByRole.super_user,
        active: true,
        createdBy: callerUid,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        bootstrapOwner: true,
      };

      await Promise.all([
        firestore
          .doc(`businesses/${businessId}/users/${callerUid}`)
          .set(ownerPayload, { merge: true }),
        firestore.doc(`users/${callerUid}`).set(ownerPayload, { merge: true }),
      ]);
    }

    let userRecord: admin.auth.UserRecord;

    try {
      userRecord = await admin.auth().createUser({
        email,
        password,
        displayName: name,
      });
    } catch (err: any) {
      if (err?.code === "auth/email-already-exists") {
        userRecord = await admin.auth().getUserByEmail(email);
        await admin.auth().updateUser(userRecord.uid, {
          displayName: name,
          password,
          disabled: false,
        });
      } else {
        console.error("Failed to create Firebase Auth user", err);
        throw new HttpsError(
          "internal",
          err?.message || "Failed to create Firebase Auth user.",
        );
      }
    }

    const payload = {
      uid: userRecord.uid,
      name,
      email,
      role,
      permissions: permissionsByRole[role],
      active: true,
      createdBy: callerUid,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await Promise.all([
      firestore
        .doc(`businesses/${businessId}/users/${userRecord.uid}`)
        .set(payload, { merge: true }),
      firestore.doc(`users/${userRecord.uid}`).set(payload, { merge: true }),
    ]);

    return {
      success: true,
      uid: userRecord.uid,
      email,
      role,
    };
  },
);
