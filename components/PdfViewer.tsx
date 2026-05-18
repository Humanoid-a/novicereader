"use client";

import dynamic from "next/dynamic";
import type {
  AiAnnotation,
  AnnotationTarget,
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
  visualZoom: number;
  targetToReveal?: {
    targetId: string;
    nonce: number;
    behavior?: ScrollBehavior;
    animation?: "fast";
    trackVisualPosition?: boolean;
  } | null;
  currentSelection?: TextAnnotationTarget | RegionAnnotationTarget | null;
  currentSelectionTargets?: (TextAnnotationTarget | RegionAnnotationTarget)[];
  onPageStatusChange: (status: { currentPage: number; numPages: number }) => void;
  onTextSelected: (target: TextAnnotationTarget, append: boolean) => void;
  onRegionSelected: (region: RegionAnnotationTarget, append: boolean) => void;
  onAnnotationContextMenu: (annotations: AiAnnotation[], append: boolean) => void;
  onSelectionContextMenu: (targets: AnnotationTarget[], append: boolean) => void;
  onAnnotationContextMenuEmpty: () => void;
};

export default function PdfViewer({
  fileUrl,
  selectionTool,
  annotations,
  zoom,
  visualZoom,
  targetToReveal,
  currentSelection,
  currentSelectionTargets,
  onPageStatusChange,
  onTextSelected,
  onRegionSelected,
  onAnnotationContextMenu,
  onSelectionContextMenu,
  onAnnotationContextMenuEmpty,
}: PdfViewerProps) {
  return (
    <PdfViewerClient
      fileUrl={fileUrl}
      selectionTool={selectionTool}
      annotations={annotations}
      zoom={zoom}
      visualZoom={visualZoom}
      targetToReveal={targetToReveal}
      currentSelection={currentSelection}
      currentSelectionTargets={currentSelectionTargets}
      onPageStatusChange={onPageStatusChange}
      onTextSelected={onTextSelected}
      onRegionSelected={onRegionSelected}
      onAnnotationContextMenu={onAnnotationContextMenu}
      onSelectionContextMenu={onSelectionContextMenu}
      onAnnotationContextMenuEmpty={onAnnotationContextMenuEmpty}
    />
  );
}
