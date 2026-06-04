import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";

admin.initializeApp();

setGlobalOptions({
  region: "europe-west2",
  maxInstances: 10,
});

const normaliseRole = (value: unknown) => {
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

    const callerDoc = await admin
      .firestore()
      .doc(`businesses/${businessId}/users/${callerUid}`)
      .get();

    const callerRole = callerDoc.data()?.role;

    if (callerRole !== "super_user") {
      throw new HttpsError(
        "permission-denied",
        "Only Super Users can create logins.",
      );
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

    const permissionsByRole = {
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
      admin
        .firestore()
        .doc(`businesses/${businessId}/users/${userRecord.uid}`)
        .set(payload, { merge: true }),
      admin
        .firestore()
        .doc(`users/${userRecord.uid}`)
        .set(payload, { merge: true }),
    ]);

    return {
      success: true,
      uid: userRecord.uid,
      email,
      role,
    };
  },
);