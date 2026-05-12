"use client";

import dynamic from "next/dynamic";
import type {
  AiAnnotation,
  RegionAnnotationTarget,
  SelectionTool,
  TextAnnotationTarget,
} from "@/types/annotation";

const PdfViewerClient = dynamic(() => import("./PdfViewerClient"), {
  ssr: false,
  loading: () => <p>Loading PDF viewer...</p>,
});

type PdfViewerProps = {
  fileUrl: string;
  selectionTool: SelectionTool;
  annotations: AiAnnotation[];
  zoom: number;
  targetToReveal?: { targetId: string; nonce: number } | null;
  currentSelection?: TextAnnotationTarget | RegionAnnotationTarget | null;
  onPageStatusChange: (status: { currentPage: number; numPages: number }) => void;
  onTextSelected: (target: TextAnnotationTarget) => void;
  onRegionSelected: (region: RegionAnnotationTarget) => void;
  onAnnotationContextMenu: (annotations: AiAnnotation[]) => void;
  onAnnotationContextMenuEmpty: () => void;
};

export default function PdfViewer({
  fileUrl,
  selectionTool,
  annotations,
  zoom,
  targetToReveal,
  currentSelection,
  onPageStatusChange,
  onTextSelected,
  onRegionSelected,
  onAnnotationContextMenu,
  onAnnotationContextMenuEmpty,
}: PdfViewerProps) {
  return (
    <PdfViewerClient
      fileUrl={fileUrl}
      selectionTool={selectionTool}
      annotations={annotations}
      zoom={zoom}
      targetToReveal={targetToReveal}
      currentSelection={currentSelection}
      onPageStatusChange={onPageStatusChange}
      onTextSelected={onTextSelected}
      onRegionSelected={onRegionSelected}
      onAnnotationContextMenu={onAnnotationContextMenu}
      onAnnotationContextMenuEmpty={onAnnotationContextMenuEmpty}
    />
  );
}
