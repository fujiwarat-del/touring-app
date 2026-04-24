const CLOUD_NAME = process.env.EXPO_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '';
const UPLOAD_PRESET = process.env.EXPO_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '';

/**
 * Upload a photo to Cloudinary using unsigned upload preset.
 * Returns the secure URL of the uploaded image.
 */
export async function uploadPhotoToCloudinary(localUri: string): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error('Cloudinary が未設定です');
  }

  const formData = new FormData();
  formData.append('file', {
    uri: localUri,
    type: 'image/jpeg',
    name: `photo_${Date.now()}.jpg`,
  } as any);
  formData.append('upload_preset', UPLOAD_PRESET);
  formData.append('folder', 'touring_app');

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`,
    {
      method: 'POST',
      body: formData,
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Cloudinary upload failed: ${err}`);
  }

  const data = await response.json();
  return data.secure_url as string;
}

/**
 * Upload multiple photos to Cloudinary in parallel.
 */
export async function uploadPhotos(localUris: string[]): Promise<string[]> {
  return Promise.all(localUris.map((uri) => uploadPhotoToCloudinary(uri)));
}
