export type ICloudinaryUploader = (
  fileBuffer: Buffer,
  folder?: string
) => Promise<{ secure_url: string }>;

export interface IUploadedFile {
  buffer: Buffer;
}

export interface IUploadResult {
  uploadSessionId: string;
  imageUrls: string[];
}

export interface IUploadService {
  /** Uploads image buffers to storage and caches their URLs under a new session id. */
  uploadTemp(files: IUploadedFile[]): Promise<IUploadResult>;
}
