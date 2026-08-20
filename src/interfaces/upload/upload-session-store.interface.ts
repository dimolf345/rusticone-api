export interface IUploadSessionStore {
  /** Persists the given image URLs and returns a new upload session id. */
  save(imageUrls: string[]): Promise<string>;
  /** Returns the image URLs for the session, or null when missing or expired. */
  get(uploadSessionId: string): Promise<string[] | null>;
  /** Removes the session so the URLs can only be consumed once. */
  delete(uploadSessionId: string): Promise<void>;
}
