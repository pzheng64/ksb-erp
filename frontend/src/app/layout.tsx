import type { Metadata } from "next";
import localFont from "next/font/local";
import { AuthProvider } from "@/lib/auth";
import { LocaleProvider } from "@/lib/i18n";
import { SettingsProvider } from "@/lib/settings";
import { ToastProvider } from "@/components/toast";
import "./globals.css";

const outfit = localFont({
  src: "../fonts/outfit-latin.woff2",
  variable: "--font-outfit",
  weight: "100 900",
  display: "swap",
});
const fraunces = localFont({
  src: "../fonts/fraunces-latin.woff2",
  variable: "--font-fraunces",
  weight: "100 900",
  display: "swap",
});

export const metadata: Metadata = {
  title: "KSB ERP",
  description: "Executive operations for KSB Group",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${outfit.variable} ${fraunces.variable} font-sans`}>
        <LocaleProvider>
          <SettingsProvider>
            <ToastProvider>
              <AuthProvider>{children}</AuthProvider>
            </ToastProvider>
          </SettingsProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
