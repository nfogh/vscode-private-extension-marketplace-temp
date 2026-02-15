import { assert, expect } from 'chai';
import { SemVer } from 'semver';
import sinon = require('sinon');
import * as vscode from 'vscode';

import { ExtensionInfoService } from '../../extensionInfo';
import { FileRegistry } from '../../FileRegistry';

import 'source-map-support/register';

suite('File Registry Package Search', function () {
    test('search for all packages shall return all packages', async function () {
        assert(vscode.workspace.workspaceFolders);
        assert(vscode.workspace.workspaceFolders.length >= 1);
        const fileRegistry = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'extensions');
        const registry = new FileRegistry(
            sinon.createStubInstance(ExtensionInfoService),
            'FakeRegistry',
            fileRegistry.fsPath,
        );
        const packages = await registry.getPackages();
        expect(
            packages.find((pkg) => pkg.name === 'my-extension1' && pkg.version.version === '0.0.3'),
        ).is.not.undefined;
        expect(
            packages.find((pkg) => pkg.name === 'my-extension2' && pkg.version.version === '1.0.0'),
        ).is.not.undefined;
    });

    test('get package versions shall return all package versions', async function () {
        assert(vscode.workspace.workspaceFolders);
        assert(vscode.workspace.workspaceFolders.length >= 1);
        const fileRegistry = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'extensions');
        const registry = new FileRegistry(
            sinon.createStubInstance(ExtensionInfoService),
            'FakeRegistry',
            fileRegistry.fsPath,
        );
        const versions1 = await registry.getPackageVersions('my-extension1');
        const versions2 = await registry.getPackageVersions('my-extension2');

        expect(versions1).to.deep.contain({ version: new SemVer('0.0.1') });
        expect(versions1).to.deep.contain({ version: new SemVer('0.0.2') });
        expect(versions1).to.deep.contain({ version: new SemVer('0.0.3') });

        expect(versions2).to.deep.contain({ version: new SemVer('1.0.0') });
    });

    test('invalid packages shall not be included', async function () {
        assert(vscode.workspace.workspaceFolders);
        assert(vscode.workspace.workspaceFolders.length >= 1);
        const fileRegistry = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'extensions');
        const registry = new FileRegistry(
            sinon.createStubInstance(ExtensionInfoService),
            'FakeRegistry',
            fileRegistry.fsPath,
        );
        const packages = await registry.getPackages();
        expect(packages.map(({ name }) => ({ name }))).to.deep.include({ name: 'my-extension1' });
        expect(packages.map(({ name }) => ({ name }))).to.deep.include({ name: 'my-extension2' });
        expect(packages.map(({ name }) => ({ name }))).not.to.deep.include({ name: 'my-invalid-extension' });
    });

    test('packages with empty repository info shall be included', async function () {
        assert(vscode.workspace.workspaceFolders);
        assert(vscode.workspace.workspaceFolders.length >= 1);
        const fileRegistry = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'extensions');
        const registry = new FileRegistry(
            sinon.createStubInstance(ExtensionInfoService),
            'FakeRegistry',
            fileRegistry.fsPath,
        );
        const packages = await registry.getPackages();
        expect(packages.map(({ name }) => ({ name }))).to.deep.include({ name: 'my-extension-with-empty-repo-info' });
    });
});
