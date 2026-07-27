import type { Metadata } from "next";
import { PolarisProvider } from "@/components/providers/polaris-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "FrogmenDash",
  description: "ERP for Frogmen",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" data-theme="dark" className="dark" suppressHydrationWarning>
      <body>
        <PolarisProvider>{children}</PolarisProvider>
      </body>
    </html>
  );
}
