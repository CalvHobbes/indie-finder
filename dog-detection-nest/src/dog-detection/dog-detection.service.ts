import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { 
  BoundingBox, 
  DetectionResult, 
  DetectedDog, 
  RoboflowPrediction, 
  RoboflowResponse 
} from './dog-detection.types';
import { format } from 'util';

@Injectable()
export class DogDetectionService {
  private readonly debug: boolean;
  private readonly logsDir: string;

  constructor(private configService: ConfigService) {
    this.debug = this.configService.get<boolean>('debug', false);
    this.logsDir = path.join(process.cwd(), 'logs');
  }

  /**
   * Logs debug information to a file if debug mode is enabled
   * @param message - The message to log
   * @param data - Optional data to include in the log
   */
  private async debugLog(message: string, data?: any): Promise<void> {
    if (!this.debug) return;

    try {
      // Ensure logs directory exists
      await fs.promises.mkdir(this.logsDir, { recursive: true });
      
      const timestamp = new Date().toISOString();
      const logMessage = `[${timestamp}] ${message}${data ? '\n' + JSON.stringify(data, null, 2) : ''}\n\n`;
      const logFile = path.join(this.logsDir, 'roboflow-debug.log');
      
      // Append to log file
      await fs.promises.appendFile(logFile, logMessage, 'utf8');
    } catch (error) {
      console.error('Error writing to debug log:', error);
    }
  }

  /**
   * Processes an image with Roboflow API
   * @param imageBuffer - The image buffer to process
   * @param mimetype - The MIME type of the image
   * @returns Promise with the processed data
   */
  async processWithRoboflow(imageBuffer: Buffer, mimetype: string, retryCount = 3, initialDelayMs = 1000): Promise<RoboflowResponse> {
    // Convert buffer to base64 and create a data URL
    const base64Image = imageBuffer.toString('base64');
    const dataUrl = `data:${mimetype};base64,${base64Image}`;
    
    const apiUrl = this.configService.get('roboflow.apiUrl');
    const apiKey = this.configService.get('roboflow.apiKey');
    const requestId = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);

    // Log request details
    await this.debugLog(`[${requestId}] Sending request to Roboflow API (Attempt ${4 - retryCount}/3)`, {
      url: apiUrl,
      request: {
        api_key: '***' + (apiKey ? apiKey.slice(-4) : '') + '***',
        inputs: {
          image: {
            type: 'base64',
            value: `${dataUrl.substring(0, 50)}... [truncated]`,
            size: `${(dataUrl.length / 1024).toFixed(2)} KB`
          }
        }
      }
    });

    const makeRequest = async (attempt: number): Promise<any> => {
      try {
        const startTime = Date.now();
        const response = await axios.post(
          apiUrl,
          {
            api_key: apiKey,
            inputs: {
              image: {
                type: 'base64',
                value: dataUrl,
              },
            },
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
            timeout: 60000, // Increased to 60 seconds
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            validateStatus: () => true, // Always resolve the promise
          },
        );

        const responseTime = Date.now() - startTime;
        
        if (response.status >= 400) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Log successful response
        await this.debugLog(
          `[${requestId}] Successfully received response from Roboflow API (${responseTime}ms, Attempt ${attempt})`,
          {
            status: response.status,
            statusText: response.statusText,
            responseSize: `${JSON.stringify(response.data).length / 1024} KB`,
            headers: response.headers,
          }
        );

        return response.data;
      } catch (error: any) {
        // Log detailed error information
        const errorData = {
          attempt,
          message: error.message,
          code: error.code,
          status: error.response?.status,
          statusText: error.response?.statusText,
          responseData: error.response?.data,
          stack: error.stack
        };

        await this.debugLog(
          `[${requestId}] Roboflow API Error (Attempt ${attempt})`,
          errorData
        );

        throw error;
      }
    };

