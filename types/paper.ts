export type PaperRecord = {
  id: string;
  userId: string;
  originalFilename: string;
  storedFilename: string;
  analysisProfileId?: string | null;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type PaperWithUrls = PaperRecord & {
  fileUrl: string;
};
