import { put, del } from "@vercel/blob";
import { FileStore } from "./files";

export class BlobFileStore implements FileStore {
  async upload(candidateId: string, filename: string, contentType: string, bytes: Buffer) {
    const blob = await put(`attachments/${candidateId}/${crypto.randomUUID()}-${filename}`, bytes, {
      access: "public",
      contentType,
    });
    return { url: blob.url, size: bytes.length };
  }

  async remove(url: string) {
    await del(url).catch(() => undefined);
  }
}
