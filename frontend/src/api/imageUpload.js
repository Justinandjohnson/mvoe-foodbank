// Photo upload - pick an image and put it in Supabase Storage
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { uploadBeaconPhoto } from './supabaseServices';

/**
 * Launches the photo picker and uploads the chosen image.
 * @returns {Promise<{path: string, url: string}|null>} null if the user cancelled
 */
export async function pickAndUploadImage() {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo access is needed to add a picture of the food.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
  });

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];

  // Storage wants bytes. Web gives a blob: URI; native gives a file: URI, and
  // both need fetching before they can be uploaded.
  const blob = await fetch(asset.uri).then((res) => res.blob());
  const extension = Platform.OS === 'web' ? 'jpg' : (asset.uri.split('.').pop() || 'jpg').toLowerCase();

  return uploadBeaconPhoto(blob, extension === 'jpeg' ? 'jpg' : extension);
}
