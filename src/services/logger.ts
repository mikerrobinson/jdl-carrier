interface LoggerConfig {
  verboseLogging: boolean;
}

class Logger {
  private config: LoggerConfig;

  constructor(config: LoggerConfig) {
    this.config = config;
  }

  info(message: string, context?: Record<string, unknown>): void {
    if (context) {
      console.log(message, context);
    } else {
      console.log(message);
    }
  }

  warn(message: string, context?: Record<string, unknown>): void {
    if (context) {
      console.warn(message, context);
    } else {
      console.warn(message);
    }
  }

  error(message: string, context?: Record<string, unknown>): void {
    if (context) {
      console.error(message, context);
    } else {
      console.error(message);
    }
  }

  /**
   * Log a full JSON payload (only when FEDEX_SANDBOX=true)
   */
  debugPayload(label: string, payload: unknown): void {
    if (this.config.verboseLogging) {
      console.log(`${label}:`, JSON.stringify(payload, null, 2));
    }
  }
}

export function createLogger(verboseLogging: boolean): Logger {
  return new Logger({ verboseLogging });
}

export type { Logger };
