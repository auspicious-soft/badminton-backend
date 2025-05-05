import * as React from 'react';

import { Html, Button, Head, Container, Img } from "@react-email/components";
interface EmailProps {
  otp: string;
  language:string
}
const VerifyEmail: React.FC<Readonly<EmailProps>> = (props) => {
  const { otp, language } = props;
  const translations: { [key: string]: { subject: string; body: string; footer: string; expiry: string } } = {
    eng: {
      subject: "Verify Email",
      body: `Please use the OTP below to verify your email address.`,
      footer: `If you did not request this verification, please ignore this email.`,
      expiry: `This OTP will expire in 2 minutes.`
    },
    kaz: {
      subject: "Электрондық поштаны растау",
      body: `Электрондық пошта мекенжайыңызды растау үшін төмендегі OTP пайдаланыңыз.`,
      footer: `Егер сіз бұл растауды сұрамасаңыз, бұл хатты елемеңіз.`,
      expiry: `Бұл OTP 2 минут ішінде жарамсыз болады.`
    },
    rus: {
      subject: "Подтверждение электронной почты",
      body: `Пожалуйста, используйте OTP ниже, чтобы подтвердить свой адрес электронной почты.`,
      footer: `Если вы не запрашивали это подтверждение, просто проигнорируйте это письмо.`,
      expiry: `Этот OTP истечет через 2 минуты.`
    },
  };
  const { subject, body, footer, expiry } = translations[language] || translations.en;

  return (
    <Html lang="en">
      <Head>
        <title> Bookstagram Verify Email</title>
      </Head>
      <Container>
        <h1 style={{ color: "black" }}>{subject}</h1>
        <p style={{ color: "black" }}>{body}</p> - <b style={{ color: "black" }}>{otp}</b>
        <p style={{ color: "#6c757d" }}>{footer}</p>
        <p style={{ color: "#6c757d" }}>{expiry}</p>
      </Container>
    </Html>
  );
}
export default VerifyEmail
