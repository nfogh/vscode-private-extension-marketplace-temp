import * as fs from 'fs';
import * as t from 'io-ts';
import * as path from 'path';
import * as vscode from 'vscode';
import { Disposable, EventEmitter } from 'vscode';
import * as nls from 'vscode-nls/node';

import { Extension, identifier } from './Extension';
import { ExtensionInfoService } from './extensionInfo';
import { FileRegistry } from './FileRegistry';
import { getLogger } from './logger';
import { NpmRegistry } from './NpmRegistry';
import { Registry, RegistrySource } from './Registry';
import { decodeType } from './typeUtil';
import { getUserRegistryConfig } from './UserRegistry';
import { UserRegistry } from './UserRegistryTypes';
import { readJSON } from './util';
import { VsxRegistry } from './VsxRegistry';

const localize = nls.loadMessageBundle();

const ExtensionsConfig = t.partial({
    registries: t.array(UserRegistry),
    recommendations: t.array(t.string),
});
type ExtensionsConfig = t.TypeOf<typeof ExtensionsConfig>;

/**
 * Provides registries collected from user and workspace configuration.
 */
export class RegistryProvider implements Disposable {
    private readonly _onDidChangeRegistries = new EventEmitter<void>();

    /**
     * An event that is emitted when the registry configuration changes.
     */
    public readonly onDidChangeRegistries = this._onDidChangeRegistries.event;

    private readonly disposable: Disposable;
    private readonly folders: FolderRegistryProvider[] = [];
    private userRegistries: Registry[] = [];

    public static async create(extensionInfo: ExtensionInfoService): Promise<RegistryProvider> {
        const registryProvider = new RegistryProvider(extensionInfo);
        await registryProvider.refresh();
        return registryProvider;
    }

    private constructor(private readonly extensionInfo: ExtensionInfoService) {
        this.disposable = Disposable.from(
            vscode.workspace.onDidChangeWorkspaceFolders(async (e) => await this.onDidChangeWorkspaceFolders(e)),
            vscode.workspace.onDidChangeConfiguration(async (e) => await this.onDidChangeConfiguration(e)),
        );

        if (vscode.workspace.workspaceFolders) {
            for (const folder of vscode.workspace.workspaceFolders) {
                this.addFolder(folder);
            }
        }
    }

    public dispose(): void {
        this.disposable.dispose();
        this.folders.forEach((f) => f.dispose());
    }

    /**
     * Clears all cached information so that the next call to `getRegistries()`
     * will return a fresh list of registries and calling `getPackages()` on
     * each registry will return a fresh list of packages.
     *
     * This also fires the `onDidChangeRegistries` event.
     */
    public async refresh(): Promise<void> {
        this.userRegistries = await this.updateUserRegistries();

        await Promise.all(this.folders.map((folder) => folder.refresh()));

        this._onDidChangeRegistries.fire();
    }

    /**
     * Gets a list of registries for the current workspace.
     *
     * This includes registries defined in user settings.
     */
    public getRegistries(): Registry[] {
        const registries: Registry[] = [];

        // dedupeRegistries() keeps the first item for each duplicate registry.
        // Add workspace registries first so they override duplicate items in
        // the user configuration.
        try {
            for (const folder of this.folders) {
                registries.push(...folder.getRegistries());
            }
        } catch (e: any) {
            if (!(e instanceof TypeError)) {
                throw e;
            }
            getLogger().log(e.message);
        }

        try {
            registries.push(...this.getUserRegistries());
        } catch (e: any) {
            if (!(e instanceof TypeError)) {
                throw e;
            }
            getLogger().log(e.message);
        }

        return dedupeRegistries(registries);
    }

    /**
     * Gets the list of registries defined in user settings.
     */
    public getUserRegistries(): readonly Registry[] {
        return this.userRegistries;
    }

    /**
     * Gets a list of extension IDs for extensions recommended for users of the
     * current workspace.
     */
    public getRecommendedExtensions(): Set<string> {
        const extensions = new Set<string>();

        for (const folder of this.folders) {
            for (const name of folder.getRecommendedExtensions()) {
                extensions.add(name);
            }
        }

        return extensions;
    }

    /**
     * Gets all packages with unique extension IDs from all registries
     * for the current workspace.
     */
    public async getUniqueExtensions(): Promise<Extension[]> {
        const results = new Map<string, Extension>();

        for (const registry of this.getRegistries()) {
            try {
                for (const extension of await registry.getExtensions()) {
                    results.set(identifier(extension.publisher(), extension.name()), extension);
                }
            } catch (error) {
                getLogger().log(`Unable to get extensions from ${registry.name} (${registry.registryUrl}) ${error}`);
            }
        }

        return [...results.values()];
    }

    async updateUserRegistries(): Promise<Registry[]> {
        return await Promise.all(
            getUserRegistryConfig().map((registryConfig) =>
                createRegistry(registryConfig, this.extensionInfo, RegistrySource.User),
            ),
        );
    }

    private async onDidChangeConfiguration(e: vscode.ConfigurationChangeEvent) {
        if (
            e.affectsConfiguration('privateExtensions.registries') ||
            e.affectsConfiguration('privateExtensions.channels')
        ) {
            this.userRegistries = await this.updateUserRegistries();
            this._onDidChangeRegistries.fire();
        }
    }

    private onDidChangeWorkspaceFolders(e: vscode.WorkspaceFoldersChangeEvent) {
        e.removed.map((folder) => this.removeFolder(folder));
        e.added.map((folder) => this.addFolder(folder));
        this._onDidChangeRegistries.fire();
    }

