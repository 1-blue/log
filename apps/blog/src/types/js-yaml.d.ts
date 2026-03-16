declare module "js-yaml" {
  export function load(str: string, options?: { schema?: unknown }): unknown;
  export const JSON_SCHEMA: unknown;
}
