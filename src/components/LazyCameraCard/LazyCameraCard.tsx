import React, { useState, useEffect, useRef } from 'react';
import CameraCard from '../CameraCard';
import { Camera } from '../../types';

interface LazyCameraCardProps {
    camera: Camera;
    onClick: (camera: Camera, stream?: MediaStream) => void;
    index?: number;
    rootMargin?: string; // Intersection Observer root margin
}

/**
 * LazyCameraCard - Only loads the stream when the camera card enters the viewport
 * This significantly reduces initial load time and network usage when displaying many cameras
 */
const LazyCameraCard: React.FC<LazyCameraCardProps> = ({
    camera,
    onClick,
    index = 0,
    rootMargin = '100px' // Start loading 100px before entering viewport
}) => {
    const [isInView, setIsInView] = useState(false);
    const cardRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    // Update visibility state - load when in view, unload when out
                    setIsInView(entry.isIntersecting);
                });
            },
            {
                rootMargin,
                threshold: 0.1 // Trigger when 10% of the element is visible
            }
        );

        if (cardRef.current) {
            observer.observe(cardRef.current);
        }

        return () => {
            if (cardRef.current) {
                observer.unobserve(cardRef.current);
            }
        };
    }, [rootMargin]);

    // Load stream when in view, unload when out of view to free NVR connections
    const shouldLoadStream = isInView;

    return (
        <div ref={cardRef} style={{ width: '100%', height: '100%' }}>
            {shouldLoadStream ? (
                <CameraCard
                    camera={camera}
                    onClick={onClick}
                    index={index}
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
                        <div style={{ marginBottom: '8px' }}>📹</div>
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

