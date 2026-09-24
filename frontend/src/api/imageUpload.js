// Photo upload - pick an image and put it in Supabase Storage
import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';
import { uploadBeaconPhoto } from './supabaseServices';

function canUseMobileWebCamera() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  const touchCapable = Number(navigator?.maxTouchPoints || 0) > 0 || 'ontouchstart' in window;
  return touchCapable || window.innerWidth <= 900;
}

function chooseWebImage({ capture = false } = {}) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    if (capture) input.setAttribute('capture', 'environment');
    input.style.position = 'fixed';
    input.style.left = '-10000px';
    input.style.opacity = '0';

    let settled = false;
    const finish = (file = null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener('focus', handleFocus);
      input.remove();
      resolve(file);
    };
    const handleFocus = () => {
      window.setTimeout(() => finish(input.files?.[0] || null), 300);
    };

    input.addEventListener('change', () => finish(input.files?.[0] || null), { once: true });
    input.addEventListener('cancel', () => finish(null), { once: true });
    window.addEventListener('focus', handleFocus, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

function extensionForAsset(asset, fallback = 'jpg') {
  const mimeExtension = String(asset?.type || '').split('/')[1];
  const nameExtension = String(asset?.name || asset?.uri || '').split('.').pop();
  const extension = (mimeExtension || nameExtension || fallback).toLowerCase().replace(/[^a-z0-9]/g, '');
  return extension === 'jpeg' ? 'jpg' : extension || fallback;
}

/**
 * Launches the camera or photo library and uploads the chosen image.
 * @param {'library'|'camera'} source camera is supported on native; web falls back to the file picker
 * @returns {Promise<{path: string, url: string}|null>} null if the user cancelled
 */
export async function pickAndUploadImage(source = 'library') {
  const useCamera = source === 'camera' && Platform.OS !== 'web';

  if (Platform.OS === 'web' && typeof document !== 'undefined') {
    const file = await chooseWebImage({ capture: source === 'camera' && canUseMobileWebCamera() });
    if (!file) return null;
    return uploadBeaconPhoto(file, extensionForAsset(file));
  }

  const permission = useCamera
    ? await ImagePicker.requestCameraPermissionsAsync()
    : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error(useCamera
      ? 'Camera access is needed to take a picture of the food.'
      : 'Photo access is needed to add a picture of the food.');
  }

  const launchOptions = {
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    quality: 0.7,
  };
  const result = useCamera
    ? await ImagePicker.launchCameraAsync(launchOptions)
    : await ImagePicker.launchImageLibraryAsync(launchOptions);

  if (result.canceled || !result.assets?.length) return null;

  const asset = result.assets[0];

  // Storage wants bytes. Web gives a blob: URI; native gives a file: URI, and
  // both need fetching before they can be uploaded.
  const blob = await fetch(asset.uri).then((res) => res.blob());
  return uploadBeaconPhoto(blob, extensionForAsset(asset));
}
