import { GRID_WIDTH, GRID_HEIGHT } from '../constants';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export class WebcamCapture {
  private videoElement: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private isInitialized = false;
  private currentDeviceId: string | null = null;
  private liveInterval: NodeJS.Timeout | null = null;
  private isLiveCapturing = false;

  // Get available camera devices
  static async getAvailableCameras(): Promise<CameraDevice[]> {
    try {
      // Request permission first to get device labels
      await navigator.mediaDevices.getUserMedia({ video: true });

      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices
        .filter(device => device.kind === 'videoinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${device.deviceId.slice(0, 8)}`
        }));

      return cameras;
    } catch (error) {
      console.error('Failed to enumerate cameras:', error);
      return [];
    }
  }

  // Initialize webcam access with optional device selection
  async initializeWebcam(deviceId?: string, previewContainer?: HTMLElement): Promise<void> {
        try {
      // Stop existing stream if switching devices
      if (this.stream) {
        this.stream.getTracks().forEach(track => track.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: deviceId ? undefined : 'user', // Use facingMode only if no specific device
          deviceId: deviceId ? { exact: deviceId } : undefined
        },
        audio: false
      };

      // Request webcam access
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.currentDeviceId = deviceId || null;

      // Create or reuse video element
      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.autoplay = true;
        this.videoElement.muted = true;
        this.videoElement.playsInline = true;
        this.videoElement.className = 'webcam-preview';

        // Style the video preview
        this.videoElement.style.width = '200px';
        this.videoElement.style.height = '150px';
        this.videoElement.style.objectFit = 'cover';
        this.videoElement.style.borderRadius = '8px';
        this.videoElement.style.border = '2px solid #333';
        this.videoElement.style.backgroundColor = '#000';
      }

      // Add to preview container or body
      if (previewContainer) {
        previewContainer.appendChild(this.videoElement);
      } else if (!this.videoElement.parentNode) {
        document.body.appendChild(this.videoElement);
      }

      // Set video source and wait for it to load
      this.videoElement.srcObject = this.stream;

      await new Promise<void>((resolve, reject) => {
        this.videoElement!.onloadedmetadata = () => {
          this.videoElement!.play()
            .then(() => {
              this.isInitialized = true;
              resolve();
            })
            .catch(reject);
        };
        this.videoElement!.onerror = reject;
      });

      console.log('[WebcamCapture] Webcam initialized successfully');
    } catch (error) {
      console.error('[WebcamCapture] Failed to initialize webcam:', error);
      throw new Error(`Webcam access denied or not available: ${error}`);
    }
  }

    // Capture current frame and convert to grid format
  async captureToGrid(socket: WebSocket, deviceId?: string, previewContainer?: HTMLElement): Promise<void> {
    if (!this.isInitialized || !this.videoElement || (deviceId && deviceId !== this.currentDeviceId)) {
      await this.initializeWebcam(deviceId, previewContainer);
    }

    await this.captureFrame(socket);
  }

  // Start live capture mode - captures every second
  async startLiveCapture(socket: WebSocket, deviceId?: string, previewContainer?: HTMLElement): Promise<void> {
    if (this.isLiveCapturing) {
      this.stopLiveCapture();
    }

    // Initialize webcam if needed
    if (!this.isInitialized || !this.videoElement || (deviceId && deviceId !== this.currentDeviceId)) {
      await this.initializeWebcam(deviceId, previewContainer);
    }

    this.isLiveCapturing = true;

    // Capture immediately, then every second
    await this.captureFrame(socket);

    this.liveInterval = setInterval(async () => {
      if (this.isLiveCapturing) {
        try {
          await this.captureFrame(socket);
        } catch (error) {
          console.error('[WebcamCapture] Live capture error:', error);
          // Continue capturing even if one frame fails
        }
      }
    }, 100); // Capture every 1 second

    console.log('[WebcamCapture] Started live capture mode');
  }

  // Stop live capture mode
  stopLiveCapture(): void {
    this.isLiveCapturing = false;

    if (this.liveInterval) {
      clearInterval(this.liveInterval);
      this.liveInterval = null;
    }

    console.log('[WebcamCapture] Stopped live capture mode');
  }

  // Check if live capture is active
  get isLive(): boolean {
    return this.isLiveCapturing;
  }

  // Internal method to capture a single frame
  private async captureFrame(socket: WebSocket): Promise<void> {
    if (!this.videoElement) {
      throw new Error('Video element not available');
    }

    // Create canvas to capture frame
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas context not available');
    }

    // Set canvas size to video size
    const videoWidth = this.videoElement.videoWidth;
    const videoHeight = this.videoElement.videoHeight;

    if (videoWidth === 0 || videoHeight === 0) {
      throw new Error('Video not ready - no dimensions available');
    }

    canvas.width = videoWidth;
    canvas.height = videoHeight;

    // Draw current video frame to canvas
    ctx.drawImage(this.videoElement, 0, 0, videoWidth, videoHeight);

    // Get face area (center crop) - 60% of smaller dimension
    const faceSize = Math.min(videoWidth, videoHeight) * 0.6;
    const faceX = (videoWidth - faceSize) / 2;
    const faceY = (videoHeight - faceSize) / 2;

    const faceImageData = ctx.getImageData(faceX, faceY, faceSize, faceSize);

    // Convert to grid and send to socket
    await this.imageDataToGrid(faceImageData, socket);
  }

    // Convert ImageData to grid format and send via socket using batch updates
  private async imageDataToGrid(imageData: ImageData, socket: WebSocket): Promise<void> {
    const sourceWidth = imageData.width;
    const sourceHeight = imageData.height;

    const pixels: Array<{ x: number; y: number; color: string }> = [];

    // Process each grid cell
    for (let gridY = 0; gridY < GRID_HEIGHT; gridY++) {
      for (let gridX = 0; gridX < GRID_WIDTH; gridX++) {
        // Map grid coordinates to source image coordinates
        const sourceX = Math.floor((gridX / GRID_WIDTH) * sourceWidth);
        const sourceY = Math.floor((gridY / GRID_HEIGHT) * sourceHeight);

        // Get pixel data from source image
        const sourceIndex = (sourceY * sourceWidth + sourceX) * 4;
        const r = imageData.data[sourceIndex];
        const g = imageData.data[sourceIndex + 1];
        const b = imageData.data[sourceIndex + 2];
        const alpha = imageData.data[sourceIndex + 3];

        // Skip transparent pixels
        if (alpha < 128) continue;

        // Create color string
        const color = `rgb(${r}, ${g}, ${b})`;
        pixels.push({ x: gridX, y: gridY, color });
      }
    }

    // Send all pixels in a single batch message for much better performance
    if (pixels.length > 0) {
      const payload = { type: 'batchDraw', pixels };
      socket.send(JSON.stringify(payload));
      console.log(`[WebcamCapture] Sent ${pixels.length} pixels in single batch`);
    }
  }

    // Cleanup webcam resources
  cleanup(): void {
    console.log('[WebcamCapture] Cleaning up webcam resources');

    // Stop live capture if active
    this.stopLiveCapture();

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }

    if (this.videoElement) {
      if (this.videoElement.parentNode) {
        this.videoElement.parentNode.removeChild(this.videoElement);
      }
      this.videoElement = null;
    }

    this.isInitialized = false;
  }

  // Check if webcam is supported
  static isSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  // Get webcam permission status
  static async getPermissionStatus(): Promise<PermissionState> {
    try {
      const permission = await navigator.permissions.query({ name: 'camera' as PermissionName });
      return permission.state;
    } catch {
      return 'prompt'; // Default if permissions API not available
    }
  }
}

