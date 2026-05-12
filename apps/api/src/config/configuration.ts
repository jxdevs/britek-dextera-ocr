export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
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
