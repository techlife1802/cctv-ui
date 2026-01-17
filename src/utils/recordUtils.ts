/**
 * Utility for recording a MediaStream using the MediaRecorder API.
 */

export interface RecordingSession {
    recorder: MediaRecorder;
    stop: () => void;
}

export const startRecording = (
    stream: MediaStream,
    cameraName: string = 'camera'
): RecordingSession => {
    const chunks: Blob[] = [];

    // Find supported mime type
    const mimeTypes = [
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm',
        'video/mp4'
    ];

    const mimeType = mimeTypes.find(type => MediaRecorder.isTypeSupported(type)) || '';

    const recorder = new MediaRecorder(stream, { mimeType });

    recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
            chunks.push(event.data);
        }
    };

    recorder.onstop = () => {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        const url = URL.createObjectURL(blob);

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const extension = recorder.mimeType.includes('mp4') ? 'mp4' : 'webm';
        const filename = `${cameraName.replace(/\s+/g, '_')}_${timestamp}.${extension}`;

        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();

        // Cleanup
        setTimeout(() => {
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    };

    recorder.start();

    return {
        recorder,
        stop: () => {
            if (recorder.state !== 'inactive') {
                recorder.stop();
            }
        }
    };
};

/**
 * Helper to capture a stream from a video element if it doesn't have a direct MediaStream
 * (Necessary for HLS streams handled by video tag)
 */
export const captureStreamFromVideo = (video: HTMLVideoElement): MediaStream | null => {
    try {
        // @ts-ignore - captureStream is not always in types but exists in modern browsers
        return video.captureStream ? video.captureStream() : (video as any).mozCaptureStream ? (video as any).mozCaptureStream() : null;
    } catch (error) {
        console.error('Failed to capture stream from video element:', error);
        return null;
    }
};
