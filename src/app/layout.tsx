import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Pépé-Studio",
    description: "Interface desktop de gestion de LLM local et externe.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="fr">
            <body>{children}</body>
        </html>
    );
}
