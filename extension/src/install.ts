import * as vscode from 'vscode';
import * as nls from 'vscode-nls/node';

import { implementsExtension, Extension, identifier } from './Extension';
import { ExtensionInfoService } from './extensionInfo';
import { findPackage } from './findPackage';
import { Registry } from './Registry';
import { RegistryProvider } from './RegistryProvider';

const localize = nls.loadMessageBundle();

/**
 * Installs the given extension package.
 * @returns the installed package.
 */
export async function installExtension(pkg: Extension): Promise<Extension>;
/**
 * Installs the extension with the given ID, searching one or more registries
 * @param registry The registry containing the extension package, or a registry provider to search
 * @param extensionId The ID of the extension to install.
 * @param version Version or dist-tag such as "1.0.0" to find a specific version of the extension.
 *              If omitted, returns the latest version for the user's selected release channel.
 * @returns the installed package.
 */
export async function installExtension(
    registry: Registry | RegistryProvider,
    extensionId: string,
    version?: string,
): Promise<Extension>;
export async function installExtension(
    extOrRegistry: Extension | Registry | RegistryProvider,
    extensionId?: string,
    version?: string,
): Promise<Extension> {
    if (implementsExtension(extOrRegistry)) {
        await installExtensionByPackage(extOrRegistry);
        return extOrRegistry;
    } else {
        const registry = extOrRegistry;

        if (extensionId === undefined) {
            throw new TypeError('extensionId must be defined');
        }

        return await installExtensionById(registry, extensionId, version);
    }
}

/**
 * Uninstalls the given extension.
 * @param extOrExtId The package or extension ID of the extension to uninstall.
 * @returns the ID of the uninstalled extension.
 */
export async function uninstallExtension(extOrExtId: Extension | string): Promise<string> {
    const extensionId = implementsExtension(extOrExtId)
        ? identifier(extOrExtId.publisher(), extOrExtId.name())
        : extOrExtId;
    await vscode.commands.executeCommand('workbench.extensions.uninstallExtension', extensionId);

    return extensionId;
}

/**
 * Updates all the given extensions to their latest versions and prompts the
 * user to reload the window if necessary.
 * @param packages The packages to update.
 */
export async function updateExtensions(extensionInfo: ExtensionInfoService, packages: Extension[]): Promise<void> {
    const increment = 100 / packages.length;

    await vscode.window.withProgress(
        {
            cancellable: true,
            location: vscode.ProgressLocation.Notification,
            title: localize('updating.extensions', 'Updating extensions...'),
        },
        async (progress, token) => {
            for (const pkg of packages) {
                if (token.isCancellationRequested) {
                    break;
                }

                await extensionInfo.waitForExtensionChange(installExtension(pkg));

                progress.report({ increment });
            }
        },
    );

    // Array.prototype.every() does not support Promises
    // Build an array of promise and use it as provided function for every()

    const promiseArray = packages.map((pkg) => extensionInfo.didExtensionUpdate(pkg));

    if (packages.every((value, index) => promiseArray[index])) {
        await showReloadPrompt(
            localize(
                'reload.to.complete.update.all',
                'Please reload Visual Studio Code to complete updating the extensions.',
            ),
        );
    }
}

/**
 * Displays a message with a button to reload vscode.
 * @param message The message to display.
 */
export async function showReloadPrompt(message: string): Promise<void> {
    const reload = await vscode.window.showInformationMessage(message, localize('reload.now', 'Reload Now'));
    if (reload) {
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
}

/**
 * Installs the given extension package.
 */
async function installExtensionByPackage(extension: Extension) {
    const extensionVersion = await extension.getVersion('latest');
    if (extensionVersion === undefined) {
        throw new Error(
            `Cannot find latest extension version for ${identifier(extension.publisher(), extension.name())}`,
        );
    }
    const vsix = await extensionVersion.vsix();

    await vscode.commands.executeCommand('workbench.extensions.installExtension', vsix);
}

/**
 * Installs the extension with the given ID, searching one or more registries
 * @param registry The registry containing the extension package, or a registry provider to search
 * @param extensionId The ID of the extension to install.
 * @param version Version or dist-tag such as "1.0.0" to find a specific version of the extension.
 *              If omitted, returns the latest version for the user's selected release channel.
 */
async function installExtensionById(registry: Registry | RegistryProvider, extensionId: string, version?: string) {
    const pkg = await findPackage(registry, extensionId, version);

    await installExtensionByPackage(pkg);

    return pkg;
}
