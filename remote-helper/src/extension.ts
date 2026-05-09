import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            '_privateExtensionMarketplace.remoteHelper.getExtension',
            (extensionId: string) => {
                const extension = vscode.extensions.getExtension(extensionId);
                if (extension) {
                    return {
                        id: extension.id,
                        extensionKind: extension.extensionKind,
                        packageJSON: extension.packageJSON,
                    };
                } else {
                    return undefined;
                }
            },
        ),
        vscode.commands.registerCommand('_privateExtensionMarketplace.remoteHelper.getPlatform', () => {
            return process.platform;
        }),
        vscode.commands.registerCommand('_privateExtensionMarketplace.remoteHelper.getRegistries', () => {
            return vscode.workspace.getConfiguration('privateExtensions').get<unknown[]>('registries', []);
        }),
        vscode.extensions.onDidChange(() => {
            vscode.commands.executeCommand('_privateExtensionMarketplace.notifyExtensionsChanged');
        }),
        vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('privateExtensions.registries')) {
                vscode.commands.executeCommand('_privateExtensionMarketplace.notifyRegistriesChanged');
            }
        }),
    );
}

export function deactivate(): void {
    // Nothing to do.
}
