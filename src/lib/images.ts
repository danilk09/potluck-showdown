import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";

/**
 * Opens the camera or photo library. Returns the picked asset, or null if the
 * person cancelled. Throws a readable error when camera access is refused.
 */
export async function pickImage({
  camera = false,
  square = false,
}: {
  camera?: boolean;
  square?: boolean;
} = {}): Promise<ImagePicker.ImagePickerAsset | null> {
  const options: ImagePicker.ImagePickerOptions = {
    mediaTypes: ["images"],
    quality: 1,
    allowsEditing: square,
    aspect: square ? [1, 1] : undefined,
  };
  if (camera) {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error("Camera access is off. You can turn it on in your phone’s settings.");
  }
  const res = camera
    ? await ImagePicker.launchCameraAsync(options)
    : await ImagePicker.launchImageLibraryAsync(options);
  return res.canceled ? null : res.assets[0];
}

/**
 * Returns a JPEG data URL no larger than `maxChars`.
 */
export async function compressImage(
  asset: ImagePicker.ImagePickerAsset,
  {
    maxDim = 1080,
    maxChars = 600_000,
    crop = false,
  }: {
    maxDim?: number;
    maxChars?: number;
    crop?: boolean;
  } = {}
): Promise<string> {
  let { width: w, height: h } = asset;
  const side = Math.min(w, h);
  if (crop) w = h = side;
  let dim = maxDim;
  for (let attempt = 0; attempt < 6; attempt++) {
    const ctx = ImageManipulator.manipulate(asset.uri);
    // Square crop for avatars.
    if (crop && asset.width !== asset.height) {
      ctx.crop({ originX: (asset.width - side) / 2, originY: (asset.height - side) / 2, width: side, height: side });
    }
    if (Math.max(w, h) > dim) ctx.resize(w >= h ? { width: dim } : { height: dim });
    const image = await ctx.renderAsync();
    for (const compress of [0.8, 0.7, 0.6, 0.5]) {
      const { base64 } = await image.saveAsync({ compress, format: SaveFormat.JPEG, base64: true });
      const data = `data:image/jpeg;base64,${base64}`;
      if (data.length <= maxChars) return data;
    }
    dim = Math.round(Math.min(dim, Math.max(w, h)) * 0.75);
  }
  throw new Error("That photo is too large. Try a smaller one.");
}

export const IMAGE_REF_PREFIX = "img:";

export function isImageRef(value?: string | null): boolean {
  return typeof value === "string" && value.startsWith(IMAGE_REF_PREFIX);
}
