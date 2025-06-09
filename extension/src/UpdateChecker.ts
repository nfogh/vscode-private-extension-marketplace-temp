import * as vscode from 'vscode';
import { Disposable } from 'vscode';
import * as nls from 'vscode-nls/node';

import { Extension, identifier } from './Extension';
import { ExtensionInfoService } from './extensionInfo';
import { updateExtensions } from './install';
import { getLogger } from './logger';
import { RegistryProvider } from './RegistryProvider';
import { getConfig } from './util';

import * as SemVer from 'semver';
import { install } from 'source-map-support';

const localize = nls.loadMessageBundle();

const INIT_DELAY_S = 5;
const DEFAULT_INTERVAL_S = 3600;
const DEFAULT_AUTO_UPDATE = false;

export class UpdateChecker implements Disposable {
    private disposable: Disposable;
    private initTimeout?: NodeJS.Timeout;
    private checkInterval?: NodeJS.Timeout;

    private intervalMS: number;
    private autoUpdate: boolean;

    private get isAutomaticUpdateEnabled() {
        return this.intervalMS > 0;
    }

    public constructor(
        private readonly registryProvider: RegistryProvider,
        private readonly extensionInfo: ExtensionInfoService,
    ) {
        this.intervalMS = getUpdateIntervalMS();
        this.autoUpdate = getAutoUpdate();

        this.disposable = Disposable.from(
            vscode.workspace.onDidChangeConfiguration(this.onDidChangeConfiguration, this),
        );

        if (this.isAutomaticUpdateEnabled) {
            this.initTimeout = global.setTimeout(async () => {
                this.initTimeout = undefined;
                await this.checkForUpdates(true);
                this.setAutomaticCheckInterval();
            }, INIT_DELAY_S * 1000);
        }
    }

    public dispose(): void {
        this.disposable.dispose();

        if (this.initTimeout) {
            global.clearTimeout(this.initTimeout);
            this.initTimeout = undefined;
        }

        if (this.checkInterval) {
            global.clearInterval(this.checkInterval);
            this.checkInterval = undefined;
        }
    }

    /**
     * Checks for any out-of-date extensions and prompts the user to update them
     * if any are found.
     * @param isAutomaticCheck `true` if this is an automatic check and it
     *      should run silently in the background unless an update is available.
     */
    public async checkForUpdates(isAutomaticCheck = false): Promise<void> {
        const updates = await this.getExtensionsWithUpdates();

        if (updates.length > 0) {
            if (this.autoUpdate) {
                await updateExtensions(this.extensionInfo, updates);
            } else {
                await this.showUpdatePrompt(updates);
            }
        } else if (!isAutomaticCheck) {
            await this.showNoUpdatesMessage();
        }
    }

    /**
     * Checks for any out-of-date extensions and updates them if any are found.
     */
    public async updateAll(): Promise<void> {
        const updates = await this.getExtensionsWithUpdates();

        if (updates.length > 0) {
            await updateExtensions(this.extensionInfo, updates);
        } else {
            await this.showNoUpdatesMessage();
        }
    }

    private setAutomaticCheckInterval() {
        if (this.checkInterval) {
            global.clearInterval(this.checkInterval);
        }

        if (this.isAutomaticUpdateEnabled) {
            this.checkInterval = global.setInterval(async () => {
                getLogger().log(localize('start.update.check', 'Starting automatic update check'));
                await this.checkForUpdates(true);
            }, this.intervalMS);
        }
    }

    private onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
        if (e.affectsConfiguration('privateExtensions.updateCheckInterval')) {
            this.intervalMS = getUpdateIntervalMS();
            this.setAutomaticCheckInterval();
        }
    }

    private async getExtensionsWithUpdates(): Promise<Extension[]> {
        const extensions = await this.registryProvider.getUniqueExtensions();

        const extensionToIdVersionMap: (ext: Extension) => Promise<[string, string]> = async (extension) => [
            identifier(extension.publisher(), extension.name()),
            (await extension.versions())[0],
        ];
        const latestAvailableExtensions = new Map<string, string>(
            await Promise.all(extensions.map(extensionToIdVersionMap)),
        );

        const updatableExtensions = extensions.filter((extension) => {
            const installedExtension = vscode.extensions.getExtension(
                identifier(extension.publisher(), extension.name()),
            );
            return (
                installedExtension !== undefined &&
                SemVer.lt(
                    installedExtension.packageJSON.version,
                    latestAvailableExtensions.get(installedExtension.id) ?? '',
                )
            );
        });

        return updatableExtensions;
    }

    private async showNoUpdatesMessage() {
        await vscode.window.showInformationMessage(
            localize('all.extensions.up.to.date', 'All private extensions are up to date.'),
        );
    }

    private async showUpdatePrompt(updates: Extension[]) {
        const showUpdates = localize('show.updates', 'Show Updates');
        const updateAll = localize('update.all.extensions', 'Update All Extensions');

        const response = await vscode.window.showInformationMessage(
            localize('update.is.available', 'A private extension update is available.'),
            showUpdates,
            updateAll,
        );

        if (response === showUpdates) {
            await vscode.commands.executeCommand('privateExtensions.extensions.focus');
        } else if (response === updateAll) {
            await updateExtensions(this.extensionInfo, updates);
        }
    }
}

function getUpdateIntervalMS() {
    const config = getConfig();
    const interval = config.get<number>('updateCheckInterval', DEFAULT_INTERVAL_S);

    return interval * 1000;
}

function getAutoUpdate() {
    const config = getConfig();
    const autoUpdate = config.get<boolean>('autoUpdate', DEFAULT_AUTO_UPDATE);

    return autoUpdate;
}
