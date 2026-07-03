export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  db: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    name: process.env.DB_NAME ?? 'ocrdemo',
    user: process.env.DB_USER ?? 'ocrdemo',
    password: process.env.DB_PASSWORD ?? 'ocrdemo',
    sync: process.env.DB_SYNC === 'true',
  },
  jwt: {
    secret: process.env.JWT_SECRET ?? 'change-me',
    expiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
  },
  storage: {
    driver: process.env.STORAGE_DRIVER ?? 'local',
    localPath: process.env.LOCAL_STORAGE_PATH ?? './uploads',
    s3: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? '',
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? '',
      region: process.env.AWS_DEFAULT_REGION ?? 'us-east-1',
      bucket: process.env.AWS_BUCKET ?? '',
    },
  },
  kapso: {
    // Credenciales hardcodeadas — cambiar aquí y hacer deploy.
    webhookSecret: 'cfcf919c82b840fd0435de4604605f4cb7c173c2ca991f07c4cfc5afe89a4327',
    apiKey: '03c620f2ba12c421dbe61f5f10d4922c8772980c1b3fcc1ab2af1a5afdebe186',
    apiUrl: 'https://api.kapso.ai/v1',
    phoneNumberId: '1106594329211348',
  },
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  },
  gemini: {
    apiKey: process.env.GEMINI_API_KEY ?? '',
    defaultModel: process.env.GEMINI_DEFAULT_MODEL ?? 'gemini-2.5-flash',
    pricing: {
      'gemini-2.5-flash': {
        input: parseFloat(process.env.GEMINI_FLASH_INPUT_PRICE ?? '0.30'),
        output: parseFloat(process.env.GEMINI_FLASH_OUTPUT_PRICE ?? '2.50'),
      },
      'gemini-2.5-pro': {
        input: parseFloat(process.env.GEMINI_PRO_INPUT_PRICE ?? '1.25'),
        output: parseFloat(process.env.GEMINI_PRO_OUTPUT_PRICE ?? '10.00'),
      },
    },
  },
});
