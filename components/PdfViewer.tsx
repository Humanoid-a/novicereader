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
  onTextSelected: (target: TextAnnotationTarget) => void;
  onRegionSelected: (region: RegionAnnotationTarget) => void;
  onAnnotationClick: (annotation: AiAnnotation) => void;
};

export default function PdfViewer({
  fileUrl,
  selectionTool,
  annotations,
  onTextSelected,
  onRegionSelected,
  onAnnotationClick,
}: PdfViewerProps) {
  return (
    <PdfViewerClient
      fileUrl={fileUrl}
      selectionTool={selectionTool}
      annotations={annotations}
      onTextSelected={onTextSelected}
      onRegionSelected={onRegionSelected}
      onAnnotationClick={onAnnotationClick}
    />
  );
}