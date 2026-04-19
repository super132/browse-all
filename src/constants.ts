import * as path from 'path';

export const BASE_DIR = '/tmp/browser-tool';
export const SOCK_PATH = path.join(BASE_DIR, 'daemon.sock');
export const PID_PATH = path.join(BASE_DIR, 'daemon.pid');
