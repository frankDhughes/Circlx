import type { Metadata } from "next";
import { Rubik } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { ThemeProvider } from "next-themes";

const rubik = Rubik({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});


export const metadata: Metadata = {
  title: "Circlx",
  description: "Which one are you in?",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Miranda+Sans:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'Miranda Sans', sans-serif" }}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Toaster position="bottom-right" richColors />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}