    // Implement retry logic with exponential backoff
    let lastError: any = null;
    for (let attempt = 1; attempt <= retryCount; attempt++) {
      try {
        return await makeRequest(attempt);
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on 4xx errors (except 429 - Too Many Requests)
        if (error.response?.status >= 400 && error.response?.status < 500 && error.response?.status !== 429) {
          break;
        }
        
        // Calculate delay with exponential backoff
        const delayMs = initialDelayMs * Math.pow(2, attempt - 1);
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    // All retries failed
    const errorMessage = (lastError?.response?.data?.message || 
                         lastError?.message || 
                         'Failed to process image with Roboflow after multiple attempts') as string;
    
    throw new Error(`Roboflow API Error: ${errorMessage}`);
  }

  /**
   * Extracts dog images from Roboflow response
   * @param roboflowResponse - The response from Roboflow API
   * @returns Array of detected dog images
   */
  private async extractDogImages(roboflowResponse: RoboflowResponse): Promise<DetectedDog[]> {
    const dogs: DetectedDog[] = [];
    const timestamp = new Date().toISOString();

    try {
      // Log the full response for debugging
      await this.debugLog('Roboflow API Response', roboflowResponse);

      // Check for dynamic_crop in the response
      if (roboflowResponse.outputs && Array.isArray(roboflowResponse.outputs)) {
        for (const output of roboflowResponse.outputs) {
          if (output.dynamic_crop && Array.isArray(output.dynamic_crop)) {
            for (const crop of output.dynamic_crop) {
              try {
                if (crop.type === 'base64' && crop.value) {
                  const dog: DetectedDog = {
                    id: `dog-${Date.now()}-${dogs.length}`,
                    confidence: 1.0, // Default confidence since it's not provided in the crop
                    bbox: {
                      x: 0,
                      y: 0,
                      width: 0,
                      height: 0
                    },
                    imageData: crop.value,
                    timestamp: crop.video_metadata?.frame_timestamp || timestamp
                  };
                  dogs.push(dog);
                }
              } catch (error: any) {
                await this.debugLog('Error processing crop', {
                  error: error.message,
                  crop
                });
              }
            }
          }
        }
      }
      
      // Fallback to predictions if no crops found
      if (dogs.length === 0 && roboflowResponse.predictions && Array.isArray(roboflowResponse.predictions)) {
        await this.debugLog('No dynamic_crop found, falling back to predictions');
        
        // Filter for dog detections
        const dogDetections = roboflowResponse.predictions.filter(
          (pred: any) => 
            pred.class && 
            pred.class.toLowerCase() === 'dog' && 
            pred.confidence > 0.5
        );

        // Process each dog detection
        for (const detection of dogDetections) {
          try {
            // Extract the cropped image data if available
            let imageData: string | null = null;
            
            // Check for different possible locations of the cropped image data
            if (detection.crop?.image) {
              imageData = detection.crop.image;
            } else if (detection.crops?.[0]?.image) {
              imageData = detection.crops[0].image;
            } else if (detection.image) {
              imageData = detection.image;
            }

            if (imageData) {
              const dog: DetectedDog = {
                id: `dog-${Date.now()}-${dogs.length}`,
                confidence: detection.confidence || 1.0,
                bbox: {
                  x: detection.x || 0,
                  y: detection.y || 0,
                  width: detection.width || 0,
                  height: detection.height || 0
                },
                imageData,
                timestamp
              };
              dogs.push(dog);
            }
          } catch (error: any) {
            await this.debugLog('Error processing dog detection', {
              error: error.message,
              detection
            });
            // Continue with other detections if one fails
          }
        }
      }

      return dogs;
    } catch (error: any) {
      await this.debugLog('Error in extractDogImages', {
        error: error.message,
        stack: error.stack,
        response: roboflowResponse
      });
      
      // Return empty array if there was an error but don't fail the whole request
      return [];
    }
  }

  /**
   * Processes an image to detect dogs
   * @param file - The uploaded file
   * @returns Promise with the detected dogs
   */
  async detectDogs(file: { buffer: Buffer; mimetype: string }): Promise<DetectionResult> {
    try {
      // Process the image with Roboflow
      const roboflowResponse: RoboflowResponse = await this.processWithRoboflow(file.buffer, file.mimetype);
      
      // Extract dog images from the response
      const detectedDogs = await this.extractDogImages(roboflowResponse);
      
      // Log the results
      await this.debugLog('Dog detection results', {
        totalDogsDetected: detectedDogs.length,
        dogs: detectedDogs.map(dog => ({
          confidence: dog.confidence,
          bbox: dog.bbox,
          imageSize: dog.imageData ? `${(dog.imageData.length / 1024).toFixed(2)} KB` : 'N/A'
        }))
      });
      
      return {
        success: true,
        detectedDogs,
        debugInfo: {
          totalDetected: detectedDogs.length
        }
      };
    } catch (error: any) {
      await this.debugLog('Error in detectDogs', {
        error: error.message,
        stack: error.stack,
        response: error.response?.data
      });
      return {
        success: false,
        detectedDogs: [],
        error: `Failed to detect dogs: ${error.message}`,
        debugInfo: {
          error: error.message,
          stack: error.stack
        }
      };
    }
  }
}
