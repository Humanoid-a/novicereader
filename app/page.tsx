"use client";

import { AppMenu } from "@/components/AppMenu";
import Link from "next/link";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  clearStoredAuthSession,
  deletePaper,
  getCurrentUser,
  getStoredAuthToken,
  listPapers,
  uploadPaper,
} from "@/lib/api";
import {
  deleteGuestPaper,
  endGuestServerSession,
  getGuestUserProfile,
  isGuestSessionActive,
  listGuestPapers,
  uploadGuestPaper,
} from "@/lib/guestSession";
import {
  deleteLocalPaper,
  isLocalPaperId,
  listLocalPapers,
  uploadLocalPaper,
} from "@/lib/localLibrary";
import type { PaperWithUrls } from "@/types/paper";
import type { UserProfile } from "@/types/user";

type DeleteConfirmation =
  | {
      type: "single";
      paper: PaperWithUrls;
    }
  | {
      type: "bulk";
      paperIds: string[];
    }
  | null;

type DraggedDocument = {
  name: string;
  sizeBytes: number | null;
  isValid: boolean;
};

function formatFileSize(sizeBytes: number) {
  if (sizeBytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  }

  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

function cleanPaperName(filename: string) {
  return filename.replace(/\.pdf$/i, "");
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

function isStorageLimitUploadError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();

  return message.includes("storage limit") || message.includes("space needs to be cleared");
}

function getDraggedDocument(event: DragEvent<HTMLElement>): DraggedDocument | null {
  const file = Array.from(event.dataTransfer.files).find(Boolean);

  if (file) {
    return {
      name: file.name || "Document",
      sizeBytes: file.size || null,
      isValid: isPdfFile(file),
    };
  }

  const item = Array.from(event.dataTransfer.items).find(
    (dragItem) => dragItem.kind === "file",
  );

  if (!item) {
    return null;
  }

  return {
    name: item.type === "application/pdf" ? "PDF document" : "Document",
    sizeBytes: null,
    isValid: item.type === "application/pdf",
  };
}

function DocumentIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M7 3.5h6l4 4v13H7v-17Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M13 3.5v4h4M9.5 12h5M9.5 15h5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TrashIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M9 5.5h6M4.5 7.5h15M7 7.5l.7 12h8.6l.7-12M10 10.5v6M14 10.5v6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function HomePage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const dragDepthRef = useRef(0);

  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [isGuestMode, setIsGuestMode] = useState(false);
  const [papers, setPapers] = useState<PaperWithUrls[]>([]);
  const [showAllPapers, setShowAllPapers] = useState(false);
  const [isLoadingPapers, setIsLoadingPapers] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingPaperId, setDeletingPaperId] = useState<string | null>(null);
  const [isSelectingPapers, setIsSelectingPapers] = useState(false);
  const [selectedPaperIds, setSelectedPaperIds] = useState<string[]>([]);
  const [deleteConfirmation, setDeleteConfirmation] =
    useState<DeleteConfirmation>(null);
  const [pendingGuestUploadFile, setPendingGuestUploadFile] =
    useState<File | null>(null);
  const [pendingLocalUploadFile, setPendingLocalUploadFile] =
    useState<File | null>(null);
  const [draggedDocument, setDraggedDocument] =
    useState<DraggedDocument | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let isMounted = true;
    const hasStoredAuthToken = Boolean(getStoredAuthToken());
    const hasGuestSession = isGuestSessionActive();

    if (!hasStoredAuthToken && !hasGuestSession) {
      router.replace("/login");
      return () => {
        isMounted = false;
      };
    }

    if (hasGuestSession && !hasStoredAuthToken) {
      setIsGuestMode(true);
      setCurrentUser(getGuestUserProfile());
    } else {
      setIsGuestMode(false);
    }

    async function loadDashboard() {
      setIsLoadingPapers(true);
      setError("");

      try {
        if (hasGuestSession && !hasStoredAuthToken) {
          const loadedPapers = await listGuestPapers();

          if (isMounted) {
            setPapers(
              [...loadedPapers].sort(
                (left, right) =>
                  new Date(right.updatedAt).getTime() -
                  new Date(left.updatedAt).getTime(),
              ),
            );
          }

          return;
        }

        const [loadedUser, loadedCloudPapers] = await Promise.all([
          getCurrentUser(),
          listPapers(),
        ]);
        const loadedLocalPapers = await listLocalPapers(loadedUser.id);
        const loadedPapers = [...loadedCloudPapers, ...loadedLocalPapers];

        if (isMounted) {
          setCurrentUser(loadedUser);
          setPapers(
            [...loadedPapers].sort(
              (left, right) =>
                new Date(right.updatedAt).getTime() -
                new Date(left.updatedAt).getTime(),
            ),
          );
        }
      } catch (error) {
        console.error(error);

        if (isMounted) {
          if (hasGuestSession && !hasStoredAuthToken) {
            setError("Failed to load guest papers.");
          } else {
            clearStoredAuthSession();
            router.replace("/login");
          }
        }
      } finally {
        if (isMounted) {
          setIsLoadingPapers(false);
        }
      }
    }

    loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [router]);

  useEffect(() => {
    if (!isGuestMode || papers.length === 0) {
      return;
    }

    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", warnBeforeLeaving);

    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
    };
  }, [isGuestMode, papers.length]);

  async function handlePdfUpload(file: File) {
    setIsUploading(true);
    setError("");

    try {
      const paper = isGuestMode
        ? await uploadGuestPaper(file)
        : await uploadPaper(file);
      router.push(`/reader/${paper.id}`);
    } catch (error) {
      console.error(error);

      if (!isGuestMode && isStorageLimitUploadError(error)) {
        setPendingLocalUploadFile(file);
        return;
      }

      setError(
        error instanceof Error
          ? error.message
          : isGuestMode
            ? "Failed to upload this PDF for the guest session."
            : "Failed to upload PDF. Make sure the backend is running.",
      );
    } finally {
      setIsUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  async function handleLocalFallbackUpload() {
    if (!pendingLocalUploadFile) {
      return;
    }

    const file = pendingLocalUploadFile;
    setPendingLocalUploadFile(null);
    setIsUploading(true);
    setError("");

    try {
      const paper = await uploadLocalPaper(
        file,
        currentUser?.id || "local-user",
      );
      router.push(`/reader/${paper.id}`);
    } catch (error) {
      console.error(error);
      setError(
        error instanceof Error
          ? error.message
          : "Failed to keep this PDF on this computer.",
      );
    } finally {
      setIsUploading(false);

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function cancelLocalFallbackUpload() {
    setPendingLocalUploadFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function requestPdfUpload(file: File) {
    if (isGuestMode) {
      setPendingGuestUploadFile(file);
      return;
    }

    handlePdfUpload(file);
  }

  function cancelGuestUpload() {
    setPendingGuestUploadFile(null);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function confirmGuestUpload() {
    if (!pendingGuestUploadFile) {
      return;
    }

    const file = pendingGuestUploadFile;
    setPendingGuestUploadFile(null);
    handlePdfUpload(file);
  }

  function handleLibraryDragEnter(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current += 1;
    setDraggedDocument(
      getDraggedDocument(event) ?? {
        name: "Document",
        sizeBytes: null,
        isValid: false,
      },
    );
  }

  function handleLibraryDragOver(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    const documentPreview = getDraggedDocument(event);

    if (documentPreview) {
      setDraggedDocument(documentPreview);
      event.dataTransfer.dropEffect = documentPreview.isValid ? "copy" : "none";
      return;
    }

    event.dataTransfer.dropEffect = "copy";
  }

  function handleLibraryDragLeave(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);

    if (dragDepthRef.current === 0) {
      setDraggedDocument(null);
    }
  }

  function handleLibraryDrop(event: DragEvent<HTMLElement>) {
    if (!event.dataTransfer.types.includes("Files")) {
      return;
    }

    event.preventDefault();
    dragDepthRef.current = 0;
    setDraggedDocument(null);

    const pdfFile = Array.from(event.dataTransfer.files).find(isPdfFile);

    if (!pdfFile) {
      setError("Only PDF documents can be uploaded.");
      return;
    }

    requestPdfUpload(pdfFile);
  }

  async function handleLogout() {
    if (isGuestMode) {
      await endGuestServerSession();
    } else {
      clearStoredAuthSession();
    }

    router.replace("/login");
  }

  function handleDeletePaper(paper: PaperWithUrls) {
    setDeleteConfirmation({
      type: "single",
      paper,
    });
  }

  async function confirmDeletePaper(paper: PaperWithUrls) {
    setDeleteConfirmation(null);

    setDeletingPaperId(paper.id);
    setError("");

    try {
      if (isGuestMode) {
        await deleteGuestPaper(paper.id);
      } else if (isLocalPaperId(paper.id)) {
        await deleteLocalPaper(paper.id);
      } else {
        await deletePaper(paper.id);
      }
      setPapers((currentPapers) =>
        currentPapers.filter((currentPaper) => currentPaper.id !== paper.id),
      );
      setSelectedPaperIds((currentSelectedIds) =>
        currentSelectedIds.filter((paperId) => paperId !== paper.id),
      );
    } catch (error) {
      console.error(error);
      setError("Failed to delete this paper. Make sure the backend is running.");
    } finally {
      setDeletingPaperId(null);
    }
  }

  function togglePaperSelection(paperId: string) {
    setSelectedPaperIds((currentSelectedIds) => {
      if (currentSelectedIds.includes(paperId)) {
        return currentSelectedIds.filter((selectedPaperId) => selectedPaperId !== paperId);
      }

      return [...currentSelectedIds, paperId];
    });
  }

  function closePaperSelection() {
    setIsSelectingPapers(false);
    setSelectedPaperIds([]);
  }

  function handleDeleteSelectedPapers() {
    if (selectedPaperIds.length === 0) {
      return;
    }

    setDeleteConfirmation({
      type: "bulk",
      paperIds: [...selectedPaperIds],
    });
  }

  async function confirmDeleteSelectedPapers(paperIds: string[]) {
    setDeleteConfirmation(null);

    const selectedIds = [...paperIds];
    setDeletingPaperId("selected");
    setError("");

    try {
      for (const paperId of selectedIds) {
        if (isGuestMode) {
          await deleteGuestPaper(paperId);
        } else if (isLocalPaperId(paperId)) {
          await deleteLocalPaper(paperId);
        } else {
          await deletePaper(paperId);
        }
      }

      setPapers((currentPapers) =>
        currentPapers.filter((paper) => !selectedIds.includes(paper.id)),
      );
      closePaperSelection();
    } catch (error) {
      console.error(error);
      setError("Failed to delete the selected papers. Make sure the backend is running.");
    } finally {
      setDeletingPaperId(null);
    }
  }

  async function handleConfirmDelete() {
    if (deleteConfirmation?.type === "single") {
      await confirmDeletePaper(deleteConfirmation.paper);
      return;
    }

    if (deleteConfirmation?.type === "bulk") {
      await confirmDeleteSelectedPapers(deleteConfirmation.paperIds);
    }
  }

  const visiblePapers = showAllPapers ? papers : papers.slice(0, 6);
  const hiddenPaperCount = Math.max(0, papers.length - visiblePapers.length);
  const deleteDocumentCount =
    deleteConfirmation?.type === "bulk"
      ? deleteConfirmation.paperIds.length
      : deleteConfirmation
        ? 1
        : 0;
  const deleteConfirmationTitle =
    deleteConfirmation?.type === "single"
      ? `Delete "${deleteConfirmation.paper.originalFilename}"?`
      : `Delete ${deleteDocumentCount} selected document${
          deleteDocumentCount === 1 ? "" : "s"
        }?`;
  const deleteConfirmationMessage =
    deleteConfirmation?.type === "single"
      ? isGuestMode
        ? "This will remove the guest document and its local browser backup."
        : "This will remove the document and its saved reader data."
      : isGuestMode
        ? "This will remove the selected guest documents and their local browser backups."
        : "This will remove the selected documents and their saved reader data.";

  return (
    <main className="min-h-screen bg-slate-100">
      <header className="flex h-14 items-center justify-between gap-3 border-b border-slate-200 bg-white px-5">
        <AppMenu />

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-slate-50 py-1 pl-1 pr-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {(currentUser?.displayName || currentUser?.username || "U")
                .slice(0, 2)
                .toUpperCase()}
            </div>
            <div className="leading-tight">
              <div className="text-sm font-medium text-slate-900">
                {currentUser?.displayName || "Loading"}
              </div>
              <div className="text-[11px] text-slate-500">
                {isGuestMode ? "Guest session" : currentUser?.username || ""}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 hover:text-slate-950"
          >
            {isGuestMode ? "Exit guest session" : "Log out"}
          </button>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-5xl flex-col px-5 py-10">
        <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">NoviceReader</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">
              {isGuestMode ? "Guest Papers" : "Your Papers"}
            </h1>
            {isGuestMode && (
              <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
                Guest PDFs use the normal cloud reader workflow and are also
                backed up locally in this browser, so this device keeps a local
                copy of the guest reading data.
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isSelectingPapers ? (
              <>
                <button
                  type="button"
                  onClick={closePaperSelection}
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={selectedPaperIds.length === 0 || deletingPaperId === "selected"}
                  onClick={handleDeleteSelectedPapers}
                  className="inline-flex items-center justify-center rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {deletingPaperId === "selected"
                    ? "Deleting..."
                    : `Delete selected${
                        selectedPaperIds.length > 0 ? ` (${selectedPaperIds.length})` : ""
                      }`}
                </button>
              </>
            ) : (
              papers.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsSelectingPapers(true)}
                  className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
                >
                  Select
                </button>
              )
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              disabled={isUploading}
              onChange={(event) => {
                const selectedFile = event.target.files?.[0];

                if (selectedFile) {
                  requestPdfUpload(selectedFile);
                }
              }}
              className="hidden"
            />
            <button
              type="button"
              disabled={isUploading}
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center justify-center rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isUploading ? "Uploading..." : "Upload new paper"}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div
          onDragEnter={handleLibraryDragEnter}
          onDragOver={handleLibraryDragOver}
          onDragLeave={handleLibraryDragLeave}
          onDrop={handleLibraryDrop}
          className={`relative rounded-xl border bg-white p-5 shadow-sm transition ${
            draggedDocument
              ? draggedDocument.isValid
                ? "border-slate-400 ring-2 ring-slate-900/10"
                : "border-red-300 ring-2 ring-red-100"
              : "border-slate-200"
          }`}
        >
          {draggedDocument && (
            <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white/95 backdrop-blur-sm">
              <div className="flex max-w-sm flex-col items-center text-center">
                <div
                  className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${
                    draggedDocument.isValid
                      ? "bg-slate-900 text-white"
                      : "bg-red-50 text-red-600"
                  }`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-8 w-8"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M12 5v14M5 12h14"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                    />
                  </svg>
                </div>
                <h2 className="text-base font-semibold text-slate-950">
                  {draggedDocument.isValid ? "Drop to upload" : "PDFs only"}
                </h2>
                <p className="mt-2 max-w-xs truncate text-sm text-slate-600">
                  {draggedDocument.name}
                </p>
                <p className="mt-1 text-xs font-medium text-slate-500">
                  {draggedDocument.sizeBytes !== null
                    ? formatFileSize(draggedDocument.sizeBytes)
                    : draggedDocument.isValid
                      ? "PDF document"
                      : "Unsupported document"}
                </p>
              </div>
            </div>
          )}

          {isLoadingPapers ? (
            <div className="flex min-h-64 items-center justify-center text-sm text-slate-500">
              Loading papers...
            </div>
          ) : papers.length === 0 ? (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-slate-400">
                <DocumentIcon className="h-7 w-7" />
              </div>
              <h2 className="text-base font-semibold text-slate-950">
                No papers yet
              </h2>
              <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                Upload a PDF research paper to start reading with explanations,
                annotations, and conversations.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visiblePapers.map((paper) => (
                <article
                  key={paper.id}
                  className={`group relative flex min-h-48 flex-col justify-between rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow-md ${
                    selectedPaperIds.includes(paper.id)
                      ? "border-slate-900 bg-white ring-2 ring-slate-900/10"
                      : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  {isSelectingPapers ? (
                    <button
                      type="button"
                      aria-label={
                        selectedPaperIds.includes(paper.id)
                          ? `Deselect ${paper.originalFilename}`
                          : `Select ${paper.originalFilename}`
                      }
                      onClick={() => togglePaperSelection(paper.id)}
                      className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:text-slate-950 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    >
                      <span
                        className={`flex h-4 w-4 items-center justify-center rounded border ${
                          selectedPaperIds.includes(paper.id)
                            ? "border-slate-900 bg-slate-900 text-white"
                            : "border-slate-300 bg-white"
                        }`}
                      >
                        {selectedPaperIds.includes(paper.id) && (
                          <svg
                            viewBox="0 0 16 16"
                            className="h-3 w-3"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="m3.5 8 3 3 6-6"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      aria-label={`Delete ${paper.originalFilename}`}
                      disabled={deletingPaperId === paper.id}
                      onClick={() => handleDeletePaper(paper)}
                      className="absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 opacity-0 transition hover:bg-red-50 hover:text-red-600 focus:opacity-100 focus:outline-none focus:ring-2 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50 group-hover:opacity-100"
                    >
                      {deletingPaperId === paper.id ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-300 border-t-red-500" />
                      ) : (
                        <TrashIcon className="h-4 w-4" />
                      )}
                    </button>
                  )}

                  {isSelectingPapers ? (
                    <button
                      type="button"
                      onClick={() => togglePaperSelection(paper.id)}
                      className="block pr-8 text-left"
                    >
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition group-hover:text-slate-900">
                        <DocumentIcon className="h-8 w-8" />
                      </div>

                      <h2 className="line-clamp-3 text-base font-semibold leading-6 text-slate-950">
                        {cleanPaperName(paper.originalFilename)}
                      </h2>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                        {paper.originalFilename}
                      </p>
                    </button>
                  ) : (
                    <Link href={`/reader/${paper.id}`} className="block pr-8">
                      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition group-hover:text-slate-900">
                        <DocumentIcon className="h-8 w-8" />
                      </div>

                      <h2 className="line-clamp-3 text-base font-semibold leading-6 text-slate-950">
                        {cleanPaperName(paper.originalFilename)}
                      </h2>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">
                        {paper.originalFilename}
                      </p>
                    </Link>
                  )}

                  <div className="mt-6 flex items-center justify-between border-t border-slate-200 pt-3 text-xs text-slate-500">
                    <span>{formatDate(paper.updatedAt)}</span>
                    <span>{formatFileSize(paper.sizeBytes)}</span>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!isLoadingPapers && hiddenPaperCount > 0 && (
            <div className="mt-5 flex justify-center border-t border-slate-100 pt-5">
              <button
                type="button"
                onClick={() => setShowAllPapers(true)}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
              >
                Show {hiddenPaperCount} more
              </button>
            </div>
          )}
        </div>
      </section>

      {pendingGuestUploadFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Cancel guest upload"
            className="absolute inset-0 bg-slate-950/30"
            onClick={cancelGuestUpload}
          />

          <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                <DocumentIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Upload as guest?
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  This PDF will be uploaded for the guest reader workflow and
                  also backed up locally in this browser. Annotation and
                  conversation data will work normally and this device keeps a
                  local guest backup.
                </p>
                <div className="mt-3 rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
                  <div className="truncate font-medium text-slate-800">
                    {pendingGuestUploadFile.name}
                  </div>
                  <div className="mt-1">
                    {formatFileSize(pendingGuestUploadFile.size)}
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelGuestUpload}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmGuestUpload}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Upload as guest
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingLocalUploadFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Go back"
            className="absolute inset-0 bg-slate-950/30"
            onClick={cancelLocalFallbackUpload}
          />

          <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
                <DocumentIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  Cloud storage is full
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  This PDF can be kept on this computer only. Delete files to
                  save future uploads to cloud.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelLocalFallbackUpload}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              >
                Go back
              </button>
              <button
                type="button"
                onClick={handleLocalFallbackUpload}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-700"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirmation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <button
            type="button"
            aria-label="Cancel delete"
            className="absolute inset-0 bg-slate-950/30"
            onClick={() => setDeleteConfirmation(null)}
          />

          <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600">
                <TrashIcon className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  {deleteConfirmationTitle}
                </h2>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {deleteConfirmationMessage}
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmation(null)}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 hover:text-slate-950"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
