import express, { type Express } from 'express';

// Builds the Express app without starting it, so tests can use it without opening a port.
export function createApp(): Express {
  const app = express();

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}
