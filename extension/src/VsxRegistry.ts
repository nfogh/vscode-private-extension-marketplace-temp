import * as decompress from 'decompress';
import { isLeft } from 'fp-ts/lib/Either';
import * as fs from 'fs';
import * as fspromises from 'fs/promises';
import { PathReporter } from 'io-ts/lib/PathReporter';
import fetch from 'node-fetch';
import path = require('path');
import { SemVer } from 'semver';
import { CancellationToken, Uri } from 'vscode';

import { ExtensionInfoService } from './extensionInfo';
import { getLogger } from './logger';
import { Package } from './Package';
import { Registry, RegistrySource, RegistryOptions, VersionInfo, VersionMissingError } from './Registry';
import { getNpmDownloadDir } from './util';
import {
    SearchResult,
    SearchResultRT,
    QueryResult,
    QueryResultRT,
    VersionsResult,
    VersionsResultRT,
} from './VsxRegistryTypes';

async function pathAccessible(path: string) {
    try {
        await fspromises.access(path);
        return true;
    } catch {
        return false;
    }
}

/**
 * Represents a registry.
 */
export class VsxRegistry implements Registry {
    readonly query: string | string[];
    readonly enablePagination: boolean;
    readonly extensionInfo: ExtensionInfoService;
    readonly name: string;
    readonly source: RegistrySource;
    readonly registryUrl: string;

    public static async isRegistry(url: string): Promise<boolean> {
        try {
            const reply = await fetch(url + '/api/version');
            const versionResult = await reply.json();
            return versionResult.version !== undefined;
        } catch (_error: any) {
            return false;
        }
    }

    constructor(
        extensionInfo: ExtensionInfoService,
        name: string,
        registryUrl: string,
        options: Partial<RegistryOptions>,
    ) {
        this.query = options.query ?? '';
        this.enablePagination = true;
        this.registryUrl = registryUrl;
        this.extensionInfo = extensionInfo;
        this.name = name;
        this.source = RegistrySource.User;
    }
    /**
     * The Uri of the registry, if configured. If this is `undefined`, NPM's
     * normal resolution scheme is used to find the registry.
     */
    get uri(): Uri | undefined {
        return Uri.parse(this.registryUrl);
    }

    /**
     * Download a package and return the Uri of the directory where it was
     * extracted.
     *
     * @param packageOrSpec A package to download, or an NPM package specifier.
     */
    async downloadPackage(packageOrSpec: Package | string): Promise<Uri> {
        const spec = packageOrSpec instanceof Package ? packageOrSpec.spec : packageOrSpec;
        const [name, version] = spec.split('@');
        const pkg = await this.getPackage(name, version);

        if (!pkg.vsixFile) {
            throw new Error(`No VSIX file found for ${name}@${version}`);
        }

        const downloadDir = getNpmDownloadDir();
        const filePath = path.join(downloadDir, path.basename(pkg.vsixFile));
        if (!(await pathAccessible(filePath))) {
            await fspromises.mkdir(downloadDir, { recursive: true });
            const fileStream = fs.createWriteStream(filePath);

            const data = await fetch(pkg.vsixFile);
            await new Promise<void>((resolve, reject) => {
                data.body.pipe(fileStream);
                data.body.on('error', reject);
                fileStream.on('finish', resolve);
            });
        }

        const extractedPath = filePath + '-extracted';

        if (!(await pathAccessible(extractedPath))) {
            await decompress(filePath, extractedPath);

            // Copy the vsix file to be compatible with the NPM registry.
            // TODO: Refactor logic to avoid copying the file.
            await fspromises.copyFile(filePath, path.join(extractedPath, 'extension', path.basename(filePath)));
        }

        return Uri.file(path.join(extractedPath, 'extension'));
    }

