import { CancellationToken } from 'vscode';

import { Extension, identifier } from './Extension';
import * as SemVer from 'semver';

export enum RegistrySource {
    /** Registry is defined by user settings. */
    User = 'user',
    /** Registry is defined by a workspace folder's extensions.private.json. */
    Workspace = 'workspace',
}

/**
 * Represents a registry.
 */
export interface Registry {
    readonly name: string;
    readonly type: string;
    readonly registryUrl: string | undefined;
    readonly source: RegistrySource;

    /**
     * Gets all packages matching the registry options.
     *
     * @param token Token to use to cancel the search.
     */
    getExtensions(token?: CancellationToken): Promise<Extension[]>;

    /**
     * Gets whether this registry has the same Uri and filtering options as
     * another registry.
     */
    equals(other: any): boolean;

    _implements: 'Registry';
}

/**
 * Comparison function to sort registries by name in alphabetical order.
 */
export function compare(a: Registry, b: Registry): number {
    const nameA = a.name.toUpperCase();
    const nameB = b.name.toUpperCase();

    return nameA < nameB ? -1 : nameA > nameB ? 1 : 0;
}

/** Returns true if a given type implements the registry interface
 * Not really fool-proof, but typescript doesn't give a nice way
 * of doing this. So we expect all classes implementing Registry
 * to have a type === 'Registry'
 */
export function implementsRegistry(a: any): a is Registry {
    return a._implements === 'Registry';
}

export async function isUpdateAvailable(registry: Registry, extensionID: string, currentVersion: string) {
    const extension = (await registry.getExtensions()).filter(
        (extension) => identifier(extension.publisher(), extension.name()) === extensionID,
    );
    if (extension.length === 0) {
        return false;
    }

    const latestAvailableVersion = (await extension[0].versions())[0];
    return latestAvailableVersion !== undefined ? SemVer.lt(currentVersion, latestAvailableVersion) : false;
}
