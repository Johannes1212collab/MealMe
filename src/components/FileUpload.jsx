import React, { useRef, useState } from 'react';
import { Paperclip, FileText, Image, Loader2 } from 'lucide-react';
import './FileUpload.css';

export default function FileUpload({ onAnalysisComplete, remainingMacros, apiBaseUrl }) {
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState('');
    const fileInputRef = useRef(null);

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsProcessing(true);
        setProgress('Reading file...');

        try {
            // Convert file to base64
            const base64Data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            setProgress('Sending to AI...');

            const response = await fetch(`${apiBaseUrl}/api/analyze-file`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    base64Data,
                    mimeType: file.type,
                    fileName: file.name,
                    remainingMacros
                })
            });

            const result = await response.json();

            if (result.status === 'success' && result.data) {
                onAnalysisComplete(result.data);
            } else {
                throw new Error(result.message || 'Analysis failed');
            }

        } catch (err) {
            console.error('File upload error:', err);
            if (onAnalysisComplete) {
                onAnalysisComplete({ error: true, message: err.message });
            }
        } finally {
            setIsProcessing(false);
            setProgress('');
            // Reset so same file can be uploaded again
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="file-upload-wrapper">
            <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,text/plain,.txt,.pdf,.doc,.docx"
                onChange={handleFileChange}
                style={{ display: 'none' }}
                id="file-upload-input"
            />
            <button
                className={`floating-upload-btn ${isProcessing ? 'processing' : ''}`}
                onClick={() => !isProcessing && fileInputRef.current?.click()}
                disabled={isProcessing}
                aria-label="Upload food document or image"
                title={isProcessing ? progress : "Upload file for AI analysis"}
            >
                {isProcessing
                    ? <Loader2 size={22} className="spin-icon" />
                    : <Paperclip size={22} />
                }
            </button>
            {isProcessing && (
                <div className="upload-progress-toast">
                    <Loader2 size={14} className="spin-icon" />
                    {progress}
                </div>
            )}
        </div>
    );
}
