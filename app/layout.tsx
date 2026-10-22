import type { Metadata, Viewport } from "next";
import { app } from "@/lib/copy/vi";
// Be Vietnam Pro, self-hosted (OFL-1.1): no request to Google from the children's devices,
// and builds do not depend on fonts.googleapis.com.
import "@fontsource/be-vietnam-pro/400.css";
import "@fontsource/be-vietnam-pro/500.css";
import "@fontsource/be-vietnam-pro/600.css";
import "@fontsource/be-vietnam-pro/700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: app.name,
  description: app.tagline,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#F4F5F0",
  colorScheme: "only light",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body className="min-h-dvh bg-paper font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
