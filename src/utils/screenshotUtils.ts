import { message } from 'antd';

/**
 * Utility for capturing a frame from a video element and downloading it as a PNG image.
 */
export const captureVideoFrame = (
    videoElement: HTMLVideoElement | null,
    cameraName: string = 'camera',
    quality: number = 0.92
): void => {
    if (!videoElement) {
        message.error('Screenshot failed: Video stream is not available');
        console.warn('Screenshot failed: Video element is null');
        return;
    }

    try {
        // Check if the video has actual renderable frames.
        // Using videoWidth/videoHeight is more reliable than readyState for HLS.js streams,
        // which can report low readyState even while visually playing.
        if (videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
            message.warning('Please wait for the video stream to fully load before taking a screenshot.');
            console.warn('Screenshot failed: Video has no renderable frames (videoWidth/Height is 0, readyState:', videoElement.readyState, ')');
            return;
        }

        const canvas = document.createElement('canvas');
        canvas.width = videoElement.videoWidth;
        canvas.height = videoElement.videoHeight;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Screenshot failed: Could not get canvas context');
            return;
        }

        // Draw the current video frame to the canvas
        ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `${cameraName.replace(/\s+/g, '_')}_${timestamp}.png`;

        // Convert canvas to blob and trigger download
        canvas.toBlob(
            (blob) => {
                if (!blob) {
                    console.error('Screenshot failed: Could not create blob');
                    return;
                }

                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();

                // Cleanup
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            },
            'image/png',
            quality
        );
    } catch (error) {
        console.error('Screenshot implementation error:', error);
    }
};

/**
 * Alternative for capturing from a MediaStream directly if needed
 */
export const captureStreamFrame = (
    stream: MediaStream | null,
    cameraName: string = 'camera'
): void => {
    if (!stream) {
        console.warn('Screenshot failed: Stream is null');
        return;
    }

    const video = document.createElement('video');
    video.srcObject = stream;
    video.onloadedmetadata = () => {
        video.play().then(() => {
            captureVideoFrame(video, cameraName);
            // Stop the temporary video
            video.pause();
            video.srcObject = null;
        });
    };
};
