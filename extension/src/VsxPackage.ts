import * as t from 'io-ts';
import { gt, parse as parseVersion, SemVer } from 'semver';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls/node';

import { Package, PackageState } from './Package';
import { Registry, VersionInfo } from './Registry';
import { LATEST } from './releaseChannel';
import { assertType, options } from './typeUtil';
import { isNonEmptyArray, formatExtensionId } from './util';

const localize = nls.loadMessageBundle();

const RepositoryType = t.type({
    type: t.string,
    url: t.string,
});

/**
 * Fields expected for all VSX packages.
 */
const PackageManifest = options(
    {
        name: t.string,
        files: t.array(t.string),
    },
    {
        displayName: t.string,
        publisher: t.string,
        description: t.string,
        version: t.string,
        downloads: t.number,
        rating: t.number,
        repository: t.union([t.string, RepositoryType]),
        osSpecificVsix: t.record(t.string, t.string),
    },
);
type PackageManifest = t.TypeOf<typeof PackageManifest>;

/**
 * Represents an NPM package for an extension.
 */
export class VsxPackage implements Package {
    public type: 'Package' = 'Package';
    /**
     * Comparison function to sort packages by name in alphabetical order.
     */
    public compare(other: any): number {
        if (other instanceof VsxPackage) {
            return this.displayName.localeCompare(other.displayName);
        }
        return 0;
    }

    /** The package name. */
    public readonly name: string;
    /** The name of the package's publisher */
    public readonly publisher: string;
    /** The ID of the extension in the form `publisher.name`. */
    public readonly extensionId: string;
    /** The name to display for the package in the UI. */
    public readonly displayName: string;
    /** A short description for the package. */
    public readonly description: string;
    /** The package version. */
    public readonly version: SemVer;
    /** The registry containing the extension. */
    public readonly registry: Registry;
    /* The channel that this package is tracking */
    public readonly channel: string;

    public readonly downloads?: number;
    public readonly rating?: number;
    public readonly repository?: string;

    private readonly files: string[];
    private readonly _vsixFile: vscode.Uri | null;
    private readonly isPublisherValid: boolean;

    private _isInstalled = false;
    private readonly _isUiExtension;
    private _installedVersion: SemVer | null = null;
    private _installedExtensionKind: vscode.ExtensionKind | undefined;

    /**
     * @param registry The `Registry` that contains the package.
     * @param manifest The version-specific package manifest for the extension.
     * @param channel The NPM dist-tag this package is tracking, or a specific version it is pinned to.
     */
    constructor(registry: Registry, manifest: Record<string, unknown>, channel = LATEST) {
        this.registry = registry;

        assertType(manifest, PackageManifest);

        this.name = manifest.name;
        this.channel = channel;
        this.displayName = manifest.displayName ?? this.name;

        this.files = manifest.files;

        this.downloads = manifest.downloads;
        this.rating = manifest.rating;
        this.repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;

        // VS Code uses case-insensitive comparison to match extension IDs.
        // Match that behavior by normalizing everything to lowercase.
        this.isPublisherValid = !!manifest.publisher;
        this.publisher = manifest.publisher ?? localize('publisher.unknown', 'Unknown');
        this.extensionId = formatExtensionId(this.publisher, this.name);

        this.description = manifest.description ?? this.name;
        this.version = parseVersion(manifest.version) ?? new SemVer('0.0.0');

        // Attempt to infer from the manifest where the extension will be
        // installed. This is overridden by the actual install location later
        // if the extension is already installed.
        this._isUiExtension = isUiExtension(this.extensionId, manifest);

        this._vsixFile = findFile(this.files, new RegExp('.+\\.vsix$'));
    }

    /**
     * Checks if the extension is installed, and updates the state to match the
     * installed version.
     */
    public async updateState(): Promise<void> {
        const extension = await this.registry.extensionInfo.getExtension(this.extensionId);
        if (extension) {
            this._isInstalled = true;
            this._installedExtensionKind = extension.extensionKind;
            this._installedVersion = extension.version;
        } else {
            this._isInstalled = false;
            this._installedExtensionKind = undefined;
            this._installedVersion = null;
        }
    }

    /**
     * A value that represents the state of the extension.
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    public get state(): PackageState {
        if (this.isPublisherValid && this.vsixFile) {
            if (this.isUpdateAvailable) {
                return PackageState.UpdateAvailable;
            }

            if (this.isInstalled) {
                if (this.channel !== LATEST) {
                    return PackageState.InstalledPrerelease;
                }

                return this.isUiExtension ? PackageState.Installed : PackageState.InstalledRemote;
            }

            return PackageState.Available;
        }

        return PackageState.Invalid;
    }

    /**
     * The NPM package specifier for the package.
     */
    public get spec(): string {
        return `${this.name}@${this.version.format()}`;
    }

