import { SemVer } from 'semver';
import * as vscode from 'vscode';

import { Registry, VersionInfo } from './Registry';

export enum PackageState {
    /** The extension is available to be installed. */
    Available = 'available',
    /** The latest version of the extension is already installed in the local machine. */
    Installed = 'installed',
    /** The latest version of the extension is already installed in the remote machine. */
    InstalledRemote = 'installed.remote',
    /** The latest version of the extension is installed from a pre-release channel. */
    InstalledPrerelease = 'installed.prerelease',
    /** The extension is installed and a newer version is available. */
    UpdateAvailable = 'update',
    /** The package is not a valid extension. */
    Invalid = 'invalid',
}

/**
 * Represents an NPM package for an extension.
 */
export interface Package {
    type: 'Package';
    /**
     * Comparison function to sort packages by name in alphabetical order.
     */
    compare(other: any): number;

    /** The package name. */
    readonly name: string;
    /** The name of the package's publisher */
    readonly publisher: string;
    /** The ID of the extension in the form `publisher.name`. */
    readonly extensionId: string;
    /** The name to display for the package in the UI. */
    readonly displayName: string;
    /** A short description for the package. */
    readonly description: string;
    /** The package version. */
    readonly version: SemVer;
    /** The registry containing the extension. */
    readonly registry: Registry;
    /* The channel that this package is tracking */
    readonly channel: string;

    readonly downloads?: number;
    readonly rating?: number;
    readonly repository?: string;

    /**
     * Checks if the extension is installed, and updates the state to match the
     * installed version.
     */
    updateState(): Promise<void>;

    /**
     * A value that represents the state of the extension.
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    get state(): PackageState;

    /**
     * The NPM package specifier for the package.
     */
    get spec(): string;

    /**
     * If `state` is `PackageState.Invalid`, gets a string explaining why the
     * package is invalid.
     */
    get errorMessage(): string;

    /**
     * Is the extension installed?
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    get isInstalled(): boolean;

    /**
     * If `isInstalled`, the version of extension that is installed, or `null` otherwise.
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    get installedVersion(): SemVer | null;

    /**
     * If `true`, this extension runs on the same machine where the UI runs.
     * If `false`, it runs where the remote extension host runs.
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    get isUiExtension(): boolean;

    /**
     * Gets whether this package represents a newer version of the extension
     * than the version that is installed.
     *
     * Call `updateState()` first to ensure this is up-to-date.
     */
    get isUpdateAvailable(): boolean;

    /**
     * Gets the .vsix file or `null`, if the package doesn't contain a
     * suitable file.
     */
    get vsixFile(): string | null;

    toString(): string;

    /**
     * Downloads the package and returns the locations of its package manifest,
     * readme, changelog, and .vsix file.
     */
    getContents(): Promise<{
        icon: vscode.Uri | null;
        vsix: vscode.Uri | null;
        readme: vscode.Uri | null;
        changelog: vscode.Uri | null;
        repository: vscode.Uri | null;
    }>;

    /**
     * Gets the release channels available for the package.
     */
    getChannels(): Promise<Record<string, VersionInfo>>;
}

export function implementsPackage(a: any): a is Package {
    return a.type === 'Package';
}
