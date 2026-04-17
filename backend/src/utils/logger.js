// Logger - Structured logging utility with file persistence
import { config } from '../config/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

const COLORS = {
  error: '\x1b[31m', // Red
  warn: '\x1b[33m',  // Yellow
  info: '\x1b[36m',  // Cyan
  debug: '\x1b[35m', // Magenta
  reset: '\x1b[0m',
};

class Logger {
  constructor() {
    this.level = LOG_LEVELS[config.logLevel] || LOG_LEVELS.info;

    // Create logs directory
    this.logsDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(this.logsDir)) {
      fs.mkdirSync(this.logsDir, { recursive: true });
    }

    // Log files
    this.agentLogFile = path.join(this.logsDir, 'agents.log');
    this.apiLogFile = path.join(this.logsDir, 'api-calls.log');
    this.errorLogFile = path.join(this.logsDir, 'errors.log');
    this.allLogFile = path.join(this.logsDir, 'all.log');

    // Session logs
    this.sessionLogs = new Map();
  }

  /**
   * Write to log file
   * @private
   */
  _writeToFile(filename, entry) {
    try {
      fs.appendFileSync(filename, JSON.stringify(entry) + '\n');
    } catch (error) {
      console.error('Failed to write to log file:', error.message);
    }
  }

  /**
   * Format log message
   * @private
   */
  _formatMessage(level, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const color = COLORS[level];
    const reset = COLORS.reset;

    const logObject = {
      timestamp,
      level: level.toUpperCase(),
      message,
      ...(Object.keys(meta).length > 0 && { meta }),
    };

    // Console output with colors
    console.log(
      `${color}[${timestamp}] ${level.toUpperCase()}:${reset}`,
      message,
      Object.keys(meta).length > 0 ? meta : ''
    );

    // Write to all.log
    this._writeToFile(this.allLogFile, logObject);

    // Write to specific log files
    if (level === 'error') {
      this._writeToFile(this.errorLogFile, logObject);
    }

    return logObject;
  }

  /**
   * Log error message
   */
  error(message, meta = {}) {
    if (this.level >= LOG_LEVELS.error) {
      this._formatMessage('error', message, meta);
    }
  }

  /**
   * Log warning message
   */
  warn(message, meta = {}) {
    if (this.level >= LOG_LEVELS.warn) {
      this._formatMessage('warn', message, meta);
    }
  }

  /**
   * Log info message
   */
  info(message, meta = {}) {
    if (this.level >= LOG_LEVELS.info) {
      this._formatMessage('info', message, meta);
    }
  }

  /**
   * Log debug message
   */
  debug(message, meta = {}) {
    if (this.level >= LOG_LEVELS.debug) {
      this._formatMessage('debug', message, meta);
    }
  }

  /**
   * Log HTTP request
   */
  request(req, res) {
    this.info(`${req.method} ${req.url}`, {
      statusCode: res.statusCode,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  }

  /**
   * Log agent activity
   */
  agent(agentName, action, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'AGENT',
      agent: agentName,
      action,
      ...details
    };
    this._writeToFile(this.agentLogFile, entry);
    console.log(`🤖 [${agentName}] ${action}`);
  }

  /**
   * Log API calls
   */
  apiCall(service, method, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      category: 'API',
      service,
      method,
      ...details
    };
    this._writeToFile(this.apiLogFile, entry);
    console.log(`🌐 [${service}] ${method}`);
  }

  /**
   * Log web scraping attempts
   */
  scraping(url, success, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: success ? 'INFO' : 'WARN',
      category: 'SCRAPING',
      url,
      success,
      ...details
    };
    this._writeToFile(this.apiLogFile, entry);
    console.log(`🔍 [SCRAPING] ${url}: ${success ? 'SUCCESS' : 'FAILED'}`);
  }

  /**
   * Start session log
   */
  startSession(sessionId, agentType, userId) {
    const sessionFile = path.join(this.logsDir, `session-${sessionId}.log`);
    const entry = {
      timestamp: new Date().toISOString(),
      event: 'SESSION_START',
      sessionId,
      agentType,
      userId
    };
    fs.writeFileSync(sessionFile, JSON.stringify(entry) + '\n');
    this.sessionLogs.set(sessionId, sessionFile);
    console.log(`📝 [SESSION] Started: ${sessionId} (${agentType})`);
  }

  /**
   * Log to session
   */
  logToSession(sessionId, event, data = {}) {
    const sessionFile = this.sessionLogs.get(sessionId);
    if (sessionFile) {
      const entry = {
        timestamp: new Date().toISOString(),
        event,
        ...data
      };
      fs.appendFileSync(sessionFile, JSON.stringify(entry) + '\n');
    }
  }

  /**
   * End session log
   */
  endSession(sessionId, result) {
    const sessionFile = this.sessionLogs.get(sessionId);
    if (sessionFile) {
      const entry = {
        timestamp: new Date().toISOString(),
        event: 'SESSION_END',
        sessionId,
        result
      };
      fs.appendFileSync(sessionFile, JSON.stringify(entry) + '\n');
      this.sessionLogs.delete(sessionId);
      console.log(`✅ [SESSION] Ended: ${sessionId}`);
    }
  }
}

export default new Logger();
