import { isLeft, isRight } from 'fp-ts/lib/Either';
import { PathReporter } from 'io-ts/lib/PathReporter';
import fetch from 'node-fetch';
import { CancellationToken } from 'vscode';

import { getLogger } from './logger';
import { Extension } from './Extension';
import { Registry, RegistrySource } from './Registry';
import { VsxExtension } from './VsxExtension';
import {
    SearchResult,
    SearchResultRT,
    VersionsResult,
    VersionsResultRT,
    ExtensionMetadataRT,
    ExtensionMetadata,
} from './VsxRegistryTypes';
import { DownloadCache } from './downloadCache';

/**
 * Represents a registry.
 */
export class VsxRegistry implements Registry {
    public _implements: 'Registry' = 'Registry';
    readonly query: string | string[];
    readonly enablePagination: boolean;
    readonly name: string;
    readonly source: RegistrySource;
    readonly registryUrl: string;
    readonly type: string;
    private readonly _fetchCache: DownloadCache;

    public static async isRegistry(url: string): Promise<boolean> {
        try {
            // Test if we can make a dummy query
            const reply = await fetch(url + '/api/-/search?query=dummyquery&category=dummyquery&size=1');
            const searchResult = await reply.json();
            return isRight(SearchResultRT.decode(searchResult));
        } catch (_error: any) {
            return false;
        }
    }

    constructor(name: string, registryUrl: string, fetchCache: DownloadCache, query?: string) {
        this.name = name;
        this.registryUrl = registryUrl;
        this.type = 'vsx';
        this.query = query ?? '';
        this.enablePagination = true;
        this.source = RegistrySource.User;
        this._fetchCache = fetchCache;
    }

    /**
     * Gets all packages matching the registry options.
     *
     * @param _token Token to use to cancel the search.
     */
    public async getExtensions(_token?: CancellationToken): Promise<Extension[]> {
        let extensions: Extension[] = [];

        let stop = false;
        let from = 0;
        while (!stop) {
            const query = `${this.registryUrl}/api/-/search?query=${this.query}&size=100&offset=${from}`;
            const reply = await fetch(query);
            const replyJson = await reply.json();

            const searchResult = SearchResultRT.decode(replyJson);

            if (isLeft(searchResult)) {
                getLogger().log(`Invalid response to ${query}: ${PathReporter.report(searchResult).join(',')}`);
                throw new Error(`Invalid response from server. See output pane for details.`);
            }
            const typedResult: SearchResult = searchResult.right;

            if (typedResult.extensions.length === 0) {
                stop = true;
            }

            const validExtensions = typedResult.extensions
                .filter((extension) => !extension.displayName?.includes('(built-in)'))
                .map((extension) => new VsxExtension(this, extension));

            extensions = [...extensions, ...validExtensions];
            from = from + typedResult.extensions.length;
        }

        return extensions;
    }

    /**
     * Gets the list of available versions for a package.
     */
    public async getVersions(name: string): Promise<string[]> {
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

        return Object.keys(typedResult.versions);
    }

    public fetchCache(): DownloadCache {
        return this._fetchCache;
    }

    async getExtensionMetadata(publisher: string, name: string, version: string): Promise<ExtensionMetadata> {
        const query = `${this.registryUrl}/api/${publisher}/${name}/${version}`;
        const reply = await fetch(query);
        const queryResult = await reply.json();

        const result = ExtensionMetadataRT.decode(queryResult);

        if (isLeft(result)) {
            getLogger().log(`Invalid response to ${query}: ${PathReporter.report(result).join(',')}`);
            throw new Error(`Invalid response from server. See output pane for more info.`);
        }
        return result.right;
    }

    /**
     * Gets whether this registry has the same Uri and filtering options as
     * another registry.
     */
    equals(other: any): boolean {
        if (other instanceof VsxRegistry) {
            return other.query === this.query && other.registryUrl?.toString() === this.registryUrl?.toString();
        }
        return false;
    }
}
