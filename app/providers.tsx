"use client";

import { PdfProvider } from "@/components/PdfContext";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <PdfProvider>{children}</PdfProvider>;
}