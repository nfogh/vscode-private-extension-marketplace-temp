import * as decompress from 'decompress';
import * as fspromises from 'fs/promises';
import { async as node_stream_zip_async } from 'node-stream-zip';
import path = require('path');
import { SemVer } from 'semver';
import * as vscode from 'vscode';

import { ExtensionInfoService } from './extensionInfo';
import { NpmPackage } from './NpmPackage';
import { Package } from './Package';
import { Registry, RegistrySource, VersionInfo, VersionMissingError } from './Registry';
import { getNpmDownloadDir } from './util';

async function pathAccessible(path: string) {
    try {
        await fspromises.access(path);
        return true;
    } catch {
        return false;
    }
}

async function getManifest(vsixPath: string, manifestCache: Map<string, any> | undefined) {
    if (manifestCache !== undefined && manifestCache.has(vsixPath)) {
        return manifestCache.get(vsixPath);
    }

    const zip = new node_stream_zip_async({ file: vsixPath });
    const manifestFile = await zip.entryData('extension/package.json');
    await zip.close();

    const manifest = JSON.parse(manifestFile.toString());
    manifestCache?.set(vsixPath, manifest);
    return manifest;
}

async function getAllManifests(
    directory: string,
    fileGlob: string,
    manifestCache?: Map<string, any>,
    cancellationToken?: vscode.CancellationToken,
) {
    const packageFiles = (
        await vscode.workspace.findFiles(
            new vscode.RelativePattern(directory, '**/' + fileGlob + '.vsix'),
            null,
            undefined,
            cancellationToken,
        )
    ).map((uri) => uri.fsPath);

    return (
        await Promise.all(
            packageFiles.map(async (packagePath) => {
                try {
                    const manifest = await getManifest(packagePath, manifestCache);
                    manifest.files = [packagePath];
                    return {
                        packagePath,
                        manifest,
                    };
                } catch {
                    return undefined;
                }
            }),
        )
    )
        .filter((manifest) => manifest !== undefined)
        .sort((a, b) => new SemVer(a.manifest.version).compare(new SemVer(b.manifest.version)));
}

export class FileRegistry implements Registry {
    public type: 'Registry' = 'Registry';
    readonly query: string;
    readonly extensionInfo: ExtensionInfoService;
    readonly name: string;
    readonly source: RegistrySource;
    readonly registryUri: string;

    private manifestCache = new Map<string, any>();

    public static async isRegistry(uri: string): Promise<boolean> {
        return await pathAccessible(uri);
    }

    constructor(extensionInfo: ExtensionInfoService, name: string, registryUrl: string, query?: string) {
        this.query = query ?? '*';
        this.registryUri = registryUrl;
        this.extensionInfo = extensionInfo;
        this.name = name;
        this.source = RegistrySource.User;
    }

    get uri(): vscode.Uri | undefined {
        return vscode.Uri.parse(this.registryUri);
    }

    async downloadPackage(packageOrSpec: Package | string): Promise<vscode.Uri> {
        const spec = typeof packageOrSpec === 'string' ? packageOrSpec : packageOrSpec.spec;
        const [name, version] = spec.split('@');
        const pkg = await this.getPackage(name, version);

        if (!pkg.vsixFile) {
            throw new Error(`No VSIX file found for ${name}@${version}`);
        }

        const downloadDir = getNpmDownloadDir();
        const filePath = path.join(downloadDir, path.basename(pkg.vsixFile));
        if (!(await pathAccessible(filePath))) {
            await fspromises.mkdir(downloadDir, { recursive: true });
            await fspromises.copyFile(pkg.vsixFile, filePath);
        }

        const extractedPath = filePath + '-extracted';

        if (!(await pathAccessible(extractedPath))) {
            await new Promise((resolve, reject) => {
                decompress(filePath, extractedPath).then(resolve).catch(reject);
            });

            // Copy the vsix file to be compatible with the NPM registry.
            // TODO: Refactor logic to avoid copying the file.
            await fspromises.copyFile(filePath, path.join(extractedPath, 'extension', path.basename(filePath)));
        }

        return vscode.Uri.file(path.join(extractedPath, 'extension'));
    }

    async getPackages(cancellationToken?: vscode.CancellationToken): Promise<Package[]> {
        const manifests = await getAllManifests(this.registryUri, this.query, this.manifestCache, cancellationToken);

        const packages: Package[] = manifests.map((pkg) => new NpmPackage(this, pkg.manifest));
        packages.sort((a, b) => -a.version.compare(b.version));

        const uniquePackages = packages.filter(
            (pkg, i, packages) => packages.findIndex((otherPkg) => otherPkg.name === pkg.name) === i,
        );
        await Promise.all(uniquePackages.map((pkg) => pkg.updateState()));

        return uniquePackages;
    }

    async getPackageChannels(_name: string): Promise<Record<string, VersionInfo>> {
        return {};
    }

    async getPackageVersions(name: string): Promise<VersionInfo[]> {
        const manifests = await getAllManifests(this.registryUri, this.query, this.manifestCache);
        const matchingManifests = manifests.filter((manifest) => manifest.manifest.name === name);
        const versions = matchingManifests.map((manifest) => ({ version: new SemVer(manifest.manifest.version) }));
        return versions.sort((a, b) => a.version.compare(b.version));
    }

    async getPackage(name: string, version?: string): Promise<Package> {
        const manifests = await getAllManifests(this.registryUri, this.query, this.manifestCache);
        const matchingManifests = manifests.filter(
            (manifest) => manifest.manifest.name === name && (!version || manifest.manifest.version === version),
        );
        matchingManifests.sort((a, b) => new SemVer(a.manifest.version).compare(new SemVer(b.manifest.version)));
        if (matchingManifests.length === 0) {
            throw new VersionMissingError(name, version ?? 'latest');
        }

        const pkg = new NpmPackage(this, matchingManifests[0].manifest);
        await pkg.updateState();
        return pkg;
    }

    equals(other: any): boolean {
        if (other instanceof FileRegistry) {
            return other.query === this.query && other.uri?.toString() === this.uri?.toString();
        }
        return false;
    }
}
