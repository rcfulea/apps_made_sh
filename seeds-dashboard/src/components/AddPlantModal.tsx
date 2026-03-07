import { useState, useRef } from 'react';
import type { Plant } from '../data/types';
import { MONTHS, PLANT_TYPES } from '../data/types';
import { uploadImages, createPlant, updatePlant } from '../utils/api';
import './AddPlantModal.css';

interface AddPlantModalProps {
    plant?: Plant | null; // If provided, we're in edit mode
    onClose: () => void;
    onSave: (plant: Plant) => void;
}

const emptyPlant: Omit<Plant, 'id'> = {
    thisYear: false,
    name: '',
    images: [],
    type: [],
    edible: false,
    description: '',
    location: '',
    sowingMonth: [],
    indoorSeed: false,
    dateSown: '',
    outdoorSeed: false,
    plantingOutMonth: [],
    plantingOutInstruction: '',
    sowingInstructions: '',
    pruningMonth: [],
    pruningInstructions: '',
    harvestMonth: [],
    flowering: [],
    preferences: '',
    soilPreference: [],
    careInstructions: '',
    commonProblems: '',
    goodForPollinators: false,
    linkToWebsite: '',
    archived: false,
};

export function AddPlantModal({ plant, onClose, onSave }: AddPlantModalProps) {
    const isEditing = !!plant;
    const [formData, setFormData] = useState<Omit<Plant, 'id'>>(plant || emptyPlant);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleChange = (field: keyof typeof formData, value: unknown) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleTypeToggle = (type: string) => {
        const newTypes = formData.type.includes(type)
            ? formData.type.filter(t => t !== type)
            : [...formData.type, type];
        handleChange('type', newTypes);
    };

    const handleMonthToggle = (month: string, field: 'sowingMonth' | 'harvestMonth' | 'plantingOutMonth' | 'flowering' | 'pruningMonth') => {
        const current = formData[field] as string[];
        const newMonths = current.includes(month)
            ? current.filter(m => m !== month)
            : [...current, month];
        handleChange(field, newMonths);
    };

    const handleFileUpload = async (files: File[]) => {
        if (files.length === 0) return;

        setUploading(true);
        try {
            const uploadedPaths = await uploadImages(files);
            handleChange('images', [...formData.images, ...uploadedPaths]);
        } catch (error) {
            console.error('Failed to upload images:', error);
            alert('Failed to upload images');
        } finally {
            setUploading(false);
        }
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
        handleFileUpload(files);
    };

    const handleRemoveImage = (imagePath: string) => {
        handleChange('images', formData.images.filter(img => img !== imagePath));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            alert('Please enter a plant name');
            return;
        }

        setSaving(true);
        try {
            let savedPlant: Plant;
            if (isEditing && plant) {
                savedPlant = await updatePlant(plant.id, formData);
            } else {
                savedPlant = await createPlant(formData);
            }
            onSave(savedPlant);
            onClose();
        } catch (error) {
            console.error('Failed to save plant:', error);
            alert('Failed to save plant');
        } finally {
            setSaving(false);
        }
    };

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    return (
        <div className="add-modal-backdrop" onClick={handleBackdropClick}>
            <div className="add-modal-content">
                <header className="add-modal-header">
                    <h2>{isEditing ? 'Edit Plant' : 'Add New Plant'}</h2>
                    <button className="add-modal-close" onClick={onClose}>×</button>
                </header>

                <form onSubmit={handleSubmit} className="add-modal-form">
                    {/* Basic Info */}
                    <section className="form-section">
                        <h3>Basic Information</h3>

                        <div className="form-group">
                            <label htmlFor="name">Plant Name *</label>
                            <input
                                id="name"
                                type="text"
                                value={formData.name}
                                onChange={(e) => handleChange('name', e.target.value)}
                                placeholder="Enter plant name..."
                                required
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="description">Description</label>
                            <textarea
                                id="description"
                                value={formData.description}
                                onChange={(e) => handleChange('description', e.target.value)}
                                placeholder="Describe the plant..."
                                rows={3}
                            />
                        </div>

                        <div className="form-row">
                            <div className="form-group">
                                <label>Type</label>
                                <div className="chip-group">
                                    {PLANT_TYPES.map(type => (
                                        <button
                                            key={type}
                                            type="button"
                                            className={`chip ${formData.type.includes(type) ? 'active' : ''}`}
                                            onClick={() => handleTypeToggle(type)}
                                        >
                                            {type}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="form-row checkboxes">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={formData.thisYear}
                                    onChange={(e) => handleChange('thisYear', e.target.checked)}
                                />
                                <span>This Year</span>
                            </label>
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={formData.edible}
                                    onChange={(e) => handleChange('edible', e.target.checked)}
                                />
                                <span>Edible</span>
                            </label>
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={formData.goodForPollinators}
                                    onChange={(e) => handleChange('goodForPollinators', e.target.checked)}
                                />
                                <span>Good for Pollinators</span>
                            </label>
                        </div>
                    </section>

                    {/* Images */}
                    <section className="form-section">
                        <h3>Images</h3>

                        <div
                            className={`image-dropzone ${dragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
                            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={(e) => handleFileUpload(Array.from(e.target.files || []))}
                                hidden
                            />
                            {uploading ? (
                                <div className="dropzone-content">
                                    <div className="spinner"></div>
                                    <p>Uploading...</p>
                                </div>
                            ) : (
                                <div className="dropzone-content">
                                    <span className="dropzone-icon">📷</span>
                                    <p>Drag and drop images here, or click to select</p>
                                </div>
                            )}
                        </div>

                        {formData.images.length > 0 && (
                            <div className="image-preview-grid">
                                {formData.images.map((img, index) => (
                                    <div key={index} className="image-preview-item">
                                        <img src={img} alt="" />
                                        <button
                                            type="button"
                                            className="remove-image"
                                            onClick={() => handleRemoveImage(img)}
                                        >
                                            ×
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Growing Info */}
                    <section className="form-section">
                        <h3>Growing Information</h3>

                        <div className="form-group">
                            <label htmlFor="location">Location</label>
                            <input
                                id="location"
                                type="text"
                                value={formData.location}
                                onChange={(e) => handleChange('location', e.target.value)}
                                placeholder="e.g., Garden bed, greenhouse..."
                            />
                        </div>

                        <div className="form-group">
                            <label>Sowing Month</label>
                            <div className="month-grid">
                                {MONTHS.map(month => (
                                    <button
                                        key={month}
                                        type="button"
                                        className={`month-btn ${formData.sowingMonth.includes(month) ? 'active' : ''}`}
                                        onClick={() => handleMonthToggle(month, 'sowingMonth')}
                                    >
                                        {month.slice(0, 3)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Harvest Month</label>
                            <div className="month-grid">
                                {MONTHS.map(month => (
                                    <button
                                        key={month}
                                        type="button"
                                        className={`month-btn ${formData.harvestMonth.includes(month) ? 'active' : ''}`}
                                        onClick={() => handleMonthToggle(month, 'harvestMonth')}
                                    >
                                        {month.slice(0, 3)}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="form-row checkboxes">
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={formData.indoorSeed}
                                    onChange={(e) => handleChange('indoorSeed', e.target.checked)}
                                />
                                <span>Indoor Seed</span>
                            </label>
                            <label className="checkbox-label">
                                <input
                                    type="checkbox"
                                    checked={formData.outdoorSeed}
                                    onChange={(e) => handleChange('outdoorSeed', e.target.checked)}
                                />
                                <span>Outdoor Seed</span>
                            </label>
                        </div>

                        <div className="form-group">
                            <label htmlFor="sowingInstructions">Sowing Instructions</label>
                            <textarea
                                id="sowingInstructions"
                                value={formData.sowingInstructions}
                                onChange={(e) => handleChange('sowingInstructions', e.target.value)}
                                placeholder="How to sow the seeds..."
                                rows={2}
                            />
                        </div>

                        <div className="form-group">
                            <label htmlFor="careInstructions">Care Instructions</label>
                            <textarea
                                id="careInstructions"
                                value={formData.careInstructions}
                                onChange={(e) => handleChange('careInstructions', e.target.value)}
                                placeholder="How to care for the plant..."
                                rows={2}
                            />
                        </div>
                    </section>

                    {/* Footer */}
                    <footer className="add-modal-footer">
                        <button type="button" className="btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button type="submit" className="btn-primary" disabled={saving}>
                            {saving ? 'Saving...' : isEditing ? 'Save Changes' : 'Add Plant'}
                        </button>
                    </footer>
                </form>
            </div>
        </div>
    );
}
