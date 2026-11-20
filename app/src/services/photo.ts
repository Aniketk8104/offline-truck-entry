import { Directory, File, Paths } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

const MAX_SIDE_PX = 1600;

// Opens the camera (not the gallery: the photo must be taken now). Returns a smaller JPEG in the
// cache folder, or null if the user closed the camera.
export async function takePhoto(): Promise<string | null> {
  const result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 });
  if (result.canceled) return null;
  const photo = result.assets[0];

  // Longer side at most 1600 px, JPEG at 70%: a few hundred KB instead of several MB,
  // so it uploads quickly on a weak network and stays far below the server's 8 MB limit.
  let image = ImageManipulator.manipulate(photo.uri);
  if (Math.max(photo.width, photo.height) > MAX_SIDE_PX) {
    image = image.resize(photo.width >= photo.height ? { width: MAX_SIDE_PX } : { height: MAX_SIDE_PX });
  }
  const rendered = await image.renderAsync();
  const saved = await rendered.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
  return saved.uri;
}

// Android may empty the cache folder at any time, so a saved entry's photo is copied into the
// app's documents folder, named after the entry id.
export async function keepPhoto(cacheUri: string, submissionId: string): Promise<string> {
  const folder = new Directory(Paths.document, 'photos');
  if (!folder.exists) folder.create({ intermediates: true });
  const target = new File(folder, `${submissionId}.jpg`);
  await new File(cacheUri).copy(target);
  return target.uri;
}

// Called once the server has the photo.
export function deletePhoto(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A leftover file only costs space; the entry itself is already on the server.
  }
}
