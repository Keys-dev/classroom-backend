import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { Resend } from "resend";

import { db } from "../db/index.js"; // your drizzle instance
import * as schema from "../db/schema/auth.js";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

export const auth = betterAuth({
  secret: process.env.BETTER_AUTH_SECRET || "classroom-default-secret-change-in-production",
  trustedOrigins: process.env.FRONTEND_URL ? [process.env.FRONTEND_URL] : undefined,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    sendResetPassword: async ({ user, url }) => {
      if (!resend) {
        console.warn("RESEND_API_KEY not configured — password reset link printed to console instead:", url);
        console.log(`Password reset link for ${user.email}: ${url}`);
        return;
      }
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || "Classroom <noreply@classroom.app>",
        to: user.email,
        subject: "Reset your password",
        html: `<p>Click the link below to reset your password:</p><p><a href="${url}">Reset password</a></p>`,
      });
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: true,
        defaultValue: "student",
        input: true, // Allow role to be set during registration
      },
      imageCldPubId: {
        type: "string",
        required: false,
        input: true, // Allow imageCldPubId to be set during registration
      },
    },
  },
});