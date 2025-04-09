import * as t from 'io-ts';

import { options } from './typeUtil';

export const UserRegistry = options(
    {
        name: t.string,
    },
    {
        registry: t.string,
        type: t.union([t.literal('npm'), t.literal('vsx'), t.literal('file')]),
    },
);
export type UserRegistry = t.TypeOf<typeof UserRegistry>;
