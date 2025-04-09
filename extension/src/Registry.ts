import { SemVer } from 'semver';
import { CancellationToken, Uri } from 'vscode';
import * as nls from 'vscode-nls/node';

import { ExtensionInfoService } from './extensionInfo';
import { Package } from './Package';

const localize = nls.loadMessageBundle();

export enum RegistrySource {
    /** Registry is defined by user settings. */
    User = 'user',
    /** Registry is defined by a workspace folder's extensions.private.json. */
    Workspace = 'workspace',
}

/**
 * Error thrown when trying to get a version of a package that does not exist.
 */
export class VersionMissingError extends Error {
    constructor(public pkg: string, public version: string) {
        super(localize('version.missing', 'Couldn\'t find version "{0}" for package "{1}".', version, pkg));
    }
}

export interface RegistryOptions {
    /**
     * URL of the NPM registry to use. If omitted, this uses NPM's normal
     * resolution scheme (searches .npmrc, user config, etc.).
     */
    registry: string;

    /**
     * If set, only return packages that match this query.
     *
     * Use this when your registry contains more packages than just VS Code
     * extensions to filter to just the packages that are extensions, or when
     * it contains multiple groups of extensions and you only want to display
     * some of them.
     *
     * See https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#get-v1search
     * for special search qualifiers such as `keywords:`.
     */
    query: string | string[];

    /**
     * Number of results to limit each query to when requesting package results.
     *
     * Default: 20
     */
    limit: number;
}

export interface VersionInfo {
    version: SemVer;
    time?: Date;
}

/**
 * Represents a registry.
 */
export interface Registry {
    readonly extensionInfo: ExtensionInfoService;
    readonly name: string;
    readonly source: RegistrySource;

    /**
     * The Uri of the registry, if configured. If this is `undefined`, NPM's
     * normal resolution scheme is used to find the registry.
     */
    get uri(): Uri | undefined;

    /**
     * Download a package and return the Uri of the directory where it was
     * extracted.
     *
     * @param packageOrSpec A package to download, or an NPM package specifier.
     */
    downloadPackage(packageOrSpec: Package | string): Promise<Uri>;

    /**
     * Gets all packages matching the registry options.
     *
     * @param token Token to use to cancel the search.
     */
    getPackages(token?: CancellationToken): Promise<Package[]>;

    /**
     * Gets the release channels available for a package.
     *
     * This is a dictionary with channel names as keys and the latest version
     * in each channel as values.
     */
    getPackageChannels(name: string): Promise<Record<string, VersionInfo>>;

    /**
     * Gets the list of available versions for a package.
     */
    getPackageVersions(name: string): Promise<VersionInfo[]>;

    /**
     * Gets the version-specific metadata for a specific version of a package.
     *
     * If `version` is the name of a release channel, this gets the latest version in that channel.
     * If `version` is omitted, this gets the latest version for the user's selected channel.
     * @throws VersionMissingError if the given version does not exist.
     */
    getPackage(name: string, version?: string): Promise<Package>;

    /**
     * Gets whether this registry has the same Uri and filtering options as
     * another registry.
     */
    equals(other: any): boolean;
}

/**
 * Comparison function to sort registries by name in alphabetical order.
 */
export function compare(a: Registry, b: Registry): number {
    const nameA = a.name.toUpperCase();
    const nameB = b.name.toUpperCase();

    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
}
