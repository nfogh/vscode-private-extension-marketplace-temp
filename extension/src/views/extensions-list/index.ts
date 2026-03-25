// Webview script for the extensions sidebar list.
// Runs in the browser context inside the VS Code webview.

declare const acquireVsCodeApi: () => {
    postMessage(message: unknown): void;
};

interface ExtensionEntry {
    extensionId: string;
    displayName: string;
    description: string;
    publisher: string;
    version: string;
    state: string;
    iconUri: string | null;
    registryName: string;
}

interface ExtensionsListWindow {
    __EXTENSIONS__: ExtensionEntry[];
    __DEFAULT_ICON__: string;
}

// Cast window to access the globals injected by the extension host.
const appWindow = window as unknown as Window & ExtensionsListWindow;

const vscode = acquireVsCodeApi();
const extensions: ExtensionEntry[] = appWindow.__EXTENSIONS__;
const defaultIcon: string = appWindow.__DEFAULT_ICON__;

function stateLabel(state: string): { text: string; className: string } | null {
    switch (state) {
        case 'installed':
        case 'installed.remote':
            return { text: 'Installed', className: 'installed' };
        case 'installed.prerelease':
            return { text: 'Pre-release', className: 'prerelease' };
        case 'update':
            return { text: 'Update', className: 'update' };
        case 'invalid':
            return { text: 'Invalid', className: 'invalid' };
        default:
            return null;
    }
}

function createActionButton(text: string, className: string, onClick: () => void): HTMLElement {
    const li = document.createElement('li');
    li.className = 'action-item';
    li.setAttribute('role', 'presentation');

    const a = document.createElement('a');
    a.className = `action-label codicon extension-action enable ${className}`;
    a.setAttribute('role', 'button');
    a.tabIndex = 0;
    a.textContent = text;
    a.addEventListener('click', (e) => {
        e.stopPropagation();
        onClick();
    });
    a.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
            onClick();
        }
    });

    li.appendChild(a);
    return li;
}

function createExtensionItem(entry: ExtensionEntry): HTMLElement {
    const item = document.createElement('div');
    item.className = 'extension-list-item';
    item.setAttribute('role', 'listitem');
    item.tabIndex = 0;

    // Icon
    const iconContainer = document.createElement('div');
    iconContainer.className = 'icon-container';
    const icon = document.createElement('img');
    icon.className = 'icon';
    icon.draggable = false;
    icon.src = entry.iconUri ?? defaultIcon;
    icon.alt = '';
    iconContainer.appendChild(icon);

    // Details
    const details = document.createElement('div');
    details.className = 'details';

    const header = document.createElement('div');
    header.className = 'header';

    const name = document.createElement('span');
    name.className = 'name';
    name.textContent = entry.displayName;

    const label = stateLabel(entry.state);
    if (label) {
        const badge = document.createElement('span');
        badge.className = `extension-badge ${label.className}`;
        badge.textContent = label.text;
        header.appendChild(name);
        header.appendChild(badge);
    } else {
        header.appendChild(name);
    }

    const subtitle = document.createElement('div');
    subtitle.className = 'subtitle';

    const publisher = document.createElement('span');
    publisher.className = 'publisher';
    publisher.textContent = entry.publisher;

    subtitle.appendChild(publisher);

    const description = document.createElement('div');
    description.className = 'description';
    description.textContent = entry.description;

    // Action bar
    const actionsBar = document.createElement('div');
    actionsBar.className = 'actions';
    const actionBar = document.createElement('div');
    actionBar.className = 'monaco-action-bar';
    const actionList = document.createElement('ul');
    actionList.className = 'actions-container';
    actionList.setAttribute('role', 'toolbar');

    if (entry.state === 'update') {
        actionList.appendChild(
            createActionButton('Update', 'prominent update', () => {
                vscode.postMessage({ type: 'update', extensionId: entry.extensionId });
            }),
        );
        actionList.appendChild(
            createActionButton('Uninstall', 'uninstall', () => {
                vscode.postMessage({ type: 'uninstall', extensionId: entry.extensionId });
            }),
        );
    } else if (
        entry.state === 'installed' ||
        entry.state === 'installed.remote' ||
        entry.state === 'installed.prerelease'
    ) {
        actionList.appendChild(
            createActionButton('Uninstall', 'uninstall', () => {
                vscode.postMessage({ type: 'uninstall', extensionId: entry.extensionId });
            }),
        );
    } else if (entry.state === 'available') {
        actionList.appendChild(
            createActionButton('Install', 'install prominent', () => {
                vscode.postMessage({ type: 'install', extensionId: entry.extensionId });
            }),
        );
    }

    actionBar.appendChild(actionList);
    actionsBar.appendChild(actionBar);

    details.appendChild(header);
    details.appendChild(subtitle);
    details.appendChild(description);
    details.appendChild(actionsBar);

    item.appendChild(iconContainer);
    item.appendChild(details);

    // Clicking the item body (not buttons) opens the details view
    item.addEventListener('click', () => {
        vscode.postMessage({ type: 'showExtension', extensionId: entry.extensionId });
    });
    item.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            vscode.postMessage({ type: 'showExtension', extensionId: entry.extensionId });
        }
    });

    return item;
}

function render(): void {
    const root = document.getElementById('root');
    if (!root) {
        return;
    }
    root.innerHTML = '';

    if (extensions.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-message';
        empty.textContent = 'No extensions found.';
        root.appendChild(empty);
        return;
    }

    const list = document.createElement('div');
    list.className = 'extensions-list';
    list.setAttribute('role', 'list');

    for (const entry of extensions) {
        list.appendChild(createExtensionItem(entry));
    }

    root.appendChild(list);
}

render();
