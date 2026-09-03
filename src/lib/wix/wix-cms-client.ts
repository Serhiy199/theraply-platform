import "server-only";
import { wixRequestForSiteWithApiToken } from "@/lib/wix/wix-client";
import {
  getWixCmsConfig,
  WIX_THERAPISTS_COLLECTION_ID,
} from "@/lib/wix/wix-cms-config";

export type WixCmsTherapistData = {
  theraplyId: string;
  displayName: string;
  bio: string;
  specialization: string;
  therapyServicesProvided: string;
  yearsOfExperience: string;
  profilePhoto: string;
  sessionPricePence: number;
  sessionPriceDisplay: string;
  bookingUrl: string;
  isBookable: boolean;
  isPublished: boolean;
};

export type WixCmsDataItem = {
  id: string;
  revision?: string | null;
  data: Record<string, unknown>;
};

type QueryDataItemsResponse = {
  dataItems?: unknown[];
};

type DataCollectionResponse = {
  collection?: unknown;
};

type DataItemResponse = {
  dataItem?: unknown;
};

export type WixCmsIndex = {
  name: string;
  status: string;
  unique: boolean;
  fields: Array<{ path: string }>;
};

export type WixCmsCollectionField = {
  key: string;
  type: string;
};

export type WixCmsCollection = {
  id: string;
  fields: WixCmsCollectionField[];
};

export class WixCmsClientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WixCmsClientError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseDataItem(value: unknown): WixCmsDataItem {
  if (!isRecord(value) || typeof value.id !== "string" || !isRecord(value.data)) {
    throw new WixCmsClientError("Wix CMS returned an invalid data item.");
  }

  const publicData = Object.fromEntries(
    Object.entries(value.data).filter(([key]) => !key.startsWith("_")),
  );

  return {
    id: value.id,
    revision: typeof value.revision === "string" ? value.revision : null,
    data: publicData,
  };
}

function parseIndex(value: unknown): WixCmsIndex | null {
  if (!isRecord(value) || typeof value.name !== "string" || typeof value.status !== "string") {
    return null;
  }

  const fields = Array.isArray(value.fields)
    ? value.fields.flatMap((field) =>
        isRecord(field) && typeof field.path === "string"
          ? [{ path: field.path }]
          : [],
      )
    : [];

  return {
    name: value.name,
    status: value.status,
    unique: value.unique === true,
    fields,
  };
}

function parseCollection(value: unknown): WixCmsCollection {
  if (!isRecord(value) || typeof value.id !== "string" || !Array.isArray(value.fields)) {
    throw new WixCmsClientError("Wix CMS returned an invalid collection response.");
  }

  const fields = value.fields.flatMap((field) =>
    isRecord(field) && typeof field.key === "string" && typeof field.type === "string"
      ? [{ key: field.key, type: field.type }]
      : [],
  );

  if (fields.length !== value.fields.length) {
    throw new WixCmsClientError("Wix CMS returned an invalid collection field.");
  }

  return { id: value.id, fields };
}

export async function getWixCmsTherapistsCollection() {
  const config = getWixCmsConfig();
  const response = await wixRequestForSiteWithApiToken<DataCollectionResponse>(
    config.siteId,
    config.apiToken,
    `/wix-data/v2/collections/${encodeURIComponent(WIX_THERAPISTS_COLLECTION_ID)}?consistentRead=true`,
    { method: "GET" },
  );

  return parseCollection(response.collection);
}

export async function listWixCmsTherapistIndexes() {
  const config = getWixCmsConfig();
  const response = await wixRequestForSiteWithApiToken<{ indexes?: unknown[] }>(
    config.siteId,
    config.apiToken,
    `/wix-data/v2/indexes?dataCollectionId=${encodeURIComponent(WIX_THERAPISTS_COLLECTION_ID)}&paging.limit=100`,
    { method: "GET" },
  );

  if (!Array.isArray(response.indexes)) {
    throw new WixCmsClientError("Wix CMS returned an invalid index response.");
  }

  return response.indexes
    .map(parseIndex)
    .filter((index): index is WixCmsIndex => index !== null);
}

export async function listAllWixCmsTherapists() {
  const config = getWixCmsConfig();
  const items: WixCmsDataItem[] = [];
  const pageSize = 100;

  for (let offset = 0; offset < 10_000; offset += pageSize) {
    const response = await wixRequestForSiteWithApiToken<QueryDataItemsResponse>(
      config.siteId,
      config.apiToken,
      "/wix-data/v2/items/query",
      {
        method: "POST",
        body: {
          dataCollectionId: WIX_THERAPISTS_COLLECTION_ID,
          consistentRead: true,
          query: {
            paging: { limit: pageSize, offset },
          },
        },
      },
    );

    if (!Array.isArray(response.dataItems)) {
      throw new WixCmsClientError("Wix CMS returned an invalid query response.");
    }

    items.push(...response.dataItems.map(parseDataItem));
    if (response.dataItems.length < pageSize) return items;
  }

  throw new WixCmsClientError("Wix CMS therapist inventory exceeds the safety limit.");
}

export async function findWixCmsTherapistsByTheraplyId(theraplyId: string) {
  const config = getWixCmsConfig();
  const response = await wixRequestForSiteWithApiToken<QueryDataItemsResponse>(
    config.siteId,
    config.apiToken,
    "/wix-data/v2/items/query",
    {
      method: "POST",
      body: {
        dataCollectionId: WIX_THERAPISTS_COLLECTION_ID,
        consistentRead: true,
        query: {
          filter: {
            theraplyId: { $eq: theraplyId },
          },
          paging: { limit: 3 },
        },
      },
    },
  );

  if (!Array.isArray(response.dataItems)) {
    throw new WixCmsClientError("Wix CMS returned an invalid query response.");
  }

  return response.dataItems.map(parseDataItem);
}

export async function createWixCmsTherapist(data: WixCmsTherapistData) {
  const config = getWixCmsConfig();
  const response = await wixRequestForSiteWithApiToken<DataItemResponse>(
    config.siteId,
    config.apiToken,
    "/wix-data/v2/items",
    {
      method: "POST",
      body: {
        dataCollectionId: WIX_THERAPISTS_COLLECTION_ID,
        dataItem: {
          data,
        },
      },
    },
  );

  return parseDataItem(response.dataItem);
}

export async function updateWixCmsTherapist(
  item: WixCmsDataItem,
  data: Record<string, unknown>,
) {
  const config = getWixCmsConfig();
  const response = await wixRequestForSiteWithApiToken<DataItemResponse>(
    config.siteId,
    config.apiToken,
    `/wix-data/v2/items/${encodeURIComponent(item.id)}`,
    {
      method: "PUT",
      body: {
        dataCollectionId: WIX_THERAPISTS_COLLECTION_ID,
        dataItem: {
          id: item.id,
          ...(item.revision ? { revision: item.revision } : {}),
          data,
        },
      },
    },
  );

  return parseDataItem(response.dataItem);
}
