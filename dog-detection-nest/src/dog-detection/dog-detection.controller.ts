import { Controller, Post, Body, BadRequestException } from '@nestjs/common';
import { DogDetectionService } from './dog-detection.service';
import { DetectionResult } from './dog-detection.types';

export interface DetectDogsDto {
  image: string; // Base64 encoded image string
}

@Controller('api')
export class DogDetectionController {
  constructor(private readonly dogDetectionService: DogDetectionService) {}

  @Post('detect-dogs')
  async detectDogs(
    @Body() body: DetectDogsDto,
  ): Promise<DetectionResult> {
    const { image } = body;

    if (!image) {
      throw new BadRequestException('No image data provided');
    }

    // Validate base64 string format
    const base64Regex = /^data:image\/([a-zA-Z]*);base64,([^\"]*)$/;
    const matches = image.match(base64Regex);
    
    if (!matches) {
      throw new BadRequestException('Invalid image format. Please provide a valid base64 encoded image.');
    }

    const mimeType = matches[1];
    const base64Data = matches[2];

    try {
      // Convert base64 to buffer
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Create a file-like object with only the required properties
      const file = {
        buffer,
        mimetype: `image/${mimeType}`
      };

      const result = await this.dogDetectionService.detectDogs(file);
      return result;
    } catch (error: any) {
      console.error('Error in detect-dogs endpoint:', error);
      throw new BadRequestException(
        error.message || 'Failed to process image',
      );
    }
  }

  @Post('health')
  healthCheck() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
