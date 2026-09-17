import type { Metadata } from "next";
import { StudioProvider } from "@/components/pdf/store";
import { WebMCP } from "@/components/pdf/webmcp";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "PDF Studio by Jateen Kanoujiya — A little less work. A lot more flow.",
    template: "%s | PDF Studio by Jateen Kanoujiya",
  },
  description:
    "PDF Studio by Jateen Kanoujiya is a thoughtfully designed PDF workspace to merge, split, convert, and create with local document processing.",
  icons: { icon: "/favicon.svg" },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="dark" className="dark" suppressHydrationWarning>
      <body>
        <StudioProvider>
          <WebMCP />
          {children}
        </StudioProvider>
      </body>
    </html>
  );
}
