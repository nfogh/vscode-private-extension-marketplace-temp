import * as SemVer from 'semver';

import { Extension, ExtensionVersion, identifier } from './Extension';
import { getPlatform } from './platform';
import { Registry } from './Registry';
import { VsxRegistry } from './VsxRegistry';
import { SearchEntry } from './VsxRegistryTypes';

export class VsxExtension implements Extension {
    private readonly _name: string;
    private readonly _publisher: string;
    private readonly _registry: VsxRegistry;

    // If this is just a single version, we have not yet queried for all
    // versions and can only return the 'latest' version.
    private _versions: VsxExtensionVersion | VsxExtensionVersion[];

    constructor(registry: VsxRegistry, extensionInfo: SearchEntry) {
        this._registry = registry;
        this._publisher = extensionInfo.namespace;
        this._name = extensionInfo.name;
        this._versions = new VsxExtensionVersion(
            registry,
            this._publisher,
            this._name,
            extensionInfo.version,
            extensionInfo,
        );
    }

    /** The package name. */
    public name(): string {
        return this._name;
    }

    /** The name of the package's publisher */
    public publisher(): string {
        return this._publisher;
    }

    private async getVersions(): Promise<VsxExtensionVersion[]> {
        const versions = await this._registry.getVersions(identifier(this._publisher, this._name));
        return versions
            .map((version) => new VsxExtensionVersion(this._registry, this._publisher, this._name, version))
            .sort((a, b) => SemVer.compare(a.version(), b.version()));
    }

    public async versions(): Promise<string[]> {
        if (!Array.isArray(this._versions)) {
            this._versions = await this.getVersions();
        }

        return this._versions.map((extensionVersion) => extensionVersion.version());
    }

    /** Get the available versions. */
    public async getVersion(version: string): Promise<ExtensionVersion | undefined> {
        if (version === 'latest') {
            if (!Array.isArray(this._versions)) {
                this._versions;
            }
        }

        if (!Array.isArray(this._versions)) {
            this._versions = await this.getVersions();
        }

        const matchingVersion = this._versions.filter((extensionVersion) => extensionVersion.version());
        return matchingVersion[0];
    }

    public readonly _implements = 'Extension';
}

export class VsxExtensionVersion implements ExtensionVersion {
    public _implements: 'ExtensionVersion' = 'ExtensionVersion';

    private readonly _name: string;
    private readonly _publisher: string;

    /** The name to display for the package in the UI. */
    private readonly _displayName: string | undefined;

    /** A short description for the package. */
    private readonly _description: string | undefined;

    /** The package version */
    private _version: string;

    /** The registry containing the extension. */
    private readonly _registry: VsxRegistry;

    private _downloads: number | undefined;
    private _rating: number | undefined;
    private _repository: string | undefined;

    private _readmeUri: string | undefined;
    private _readme: string | undefined;

    private _changelogUri: string | undefined;
    private _changelog?: string;

    /** The location of the icon on the server */
    private _iconUri: string | undefined;

    /** The location of the vsix on the server */
    private _vsixUri: string | undefined;

    /** The location of the locally cached vsix */
    private _cachedVsixFile: string | undefined;

    constructor(registry: VsxRegistry, name: string, publisher: string, version: string, extensionInfo?: SearchEntry) {
        this._registry = registry;
        this._publisher = publisher;
        this._name = name;
        this._version = version;
        if (extensionInfo) {
            this._displayName = extensionInfo.displayName;
            this._downloads = extensionInfo.downloadCount;
            this._rating = extensionInfo.averageRating;
            this._description = extensionInfo.description;
            this._iconUri = extensionInfo.files.icon;
        }
    }

    public version(): string {
        return this._version;
    }

    public registry(): Registry {
        return this._registry;
    }

    public async displayName(): Promise<string | undefined> {
        return this._displayName;
    }

    public async description(): Promise<string | undefined> {
        return this._description;
    }

    private getPlatformSpecificDownload(downloads: Record<string, string> | undefined): string | undefined {
        if (downloads?.universal !== undefined) {
            return downloads.universal;
        }
        return downloads ? downloads[getPlatform()] : undefined;
    }

    private async updateMetadata(): Promise<void> {
        const metadata = await this._registry.getExtensionMetadata(this._publisher, this._name, this._version);
        this._downloads = this._downloads ?? metadata.downloadCount;
        this._rating = this._rating ?? metadata.averageRating;
        this._readmeUri = this._readmeUri ?? metadata.files?.readme;
        this._changelogUri = this._changelogUri ?? metadata.files?.changelog;
        this._iconUri = this._iconUri ?? metadata.files?.icon;
        this._repository = this._repository ?? metadata.repository;
        this._vsixUri = this._vsixUri ?? this.getPlatformSpecificDownload(metadata.downloads);
    }

    public async downloads(): Promise<number | undefined> {
        if (this._downloads === undefined) {
            await this.updateMetadata();
        }
        return this._downloads;
    }

    public async rating(): Promise<number | undefined> {
        if (this._rating === undefined) {
            await this.updateMetadata();
        }
        return this._rating;
    }

    public async repository(): Promise<string | undefined> {
        if (this._repository === undefined) {
            await this.updateMetadata();
        }
        return this._repository;
    }

    public async readme(): Promise<string | undefined> {
        if (this._readme) {
            return this._readme;
        }

        if (this._readmeUri === undefined) {
            await this.updateMetadata();
        }
        if (this._readmeUri) {
            return (await tryFetch(this._readmeUri))?.text();
        }
        return undefined;
    }

    public async changelog(): Promise<string | undefined> {
        if (this._changelog) {
            return this._changelog;
        }

        if (this._changelogUri === undefined) {
            await this.updateMetadata();
        }
        if (this._changelogUri) {
            return (await tryFetch(this._changelogUri))?.text();
        }
        return undefined;
    }

    public async icon(): Promise<string | undefined> {
        if (this._iconUri === undefined) {
            await this.updateMetadata();
        }
        return this._iconUri;
    }

    public async vsix(): Promise<string> {
        if (this._cachedVsixFile) {
            return this._cachedVsixFile;
        }

        if (this._vsixUri === undefined) {
            await this.updateMetadata();
        }

        if (!this._vsixUri) {
            throw new Error(
                `Unable to get vsix download URI for ${identifier(this._publisher, this._name)} from registry ${
                    this._registry.name
                }`,
            );
        }

        this._cachedVsixFile = await this._registry.fetchCache().download(this._vsixUri);
        return this._cachedVsixFile;
    }
}

async function tryFetch(uri: string): Promise<Response | undefined> {
    try {
        const reply = await fetch(uri);
        if (!reply.ok) {
            return undefined;
        }
        return await reply;
    } catch {
        return undefined;
    }
}
