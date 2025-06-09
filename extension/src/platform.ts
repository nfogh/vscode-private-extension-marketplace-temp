import * as os from 'os';

export function getPlatform(): string {
    return os.platform() + '-' + os.arch();
}
