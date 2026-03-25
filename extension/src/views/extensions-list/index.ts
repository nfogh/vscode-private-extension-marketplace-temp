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
const allExtensions: ExtensionEntry[] = appWindow.__EXTENSIONS__;
const defaultIcon: string = appWindow.__DEFAULT_ICON__;

const PAGE_SIZE = 50;

// ── Search state ────────────────────────────────────────────────────────────

let currentQuery = '';

function matchesQuery(entry: ExtensionEntry, query: string): boolean {
    if (!query) {
        return true;
    }
    const q = query.toLowerCase();
    return (
        entry.displayName.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q) ||
        entry.publisher.toLowerCase().includes(q) ||
        entry.extensionId.toLowerCase().includes(q)
    );
}

function getFilteredExtensions(): ExtensionEntry[] {
    return allExtensions.filter((e) => matchesQuery(e, currentQuery));
}

// ── DOM helpers ─────────────────────────────────────────────────────────────

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
    header.appendChild(name);

    const label = stateLabel(entry.state);
    if (label) {
        const badge = document.createElement('span');
        badge.className = `extension-badge ${label.className}`;
        badge.textContent = label.text;
        header.appendChild(badge);
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

// ── Search box ───────────────────────────────────────────────────────────────

function createSearchBox(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'search-container';

    const inputContainer = document.createElement('div');
    inputContainer.className = 'search-input-container';

    const searchIcon = document.createElement('span');
    searchIcon.className = 'search-icon codicon codicon-search';
    searchIcon.setAttribute('aria-hidden', 'true');

    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'search-input';
    input.placeholder = 'Search extensions in Marketplace';
    input.setAttribute('aria-label', 'Search extensions');
    input.spellcheck = false;
    input.autocomplete = 'off';
    input.value = currentQuery;

    const clearButton = document.createElement('button');
    clearButton.className = 'search-clear-button';
    clearButton.setAttribute('aria-label', 'Clear search');
    clearButton.title = 'Clear search';
    clearButton.innerHTML = '<span class="codicon codicon-close"></span>';
    clearButton.style.display = currentQuery ? 'flex' : 'none';

    input.addEventListener('input', () => {
        currentQuery = input.value;
        clearButton.style.display = currentQuery ? 'flex' : 'none';
        renderList();
    });

    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            currentQuery = '';
            input.value = '';
            clearButton.style.display = 'none';
            renderList();
        }
    });

    clearButton.addEventListener('click', () => {
        currentQuery = '';
        input.value = '';
        clearButton.style.display = 'none';
        input.focus();
        renderList();
    });

    inputContainer.appendChild(searchIcon);
    inputContainer.appendChild(input);
    inputContainer.appendChild(clearButton);
    container.appendChild(inputContainer);

    return container;
}

// ── List rendering ───────────────────────────────────────────────────────────

function renderList(): void {
    const listContainer = document.getElementById('list-container');
    if (!listContainer) {
        return;
    }

    listContainer.innerHTML = '';

    const filtered = getFilteredExtensions();
    const visible = filtered.slice(0, PAGE_SIZE);

    if (filtered.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-message';
        empty.textContent = currentQuery ? `No extensions found matching "${currentQuery}".` : 'No extensions found.';
        listContainer.appendChild(empty);
        return;
    }

    const list = document.createElement('div');
    list.className = 'extensions-list';
    list.setAttribute('role', 'list');

    for (const entry of visible) {
        list.appendChild(createExtensionItem(entry));
    }

    listContainer.appendChild(list);

    if (filtered.length > PAGE_SIZE) {
        const overflow = document.createElement('div');
        overflow.className = 'overflow-message';
        overflow.textContent = `Showing ${PAGE_SIZE} of ${filtered.length} extensions. Refine your search to see more.`;
        listContainer.appendChild(overflow);
    }
}

// ── Initial render ───────────────────────────────────────────────────────────

function render(): void {
    const root = document.getElementById('root');
    if (!root) {
        return;
    }

    root.appendChild(createSearchBox());

    const listContainer = document.createElement('div');
    listContainer.id = 'list-container';
    root.appendChild(listContainer);

    renderList();
}

render();
