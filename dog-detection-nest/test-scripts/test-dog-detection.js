const axios = require('axios');
const fs = require('fs');
const path = require('path');

// Configuration
const API_URL = 'http://localhost:5001/api/detect-dogs';
const TEST_IMAGE_PATH = path.join(__dirname, 'test-dog.jpg');
const OUTPUT_DIR = path.join(__dirname, 'output');

// Ensure output directory exists and is empty
if (fs.existsSync(OUTPUT_DIR)) {
  // Remove all files in the output directory
  const files = fs.readdirSync(OUTPUT_DIR);
  for (const file of files) {
    fs.unlinkSync(path.join(OUTPUT_DIR, file));
  }
  console.log(`🧹 Cleared output directory: ${OUTPUT_DIR}`);
} else {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  console.log(`📁 Created output directory: ${OUTPUT_DIR}`);
}

/**
 * Saves a base64 image to a file
 * @param {string} base64Data - The base64 image data (with or without data URL prefix)
 * @param {string} outputPath - The path to save the image to
 */
function saveBase64Image(base64Data, outputPath) {
  // Remove data URL prefix if present
  const base64Image = base64Data.split(';base64,').pop();
  fs.writeFileSync(outputPath, base64Image, { encoding: 'base64' });
  console.log(`✅ Saved image to ${outputPath}`);
}

async function testDogDetection() {
  try {
    // Read the test image
    const imageBuffer = fs.readFileSync(TEST_IMAGE_PATH);
    
    // Convert to base64 data URL
    const base64Image = `data:image/jpeg;base64,${imageBuffer.toString('base64')}`;
    
    console.log('Sending request to dog detection API...');
    const response = await axios.post(API_URL, {
      image: base64Image
    });
    
    console.log('Response status:', response.status);
    
    if (response.data.success) {
      const { detectedDogs } = response.data;
      console.log(`✅ Successfully processed image. Detected ${detectedDogs.length} dog(s)!`);
      
      // Save each detected dog image
      if (detectedDogs.length > 0) {
        console.log('\nSaving detected dog images...');
        detectedDogs.forEach((dog, index) => {
          if (dog.imageData) {
            const outputPath = path.join(OUTPUT_DIR, `detected-dog-${index + 1}.jpg`);
            saveBase64Image(dog.imageData, outputPath);
          } else {
            console.log(`⚠️ No image data for detected dog ${index + 1}`);
          }
        });
      }
    } else {
      console.log('⚠️ No dogs detected in the image.');
    }
  } catch (error) {
    console.error('Error testing dog detection:', error.response?.data || error.message);
  }
}

// Run the test
testDogDetection().catch(console.error);
