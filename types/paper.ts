export type PaperRecord = {
  id: string;
  userId: string;
  originalFilename: string;
  storedFilename: string;
  contentType: string;
  sizeBytes: number;
  createdAt: string;
  updatedAt: string;
};

export type PaperWithUrls = PaperRecord & {
  fileUrl: string;
};