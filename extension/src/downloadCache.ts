import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export class DownloadCache {
    private readonly cachePath: string;

    constructor(cachePath: string) {
        this.cachePath = cachePath;
    }

    public async download(uri: string): Promise<string> {
        const identifier = crypto.hash('sha1', uri.toString());
        const packagePath = path.join(this.cachePath, identifier);
        if (await fileAccessible(packagePath)) {
            return packagePath;
        }
        const response = await fetch(uri.toString());
        if (!response.ok) {
            throw new Error(`Unable to download ${uri}`);
        }
        await fs.writeFile(packagePath, await response.bytes());

        return packagePath;
    }
}

async function fileAccessible(path: string): Promise<boolean> {
    try {
        await fs.access(path);
        return true;
    } catch {
        return false;
    }
}
