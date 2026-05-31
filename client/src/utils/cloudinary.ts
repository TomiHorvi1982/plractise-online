export async function uploadToCloudinary(
  blob: Blob,
  cloudName: string,
  uploadPreset: string,
): Promise<string> {
  const formData = new FormData();
  formData.append('file', blob);
  formData.append('upload_preset', uploadPreset);

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Cloudinary upload failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.secure_url as string;
}

export async function fetchAudioFromUrl(url: string, ctx: AudioContext): Promise<AudioBuffer> {
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();
  return ctx.decodeAudioData(arrayBuffer);
}
