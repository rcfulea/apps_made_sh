export interface Plant {
    id: number;
    thisYear: boolean;
    name: string;
    images: string[];
    type: string[];
    edible: boolean;
    description: string;
    location: string;
    sowingMonth: string[];
    indoorSeed: boolean;
    dateSown: string;
    outdoorSeed: boolean;
    plantingOutMonth: string[];
    plantingOutInstruction: string;
    sowingInstructions: string;
    pruningMonth: string[];
    pruningInstructions: string;
    harvestMonth: string[];
    flowering: string[];
    preferences: string;
    soilPreference: string[];
    careInstructions: string;
    commonProblems: string;
    goodForPollinators: boolean;
    linkToWebsite: string;
    archived: boolean;
}

export interface FilterState {
    search: string;
    types: string[];
    edible: 'all' | 'yes' | 'no';
    sowingMonths: string[];
    harvestMonths: string[];
    thisYearOnly: boolean;
}

export const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
];

export const PLANT_TYPES = [
    'Vegetable', 'Flowers', 'Herb', 'Perennial', 'Annual'
];
