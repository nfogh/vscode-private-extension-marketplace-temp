import * as t from 'io-ts';

import { options } from './typeUtil';

export const SearchEntryRT = options(
    {
        url: t.string,
        files: t.record(t.string, t.string),
        name: t.string,
        namespace: t.string,
        version: t.string,
        timestamp: t.string,
    },
    {
        verified: t.boolean,
        allVersionsUrl: t.string,
        averageRating: t.number,
        reviewCount: t.number,
        downloadCount: t.number,
        displayName: t.string,
        description: t.string,
        deprecated: t.boolean,
    },
);

export const SearchResultRT = options(
    {
        offset: t.number,
        totalSize: t.number,
        extensions: t.array(SearchEntryRT),
    },
    {
        success: t.string,
        warning: t.string,
        error: t.string,
    },
);

export const UserEntryRT = options(
    {
        loginName: t.string,
    },
    {
        success: t.string,
        warning: t.string,
        error: t.string,
        fullName: t.string,
        avatarUrl: t.string,
        homepage: t.string,
        provider: t.string,
    },
);

export const BadgeEntryRT = options(
    {},
    {
        url: t.string,
        href: t.string,
        desciption: t.string,
    },
);

export const ExtensionReferenceRT = options(
    {
        url: t.string,
        namespace: t.string,
        extension: t.string,
    },
    {},
);

export const VersionTargetPlatformsJSONRT = options(
    {},
    {
        version: t.string,
        targetPlatforms: t.string,
    },
);

export const ExtensionReplacementRT = options(
    {},
    {
        url: t.string,
        displayName: t.string,
    },
);

export const ExtensionMetadataRT = options(
    {
        namespaceUrl: t.string,
        reviewsUrl: t.string,
        name: t.string,
        namespace: t.string,
        version: t.string,
        publishedBy: UserEntryRT,
        timestamp: t.string,
    },
    {
        namespaceDisplayName: t.string,
        verified: t.boolean,
        success: t.string,
        warning: t.string,
        error: t.string,
        files: t.record(t.string, t.string),
        targetPlatform: t.string,
        preRelease: t.boolean,
        allVersions: t.record(t.string, t.string),
        unrelatedPublisher: t.boolean,
        namespaceAccess: t.string,
        allVersionsUrl: t.string,
        averageRating: t.number,
        downloadCount: t.number,
        reviewCount: t.number,
        versionAlias: t.array(t.string),
        preview: t.boolean,
        displayName: t.string,
        description: t.string,
        engines: t.record(t.string, t.string),
        categories: t.array(t.string),
        extensionKind: t.array(t.string),
        tags: t.array(t.string),
        license: t.string,
        homepage: t.string,
        repository: t.string,
        sponsorLink: t.string,
        bugs: t.string,
        markdown: t.string,
        galleryColor: t.string,
        galleryTheme: t.string,
        localizedLanguages: t.array(t.string),
        qna: t.string,
        badges: t.array(BadgeEntryRT),
        dependencies: t.array(ExtensionReferenceRT),
        bundledExtensions: t.array(ExtensionReferenceRT),
        downloads: t.record(t.string, t.string),
        allTargetPlatformVersions: t.array(VersionTargetPlatformsJSONRT),
        url: t.string,
        deprecated: t.boolean,
        replacement: ExtensionReplacementRT,
        downloadable: t.boolean,
    },
);

export const QueryResultRT = options(
    {
        extensions: t.array(ExtensionMetadataRT),
    },
    {
        offset: t.number,
        totalSize: t.number,
        success: t.string,
        warning: t.string,
        error: t.string,
    },
);

export const VersionsResultRT = options(
    {
        offset: t.number,
        totalSize: t.number,
        versions: t.record(t.string, t.string),
    },
    {
        success: t.string,
        warning: t.string,
        error: t.string,
    },
);

export type VersionsResult = t.TypeOf<typeof VersionsResultRT>;

export type SearchEntry = t.TypeOf<typeof SearchEntryRT>;
export type SearchResult = t.TypeOf<typeof SearchResultRT>;

export type ExtensionMetadata = t.TypeOf<typeof ExtensionMetadataRT>;
export type QueryResult = t.TypeOf<typeof QueryResultRT>;
