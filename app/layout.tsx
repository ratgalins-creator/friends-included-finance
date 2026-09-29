import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "Friends Included Finance",
  description: "Finance system for fictional wedding guests for hire"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
