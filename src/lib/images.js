// Photos are resized + compressed on the device before upload. That keeps the
// app fast on mobile data and lets photos live in Firestore (free Spark plan)
// instead of Cloud Storage, which now requires the paid Blaze plan.

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file could not be read as an image.'));
    };
    img.src = url;
  });
}

/**
 * Returns a JPEG data URL no larger than `maxChars` (Firestore docs cap at 1 MiB).
 * Large phone photos (~4-12 MB) typically land around 120-250 KB.
 */
export async function compressImage(file, { maxDim = 1080, maxChars = 600_000, crop = false } = {}) {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file (JPG or PNG).');
  const img = await loadImage(file);
  let { width: w, height: h } = img;
  let sx = 0;
  let sy = 0;
  let sw = w;
  let sh = h;
  if (crop) {
    // Square crop for avatars.
    const side = Math.min(w, h);
    sx = (w - side) / 2;
    sy = (h - side) / 2;
    sw = sh = side;
    w = h = side;
  }
  let dim = maxDim;
  for (let attempt = 0; attempt < 6; attempt++) {
    const scale = Math.min(1, dim / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    for (const q of [0.8, 0.7, 0.6, 0.5]) {
      const data = canvas.toDataURL('image/jpeg', q);
      if (data.length <= maxChars) return data;
    }
    dim = Math.round(dim * 0.75);
  }
  throw new Error('That photo is too large. Try a smaller one.');
}

export const IMAGE_REF_PREFIX = 'img:';

export function isImageRef(value) {
  return typeof value === 'string' && value.startsWith(IMAGE_REF_PREFIX);
}
