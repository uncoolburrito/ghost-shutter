import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GhostShutter | Canon EOS 70D & Photoshop Provenance",
  description: "GhostShutter: Strip AI Content Credentials (C2PA) and compose authentic Canon EOS 70D EXIF, MakerNotes, and Adobe Photoshop lineage.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#090a0f] text-slate-100 antialiased selection:bg-red-900 selection:text-white">
        {children}
      </body>
    </html>
  );
}
