import { isWebUri } from 'valid-url';
import * as vscode from 'vscode';
import * as nls from 'vscode-nls/node';

import { Registry } from '../Registry';
import * as UserRegistry from '../UserRegistry';

const localize = nls.loadMessageBundle();

export async function AddUserRegistryCommand(): Promise<void> {
    const registry = await vscode.window.showInputBox({
        prompt: localize('registry.url.prompt', 'Enter the URL of the NPM registry.'),
        placeHolder: localize('registry.url.placeholder', 'https://my-private.registry'),
        validateInput: (value) => (isWebUri(value) ? null : localize('must.be.url', 'Value must be a valid URL.')),
        ignoreFocusOut: true,
    });

    if (!registry) {
        return;
    }

    const name = await vscode.window.showInputBox({
        prompt: localize('registry.name.prompt', 'Enter a name for the registry: {0}.', registry),
        placeHolder: localize('registry.name.placeholder', 'Registry name'),
        ignoreFocusOut: true,
    });

    if (!name) {
        return;
    }

    UserRegistry.addUserRegistry(name, registry);

    const openSettingsJson = localize('open.settings.json', 'Open settings.json');
    const settingsJsonLink = `[${openSettingsJson}](command:workbench.action.openSettingsJson)`;

    await vscode.window.showInformationMessage(
        localize(
            'registry.added',
            'Registry "{0}" added. {1} and edit "privateExtensions.registries" to configure authentication or other settings.',
            name,
            settingsJsonLink,
        ),
    );
}

async function showUserRegistryPrompt() {
    const registries = UserRegistry.getUserRegistryConfig();

    if (registries.length === 0) {
        void vscode.window.showInformationMessage(localize('no.user.registries', 'There are no user registries.'));
        return undefined;
    }

    const items = registries.map(
        (registry) =>
            ({
                label: registry.name,
                description: registry.registry ?? '',
            } as vscode.QuickPickItem),
    );

    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: localize('select.registry.to.remove', 'Select a registry to remove.'),
        matchOnDescription: true,
    });

    if (selected) {
        return registries.find((registry) => registry.name === selected.label);
    } else {
        return undefined;
    }
}

export async function RemoveUserRegistryCommand(registry?: Registry): Promise<void> {
    const registryName = registry?.name ?? (await showUserRegistryPrompt())?.name;

    if (registryName) {
        UserRegistry.removeUserRegistry(registryName);
        await vscode.window.showInformationMessage(
            localize('registry.removed', 'Registry "{0}" removed.', registryName),
        );
    }
}
