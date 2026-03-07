import type { Plant } from '../data/types';

const API_BASE = '/api';

export async function fetchPlants(): Promise<Plant[]> {
    const response = await fetch(`${API_BASE}/plants`);
    if (!response.ok) {
        throw new Error('Failed to fetch plants');
    }
    return response.json();
}

export async function createPlant(plant: Omit<Plant, 'id'>): Promise<Plant> {
    const response = await fetch(`${API_BASE}/plants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plant),
    });
    if (!response.ok) {
        throw new Error('Failed to create plant');
    }
    return response.json();
}

export async function updatePlant(id: number, plant: Partial<Plant>): Promise<Plant> {
    const response = await fetch(`${API_BASE}/plants/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plant),
    });
    if (!response.ok) {
        throw new Error('Failed to update plant');
    }
    return response.json();
}

export async function deletePlant(id: number): Promise<void> {
    const response = await fetch(`${API_BASE}/plants/${id}`, {
        method: 'DELETE',
    });
    if (!response.ok) {
        throw new Error('Failed to delete plant');
    }
}

export async function uploadImages(files: File[]): Promise<string[]> {
    const formData = new FormData();
    files.forEach(file => formData.append('images', file));

    const response = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
    });
    if (!response.ok) {
        throw new Error('Failed to upload images');
    }
    const data = await response.json();
    return data.images;
}

export async function uploadImagesToPlant(plantId: number, files: File[]): Promise<string[]> {
    const formData = new FormData();
    files.forEach(file => formData.append('images', file));

    const response = await fetch(`${API_BASE}/plants/${plantId}/images`, {
        method: 'POST',
        body: formData,
    });
    if (!response.ok) {
        throw new Error('Failed to upload images');
    }
    const data = await response.json();
    return data.images;
}

export async function deleteImageFromPlant(plantId: number, imagePath: string): Promise<void> {
    const response = await fetch(`${API_BASE}/plants/${plantId}/images`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imagePath }),
    });
    if (!response.ok) {
        throw new Error('Failed to delete image');
    }
}
