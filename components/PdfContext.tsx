"use client";

import { createContext, useContext, useState } from "react";

type PdfContextType = {
  pdfFile: File | null;
  setPdfFile: (file: File | null) => void;
};

const PdfContext = createContext<PdfContextType | undefined>(undefined);

export function PdfProvider({ children }: { children: React.ReactNode }) {
  const [pdfFile, setPdfFile] = useState<File | null>(null);

  return (
    <PdfContext.Provider value={{ pdfFile, setPdfFile }}>
      {children}
    </PdfContext.Provider>
  );
}

export function usePdf() {
  const context = useContext(PdfContext);

  if (!context) {
    throw new Error("usePdf must be used inside PdfProvider");
  }

  return context;
}