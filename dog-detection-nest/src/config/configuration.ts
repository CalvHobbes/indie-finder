interface RoboflowConfig {
  apiKey: string;
  apiUrl: string;
}

export interface AppConfig {
  port: number;
  corsOrigin: string;
  roboflow: RoboflowConfig;
  debug: boolean;
}

export default (): AppConfig => ({
  port: parseInt(process.env.PORT || '5001', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  roboflow: {
    apiKey: process.env.ROBOFLOW_API_KEY || '',
    apiUrl: process.env.ROBOFLOW_API_URL || '',
  },
  debug: process.env.DEBUG_MODE === 'true',
});