    /**
     * Gets all packages matching the registry options.
     *
     * @param _token Token to use to cancel the search.
     */
    async getPackages(_token?: CancellationToken): Promise<Package[]> {
        let packages: Package[] = [];

        let stop = false;
        let from = 0;
        while (!stop) {
            const query = `${this.registryUrl}/api/-/search?query=${this.query}&size=100&offset=${from}`;
            const reply = await fetch(query);
            const searchResult = await reply.json();

            const result = SearchResultRT.decode(searchResult);

            if (isLeft(result)) {
                getLogger().log(`Invalid response to ${query}: ${PathReporter.report(result).join(',')}`);
                throw new Error(`Invalid response from server. See output pane for details.`);
            }
            const typedResult: SearchResult = result.right;

            if (typedResult.extensions.length === 0) {
                stop = true;
            }

            const page = typedResult.extensions.map(
                (extension) =>
                    new Package(this, {
                        name: extension.name,
                        version: extension.version,
                        displayName: extension.displayName,
                        publisher: extension.namespace,
                        description: extension.description,
                        downloads: extension.downloadCount,
                        rating: extension.averageRating,
                        files: Object.values(extension.files),
                        iconUrl: extension.files['icon'],
                    }),
            );

            packages = [...packages, ...page];
            from = from + typedResult.extensions.length;
        }

        await Promise.all(packages.map((pkg) => pkg.updateState()));

        return packages;
    }

    /**
     * Gets the release channels available for a package.
     *
     * This is a dictionary with channel names as keys and the latest version
     * in each channel as values.
     */
    async getPackageChannels(_name: string): Promise<Record<string, VersionInfo>> {
        return {};
    }

    /**
     * Gets the list of available versions for a package.
     */
    async getPackageVersions(name: string): Promise<VersionInfo[]> {
        const [namespace, extension] = name.split('.');
        const query = `${this.registryUrl}/api/${namespace}/${extension}/versions`;
        const reply = await fetch(query);
        const versionsResult = await reply.json();

        const result = VersionsResultRT.decode(versionsResult);

        if (isLeft(result)) {
            getLogger().log(`Invalid response to ${query}: ${PathReporter.report(result).join(',')}`);
            throw new Error(`Invalid response from server. See output pane for details.`);
        }
        const typedResult: VersionsResult = result.right;

        const versions = Object.keys(typedResult.versions);
        return versions.map((version) => {
            return {
                version: new SemVer(version),
            };
        });
    }

    /**
     * Gets the version-specific metadata for a specific version of a package.
     *
     * If `version` is the name of a release channel, this gets the latest version in that channel.
     * If `version` is omitted, this gets the latest version for the user's selected channel.
     * @throws VersionMissingError if the given version does not exist.
     */
    async getPackage(name: string, version?: string): Promise<Package> {
        let query = `${this.registryUrl}/api/-/query?extensionName=${name}`;
        if (version) {
            query += `&extensionVersion=${version}`;
        }
        const reply = await fetch(query);
        const queryResult = await reply.json();

        const result = QueryResultRT.decode(queryResult);

        if (isLeft(result)) {
            getLogger().log(`Invalid response to ${query}: ${PathReporter.report(result).join(',')}`);
            throw new Error(`Invalid response from server. See output pane for more info.`);
        }
        const typedResult: QueryResult = result.right;

        if (typedResult.extensions.length === 0) {
            throw new VersionMissingError(name, version ?? 'latest');
        }

        const extension = typedResult.extensions[0];
        const packageInfo = {
            name: extension.name,
            version: extension.version,
            displayName: extension.displayName,
            publisher: extension.namespace,
            description: extension.description,
            downloads: extension.downloads,
            rating: extension.averageRating,
            repository: extension.repository,
            files: extension.files ? Object.values(extension.files) : [],
        };
        return new Package(this, packageInfo);
    }

    /**
     * Gets whether this registry has the same Uri and filtering options as
     * another registry.
     */
    equals(other: any): boolean {
        if (other instanceof VsxRegistry) {
            return other.query === this.query && other.uri?.toString() === this.uri?.toString();
        }
        return false;
    }
}
