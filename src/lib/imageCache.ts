export function precacheImages(urls: string[]): void {
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'PRECACHE_IMAGES',
      urls: urls.filter((url) => url && typeof url === 'string')
    });
  }
}

export function getCacheStatus(): Promise<{
  images: number;
  statics: number;
  data: number;
  version: string;
} | null> {
  return new Promise((resolve) => {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      resolve(null);
      return;
    }

    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    navigator.serviceWorker.controller.postMessage(
      { type: 'GET_CACHE_STATUS' },
      [messageChannel.port2]
    );

    setTimeout(() => resolve(null), 3000);
  });
}

export function clearImageCache(): Promise<boolean> {
  return new Promise((resolve) => {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) {
      resolve(false);
      return;
    }

    const messageChannel = new MessageChannel();
    messageChannel.port1.onmessage = (event) => {
      resolve(event.data?.success ?? false);
    };

    navigator.serviceWorker.controller.postMessage(
      { type: 'CLEAR_IMAGE_CACHE' },
      [messageChannel.port2]
    );

    setTimeout(() => resolve(false), 10000);
  });
}

export function preloadImage(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve();
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });
}

export async function preloadImagesInBatches(
  urls: string[],
  batchSize = 5
): Promise<void> {
  const validUrls = urls.filter((url) => url && typeof url === 'string');

  for (let i = 0; i < validUrls.length; i += batchSize) {
    const batch = validUrls.slice(i, i + batchSize);
    await Promise.allSettled(batch.map(preloadImage));
  }
}