    /**
     * If `state` is `PackageState.Invalid`, gets a string explaining why the
     * package is invalid.
     */
    public get errorMessage(): string {
        if (!this.isPublisherValid) {
            return localize('manifest.missing.publisher', 'Manifest is missing "publisher" field.');
        }
        if (!this._vsixFile) {
            return 'Manifest is missing "vsix" file.';
        }
        return '';
    }

    /**
     * Is the extension installed?
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    public get isInstalled(): boolean {
        return this._isInstalled;
    }

    /**
     * If `isInstalled`, the version of extension that is installed, or `null` otherwise.
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    public get installedVersion(): SemVer | null {
        return this._installedVersion;
    }

    /**
     * If `true`, this extension runs on the same machine where the UI runs.
     * If `false`, it runs where the remote extension host runs.
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    public get isUiExtension(): boolean {
        if (this._installedExtensionKind !== undefined) {
            return this._installedExtensionKind === vscode.ExtensionKind.UI;
        } else {
            return this._isUiExtension;
        }
    }

    /**
     * Gets whether this package represents a newer version of the extension
     * than the version that is installed.
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    public get isUpdateAvailable(): boolean {
        return !!this.installedVersion && gt(this.version, this.installedVersion);
    }

    /**
     * Gets the .vsix file or `null`, if the package doesn't contain a
     * suitable file.
     */
    public get vsixFile(): string | null {
        if (!this._vsixFile) {
            return null;
        }
        return this._vsixFile.toString();
    }

    public toString(): string {
        return this.displayName;
    }

    /**
     * Downloads the package and returns the locations of its package manifest,
     * readme, changelog, and .vsix file.
     */
    public async getContents(): Promise<{
        icon: vscode.Uri | null;
        vsix: vscode.Uri | null;
        readme: vscode.Uri | null;
        changelog: vscode.Uri | null;
        repository: vscode.Uri | null;
    }> {
        const vsix = findFile(this.files, new RegExp('\\.vsix$', 'i'));
        const icon = findFile(this.files, new RegExp('icon\\.png$', 'i'));
        const readme = findFile(this.files, new RegExp('readme\\.(md|txt)', 'i'));
        const changelog = findFile(this.files, new RegExp('changelog', 'i'));

        return {
            icon,
            vsix,
            readme,
            changelog,
            repository: null,
        };
    }

    /**
     * Gets the release channels available for the package.
     */
    public getChannels(): Promise<Record<string, VersionInfo>> {
        return this.registry.getPackageChannels(this.name);
    }
}

function findFile(files: string[], regexp: RegExp): vscode.Uri | null {
    const vsixFiles = files.filter((file) => regexp.test(file));
    if (vsixFiles.length !== 0) {
        return vscode.Uri.parse(vsixFiles[0]);
    }

    return null;
}

// Mirrors https://github.com/microsoft/vscode/blob/master/src/vs/workbench/services/extensions/common/extensionsUtil.ts
function isUiExtension(extensionId: string, manifest: any) {
    // All extensions are UI extensions when not using remote development.
    if (vscode.env.remoteName === undefined) {
        return true;
    }

    return getExtensionKind(extensionId, manifest).includes('ui');
}

function getExtensionKind(extensionId: string, manifest: any): string[] {
    // remote.extensionKind setting overrides manifest:
    // https://code.visualstudio.com/docs/remote/ssh#_advanced-forcing-an-extension-to-run-locally-remotely
    let result = getConfiguredExtensionKind(extensionId);
    if (typeof result !== 'undefined') {
        return toArray(result);
    }

    // Check the manifest
    result = manifest.extensionKind;
    if (typeof result !== 'undefined') {
        return toArray(result);
    }

    // Not a UI extension if it has main
    if (manifest.main) {
        return ['workspace'];
    }

    // Not a UI extension if it has dependencies or an extension pack.
    if (isNonEmptyArray(manifest.extensionDependencies) || isNonEmptyArray(manifest.extensionPack)) {
        return ['works[ace'];
    }

    if (manifest.contributes) {
        // TODO: Not a UI extension if it has no UI contributions.
        // (but vscode has no API to check what is a UI contribution.)
    }

    return ['ui', 'workspace'];
}

function getConfiguredExtensionKind(extensionId: string) {
    const config = vscode.workspace
        .getConfiguration()
        .get<Record<string, string | string[]>>('remote.extensionKind', {});

    for (const id of Object.keys(config)) {
        if (id.toLowerCase() === extensionId) {
            return config[id];
        }
    }

    return undefined;
}

function toArray(extensionKind: string | string[]): string[] {
    if (Array.isArray(extensionKind)) {
        return extensionKind;
    }

    return extensionKind === 'ui' ? ['ui', 'workspace'] : [extensionKind];
}
