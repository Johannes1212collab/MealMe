import React, { useState, useEffect } from 'react';
import { Camera, X, Zap, Image as ImageIcon } from 'lucide-react';
import './CameraScanner.css';
import { API_BASE_URL } from '../utils/api';

export default function CameraScanner({ isOpen, onClose, onCapture, remainingMacros }) {
    const [isScanning, setIsScanning] = useState(false);
    const [scanMode, setScanMode] = useState('meal'); // 'meal' or 'ingredients'

    const cameraInputRef = React.useRef(null);
    const galleryInputRef = React.useRef(null);
    const [selectedImage, setSelectedImage] = useState(null);

    const handleFileSelect = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Preview the image locally
        const previewUrl = URL.createObjectURL(file);
        setSelectedImage(previewUrl);
        setIsScanning(true);

        // Convert the file to Base64 to send to our Node backend
        const reader = new FileReader();
        reader.onloadend = async () => {
            const base64String = reader.result;

            try {
                const response = await fetch(`${API_BASE_URL}/api/vision`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ imageBase64: base64String, mode: scanMode, remainingMacros })
                });

                const json = await response.json();
                setIsScanning(false);

                if (json.status === 'success') {
                    // Send parsed genAI macro data up to App.jsx
                    onCapture(scanMode, json.data);
                } else {
                    onCapture(scanMode, { error: true, message: json.message });
                }
            } catch (err) {
                console.error("Camera API Error:", err);
                setIsScanning(false);
                onCapture(scanMode, { error: true, message: 'Failed to connect' });
            }
        };
        reader.readAsDataURL(file);
    };

    if (!isOpen) return null;

    const handleCapture = () => {
        // Trigger the hidden file input instead of "mock scanning"
        fileInputRef.current?.click();
    };

    return (
        <div className="camera-overlay">
            <div className="camera-header">
                <button className="icon-btn" onClick={onClose}>
                    <X size={24} />
                </button>
                <div className="camera-title">
                    {scanMode === 'meal' ? 'Scan Food' : 'Scan Ingredients'}
                </div>
                <button className="icon-btn">
                    <Zap size={24} />
                </button>
            </div>

            <div className="viewfinder-container">
                <div className={`viewfinder-frame ${isScanning ? 'scanning' : ''}`}>

                    {selectedImage && (
                        <img
                            src={selectedImage}
                            alt="Scan target"
                            style={{ position: 'absolute', width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5, zIndex: 0 }}
                        />
                    )}

                    <div className="corner top-left"></div>
                    <div className="corner top-right"></div>
                    <div className="corner bottom-left"></div>
                    <div className="corner bottom-right"></div>

                    {isScanning && <div className="scan-line"></div>}

                    <div className="camera-hint" style={{ zIndex: 1, position: 'relative' }}>
                        {isScanning ? 'AI analyzing image...' : 'Tap capture to upload photo'}
                    </div>
                </div>
            </div>

            {/* Hidden Inputs */}
            <input
                type="file"
                ref={cameraInputRef}
                accept="image/*"
                capture="environment"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
            />
            <input
                type="file"
                ref={galleryInputRef}
                accept="image/*"
                style={{ display: 'none' }}
                onChange={handleFileSelect}
            />

            <div className="camera-controls">
                <div className="mode-selector">
                    <button
                        className={`mode-btn ${scanMode === 'meal' ? 'active' : ''}`}
                        onClick={() => setScanMode('meal')}
                        disabled={isScanning}
                    >
                        Meal
                    </button>
                    <button
                        className={`mode-btn ${scanMode === 'ingredients' ? 'active' : ''}`}
                        onClick={() => setScanMode('ingredients')}
                        disabled={isScanning}
                    >
                        Ingredients
                    </button>
                </div>

                <div className="camera-actions-row">
                    <button
                        className="gallery-btn"
                        onClick={() => galleryInputRef.current?.click()}
                        disabled={isScanning}
                    >
                        <ImageIcon size={24} />
                    </button>

                    <button
                        className={`capture-btn ${isScanning ? 'disabled' : ''}`}
                        onClick={() => cameraInputRef.current?.click()}
                        disabled={isScanning}
                    >
                        <div className="capture-inner"></div>
                    </button>

                    <div className="action-spacer"></div>
                </div>
            </div>
        </div>
    );
}
