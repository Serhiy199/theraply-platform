import "server-only";

export const WIX_CMS_STAGING_SITE_ID = "80d72d55-7ad6-4efd-8091-c82ec66fb286";
export const WIX_CMS_PRODUCTION_SITE_ID = "1ce946b1-1bcb-4b89-a1b5-86358d639333";
export const WIX_THERAPISTS_COLLECTION_ID = "Therapists";
export const WIX_THERAPLY_ID_UNIQUE_INDEX_NAME = "theraplyId_unique";

export type WixCmsEnvironment = "dev" | "development" | "staging" | "production";
export type WixCmsTokenSource =
  | "WIX_CMS_API_TOKEN"
  | "WIX_CMS_API_TOKEN_PRODUCTION";

export type WixCmsConfig = {
  apiToken: string;
  tokenSource: WixCmsTokenSource;
  environment: WixCmsEnvironment;
  siteId: string;
  collectionId: typeof WIX_THERAPISTS_COLLECTION_ID;
};

export class WixCmsConfigError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "WIX_CMS_CONFIG_MISSING"
      | "WIX_CMS_ENVIRONMENT_MISMATCH",
  ) {
    super(message);
    this.name = "WixCmsConfigError";
  }
}

function readRequiredEnv(
  name:
    | "WIX_CMS_API_TOKEN"
    | "WIX_CMS_API_TOKEN_PRODUCTION"
    | "WIX_CMS_ENVIRONMENT"
    | "WIX_CMS_SITE_ID",
) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new WixCmsConfigError(`${name} is not configured.`, "WIX_CMS_CONFIG_MISSING");
  }

  return value;
}

export function assertWixCmsEnvironment(
  environment: WixCmsEnvironment,
  siteId: string,
) {
  const expectedSiteId =
    environment === "production"
      ? WIX_CMS_PRODUCTION_SITE_ID
      : WIX_CMS_STAGING_SITE_ID;

  if (siteId !== expectedSiteId) {
    throw new WixCmsConfigError(
      "The configured Wix CMS site does not match the runtime environment.",
      "WIX_CMS_ENVIRONMENT_MISMATCH",
    );
  }
}

export function getWixCmsConfig(): WixCmsConfig {
  const rawEnvironment = readRequiredEnv("WIX_CMS_ENVIRONMENT");

  if (
    rawEnvironment !== "dev" &&
    rawEnvironment !== "development" &&
    rawEnvironment !== "staging" &&
    rawEnvironment !== "production"
  ) {
    throw new WixCmsConfigError(
      "WIX_CMS_ENVIRONMENT must be dev, development, staging, or production.",
      "WIX_CMS_CONFIG_MISSING",
    );
  }

  const tokenSource: WixCmsTokenSource =
    rawEnvironment === "production"
      ? "WIX_CMS_API_TOKEN_PRODUCTION"
      : "WIX_CMS_API_TOKEN";
  const apiToken = readRequiredEnv(tokenSource);
  const siteId = readRequiredEnv("WIX_CMS_SITE_ID");
  assertWixCmsEnvironment(rawEnvironment, siteId);

  return {
    apiToken,
    tokenSource,
    environment: rawEnvironment,
    siteId,
    collectionId: WIX_THERAPISTS_COLLECTION_ID,
  };
}
