import * as t from 'io-ts';
import * as vscode from 'vscode';
import { localize } from 'vscode-nls';

import { getLogger } from './logger';
import { decodeType } from './typeUtil';
import { UserRegistry } from './UserRegistryTypes';
import { getConfig } from './util';

export function getUserRegistryConfig(): UserRegistry[] {
    const userRegistries = decodeType(getConfig().get<any>('registries', []), t.array(UserRegistry));

    if (!userRegistries) {
        getLogger().log(`Invalid registry configuration in user settings`);
    }
    return userRegistries ?? [];
}

/**
 * Gets the registry configuration from the remote helper (UI-side) when
 * running in a remote workspace. Returns an empty array if not in a remote
 * workspace or if the helper is unavailable.
 */
export async function getRemoteHelperRegistryConfig(): Promise<UserRegistry[]> {
    if (!vscode.env.remoteName) {
        return [];
    }

    try {
        const raw = await vscode.commands.executeCommand<unknown[]>(
            '_privateExtensionMarketplace.remoteHelper.getRegistries',
        );

        const registries = decodeType(raw ?? [], t.array(UserRegistry));
        if (!registries) {
            getLogger().log(`Invalid registry configuration from remote helper`);
            return [];
        }
        return registries;
    } catch (ex) {
        getLogger().log(`Failed to get registries from remote helper: ${ex}`);
        return [];
    }
}

export function setUserRegistryConfig(registries: readonly UserRegistry[]) {
    void getConfig().update(
        'registries',
        registries.length !== 0 ? registries : undefined,
        vscode.ConfigurationTarget.Global,
    );
}

export function addUserRegistry(name: string, type: 'npm' | 'vsx' | 'file' | undefined, registry: string): void {
    const userRegistries = getUserRegistryConfig();

    if (userRegistries.some((other) => name === other.name)) {
        throw new Error(localize('registry.exists', 'A registry named "{0}" already exists', name));
    }

    userRegistries.push({
        name,
        type,
        registry,
    });

    setUserRegistryConfig(userRegistries);
}

export function removeUserRegistry(name: string): void {
    const userRegistries = getUserRegistryConfig();
    const newRegistries = userRegistries.filter((registry) => registry.name !== name);

    if (newRegistries.length === userRegistries.length) {
        throw new Error(localize('registry.does.not.exist', 'No registry named "{0}" exists.', name));
    }

    setUserRegistryConfig(newRegistries);
}
