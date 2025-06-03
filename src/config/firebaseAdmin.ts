// config/firebaseAdmin.ts
import admin from "firebase-admin";
import { configDotenv } from "dotenv";

// Load environment variables
configDotenv();

// Initialize Firebase only once
if (!admin.apps.length) {
  try {
    // Try to use the service account from environment variable
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      // Parse the JSON string from environment variable
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

      // Fix the private_key formatting issue if needed
      if (
        serviceAccount.private_key &&
        serviceAccount.private_key.includes("\\n")
      ) {
        serviceAccount.private_key = serviceAccount.private_key.replace(
          /\\n/g,
          "\n"
        );
      }

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      console.log(
        "✅ Firebase initialized with project from env:",
        serviceAccount.project_id
      );
    } else {
      // Fallback to file-based initialization
      console.log(
        "⚠️ FIREBASE_SERVICE_ACCOUNT not found in environment, falling back to file"
      );

      // Import file system and path modules only if needed
      const path = await import("path");
      const { fileURLToPath } = await import("url");
      const fs = await import("fs");

      // ES module compatible __dirname
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);

      // Load the Firebase service account JSON from file
      const serviceAccountPath = path.join(
        __dirname,
        "../config/firebase-admin-sdk.json"
      );
      const serviceAccount = JSON.parse(
        fs.readFileSync(serviceAccountPath, "utf8")
      );

      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });

      console.log(
        "✅ Firebase initialized with project from file:",
        serviceAccount.project_id
      );
    }
  } catch (error) {
    console.error("❌ Error initializing Firebase Admin SDK:", error);

    // Initialize with default configuration as fallback
    admin.initializeApp({
      projectId: process.env.FIREBASE_PROJECT_ID || "play-app-9c4df",
    });

    console.warn(
      "⚠️ Firebase initialized without service account. Token verification may not work properly."
    );
  }
}

export default admin;
