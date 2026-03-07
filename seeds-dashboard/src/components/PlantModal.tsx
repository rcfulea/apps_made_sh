import { useState } from 'react';
import type { Plant } from '../data/types';
import { handleImageError } from '../utils/imageUtils';
import { deletePlant } from '../utils/api';
import './PlantModal.css';

interface PlantModalProps {
    plant: Plant;
    onClose: () => void;
    onEdit: (plant: Plant) => void;
    onDelete: (plantId: number) => void;
}

export function PlantModal({ plant, onClose, onEdit, onDelete }: PlantModalProps) {
    const [selectedImageIndex, setSelectedImageIndex] = useState(0);
    const [deleting, setDeleting] = useState(false);

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Escape') onClose();
        if (e.key === 'ArrowLeft' && selectedImageIndex > 0) {
            setSelectedImageIndex(selectedImageIndex - 1);
        }
        if (e.key === 'ArrowRight' && selectedImageIndex < plant.images.length - 1) {
            setSelectedImageIndex(selectedImageIndex + 1);
        }
    };

    const handleDelete = async () => {
        if (!confirm(`Are you sure you want to delete "${plant.name}"? This cannot be undone.`)) {
            return;
        }

        setDeleting(true);
        try {
            await deletePlant(plant.id);
            onDelete(plant.id);
            onClose();
        } catch (error) {
            console.error('Failed to delete plant:', error);
            alert('Failed to delete plant');
        } finally {
            setDeleting(false);
        }
    };

    return (
        <div
            className="modal-backdrop"
            onClick={handleBackdropClick}
            onKeyDown={handleKeyDown}
            tabIndex={0}
        >
            <div className="modal-content">
                <div className="modal-actions">
                    <button className="modal-action-btn edit" onClick={() => onEdit(plant)} title="Edit">
                        ✏️
                    </button>
                    <button
                        className="modal-action-btn delete"
                        onClick={handleDelete}
                        disabled={deleting}
                        title="Delete"
                    >
                        🗑️
                    </button>
                    <button className="modal-close" onClick={onClose}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                <div className="modal-body">
                    {/* Image Gallery */}
                    <div className="modal-gallery">
                        {plant.images.length > 0 ? (
                            <>
                                <div className="gallery-main">
                                    <img
                                        src={plant.images[selectedImageIndex]}
                                        alt={plant.name}
                                        onError={handleImageError}
                                    />
                                </div>
                                {plant.images.length > 1 && (
                                    <div className="gallery-thumbnails">
                                        {plant.images.map((img, index) => (
                                            <button
                                                key={index}
                                                className={`gallery-thumb ${index === selectedImageIndex ? 'active' : ''}`}
                                                onClick={() => setSelectedImageIndex(index)}
                                            >
                                                <img src={img} alt="" onError={handleImageError} />
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </>
                        ) : (
                            <div className="gallery-placeholder">
                                <span>🌱</span>
                                <p>No image available</p>
                            </div>
                        )}
                    </div>

                    {/* Plant Details */}
                    <div className="modal-details">
                        <header className="modal-header">
                            <h2>{plant.name}</h2>
                            <div className="modal-badges">
                                {plant.thisYear && <span className="badge badge-year">This Year</span>}
                                {plant.edible && <span className="badge badge-edible">Edible</span>}
                                {plant.goodForPollinators && <span className="badge badge-bee">🐝 Pollinator Friendly</span>}
                            </div>
                            <div className="modal-tags">
                                {plant.type.map((type, i) => (
                                    <span key={i} className="tag">{type}</span>
                                ))}
                            </div>
                        </header>

                        {plant.description && (
                            <section className="detail-section">
                                <h3>Description</h3>
                                <p>{plant.description}</p>
                            </section>
                        )}

                        <section className="detail-section">
                            <h3>Growing Information</h3>
                            <div className="info-grid">
                                {plant.location && (
                                    <div className="info-item">
                                        <span className="info-label">📍 Location</span>
                                        <span className="info-value">{plant.location}</span>
                                    </div>
                                )}
                                {plant.sowingMonth.length > 0 && (
                                    <div className="info-item">
                                        <span className="info-label">🌱 Sowing</span>
                                        <span className="info-value">{plant.sowingMonth.join(', ')}</span>
                                    </div>
                                )}
                                {plant.harvestMonth.length > 0 && (
                                    <div className="info-item">
                                        <span className="info-label">🥬 Harvest</span>
                                        <span className="info-value">{plant.harvestMonth.join(', ')}</span>
                                    </div>
                                )}
                                {plant.flowering.length > 0 && (
                                    <div className="info-item">
                                        <span className="info-label">🌸 Flowering</span>
                                        <span className="info-value">{plant.flowering.join(', ')}</span>
                                    </div>
                                )}
                                {plant.soilPreference.length > 0 && (
                                    <div className="info-item">
                                        <span className="info-label">🪴 Soil</span>
                                        <span className="info-value">{plant.soilPreference.join(', ')}</span>
                                    </div>
                                )}
                                {plant.preferences && (
                                    <div className="info-item">
                                        <span className="info-label">☀️ Preferences</span>
                                        <span className="info-value">{plant.preferences}</span>
                                    </div>
                                )}
                            </div>
                        </section>

                        {(plant.indoorSeed || plant.outdoorSeed) && (
                            <section className="detail-section">
                                <h3>Seed Information</h3>
                                <div className="seed-badges">
                                    {plant.indoorSeed && <span className="seed-badge indoor">Indoor Seed</span>}
                                    {plant.outdoorSeed && <span className="seed-badge outdoor">Outdoor Seed</span>}
                                </div>
                                {plant.dateSown && <p className="date-sown">Date sown: {plant.dateSown}</p>}
                            </section>
                        )}

                        {plant.sowingInstructions && (
                            <section className="detail-section">
                                <h3>Sowing Instructions</h3>
                                <p>{plant.sowingInstructions}</p>
                            </section>
                        )}

                        {plant.plantingOutInstruction && (
                            <section className="detail-section">
                                <h3>Planting Out</h3>
                                <p>
                                    {plant.plantingOutMonth.length > 0 && (
                                        <strong>Month: {plant.plantingOutMonth.join(', ')}</strong>
                                    )}
                                </p>
                                <p>{plant.plantingOutInstruction}</p>
                            </section>
                        )}

                        {plant.careInstructions && (
                            <section className="detail-section">
                                <h3>Care Instructions</h3>
                                <p>{plant.careInstructions}</p>
                            </section>
                        )}

                        {plant.commonProblems && (
                            <section className="detail-section">
                                <h3>Common Problems</h3>
                                <p>{plant.commonProblems}</p>
                            </section>
                        )}

                        {plant.linkToWebsite && (
                            <section className="detail-section">
                                <a
                                    href={plant.linkToWebsite}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="external-link"
                                >
                                    🔗 More Information
                                </a>
                            </section>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
