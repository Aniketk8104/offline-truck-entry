import pino from 'pino';
import { config } from './config';

// JSON logs, one line per event. Request headers are never logged, so the API key stays out.
export const logger = pino({ level: config.logLevel });
