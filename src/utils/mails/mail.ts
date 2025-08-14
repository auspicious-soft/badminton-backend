import { Resend } from "resend";
import { configDotenv } from "dotenv";
import ForgotPasswordEmail from "./templates/forget-password";
import LoginCredentials from "./templates/login-credentials";
import VerifyEmail from "./templates/email-verification";
import InvoiceEmail from "./templates/booking-invoice";

configDotenv();
const resend = new Resend(process.env.RESEND_API_KEY);

export const sendPasswordResetEmail = async (
  email: string,
  token: string,
  language: string = "eng"
) => {
  return await resend.emails.send({
    from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
    to: email,
    subject: "Reset your password",
    react: ForgotPasswordEmail({ otp: token, language }),
  });
};

export const sendLoginCredentialsEmail = async (
  email: string,
  password: string
) => {
  return await resend.emails.send({
    from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
    to: email,
    subject: "Login Credentials",
    react: LoginCredentials({ email: email || "", password: password || "" }),
  });
};

export const sendEmailVerificationMail = async (
  email: string,
  otp: string,
  language: string
) => {
  return await resend.emails.send({
    from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
    to: email,
    subject: "Verify Email",
    react: VerifyEmail({ otp: otp, language: language }),
  });
};

export const sendBookingInvoiceEmail = async (
  email: string,
  username: string,
  invoiceNumber: string,
  amount: string,
  pdfBuffer: Buffer
) => {
  return await resend.emails.send({
    from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
    to: email,
    subject: "Your Invoice is Ready",
    react: InvoiceEmail({ username, invoiceNumber, amount }),
    attachments: [
      {
        filename: `Booking-Invoice-${invoiceNumber}.pdf`,
        content: pdfBuffer.toString("base64"), // convert buffer to base64
      },
    ],
  });
};

export const addedUserCreds = async (payload: any) => {
  await resend.emails.send({
    from: process.env.COMPANY_RESEND_GMAIL_ACCOUNT as string,
    to: payload.email,
    subject: "Project Play - User Credentials",
    text: `Hello ${
      payload.name ? payload.name.eng : payload.fullName.eng
    },\n\nYour account has been created with the following credentials:\n\nEmail: ${
      payload.email
    }\nPassword: ${payload.password}\nRole: ${
      payload.role
    }\n\nPlease keep this information secure.`,
  });
};
