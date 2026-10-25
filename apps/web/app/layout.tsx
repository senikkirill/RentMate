import type { ReactNode } from "react";
import "./globals.css";

export const metadata = {
  title: "Мэйт OS",
  description: "Управление прокатом техники",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
