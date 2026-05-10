"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { uploadPaper } from "@/lib/api";

export default function HomePage() {
  const router = useRouter();

  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");

  async function handlePdfUpload(file: File) {
    setIsUploading(true);
    setError("");

    try {
      const paper = await uploadPaper(file);
      router.push(`/reader/${paper.id}`);
    } catch (error) {
      console.error(error);
      setError("Failed to upload PDF. Make sure the backend is running.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <main className="min-h-screen bg-slate-100 p-8">
      <div className="mx-auto flex min-h-[80vh] max-w-4xl flex-col items-center justify-center">
        <div className="w-full rounded-2xl bg-white p-10 shadow-sm">
          <h1 className="text-4xl font-bold">NoviceReader</h1>

          <p className="mt-3 text-lg text-slate-600">
            Upload a research paper and get beginner-friendly explanations as
            you read.
          </p>

          <div className="mt-8 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8">
            <label className="block cursor-pointer">
              <span className="mb-3 block text-lg font-medium">
                Upload a PDF
              </span>

              <input
                type="file"
                accept="application/pdf"
                disabled={isUploading}
                onChange={(event) => {
                  const selectedFile = event.target.files?.[0];

                  if (selectedFile) {
                    handlePdfUpload(selectedFile);
                  }
                }}
                className="block w-full rounded-lg border bg-white p-3 disabled:opacity-50"
              />
            </label>

            <p className="mt-4 text-sm text-slate-500">
              Test user: <span className="font-mono">test-user-001</span>
            </p>

            {isUploading && (
              <p className="mt-4 text-sm font-medium text-slate-700">
                Uploading PDF...
              </p>
            )}

            {error && (
              <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
                {error}
              </p>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}