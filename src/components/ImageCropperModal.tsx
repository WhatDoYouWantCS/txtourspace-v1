import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'motion/react';
import { X, Upload, Link as LinkIcon, ZoomIn, Check, RotateCcw } from 'lucide-react';

interface ImageCropperModalProps {
  title?: string;
  initialImage?: string | null;
  aspectRatio?: 'square' | 'circle';
  onClose: () => void;
  onCropComplete: (croppedBase64: string) => void;
}

export default function ImageCropperModal({
  title = 'Adjust Profile Picture',
  initialImage = null,
  aspectRatio = 'circle',
  onClose,
  onCropComplete
}: ImageCropperModalProps) {
  const [activeTab, setActiveTab] = useState<'upload' | 'url'>('upload');
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [imageSrc, setImageSrc] = useState<string | null>(initialImage);
  const [loadingError, setLoadingError] = useState('');

  // Crop & Transform state
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset transform when image source changes
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setLoadingError('');
  }, [imageSrc]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setLoadingError('Please select a valid image file.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImageSrc(reader.result as string);
        setLoadingError('');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUrlSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageUrlInput.trim()) return;
    setLoadingError('');

    // Preload image to check if it's valid
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      setImageSrc(imageUrlInput.trim());
      setLoadingError('');
    };
    img.onerror = () => {
      // Still try setting it, as data URLs or some direct links work
      setImageSrc(imageUrlInput.trim());
    };
    img.src = imageUrlInput.trim();
  };

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!imageSrc) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffset({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Touch drag handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (!imageSrc || e.touches.length !== 1) return;
    setIsDragging(true);
    setDragStart({ x: e.touches[0].clientX - offset.x, y: e.touches[0].clientY - offset.y });
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    setOffset({
      x: e.touches[0].clientX - dragStart.x,
      y: e.touches[0].clientY - dragStart.y
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Generate cropped base64 from current scale & offset
  const handleSaveCrop = () => {
    if (!imageSrc) return;

    const canvas = document.createElement('canvas');
    const size = 300; // Output avatar size 300x300
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.clearRect(0, 0, size, size);

      // Save canvas state
      ctx.save();

      // If circle crop, clip it
      if (aspectRatio === 'circle') {
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.closePath();
        ctx.clip();
      }

      // Draw background
      ctx.fillStyle = '#0a0a0a';
      ctx.fillRect(0, 0, size, size);

      // Calculate source image drawing coordinates
      const boxSize = 240; // Viewport container size
      const drawScale = scale * (size / boxSize);
      const drawX = (size / 2) + (offset.x * (size / boxSize));
      const drawY = (size / 2) + (offset.y * (size / boxSize));

      const imgWidth = img.naturalWidth;
      const imgHeight = img.naturalHeight;
      const aspect = imgWidth / imgHeight;

      let renderW = size;
      let renderH = size;
      if (aspect > 1) {
        renderW = size * aspect;
        renderH = size;
      } else {
        renderW = size;
        renderH = size / aspect;
      }

      renderW *= scale;
      renderH *= scale;

      ctx.drawImage(
        img,
        drawX - renderW / 2,
        drawY - renderH / 2,
        renderW,
        renderH
      );

      ctx.restore();

      const croppedBase64 = canvas.toDataURL('image/jpeg', 0.9);
      onCropComplete(croppedBase64);
      onClose();
    };

    img.onerror = () => {
      setLoadingError('Could not render image. Try uploading a direct file.');
    };

    img.src = imageSrc;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 10 }}
        className="w-full max-w-sm bg-[#1C1C1E] border border-[#262626] rounded-3xl overflow-hidden shadow-2xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 border-b border-[#262626] flex items-center justify-between bg-[#141416]">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <span>{title}</span>
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Source Select Tabs */}
          <div className="grid grid-cols-2 p-1 bg-black/50 border border-[#262626] rounded-2xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'upload' ? 'bg-[#1DB954] text-black shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload File</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`py-2 rounded-xl flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'url' ? 'bg-[#1DB954] text-black shadow-md' : 'text-zinc-400 hover:text-white'
              }`}
            >
              <LinkIcon className="w-3.5 h-3.5" />
              <span>Image URL</span>
            </button>
          </div>

          {/* Tab Content 1: Upload File */}
          {activeTab === 'upload' && (
            <div>
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
                id="crop-modal-file"
              />
              <label
                htmlFor="crop-modal-file"
                className="w-full py-3 px-4 bg-[#2C2C2E]/60 border border-dashed border-zinc-700 hover:border-[#1DB954] rounded-2xl flex items-center justify-center gap-2 text-xs font-semibold text-zinc-300 hover:text-white cursor-pointer transition-colors"
              >
                <Upload className="w-4 h-4 text-[#1DB954]" />
                <span>{imageSrc ? 'Choose Different File' : 'Select Photo from Device'}</span>
              </label>
            </div>
          )}

          {/* Tab Content 2: Image URL */}
          {activeTab === 'url' && (
            <form onSubmit={handleUrlSubmit} className="flex gap-2">
              <input
                type="url"
                value={imageUrlInput}
                onChange={(e) => setImageUrlInput(e.target.value)}
                placeholder="https://example.com/avatar.jpg"
                className="flex-1 bg-black border border-[#262626] focus:border-[#1DB954] rounded-xl px-3 py-2 text-xs text-white outline-none"
              />
              <button
                type="submit"
                className="px-3.5 py-2 bg-[#1DB954] text-black font-bold text-xs rounded-xl hover:bg-[#1ed760] transition-colors cursor-pointer flex-shrink-0"
              >
                Load
              </button>
            </form>
          )}

          {loadingError && (
            <p className="text-[11px] text-red-400 font-semibold text-center">{loadingError}</p>
          )}

          {/* Interactive Crop & Pan Viewport */}
          {imageSrc ? (
            <div className="space-y-3 pt-1">
              <div
                ref={containerRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
                className="relative w-[240px] h-[240px] mx-auto bg-black rounded-2xl overflow-hidden border-2 border-[#262626] cursor-grab active:cursor-grabbing select-none flex items-center justify-center"
              >
                {/* Image element with scale and offset */}
                <img
                  ref={imgRef}
                  src={imageSrc}
                  alt="Crop preview"
                  style={{
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
                    maxHeight: '100%',
                    maxWidth: '100%',
                    objectFit: 'contain',
                    pointerEvents: 'none'
                  }}
                  referrerPolicy="no-referrer"
                />

                {/* Mask overlay for crop shape */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div
                    className={`w-[210px] h-[210px] border-2 border-[#1DB954] shadow-[0_0_0_9999px_rgba(0,0,0,0.65)] ${
                      aspectRatio === 'circle' ? 'rounded-full' : 'rounded-2xl'
                    }`}
                  />
                </div>
              </div>

              {/* Controls: Zoom slider & Reset */}
              <div className="flex items-center gap-3 px-2">
                <ZoomIn className="w-4 h-4 text-zinc-400" />
                <input
                  type="range"
                  min="1"
                  max="3"
                  step="0.05"
                  value={scale}
                  onChange={(e) => setScale(parseFloat(e.target.value))}
                  className="flex-1 accent-[#1DB954] cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => {
                    setScale(1);
                    setOffset({ x: 0, y: 0 });
                  }}
                  className="p-1.5 bg-[#2C2C2E] hover:bg-zinc-700 text-zinc-300 rounded-lg transition-colors cursor-pointer"
                  title="Reset Alignment"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="h-[180px] bg-black/40 border border-dashed border-[#262626] rounded-2xl flex flex-col items-center justify-center text-center p-4">
              <Upload className="w-8 h-8 text-zinc-600 mb-2" />
              <p className="text-xs text-zinc-400">Select an image file or paste a URL above to start cropping.</p>
            </div>
          )}

          {/* Modal Action Footer */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-[#2C2C2E] hover:bg-zinc-700 text-zinc-300 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!imageSrc}
              onClick={handleSaveCrop}
              className="flex-1 py-2.5 bg-[#1DB954] hover:bg-[#1ed760] disabled:opacity-40 text-black text-xs font-extrabold rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-md"
            >
              <Check className="w-4 h-4" />
              <span>Apply & Save</span>
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
