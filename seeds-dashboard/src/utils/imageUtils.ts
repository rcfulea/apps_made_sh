/**
 * Converts a CSV image path to a usable image URL
 * CSV format: "Our%20garden%2093e00b18daa6406bb774d7fac429385d/IMG_9302.jpg"
 * We extract just the filename and serve from /images/
 */
export function parseImagePath(imagePath: string): string[] {
    if (!imagePath || imagePath.trim() === '') {
        return [];
    }

    // Split by comma if multiple images
    const paths = imagePath.split(',').map(p => p.trim());

    return paths.map(path => {
        // Decode the URL-encoded path
        const decoded = decodeURIComponent(path);
        // Extract just the filename (after the last /)
        const filename = decoded.split('/').pop() || '';
        return `/images/${filename}`;
    }).filter(p => p !== '/images/');
}

/**
 * Returns a placeholder image if no image is available
 */
export function getPlantImage(images: string[]): string {
    if (images.length > 0) {
        return images[0];
    }
    return '/images/placeholder.svg';
}

/**
 * Check if an image exists (for error handling)
 */
export function handleImageError(e: React.SyntheticEvent<HTMLImageElement>) {
    const target = e.target as HTMLImageElement;
    target.src = '/images/placeholder.svg';
    target.onerror = null;
}
