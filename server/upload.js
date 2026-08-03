import { randomUUID } from "crypto";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import { getSupabase, isSupabaseConfigured } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
export const UPLOADS_DIR = path.join(ROOT, "data", "uploads");
const BUCKET = "scenario-images";
const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export function assertImageFile(file) {
  if (!file) throw new Error("No file uploaded");
  if (!ALLOWED.has(file.mimetype)) {
    throw new Error("Only JPEG, PNG, WebP, or GIF images are allowed");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Image must be 5MB or smaller");
  }
}

function extForMime(mime) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  return "jpg";
}

export async function saveUploadedImage(file) {
  assertImageFile(file);
  const ext = extForMime(file.mimetype);
  const name = `${Date.now()}-${randomUUID()}.${ext}`;

  if (isSupabaseConfigured()) {
    const sb = getSupabase();
    const objectPath = `scenarios/${name}`;
    const { error } = await sb.storage.from(BUCKET).upload(objectPath, file.buffer, {
      contentType: file.mimetype,
      upsert: false,
    });
    if (error) {
      const msg = error.message || "Upload failed";
      if (/bucket|not found|404/i.test(msg)) {
        throw new Error(
          "Storage bucket 'scenario-images' missing. Create a public bucket named scenario-images in Supabase."
        );
      }
      throw new Error(msg);
    }
    const { data } = sb.storage.from(BUCKET).getPublicUrl(objectPath);
    if (!data?.publicUrl) throw new Error("Could not resolve public URL");
    return data.publicUrl;
  }

  await fs.mkdir(UPLOADS_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOADS_DIR, name), file.buffer);
  return `/uploads/${name}`;
}
