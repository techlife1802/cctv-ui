import React, { useState, useEffect, useRef, useCallback } from 'react';
import CameraCard from '../CameraCard';
import { Camera } from '../../types';

interface LazyCameraCardProps {
    camera: Camera;
    onClick: (camera: Camera, stream?: MediaStream, startTalking?: boolean) => void;
    onStreamReady?: (camera: Camera, stream: MediaStream) => void;
    index?: number;
    rootMargin?: string; // Intersection Observer root margin
    useSubstream?: boolean;
}

/**
 * LazyCameraCard - Only loads the stream when the camera card enters the viewport
 * This significantly reduces initial load time and network usage when displaying many cameras
 */
const LazyCameraCard: React.FC<LazyCameraCardProps> = ({
    camera,
    onClick,
    onStreamReady,
    index = 0,
    rootMargin = '100px',
    useSubstream = false
}) => {
    const [isInView, setIsInView] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    const handleIntersect = useCallback((entries: IntersectionObserverEntry[]) => {
        entries.forEach(entry => {
            if (entry.isIntersecting && !isInView) {
                setIsInView(true);
            }
        });
    }, [isInView]);

    useEffect(() => {
        if (isInView) return; // Stop observing if already in view

        const observer = new IntersectionObserver(handleIntersect, {
            rootMargin,
            threshold: 0.1
        });

        const currentCard = cardRef.current;
        if (currentCard) observer.observe(currentCard);

        return () => {
            if (currentCard) observer.unobserve(currentCard);
        };
    }, [handleIntersect, rootMargin, isInView]);

    return (
        <div ref={cardRef} style={{ width: '100%', height: '100%' }}>
            {isInView ? (
                <CameraCard
                    camera={camera}
                    onClick={onClick}
                    onStreamReady={onStreamReady}
                    index={index}
                    useSubstream={useSubstream}
                />
            ) : (
                <div
                    className="camera-card"
                    style={{
                        background: '#1a1a1a',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: '#666',
                        fontSize: '14px',
                        minHeight: '200px'
                    }}
                >
                    <div style={{ textAlign: 'center' }}>
                        <div style={{ marginBottom: '8px', fontSize: '24px' }}>📹</div>
                        <div>{camera.name}</div>
                        <div style={{ fontSize: '12px', marginTop: '4px', opacity: 0.7 }}>
                            {camera.location}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(LazyCameraCard);
