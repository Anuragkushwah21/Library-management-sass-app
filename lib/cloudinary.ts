// lib/cloudinary.ts
import { v2 as cloudinary } from 'cloudinary';

/**
 * The env vars in this project are spelled `CLINT` instead of `CLIENT`.
 * Renaming them would be breaking (deployed environments still use the old
 * names), so we accept both — correct spelling first.
 */
const CLOUD_NAME =
  process.env.CLOUDINARY_CLOUD_NAME ||
  process.env.CLOUDINARY_CLIENT_NAME ||
  process.env.CLOUDINARY_CLINT_NAME;

const API_KEY =
  process.env.CLOUDINARY_API_KEY ||
  process.env.CLOUDINARY_CLIENT_API ||
  process.env.CLOUDINARY_CLINT_API;

const API_SECRET =
  process.env.CLOUDINARY_API_SECRET ||
  process.env.CLOUDINARY_CLIENT_SECRET ||
  process.env.CLOUDINARY_CLINT_SECRET;

export function isCloudinaryConfigured(): boolean {
  return Boolean(CLOUD_NAME && API_KEY && API_SECRET);
}

let configured = false;

function ensureConfigured() {
  if (configured) return;

  if (!isCloudinaryConfigured()) {
    throw new Error(
      'Cloudinary env vars missing (CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET).'
    );
  }

  cloudinary.config({
    cloud_name: CLOUD_NAME,
    api_key: API_KEY,
    api_secret: API_SECRET,
    secure: true,
  });

  configured = true;
}

export interface UploadResult {
  url: string;
  publicId: string;
}

/**
 * Uploads a buffer to Cloudinary. Avatars get a square crop with face-aware
 * gravity so photos of differing aspect ratios end up looking consistent.
 */
export async function uploadAvatar(
  buffer: Buffer,
  userId: string
): Promise<UploadResult> {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'librasaas/avatars',
        // Fixed per-user id, so the previous photo is overwritten; otherwise
        // every upload would leave an orphaned file behind
        public_id: userId,
        overwrite: true,
        invalidate: true,
        resource_type: 'image',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error('Cloudinary upload failed'));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );

    stream.end(buffer);
  });
}

export async function deleteAvatar(publicId: string): Promise<void> {
  ensureConfigured();
  await cloudinary.uploader.destroy(publicId, { invalidate: true });
}

/** Ad banners keep their aspect ratio; only capped in width. */
export async function uploadAdImage(buffer: Buffer): Promise<UploadResult> {
  ensureConfigured();

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'librasaas/ads',
        resource_type: 'image',
        transformation: [
          { width: 1600, crop: 'limit' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error || !result) {
          return reject(error || new Error('Cloudinary upload failed'));
        }
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );

    stream.end(buffer);
  });
}

/** Student photo: square crop, public (shown in lists). */
export async function uploadStudentPhoto(buffer: Buffer): Promise<UploadResult> {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'librasaas/students',
        resource_type: 'image',
        transformation: [
          { width: 400, height: 400, crop: 'fill', gravity: 'face' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      },
      (error, result) => {
        if (error || !result) return reject(error || new Error('Cloudinary upload failed'));
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(buffer);
  });
}

/**
 * ID proof: stored as an *authenticated* asset — there is no public URL.
 * Read it only through privateIdProofUrl() (PLAN D16).
 */
export async function uploadIdProof(
  buffer: Buffer,
  isPdf: boolean
): Promise<{ publicId: string; format: string; resourceType: string }> {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'librasaas/id-proofs',
        type: 'authenticated',
        resource_type: isPdf ? 'raw' : 'image',
        ...(isPdf ? { format: 'pdf' } : {}),
      },
      (error, result) => {
        if (error || !result) return reject(error || new Error('Cloudinary upload failed'));
        resolve({
          publicId: result.public_id,
          format: result.format || (isPdf ? 'pdf' : 'jpg'),
          resourceType: result.resource_type,
        });
      }
    );
    stream.end(buffer);
  });
}

/** Signed download link that stops working after `seconds`. */
export function privateIdProofUrl(
  proof: { publicId: string; format: string; resourceType: string },
  seconds = 300
): string {
  ensureConfigured();
  return cloudinary.utils.private_download_url(proof.publicId, proof.format, {
    resource_type: proof.resourceType,
    type: 'authenticated',
    expires_at: Math.floor(Date.now() / 1000) + seconds,
  });
}
