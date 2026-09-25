import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Image Studio",
  description: "OpenAI-compatible image generation and editing UI",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
