# Private Extension Marketplace

[![Code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)
[![Marketplace Downloads](https://img.shields.io/visual-studio-marketplace/d/NikolajFogh.private-extension-marketplace?label=VS%20Marketplace)](https://marketplace.visualstudio.com/items?itemName=NikolajFogh.private-extension-marketplace)
[![Open VSX Downloads](https://img.shields.io/open-vsx/dt/NikolajFogh/private-extension-marketplace?label=Open%20VSX)](https://open-vsx.org/extension/NikolajFogh/private-extension-marketplace)
[![License](https://img.shields.io/badge/License-Apache-cyan)](https://opensource.org/licenses/Apache-2.0)
[![Gitea Last Commit](https://img.shields.io/gitea/last-commit/nfogh/vscode-private-extension-marketplace?gitea_url=https%3A%2F%2Fcodeberg.org)](https://codeberg.org/nfogh/vscode-private-extension-marketplace/src/branch/main/extension)

Extensions are what makes VS Code a great editor. The 
[VS Code Marketplace](https://marketplace.visualstudio.com/) and
[OpenVSX.org](https://open-vsx.org/) makes it easy to install and update
extensions. However, organization-specific extensions often cannot be 
published on these marketplaces.

This extension tries to solve this problem by letting you distribute
organization-specific extensions either using a file share or a private
[NPM registry](https://verdaccio.org) or 
[OpenVSX server](https://github.com/eclipse/openvsx). It attempts to give the
same look-and-feel as the regular vscode marketplace.

# Setup

To use the private extension marketplace, you need to open a workspace which
contains a .vscode/extensions.private.json file. Or you need to add a private
extension repository in your user settings.

### Workspace Configuration

Create a file named `.vscode/extensions.private.json` in any workspace folder
to define your private extension registries and any recommended extensions.
You can use the **Private Extensions: Configure Recommended Extensions** or
**Private Extensions: Configure Workspace Registries** commands to open this
file, creating it from a template if it does not already exist.

The file has the following structure:

```JSON
{
    "registries": [
        {
            "name": "My Private Registry",
            "registry": "https://my-private.registry"
        }
    ],
    "recommendations": [
        "my-org.example-extension"
    ]
}
```

The private extension marketplace will try to autodetect which kind of repository
it is communicating with (file, npm or openvsx). If this somehow fails, you can force
the type of registry by explicitly setting the type to either "file", "npm" or "vsx" like
so:

```JSON
{
    "registries": [
        {
            "name": "My Private Registry",
            "registry": "https://my-private.registry",
            "type": "npm"
        }
    ]
}
```

The `registries` array defines one or more registries to search for private
extensions. Each item supports the following fields:

-   **name**: Name to display for the registry.
-   **registry**: The address of the registry which contains the extension packages.
    - For **file** registry types, it should contain the directory .vsix files are stored in.
    - For **vsx** or **npm** registry types, it should contain the URL of the registry. If omitted, the registry is determined according to standard [NPM config files](https://docs.npmjs.com/files/npmrc),
    or in the case of a VSX registry, it will use [OpenVSX](https://open-vsx.org/)
-   **query**: (Optional) Display only packages that match this search query. 
    For NPM registries, the [search query](https://github.com/npm/registry/blob/master/docs/REGISTRY-API.md#get-v1search)
    is either an array of search terms or a string with space-delimited terms.
    For example, `"keywords:group1 keywords:group2"` would display only packages
    that have the either of the keywords `group1` or `group2`.
-   **enablePagination**: (Optional) If `true`, keep requesting more package results from the registry
    until it gives an empty response. If `false`, make only one request. This defaults to `true`.
    Set it to false when using a server that doesn't properly handle the `from` parameter of the NPM search API.
    You may also need to increase `limit` to get all results if this is disabled.
-   **limit**: (Optional) Number of results to limit each query to when requesting package results. Default: 100.
-   **type**: (Optional) The type of the repository. Can be `npm`, `vsx` or `file`. If not given, it will be autodetected depending on the registry field.
-   If the type is npm, any options supported by [npm-registry-fetch](https://github.com/npm/npm-registry-fetch#-fetch-options) can be added.
    Use these if you need to set authentication, a proxy, or other options.

The `recommendations` array is an optional list of private extensions from any
of the registries which should be recommended for users of the workspace.
The identifier of an extension is always `"${publisher}.${name}"`.
For example: `"my-org.example-extension"`.

You may have multiple workspace folders that contain an `extensions.private.json`
file. The extension manager will display the registries and recommendations from
all of them.

**Note:** if the `query` option is omitted, the query text will be a single
asterisk for NPM servers. Some registry servers such as Verdaccio do not respond
to this with all available packages, so you may need to set `query` to get any
results at all.

### User Configuration

Each user may also specify registries to use regardless of which workspace is
open with the `privateExtensions.registries` setting. This has the same format
as the `registries` array in `extensions.private.json`.

You can use the **Private Extensions: Add Registry...** and
**Private Extensions: Remove Registry** commands to quickly edit this setting.

# Usage

Once a valid registry has been configured, a **Private Extensions** icon will
appear on the activity bar:

![Activity Bar Icon](https://codeberg.org/nfogh/vscode-private-extension-marketplace/raw/branch/main/extension/media/readme/activity-bar.png)

This works similarly to Visual Studio Code's built-in extensions manager and
allows you to install, update, and uninstall private extensions.

## Publishing Extensions (NPM registry)

To publish your package to an npm registry,
[package it in the VSIX format using vsce](https://code.visualstudio.com/api/working-with-extensions/publishing-extension),
create an NPM package containing the .vsix file, and publish it to an NPM
registry. Your extension's `package.json` must contain a `files` array with the
path to the .vsix file so the extension manager knows what to install. Use
`vsce package` in a [`prepublishOnly` script](https://docs.npmjs.com/misc/scripts)
to ensure that your NPM packages always contain an up-to-date extension package.

Note that when Private Extension Marketplace displays the details for an extension,
it will unpack the latest version of the NPM package to read its README and
CHANGELOG files, but it will not unpack the .vsix file. If your extension has an
icon, ensure that it is either accessible via HTTPS or included directly in your
NPM package by referencing it in the `package.json`'s `files` array.

Visual Studio Code does not support scoped extension names such as
`@my-org/my-extension`. It is recommended that you create a registry that only
contains Visual Studio Code extensions to avoid name collisions. If you need to
publish to a registry that contains packages that are not Visual Studio Code
extensions, add a `keywords` field to your `package.json` and tag all your
extensions with the same keyword so you can filter to just extensions, or ensure
that all non-extension packages are scoped.

Use `publishConfig` to set the registry to which the extension should be
published. You may also need to authenticate with this registry using
`npm login --registry=<url>`. Use `npm publish .` to publish your extension
(not `vsce publish`, as that publishes to the public extensions gallery).

Your `package.json` should look like a regular
[extension manifest](https://code.visualstudio.com/api/references/extension-manifest)
but with extra `files` and `publishConfig` fields and a `prepublishOnly` script
to handle the NPM-specific behavior:

```JSON
{
    "name": "example-extension",
    "displayName": "Example Extension",
    "description": "This is an example extension.",
    "version": "1.2.3",
    "author": {
        "name": "John Doe",
        "email": "John.Doe@garmin.com"
    },
    "publisher": "garmin",
    "engines": {
        "vscode": "^1.40.0"
    },
    "icon": "media/icon.png",
    "files": [
        "extension.vsix",
        "media/icon.png"
    ],
    "publishConfig": {
        "registry": "https://my-private.registry"
    },
    "scripts": {
        "prepublishOnly": "vsce package -o extension.vsix",
        ...
    },
    "devDependencies": {
        "vsce": "^1.69.0",
        ...
    }
    ...
}
```

**Note:** `prepare` scripts will **not** be run before installing the extension.
If you have native dependencies, instead of using node-gyp to build them on the
user's machine, you should build them yourself for each supported platform and
include them in the .vsix or host them on a server and have your extension
download them at runtime.

### OS specific Extensions

By default, the first .vsix file in the files array is used. If you have different
native dependencies for each platform, you can use osSpecificVsix to choose a .vsix
file by the [operating system](https://nodejs.org/api/os.html#os_os_platform).

```JSON
    ...
    "osSpecificVsix": {
        "linux": "extension-linux.vsix",
        "win32": "extension-win32.vsix",
        "default": "extension-default.vsix",
    },
    ...
```

The package must include all files listed. `default` (_optional_) is used to select
a file in case none of the explicit keys matches; otherwise an error is shown on
unsupported platforms.

## OpenVSX repositories

For Open VSX repositories, follow the guides found in the [Open VSX pages](https://github.com/eclipse/openvsx/wiki/Deploying-Open-VSX) to install an OpenVSX server. Then point to
the URL of your OpenVSX server in the "registry" part of

### Custom Channels

For NPM registries, it is possible to create tracking channels by using npm
dist-tags when publishing a private extension. This lets you publish pre-release
or other special versions of an extension without updating all users to them.
Only users who are tracking the specific release channel will get the updates.

#### Tracking a Channel

To switch release channels for an extension, install the extension, then
right-click it in the extensions list and select **Switch Release Channels...**.
Alternatively, click the **Channel** button on the extension details page.

You can manually select channels with the `privateExtensions.channels` settings
object. This is a dictionary where each key is an extension identifier
(`"${publisher}.${name}"`) and each name is the dist-tag to track, as shown in
the example below:

```JSON
"privateExtensions.channels": {
    "garmin.example-1": "insiders", // Tracks the 'insiders' dist-tag
    "garmin.example-2": "beta",     // Tracks the 'beta' dist-tag
    "garmin.example-3": "1.0.0"     // Pins the extension to version 1.0.0
}
```

You can also pin an extension to a specific version by listing the version
instead of a dist-tag. Private Extension Marketplace will not notify you of updates
to a pinned extension, so you can use this to temporarily ignore newer versions
of an extension.

#### Publishing to a Channel

To publish an extension to a channel, simply specify the channel name using
[npm dist-tags](https://docs.npmjs.com/cli/dist-tag) when publishing. By default,
all packages will reference the `latest` tag.

```
npm publish . --tag=insiders
```

When publishing pre-release versions, it is reccomended to use pre-release
sematic versioning, such as **1.0.0-beta.0**.

## Extension Updates

Private Extension Marketplace will periodically check your installed extensions for
updates and notify you if any are found. You can adjust the check interval or
disable it with the `privateExtensions.updateCheckInterval` setting.

The Private Extensions sidebar panel will also indicate any extensions with new
versions with a green arrow. Clicking it will update the extension.

You will typically need to reload the Visual Studio Code window for an update
to take effect.

## Remote Development

When using a [remote development](https://code.visualstudio.com/docs/remote/remote-overview)
extension such as [Remote-SSH](https://code.visualstudio.com/docs/remote/ssh),
install the [Private Extension Marketplace: Remote Helper](https://marketplace.visualstudio.com/items?itemName=NikolajFogh.private-extension-marketplace-helper)
extension to give Private Extension Marketplace access to the local machine.

Private Extension Marketplace will attempt to infer where VS Code will install an
extension. If it shows "Install Locally" for a workspace extension or vice versa,
[set the `extensionKind` property](https://code.visualstudio.com/api/advanced-topics/remote-extensions#incorrect-execution-location)
in your extension's `package.json` to tell both VS Code and Private Extension
Manager where the extension should be installed.

## Troubleshooting

If you are successfully connecting to a private registry and don't see any
errors, but you don't see any extensions either, first open the Output panel
(Ctrl+Shift+U) and check the dropdown list for "Private Extension Marketplace".
If it is present, it may contain information as to why extension packages are
being discarded.

If packages aren't being discarded, they may not be found to begin with. If you
do not specify a `query` or other options in your registry configuration, the
default search query for NPM is:

```
{registry-url}/-/v1/search?text=*&size=20&from=0
```

Check how your registry server responds to this. Some servers such as Verdaccio
do not respond to `text=*` with a list of all packages, so you may need to
change the `query` option for your registry (see the **Workspace Configuration**)
section above.

## Privacy Statement

When communicating with the private extension servers you have configured, the
extension will not transmit any data beyond what is necessary to establish the
connection. The extension will not transmit data to any 3rd party.