    private addFolder(folder: vscode.WorkspaceFolder) {
        const idx = this.folders.findIndex((value) => value.folder === folder);
        if (idx >= 0) {
            getLogger().log(
                localize('error.already.have.folder', 'Error: Already have folder "{0}"', folder.uri.toString()),
            );
        } else {
            const provider = new FolderRegistryProvider(folder, this.extensionInfo);
            this.folders.push(provider);

            provider.onDidChangeRegistries(() => this._onDidChangeRegistries.fire());
        }
    }

    private removeFolder(folder: vscode.WorkspaceFolder) {
        const idx = this.folders.findIndex((value) => value.folder === folder);
        if (idx >= 0) {
            const removed = this.folders.splice(idx, 1);
            removed.forEach((f) => f.dispose());
        }
    }
}

/**
 * Provides NPM registries for one workspace folder.
 */
class FolderRegistryProvider implements Disposable {
    private readonly _onDidChangeRegistries = new EventEmitter<void>();

    /**
     * An event that is emitted when the registry configuration changes.
     */
    public readonly onDidChangeRegistries = this._onDidChangeRegistries.event;

    private static readonly ConfigGlobPattern = 'extensions.private.json';

    private readonly configFolder: string;
    private configFile: vscode.Uri | null;
    private readonly disposable: Disposable;
    private readonly configFileWatcher: vscode.FileSystemWatcher;
    private registries: Registry[] = [];
    private recommendedExtensions: string[] = [];

    constructor(public readonly folder: vscode.WorkspaceFolder, private readonly extensionInfo: ExtensionInfoService) {
        this.configFolder = path.join(folder.uri.fsPath, '.vscode');

        const configFilePath = path.join(this.configFolder, FolderRegistryProvider.ConfigGlobPattern);
        this.configFileWatcher = vscode.workspace.createFileSystemWatcher(configFilePath);

        if (fs.existsSync(configFilePath)) {
            this.configFile = vscode.Uri.file(configFilePath);
        } else {
            this.configFile = null;
        }

        this.configFileWatcher.onDidCreate(async (uri) => {
            this.configFile = uri;
            await this.handleConfigChange();
        });

        this.configFileWatcher.onDidDelete(async () => {
            this.configFile = null;
            await this.handleConfigChange();
        });

        this.configFileWatcher.onDidChange(async () => {
            await this.handleConfigChange();
        });

        this.disposable = Disposable.from(this.configFileWatcher);
    }

    public dispose() {
        this.disposable.dispose();
    }

    /**
     * Clears all cached information so that the next call to `getRegistries()`
     * returns a fresh list of registries.
     */
    public async refresh() {
        await this.updateRegistries();
    }

    public getRegistries() {
        return this.registries;
    }

    public getRecommendedExtensions() {
        return this.recommendedExtensions;
    }

    private async handleConfigChange() {
        await this.updateRegistries();
        this._onDidChangeRegistries.fire();
    }

    private async updateRegistries() {
        if (this.configFile) {
            const [registries, recommendations] = await readConfigFile(this.configFile, this.extensionInfo);
            this.registries = registries;
            this.recommendedExtensions = recommendations;
        } else {
            this.registries = [];
            this.recommendedExtensions = [];
        }
    }
}

async function createRegistry(
    registryConfig: any,
    extensionInfo: ExtensionInfoService,
    registrySource: RegistrySource,
): Promise<Registry> {
    const { name, type, ...options } = registryConfig;

    if (type) {
        if (type === 'vsx') {
            return new VsxRegistry(name, options.registry ?? 'https://open-vsx.org', options);
        } else if (type === 'file' && options.registry !== undefined) {
            return new FileRegistry(extensionInfo, name, options.registry, options.query ?? '*');
        } else {
            return new NpmRegistry(extensionInfo, name, registrySource, options);
        }
    } else {
        // Autodetect registry type
        if (options.registry) {
            if (await NpmRegistry.isRegistry(options.registry)) {
                return new NpmRegistry(extensionInfo, name, registrySource, options);
            } else if (await VsxRegistry.isRegistry(options.registry)) {
                return new VsxRegistry(name, options.registry ?? 'https://open-vsx.org', options);
            } else if ((await FileRegistry.isRegistry(options.registry)) && options.registry) {
                return new FileRegistry(extensionInfo, name, options.registry, options.query ?? '*');
            } else {
                const errorMessage = `Unable to auto-detect registry type for ${options.registry}`;
                getLogger().log(errorMessage);
                // Default to NpmRegistry
                return new NpmRegistry(extensionInfo, name, registrySource, options);
            }
        } else {
            return new NpmRegistry(extensionInfo, name, registrySource, options);
        }
    }
}

async function readConfigFile(
    configFile: vscode.Uri,
    extensionInfo: ExtensionInfoService,
): Promise<[Registry[], string[]]> {
    const config = decodeType(await readJSON(configFile), ExtensionsConfig);
    if (config === undefined) {
        getLogger().log(`Invalid format in ${configFile.fsPath}.`);
        return [[], []];
    }

    let registries: Registry[] = [];
    if (config.registries !== undefined) {
        registries = await Promise.all(
            config.registries.map((registryConfig) =>
                createRegistry(registryConfig, extensionInfo, RegistrySource.Workspace),
            ),
        );
        return [registries, config.recommendations ?? []];
    }

    return [[], []];
}

/**
 * Returns a list of registries with duplicates removed.
 */
function dedupeRegistries(registries: readonly Registry[]) {
    return registries.reduce<Registry[]>((list, item) => {
        if (list.findIndex((other) => item.equals(other)) === -1) {
            list.push(item);
        }

        return list;
    }, []);
}
