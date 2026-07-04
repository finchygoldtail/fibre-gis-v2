import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";


type AppRole =
  | "admin"
  | "super_user"
  | "maintenance_user"
  | "build_user"
  | "survey_user"
  | "client_admin"
  | "client_viewer";

type InfrastructureSector = "telecoms" | "gas" | "water" | "power" | "maps";

const DEFAULT_SECTOR: InfrastructureSector = "telecoms";

const normaliseRole = (value: unknown): AppRole => {
  if (
    value === "admin" ||
    value === "super_user" ||
    value === "maintenance_user" ||
    value === "build_user" ||
    value === "survey_user" ||
    value === "client_admin" ||
    value === "client_viewer"
  ) {
    return value;
  }

  return "survey_user";
};

const normaliseSector = (value: unknown): InfrastructureSector => {
  if (
    value === "gas" ||
    value === "water" ||
    value === "power" ||
    value === "maps"
  ) {
    return value;
  }

  return DEFAULT_SECTOR;
};

const normaliseAllowedSectors = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [DEFAULT_SECTOR];

  const cleaned = value
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean)
    .map((item) => (item === "*" ? item : normaliseSector(item)));

  return Array.from(new Set(cleaned));
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
  admin: {
    survey: true,
    build: true,
    maintenance: true,
    manageUsers: true,
  },
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
  client_admin: {
    survey: false,
    build: false,
    maintenance: false,
    manageUsers: false,
  },
  client_viewer: {
    survey: false,
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
    const sector = normaliseSector(request.data?.sector);
    const allowedSectors =
      role === "admin"
        ? ["*"]
        : normaliseAllowedSectors(request.data?.allowedSectors);

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
      (hasBusinessProfile && (callerRole === "admin" || callerRole === "super_user")) ||
      (hasRootProfile && (rootCallerRole === "admin" || rootCallerRole === "super_user"));

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
        businessId,
        sector: DEFAULT_SECTOR,
        allowedSectors: ["*"],
        allowedAreas: ["*"],
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
      businessId,
      sector,
      allowedSectors,
      allowedAreas: role === "admin" ? ["*"] : [],
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
