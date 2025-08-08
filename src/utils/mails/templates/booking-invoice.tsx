import * as React from "react";
import { Html, Head, Container } from "@react-email/components";

interface InvoiceEmailProps {
  username: string;
  invoiceNumber: string;
  amount: string;
}

const InvoiceEmail: React.FC<Readonly<InvoiceEmailProps>> = (props) => {
  const { username, invoiceNumber, amount } = props;

  return (
    <Html lang="en">
      <Head>
        <title>Your Invoice is Ready</title>
      </Head>
      <Container style={{ fontFamily: "Arial, sans-serif" }}>
        <h1 style={{ color: "black" }}>Your Invoice is Ready</h1>
        <p style={{ color: "black" }}>Hello {username},</p>
        <p style={{ color: "black" }}>
          Your invoice <strong>#{invoiceNumber}</strong> for{" "}
          <strong>{amount}</strong> has been generated.
        </p>
        <p style={{ color: "black" }}>
          Please find the PDF copy of your invoice attached to this email.
        </p>
        <p style={{ color: "#6c757d", marginTop: "20px" }}>
          If you have any questions regarding this invoice, please contact our
          support team.
        </p>
      </Container>
    </Html>
  );
};

export default InvoiceEmail;
