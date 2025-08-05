export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DetectedDog {
  id?: string;
  confidence: number;
  bbox: BoundingBox;
  imageData: string | null;
  timestamp?: string;
}

export interface DetectionResult {
  success: boolean;
  detectedDogs: DetectedDog[];
  error?: string;
  debugInfo?: any;
}

export interface RoboflowPrediction {
  class: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  crop?: {
    image: string;
  };
  crops?: Array<{
    image: string;
  }>;
  image?: string;
}

export interface RoboflowResponse {
  predictions?: RoboflowPrediction[];
  time?: number;
  image?: {
    width: number;
    height: number;
  };
  // Add other possible Roboflow response fields
  [key: string]: any;
}
