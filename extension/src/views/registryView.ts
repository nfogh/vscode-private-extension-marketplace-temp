import * as vscode from 'vscode';
import { Disposable } from 'vscode';

import { ExtensionInfoService } from '../extensionInfo';
import { Package } from '../Package';
import { RegistryProvider } from '../RegistryProvider';

import { ExtensionDetailsView } from './extensionDetailsView';
import { ExtensionsWebviewProvider, RecommendedWebviewProvider } from './extensionsWebviewProvider';

/**
 * Top-level controller for the Private Extensions panel.
 */
export class RegistryView implements Disposable {
    private disposable: Disposable;
    private extensionsWebviewProvider: ExtensionsWebviewProvider;
    private recommendedWebviewProvider: RecommendedWebviewProvider;
    private extensionView: ExtensionDetailsView;

    constructor(
        protected readonly registryProvider: RegistryProvider,
        private readonly extensionInfo: ExtensionInfoService,
    ) {
        this.extensionView = new ExtensionDetailsView(this.extensionInfo);

        const showExtension = (pkg: Package) => void this.showExtension(pkg);

        this.extensionsWebviewProvider = new ExtensionsWebviewProvider(registryProvider, showExtension);
        this.recommendedWebviewProvider = new RecommendedWebviewProvider(registryProvider, showExtension);

        this.disposable = Disposable.from(
            vscode.window.registerWebviewViewProvider(
                ExtensionsWebviewProvider.viewId,
                this.extensionsWebviewProvider,
                { webviewOptions: { retainContextWhenHidden: true } },
            ),
            vscode.window.registerWebviewViewProvider(
                RecommendedWebviewProvider.viewId,
                this.recommendedWebviewProvider,
                { webviewOptions: { retainContextWhenHidden: true } },
            ),
            this.extensionsWebviewProvider,
            this.recommendedWebviewProvider,
            this.extensionView,
        );

        setImmediate(() => this.refresh());
    }

    public dispose(): void {
        this.disposable.dispose();
    }

    /**
     * Reloads both webviews and the extension details view if it is open.
     */
    public async refresh(): Promise<void> {
        await this.registryProvider.refresh();

        if (this.extensionView.visible) {
            await this.extensionView.refresh();
        }
    }

    public async showExtension(pkg: Package): Promise<void> {
        await this.extensionView.show(pkg);
    }
}
