import * as vscode from 'vscode';
import { Disposable, WebviewView, WebviewViewProvider, WebviewViewResolveContext } from 'vscode';

import { getLogger } from '../logger';
import { Package, PackageState } from '../Package';
import * as registry from '../Registry';
import { RegistryProvider } from '../RegistryProvider';
import { getExtensionFileUri } from '../util';

export interface ExtensionEntry {
    extensionId: string;
    displayName: string;
    description: string;
    publisher: string;
    version: string;
    state: PackageState;
    iconUri: string | null;
    registryName: string;
}

interface WebviewMessage {
    type: 'showExtension' | 'install' | 'update' | 'uninstall';
    extensionId: string;
}

function asWebviewUri(view: WebviewView, relativePath: string): vscode.Uri {
    return view.webview.asWebviewUri(getExtensionFileUri(relativePath));
}

/**
 * Base class for webview sidebar panels that display a list of extensions.
 * Subclasses implement `loadPackages()` to control which packages are shown.
 */
export abstract class ExtensionsListWebviewProvider implements WebviewViewProvider, Disposable {
    protected view?: WebviewView;
    private disposables: Disposable[] = [];
    protected packages: Package[] = [];

    constructor(
        protected readonly registryProvider: RegistryProvider,
        private readonly onShowExtension: (pkg: Package) => void,
    ) {
        this.disposables.push(
            this.registryProvider.onDidChangeRegistries(() => this.refresh()),
            vscode.extensions.onDidChange(() => this.refresh()),
        );
    }

    public dispose(): void {
        this.disposables.forEach((d) => d.dispose());
        this.disposables = [];
    }

    public resolveWebviewView(
        webviewView: WebviewView,
        _context: WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [getExtensionFileUri('dist'), getExtensionFileUri('media')],
        };

        webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
            this.handleMessage(message);
        });

        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                void this.refresh();
            }
        });

        void this.refresh();
    }

    public async refresh(): Promise<void> {
        if (!this.view) {
            return;
        }

        try {
            this.packages = await this.loadPackages();
        } catch (err) {
            getLogger().log(`Failed to load packages for sidebar: ${err}`);
            this.packages = [];
        }

        this.view.webview.html = this.getHtml();
        this.updateBadge();
    }

    /** Returns the packages to display. Implemented by each subclass. */
    protected abstract loadPackages(): Promise<Package[]>;

    private updateBadge(): void {
        if (!this.view) {
            return;
        }
        const updatesCount = this.packages.filter((p) => p.isUpdateAvailable).length;
        this.view.badge = {
            value: updatesCount,
            tooltip: updatesCount > 0 ? 'Updates available' : 'No updates available',
        };
    }

    private handleMessage(message: WebviewMessage): void {
        const pkg = this.packages.find((p) => p.extensionId === message.extensionId);
        if (!pkg) {
            return;
        }

        switch (message.type) {
            case 'showExtension':
                this.onShowExtension(pkg);
                break;
            case 'install':
                void vscode.commands.executeCommand('privateExtensions.extension.install', pkg.extensionId);
                break;
            case 'update':
                void vscode.commands.executeCommand('privateExtensions.extension.update', pkg.extensionId);
                break;
            case 'uninstall':
                void vscode.commands.executeCommand('privateExtensions.extension.uninstall', pkg.extensionId);
                break;
        }
    }

    private getEntries(): ExtensionEntry[] {
        return this.packages.map((pkg) => ({
            extensionId: pkg.extensionId,
            displayName: pkg.displayName,
            description: pkg.description,
            publisher: pkg.publisher,
            version: pkg.version.format(),
            state: pkg.state,
            iconUri: pkg.iconUrl ?? null,
            registryName: pkg.registry.name,
        }));
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private getHtml(): string {
        if (!this.view) {
            return '';
        }

        const nonce = this.getNonce();
        const cspSource = this.view.webview.cspSource;

        const scriptUri = asWebviewUri(this.view, 'dist/assets/extensions-list/index.js');
        const workbenchCssUri = asWebviewUri(this.view, 'media/workbench.css');
        const extensionCssUri = asWebviewUri(this.view, 'media/extension.css');
        const sidebarCssUri = asWebviewUri(this.view, 'media/extensions-list.css');
        const defaultIconUri = asWebviewUri(this.view, 'media/defaultIcon.png');

        const entries = this.getEntries();
        const entriesJson = JSON.stringify(entries);

        const policy = [
            `default-src 'none';`,
            `font-src ${cspSource};`,
            `img-src ${cspSource} https: data:;`,
            `script-src 'nonce-${nonce}';`,
            `style-src ${cspSource} 'unsafe-inline';`,
        ].join('');

        return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${policy}">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="stylesheet" href="${workbenchCssUri}">
    <link rel="stylesheet" href="${extensionCssUri}">
    <link rel="stylesheet" href="${sidebarCssUri}">
</head>
<body>
    <div id="root"></div>
    <script nonce="${nonce}">
        window.__EXTENSIONS__ = ${entriesJson};
        window.__DEFAULT_ICON__ = "${defaultIconUri}";
    </script>
    <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
    }
}

/**
 * Sidebar panel listing all extensions available across all configured registries.
 */
export class ExtensionsWebviewProvider extends ExtensionsListWebviewProvider {
    public static readonly viewId = 'privateExtensions.extensions';

    protected async loadPackages(): Promise<Package[]> {
        const registries = this.registryProvider.getRegistries();
        registries.sort(registry.compare);

        const allPackages: Package[] = [];
        for (const reg of registries) {
            try {
                const pkgs = await reg.getPackages();
                pkgs.sort(Package.compare);
                allPackages.push(...pkgs);
            } catch (err) {
                getLogger().log(`Unable to get extensions from ${reg.name} (${reg.uri}): ${err}`);
            }
        }
        return allPackages;
    }
}

/**
 * Sidebar panel listing only the extensions recommended by the current workspace.
 */
export class RecommendedWebviewProvider extends ExtensionsListWebviewProvider {
    public static readonly viewId = 'privateExtensions.recommended';

    protected async loadPackages(): Promise<Package[]> {
        const recommendedIds = this.registryProvider.getRecommendedExtensions();
        const allPackages = await this.registryProvider.getUniquePackages();
        return allPackages.filter((pkg) => recommendedIds.has(pkg.extensionId));
    }
}
