export interface ExtensionVersion {
    /** The version of the extension. */
    version(): string;

    /** The name to display for the extension in the UI. */
    displayName(): Promise<string | undefined>;

    /** A short description for the extension. */
    description(): Promise<string | undefined>;

    /** The number of downloads of the extension */
    downloads(): Promise<number | undefined>;

    /** The rating of the extension */
    rating(): Promise<number | undefined>;

    /** The URL for the extension source repository */
    repository(): Promise<string | undefined>;

    /** The readme of the extension */
    readme(): Promise<string | undefined>;

    /** The changelog of the extension */
    changelog(): Promise<string | undefined>;

    /** Returns the URI to the icon, or undefined if no icon is defined */
    icon(): Promise<string | undefined>;

    /** Returns the local file path to the vsix file of the extension */
    vsix(): Promise<string>;

    _implements: 'ExtensionVersion';
}

/**
 * Represents a package for an extension.
 */
export interface Extension {
    /** The package name. */
    name(): string;

    /** The name of the package's publisher */
    publisher(): string;

    /** Get the available versions. */
    versions(): Promise<string[]>;

    /** Get a specific version or undefined if the version is not found.
     * version is either a semver, or the string 'latest' to get the most
     * recent version.
     */
    getVersion(version: string): Promise<ExtensionVersion | undefined>;

    _implements: 'Extension';
}

/** The ID of the extension in the form `publisher.name`. */
export function identifier(publisher: string, name: string): string {
    return `${publisher}.${name}`.toLowerCase();
}

export function implementsExtension(a: any): a is Extension {
    return a._implements === 'Extension';
}

export function implementsExtensionVersion(a: any): a is ExtensionVersion {
    return a._implements === 'Extension';
}
