import * as React from "react";

import { Html, Button, Head, Container, Img } from "@react-email/components";
interface EmailProps {
  otp: string;
  language: string;
}
const ForgotPasswordEmail: React.FC<Readonly<EmailProps>> = (props) => {
  const { otp, language } = props;
  const translations: { [key: string]: { subject: string; body: string; footer: string; expiry: string } } = {
    eng: {
      subject: "Project Play - Reset Password",
      body: `Below is the OTP for resetting your password.`,
      footer: `If you did not request the reset password, please ignore this email.`,
      expiry: `This OTP will expire in 2 minutes.`
    },
  };
  const { subject, body, footer, expiry } = translations[language] || translations.en;

  return (
    <Html lang="en">
      <Head>
        <title>Project Play - Reset Password</title>
      </Head>
      <Container>
        <h1 style={{ color: "black" }}>{subject}</h1>
        <p style={{ color: "black" }}>{body}</p> - <b style={{ color: "black" }}>{otp}</b>
        <p style={{ color: "#6c757d" }}>{footer}</p>
        <p style={{ color: "#6c757d" }}>{expiry}</p>
      </Container>
    </Html>
  );
};
export default ForgotPasswordEmail;
