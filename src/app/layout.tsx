import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Assistant",
  description: "Your personal study assistant",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {/* Animated gradient orbs for liquid glass effect */}
        <div className="gradient-orb orb-1" />
        <div className="gradient-orb orb-2" />
        <div className="gradient-orb orb-3" />
        {children}
      </body>
    </html>
  );
}
