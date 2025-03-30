import { assert, expect } from 'chai';
import { isRight } from 'fp-ts/lib/Either';
import * as t from 'io-ts';
import { PathReporter } from 'io-ts/lib/PathReporter';
import * as jsonc from 'jsonc-parser';
import { promisify } from 'node:util';
import * as tmp from 'tmp';
import * as uitest from 'vscode-extension-tester';

import { UserRegistry } from '../UserRegistryTypes';

const tmpdir = promisify(tmp.dir);

async function enterIntoInputBox(text: string): Promise<void> {
    const inputBox = await uitest.InputBox.create();
    await inputBox.setText(text);
    await inputBox.confirm();
}

async function waitForExtensionActive(): Promise<boolean> {
    let activated = false;
    const statusBar = new uitest.StatusBar();
    let tries = 10;
    while (!activated && tries !== 0) {
        await new Promise((res) => {
            setTimeout(res, 1000);
        }); // Leave time for statusbar to update
        const items = await statusBar.getItems();
        const itemTexts = await Promise.all(items.map((item) => item.getText()));
        activated = itemTexts.filter((text) => text.includes('Activating')).length === 0;
        tries = tries - 1;
    }
    return activated;
}

// Expands dot names in an object, so
// registry.entries { ...} becomes
// registry {
//   entries { ... }
// }
function expandDotNames(obj: any): any {
    return Object.keys(obj).reduce((acc: any, key) => {
        if (key.indexOf('.') >= 0) {
            const [parentKey, childKey] = key.split('.');
            acc[parentKey] = acc[parentKey] || {};
            acc[parentKey][childKey] = obj[key];
        } else {
            acc[key] = obj[key];
        }
        return acc;
    }, {});
}

async function getUserSettings(): Promise<string> {
    const workbench = new uitest.Workbench();
    await workbench.executeCommand('Open User Settings (JSON)');
    const editorView = new uitest.EditorView();
    const titles = await editorView.getOpenEditorTitles();
    assert(titles.includes('settings.json'), 'settings.json should have opened');
    const editor = (await editorView.openEditor('settings.json')) as uitest.TextEditor;

    return await editor.getText();
}

async function saveUserSettings(settings: string): Promise<void> {
    const workbench = new uitest.Workbench();
    await workbench.executeCommand('Open User Settings (JSON)');
    const editorView = new uitest.EditorView();
    const titles = await editorView.getOpenEditorTitles();
    assert(titles.includes('settings.json'), 'settings.json should have opened');
    const editor = (await editorView.openEditor('settings.json')) as uitest.TextEditor;

    await editor.setText(settings);
    await editor.save();
}

describe('AddUserRegistryCommand', function () {
    it('shall add a registry to user settings when executed', async function () {
        const workbench = new uitest.Workbench();

        await workbench.executeCommand('privateExtensions.registry.add');

        await enterIntoInputBox('https://my-registry.local');
        await enterIntoInputBox('My User Registry');

        const notifications = await workbench.getNotifications();
        const messages = await Promise.all(notifications.map((notification) => notification.getMessage()));
        const addedRegistryMessages = messages.filter((message) => message.includes('My User Registry'));

        assert(addedRegistryMessages.length >= 1, `No 'added registry' message was received`);

        const text = await getUserSettings();

        const errors: jsonc.ParseError[] = [];
        const userSettingsJson = jsonc.parse(text, errors);
        assert(errors.length === 0, `Errors while parsing settings.json ${errors.join(', ')}`);

        const PrivateExtensionsSettings = t.type({
            privateExtensions: t.type({
                registries: t.array(UserRegistry),
            }),
        });

        const userSettingsJsonExpanded = expandDotNames(userSettingsJson);
        const userSettings = PrivateExtensionsSettings.decode(userSettingsJsonExpanded);
        assert(isRight(userSettings), `User settings could not be parsed: ${PathReporter.report(userSettings)}`);
        assert(
            userSettings.right.privateExtensions.registries.length >= 1,
            `Number of registry entries should be 1, it is ${userSettings.right.privateExtensions.registries.length}`,
        );
        expect(userSettings.right.privateExtensions.registries[0].name).to.equal('My User Registry');
        expect(userSettings.right.privateExtensions.registries[0].registry).to.equal('https://my-registry.local');
    }).timeout(20000);

    let savedSettings = '';

    before(async () => {
        savedSettings = await getUserSettings();
    });

    after(async () => {
        await saveUserSettings(savedSettings);
    });
});

describe('Configure Workspace Registries', function () {
    it('Shall open configuration with default settings', async function () {
        const workspaceDir = await tmpdir();
        await uitest.VSBrowser.instance.openResources(workspaceDir);

        const workbench = new uitest.Workbench();
        await workbench.executeCommand('privateExtensions.configureWorkspaceRegistries');

        assert(await waitForExtensionActive(), 'Extension didnt activate in time');
        const editorView = new uitest.EditorView();
        const titles = await editorView.getOpenEditorTitles();
        assert(titles.includes('extensions.private.json'), 'extensions.private.json should have opened');
        const editor = await editorView.openEditor('extensions.private.json');

        const text = await editor.getText();
        const errors: jsonc.ParseError[] = [];
        const workspaceSettingsJson = jsonc.parse(text, errors);
        assert(errors.length === 0, `Errors while parsing extensions.private.json ${errors.join(', ')}`);

        const EmptyRegistry = t.type({
            registries: t.array(t.any),
            recommended: t.array(t.any),
        });

        const workspaceSettings = EmptyRegistry.decode(workspaceSettingsJson);
        expect(isRight(workspaceSettings));
    }).timeout(200000);
});
