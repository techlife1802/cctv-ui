type LogLevel = 'info' | 'warn' | 'error' | 'debug';

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const log = (level: LogLevel, message: string, ...args: any[]) => {
    if (IS_PRODUCTION && level === 'debug') {
        return;
    }

    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

    switch (level) {
        case 'info':
            console.info(formattedMessage, ...args);
            break;
        case 'warn':
            console.warn(formattedMessage, ...args);
            break;
        case 'error':
            console.error(formattedMessage, ...args);
            break;
        case 'debug':
            console.debug(formattedMessage, ...args);
            break;
    }

    // In a real production app, you might want to send logs to a backend service here
};

export const logger = {
    info: (message: string, ...args: any[]) => log('info', message, ...args),
    warn: (message: string, ...args: any[]) => log('warn', message, ...args),
    error: (message: string, ...args: any[]) => log('error', message, ...args),
    debug: (message: string, ...args: any[]) => log('debug', message, ...args),
};
