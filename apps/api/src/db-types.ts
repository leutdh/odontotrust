import type { Database } from '@odontotrust/db';

/** Transaction handle received by the callback of `withTenant`. */
export type Tx = Parameters<Parameters<Database['withTenant']>[1]>[0];
