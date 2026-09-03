import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getConfig: vi.fn(),
  request: vi.fn(),
}));

vi.mock("@/lib/wix/wix-cms-config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/wix/wix-cms-config")>();
  return { ...actual, getWixCmsConfig: mocks.getConfig };
});

vi.mock("@/lib/wix/wix-client", () => ({
  wixRequestForSiteWithApiToken: mocks.request,
}));

import {
  createWixCmsTherapist,
  findWixCmsTherapistsByTheraplyId,
  getWixCmsTherapistsCollection,
  listAllWixCmsTherapists,
  listWixCmsTherapistIndexes,
  updateWixCmsTherapist,
  type WixCmsTherapistData,
} from "@/lib/wix/wix-cms-client";

const projection: WixCmsTherapistData = {
  theraplyId: "profile-id",
  displayName: "Test Therapist",
  bio: "Bio",
  specialization: "Anxiety",
  therapyServicesProvided: "Individual therapy",
  yearsOfExperience: "5",
  profilePhoto: "https://cdn.example/photo.jpg",
  sessionPricePence: 6000,
  sessionPriceDisplay: "£60",
  bookingUrl: "https://staging.example/client/book/user-id",
  isBookable: true,
  isPublished: true,
};

beforeEach(() => {
  mocks.getConfig.mockReturnValue({
    apiToken: "cms-token",
    environment: "staging",
    siteId: "staging-site-id",
    collectionId: "Therapists",
  });
});

describe("Wix CMS client", () => {
  it("reads the canonical collection schema without modifying it", async () => {
    mocks.request.mockResolvedValue({
      collection: {
        id: "Therapists",
        fields: [
          { key: "theraplyId", type: "TEXT" },
          { key: "bio", type: "RICH_TEXT" },
        ],
      },
    });

    await expect(getWixCmsTherapistsCollection()).resolves.toEqual({
      id: "Therapists",
      fields: [
        { key: "theraplyId", type: "TEXT" },
        { key: "bio", type: "RICH_TEXT" },
      ],
    });
    expect(mocks.request).toHaveBeenCalledWith(
      "staging-site-id",
      "cms-token",
      "/wix-data/v2/collections/Therapists?consistentRead=true",
      { method: "GET" },
    );
  });

  it("lists the therapist inventory using consistent read pagination", async () => {
    mocks.request.mockResolvedValue({
      dataItems: [{ id: "wix-item-id", revision: "1", data: projection }],
    });

    await expect(listAllWixCmsTherapists()).resolves.toEqual([
      { id: "wix-item-id", revision: "1", data: projection },
    ]);
    expect(mocks.request).toHaveBeenCalledWith(
      "staging-site-id",
      "cms-token",
      "/wix-data/v2/items/query",
      expect.objectContaining({
        method: "POST",
        body: {
          dataCollectionId: "Therapists",
          consistentRead: true,
          query: { paging: { limit: 100, offset: 0 } },
        },
      }),
    );
  });

  it("lists indexes for the canonical Therapists collection", async () => {
    mocks.request.mockResolvedValue({
      indexes: [
        {
          name: "theraplyId_unique",
          status: "ACTIVE",
          unique: true,
          fields: [{ path: "theraplyId", order: "ASC" }],
        },
      ],
    });

    await expect(listWixCmsTherapistIndexes()).resolves.toEqual([
      {
        name: "theraplyId_unique",
        status: "ACTIVE",
        unique: true,
        fields: [{ path: "theraplyId" }],
      },
    ]);
    expect(mocks.request).toHaveBeenCalledWith(
      "staging-site-id",
      "cms-token",
      "/wix-data/v2/indexes?dataCollectionId=Therapists&paging.limit=100",
      { method: "GET" },
    );
  });

  it("queries Therapists by exact theraplyId with a consistent read", async () => {
    mocks.request.mockResolvedValue({ dataItems: [] });

    await expect(findWixCmsTherapistsByTheraplyId("profile-id")).resolves.toEqual([]);
    expect(mocks.request).toHaveBeenCalledWith(
      "staging-site-id",
      "cms-token",
      "/wix-data/v2/items/query",
      expect.objectContaining({
        method: "POST",
        body: {
          dataCollectionId: "Therapists",
          consistentRead: true,
          query: {
            filter: { theraplyId: { $eq: "profile-id" } },
            paging: { limit: 3 },
          },
        },
      }),
    );
  });

  it("strips Wix read-only system fields from returned item data", async () => {
    mocks.request.mockResolvedValue({
      dataItems: [
        {
          id: "wix-item-id",
          revision: "1",
          data: {
            ...projection,
            _id: "wix-item-id",
            _createdDate: "2026-09-01T10:00:00.000Z",
            _updatedDate: "2026-09-01T10:00:00.000Z",
            _owner: "owner-id",
          },
        },
      ],
    });

    const [item] = await findWixCmsTherapistsByTheraplyId("profile-id");

    expect(item.data).toEqual(projection);
  });

  it("creates one item in the Therapists collection", async () => {
    mocks.request.mockResolvedValue({
      dataItem: { id: "wix-item-id", revision: "1", data: projection },
    });

    await expect(createWixCmsTherapist(projection)).resolves.toMatchObject({
      id: "wix-item-id",
      revision: "1",
    });
    expect(mocks.request).toHaveBeenCalledWith(
      "staging-site-id",
      "cms-token",
      "/wix-data/v2/items",
      expect.objectContaining({
        method: "POST",
        body: {
          dataCollectionId: "Therapists",
          dataItem: { data: projection },
        },
      }),
    );
  });

  it("updates the returned item ID with its revision", async () => {
    mocks.request.mockResolvedValue({
      dataItem: { id: "wix-item-id", revision: "2", data: projection },
    });

    await updateWixCmsTherapist(
      { id: "wix-item-id", revision: "1", data: projection },
      projection,
    );
    expect(mocks.request).toHaveBeenCalledWith(
      "staging-site-id",
      "cms-token",
      "/wix-data/v2/items/wix-item-id",
      expect.objectContaining({
        method: "PUT",
        body: {
          dataCollectionId: "Therapists",
          dataItem: {
            id: "wix-item-id",
            revision: "1",
            data: projection,
          },
        },
      }),
    );
  });

  it("never nests the read-only collection identity in a data item", async () => {
    mocks.request.mockResolvedValue({
      dataItem: { id: "wix-item-id", revision: "1", data: projection },
    });

    await createWixCmsTherapist(projection);
    await updateWixCmsTherapist(
      { id: "wix-item-id", revision: "1", data: projection },
      projection,
    );

    for (const call of mocks.request.mock.calls) {
      const options = call[3] as { body?: { dataItem?: Record<string, unknown> } };
      expect(options.body?.dataItem).not.toHaveProperty("dataCollectionId");
    }
  });
});