// Global instance for reuse
let webcamInstance: WebcamCapture | null = null;

// Initialize webcam preview without capturing
export const initializeWebcamPreview = async (deviceId?: string, previewContainer?: HTMLElement): Promise<void> => {
  if (!WebcamCapture.isSupported()) {
    throw new Error('Webcam not supported in this browser');
  }

  if (!webcamInstance) {
    webcamInstance = new WebcamCapture();
  }

  await webcamInstance.initializeWebcam(deviceId, previewContainer);
};

// Main function to capture webcam to grid
export const captureWebcamToGrid = async (socket: WebSocket, deviceId?: string, previewContainer?: HTMLElement): Promise<void> => {
  if (!WebcamCapture.isSupported()) {
    throw new Error('Webcam not supported in this browser');
  }

  if (!webcamInstance) {
    webcamInstance = new WebcamCapture();
  }

  await webcamInstance.captureToGrid(socket, deviceId, previewContainer);
};

// Start live capture mode
export const startLiveWebcamCapture = async (socket: WebSocket, deviceId?: string, previewContainer?: HTMLElement): Promise<void> => {
  if (!WebcamCapture.isSupported()) {
    throw new Error('Webcam not supported in this browser');
  }

  if (!webcamInstance) {
    webcamInstance = new WebcamCapture();
  }

  await webcamInstance.startLiveCapture(socket, deviceId, previewContainer);
};

// Stop live capture mode
export const stopLiveWebcamCapture = (): void => {
  if (webcamInstance) {
    webcamInstance.stopLiveCapture();
  }
};

// Check if live capture is active
export const isLiveWebcamCapture = (): boolean => {
  return webcamInstance ? webcamInstance.isLive : false;
};

// Get available cameras
export const getAvailableCameras = async (): Promise<CameraDevice[]> => {
  return WebcamCapture.getAvailableCameras();
};

// Cleanup function
export const cleanupWebcam = (): void => {
  if (webcamInstance) {
    webcamInstance.cleanup();
    webcamInstance = null;
  }
};
