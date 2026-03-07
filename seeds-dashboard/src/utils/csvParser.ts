import Papa from 'papaparse';
import type { Plant } from '../data/types';
import { parseImagePath } from './imageUtils';

interface RawPlantRow {
    'This Year': string;
    'Name': string;
    'Image': string;
    'Type': string;
    'Edible': string;
    'Description': string;
    'Location': string;
    'Sowing month': string;
    'Indoor seed': string;
    'Date sown': string;
    'Outdoor seed': string;
    'Planting out month': string;
    'Planting out instruction': string;
    'Sowing Instructions': string;
    'Pruning month': string;
    'Pruning Instructions': string;
    'Harvest month': string;
    'Flowering': string;
    'Preferences': string;
    'Soil Preference': string;
    'Care Instructions': string;
    'Common problems': string;
    'Good for pollinators': string;
    'Link to Useful Website': string;
    'Archived': string;
}

function parseBoolean(value: string): boolean {
    return value?.toLowerCase() === 'yes';
}

function parseArray(value: string): string[] {
    if (!value || value.trim() === '') return [];
    return value.split(',').map(s => s.trim()).filter(s => s !== '');
}

export async function loadPlantsFromCSV(): Promise<Plant[]> {
    try {
        const response = await fetch('/plants.csv');
        const csvText = await response.text();

        return new Promise((resolve, reject) => {
            Papa.parse<RawPlantRow>(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: (results) => {
                    const plants: Plant[] = results.data
                        .filter(row => row.Name && row.Name.trim() !== '')
                        .map((row, index) => ({
                            id: index + 1,
                            thisYear: parseBoolean(row['This Year']),
                            name: row['Name'] || '',
                            images: parseImagePath(row['Image']),
                            type: parseArray(row['Type']),
                            edible: parseBoolean(row['Edible']),
                            description: row['Description'] || '',
                            location: row['Location'] || '',
                            sowingMonth: parseArray(row['Sowing month']),
                            indoorSeed: parseBoolean(row['Indoor seed']),
                            dateSown: row['Date sown'] || '',
                            outdoorSeed: parseBoolean(row['Outdoor seed']),
                            plantingOutMonth: parseArray(row['Planting out month']),
                            plantingOutInstruction: row['Planting out instruction'] || '',
                            sowingInstructions: row['Sowing Instructions'] || '',
                            pruningMonth: parseArray(row['Pruning month']),
                            pruningInstructions: row['Pruning Instructions'] || '',
                            harvestMonth: parseArray(row['Harvest month']),
                            flowering: parseArray(row['Flowering']),
                            preferences: row['Preferences'] || '',
                            soilPreference: parseArray(row['Soil Preference']),
                            careInstructions: row['Care Instructions'] || '',
                            commonProblems: row['Common problems'] || '',
                            goodForPollinators: parseBoolean(row['Good for pollinators']),
                            linkToWebsite: row['Link to Useful Website'] || '',
                            archived: parseBoolean(row['Archived']),
                        }));
                    resolve(plants);
                },
                error: (error: Error) => {
                    reject(error);
                }
            });
        });
    } catch (error) {
        console.error('Failed to load plants CSV:', error);
        return [];
    }
}
